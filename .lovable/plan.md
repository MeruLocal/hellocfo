

# Hybrid 3-Layer Architecture for CFO Agent

## Status: ✅ IMPLEMENTED

## Summary

Transform the current single-path CFO agent into a hybrid system with two paths: a **Fast Path** (existing intent DB, handles ~80% of queries at near-zero cost) and an **LLM Path** (grouped tools with AI reasoning, handles novel/complex queries). The existing intent system stays intact as the primary router.

## How It Works

**Every query flows through this logic:**

1. The existing intent matcher runs first (free DB query)
2. If confidence is 85% or higher -- **Fast Path**: use the matched intent's fixed pipeline, enrichments, and format with the cheapest LLM model (just for response formatting)
3. If confidence is below 85% -- **LLM Path**: classify the query via keyword patterns (bookkeeper/cfo/general_chat), provide only the relevant 15-20 grouped tools to the LLM, and let it reason freely
4. Enrichments (trend analysis, anomaly detection, etc.) apply on both paths

## Files Created/Modified

### New Files
- `supabase/functions/realtime-cfo-agent/tool-groups.ts` — 18 Bookkeeper + 15 CFO module tools mapped to MCP
- `supabase/functions/realtime-cfo-agent/classifier.ts` — Keyword-based query classification
- `supabase/functions/realtime-cfo-agent/model-selector.ts` — Model tier selection + category prompts
- `supabase/functions/realtime-cfo-agent/enrichment-auto-apply.ts` — Auto-detect data patterns for enrichments
- `supabase/functions/cfo-agent-api/tool-groups.ts` — (copy for isolated deployment)
- `supabase/functions/cfo-agent-api/classifier.ts` — (copy)
- `supabase/functions/cfo-agent-api/model-selector.ts` — (copy)
- `supabase/functions/cfo-agent-api/enrichment-auto-apply.ts` — (copy)

### Modified Files
- `supabase/functions/realtime-cfo-agent/index.ts` — Full hybrid routing implementation
- `supabase/functions/cfo-agent-api/index.ts` — Same hybrid routing for external API
- `src/components/cfo-agent/types.ts` — New SSE events + routing types
- `src/components/cfo-agent/RealtimeCFOAgent.tsx` — Handles new routing SSE events
- `src/components/cfo-agent/AgentThinkingPanel.tsx` — Route badges, dynamic phases per path
