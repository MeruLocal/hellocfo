# Chat Agent API - Frontend Implementation Guide

## 1) Endpoint

- Base URL: `https://ptftkblnvsybcggbecau.supabase.co`
- Path: `/functions/v1/chat-agent-api`
- Method: `POST`
- Response: `text/event-stream` (SSE)

This endpoint is designed to be request/response compatible with `cfo-agent-api`.

## 2) Required Headers

| Header | Required | Value |
|---|---|---|
| `Content-Type` | Yes | `application/json` |
| `Authorization` | Yes | `Bearer <supabase_user_access_token>` |
| `apikey` | Yes | `<supabase_publishable_key>` |
| `H-Authorization` | Conditional | `Bearer <hellobooks_token>` (required for tool/data actions via HelloBooks MCP) |

## 3) Request Body

```json
{
  "query": "Show my overdue invoices",
  "conversationId": "9de4f8fa-8f3f-4b20-9bde-6e3c68a6e91f",
  "conversationHistory": [],
  "entityId": "ENTITY-001",
  "orgId": "ORG-001",
  "stream": true,
  "attachments": [
    {
      "name": "invoice.pdf",
      "url": "https://...",
      "type": "application/pdf"
    }
  ]
}
```

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `query` | string | Yes | User message |
| `conversationId` | string | Recommended | Keep stable per chat thread |
| `conversationHistory` | array | Optional | Safe to send; server prefers DB history for same `conversationId` |
| `entityId` | string | Recommended | Entity scope for MCP tools |
| `orgId` | string | Recommended for MCP | Org scope for MCP tools |
| `stream` | boolean | Optional | Keep `true` (response is SSE stream) |
| `attachments` | array | Optional | Supports images/docs/text files |

### Attachment type

```ts
interface Attachment {
  name: string;
  url: string;
  type: string;
}
```

## 4) Conversation Continuity (Critical)

Use one stable `conversationId` for the whole thread.

Recommended:
1. Generate UUID when user starts a new chat.
2. Send same `conversationId` on every message.
3. If server returns `conversationId` in `connected`/`complete`, keep using that value.

## 5) SSE Envelope

Each event is emitted as:

```text
event: <event_name>
data: {"type":"<event_name>","data":{...},"timestamp":"..."}
```

## 6) Main SSE Events

Expected event names used by frontend:

- `connected`
- `understanding_started`
- `route_started`
- `route_classified`
- `tools_filtered`
- `executing_tool`
- `tool_result`
- `response_generating`
- `response_chunk`
- `complete`
- `error`

Optional/internal events that may appear:

- `extraction_state`
- `conversation_save_error`

### `connected` example

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

### `response_chunk` example

```json
{
  "type": "response_chunk",
  "data": {
    "text": "...chunk text..."
  }
}
```

### `complete` example

```json
{
  "type": "complete",
  "data": {
    "conversationId": "<conversation_id>",
    "success": true,
    "query": "Show my overdue invoices",
    "path": "llm",
    "category": "unified",
    "response": "...final response...",
    "toolResults": [
      { "tool": "get_all_invoices", "success": true, "attempts": 1 }
    ],
    "executionTime": "1.42s"
  }
}
```

### `error` example

```json
{
  "type": "error",
  "data": {
    "message": "I couldn't complete this request right now. Please try again in a moment.",
    "code": "PROCESSING_ERROR"
  }
}
```

## 7) Frontend Streaming Example (POST + headers)

```ts
interface AgentEvent {
  type: string;
  data: any;
  timestamp: string;
}

export async function sendToChatAgent(params: {
  query: string;
  conversationId: string;
  accessToken: string;
  apiKey: string;
  entityId?: string;
  orgId?: string;
  hAuthToken?: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  attachments?: Array<{ name: string; url: string; type: string }>;
  onEvent: (evt: AgentEvent) => void;
}) {
  const res = await fetch(
    "https://ptftkblnvsybcggbecau.supabase.co/functions/v1/chat-agent-api",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${params.accessToken}`,
        "apikey": params.apiKey,
        ...(params.hAuthToken
          ? { "H-Authorization": `Bearer ${params.hAuthToken}` }
          : {}),
      },
      body: JSON.stringify({
        query: params.query,
        conversationId: params.conversationId,
        conversationHistory: params.conversationHistory ?? [],
        entityId: params.entityId,
        orgId: params.orgId,
        stream: true,
        attachments: params.attachments ?? [],
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

## 8) Behavior Notes for Frontend

- Greeting/small talk can run without MCP tools.
- Accounting/tool queries require valid `H-Authorization` + `entityId` + `orgId`; otherwise stream returns a graceful MCP error response.
- Attachments are supported:
  - Images -> multimodal image input
  - PDF/Office/binary -> file input
  - CSV/TXT -> injected as text context

## 9) Error Handling

- HTTP `401`: missing/invalid user bearer token.
- HTTP `400`: invalid JSON or missing required `query`.
- Stream `error` event: processing/runtime issue.
- Always stop loading state on `complete` or `error`.

## 10) Migration from `cfo-agent-api`

- Change only endpoint path from `/functions/v1/cfo-agent-api` to `/functions/v1/chat-agent-api`.
- Keep same request payload shape.
- Keep same SSE parser logic.
