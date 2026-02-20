
## Problem Diagnosis

The edge function logs clearly show the root cause:

```
SSE URL (MCP_BASE_URL was: https://6af2-110-225-253-88.ngrok-free.app): 
https://6af2-110-225-253-88.ngrok-free.app/?entityid=...&orgid=...
```

Even though `MCP_BASE_URL` was supposedly updated, the function is still connecting to the old expired ngrok URL. This means either:
1. The secret update did not take effect before the function was last deployed, OR
2. The code has an old hardcoded fallback that overrides the secret

There is a **second critical problem**: looking at the user's provided MCP spec structure:
```
URL: base_url/?entityid=<entity_id>&orgid=<org_id>
Headers: { "Authorization": "Bearer <token>" }
```

The current code sends **extra headers** (`X-Entity-Id`, `X-Org-Id`) that are NOT in the spec. These may be confusing or conflicting with the MCP server's expected format.

Additionally, the SSE connection to MCP uses `base_url/?...` (the root path with query params), meaning the server's response `endpoint` event will contain a relative path like `/messages?session_id=xyz` - our code handles that, but only if the connection is actually established.

## Fix Plan

### 1. Remove the hardcoded old ngrok fallback URL
The code at line 118 has:
```typescript
const mcpBaseUrl = (Deno.env.get("MCP_BASE_URL") || "https://6af2-110-225-253-88.ngrok-free.app").replace(/\/+$/, "");
```
The fallback `"https://6af2-110-225-253-88.ngrok-free.app"` is the expired ngrok URL. Replace it with an empty string / clear error so we know when the secret is missing.

### 2. Remove extra headers not in the MCP spec
The current code adds `X-Entity-Id` and `X-Org-Id` as headers, but the spec only requires:
```
Authorization: Bearer <token>
```
Remove these extra headers from `mcpHeaders` — they may be causing issues.

### 3. Add raw SSE data logging
The function reads bytes but we never log what raw content was received. Add logging of the first chunk of bytes so we can see if the server is returning HTML, empty data, or actual SSE events.

### 4. Also fix the same old-URL fallback at line 261
```typescript
const base = Deno.env.get("MCP_BASE_URL") || "https://6af2-110-225-253-88.ngrok-free.app";
```
This is used when resolving relative `endpoint` event paths. Must be updated.

## Files to Change

**`supabase/functions/fetch-mcp-tools/index.ts`**

- Line 101-105: Remove `X-Entity-Id` and `X-Org-Id` from `mcpHeaders` — only keep `Authorization: Bearer <token>`
- Line 118: Replace old ngrok fallback with `""` and add a guard to fail fast with a clear error if `MCP_BASE_URL` is not set
- Line 261: Replace old ngrok fallback with correct `MCP_BASE_URL` env var (no hardcoded fallback)
- After line 250 (buffer decode): Add `console.log` of raw first chunk to diagnose what the server actually sends

## Technical Flow (After Fix)

```text
Client (Edge Function)                    MCP Server
       |                                      |
       |-- GET base_url/?entityid=X&orgid=Y ->|
       |   Headers: Authorization: Bearer T   |
       |                                      |
       |<-- 200 OK (text/event-stream) -------|
       |<-- event: endpoint                   |
       |    data: /messages?session_id=abc    |
       |                                      |
       |-- POST base_url/messages?session_id=abc + entityid + orgid
       |   Body: { jsonrpc initialize }       |
       |                                      |
       |<-- event: message                    |
       |    data: { id:1, result: {...} }     |
       |                                      |
       |-- POST notifications/initialized     |
       |-- POST tools/list                    |
       |                                      |
       |<-- event: message                    |
       |    data: { id:2, result:{tools:[]} } |
```
