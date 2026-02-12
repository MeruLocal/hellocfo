# HelloCFO (Munimji) — Complete Application Workflow

## 1. Overview

HelloCFO is an AI-powered CFO assistant that answers financial queries in real-time. The AI agent is branded as **Munimji** and uses a sophisticated intent-based resolution engine combined with live accounting data from the **HelloBooks MCP server**.

---

## 2. Architecture

```
┌──────────────┐     SSE Stream      ┌─────────────────────┐
│   React UI   │ ◄──────────────────► │  realtime-cfo-agent │
│  (Frontend)  │                      │   (Edge Function)   │
└──────────────┘                      └────────┬────────────┘
                                               │
                              ┌────────────────┼────────────────┐
                              ▼                ▼                ▼
                     ┌──────────────┐  ┌─────────────┐  ┌────────────┐
                     │  Supabase DB │  │  LLM Provider│  │ HelloBooks │
                     │  (Intents,   │  │  (Anthropic/ │  │ MCP Server │
                     │   Configs)   │  │   Azure/etc) │  │  (Live     │
                     └──────────────┘  └─────────────┘  │  Accounting)│
                                                        └────────────┘
```

---

## 3. Page Routes

| Route          | Component                  | Purpose                                      |
|----------------|----------------------------|----------------------------------------------|
| `/`            | `Landing.tsx`              | Public landing page with animated live demo   |
| `/dashboard`   | `Index.tsx` → `CFOQueryResolutionEngine` | Main agent chat + intent/config management |
| `/auth`        | `Auth.tsx`                 | Login / Signup                                |
| `/api-console` | `ApiTestConsole.tsx`       | API testing console for external integrations |

---

## 4. Core Workflow — Query Resolution

When a user sends a financial query (e.g., *"What is my GST liability for March?"*), the following pipeline executes:

### Step 1: User Sends Query
- The React frontend (`RealtimeCFOAgent.tsx`) sends a POST request to the `realtime-cfo-agent` edge function.
- Payload includes: query text, active intents, business context, and conversation history.

### Step 2: SSE Connection Established
- The edge function opens a **Server-Sent Events (SSE)** stream back to the frontend.
- Each phase of processing is streamed as a typed event.

### Step 3: Intent Detection
- **Event**: `intent_detecting` → `intent_detected`
- The LLM analyzes the query against all active intents (stored in the `intents` DB table).
- Each intent has: name, description, training phrases, entities, and a resolution flow.
- The best-matching intent is returned with a confidence score.

### Step 4: Entity Extraction
- **Event**: `entities_extracted`
- The LLM extracts structured entities from the query (e.g., date ranges, account names, amounts).
- Entity definitions come from the matched intent's configuration.

### Step 5: Pipeline Planning
- **Event**: `pipeline_planned`
- Based on the matched intent's resolution flow, the agent plans which **MCP tools** to call.
- Each step has: tool name, description, and purpose.

### Step 6: Enrichment Planning
- **Event**: `enrichments_planned`
- The agent decides what enrichments to apply (e.g., compliance checks, trend analysis, benchmarking).
- Also determines the response format (table, narrative, chart, etc.).

### Step 7: Tool Execution (MCP)
- **Event**: `executing_tool` → `tool_result`
- The agent calls tools on the **HelloBooks MCP server** (`mcp.hellobooks.ai`).
- Tools fetch live accounting data: invoices, ledgers, trial balances, journal entries, etc.
- Authentication uses `MCP_HELLOBOOKS_AUTH_TOKEN`, `MCP_HELLOBOOKS_ENTITY_ID`, `MCP_HELLOBOOKS_ORG_ID`.
- Retry logic handles intermittent 503 errors gracefully.

### Step 8: Response Generation
- **Event**: `response_generating` → `response_chunk`
- The LLM synthesizes all collected data into a contextual financial response.
- Response is streamed token-by-token via `response_chunk` events.
- The response is tailored to the business context (country, currency, industry, entity size).

### Step 9: Completion
- **Event**: `complete`
- Final payload includes: full response, matched intent, extracted entities, pipeline steps, enrichments, tool results, token usage, execution time, and LLM model used.

---

## 5. SSE Event Types

| Event                  | Description                                    |
|------------------------|------------------------------------------------|
| `connected`            | SSE connection established                     |
| `understanding_started`| Processing begins                              |
| `intent_detecting`     | Analyzing query against intents                |
| `intent_detected`      | Best intent matched with confidence score      |
| `entities_extracted`   | Structured entities pulled from query          |
| `pipeline_planned`     | MCP tool execution plan created                |
| `enrichments_planned`  | Enrichment types and response format decided   |
| `executing_tool`       | MCP tool call in progress                      |
| `tool_result`          | Tool execution result (success/failure)        |
| `response_generating`  | LLM is generating the response                 |
| `response_chunk`       | Streamed token of the response                 |
| `complete`             | All processing done, final payload delivered   |
| `error`                | Error occurred during processing               |

---

## 6. Database Tables

| Table              | Purpose                                              |
|--------------------|------------------------------------------------------|
| `intents`          | Financial query intents with training phrases & flows |
| `modules`          | Financial modules (Sales, GST, Inventory, etc.)      |
| `business_contexts`| Company context (country, currency, industry, size)   |
| `country_configs`  | Country-specific settings and thresholds             |
| `llm_configs`      | LLM provider configurations (model, temp, tokens)    |
| `llm_providers`    | Available LLM providers and their models             |
| `llm_usage_logs`   | Token usage and latency tracking                     |
| `enrichment_types` | Available enrichment types (compliance, trends, etc.) |
| `entity_types`     | Entity types for extraction (date, amount, etc.)     |
| `response_types`   | Response format types (table, narrative, chart)       |
| `profiles`         | User profiles                                        |
| `user_roles`       | Role-based access (admin/user)                       |
| `api_keys`         | API keys for external integrations                   |

---

## 7. Edge Functions

| Function               | Purpose                                           |
|------------------------|---------------------------------------------------|
| `realtime-cfo-agent`   | Main SSE streaming agent for the chat UI          |
| `cfo-agent-api`        | Standalone REST API for external integrations     |
| `generate-intent`      | AI-powered intent generation                      |
| `generate-batch-intents`| Batch generation of up to 10 intents             |
| `fetch-mcp-tools`      | Fetches available tools from HelloBooks MCP       |
| `test-with-mcp`        | Tests queries with MCP tool execution             |
| `create-user`          | Admin user creation                               |
| `delete-user`          | Admin user deletion                               |
| `check-super-admin`    | Validates super admin access                      |

---

## 8. External API (cfo-agent-api)

A standalone authenticated API for third-party frontends.

- **Endpoint**: `POST /functions/v1/cfo-agent-api`
- **Auth**: JWT token in `Authorization` header
- **MCP Credentials**: Dynamic via `H-Authorization` header + body params (`entityId`, `orgId`)
- **Response**: SSE stream (same event types as the chat UI)
- **Documentation**: `docs/CFO_AGENT_API.md`

---

## 9. LLM Configuration

- LLM provider configs are stored in the `llm_configs` database table (not hardcoded).
- Supports Anthropic and Azure OpenAI providers.
- Configurable: model, temperature, max tokens, system prompt override.
- Usage is tracked per request in `llm_usage_logs`.

---

## 10. MCP Integration (HelloBooks)

- **Server**: `mcp.hellobooks.ai`
- **Protocol**: Model Context Protocol (MCP)
- **Data Available**: Invoices, ledgers, trial balances, journal entries, GST reports, etc.
- **Resilience**: Retry logic with graceful degradation on 503 errors.
- **Auth**: Token-based with entity and org scoping.

---

## 11. Landing Page Features

- **Hero Section**: Tagline + animated live demo chatbot (Munimji persona)
- **Live Demo**: Simulated typewriter-style chat across financial scenarios
- **Module Showcase**: Scrolling marquee of 14+ financial modules
- **Branding**: Munimji avatar with "Namaste" greeting

---

## 12. Tech Stack

| Layer      | Technology                              |
|------------|----------------------------------------|
| Frontend   | React 18, Vite, TypeScript             |
| Styling    | Tailwind CSS, shadcn/ui                |
| Backend    | Lovable Cloud Edge Functions (Deno)    |
| Database   | PostgreSQL (via Lovable Cloud)         |
| AI/LLM     | Anthropic Claude / Azure OpenAI        |
| Data       | HelloBooks MCP Server                  |
| Auth       | Email-based authentication             |
| Streaming  | Server-Sent Events (SSE)              |

---

## 13. Flow Diagram

```
User Query
    │
    ▼
┌─────────────────┐
│ Intent Detection │──► Match against DB intents
└────────┬────────┘
         ▼
┌─────────────────┐
│ Entity Extraction│──► Extract dates, amounts, accounts
└────────┬────────┘
         ▼
┌─────────────────┐
│ Pipeline Planning│──► Decide which MCP tools to call
└────────┬────────┘
         ▼
┌─────────────────┐
│ Enrichment Plan  │──► Add compliance, trends, benchmarks
└────────┬────────┘
         ▼
┌─────────────────┐
│ Tool Execution   │──► Call HelloBooks MCP for live data
└────────┬────────┘
         ▼
┌─────────────────┐
│ Response Gen     │──► LLM crafts contextual financial answer
└────────┬────────┘
         ▼
    Final Response (streamed via SSE)
```
