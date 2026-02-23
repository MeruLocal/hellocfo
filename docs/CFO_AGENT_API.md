# CFO Agent API - Frontend Implementation Guide

## 1) Endpoint

- Base URL: `https://ptftkblnvsybcggbecau.supabase.co`
- Path: `/functions/v1/cfo-agent-api`
- Method: `POST`
- Response: `text/event-stream` (SSE)

## 2) Required Headers

| Header | Required | Value |
|---|---|---|
| `Content-Type` | Yes | `application/json` |
| `Authorization` | Yes | `Bearer <supabase_user_access_token>` |
| `apikey` | Yes | `<supabase_publishable_key>` |
| `H-Authorization` | Conditional | `Bearer <hellobooks_token>` (required for bookkeeping/data tool calls) |

## 3) Request Body

```json
{
  "query": "Show my overdue invoices",
  "conversationId": "9de4f8fa-8f3f-4b20-9bde-6e3c68a6e91f",
  "conversationHistory": [],
  "entityId": "ENTITY-001",
  "orgId": "ORG-001",
  "stream": true
}
```

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `query` | string | Yes | User message |
| `conversationId` | string | Recommended | Keep stable per chat thread |
| `conversationHistory` | array | Optional | Safe to send; server prefers DB history for same `conversationId` |
| `entityId` | string | Recommended | Used for entity scoping |
| `orgId` | string | Recommended for MCP | Required for HelloBooks MCP tool calls |
| `stream` | boolean | Optional | Keep `true` for SSE |

## 4) Conversation Continuity (Critical)

Use **one stable `conversationId` for the whole chat thread**.

Recommended:
1. Generate a UUID on frontend when user starts a new chat.
2. Send that `conversationId` on every message.
3. Also store `conversationId` received in SSE `connected`/`complete` event payloads (server now includes it).

If `conversationId` changes between messages, history appears split/incomplete.

## 5) SSE Format

Server emits:

```text
event: <event_name>
data: {"type":"<event_name>","data":{...},"timestamp":"..."}
```

Important event payloads:

### `connected`

```json
{
  "type": "connected",
  "data": {
    "sessionId": "<conversation_id>",
    "conversationId": "<conversation_id>",
    "userId": "<auth_user_id>",
    "messageId": "<message_id>"
  }
}
```

### `response_chunk`

```json
{
  "type": "response_chunk",
  "data": {
    "text": "...streamed response text..."
  }
}
```

### `complete`

```json
{
  "type": "complete",
  "data": {
    "conversationId": "<conversation_id>",
    "success": true,
    "query": "Show my overdue invoices",
    "path": "llm",
    "response": "...final response...",
    "executionTime": "1.24s"
  }
}
```

## 6) Minimal Frontend Integration

```ts
interface AgentEvent {
  type: string;
  data: any;
  timestamp: string;
}

async function sendToCfoAgent(params: {
  query: string;
  conversationId: string;
  entityId?: string;
  orgId?: string;
  accessToken: string;
  apiKey: string;
  hAuthToken?: string;
  onEvent: (evt: AgentEvent) => void;
}) {
  const res = await fetch(
    "https://ptftkblnvsybcggbecau.supabase.co/functions/v1/cfo-agent-api",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${params.accessToken}`,
        "apikey": params.apiKey,
        ...(params.hAuthToken ? { "H-Authorization": `Bearer ${params.hAuthToken}` } : {}),
      },
      body: JSON.stringify({
        query: params.query,
        conversationId: params.conversationId,
        entityId: params.entityId,
        orgId: params.orgId,
        stream: true,
      }),
    }
  );

  if (!res.ok || !res.body) {
    throw new Error(`Request failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";

    for (const frame of frames) {
      const dataLine = frame
        .split("\n")
        .find((line) => line.startsWith("data: "));
      if (!dataLine) continue;

      const evt = JSON.parse(dataLine.slice(6)) as AgentEvent;
      params.onEvent(evt);
    }
  }
}
```

## 7) Error Handling

- HTTP `401`: invalid/missing user token
- SSE `error` event: recoverable processing/tool/service issue
- Always stop loading state on either `complete` or `error`

## 8) History APIs

For listing/loading saved chats, use:
- `GET /functions/v1/get-conversations?entityId=...`
- `GET /functions/v1/get-conversations?conversationId=...`

See `docs/CONVERSATION_HISTORY_API.md` for complete details.
