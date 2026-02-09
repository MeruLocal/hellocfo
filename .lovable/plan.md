

# Live Demo Showcase Section

## Overview
Add an animated "Live Demo" section to the landing page that simulates a real conversation between a user and the CFO Agent. It will show a user typing a prompt, followed by the AI agent "typing" back a response -- cycling through multiple examples automatically. This creates a compelling, interactive showcase without needing a video.

## What It Looks Like

A chat-style UI mockup positioned between the "Features" and "How It Works" sections:

- Left side: A mock chat window showing a conversation
- The user prompt types in character-by-character (typewriter effect)
- After a brief "thinking" animation (bouncing dots), the agent response types in
- After a pause, the conversation fades out and the next example begins
- Cycles through 5 example prompt/response pairs continuously

### Example Conversations

1. **Prompt**: "What are my pending sales invoices?"  
   **Response**: "You have 12 pending invoices totaling Rs 4,52,300. The oldest is from Acme Corp (45 days overdue, Rs 1,20,000). Want me to break it down by customer?"

2. **Prompt**: "Show GST liability for this month"  
   **Response**: "Your GSTR-1 liability for Jan 2026: CGST Rs 84,200 | SGST Rs 84,200 | IGST Rs 1,42,500. Total: Rs 3,10,900. Filing deadline: Feb 11."

3. **Prompt**: "Compare this quarter revenue with last quarter"  
   **Response**: "Q4 revenue: Rs 28.4L (up 18.2% from Q3's Rs 24.0L). Top growth: Electronics (+32%), Services (+14%). Biggest decline: Raw Materials (-8%)."

4. **Prompt**: "Show items below reorder level"  
   **Response**: "7 items below reorder level: Steel Rod (Stock: 20, Min: 100), Copper Wire (Stock: 5, Min: 50), Bearing 6205 (Stock: 12, Min: 40)... Shall I create purchase orders?"

5. **Prompt**: "What is my best selling item this year?"  
   **Response**: "Your top seller is 'Premium Widget A' with 2,847 units sold (Rs 14.2L revenue). It accounts for 22% of total sales. Next best: 'Service Plan Gold' at 1,203 units."

## Technical Details

### Changes to `src/pages/Landing.tsx`

1. **Add demo data constant** (`DEMO_CONVERSATIONS`) -- array of 5 prompt/response pairs

2. **Add a `LiveDemoSection` inline component** using `useState` and `useEffect`:
   - State: `currentDemo` (index), `displayedPrompt` (partial string), `displayedResponse` (partial string), `phase` ('typing-prompt' | 'thinking' | 'typing-response' | 'pausing')
   - Typewriter effect via `setInterval` adding one character at a time
   - Phase transitions: type prompt (40ms/char) -> thinking dots (1.5s) -> type response (20ms/char) -> pause (3s) -> next demo
   - Wraps around after the last conversation

3. **UI structure**: 
   - Section header with "See It In Action" badge
   - A card styled like a chat window (with title bar dots like the hero mock)
   - User messages aligned right with primary background
   - Agent messages aligned left with muted background
   - Blinking cursor at the end of the currently typing text
   - Small "Live Demo" indicator with a pulsing green dot

4. **Insert the new section** between the Features section and the How It Works section

5. **Add "Demo" to the NAV_LINKS** array so users can scroll to it from the navbar

### No new files or dependencies needed
Everything is built inline in Landing.tsx using React state, `useEffect` timers, and existing Tailwind classes.
