

# Munimji -- Complete Remaining API Tasks

## Summary

This plan covers all 16 remaining API-only items from the Munimji plan. Since the user requested API-only changes (no frontend), all work is in edge functions and shared modules. Items are grouped into batches for efficient implementation.

---

## Batch 1: Follow-up Detection + Cache Invalidation Map (Small, Quick Wins)

### Task 3: Follow-up Detection (Strategy 3)

Add short-message detection to both agents. If the user sends a message with fewer than 5 words AND there is conversation history, reuse the last tool group instead of re-classifying.

**Changes:**
- `supabase/functions/_shared/tool-groups.ts` -- Add a new exported function `detectFollowUp(query, conversationHistory)` that:
  - Checks if query has fewer than 5 words
  - Checks if conversation history exists (at least 1 prior exchange)
  - Returns `{ isFollowUp: true, reuseToolGroup: string[] }` or `{ isFollowUp: false }`
  - Extracts tool names from the last assistant message metadata if available

- `supabase/functions/realtime-cfo-agent/index.ts` -- Before the keyword-based tool selection (LAYER 2), check for follow-up. If detected, skip keyword matching and use the previous tool group directly.

- `supabase/functions/cfo-agent-api/index.ts` -- Same change.

### Task 5: Cache Invalidation Map

Replace the current blanket invalidation (clear ALL caches on any write) with a targeted map per the plan document.

**Changes:**
- `supabase/functions/_shared/tool-groups.ts` -- Add a `CACHE_INVALIDATION_MAP` constant:
  ```
  create_invoice -> clear: profit, revenue, aging, receivable, balance, trial, cash, kpi
  create_bill -> clear: profit, expense, aging, payable, balance, trial, cash, kpi
  record_payment / create_payment -> clear: aging, receivable, payable, balance, cash, bank, kpi
  create_expense -> clear: profit, expense, balance, trial, cash, kpi
  journal_entry -> clear: profit, balance, trial, ledger
  bank_transaction -> clear: bank, cash, balance, reconcil
  gst_action -> clear: gst, tax, itc, filing
  unknown -> clear ALL (safe fallback)
  ```

- `supabase/functions/realtime-cfo-agent/response-cache.ts` -- Update `invalidateCacheForEntity()` to use the map: instead of deleting all cache entries, match cache `path` field against invalidation targets.

- `supabase/functions/cfo-agent-api/response-cache.ts` -- Same change (or import from shared if we refactor).

---

## Batch 2: Conversation History Summarization

### Task 4: Conversation History Summarization

After 20 messages in a conversation, summarize older ones with a cheap LLM call and keep summary + last 10 messages.

**Changes:**
- `supabase/functions/_shared/conversation-summarizer.ts` -- New shared module:
  - `shouldSummarize(messageCount)` -- returns true if count > 20
  - `summarizeHistory(supabase, conversationId, messages, llmConfig, reqId)`:
    - Takes messages older than the last 10
    - Calls the LLM (cheap model, max 512 tokens) with a summarization prompt
    - Updates `unified_conversations.summary` with the result
    - Returns the trimmed messages array (summary + last 10)

- Both `realtime-cfo-agent/index.ts` and `cfo-agent-api/index.ts`:
  - After loading conversation history, call `shouldSummarize()`
  - If true, call `summarizeHistory()` to trim the context
  - Use the trimmed history for the LLM call instead of full history

---

## Batch 3: Exception Handling (Progressive Fields, Duplicate Detection, Hindi Numbers)

### Task 6: Progressive Field Collection

Add system prompt instructions so the LLM asks only for missing required fields and uses smart defaults.

**Changes:**
- `supabase/functions/realtime-cfo-agent/model-selector.ts` -- Update `SYSTEM_PROMPTS.bookkeeper` to include a progressive field collection section:
  ```
  PROGRESSIVE FIELD COLLECTION:
  When creating records, apply these rules:
  - Customer/vendor name: ALWAYS ASK (cannot guess)
  - Amount: ALWAYS ASK (cannot guess)
  - Items/description: ALWAYS ASK (need at least one line)
  - Date: DEFAULT to today if not specified
  - Due date: DEFAULT to Net 30 if not specified
  - Tax rate: DEFAULT from HSN/SAC code or 18% GST
  - Invoice/bill number: DEFAULT auto-generate
  - Currency: DEFAULT to entity currency (INR/₹)
  - Bank account: DEFAULT to primary account
  
  Ask ONLY for what is missing. Never ask for fields you can default.
  ```

- `supabase/functions/cfo-agent-api/model-selector.ts` -- Same update.

### Task 7: Duplicate Detection

Add duplicate detection instructions to the system prompt for bookkeeper mode.

**Changes:**
- Same files as Task 6 -- Add to `SYSTEM_PROMPTS.bookkeeper`:
  ```
  DUPLICATE DETECTION:
  Before ANY create operation, check for duplicates:
  - Customer: Search by GSTIN, PAN, or fuzzy name match (90%+)
  - Invoice: Search by invoice number, or same customer + amount + date
  - Payment: Search by reference number, or same payer + amount + date
  - Vendor: Search by GSTIN, PAN, or fuzzy name match
  
  If a potential duplicate is found, WARN the user and ask whether to
  use the existing record or create a new one anyway.
  ```

### Task 8: Hindi Number Parsing

Add a Hindi number parser to the shared module that converts Hindi number words to numeric values before sending to the LLM.

**Changes:**
- `supabase/functions/_shared/hindi-number-parser.ts` -- New module:
  - `parseHindiNumbers(query)` -- Replaces Hindi number words with digits:
    - ek = 1, do = 2, teen = 3, char = 4, paanch = 5, ... das = 10
    - gyarah = 11, ... bees = 20, ... sau = 100
    - hazaar = 1,000, lakh = 1,00,000, crore = 1,00,00,000
    - Compound: "paanch lakh" -> 500000, "do crore" -> 20000000
    - Special: "dedh lakh" -> 150000, "dhai lakh" -> 250000, "saade teen lakh" -> 350000
  - Returns `{ parsed: string, replacements: { original: string, value: number }[] }`

- Both agent `index.ts` files: Call `parseHindiNumbers(query)` early in the pipeline. If replacements are made, append the numeric interpretations to the user message for the LLM.

---

## Batch 4: Context/Pronoun Resolution + Dangerous Action Confirmation

### Task 9: Context/Pronoun Resolution

Add system prompt instructions for pronoun resolution using conversation history.

**Changes:**
- Both `model-selector.ts` files -- Add to all system prompts:
  ```
  CONTEXT RESOLUTION:
  - "it", "this", "that" -> refers to the last entity mentioned in conversation
  - "Send it" -> send the last created/viewed document
  - "Do the same for [X]" -> repeat the last action with a different entity
  - "Actually, make it [amount]" -> update the pending/last amount
  - "Never mind" / "Cancel" -> discard any pending action
  - "Haan" / "Kar do" / "Yes" -> confirm and execute the last proposed action
  - "Also show by month" -> reuse last report type with month breakdown
  ```

### Task 10: Dangerous Action Confirmation

Add tiered confirmation instructions to the bookkeeper system prompt.

**Changes:**
- Both `model-selector.ts` files -- Add to `SYSTEM_PROMPTS.bookkeeper`:
  ```
  DANGEROUS ACTION TIERS:
  - LOW (edit, update): Execute immediately, show result
  - MEDIUM (reverse journal, cancel): Ask single confirmation with impact summary
  - HIGH (delete, void, merge): Show linked records affected, ask confirmation
  - CRITICAL (file GST, close FY, bulk delete): Show full checklist, require typed confirmation
  ```

---

## Batch 5: Advanced Enrichments

### Task 11: Trend Analysis Enrichment

Already partially implemented in `enrichment-auto-apply.ts`. Enhance the system prompt to be more specific.

**Changes:**
- Both `model-selector.ts` files -- Add to `SYSTEM_PROMPTS.cfo`:
  ```
  TREND ENRICHMENT:
  When presenting financial reports with time-series data:
  - Always calculate and show % change vs previous period
  - Use arrows: ▲ for increase, ▼ for decrease, ► for flat (<1% change)
  - Example: "Revenue: ₹45.2L (▲ 12.8% vs last quarter)"
  ```

### Task 12: Anomaly Detection Enrichment

**Changes:**
- Both `model-selector.ts` files -- Add to `SYSTEM_PROMPTS.cfo`:
  ```
  ANOMALY DETECTION:
  When analyzing expense or transaction data:
  - Flag any item that is 2x+ higher than its historical average
  - Use warning prefix: "⚠ [Item] is [X]x higher than average"
  - Suggest possible explanations or ask if it was intentional
  ```

### Task 13: Projection/Benchmark Enrichment

**Changes:**
- Both `model-selector.ts` files -- Add to `SYSTEM_PROMPTS.cfo`:
  ```
  PROJECTIONS & BENCHMARKS:
  - Cash flow: Calculate runway ("At this burn rate, runway is X months")
  - Margins: Compare to industry averages when available
  - Use emoji prefixes: 🔮 for projections, 📊 for benchmarks
  ```

---

## Batch 6: RL Pipeline Enhancements

### Task 14: Adaptive Confidence Thresholds

Use `intent_routing_stats` data to dynamically adjust the confidence threshold per intent.

**Changes:**
- `supabase/functions/_shared/rl-logger.ts` -- Add new function:
  - `getAdaptiveThreshold(supabase, intentId, defaultThreshold)`:
    - Query `intent_routing_stats` for this intent
    - If success rate > 90% and total_attempts > 20: lower threshold by 0.05 (min 0.70)
    - If success rate < 70% and total_attempts > 10: raise threshold by 0.05 (max 0.95)
    - Otherwise: return default threshold (0.85)

- Both agent `index.ts` files: Replace the hardcoded `CONFIDENCE_THRESHOLD = 0.85` with a call to `getAdaptiveThreshold()` for the matched intent.

### Task 15: Implicit Signal Detection

Detect rephrases (negative signal), follow-ups (positive signal), and actions taken (strong positive).

**Changes:**
- `supabase/functions/_shared/rl-logger.ts` -- Add new function:
  - `detectImplicitSignals(query, conversationHistory)`:
    - Rephrase detection: If query is semantically similar to the previous user message (same keywords, different phrasing) -> `{ rephrase: true, signal: -1 }`
    - Follow-up detection: If query builds on previous response -> `{ followUp: true, signal: +1 }`
    - Action taken: If query contains action verbs after a read response -> `{ actionTaken: true, signal: +2 }`
    - Returns signals object to store in `feedback_log.implicit_signals`

- Both agent `index.ts` files: Call `detectImplicitSignals()` and pass result to `logFeedback()`.

### Task 16: Prompt Caching

Since the system currently uses Azure OpenAI (not Anthropic), true Anthropic-style prompt caching is not available. However, we can optimize by structuring the system prompt to be stable across requests.

**Changes:**
- Both `model-selector.ts` files: Restructure system prompts to separate static portions (cacheable) from dynamic portions (entity context, available tools). Add a comment documenting that if/when switching to Anthropic, the static block should get `cache_control: { type: "ephemeral" }`.
- This is a documentation/preparation task with minimal code change.

---

## Batch 7: Agent Consolidation (HIGH priority, saved for last due to size)

### Task 1: Consolidate to Single munimji-agent

This is the largest task. Merge `cfo-agent-api` and `realtime-cfo-agent` into the existing `munimji-agent` edge function.

**Changes:**
- `supabase/functions/munimji-agent/index.ts` -- Rewrite to be the unified agent:
  - Support both authenticated (API) and unauthenticated (realtime) modes
  - Check for `Authorization` header: if present, validate JWT (API mode); if absent, run in realtime mode
  - All shared logic (cache, classification, tool selection, MCP, LLM call, enrichments, feedback, RL logging) lives in one place
  - Import all shared modules from `_shared/`
  - SSE streaming for both modes

- Keep `cfo-agent-api` and `realtime-cfo-agent` as thin wrappers that forward to `munimji-agent` for backward compatibility, OR update frontends to point to `munimji-agent`.

- Move `classifier.ts`, `model-selector.ts`, `enrichment-auto-apply.ts`, `feedback-logger.ts`, `response-cache.ts`, `mcp-client.ts` to `_shared/` directory so `munimji-agent` can import them.

---

## Implementation Order

1. Batch 1 (Follow-up + Cache map) -- quick wins
2. Batch 3 (Hindi numbers + Progressive fields + Duplicate detection) -- exception handling
3. Batch 4 (Context resolution + Dangerous actions) -- prompt enhancements
4. Batch 5 (Enrichments: trends, anomaly, projections) -- prompt enhancements
5. Batch 2 (Conversation summarization) -- new shared module
6. Batch 6 (Adaptive thresholds + Implicit signals + Prompt caching prep) -- RL pipeline
7. Batch 7 (Agent consolidation) -- largest refactor, done last

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/functions/_shared/hindi-number-parser.ts` | Hindi word to number conversion |
| `supabase/functions/_shared/conversation-summarizer.ts` | History summarization after 20 messages |

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/_shared/tool-groups.ts` | Add follow-up detection, cache invalidation map |
| `supabase/functions/_shared/rl-logger.ts` | Add adaptive thresholds, implicit signal detection |
| `supabase/functions/realtime-cfo-agent/index.ts` | Wire follow-up, Hindi parsing, summarization, adaptive thresholds, signals |
| `supabase/functions/cfo-agent-api/index.ts` | Same wiring |
| `supabase/functions/realtime-cfo-agent/model-selector.ts` | Enhanced prompts (progressive fields, duplicates, context, tiers, enrichments) |
| `supabase/functions/cfo-agent-api/model-selector.ts` | Same prompt changes |
| `supabase/functions/realtime-cfo-agent/response-cache.ts` | Targeted cache invalidation |
| `supabase/functions/cfo-agent-api/response-cache.ts` | Same |
| `supabase/functions/munimji-agent/index.ts` | Full rewrite as unified agent |
| `.lovable/plan.md` | Mark all items as complete |

