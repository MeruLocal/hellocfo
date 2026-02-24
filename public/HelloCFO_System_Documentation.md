# HelloCFO (Munimji) — System Documentation

> **Last Updated:** February 2026  
> **Version:** 4.0  

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

---

## 1. Model Configuration & Usage

### LLM Provider

| Setting | Value |
|---------|-------|
| **Provider** | Azure OpenAI |
| **Default Endpoint** | `https://lovable-hellobooks-resource.cognitiveservices.azure.com/openai/v1/` |
| **Auth Header** | `api-key` |
| **Message Role** | `developer` (instead of `system`) |
| **Max Completion Tokens** | 8192 (configurable per request) |

### Model Tier Selection

The system uses a **two-tier model strategy** to optimize cost:

| Tier | When Used | Max Tokens |
|------|-----------|------------|
| **Cheap** | General chat, simple queries, standard CRUD operations | 512–2048 |
| **Capable** | Complex analytical queries (30+ words with analytical keywords, 2+ complexity indicators) | 4096–8192 |

**Complexity Indicators** (triggers "capable" tier):
- Analytical: `analyze`, `compare`, `trend`, `forecast`, `predict`, `anomaly`, `variance`
- Multi-step: `and then`, `step by step`, `detailed`, `comprehensive`, `deep dive`
- Aggregation: `year over year`, `month over month`, `quarter`, `benchmark`
- Hindi: `vishleshan`, `tulna`, `purvanumaaan`

### Model Config Storage

LLM configs are stored in the `llm_configs` database table:
- `provider`, `model`, `api_key`, `endpoint`
- `temperature`, `max_tokens`
- `is_default` — the active config
- Token usage tracked in `llm_usage_logs`

---

## 2. Query Processing Workflow

### Two Agent Pipelines

The system has **two independent edge functions** that process queries:

| Agent | Function | Used By | Mode |
|-------|----------|---------|------|
| **Realtime Agent** | `realtime-cfo-agent` | Dashboard chat UI | `SIMPLE_DIRECT_LLM_MODE = true` |
| **API Agent** | `cfo-agent-api` | External API clients | `SIMPLE_DIRECT_LLM_MODE = false` |

### Realtime Agent Flow (Dashboard)

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

### API Agent Flow (External)

With `SIMPLE_DIRECT_LLM_MODE = false`, the API agent uses the full routing pipeline:

```
User Query
    │
    ▼
1. Cache Check → if cached, return immediately (path: "cached")
    │
    ▼
2. Intent Matching (Layer 1)
   ├── confidence ≥ 0.85 → FAST PATH (no LLM for tool selection)
   └── confidence < 0.85 → LLM PATH
    │
    ▼
[FAST PATH]                          [LLM PATH]
3a. Execute intent's fixed pipeline   3b. Classify query (keyword-based)
    └── Call MCP tools from flow          ├── "general_chat" → no tools, short reply
    └── Format with cheap LLM            └── "unified" → keyword-filtered tools + LLM
    │                                    │
    ▼                                    ▼
4. Cache write (skip if write ops)   4. Tool call loop (max 10 iterations)
    │                                    │
    ▼                                    ▼
5. Stream response via SSE           5. Cache write + stream response
```

### SSE Event Stream

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

### Complete Event Payload

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

### Layer 1: Keyword Classifier (`classifier.ts`)

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

### Layer 2: Intent Matching (DB-based, free)

Matches against the `intents` table using training phrases:
- **Exact match** → 0.95 confidence
- **Substring match** → 0.70–0.95 (proportional to length similarity)
- **Name match** → 0.60 confidence
- **Threshold for fast path** → 0.85

### Layer 3: Model Tier Selection

Based on query complexity (see Section 1).

---

## 4. Tool Selection & MCP Integration

### MCP Server

| Setting | Value |
|---------|-------|
| **Server** | HelloBooks MCP Server (`mcp.hellobooks.ai`) |
| **Protocol** | JSON-RPC 2.0 over Streamable HTTP |
| **Auth** | Bearer token + `entityid`/`orgid` query params |
| **Client Version** | `Munimji-Agent/4.0` |

### MCP Client Features

- **Initialize** → `initialize` RPC call (protocol version `2024-11-05`)
- **List Tools** → `tools/list` RPC call
- **Call Tool** → `tools/call` with automatic retry for write operations
- **SSE Response Parsing** — handles both JSON and SSE response formats
- **Timeout Strategy:**
  - Read operations: 30s timeout
  - Write operations: 60s timeout + 1 automatic retry
  - Per-chunk SSE read: 5s timeout

### Tool Categories (17 groups, 120+ tools)

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

### Tool Selection Strategies

1. **`direct_llm_all_mcp_tools`** — All MCP tools given to LLM (realtime agent)
2. **`keyword_matched_dynamic`** — Keyword-matched categories + dynamic scoring from MCP tool names/descriptions
3. **`default_unified_dynamic`** — Broad default set when no keywords match
4. **`all_tools_fallback`** — Fallback when keyword filtering yields 0 tools

### Follow-up Detection

Short queries (<5 words) with conversation history reuse the previous tool group instead of re-classifying.

### Cache Invalidation

Write operations (e.g., `create_invoice`) automatically invalidate related cached queries (e.g., all invoice-related cached responses).

---

## 5. System Prompts & Persona

### Persona: Munimji

- AI CFO assistant exclusively for HelloBooks
- Professional accounting tone
- Indian formats: ₹ in lakhs/crores, DD/MM/YYYY dates
- Supports Hindi/Hinglish queries
- Never exposes database IDs, UUIDs, or internal field names

### Three System Prompts

| Prompt | Used When | Max Tokens | Key Behavior |
|--------|-----------|------------|--------------|
| **Unified** | All financial queries (LLM path) | 8192 | Full tool calling, CRUD, analysis, progressive field collection |
| **Fast Path** | High-confidence intent matches | 2048 | Format-only (no tool calling), data already fetched |
| **General Chat** | Greetings, off-topic | 512 | No tools, scope-limited to HelloBooks topics |

### Key Prompt Features (Unified)

1. **ID Suppression** — Absolute rule to never show UUIDs or internal IDs
2. **Progressive Field Collection** — Only ask for missing fields, default everything possible
3. **`params` Block** — Every create/update response includes a structured JSON params block showing applied vs. pending fields
4. **`clarification` Block** — Structured multi-choice questions (radio, dropdown, checkbox) for user decisions
5. **Confirmation Handling** — "yes"/"haan"/"kar do" triggers immediate execution of last proposed action
6. **Duplicate Detection** — Check for duplicates before create operations
7. **Dangerous Action Tiers** — LOW/MEDIUM/HIGH/CRITICAL with escalating confirmation requirements
8. **List/Bulk Display** — Must show ALL returned records, never truncate with "and X more"
9. **Pagination** — Support "show more"/"aur dikhao" follow-ups
10. **Context Resolution** — "it", "this", "send it", "do the same for X" all resolved from conversation context
11. **Error Handling** — Never show technical errors; convert to user-friendly accounting language
12. **Trend Enrichment** — Auto-calculate % change with ▲/▼/► indicators
13. **Anomaly Detection** — Flag items 2x+ higher than historical average

---

## 6. Chatbot Features

### 6.1 Core Chat

| Feature | Description |
|---------|-------------|
| **Real-time SSE Streaming** | Responses stream token-by-token via Server-Sent Events |
| **Multi-turn Conversations** | Full conversation history maintained and sent with each query |
| **Thinking Panel** | Live visualization of agent's routing, intent matching, tool execution phases |
| **Conversation Sidebar** | Browse, search, and switch between past conversations |
| **New Chat** | Start fresh conversation with new ID |
| **Clear Chat** | Reset current conversation |

### 6.2 Financial Operations (CRUD)

| Operation | Supported Entities |
|-----------|-------------------|
| **Create** | Invoices, Bills, Payments, Customers, Vendors, Credit Notes, Expenses, Journal Entries, Products |
| **Read/List** | All above + Delivery Challans, Transactions, Bank Accounts, Chart of Accounts |
| **Update** | Invoices, Bills, Payments, Customers, Vendors, Credit Notes, Transactions |
| **Delete** | Expenses, Journal Entries (with confirmation) |

### 6.3 Financial Reports & Analytics

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

### 6.4 Smart Features

| Feature | How It Works |
|---------|-------------|
| **Progressive Field Collection** | Asks only for missing fields; defaults date, due date, tax, currency, invoice number automatically |
| **`params` Block UI** | Structured card showing applied fields (with values) and pending fields (with hints) |
| **`clarification` Block UI** | Radio buttons / dropdown / checkboxes for structured user choices |
| **Duplicate Detection** | Checks GSTIN, PAN, fuzzy name match before creating contacts; checks invoice number + customer + amount + date before creating invoices |
| **Confirmation Flow** | "yes"/"haan"/"kar do" immediately executes the last proposed action with all collected parameters |
| **Context Resolution** | "it"/"this"/"that" refers to last entity; "send it" sends last document; "do the same for X" repeats with different entity |
| **Pagination** | "show more"/"next"/"aur dikhao" fetches next page; "filter by X" resets to first page |
| **Overdue Detection** | Automatically identifies overdue items and uses aging-specific tools |
| **Document Lookup** | "show details for INV-123" searches by document number, not internal ID |
| **Created Document Tracking** | Tracks recently created documents in conversation metadata for follow-up queries |

### 6.5 Auto-Enrichments

Applied automatically based on data patterns in tool results:

| Enrichment | Trigger | Action |
|------------|---------|--------|
| **Trend Analysis** | Time-series data detected | Calculate growth rates, directional changes |
| **Currency Formatting** | Amount data detected | Format in Indian numbering (lakhs/crores) with ₹ |
| **Ranking** | List with 3+ items | Rank and highlight top/bottom items |
| **Alert Evaluation** | Threshold/overdue data | Flag items needing attention |

### 6.6 Multi-Language Support

- **English** — Full support
- **Hindi** — Supported keywords: `banao`, `dikhao`, `batao`, `kharcha`, `bikri`, `naafa`, `baaki`, etc.
- **Hinglish** — Mixed Hindi-English queries handled naturally
- **Greetings** — `namaste`, `namaskar`, `dhanyavaad`, `shukriya`, `alvida`

### 6.7 Safety & Guardrails

| Guardrail | Implementation |
|-----------|---------------|
| **No ID Exposure** | UUIDs, internal IDs stripped from all responses |
| **No Technical Jargon** | API, payload, endpoint, schema, stack trace never shown to users |
| **Destructive Action Confirmation** | Delete/void/cancel require explicit confirmation |
| **Amount/Date Validation** | Validated before submission |
| **Scope Limitation** | Only assists with HelloBooks-related tasks |
| **Error Message Sanitization** | Technical errors converted to friendly messages |
| **Card Block Stripping** | Raw `` ```card `` markdown blocks stripped from user-facing responses |

### 6.8 Conversation History

| Feature | Details |
|---------|---------|
| **Persistence** | Conversations saved to `unified_conversations` table |
| **Sequential Numbering** | Each entity gets sequential chat IDs (#MJ-0001, #MJ-0002, etc.) |
| **Auto-naming** | Chat name auto-generated from first user message |
| **Soft Delete** | Conversations soft-deleted (recoverable) |
| **Message Preview** | Last message preview stored for sidebar display |
| **Org Isolation** | Conversations scoped by `entity_id` and `org_id` |
| **Export** | Conversations exportable via `export-chat` edge function |

### 6.9 Feedback System

| Type | How |
|------|-----|
| **Explicit** | User thumbs up/down on responses |
| **Implicit Signals** | Auto-detected from behavior: rephrase (negative), follow-up (positive), action-after-read (strong positive) |
| **Feedback Logging** | All feedback stored in `feedback_log` table with full context |

---

## 7. Enrichment Engine

### Auto-Enrichments (`enrichment-auto-apply.ts`)

Analyzes MCP tool results for data patterns:

| Pattern | Detection Method | Enrichment |
|---------|-----------------|------------|
| Time Series | Keywords: month, quarter, year, Jan-Dec | Trend analysis with % change |
| Amounts | Keywords: ₹, $, amount, total, balance | Indian number formatting |
| Lists | JSON arrays with 3+ items | Ranking (top/bottom) |
| Thresholds | Keywords: overdue, aging, critical, warning | Alert evaluation |

### Enrichment Instructions

When enrichments are detected, they're injected into the system prompt as:
```
AUTO-ENRICHMENTS TO APPLY:
- TREND ANALYSIS: Identify trends, growth rates, and directional changes
- CURRENCY FORMATTING: Format all amounts in Indian numbering (lakhs/crores)
```

---

## 8. Reinforcement Learning Pipeline

### Intent Routing Stats (`intent_routing_stats`)

Tracks success/failure rates per intent per confidence bucket (0.05 increments):
- Total attempts, successful attempts, failed attempts
- Average response time
- Average feedback score

### Adaptive Confidence Thresholds

Based on historical performance:
- Success rate > 90% & 20+ attempts → **lower** threshold by 0.05 (min 0.70)
- Success rate < 70% & 10+ attempts → **raise** threshold by 0.05 (max 0.95)
- Otherwise → default 0.85

### LLM Path Pattern Logging (`llm_path_patterns`)

Every LLM-path query (no intent match) is hashed and logged:
- Query text + hash for grouping similar queries
- Tools used, strategy, response time, feedback score
- Occurrence count updated on repeat queries

### Auto-Intent Suggestion (`suggested_intents`)

When an LLM path pattern reaches **10+ occurrences**, the system automatically:
1. Creates a `suggested_intent` record
2. Links it to the source pattern
3. Status set to `pending` for human review

### Implicit Signal Detection

| Signal | Trigger | Score |
|--------|---------|-------|
| Rephrase | >60% keyword overlap with previous query | -1 (negative) |
| Follow-up | Short query building on context | +1 (positive) |
| Action Taken | Write verb after read response | +2 (strong positive) |

---

## 9. Conversation Management

### Conversation Persistence Flow

After every completed query:

1. Build user message + agent message objects
2. Merge with existing conversation history
3. Upsert to `unified_conversations` table:
   - Increment `message_count`
   - Update `last_message_preview`
   - Auto-generate `chat_name` from first message
   - Assign sequential `chat_number` per entity

### Conversation Sidebar (Frontend)

- Lists conversations for current entity
- Shows chat display ID (#MJ-XXXX), name, preview, timestamp
- Click to load full conversation history
- "New Chat" button creates fresh conversation

---

## 10. Edge Functions Reference

| Function | Purpose | Auth |
|----------|---------|------|
| `realtime-cfo-agent` | Main SSE streaming agent for dashboard chat | Anon key |
| `cfo-agent-api` | External REST API with full routing pipeline | JWT + H-Authorization |
| `cfo-agent-mcp` | JSON-RPC 2.0 MCP server for external tool calling | Bearer token |
| `munimji-agent` | Unified messaging pipeline (authenticated + unauthenticated) | JWT / Anon |
| `generate-intent` | AI-powered single intent generation | Anon key |
| `generate-batch-intents` | Batch generation of up to 10 intents | Anon key |
| `fetch-mcp-tools` | Fetches available tools from HelloBooks MCP | Anon key |
| `test-with-mcp` | Tests queries with MCP tool execution | Anon key |
| `get-conversations` | Retrieve conversation history | Anon key |
| `get-tool-analytics` | Intent + tool usage analytics | Anon key |
| `submit-feedback` | Store explicit user feedback | Anon key |
| `export-chat` | Export conversation as downloadable format | Anon key |
| `upload-attachment` | Handle file uploads for chat | Anon key |
| `audio-transcribe` | Transcribe audio input to text | Anon key |
| `create-user` | Admin user creation | Service role |
| `delete-user` | Admin user deletion | Service role |
| `check-super-admin` | Validate super admin access | Service role |

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

### Conversation & Feedback Tables

| Table | Purpose |
|-------|---------|
| `unified_conversations` | Full conversation history with messages JSON, chat numbering, org isolation |
| `feedback_log` | Explicit + implicit feedback per message |
| `quick_suggestions` | Configurable quick-action suggestions per entity |

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

## Architecture Diagram

```
┌───────────────────────────────────────────────────────────────┐
│                        React Frontend                         │
│  ┌──────────────────┐  ┌──────────────────────────────────┐  │
│  │ ConversationSidebar│  │   RealtimeCFOAgent (Chat UI)    │  │
│  │ - History list    │  │   - SSE event handler            │  │
│  │ - Chat switching  │  │   - AgentThinkingPanel           │  │
│  │ - New/delete chat │  │   - MessageBubble (markdown)     │  │
│  └──────────────────┘  │   - Input + send                  │  │
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
│  └─────────────────────────────────────────────────────────┘  │
│                          │                                    │
│         ┌────────────────┼────────────────┐                   │
│         ▼                ▼                ▼                   │
│  ┌────────────┐  ┌─────────────┐  ┌────────────┐            │
│  │ Supabase   │  │ Azure OpenAI│  │ HelloBooks │            │
│  │ Database   │  │ (LLM)      │  │ MCP Server │            │
│  └────────────┘  └─────────────┘  └────────────┘            │
└───────────────────────────────────────────────────────────────┘
```

---

*This document is auto-generated from the codebase. For the latest details, refer to the source files in the repository.*
