// Conversation Summarizer — Trims long conversations
// After 20 messages, summarizes older ones and keeps last 10

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const SUMMARIZE_THRESHOLD = 20;
const KEEP_RECENT = 10;

/**
 * Check if a conversation needs summarization.
 */
export function shouldSummarize(messageCount: number): boolean {
  return messageCount > SUMMARIZE_THRESHOLD;
}

interface LLMConfig {
  endpoint?: string | null;
  api_key?: string | null;
  model?: string;
}

interface Message {
  role: string;
  content: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Summarize older messages and return trimmed conversation.
 * Updates unified_conversations.summary in the background.
 */
export async function summarizeHistory(
  supabase: SupabaseClient,
  conversationId: string,
  messages: Message[],
  llmConfig: LLMConfig,
  reqId: string,
): Promise<Message[]> {
  if (messages.length <= SUMMARIZE_THRESHOLD) return messages;

  try {
    const olderMessages = messages.slice(0, messages.length - KEEP_RECENT);
    const recentMessages = messages.slice(messages.length - KEEP_RECENT);

    // Build a text block of older messages for summarization
    const olderText = olderMessages
      .map((m) => `${m.role}: ${m.content.slice(0, 500)}`)
      .join("\n");

    // Call LLM for summarization (cheap, max 512 tokens)
    const endpoint = `${(llmConfig.endpoint || "https://lovable-hellobooks-resource.cognitiveservices.azure.com/openai/v1/").replace(/\/$/, "")}/chat/completions`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": llmConfig.api_key || "",
      },
      body: JSON.stringify({
        model: llmConfig.model || "gpt-4o-mini",
        max_completion_tokens: 512,
        messages: [
          {
            role: "developer",
            content: `Summarize this conversation history concisely. Focus on:
- Key financial queries and their results
- Actions taken (invoices created, payments recorded, etc.)
- Important numbers and entities mentioned
Keep it under 300 words. Output only the summary, no preamble.`,
          },
          { role: "user", content: olderText },
        ],
      }),
    });

    if (!res.ok) {
      console.error(`[${reqId}] Summarization LLM error: ${res.status}`);
      // Fallback: just keep recent messages without summary
      return recentMessages;
    }

    const result = await res.json();
    const summary = result.choices?.[0]?.message?.content || "";

    if (summary) {
      // Save summary to DB (non-blocking)
      supabase
        .from("unified_conversations")
        .update({ summary })
        .eq("conversation_id", conversationId)
        .then(() => console.log(`[${reqId}] Conversation summary saved`))
        .then(undefined, (e: Error) => console.error(`[${reqId}] Summary save failed:`, e));

      // Return summary as a system context message + recent messages
      const summaryMessage: Message = {
        role: "user",
        content: `[Previous conversation summary]: ${summary}`,
      };

      return [summaryMessage, ...recentMessages];
    }

    return recentMessages;
  } catch (e) {
    console.error(`[${reqId}] Summarization failed:`, e);
    // Fallback: just keep recent messages
    return messages.slice(messages.length - KEEP_RECENT);
  }
}
