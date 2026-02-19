

# Persistent Chat History + Intent and MCP Tool Analytics

## What You Get

1. **Chat History sidebar** in the Test Console / CFO Agent — browse, search, and resume past conversations (ChatGPT-style)
2. **"Usage" tab inside each Intent** — see how many times it was triggered, success rate, recent conversations that matched it
3. **Usage stats on each MCP Tool** — call count, success rate, avg response time, and recent conversations where it was called

---

## How It Works

### Chat History Sidebar (Test Console)

- A collapsible panel on the left of the CFO Agent chat area
- Shows past conversations grouped by date (Today, Yesterday, Older)
- Click any conversation to reload its full message history
- "New Chat" button starts a fresh conversation
- Search box filters conversations by summary text
- Each conversation stores per-message metadata: which intent matched, which tools ran, the route path, execution time

### Intent Library Integration

- Each intent's detail screen gets a new **"Usage"** tab (alongside existing Details, Training, Entities, etc.)
- Shows: total triggers, avg confidence, success rate (from feedback scores)
- Lists recent conversations that triggered this intent, with timestamps and a snippet
- Data pulled from `feedback_log` table (already being populated by Phase 3)

### MCP Tools View Integration

- Each tool in the MCP Tools list shows usage badges: call count, success rate, avg response time
- Clicking a tool shows its existing detail panel plus a new **"Recent Usage"** section at the bottom
- Data pulled from `feedback_log` (which already stores `tools_used` arrays)

---

## Technical Details

### 1. Database Changes

**Migration: Add index for fast sidebar queries**
```sql
CREATE INDEX IF NOT EXISTS idx_unified_conversations_user_entity 
  ON unified_conversations(user_id, entity_id, updated_at DESC);

-- Add UPDATE policy to feedback_log for submit-feedback to work
CREATE POLICY "Allow public update on feedback_log"
  ON feedback_log FOR UPDATE USING (true);
```

No new tables needed. `unified_conversations` (already exists, currently empty) will store chats. `feedback_log` (already populated) provides analytics.

### 2. New Edge Function: `get-conversations`

Handles two query patterns:
- **List mode**: `GET ?userId=X&entityId=Y` -- returns conversation summaries for sidebar (id, summary, message_count, updated_at)
- **Detail mode**: `GET ?conversationId=X` -- returns full conversation with all messages

### 3. Edge Function Changes: `realtime-cfo-agent` and `cfo-agent-api`

After generating a response:
- Accept `conversationId` from request body
- Upsert into `unified_conversations`: append user message + agent message (with intent, tools, route metadata) to `messages` JSONB array
- Update `summary` (first user message text), `message_count`, `updated_at`
- Use `conversationId` in `feedback_log` entries

### 4. New Edge Function: `get-tool-analytics`

Aggregates from `feedback_log`:
- Per-intent stats: trigger count, avg confidence, avg feedback score
- Per-tool stats: usage count, success rate, avg response time
- Returns JSON suitable for both Intent and MCP views

### 5. Frontend: New Components

| Component | Purpose |
|---|---|
| `ConversationSidebar.tsx` | Collapsible sidebar listing past conversations, search, "New Chat" button |
| `IntentUsageTab.tsx` | New tab inside intent detail screen showing trigger stats + recent conversations |
| `MCPToolUsageBadge.tsx` | Inline badges (call count, success %) on each tool in the MCP Tools list |

### 6. Frontend: Modified Components

| Component | Change |
|---|---|
| `RealtimeCFOAgent.tsx` | Generate stable `conversationId`, pass to edge function, integrate sidebar, load past chats |
| `CFOQueryResolutionEngine.tsx` | Add "Usage" tab to IntentDetailScreen tabs array; add usage badges to MCPToolsView |

### 7. Message Metadata Schema (stored in unified_conversations.messages JSONB)

```json
{
  "id": "msg-uuid",
  "role": "agent",
  "content": "Here are your invoices...",
  "timestamp": "2026-02-19T10:00:00Z",
  "metadata": {
    "route": "fast",
    "category": "bookkeeper",
    "intent": { "id": "intent-123", "name": "ListInvoices", "confidence": 0.92 },
    "toolsUsed": ["get_all_invoices"],
    "toolsLoaded": ["get_all_invoices", "get_customer_by_id"],
    "executionTime": "2.3s",
    "usage": { "input_tokens": 1200, "output_tokens": 450 },
    "llmModel": "azure/gpt-4o"
  }
}
```

### 8. Implementation Order

1. DB migration (index + feedback_log update policy)
2. Create `get-conversations` edge function
3. Create `get-tool-analytics` edge function
4. Modify `realtime-cfo-agent` to accept `conversationId` and persist conversations
5. Modify `cfo-agent-api` to do the same
6. Create `ConversationSidebar` component
7. Integrate sidebar into `RealtimeCFOAgent`
8. Create `IntentUsageTab` and add to intent detail screen
9. Add usage badges to `MCPToolsView`
10. Add `get-conversations` and `get-tool-analytics` to `supabase/config.toml`

