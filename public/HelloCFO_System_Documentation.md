# HelloCFO (Munimji) — System Documentation

> **Last Updated:** February 2026  
> **Version:** 5.0 (Revised)

---

## Table of Contents

1. [Model Configuration & Usage](#1-model-configuration--usage)
2. [Query Processing Workflow](#2-query-processing-workflow)
3. [Routing & Classification System](#3-routing--classification-system)
4. [Tool Selection & MCP Integration](#4-tool-selection--mcp-integration)
5. [System Prompts & Persona](#5-system-prompts--persona)
6. [Chatbot Features](#6-chatbot-features)
7. [Enrichment Engine](#7-enrichment-engine)
8. [Reinforcement Learning Pipeline](#8-reinforcement-learning-pipeline)
9. [Conversation Management](#9-conversation-management)
10. [Edge Functions Reference](#10-edge-functions-reference)
11. [Database Schema](#11-database-schema)
12. [Current Limitations & Known Issues](#12-current-limitations--known-issues)

---

## 1. Model Configuration & Usage

### 1.1 LLM Provider

| Setting | Value |
|---------|-------|
| **Provider** | Azure OpenAI |
| **Default Endpoint** | `https://lovable-hellobooks-resource.cognitiveservices.azure.com/openai/v1/` |
| **Auth Header** | `api-key` (header-based authentication) |
| **Message Role** | `developer` (Azure OpenAI uses this instead of `system`) |
| **Max Completion Tokens** | 8192 (configurable per request via `llm_configs` table) |
| **API Format** | OpenAI Chat Completions API (`/chat/completions`) |

### 1.2 Models Currently in Use

| Purpose | Model | Provider | Notes |
|---------|-------|----------|-------|
| **Primary Chat (Capable Tier)** | Configured via `llm_configs.model` | Azure OpenAI | Used for complex analytical queries, multi-step tool orchestration |
| **Primary Chat (Cheap Tier)** | Same model, lower `max_tokens` | Azure OpenAI | Used for simple queries, general chat, standard CRUD |
| **Audio Transcription (STT)** | `gpt-4o-mini-transcribe` | Azure OpenAI | Used by `audio-transcribe` edge function |
| **Conversation Summarization** | `gpt-4o-mini` (fallback from config) | Azure OpenAI | Used by `conversation-summarizer.ts` for trimming long histories |

> **Note:** The exact chat model is dynamically loaded from the `llm_configs` database table at runtime (`is_default = true`). This allows model swapping without code changes.

### 1.3 Model Tier Selection Strategy

The system uses a **two-tier model strategy** to optimize cost — both tiers use the same model but with different token budgets:

| Tier | When Used | Typical Max Tokens | Selection Logic |
|------|-----------|-------------------|-----------------|
| **Cheap** | General chat, simple queries, standard CRUD operations, greetings | 512–2048 | Default for most queries |
| **Capable** | Complex analytical queries (30+ words with analytical keywords, or 2+ complexity indicators) | 4096–8192 | Only when complexity thresholds are met |

**Complexity Indicators** (triggers "capable" tier):

- **Analytical keywords:** `analyze`, `analyse`, `compare`, `trend`, `forecast`, `predict`, `anomaly`, `variance`, `deviation`, `correlation`, `regression`
- **Multi-step keywords:** `and then`, `after that`, `additionally`, `step by step`, `detailed`, `comprehensive`, `deep dive`
- **Aggregation keywords:** `year over year`, `yoy`, `month over month`, `mom`, `quarter`, `seasonal`, `benchmark`, `industry average`
- **Hindi analytical:** `vishleshan`, `tulna`, `purvanumaaan`

**Selection Rules:**
1. `general_chat` category → always **cheap**
2. Query has 30+ words AND ≥1 complexity indicator → **capable**
3. Query has ≥2 complexity indicators → **capable**
4. Everything else → **cheap**

### 1.4 Model Config Storage (Database)

LLM configurations are stored in the `llm_configs` table:

| Column | Type | Purpose |
|--------|------|---------|
| `provider` | string | e.g., `azure_openai` |
| `model` | string | e.g., `gpt-4o`, `gpt-4o-mini` |
| `api_key` | string | Azure API key (encrypted at rest) |
| `endpoint` | string | Azure resource endpoint URL |
| `temperature` | float | 0.0–2.0 |
| `max_tokens` | int | Default max completion tokens |
| `is_default` | boolean | Active config flag |
| `total_input_tokens` | int | Cumulative input token usage |
| `total_output_tokens` | int | Cumulative output token usage |
| `total_requests` | int | Total API calls made |

Token usage is tracked per-request in `llm_usage_logs` with:
- `input_tokens`, `output_tokens`, `total_tokens`
- `latency_ms` — response time
- `section` — which pipeline stage (e.g., `chat`, `summarization`)
- `status` — success/error

### 1.5 Endpoint Validation

The system validates the LLM endpoint at runtime:
- Rejects Supabase URLs or `/v1/messages` endpoints (Anthropic-style)
- Falls back to default Azure endpoint if invalid
- Logs warnings for misconfigured endpoints

---

## 2. Query Processing Workflow

### 2.1 Two Agent Pipelines

The system has **two independent edge functions** that process queries:

| Agent | Function | Used By | `SIMPLE_DIRECT_LLM_MODE` | Key Difference |
|-------|----------|---------|--------------------------|----------------|
| **Realtime Agent** | `realtime-cfo-agent` | Dashboard chat UI | `true` | All MCP tools → LLM directly, no caching, no fast-path |
| **API Agent** | `cfo-agent-api` | External API clients (WhatsApp, etc.) | `false` | Full routing pipeline with caching, fast-path, bulk list rendering |

### 2.2 Realtime Agent Flow (Dashboard)

Since `SIMPLE_DIRECT_LLM_MODE = true`, the realtime agent **skips** caching, fast-path, and general-chat bypass. Every query goes through:

```
User Query
    │
    ▼
1. Parse request (query, intents, businessContext, conversationHistory, entityId, orgId)
    │
    ▼
2. Load LLM config from DB (default config)
    │
    ▼
3. Load persisted conversation history (if conversationId provided)
    │
    ▼
4. Connect to MCP Server (HelloBooks)
   └── Initialize → List Tools → Store tool definitions
    │
    ▼
5. Intent Matching (Layer 1 — free, no LLM call)
   └── Match query against DB intents via training phrases
   └── Calculate confidence score (0.0–1.0)
    │
    ▼
6. ALL queries go to LLM Path (SIMPLE_DIRECT_LLM_MODE=true)
   ├── ALL MCP tools provided to LLM (no keyword filtering)
   ├── LLM decides which tools to call
   ├── Tool call loop (max 10 iterations)
   ├── Auto-enrichments applied after tool results
   └── Final response generated
    │
    ▼
7. Persist conversation to unified_conversations
    │
    ▼
8. Log feedback + RL signals
```

### 2.3 API Agent Flow (External) — Full Pipeline

With `SIMPLE_DIRECT_LLM_MODE = false`, the API agent uses the complete routing pipeline:

```
User Query
    │
    ▼
1. Cache Check → if cached, return immediately (path: "cached")
    │
    ▼
2. Conversation Summarization Check
   └── If >20 messages, summarize older ones, keep last 10
    │
    ▼
3. Confirmation Detection
   ├── Is this "yes"/"haan"/"kar do"?
   ├── Extract pending action from conversation history
   └── Merge extra fields from confirmation message
    │
    ▼
4. Detail Lookup Detection
   └── "show details for INV-123" → extract docType + docRef
   └── Match against recently created documents in conversation
    │
    ▼
5. Bulk List Detection
   └── "show all bills and invoices" → detect multiple entity types
   └── Overdue detection → prefer aging-specific tools
    │
    ▼
6. Intent Matching (Layer 1 — free)
   ├── confidence ≥ 0.85 → FAST PATH (no LLM for tool selection)
   └── confidence < 0.85 → LLM PATH
    │
    ▼
[FAST PATH]                          [LLM PATH]
7a. Execute intent's fixed pipeline   7b. Classify query (keyword-based)
    └── Call MCP tools from flow          ├── "general_chat" → no tools, short reply
    └── Format with cheap LLM            └── "unified" → keyword-filtered tools + LLM
    │                                    │
    ▼                                    ▼
8a. Render markdown tables for lists 8b. Tool call loop (max 10 iterations)
    │                                    ├── Pagination injection for list tools
    │                                    ├── Created document tracking
    │                                    └── Markdown table rendering
    │                                    │
    ▼                                    ▼
9. Cache write (skip if write ops)   9. Cache write + invalidate related
    │                                    │
    ▼                                    ▼
10. Card block stripping             10. Card block stripping
    │                                    │
    ▼                                    ▼
11. Stream response via SSE          11. Stream response via SSE
    │                                    │
    ▼                                    ▼
12. Persist conversation             12. Persist conversation
    │                                    │
    ▼                                    ▼
13. Log feedback + RL signals        13. Log feedback + RL signals
```

### 2.4 SSE Event Stream

Both agents stream results via Server-Sent Events:

| Event | Phase | Description |
|-------|-------|-------------|
| `connected` | Init | SSE connection established, returns `requestId` |
| `understanding_started` | Init | Processing begins |
| `route_started` | Routing | Shows intent count + MCP tool count |
| `route_classified` | Routing | Path decision: `fast`, `llm`, or `cached` |
| `tools_filtered` | Tools | Which tool categories were selected |
| `intent_detecting` | Intent | Analyzing query against intents |
| `intent_detected` | Intent | Best intent match with confidence |
| `entities_extracted` | Entities | Structured entities from query |
| `pipeline_planned` | Pipeline | MCP tool execution plan |
| `pipeline_executing` | Execution | Tool calls in progress |
| `enrichments_planned` | Enrichment | Enrichment types decided |
| `enrichments_applying` | Enrichment | Enrichments being applied |
| `executing_tool` | Execution | Individual MCP tool call in progress |
| `tool_result` | Execution | Tool result (success/failure + record count) |
| `mode_switch` | Routing | Cross-over between categories detected |
| `response_generating` | Response | LLM generating final response |
| `response_chunk` | Response | Streamed text chunk of the response |
| `complete` | Done | Final payload with full response + metadata |
| `error` | Error | Error occurred during processing |

### 2.5 Complete Event Payload

```typescript
{
  query: string;
  path: "fast" | "llm" | "cached";
  category: "unified" | "general_chat";
  matchedIntent: { id, name, moduleId, confidence, description } | null;
  extractedEntities: Record<string, unknown>;
  reasoning: string;
  pipelineSteps: { tool, description, purpose }[];
  enrichments: { type, description }[];
  responseFormat: string;
  response: string;                    // Full final response text
  mcpToolResults: { tool, input?, result?, error?, success }[];
  dataSources: string[];               // Tools that returned data
  llmModel: string;                    // e.g., "azure/gpt-4o"
  iterationCount: number;              // Tool call loop iterations
  usage: { input_tokens, output_tokens, total_tokens };
}
```

---

## 3. Routing & Classification System

### 3.1 Layer 1: Keyword Classifier (`classifier.ts`)

A **zero-cost** keyword-based classifier that runs before any LLM call:

**Categories:**
- `general_chat` — greetings, thanks, yes/no, short non-financial messages
- `unified` — any query with financial keywords (replaces old `bookkeeper`/`cfo` split)

**General Chat Patterns** (regex-matched):
- Greetings: `hi`, `hello`, `namaste`, `good morning`
- Acknowledgments: `thanks`, `ok`, `sure`, `got it`
- Farewells: `bye`, `goodbye`, `alvida`
- Meta: `help`, `what can you do`, `who are you`
- Hindi: `haan`, `nahi`, `theek`, `accha`

**Financial Keywords** (64+ keywords across 20 sub-categories):
- Actions: `create`, `edit`, `delete`, `record`, `send`, `file`, `void`, `import`, `clone`, `reconcile`, `merge`
- View/Query: `show`, `get`, `report`, `analyze`, `compare`
- Entities: `invoice`, `bill`, `payment`, `expense`, `journal`, `customer`, `vendor`, `inventory`
- Financial: `revenue`, `profit`, `cash`, `receivable`, `payable`, `gst`, `tax`, `kpi`, `forecast`
- Hindi: `banao`, `dikhao`, `batao`, `kharcha`, `bikri`, `naafa`, `baaki`

### 3.2 Layer 2: Intent Matching (DB-based, free)

Matches against the `intents` table using training phrases:
- **Exact match** → 0.95 confidence
- **Substring match** → 0.70–0.95 (proportional to length similarity)
- **Name match** → 0.60 confidence
- **Threshold for fast path** → 0.85

### 3.3 Layer 3: Model Tier Selection

Based on query complexity (see Section 1.3).

### 3.4 Cross-Over Detection

The classifier detects when a query spans multiple categories (e.g., a greeting + financial question) and emits a `mode_switch` SSE event.

---

## 4. Tool Selection & MCP Integration

### 4.1 MCP Server

| Setting | Value |
|---------|-------|
| **Server** | HelloBooks MCP Server (`mcp.hellobooks.ai`) |
| **Protocol** | JSON-RPC 2.0 over Streamable HTTP |
| **Auth** | Bearer token + `entityid`/`orgid` query params |
| **Client Version** | `Munimji-Agent/4.0` |

### 4.2 MCP Client Features

- **Initialize** → `initialize` RPC call (protocol version `2024-11-05`)
- **List Tools** → `tools/list` RPC call
- **Call Tool** → `tools/call` with automatic retry for write operations
- **SSE Response Parsing** — handles both JSON and SSE response formats
- **Timeout Strategy:**
  - Read operations: 30s timeout
  - Write operations: 60s timeout + 1 automatic retry
  - Per-chunk SSE read: 5s timeout

### 4.3 Tool Categories (17 groups, 120+ tools)

| Category | Tools | Keywords |
|----------|-------|----------|
| `invoices` | `get_all_invoices`, `create_invoice`, etc. | invoice, sales, revenue |
| `bills` | `get_bills`, `create_bill`, etc. | bill, purchase, payable |
| `payments` | `get_all_payments`, `create_payment`, etc. | payment, paid, receipt |
| `customers` | `get_all_customers`, `create_customer`, etc. | customer, client, buyer |
| `vendors` | `get_all_vendors`, `create_vendor`, etc. | vendor, supplier |
| `credit_notes` | `get_all_sales_credit_notes`, etc. | credit note, refund |
| `accounts` | `get_charts_of_accounts`, etc. | account, ledger, COA |
| `transactions` | `get_all_transactions`, etc. | bank, reconcile, statement |
| `aging_reports` | `get_aged_receivables_report`, etc. | aging, overdue, AR, AP |
| `delivery_challans` | `get_all_delivery_challans`, etc. | challan, dispatch |
| `expenses` | `create_expense`, `list_expenses`, etc. | expense, spending |
| `banking` | `import_bank_statement`, etc. | bank, reconcile |
| `inventory` | `create_product`, `adjust_stock`, etc. | stock, product, SKU |
| `journal` | `create_journal_entry`, etc. | journal, day book |
| `gst_actions` | `file_gstr1`, `generate_einvoice`, etc. | GST, GSTR, e-invoice |
| `reports_pnl` | `get_profit_loss`, etc. | P&L, profit, margin |
| `reports_balance` | `get_balance_sheet`, etc. | balance sheet, trial balance |
| `reports_cashflow` | `get_cash_flow_statement`, etc. | cash flow, liquidity |
| `reports_payables` | `get_ap_aging`, etc. | AP aging, overdue bills |
| `reports_gst` | `get_gst_summary`, etc. | GST summary, ITC |
| `kpi_dashboard` | `get_revenue_kpi`, etc. | KPI, dashboard, health |
| `trends_analysis` | `compare_periods`, `forecast`, etc. | compare, trend, forecast |

### 4.4 Tool Selection Strategies

1. **`direct_llm_all_mcp_tools`** — All MCP tools given to LLM (realtime agent, `SIMPLE_DIRECT_LLM_MODE=true`)
2. **`keyword_matched_dynamic`** — Keyword-matched categories + dynamic scoring from MCP tool names/descriptions
3. **`default_unified_dynamic`** — Broad default set when no keywords match
4. **`all_tools_fallback`** — Fallback when keyword filtering yields 0 tools

### 4.5 Follow-up Detection

Short queries (<5 words) with conversation history reuse the previous tool group instead of re-classifying.

### 4.6 Cache Invalidation

Write operations (e.g., `create_invoice`) automatically invalidate related cached queries (e.g., all invoice-related cached responses) using the `invalidateCacheForEntity` function.

---

## 5. System Prompts & Persona

### 5.1 Persona: Munimji

- AI CFO assistant exclusively for HelloBooks
- Professional accounting tone
- Indian formats: ₹ in lakhs/crores, DD/MM/YYYY dates
- Supports Hindi/Hinglish queries
- Never exposes database IDs, UUIDs, or internal field names

### 5.2 Three System Prompts

| Prompt | Used When | Max Tokens | Key Behavior |
|--------|-----------|------------|--------------|
| **Unified** | All financial queries (LLM path) | 8192 | Full tool calling, CRUD, analysis, progressive field collection, params blocks, clarification blocks |
| **Fast Path** | High-confidence intent matches | 2048 | Format-only (no tool calling), data already fetched |
| **General Chat** | Greetings, off-topic | 512 | No tools, scope-limited to HelloBooks topics, politely declines non-HelloBooks requests |

### 5.3 Key Prompt Rules (Unified — ~230 lines)

1. **ID Suppression** — Absolute rule to never show UUIDs or internal IDs in any response
2. **Progressive Field Collection** — Only ask for missing fields, default everything possible:
   - Date → today | Due date → Net 30 | Tax → 18% GST | Currency → entity default
   - Invoice/bill number → **never ask**, let system auto-generate
3. **`params` Block** — Every create/update response MUST include a structured JSON params block:
   ```
   ```params
   {"operation":"Create Invoice","applied":[{"label":"Customer","value":"Devesh"}],"pending":[{"label":"Item Description","hint":"e.g., Web development services"}]}
   ```
   ```
4. **`clarification` Block** — Structured multi-choice UI for user decisions:
   ```
   ```clarification
   {"question":"Which tax rate?","type":"radio","options":[{"label":"GST 18%","value":"gst_18"},{"label":"GST 12%","value":"gst_12"}]}
   ```
   ```
   - Supported types: `radio` (default, 2-5 options), `dropdown` (6+ options), `checkbox` (multi-select)
5. **Confirmation Handling** — "yes"/"haan"/"kar do" triggers immediate execution of last proposed action
6. **Duplicate Detection** — Check for duplicates before create operations (GSTIN, PAN, fuzzy name match)
7. **Dangerous Action Tiers:**
   - LOW (edit, update): Execute immediately
   - MEDIUM (reverse journal, cancel): Single confirmation
   - HIGH (delete, void, merge): Show linked records, ask confirmation
   - CRITICAL (file GST, close FY, bulk delete): Full checklist, typed confirmation
8. **List/Bulk Display** — Must show ALL returned records in markdown table, never truncate
9. **Pagination** — Support "show more"/"aur dikhao" follow-ups
10. **Context Resolution** — "it"/"this" → last entity; "send it" → last document; "do the same for X" → repeat action
11. **Error Handling** — Never show technical errors; convert to friendly accounting language
12. **Trend Enrichment** — Auto-calculate % change with ▲/▼/► indicators
13. **Anomaly Detection** — Flag items 2x+ higher than historical average
14. **Document Lookup** — Search by document NUMBER, not internal ID
15. **Card Block Stripping** — Raw markdown card blocks stripped from user-facing responses

---

## 6. Chatbot Features

### 6.1 Core Chat Interface

| Feature | Description | Implementation |
|---------|-------------|----------------|
| **Real-time SSE Streaming** | Responses stream token-by-token via Server-Sent Events | `ReadableStream` + `TextEncoder` on backend; `fetch` + `ReadableStreamDefaultReader` on frontend |
| **Multi-turn Conversations** | Full conversation history maintained and sent with each query | Persisted in `unified_conversations` table, loaded on conversation switch |
| **Thinking Panel** | Live visualization of agent's routing, intent matching, tool execution phases | `AgentThinkingPanel` component shows each SSE event phase in real-time |
| **Conversation Sidebar** | Browse, search, and switch between past conversations | `ConversationSidebar` component with entity-scoped history |
| **New Chat** | Start fresh conversation with new UUID | Resets messages, understanding, and conversation ID |
| **Clear Chat** | Reset current conversation state | Clears messages array and understanding state |
| **Quick Suggestions** | Clickable sample queries from active intents' training phrases | Shown on empty chat state, auto-fills input |
| **Abort/Cancel** | Cancel in-progress requests | `AbortController` ref for fetch cancellation |

### 6.2 Voice Input (Speech-to-Text)

| Setting | Value |
|---------|-------|
| **Edge Function** | `audio-transcribe` |
| **Model** | `gpt-4o-mini-transcribe` (Azure OpenAI) |
| **Max File Size** | 25 MB |
| **Supported Formats** | `audio/webm`, `audio/ogg`, `audio/mp3`, `audio/mpeg`, `audio/mp4`, `audio/m4a`, `audio/wav`, `audio/flac`, `video/webm` |
| **Credentials** | `AZURE_STT_ENDPOINT` + `AZURE_STT_API_KEY` (Supabase secrets) |
| **Output** | Plain text transcription → fed into chat input |

### 6.3 File Attachments

| Setting | Value |
|---------|-------|
| **Edge Function** | `upload-attachment` |
| **Storage Bucket** | `chat-attachments` (Supabase Storage) |
| **Max File Size** | 20 MB |
| **Supported Types** | Images (JPEG, PNG, WebP, GIF), PDF, CSV, Plain Text, Excel (XLSX/XLS), Word (DOCX) |
| **File Categories** | `image`, `spreadsheet`, `pdf`, `document` |
| **Features** | Signed preview URLs (1 hour), entity + conversation scoping, auto-suggested agent message |

**Attachment Flow:**
1. User selects file → `upload-attachment` edge function receives multipart form data
2. File validated (size + MIME type) → uploaded to Supabase Storage
3. Signed URL generated for preview → returned with file metadata + suggested message
4. Agent receives file context to process accordingly

### 6.4 Financial Operations (CRUD)

| Operation | Supported Entities |
|-----------|-------------------|
| **Create** | Invoices, Bills, Payments, Customers, Vendors, Credit Notes, Expenses, Journal Entries, Products |
| **Read/List** | All above + Delivery Challans, Transactions, Bank Accounts, Chart of Accounts |
| **Update** | Invoices, Bills, Payments, Customers, Vendors, Credit Notes, Transactions |
| **Delete** | Expenses, Journal Entries (with confirmation) |

### 6.5 Financial Reports & Analytics

| Report Type | Tools Used |
|-------------|-----------|
| **Profit & Loss** | `get_profit_loss`, `get_revenue_breakdown`, `get_expense_breakdown` |
| **Balance Sheet** | `get_balance_sheet`, `get_trial_balance` |
| **Cash Flow** | `get_cash_flow_statement`, `get_cash_position`, `forecast_cash_flow` |
| **Aging Reports** | `get_aged_receivables_report`, `get_aged_payables_report` |
| **GST Reports** | `get_gst_summary`, `get_gstr1_data`, `get_gstr3b_data`, `get_itc_summary` |
| **KPI Dashboard** | Revenue, Expense, Profit, Cash Flow, AR, AP, Growth Rate, Runway |
| **Period Comparison** | `compare_periods`, YoY/MoM/QoQ analysis |
| **Trend Analysis** | `trend`, `forecast`, `anomaly_detection`, `budget_vs_actual` |

### 6.6 Smart Features

| Feature | How It Works | Agent |
|---------|-------------|-------|
| **Progressive Field Collection** | Asks only for missing fields; defaults date, due date, tax, currency, invoice number automatically | Both |
| **`params` Block UI** | Structured card showing applied fields (with values) and pending fields (with hints) | Both |
| **`clarification` Block UI** | Radio buttons / dropdown / checkboxes for structured user choices (2-8 options) | Both |
| **Duplicate Detection** | Checks GSTIN, PAN, fuzzy name match before creating contacts; checks invoice number + customer + amount + date | Both |
| **Confirmation Flow** | "yes"/"haan"/"kar do" immediately executes the last proposed action with all collected parameters | API Agent (full implementation) |
| **Context Resolution** | "it"/"this"/"that" refers to last entity; "send it" sends last document; "do the same for X" | Both |
| **Pagination** | "show more"/"next"/"aur dikhao" fetches next page; "filter by X" resets to first page | API Agent (with page tracking) |
| **Overdue Detection** | Detects "overdue"/"past due" queries → prefers aging-specific tools | API Agent |
| **Document Lookup** | "show details for INV-123" searches by document number, not internal ID; matches against recently created docs | API Agent |
| **Created Document Tracking** | Tracks recently created documents in conversation metadata for follow-up queries like "show that invoice" | API Agent |
| **Bulk Multi-Entity Lists** | "show all bills and invoices" → calls BOTH list tools, renders separate markdown sections | API Agent |
| **Markdown Table Rendering** | List results auto-rendered as clean markdown tables with entity-specific column aliases, ID stripping | API Agent |
| **Card Block Stripping** | Raw `` ```card `` markdown blocks stripped from user-facing responses via regex | Both |
| **Follow-up Tool Reuse** | Short queries (<5 words) reuse the previous tool group instead of re-classifying | API Agent |
| **Hindi Number Parser** | Parses Hindi number words (e.g., "das hazaar" → 10000) | Shared utility |
| **Confirmation Field Merging** | "invoice number is INV-123, yes create" → extracts extra fields and merges into tool call | API Agent |

### 6.7 Conversation Summarization

| Setting | Value |
|---------|-------|
| **Trigger** | Conversation exceeds 20 messages |
| **Keeps Recent** | Last 10 messages preserved in full |
| **Summary Model** | `gpt-4o-mini` (512 max tokens) |
| **Summary Focus** | Key financial queries, actions taken, important numbers/entities |
| **Storage** | Summary saved to `unified_conversations.summary` column |
| **Usage** | Summary injected as `[Previous conversation summary]` context message |

**Flow:**
1. Check `shouldSummarize(messageCount)` → returns true if >20
2. Split: older messages (0 to N-10) + recent messages (last 10)
3. Older messages sent to LLM for summarization (max 300 words)
4. Summary saved to DB (non-blocking)
5. Return `[summary] + recent_messages` for next query context

### 6.8 Auto-Enrichments

Applied automatically based on data patterns in tool results:

| Enrichment | Trigger | Action |
|------------|---------|--------|
| **Trend Analysis** | Time-series data detected (month, quarter, year keywords) | Calculate growth rates, directional changes, ▲/▼/► indicators |
| **Currency Formatting** | Amount data detected (₹, $, amount, total, balance keywords) | Format in Indian numbering (lakhs/crores) with ₹ |
| **Ranking** | List with 3+ items | Rank and highlight top/bottom items |
| **Alert Evaluation** | Threshold/overdue data (overdue, aging, critical keywords) | Flag items needing attention |

### 6.9 Multi-Language Support

- **English** — Full support
- **Hindi** — Supported keywords: `banao`, `dikhao`, `batao`, `kharcha`, `bikri`, `naafa`, `baaki`, `vishleshan`, `tulna`, etc.
- **Hinglish** — Mixed Hindi-English queries handled naturally
- **Greetings** — `namaste`, `namaskar`, `dhanyavaad`, `shukriya`, `alvida`
- **Confirmations** — `haan`, `ha`, `kar do`, `theek`, `sahi`
- **Number words (Hindi)** — Parsed via `hindi-number-parser.ts`

### 6.10 Safety & Guardrails

| Guardrail | Implementation |
|-----------|---------------|
| **No ID Exposure** | UUIDs, internal IDs stripped from all responses; entire table columns removed if they contain IDs |
| **No Technical Jargon** | API, payload, endpoint, schema, stack trace never shown to users |
| **Destructive Action Confirmation** | Delete/void/cancel require explicit confirmation with impact summary |
| **Amount/Date Validation** | Validated before submission to MCP tools |
| **Scope Limitation** | Only assists with HelloBooks-related tasks; politely declines off-topic requests |
| **Error Message Sanitization** | Technical errors converted to friendly messages like "I couldn't complete that right now" |
| **Card Block Stripping** | Raw markdown card blocks (`` ```card ``) stripped from user-facing responses |
| **Tool Result Truncation** | Results >50,000 chars truncated with item count preserved |
| **Endpoint Validation** | Invalid or incompatible LLM endpoints rejected with fallback |

### 6.11 Feedback System

| Type | How |
|------|-----|
| **Explicit** | User thumbs up/down on responses (via `submit-feedback` edge function) |
| **Implicit Signals** | Auto-detected from behavior: rephrase (negative), follow-up (positive), action-after-read (strong positive) |
| **Feedback Logging** | All feedback stored in `feedback_log` table with full context (query, response, intent, tools, model, timing) |

### 6.12 Chat Export

| Setting | Value |
|---------|-------|
| **Edge Function** | `export-chat` |
| **Format** | Styled HTML document (print-friendly) |
| **Storage** | Uploaded to `chat-attachments/exports/{entity_id}/` |
| **Download** | Signed URL (24-hour expiry) |
| **Includes** | Chat display ID, chat name, message count, entity ID, timestamps, full message history |

### 6.13 Response Caching (`cfo-agent-api` only)

| Setting | Value |
|---------|-------|
| **Table** | `response_cache` |
| **Key** | `entity_id` + SHA-256 hash of normalized query + path |
| **TTL** | Dynamic: 5min (volatile data), 15min (reports), 1hr (static lookups) |
| **Invalidation** | Write operations auto-invalidate related entity's cached queries |
| **Skip** | Write operations never cached; `SIMPLE_DIRECT_LLM_MODE` skips caching entirely |

### 6.14 Conversation History

| Feature | Details |
|---------|---------|
| **Persistence** | Conversations saved to `unified_conversations` table |
| **Sequential Numbering** | Each entity gets sequential chat IDs (#MJ-0001, #MJ-0002, etc.) |
| **Auto-naming** | Chat name auto-generated from first user message |
| **Soft Delete** | Conversations soft-deleted (recoverable via `is_deleted` flag) |
| **Message Preview** | Last message preview stored for sidebar display |
| **Org Isolation** | Conversations scoped by `entity_id` and `org_id` |
| **Export** | Conversations exportable via `export-chat` edge function |
| **Summarization** | Long conversations (>20 messages) auto-summarized |

---

## 7. Enrichment Engine

### 7.1 Auto-Enrichments (`enrichment-auto-apply.ts`)

Analyzes MCP tool results for data patterns:

| Pattern | Detection Method | Enrichment |
|---------|-----------------|------------|
| Time Series | Keywords: month, quarter, year, Jan-Dec | Trend analysis with % change |
| Amounts | Keywords: ₹, $, amount, total, balance | Indian number formatting |
| Lists | JSON arrays with 3+ items | Ranking (top/bottom) |
| Thresholds | Keywords: overdue, aging, critical, warning | Alert evaluation |

### 7.2 Enrichment Instructions

When enrichments are detected, they're injected into the system prompt:
```
AUTO-ENRICHMENTS TO APPLY:
- TREND ANALYSIS: Identify trends, growth rates, and directional changes
- CURRENCY FORMATTING: Format all amounts in Indian numbering (lakhs/crores)
```

---

## 8. Reinforcement Learning Pipeline

### 8.1 Intent Routing Stats (`intent_routing_stats`)

Tracks success/failure rates per intent per confidence bucket (0.05 increments):
- Total attempts, successful attempts, failed attempts
- Average response time
- Average feedback score

### 8.2 Adaptive Confidence Thresholds

Based on historical performance:
- Success rate > 90% & 20+ attempts → **lower** threshold by 0.05 (min 0.70)
- Success rate < 70% & 10+ attempts → **raise** threshold by 0.05 (max 0.95)
- Otherwise → default 0.85

### 8.3 LLM Path Pattern Logging (`llm_path_patterns`)

Every LLM-path query (no intent match) is hashed and logged:
- Query text + hash for grouping similar queries
- Tools used, strategy, response time, feedback score
- Occurrence count updated on repeat queries

### 8.4 Auto-Intent Suggestion (`suggested_intents`)

When an LLM path pattern reaches **10+ occurrences**, the system automatically:
1. Creates a `suggested_intent` record
2. Links it to the source pattern
3. Status set to `pending` for human review

### 8.5 Implicit Signal Detection

| Signal | Trigger | Score |
|--------|---------|-------|
| Rephrase | >60% keyword overlap with previous query | -1 (negative) |
| Follow-up | Short query building on context | +1 (positive) |
| Action Taken | Write verb after read response | +2 (strong positive) |

---

## 9. Conversation Management

### 9.1 Conversation Persistence Flow

After every completed query:

1. Build user message + agent message objects (with metadata: category, tools used, model, intent)
2. Merge with existing conversation history
3. Upsert to `unified_conversations` table:
   - Increment `message_count`
   - Update `last_message_preview`
   - Auto-generate `chat_name` from first message
   - Assign sequential `chat_number` per entity
4. If message count >20, trigger conversation summarization

### 9.2 Conversation Sidebar (Frontend)

- Lists conversations for current entity
- Shows chat display ID (#MJ-XXXX), name, preview, timestamp
- Click to load full conversation history via `get-conversations` edge function
- "New Chat" button creates fresh conversation with new UUID
- Auto-refreshes after each completed query

---

## 10. Edge Functions Reference

| Function | Purpose | Auth | Key Dependencies |
|----------|---------|------|-----------------|
| `realtime-cfo-agent` | Main SSE streaming agent for dashboard chat | Anon key | MCP client, classifier, model-selector, enrichment, feedback-logger, rl-logger |
| `cfo-agent-api` | External REST API with full routing pipeline | JWT + H-Authorization | MCP client, classifier, model-selector, enrichment, feedback-logger, rl-logger, response-cache |
| `cfo-agent-mcp` | JSON-RPC 2.0 MCP server for external tool calling | Bearer token | Exposes `query_cfo_agent` tool |
| `munimji-agent` | Unified messaging pipeline (WhatsApp, etc.) | JWT / Anon | MCP client |
| `audio-transcribe` | Speech-to-text transcription | Anon key | Azure STT (`gpt-4o-mini-transcribe`) |
| `upload-attachment` | File upload to Supabase Storage | Anon key | Supabase Storage (`chat-attachments` bucket) |
| `export-chat` | Export conversation as styled HTML | Anon key | Supabase Storage (signed URLs) |
| `generate-intent` | AI-powered single intent generation | Anon key | Azure OpenAI |
| `generate-batch-intents` | Batch generation of up to 10 intents | Anon key | Azure OpenAI |
| `fetch-mcp-tools` | Fetches available tools from HelloBooks MCP | Anon key | MCP client |
| `test-with-mcp` | Tests queries with MCP tool execution | Anon key | MCP client |
| `get-conversations` | Retrieve conversation history | Anon key | Supabase DB |
| `get-tool-analytics` | Intent + tool usage analytics | Anon key | Supabase DB |
| `submit-feedback` | Store explicit user feedback | Anon key | Supabase DB |
| `create-user` | Admin user creation | Service role | Supabase Auth Admin |
| `delete-user` | Admin user deletion | Service role | Supabase Auth Admin |
| `check-super-admin` | Validate super admin access | Service role | Supabase DB |

### Shared Modules (`supabase/functions/_shared/`)

| Module | Purpose |
|--------|---------|
| `classifier.ts` | Keyword-based query classification (general_chat vs unified) |
| `model-selector.ts` | Two-tier model selection + all three system prompts |
| `tool-groups.ts` | 17+ tool category definitions + keyword-to-tool mapping |
| `mcp-client.ts` | Streamable HTTP MCP client with retry logic |
| `enrichment-auto-apply.ts` | Auto-enrichment detection + instruction builder |
| `feedback-logger.ts` | Feedback logging to `feedback_log` table |
| `rl-logger.ts` | RL pipeline: intent routing stats, LLM path patterns, auto-intent suggestions |
| `conversation-summarizer.ts` | Summarizes conversations >20 messages using cheap LLM |
| `hindi-number-parser.ts` | Parses Hindi number words to numeric values |

---

## 11. Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `intents` | Financial query intents with training phrases, entities, resolution flows |
| `modules` | Financial modules (Sales, GST, Inventory, etc.) with sub-modules |
| `business_contexts` | Company context (country, currency, industry, entity size) |
| `country_configs` | Country-specific settings (currency symbol, thresholds) |
| `llm_configs` | LLM provider configurations (model, temperature, max tokens, API key) |
| `llm_providers` | Available LLM providers and their models |
| `llm_usage_logs` | Per-request token usage and latency tracking |
| `enrichment_types` | Available enrichment types (compliance, trends, etc.) |
| `entity_types` | Entity types for extraction (date, amount, etc.) |
| `response_types` | Response format types (table, narrative, chart) |

### User & Auth Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles (email, full name) |
| `user_roles` | Role-based access (admin / user) |
| `api_keys` | API keys for external integrations |
| `entities` | HelloBooks entities (company accounts) with entity_id, org_id |
| `quick_suggestions` | Configurable quick-action suggestions per entity |

### Conversation & Feedback Tables

| Table | Purpose |
|-------|---------|
| `unified_conversations` | Full conversation history with messages JSON, chat numbering, org isolation, summary |
| `feedback_log` | Explicit + implicit feedback per message with full context |

### RL & Analytics Tables

| Table | Purpose |
|-------|---------|
| `intent_routing_stats` | Per-intent success/failure rates by confidence bucket |
| `llm_path_patterns` | LLM-path query patterns for auto-intent discovery |
| `suggested_intents` | Auto-suggested intents from high-frequency patterns |
| `tool_registry` | MCP tool metadata with keywords, module mapping, usage count |

### Caching Table

| Table | Purpose |
|-------|---------|
| `response_cache` | Cached responses by entity + query hash with TTL |

---

## 12. Current Limitations & Known Issues

| Item | Details |
|------|---------|
| **Dashboard voice input** | `audio-transcribe` function exists but voice recording UI is not yet implemented in the frontend |
| **Dashboard file attachments** | `upload-attachment` function exists but file upload UI is not yet implemented in the frontend chat |
| **Conversation summarization** | Module exists in shared code but is only used by `cfo-agent-api`, not `realtime-cfo-agent` |
| **Markdown rendering** | `MessageBubble` renders responses as plain `whitespace-pre-wrap` text; no `react-markdown` rendering yet |
| **Quick suggestions** | Currently uses intent training phrases; `quick_suggestions` DB table not yet wired to frontend |
| **Chat export UI** | `export-chat` function works but no export button in dashboard UI |
| **`chat-agent-api`** | Excluded from deployments due to `@openai/agents` SDK boot crash in Deno |
| **Realtime agent caching** | Disabled (`SIMPLE_DIRECT_LLM_MODE=true`) — every query hits MCP + LLM |
| **Realtime agent pagination** | No server-side pagination rendering; relies on LLM to format tables |

---

## Architecture Diagram

```
┌───────────────────────────────────────────────────────────────┐
│                        React Frontend                         │
│  ┌──────────────────┐  ┌──────────────────────────────────┐  │
│  │ ConversationSidebar│  │   RealtimeCFOAgent (Chat UI)    │  │
│  │ - History list    │  │   - SSE event handler            │  │
│  │ - Chat switching  │  │   - AgentThinkingPanel           │  │
│  │ - New/delete chat │  │   - MessageBubble (plain text)   │  │
│  └──────────────────┘  │   - Input + send                  │  │
│                         │   - Quick suggestion chips        │  │
│                         │   - Thumbs up/down feedback       │  │
│                         └──────────────────────────────────┘  │
└────────────────────────────────┬──────────────────────────────┘
                                 │ POST + SSE Stream
                                 ▼
┌───────────────────────────────────────────────────────────────┐
│              Edge Functions (Deno Runtime)                     │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │           realtime-cfo-agent / cfo-agent-api            │  │
│  │                                                         │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │  │
│  │  │Classifier│  │  Model   │  │  Tool    │              │  │
│  │  │(keyword) │  │ Selector │  │ Groups   │              │  │
│  │  └──────────┘  └──────────┘  └──────────┘              │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │  │
│  │  │Enrichment│  │  RL      │  │ Feedback │              │  │
│  │  │Auto-Apply│  │ Logger   │  │ Logger   │              │  │
│  │  └──────────┘  └──────────┘  └──────────┘              │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │  │
│  │  │Convo     │  │ Hindi #  │  │ Response │              │  │
│  │  │Summarizer│  │ Parser   │  │ Cache    │              │  │
│  │  └──────────┘  └──────────┘  └──────────┘              │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌───────────────────┐  ┌────────────────────┐               │
│  │ audio-transcribe  │  │ upload-attachment   │               │
│  │ (gpt-4o-mini-     │  │ (Supabase Storage)  │               │
│  │  transcribe)      │  │                    │               │
│  └───────────────────┘  └────────────────────┘               │
│                                                               │
│  ┌───────────────────┐  ┌────────────────────┐               │
│  │ export-chat       │  │ cfo-agent-mcp      │               │
│  │ (HTML export)     │  │ (JSON-RPC server)  │               │
│  └───────────────────┘  └────────────────────┘               │
│                                                               │
│         ┌────────────────┼────────────────┐                   │
│         ▼                ▼                ▼                   │
│  ┌────────────┐  ┌─────────────┐  ┌────────────┐            │
│  │ Supabase   │  │ Azure OpenAI│  │ HelloBooks │            │
│  │ Database   │  │ (LLM + STT) │  │ MCP Server │            │
│  │ + Storage  │  │             │  │ (120+ tools)│            │
│  └────────────┘  └─────────────┘  └────────────┘            │
└───────────────────────────────────────────────────────────────┘
```

---

*This document is maintained alongside the codebase. Version 5.0 — February 2026.*
