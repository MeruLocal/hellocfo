# Conversation History API - Frontend Implementation Guide

## 1) Endpoint

- Base URL: `https://ptftkblnvsybcggbecau.supabase.co`
- Path: `/functions/v1/get-conversations`
- Methods: `GET`, `POST`
- Response: `application/json`

## 2) Authentication

Recommended headers:

```http
Authorization: Bearer <supabase_user_access_token>
apikey: <supabase_publishable_key>
```

### User resolution behavior

The API resolves user scope as:
1. Authenticated user from `Authorization` token (preferred)
2. Fallback `userId` query/body parameter (for service/demo callers)

If both are provided and different, API returns `403`.

## 3) List Conversations

### Request

```http
GET /functions/v1/get-conversations?entityId=<ENTITY_ID>&limit=100&offset=0
```

You can also pass `userId` when not using user JWT:

```http
GET /functions/v1/get-conversations?userId=<USER_ID>&entityId=<ENTITY_ID>&limit=100&offset=0
```

### Query Params

| Param | Required | Default | Notes |
|---|---|---|---|
| `entityId` | No | - | Filter by entity |
| `userId` | No* | - | Needed only if no valid user JWT |
| `limit` | No | `100` | Min `1`, max `1000` |
| `offset` | No | `0` | Pagination offset |

### Response (`200`)

```json
[
  {
    "conversation_id": "9de4f8fa-8f3f-4b20-9bde-6e3c68a6e91f",
    "summary": "Show my overdue invoices",
    "message_count": 8,
    "created_at": "2026-02-23T10:20:00.000Z",
    "updated_at": "2026-02-23T10:24:00.000Z"
  }
]
```

## 4) Load Full Conversation

### Request

```http
GET /functions/v1/get-conversations?conversationId=<CONVERSATION_ID>
```

Optional filters:
- `entityId=<ENTITY_ID>`
- `userId=<USER_ID>` (only when no user JWT)

### Response (`200`)

```json
{
  "id": "internal-row-id",
  "conversation_id": "9de4f8fa-8f3f-4b20-9bde-6e3c68a6e91f",
  "entity_id": "ENTITY-001",
  "user_id": "f6a30...",
  "summary": "Show my overdue invoices",
  "message_count": 8,
  "messages": [
    {
      "id": "...",
      "role": "user",
      "content": "Show my overdue invoices",
      "timestamp": "2026-02-23T10:20:01.000Z"
    },
    {
      "id": "...",
      "role": "agent",
      "content": "Here are your overdue invoices...",
      "timestamp": "2026-02-23T10:20:03.000Z",
      "metadata": {
        "route": "llm",
        "toolsUsed": ["list_invoices"]
      }
    }
  ],
  "created_at": "2026-02-23T10:20:00.000Z",
  "updated_at": "2026-02-23T10:24:00.000Z"
}
```

## 5) End-to-End Frontend Flow

1. Start a new chat and generate `conversationId` (UUID).
2. Send messages to `/cfo-agent-api` with that same `conversationId`.
3. On app load, call list endpoint to build sidebar.
4. On sidebar click, call detail endpoint and load `messages`.
5. Continue chat using the same `conversationId` from that conversation.

## 6) TypeScript Interfaces

```ts
export interface ConversationSummary {
  conversation_id: string;
  summary: string | null;
  message_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "agent";
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationDetail {
  id: string;
  conversation_id: string;
  entity_id: string;
  user_id: string;
  summary: string | null;
  message_count: number | null;
  messages: ConversationMessage[];
  created_at: string;
  updated_at: string;
}
```

## 7) Error Responses

| Status | Body | Meaning |
|---|---|---|
| `400` | `{"error":"Provide conversationId, or userId (entityId optional)"}` | Missing scope inputs |
| `403` | `{"error":"userId does not match authenticated user"}` | Auth mismatch |
| `404` | `{"error":"Conversation not found"}` | Invalid/unauthorized `conversationId` |
| `500` | `{"error":"..."}` | Internal error |

## 8) Notes

- API excludes conversations where `is_deleted = true`.
- List results are ordered by latest `updated_at`.
- Detail mode returns the latest matching row for the `conversation_id` scope.
