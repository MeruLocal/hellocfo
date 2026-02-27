

# Stage-wise Success/Fail Ratio Panel in Global Chat History

## Overview
Add a **Pipeline Debug Panel** to the right side of the Global Chat History's MessagePanel. When a conversation is selected, alongside the messages, show an aggregated success/fail breakdown for each stage of the chatbot pipeline -- helping debug where failures occur across the flow.

## Stages to Track
From the message metadata stored in `unified_conversations.messages`, we can extract per-bot-message:

1. **Routing** -- Was a valid route assigned? (`route` field: success if present and not "unknown")
2. **Intent Detection** -- Was an intent matched? (`intent.name` present with confidence > 0)
3. **Tool Loading** -- Were tools loaded? (`toolsLoaded` array length > 0)
4. **Tool Execution** -- Were tools actually used? (`toolsUsed` array length > 0 when `toolsLoaded` > 0)
5. **Response Generation** -- Was a non-empty response generated? (`content` is non-empty)

Each stage shows a small bar or ratio like `8/10 success` with a colored indicator (green/yellow/red).

## UI Design
- Add a collapsible **"Pipeline Health"** section at the top of the MessagePanel, above the messages
- Shows a horizontal row of stage cards, each with:
  - Stage name + icon
  - Success count / Total count
  - A small progress bar (green for > 80%, yellow for 50-80%, red for < 50%)
- Collapsed by default on small conversations, expanded on larger ones

## Technical Details

### File: `src/components/GlobalChatHistory.tsx`

1. **Add a `PipelineHealthBar` component** inside the file:
   - Takes `messages: ChatMessage[]` as prop
   - Iterates over bot messages (`role === 'agent'`)
   - For each bot message, checks metadata fields to determine pass/fail per stage
   - Computes aggregated counts and renders the stage cards

2. **Stage evaluation logic:**
   ```text
   For each bot message:
     Routing:    PASS if metadata.route exists and !== "unknown"
     Intent:     PASS if metadata.intent?.name exists
     Tool Load:  PASS if metadata.toolsLoaded?.length > 0
     Tool Exec:  PASS if metadata.toolsUsed?.length > 0 (only counted when toolsLoaded > 0)
     Response:   PASS if content.trim().length > 0
   ```

3. **Place the component** between the "Panel Stats" bar and the messages ScrollArea in the MessagePanel

4. **Styling**: Use existing Badge, Progress components. Color-coded: green (>80%), amber (50-80%), red (<50%).

### No backend changes needed
All data is already available in the `messages` JSONB column of `unified_conversations`. This is purely a frontend computation.

