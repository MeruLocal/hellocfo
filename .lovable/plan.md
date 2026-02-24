

# Fix: "Give me all invoices" returning 0 records

## Root Cause

When a user asks "Give me all invoices", the deterministic list path kicks in and calls `get_all_invoices` with empty args. The `injectAllRecordsDefaults` function then injects `status: 'all'` into the tool arguments if the tool's schema has a status field. However, the HelloBooks MCP tool likely does not recognize `'all'` as a valid status enum value, so it filters down to 0 records.

Additionally, the tool call logs the injected args but the response content (the actual MCP tool output) is not logged, making debugging difficult.

## Fix Strategy

### 1. Fix `injectAllRecordsDefaults` in `index.ts` (lines 743-776)

Change the logic so that instead of injecting `status: 'all'`, it simply **omits** the status filter entirely (don't set it at all). Most list APIs return all records when no status filter is provided. Only inject `status: 'all'` if the tool's schema enum explicitly contains `'all'` as a value.

Current logic (problematic):
```text
if (enumAllowsAll) result[key] = 'all';
```

Updated logic:
```text
// Only inject 'all' if the enum explicitly lists it
if (enumValues.length > 0) {
  const allValue = enumValues.find(v => String(v).toLowerCase() === 'all');
  if (allValue) result[key] = allValue;
  // Otherwise: leave status unset so the API returns everything
}
// If no enum defined: leave status unset (don't inject 'all')
```

### 2. Add diagnostic logging for tool results

In the `executeToolCall` function (around line 1586), add a log line that shows a truncated version of the tool result so we can see what the MCP tool actually returns:

```text
console.log(`[api] Tool ${toolName} result preview: ${result.slice(0, 500)}`);
```

### 3. Add diagnostic logging for deterministic path args

In the deterministic list loop (line 1715), log the actual args that are being sent after all injections:

```text
console.log(`[api] Deterministic list ${pick.toolName} — final args: ${JSON.stringify(args)}`);
```

This requires a minor refactor to surface the final args from `executeToolCall`.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/cfo-agent-api/index.ts` | Fix `injectAllRecordsDefaults` to not inject unsupported `status: 'all'`; add result logging in `executeToolCall` |

## Expected Outcome

After this fix, "Give me all invoices" will call `get_all_invoices` without an artificial `status: 'all'` filter, allowing the MCP tool to return all records as expected. The added logging will help diagnose any future issues with tool responses.

