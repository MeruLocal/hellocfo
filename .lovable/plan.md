
## Root Cause: `tools/list` Response is SSE, Not JSON

The logs confirm the MCP server (HelloBooks v2.14.2) uses the **Streamable HTTP** transport where EVERY response — including `tools/list` — is returned as `text/event-stream`, not plain JSON.

Current broken flow:
```text
[OK]  POST / → 200 text/event-stream (initialize)
[OK]  Read SSE stream → get initialize result (id=1)
[OK]  POST / with tools/list
[BUG] toolsResp.json() called → FAILS silently (it's SSE, not JSON!)
[---] tools = null → falls back to Classic SSE
[---] Classic SSE times out in waiting_endpoint (server doesn't emit endpoint event)
[503] Error returned
```

Fixed flow:
```text
[OK]  POST / → 200 text/event-stream (initialize)
[OK]  Read SSE stream → get initialize result (id=1)
[OK]  POST / with tools/list → returns SSE stream
[FIX] Read SSE stream from tools/list response → parse message event
[OK]  Extract data.result.tools
[200] Return tools list
```

## Files to Change

**`supabase/functions/fetch-mcp-tools/index.ts`**

### Fix 1: `readSSEForTools` (lines 241-257) — the core bug

Replace the broken `.json()` call with a function that reads the `tools/list` SSE response stream properly:

```typescript
if (data.result && data.id === 1) {
  // Got init response — send notifications/initialized then tools/list
  // tools/list response is ALSO SSE, not JSON — must read it as a stream
  const toolsResp = await fetch(baseUrl, {
    method: "POST",
    headers: { ... },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
  });
  if (toolsResp.ok && toolsResp.body) {
    // Read the SSE stream from this second POST
    const toolsFromSSE = await readSSEStreamForTools(reqId, toolsResp);
    if (toolsFromSSE) { tools = toolsFromSSE; break; }
  }
}
```

### Fix 2: Add `readSSEStreamForTools` helper

A small focused helper that reads a single SSE stream and returns the first `tools` array it finds:

```typescript
async function readSSEStreamForTools(reqId: string, response: Response): Promise<unknown[] | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + 8000; // 8s max for tools response

  while (Date.now() < deadline) {
    const result = await readWithTimeout(reader, 3000);
    if (!result || result.done) break;
    buffer += decoder.decode(result.value, { stream: true });
    const { events, remaining } = parseSSEBuffer(buffer);
    buffer = remaining;
    for (const ev of events) {
      if (ev.type === 'message') {
        try {
          const d = JSON.parse(ev.data);
          if (d.result?.tools) {
            console.log(`[${reqId}] tools/list SSE: got ${d.result.tools.length} tools`);
            reader.cancel();
            return d.result.tools;
          }
        } catch { /* continue */ }
      }
    }
  }
  reader.cancel();
  return null;
}
```

### Fix 3: Also send `notifications/initialized` between init and tools/list

Per MCP spec, after receiving the `initialize` result, the client MUST send `notifications/initialized` before calling `tools/list`. Add this step (fire-and-forget, no need to read its response):

```typescript
// After getting init result, notify server then request tools
await fetch(baseUrl, {
  method: "POST",
  headers: { ... },
  body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })
});
// Now request tools
const toolsResp = await fetch(baseUrl, { ... tools/list ... });
```

## Technical Summary

The fix is entirely within `readSSEForTools` and adds one small helper function. No new files, no secrets changes, no schema changes needed. The edge function will be redeployed automatically.

The Classic SSE path (GET-based) can remain as a fallback, though the Streamable HTTP path (POST-based) already works with HelloBooks v2.14.2 — it just needs the response read correctly as SSE.
