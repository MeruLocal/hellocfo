
## Root Cause: Wrong Variable Used for MCP Tool Calls

The `cfo-agent-api/index.ts` has a **split-brain variable bug** introduced during the migration from the old `MCPClient` to the new `StreamableMCPClient`:

- `mcpClientInstance` is correctly set to the `StreamableMCPClient` instance when MCP connects successfully (line 295-296)
- But `mcpClient` (old variable, type `MCPClient`) is declared on line 264 and **never assigned** — it stays `null` forever
- All the **guards** that gate actual tool calls use `if (mcpClient)` → always false → tools NEVER run
- The actual `.callTool()` calls correctly reference `mcpClientInstance!` but they're inside dead code blocks

This is why the chatbot says "MCP not connected" — MCP IS connected and tools ARE loaded, but the wrong null variable is checked before calling them.

## Exact Lines to Fix in `supabase/functions/cfo-agent-api/index.ts`

### Fix 1 — Line 264: Remove the dead `mcpClient` variable
```typescript
// BEFORE (broken):
let mcpClient: MCPClient | null = null;

// AFTER (fixed):
// (remove this line entirely — mcpClientInstance is used instead)
```

### Fix 2 — Line 358: Fast-path tool execution guard
```typescript
// BEFORE (broken):
if (mcpClient && pipeline.length > 0) {

// AFTER (fixed):
if (mcpClientInstance && pipeline.length > 0) {
```

### Fix 3 — Line 523: LLM-path tool call guard
```typescript
// BEFORE (broken):
if (mcpClient) {

// AFTER (fixed):
if (mcpClientInstance) {
```

### Fix 4 — Line 546: Else branch for missing MCP
```typescript
// BEFORE (broken):
} else {
  messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ error: 'MCP not connected' }) });
}

// AFTER (fixed):
} else {
  messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ error: 'MCP not available' }) });
}
```

### Fix 5 — Line 682: Cleanup call
```typescript
// BEFORE (broken):
mcpClient?.close();

// AFTER (fixed):
mcpClientInstance?.close();
```

## Impact

After these fixes:
- "Give me all bills" → MCP connects → tools loaded → LLM selects `get_all_bills` → tool call runs → real data returned
- Fast-path intents will also execute their MCP pipeline steps correctly
- No new files, no schema changes, no secrets changes — purely a variable name fix
- The function will be redeployed automatically
