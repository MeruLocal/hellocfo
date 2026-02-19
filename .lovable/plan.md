

# Hybrid 3-Layer Architecture for CFO Agent

## Summary

Transform the current single-path CFO agent into a hybrid system with two paths: a **Fast Path** (existing intent DB, handles ~80% of queries at near-zero cost) and an **LLM Path** (grouped tools with AI reasoning, handles novel/complex queries). The existing intent system stays intact as the primary router.

## How It Works

**Every query flows through this logic:**

1. The existing intent matcher runs first (free DB query)
2. If confidence is 85% or higher -- **Fast Path**: use the matched intent's fixed pipeline, enrichments, and format with the cheapest LLM model (just for response formatting)
3. If confidence is below 85% -- **LLM Path**: classify the query via keyword patterns (bookkeeper/cfo/general_chat), provide only the relevant 15-20 grouped tools to the LLM, and let it reason freely
4. Enrichments (trend analysis, anomaly detection, etc.) apply on both paths

## What Changes

### Keep Unchanged
- Supabase Intent DB (intents, training phrases, entities, pipelines, enrichments)
- HelloBooks MCP Server and all 200+ tool handlers
- SSE streaming infrastructure
- MCP Client class

### New Files (4 files)

**1. Tool Group Definitions** -- Maps 35 module-level tools to underlying MCP tools
- 18 Bookkeeper tools (write/action operations like manage_invoices, manage_bills, gst_actions)
- 15 CFO tools (read/report operations like financial_statements, receivables_report, business_kpis)
- Each tool has explicit MCP mappings (not auto-grouped by prefix)

**2. Category Classifier** -- Simple keyword-based classification (no LLM call)
- Detects general chat patterns (hi, hello, namaste, thanks)
- Detects bookkeeper patterns (create, edit, delete, record, file, send)
- Detects CFO patterns (show, report, analyze, compare, trend, revenue)
- Supports Hindi keywords (banao, dikhao, batao)
- Defaults to CFO (most queries are reads)

**3. Model Selector** -- Picks cheapest model for the job
- General chat: always cheapest model
- Simple queries: cheapest model
- Complex queries (analytical, multi-step, 30+ words): more capable model

**4. Enrichment Auto-Apply** -- Detects data patterns and applies enrichments on the LLM path
- Time series data gets trend analysis
- Amounts get currency formatting
- Lists get ranking
- Thresholds get alert evaluation

### Modified Files (5 files)

**5. `supabase/functions/realtime-cfo-agent/index.ts`** -- Major refactor
- After MCP connection, run intent matching against DB first (existing logic)
- If confidence >= 0.85: execute fixed pipeline, apply enrichments, call cheapest LLM just for formatting (no tools)
- If confidence < 0.85: classify category via keywords, select tool group (bookkeeper 18 tools OR cfo 15 tools), select model tier, call LLM with filtered tools
- General chat: respond directly with no tools
- Add prompt caching on system prompt and tool definitions
- Add cross-over detection (CFO query leading to bookkeeper action)
- New SSE events: route_started, route_classified, tools_filtered, pipeline_executing, enrichments_applying, mode_switch

**6. `supabase/functions/cfo-agent-api/index.ts`** -- Same hybrid routing logic applied to the external API endpoint

**7. `src/components/cfo-agent/types.ts`** -- Add new SSE event types (route_started, route_classified, tools_filtered, mode_switch, pipeline_executing, enrichments_applying) and RouteClassifiedEvent / ToolsFilteredEvent interfaces

**8. `src/components/cfo-agent/RealtimeCFOAgent.tsx`** -- Handle new SSE events, track which path (fast/llm) and category (bookkeeper/cfo/general)

**9. `src/components/cfo-agent/AgentThinkingPanel.tsx`** -- Show path indicator:
- Fast Path: lightning bolt icon, shows intent name, confidence, pipeline steps, enrichments
- LLM Path: brain icon, shows mode (Bookkeeper/CFO), tool count, model being used
- Different color schemes per mode

## Technical Details

### System Prompts (4 category-specific prompts)

- **Fast Path Prompt**: Minimal -- just formats provided data into Indian currency, concise response
- **Bookkeeper Prompt**: Action-oriented -- confirms destructive actions, asks for missing info
- **CFO Prompt**: Analytical -- highlights risks/anomalies, provides context with numbers
- **General Chat Prompt**: Warm, brief, redirects off-topic to finance

### Confidence Threshold Logic

The intent matching currently happens inside the LLM via the `match_intent` tool. The change restructures this so:
- Intent matching still uses the existing Supabase intent DB
- But the confidence check (>= 0.85) happens in code BEFORE deciding the path
- The LLM on the fast path only receives data + formatting instructions (zero tools)
- The LLM on the fallback path receives grouped tools + category-specific prompt

### Prompt Caching (Anthropic)

- Static system prompt gets `cache_control: { type: "ephemeral" }` -- 90% cost reduction after first call
- Last tool in the tools array gets cache_control -- caches all tool definitions
- Entity-specific context (org name, GST number) is NOT cached (changes per entity)

### Cross-Over Handling

When a user is in CFO mode (viewing a report) and then asks to take action ("send reminders to overdue customers"), the system detects action keywords and switches to bookkeeper tools for that turn, emitting a `mode_switch` SSE event.

### Performance Targets

| Query Type | Current Cost | New Cost | Current Speed | New Speed |
|---|---|---|---|---|
| Known query (80%) | ~$0.15 | ~$0.003 | ~3s | ~750ms |
| Novel query (15%) | ~$0.15 | ~$0.02 | ~3s | ~2s |
| General chat (5%) | ~$0.15 | ~$0.001 | ~3s | ~300ms |
| Monthly (10K msgs) | ~$1,500 | ~$70 | -- | -- |

### Implementation Order

1. Create tool group definitions config
2. Create category classifier (keyword-based)
3. Create model selector and enrichment auto-apply utilities
4. Modify `realtime-cfo-agent` with hybrid routing
5. Update frontend types, SSE handlers, and thinking panel
6. Apply same routing to `cfo-agent-api`
7. Update `supabase/config.toml` (no new functions needed)

### Important Notes

- No new edge functions are created -- classification is inline
- The existing `match_intent` tool is kept but restructured: intent matching happens in code first, the tool is only used on the LLM path as a secondary signal
- All 200+ MCP tools remain on the server -- only the tools SENT TO THE LLM are filtered
- The tool groups act as "meta-tools" that the LLM calls, and the edge function translates them to actual MCP tool calls using the explicit mapping

