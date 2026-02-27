

## Problem: Only 5 of 10 Intents Generated

### Root Cause
The `max_tokens` parameter in `supabase/functions/generate-batch-intents/index.ts` (line 95) is set to **8,192**. Each fully-populated intent (with 8-10 training phrases, entities, pipeline nodes, enrichments, and response config) consumes roughly 800-1,200 tokens. For 10 intents, the AI needs ~10,000-12,000 output tokens. The response gets truncated mid-JSON around intent #5, and the JSON repair logic only recovers the complete intents before the cut.

### Fix

**File:** `supabase/functions/generate-batch-intents/index.ts`

1. **Increase `max_tokens` from 8,192 to 16,384** (line 95) to give the AI enough room for 10 full intents.

2. **Add a post-generation retry**: If the AI returns fewer intents than requested (e.g., only 5 of 10), automatically make a second call asking for just the missing count, passing the already-generated names as "existing" to avoid duplicates. This handles edge cases where the AI still truncates.

3. **Switch model to `google/gemini-2.5-flash`** -- already in use, which is good. No model change needed.

### Technical Changes

**`supabase/functions/generate-batch-intents/index.ts`**:

- Line 95: Change `max_tokens: 8192` to `max_tokens: 16384`
- After line 342 (where parsed intents are counted): Add retry logic:
  - If `uniqueIntents.length < intentCount`, log a warning
  - Make a second `callLovableAI` call requesting `intentCount - uniqueIntents.length` more intents, with the already-generated names added to the exclusion list
  - Merge the results
- This ensures the user always gets the full 10 intents even if the first call runs slightly short

### What This Fixes
- 10 intents will be generated as requested instead of truncating at 5
- Retry logic provides a safety net for edge cases

### What Does NOT Change
- No prompt changes needed (the prompt already asks for the correct count)
- No frontend changes needed
- No database changes needed
