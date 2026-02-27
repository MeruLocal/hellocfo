

# Gap Analysis: Backend Status and Frontend Updates

## Summary of All 17 Gaps — What's Already Built

### Backend Status

| Gap | Description | Backend Status | Frontend Status |
|-----|-------------|---------------|-----------------|
| GAP 1 | Multi-Turn Conversation Context | **NOT implemented** — no `conversation_context` object (last_intent, last_entities, last_tool) is extracted or injected. Each turn is treated independently. | N/A (backend-only) |
| GAP 2 | MCQ Timeout + Abandonment | **PARTIALLY implemented** — `mcq-engine.ts` has `loadPendingMCQ` with expiry check and `cancelMCQ`. Missing: auto-cancel on new query, and frontend grey-out for expired cards. | MCQCard has no expiry visual |
| GAP 3 | Free-Text Override During MCQ | **NOT implemented** — no `__MCQ_RESPONSE__` detection or auto-cancel on free-text input exists in either edge function. | Frontend sends MCQ selection as a normal user message (workaround), but doesn't cancel pending MCQ |
| GAP 4 | MCQ Chain Fatigue (MAX=2) | **NOT implemented** — no `MAX_MCQ_CHAIN` counter exists anywhere. | N/A |
| GAP 5 | Error Recovery / Circuit Breaker | **NOT implemented** — no circuit breaker pattern, failure counting, or coordinated fallback. Individual 429 error messages exist but no systematic recovery. | N/A |
| GAP 6 | Response Caching | **FULLY implemented** — `response-cache.ts` exists with `checkCache`, `writeCache`, `determineTTL`, `invalidateCacheForEntity`. Used in `realtime-cfo-agent`. Gated behind `!SIMPLE_DIRECT_LLM_MODE` flag. | N/A (transparent to user) |
| GAP 7 | Feedback Loop from MCQ Selections | **PARTIALLY implemented** — `rl-logger.ts` exists with `logIntentRouting` and `logLLMPathPattern`, but MCQ selections are not fed back as training signals. | N/A |
| GAP 8 | Attachment/File Handling | **PARTIALLY implemented** — `upload-attachment` edge function exists, `audio-transcribe` exists, and `cfo-agent-api` has `hasDocumentAttachments()` + `buildResponsesInput()` for PDF handling via Responses API. Missing: Excel/CSV parsing, file size validation. | N/A |
| GAP 9 | Rate Limiting | **NOT implemented** — no per-user or per-org rate limiting at the edge function level. Only reactive 429 error messages. | N/A |
| GAP 10 | Cost Monitoring | **NOT implemented** — `query_routing_logs` has `llm_total_tokens` but no daily aggregation, alerts, or per-org budgets. | N/A |
| GAP 11 | Proactive Suggestions | **NOT implemented** | N/A |
| GAP 12 | Voice Input | **PARTIALLY implemented** — `audio-transcribe` edge function exists. Frontend integration unclear. | Needs check |
| GAP 13 | Multi-language | **NOT implemented** | N/A |
| GAP 14 | Scheduled Reports | **NOT implemented** | N/A |
| GAP 15 | Collaborative Features | **NOT implemented** | N/A |
| GAP 16 | Undo for Write Ops | **NOT implemented** | N/A |
| GAP 17 | Batch Operations | **NOT implemented** | N/A |

---

## Recommended Implementation Plan (Priority Order)

Based on the gap analysis's own priority ranking and what's already built:

### Phase 1: Quick Wins (Frontend-only updates to existing UI)

**1. MCQ Card Expiry Visual (GAP 2 frontend)**
- Update existing `MCQCard.tsx` to accept a `createdAt` timestamp
- If MCQ is older than 2 minutes, show greyed-out "Expired" state
- Add a subtle timer indicator while active
- No new screens -- just updating the existing card component

**2. MCQ Chain Limit Display (GAP 4 frontend)**
- Update existing `RealtimeCFOAgent.tsx` to track MCQ count per query flow
- After 2 MCQs shown, stop rendering new MCQ cards and let the LLM handle remaining unknowns via text
- No new screens -- counter logic in existing component

**3. Free-Text Override During MCQ (GAP 3 frontend)**
- Update existing `RealtimeCFOAgent.tsx`: when user types in the input while an MCQ card is visible, send as a NORMAL query (not MCQ response)
- Auto-cancel the pending MCQ in the UI (grey it out with "Overridden")
- No new screens -- behavior change in existing chat input logic

### Phase 2: Backend Changes (Edge Functions)

**4. MCQ Chain Limit Backend (GAP 4)**
- Add `MAX_MCQ_CHAIN = 2` constant to `mcq-engine.ts`
- Add `mcqChainCount` tracking in both edge functions (`cfo-agent-api` and `realtime-cfo-agent`)
- After 2 MCQs in a single flow, skip MCQ and let LLM decide

**5. Auto-Cancel Pending MCQ on New Query (GAP 2 + GAP 3 backend)**
- In both edge functions, at the start of processing a new query:
  - Check for pending MCQ via `loadPendingMCQ()`
  - If found, call `cancelMCQ()` with status "abandoned" 
  - Log "[MCQ shown but not answered]" in conversation context
- This fixes both GAP 2 (abandonment) and GAP 3 (free-text override)

**6. Multi-Turn Conversation Context (GAP 1)**
- Add `conversation_context` extraction in both edge functions after loading conversation history
- Extract from last assistant message metadata: `last_intent`, `last_entities`, `last_tool`, `last_result_summary`
- Inject into the LLM system prompt so follow-up queries like "and for last quarter?" work
- Save context in `unified_conversations` metadata after each response
- This is the highest-ROI fix (+6-8% overall success rate)

### Phase 3: Infrastructure (Backend-only)

**7. Circuit Breaker Pattern (GAP 5)**
- Add circuit breaker state tracking per service (embedding, MCP, LLM, DB)
- Track failure counts, implement OPEN/HALF-OPEN/CLOSED states
- Service-specific fallbacks (BGE-M3 down -> keyword only, MCP down -> "system busy", etc.)

**8. Rate Limiting (GAP 9)**
- Add rate limiting middleware to edge functions
- Per-user: 30 req/min, 500/hr; Per-org: 200 req/min
- Use a DB table or in-memory counter with sliding window

---

## Technical Details

### Files Modified (No New Screens)

| File | Change |
|------|--------|
| `src/components/cfo-agent/MCQCard.tsx` | Add expiry visual, timer, greyed-out state |
| `src/components/cfo-agent/RealtimeCFOAgent.tsx` | MCQ chain counter, free-text override logic, cancel pending MCQ on type |
| `src/components/cfo-agent/types.ts` | Add `createdAt` to MCQData, add `mcqChainCount` tracking |
| `supabase/functions/_shared/mcq-engine.ts` | Add `MAX_MCQ_CHAIN`, chain counter tracking |
| `supabase/functions/cfo-agent-api/index.ts` | Auto-cancel pending MCQ, multi-turn context extraction/injection, chain limit |
| `supabase/functions/realtime-cfo-agent/index.ts` | Same as above |

### What Stays As-Is (Already Working)
- Response caching (GAP 6) -- fully implemented, just gated behind `SIMPLE_DIRECT_LLM_MODE`
- MCQ infrastructure (save/load/resolve/cancel) -- backend complete
- Attachment upload + audio transcribe -- basic flow works
- RL logger -- logging infrastructure exists
- Tool selection with hard cap -- just implemented

