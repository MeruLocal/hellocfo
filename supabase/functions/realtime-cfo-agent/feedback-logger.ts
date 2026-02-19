// Feedback Logger — Phase 3
// Logs every interaction to feedback_log for RL training

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface FeedbackLogEntry {
  message_id: string;
  conversation_id: string;
  entity_id: string;
  user_id: string;
  user_message: string;
  assistant_response: string | null;
  route_path: string; // 'fast' | 'llm' | 'cached'
  intent_matched: string | null;
  intent_confidence: number | null;
  model_used: string | null;
  tools_loaded: string[] | null;
  tools_used: string[] | null;
  tool_selection_strategy: string | null;
  response_time_ms: number | null;
  token_cost: number | null;
  implicit_signals: Record<string, unknown>;
}

/**
 * Log a completed interaction to the feedback_log table.
 * Non-blocking — errors are caught and logged, never thrown.
 */
export async function logFeedback(
  supabase: ReturnType<typeof createClient>,
  entry: FeedbackLogEntry,
  reqId: string,
): Promise<void> {
  try {
    const { error } = await supabase.from("feedback_log").insert({
      message_id: entry.message_id,
      conversation_id: entry.conversation_id,
      entity_id: entry.entity_id,
      user_id: entry.user_id,
      user_message: entry.user_message,
      assistant_response: entry.assistant_response,
      route_path: entry.route_path,
      intent_matched: entry.intent_matched,
      intent_confidence: entry.intent_confidence,
      model_used: entry.model_used,
      tools_loaded: entry.tools_loaded,
      tools_used: entry.tools_used,
      tool_selection_strategy: entry.tool_selection_strategy,
      response_time_ms: entry.response_time_ms,
      token_cost: entry.token_cost,
      implicit_signals: entry.implicit_signals,
    });

    if (error) {
      console.error(`[${reqId}] Feedback log error:`, error.message);
    } else {
      console.log(`[${reqId}] Feedback logged: path=${entry.route_path}, tools=${entry.tools_used?.length || 0}`);
    }
  } catch (e) {
    console.error(`[${reqId}] Feedback log exception:`, e);
  }
}
