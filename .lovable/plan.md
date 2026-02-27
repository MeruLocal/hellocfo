
# Replace Semantic LLM Tool Selection with tool_registry DB Lookup + Hard Cap

## Summary
Remove the LLM-based semantic tool selector (Gemini Flash Lite call) and replace it with a structured `tool_registry` database lookup via an RPC function. Enforce a hard cap of 40 tools and add an emergency fallback set. Every instance of `mcpTools.map(t => t.name)` that sends all 698 tools will be replaced.

## Step 1: Create RPC function via database migration

Create `match_tools_from_registry` SQL function:

```sql
CREATE OR REPLACE FUNCTION match_tools_from_registry(
  p_modules TEXT[],
  p_keywords TEXT[],
  p_exclude TEXT[] DEFAULT '{}',
  p_limit INT DEFAULT 20
) RETURNS TABLE(tool_name TEXT, module TEXT, match_source TEXT) AS $$
  SELECT tool_name, module,
    CASE WHEN module = ANY(p_modules) THEN 'module' ELSE 'keyword' END as match_source
  FROM tool_registry
  WHERE is_active = true
    AND (module = ANY(p_modules) OR keywords && p_keywords)
    AND tool_name != ALL(p_exclude)
  ORDER BY
    CASE WHEN module = ANY(p_modules) THEN 0 ELSE 1 END,
    tool_name
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;
```

## Step 2: Delete `supabase/functions/_shared/semantic-tool-selector.ts`

Remove the entire file -- no longer needed.

## Step 3: Update `supabase/functions/_shared/tool-groups.ts`

- Remove `getSemanticCandidates()` function (lines 463-471)
- Add constants and helper:
  - `HARD_CAP_TOOLS = 40`
  - `EMERGENCY_FALLBACK_TOOLS` array (8 safe default tools)
  - `extractKeywords(query)` helper
  - `lookupToolsFromRegistry(supabase, query, matchedCategories, alreadySelected, reqId)` async function that calls the RPC
- Update comment at line 453-454 referencing semantic matching

## Step 4: Update `supabase/functions/cfo-agent-api/index.ts`

All `mcpTools.map(t => t.name)` occurrences replaced:

- **Line 9**: Remove `import { selectToolsSemantically }` 
- **Line 6**: Remove `getSemanticCandidates` from import
- **Line 3-8**: Add `lookupToolsFromRegistry`, `HARD_CAP_TOOLS`, `EMERGENCY_FALLBACK_TOOLS` to imports
- **Lines 1375-1380** (`SIMPLE_DIRECT_LLM_MODE` block): Replace `mcpTools.map(t => t.name)` with `EMERGENCY_FALLBACK_TOOLS` (or keep a larger static set capped at 40)
- **Lines 1396-1410** (semantic matching block): Replace with `lookupToolsFromRegistry()` call
- **Lines 1415-1420** (fallback to ALL tools): Replace with `EMERGENCY_FALLBACK_TOOLS`
- Add priority-ordered merge + hard cap before `buildOpenAIToolsFromMcp`:
  ```
  const prioritized = [...intentTools, ...categoryTools, ...registryTools];
  const deduped = [...new Set(prioritized)];
  const capped = deduped.slice(0, HARD_CAP_TOOLS);
  if (capped.length === 0) capped = [...EMERGENCY_FALLBACK_TOOLS];
  ```

## Step 5: Update `supabase/functions/realtime-cfo-agent/index.ts`

Same pattern as Step 4:

- **Line 8**: Remove `getSemanticCandidates` from import
- **Line 11**: Remove `import { selectToolsSemantically }`
- **Line 599**: Replace `mcpTools.map((t) => t.name)` in `SIMPLE_DIRECT_LLM_MODE` block
- **Lines 602-617**: Replace semantic matching block with `lookupToolsFromRegistry()` call
- **Lines 621-626**: Replace fallback-to-all-tools with `EMERGENCY_FALLBACK_TOOLS`
- Add same priority merge + hard cap logic

## Step 6: Update re-export files

Both `cfo-agent-api/tool-groups.ts` and `realtime-cfo-agent/tool-groups.ts`:
- Remove `getSemanticCandidates` from re-exports
- Add `lookupToolsFromRegistry`, `HARD_CAP_TOOLS`, `EMERGENCY_FALLBACK_TOOLS`

## Occurrences of `mcpTools.map(t => t.name)` being fixed

| File | Line | Current behavior | New behavior |
|------|------|-----------------|-------------|
| `cfo-agent-api/index.ts` | 1377 | SIMPLE_DIRECT_LLM_MODE sends all 698 | Capped to 40 or emergency fallback |
| `cfo-agent-api/index.ts` | 1418 | Zero-match fallback sends all 698 | Emergency fallback (8 tools) |
| `realtime-cfo-agent/index.ts` | 599 | SIMPLE_DIRECT_LLM_MODE sends all | Capped to 40 or emergency fallback |
| `realtime-cfo-agent/index.ts` | 624 | Zero-match fallback sends all | Emergency fallback (8 tools) |
| `test-with-mcp/index.ts` | 334 | Logging only (harmless) | No change needed |
| `_shared/tool-groups.ts` | 450 | Availability check (harmless) | No change needed |
