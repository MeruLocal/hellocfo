

## Problem

When you ask "Give me invoices", the agent returns "No records found for current filters" even though invoices exist in the account.

## Root Cause

The LLM (GPT) is providing **every possible parameter** with empty/default values when calling the `get_invoices` tool:

```text
status: ""          (empty string - treated as a filter)
statusList: []      (empty array)
invoiceNumber: ""   (empty string - treated as a filter)
currency: ""        (empty string)
minExchangeRate: 0  (zero - treated as a filter)
...and 20+ more empty params
```

The HelloBooks MCP server interprets these as **active filters** rather than "no filter", so it returns zero results. The `sanitizeToolArgs` function currently only removes keys that aren't in the schema -- it does NOT strip empty/default values.

## Fix

### Step 1: Add empty-value stripping to `sanitizeToolArgs`

**File:** `supabase/functions/cfo-agent-api/index.ts`

Update `sanitizeToolArgs` to strip parameters that have "empty" values (empty strings, empty arrays, zero numbers) unless they are booleans or explicitly required by the schema. This ensures only meaningful filters reach the MCP server.

Values to strip:
- Empty strings: `""`
- Empty arrays: `[]`
- Zero numbers: `0` (except for boolean fields)

Values to keep:
- Booleans (`false` is a valid filter like `isArchived: false`)
- Non-empty strings, non-empty arrays, non-zero numbers
- Required fields (per the tool schema)

### Step 2: Redeploy `cfo-agent-api`

Deploy the updated function so the fix takes effect immediately.

### What does NOT change
- No changes to routing, classification, or tool selection logic
- No changes to the system prompt or response formatting
- No changes to the MCP client or pagination logic
- The flow remains exactly the same -- only the args are cleaned before being sent to MCP

