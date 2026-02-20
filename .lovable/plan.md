
## Root Cause: entity_id and org_id Not Being Injected Into get_bills Call

The logs confirm `get_bills` is called with empty args `{}`. This causes HelloBooks MCP to return unscoped/default data (only 2 sample bills) instead of the real data for the user's entity.

### Why Injection is Failing

In `cfo-agent-api/index.ts` (lines 527-531), the `entity_id` and `org_id` are only injected **conditionally** — if those parameter names appear in the tool's input schema `properties`:

```typescript
const toolSchema = mcpTools.find(t => t.name === toolName)?.inputSchema as { properties?: Record<string, unknown> } | undefined;
if (toolSchema?.properties) {
  if ('entity_id' in toolSchema.properties && mcpEntityId) toolInput.entity_id = mcpEntityId;
  if ('org_id' in toolSchema.properties && mcpOrgId) toolInput.org_id = mcpOrgId;
}
```

If the MCP server's tool schema for `get_bills` doesn't declare `entity_id` or `org_id` as explicit properties (which is common — many tools infer these from the URL query params already set during MCP connection), the injection block is skipped and the tool gets `{}` — returning only unscoped demo data.

### The Fix

**Unconditionally always inject `entity_id` and `org_id` into every tool call**, rather than checking if the schema mentions them. The MCP URL already has them as query params (they're also passed as args for redundancy). This is done in two places:

#### Fix 1 — LLM Path Tool Call (line 527-531, `cfo-agent-api/index.ts`)

```typescript
// BEFORE (broken — conditional injection):
const toolSchema = mcpTools.find(t => t.name === toolName)?.inputSchema as ...
if (toolSchema?.properties) {
  if ('entity_id' in toolSchema.properties && mcpEntityId) toolInput.entity_id = mcpEntityId;
  if ('org_id' in toolSchema.properties && mcpOrgId) toolInput.org_id = mcpOrgId;
}

// AFTER (fixed — always inject):
if (mcpEntityId) toolInput.entity_id = mcpEntityId;
if (mcpOrgId) toolInput.org_id = mcpOrgId;
```

#### Fix 2 — Fast Path Pipeline Tool Call (lines 370-374, `cfo-agent-api/index.ts`)

Same conditional injection bug exists in the fast-path pipeline loop:

```typescript
// BEFORE (broken):
const schema = mcpTool.inputSchema as { properties?: Record<string, unknown>; required?: string[] } | undefined;
if (schema?.properties) {
  if ('entity_id' in schema.properties && mcpEntityId) toolArgs.entity_id = mcpEntityId;
  if ('org_id' in schema.properties && mcpOrgId) toolArgs.org_id = mcpOrgId;
}

// AFTER (fixed):
if (mcpEntityId) toolArgs.entity_id = mcpEntityId;
if (mcpOrgId) toolArgs.org_id = mcpOrgId;
```

#### Fix 3 — Apply same fix to `realtime-cfo-agent/index.ts`

The same conditional injection pattern likely exists in the `realtime-cfo-agent` function. This should be updated to always inject entity_id and org_id as well.

### Also: Improve System Prompt for List Queries

Add an explicit instruction to the `cfo` and `bookkeeper` prompts telling the LLM to **present all records** returned by the tool, not just the first few. Sometimes the LLM abbreviates long lists.

Add to both `cfo` and `bookkeeper` system prompts in `model-selector.ts`:
```
- When the user asks for "all" records (all bills, all invoices, all customers), present EVERY record returned by the tool in the table — do NOT say "and X more" or truncate the list
- Show the complete dataset in a properly formatted table
```

### Files to Change

1. `supabase/functions/cfo-agent-api/index.ts` — Remove conditional injection, always pass entity_id/org_id
2. `supabase/functions/realtime-cfo-agent/index.ts` — Same fix
3. `supabase/functions/cfo-agent-api/model-selector.ts` — Add "show all records" instruction
4. `supabase/functions/realtime-cfo-agent/model-selector.ts` — Same prompt update

No schema changes, no secrets changes. Both functions will be redeployed after the fix.
