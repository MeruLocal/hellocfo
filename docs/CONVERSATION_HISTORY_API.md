# Conversation History API — Frontend Developer Guide

## Overview

The Conversation History API allows you to **list** a user's past conversations and **load** a full conversation by ID. It is used to power the chat history sidebar in the CFO Agent UI.

---

## Base URL

```
https://ptftkblnvsybcggbecau.supabase.co/functions/v1/get-conversations
```

---

## Authentication

All requests must include the **Supabase Anon Key** as a header:

```
apikey: <SUPABASE_ANON_KEY>
```

> **Anon Key:**  
> `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0ZnRrYmxudnN5YmNnZ2JlY2F1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODAxMDcsImV4cCI6MjA4Mjc1NjEwN30.R--MW3ByXW9wH3M3TgBmRfR-opFomYJxYJS9GyaVfM4`

---

## Endpoints

---

### 1. List Conversations (History Sidebar)

Returns a paginated list of conversation summaries for a given user and entity.

#### Request

```
GET /get-conversations?userId=<USER_ID>&entityId=<ENTITY_ID>
```

**OR via POST body:**

```
POST /get-conversations
Content-Type: application/json

{
  "userId": "<USER_ID>",
  "entityId": "<ENTITY_ID>"
}
```

#### Query Parameters

| Parameter  | Type   | Required | Description                          |
|------------|--------|----------|--------------------------------------|
| `userId`   | string | ✅ Yes   | The authenticated user's ID (UUID)   |
| `entityId` | string | ✅ Yes   | The entity/company ID (e.g. `ENTITY-001`) |

#### Response — `200 OK`

Returns an **array** of conversation summaries, sorted by most recently updated.

```json
[
  {
    "conversation_id": "conv_abc123",
    "summary": "User asked about unpaid invoices",
    "message_count": 6,
    "created_at": "2026-02-20T10:00:00Z",
    "updated_at": "2026-02-20T10:15:00Z"
  },
  {
    "conversation_id": "conv_def456",
    "summary": "Revenue report for Q3",
    "message_count": 4,
    "created_at": "2026-02-19T08:00:00Z",
    "updated_at": "2026-02-19T08:30:00Z"
  }
]
```

#### Response Fields

| Field             | Type        | Description                                     |
|-------------------|-------------|-------------------------------------------------|
| `conversation_id` | string      | Unique conversation identifier                   |
| `summary`         | string/null | Short summary (first user message or AI summary) |
| `message_count`   | number/null | Total messages in the conversation              |
| `created_at`      | ISO 8601    | When the conversation was started               |
| `updated_at`      | ISO 8601    | When the conversation was last updated          |

---

### 2. Load Full Conversation (Resume Chat)

Returns the complete conversation object including all messages.

#### Request

```
GET /get-conversations?conversationId=<CONVERSATION_ID>
```

**OR via POST body:**

```
POST /get-conversations
Content-Type: application/json

{
  "conversationId": "<CONVERSATION_ID>"
}
```

#### Query Parameters

| Parameter        | Type   | Required | Description              |
|------------------|--------|----------|--------------------------|
| `conversationId` | string | ✅ Yes   | The conversation's ID    |

#### Response — `200 OK`

Returns the **full conversation object** including the `messages` array.

```json
{
  "id": "uuid-internal",
  "conversation_id": "conv_abc123",
  "entity_id": "ENTITY-001",
  "user_id": "user-uuid",
  "summary": "User asked about unpaid invoices",
  "message_count": 6,
  "last_message_preview": "You have 3 overdue invoices totaling ₹45,000",
  "chat_name": null,
  "auto_generated_name": "Unpaid Invoices Query",
  "chat_display_id": "#MJ-0012",
  "mode": "general",
  "messages": [
    {
      "id": "msg_001",
      "role": "user",
      "content": "Show me all unpaid invoices",
      "timestamp": "2026-02-20T10:00:00Z"
    },
    {
      "id": "msg_002",
      "role": "assistant",
      "content": "You have 3 overdue invoices totaling ₹45,000...",
      "timestamp": "2026-02-20T10:00:05Z",
      "metadata": {
        "intent": "get_unpaid_invoices",
        "tools_used": ["list_invoices"],
        "route": "llm",
        "response_time_ms": 1200
      }
    }
  ],
  "created_at": "2026-02-20T10:00:00Z",
  "updated_at": "2026-02-20T10:15:00Z"
}
```

#### Messages Array — Item Fields

| Field       | Type   | Description                                      |
|-------------|--------|--------------------------------------------------|
| `id`        | string | Unique message ID                                |
| `role`      | string | `"user"` or `"assistant"`                        |
| `content`   | string | The message text                                 |
| `timestamp` | string | ISO 8601 timestamp                               |
| `metadata`  | object | *(assistant only)* Agent routing/tool metadata   |

---

### Error Responses

| Status | Body                                                     | Reason                           |
|--------|----------------------------------------------------------|----------------------------------|
| `400`  | `{"error": "Provide conversationId or userId+entityId"}` | Missing required parameters      |
| `500`  | `{"error": "..."}`                                       | Server/database error            |

---

## Usage Flow

### Step 1 — On App Load: Fetch Chat History

```javascript
const userId = "user-uuid";      // from auth session
const entityId = "ENTITY-001";  // selected entity

const res = await fetch(
  `https://ptftkblnvsybcggbecau.supabase.co/functions/v1/get-conversations?userId=${userId}&entityId=${entityId}`,
  {
    headers: {
      "apikey": "<SUPABASE_ANON_KEY>"
    }
  }
);

const conversations = await res.json();
// → Array of ConversationSummary objects
// → Render in sidebar grouped by Today / Yesterday / Older
```

---

### Step 2 — On Click: Load a Past Conversation

```javascript
const conversationId = "conv_abc123";

const res = await fetch(
  `https://ptftkblnvsybcggbecau.supabase.co/functions/v1/get-conversations?conversationId=${conversationId}`,
  {
    headers: {
      "apikey": "<SUPABASE_ANON_KEY>"
    }
  }
);

const conversation = await res.json();
const messages = conversation.messages; // render in chat window
```

---

### Step 3 — Resume Chat with History Context

When the user sends a new message in a resumed conversation, pass the history to the agent:

```javascript
const res = await fetch(
  `https://ptftkblnvsybcggbecau.supabase.co/functions/v1/realtime-cfo-agent`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": "<SUPABASE_ANON_KEY>"
    },
    body: JSON.stringify({
      query: "What about the invoice for Acme Corp?",
      entityId: "ENTITY-001",
      userId: "user-uuid",
      conversationId: "conv_abc123",        // resume this conversation
      conversationHistory: messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    })
  }
);
```

---

## TypeScript Types

```typescript
interface ConversationSummary {
  conversation_id: string;
  summary: string | null;
  message_count: number | null;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  metadata?: {
    intent?: string;
    tools_used?: string[];
    route?: string;
    response_time_ms?: number;
  };
}

interface Conversation {
  id: string;
  conversation_id: string;
  entity_id: string;
  user_id: string;
  summary: string | null;
  message_count: number | null;
  last_message_preview: string | null;
  chat_name: string | null;
  auto_generated_name: string | null;
  chat_display_id: string | null;
  mode: string | null;
  messages: Message[];
  created_at: string;
  updated_at: string;
}
```

---

## Sidebar Grouping Logic (UI Reference)

The existing sidebar groups conversations by date:

```typescript
import { isToday, isYesterday } from "date-fns";

function groupByDate(conversations: ConversationSummary[]) {
  const today = conversations.filter(c => isToday(new Date(c.updated_at)));
  const yesterday = conversations.filter(c => isYesterday(new Date(c.updated_at)));
  const older = conversations.filter(c => 
    !isToday(new Date(c.updated_at)) && !isYesterday(new Date(c.updated_at))
  );

  return [
    { label: "Today", items: today },
    { label: "Yesterday", items: yesterday },
    { label: "Older", items: older },
  ].filter(g => g.items.length > 0);
}
```

---

## Notes

- Results are limited to the **last 50 conversations** per user+entity.
- The `summary` field is auto-generated from the first user message if no AI summary exists.
- The `messages` array is only returned when fetching by `conversationId` (detail mode).
- Conversations are **soft-deleted** — use `is_deleted: false` filter if building a custom query.
