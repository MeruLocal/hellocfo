

# Hybrid 3-Layer Architecture for CFO Agent

## Status: ✅ Phase 1 + Phase 2 IMPLEMENTED

## Summary

Transform the current single-path CFO agent into a hybrid system with two paths: a **Fast Path** (existing intent DB, handles ~80% of queries at near-zero cost) and an **LLM Path** (grouped tools with AI reasoning, handles novel/complex queries). The existing intent system stays intact as the primary router.

## Phase 2: Response Caching + Multi-Entity Isolation ✅

### Response Cache
- TTL-based caching with entity isolation (cache_key = `entityId:path:queryHash`)
- Aggressive TTLs: reports 10min, list queries 5min, lookups 2min, chat 30min
- Cache bypass on first request → write after response
- Second identical request served from cache: **0 tokens, ~100ms**
- Automatic cache invalidation when write operations (`update_*`, `create_*`) are used

### Multi-Entity Isolation
- All cache keys, MCP headers, and data access scoped by `entityId`
- Entity ID resolved from body params → env vars → "default" fallback
- No cross-entity data leakage possible

### Files Created
- `supabase/functions/realtime-cfo-agent/response-cache.ts`
- `supabase/functions/cfo-agent-api/response-cache.ts`

### Files Modified
- `supabase/functions/realtime-cfo-agent/index.ts` — cache check before MCP, cache write after response
- `supabase/functions/cfo-agent-api/index.ts` — same + non-stream JSON cache response
- `src/components/cfo-agent/types.ts` — added 'cached' RoutePath
- `src/components/cfo-agent/AgentThinkingPanel.tsx` — green "Cached" badge

## Phase 1 (Completed Previously)
- Dynamic tool selection via keyword matching (8-15 tools per query)
- `tool_registry`, `response_cache`, `unified_conversations`, `feedback_log` tables
- General chat bypass (0 tools)

## Next: Phase 3 — RL Feedback Loop
- Log all interactions to `feedback_log` with tool selection strategy
- Adaptive confidence thresholds based on `intent_routing_stats`
- LLM path pattern learning from `llm_path_patterns`
