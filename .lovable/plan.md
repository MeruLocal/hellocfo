
## Munimji Implementation Status — Updated 2026-02-21

### ✅ COMPLETED

| # | Item | Status |
|---|------|--------|
| 1 | **Layer 1: Response Cache** — TTL-based caching, entity-scoped, invalidation on writes | ✅ Done |
| 2 | **Layer 2: General Chat Detection** — Pattern matching (English + Hindi), ≤6 words rule | ✅ Done |
| 3 | **Layer 4: Tool Groups** — All 17 groups defined in `_shared/tool-groups.ts` (single source of truth) | ✅ Done |
| 4 | **Layer 5: Model Selection** — Haiku/Sonnet toggling based on complexity | ✅ Done |
| 5 | **Layer 6: LLM Call with Tools** — OpenAI function-calling, tool loop, SSE streaming | ✅ Done |
| 6 | **Layer 7: Enrichments (basic)** — Currency formatting, auto-enrichment detection | ✅ Done |
| 7 | **Layer 8: Post-Processing (basic)** — Conversation persistence, cache write, feedback logging | ✅ Done |
| 8 | **DB Tables** — All 7 tables created: unified_conversations, response_cache, feedback_log, tool_registry, intent_routing_stats, llm_path_patterns, suggested_intents | ✅ Done |
| 9 | **Tool-groups deduplication** — Single `_shared/tool-groups.ts` used by both cfo-agent-api and realtime-cfo-agent | ✅ Done |
| 10 | **Entity/Org ID injection fix** — Unconditional injection into all MCP tool calls | ✅ Done |
| 11 | **Create tools added** — create_invoice, create_bill, create_payment, create_customer, create_vendor | ✅ Done |
| 12 | **List truncation fix** — System prompts updated to show all records | ✅ Done |
| 13 | **RL Logging wired** — Both agents log to intent_routing_stats (fast path) and llm_path_patterns (LLM path), auto-suggests intents at 10+ occurrences | ✅ Done |
| 14 | **Documentation** — CFO_AGENT_API.md, CONVERSATION_HISTORY_API.md, HelloCFO_Workflow.md | ✅ Done |
| 15 | **Expanded category relationships** — reports_pnl→trends, cashflow→banking, payables→vendors, gst→reports_gst, etc. | ✅ Done |
| 16 | **Default CFO set expanded** — Now includes reports_pnl, reports_balance, reports_cashflow, kpi_dashboard | ✅ Done |

### ❌ REMAINING (API-only items)

| # | Item | Priority | Complexity |
|---|------|----------|------------|
| 1 | **Consolidate to single munimji-agent** — Merge cfo-agent-api + realtime-cfo-agent into one function per the plan | HIGH | Large |
| 2 | **Layer 3: Intent Fast Path** — Match against `intents` DB table, extract entities, execute pre-built pipelines with confidence thresholds | HIGH | Medium |
| 3 | **Follow-up detection (Strategy 3)** — Reuse last tool group for short (<5 word) follow-up messages | MEDIUM | Small |
| 4 | **Conversation history summarization** — After 20 messages, summarize older ones with Haiku, keep summary + last 10 | MEDIUM | Medium |
| 5 | **Cache invalidation map** — Detailed per-tool invalidation (create_invoice → clear profit, revenue, aging, etc.) | MEDIUM | Small |
| 6 | **Exception: Progressive field collection** — Ask only for missing required fields, use smart defaults | MEDIUM | Medium |
| 7 | **Exception: Duplicate detection** — Check before every CREATE (customer GSTIN/PAN match, invoice number match) | MEDIUM | Medium |
| 8 | **Exception: Hindi number parsing** — paanch lakh → ₹5,00,000, do crore → ₹2,00,00,000 | LOW | Small |
| 9 | **Exception: Context/pronoun resolution** — "Send it" → last entity, "Do the same for TCS" → repeat action | LOW | Medium |
| 10 | **Exception: Dangerous action confirmation** — Tiered confirmation (LOW/MEDIUM/HIGH/CRITICAL) | LOW | Medium |
| 11 | **Enrichments: Trend analysis** — "▲ 12.8% vs last quarter" on CFO reports | LOW | Small |
| 12 | **Enrichments: Anomaly detection** — "⚠ Office supplies expense is 3x higher than average" | LOW | Medium |
| 13 | **Enrichments: Projection/Benchmark** — Runway calculation, industry margin comparison | LOW | Medium |
| 14 | **Adaptive confidence thresholds** — Use intent_routing_stats to auto-adjust per-intent thresholds | LOW | Medium |
| 15 | **Implicit signal detection** — Detect rephrases (negative), follow-ups (positive), action taken (strong positive) | LOW | Small |
| 16 | **Prompt caching** — Anthropic-style cache_control for system prompt + tool defs (if switching from OpenAI) | LOW | Medium |

### ❌ REMAINING (Frontend items — NOT in current scope)

| # | Item |
|---|------|
| 1 | Welcome screen with 6 quick action cards |
| 2 | Quick suggestion chips below input |
| 3 | Entity switcher dropdown in header |
| 4 | Chat numbering display (#MJ-XXXX) |
| 5 | Mode badges (📝 Bookkeeper, 📊 CFO, 💬 Chat) |
| 6 | Rich data cards inline (invoice card, report card) |
| 7 | Voice input (🎤), camera for receipts (📸) |
| 8 | Chat rename (inline edit) |
