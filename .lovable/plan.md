

# Fix CFO Agent API - Invoice Creation Failures

## Issues Identified

From the uploaded conversation log, there are 3 distinct failure patterns:

### Issue 1: Generic "I couldn't complete this request right now" for all messages
After the first successful invoice creation, subsequent messages ("I want to create invoice", "Hello") all return the same generic error. This indicates an unhandled exception in the main processing loop (caught at line 2276) -- likely caused by the OpenAI Responses API rejecting the growing conversation history.

**Root Cause:** The conversation history is sent in full (`conversationHistory.length` at line 2065) with no cap. As the conversation grows (12+ messages including error responses and metadata), the API call can fail due to malformed or oversized input.

### Issue 2: `create_customer` tool failing silently
When the user provides customer details, the system calls `create_customer` which fails. The LLM then reports the failure but the user can't proceed. The error logging doesn't capture the actual MCP tool result.

**Root Cause:** The error logging in `executeToolCall` only logs args but doesn't log the full error result from the MCP server. When the customer creation fails, the system has no detailed diagnostic info.

### Issue 3: Guardrail blocking on confirmation retry
When the user says "invoice date is today" (a confirmation), the system retries `create_customer` which fails again. The LLM generates a success message anyway, and the guardrail correctly blocks it -- but the replacement message ("I wasn't able to complete this action right now. I've already retried once.") is unhelpful.

**Root Cause:** The guardrail message is too generic. It should explain what specifically failed and what the user can do.

---

## Technical Changes

### File: `supabase/functions/cfo-agent-api/index.ts`

**Change 1: Cap conversation history to last 20 messages**
- At line 2065, change `conversationHistory.length` to always cap at 20:
```typescript
const historySlice = Math.min(isConfirmation ? 20 : 15, conversationHistory.length);
```
This prevents token overflow and malformed input from old messages.

**Change 2: Add detailed error logging in catch block**
- At line 2276-2291, enhance the error logging to include the full error stack:
```typescript
} catch (error) {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errStack = error instanceof Error ? error.stack : '';
  console.error(`[api] Processing error: ${errMsg}`);
  if (errStack) console.error(`[api] Stack: ${errStack}`);
```

**Change 3: Add tool result logging for write tools**
- After line 2132 (executeToolCall result), add logging for failed write tools:
```typescript
if (isWriteTool(toolName) && !execResult.success) {
  console.error(`[api] Write tool ${toolName} FAILED: ${execResult.failureReason || 'unknown'}, result: ${(execResult.result || '').slice(0, 500)}`);
}
```

**Change 4: Improve guardrail failure message**
- At line 2183-2188, make the blocked message more specific:
```typescript
if (writeErrors.length > 0) {
  const failedTools = writeErrors.map(r => r.tool.replace('create_', '').replace('update_', '')).join(', ');
  responseText = `I wasn't able to ${failedTools} right now due to a temporary issue. Please try again in a moment, or check if the ${failedTools} already exists.`;
}
```

**Change 5: Add try-catch around the OpenAI API call in the tool loop**
- At line 2172, wrap the `callOpenAI` in a try-catch to prevent the entire conversation from crashing if one API call fails mid-loop:
```typescript
try {
  response = await callOpenAI(llmConfig, systemPrompt, messages, filteredTools);
} catch (llmError) {
  console.error(`[api] LLM call failed in tool loop iteration ${iterations}:`, llmError);
  // Break out of loop with what we have so far
  break;
}
```
After the loop, if response still has tool_calls but we broke out, generate a fallback message from available tool results.

**Change 6: Limit persisted conversation history loaded from DB**
- At line 1524-1528, limit loaded history to last 20 messages to prevent history bloat:
```typescript
if (persistedHistory.length > 20) {
  conversationHistory = persistedHistory.slice(-20);
} else {
  conversationHistory = persistedHistory;
}
```

---

## Deployment
- Redeploy `cfo-agent-api` edge function after changes.

