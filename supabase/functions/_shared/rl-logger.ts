// RL Logger — Logs to intent_routing_stats and llm_path_patterns
// for the reinforcement learning pipeline

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Log intent routing outcome for adaptive threshold tuning.
 * Called after every fast-path (intent-matched) execution.
 */
export async function logIntentRouting(
  supabase: ReturnType<typeof createClient>,
  params: {
    intentId: string;
    intentName: string;
    confidenceBucket: number; // rounded to nearest 0.05
    success: boolean;
    responseTimeMs: number;
    feedbackScore?: number;
  },
  reqId: string,
): Promise<void> {
  try {
    const bucket = Math.round(params.confidenceBucket * 20) / 20; // snap to 0.05 increments

    // Upsert: increment counters for this intent + confidence bucket
    const { error } = await supabase.rpc("upsert_intent_routing_stat", {
      p_intent_id: params.intentId,
      p_intent_name: params.intentName,
      p_confidence_bucket: bucket,
      p_success: params.success,
      p_response_time_ms: params.responseTimeMs,
      p_feedback_score: params.feedbackScore ?? null,
    });

    // Fallback: if RPC doesn't exist yet, do manual upsert
    if (error?.message?.includes("function") || error?.code === "42883") {
      const existing = await supabase
        .from("intent_routing_stats")
        .select("*")
        .eq("intent_id", params.intentId)
        .eq("confidence_bucket", bucket)
        .maybeSingle();

      if (existing.data) {
        await supabase
          .from("intent_routing_stats")
          .update({
            total_attempts: (existing.data.total_attempts || 0) + 1,
            successful_attempts: (existing.data.successful_attempts || 0) + (params.success ? 1 : 0),
            failed_attempts: (existing.data.failed_attempts || 0) + (params.success ? 0 : 1),
            avg_response_time_ms: Math.round(
              ((existing.data.avg_response_time_ms || 0) * (existing.data.total_attempts || 0) + params.responseTimeMs) /
              ((existing.data.total_attempts || 0) + 1)
            ),
            last_attempt_at: new Date().toISOString(),
          })
          .eq("id", existing.data.id);
      } else {
        await supabase.from("intent_routing_stats").insert({
          intent_id: params.intentId,
          intent_name: params.intentName,
          confidence_bucket: bucket,
          total_attempts: 1,
          successful_attempts: params.success ? 1 : 0,
          failed_attempts: params.success ? 0 : 1,
          avg_response_time_ms: params.responseTimeMs,
          last_attempt_at: new Date().toISOString(),
        });
      }
    } else if (error) {
      console.error(`[${reqId}] Intent routing log error:`, error.message);
    }

    console.log(`[${reqId}] RL: intent_routing logged for ${params.intentName} @ ${bucket}`);
  } catch (e) {
    console.error(`[${reqId}] Intent routing log exception:`, e);
  }
}

/**
 * Log LLM-path query patterns for auto-intent discovery.
 * Called after every LLM-path (non-intent-matched) execution.
 */
export async function logLLMPathPattern(
  supabase: ReturnType<typeof createClient>,
  params: {
    queryText: string;
    entityId: string;
    toolsUsed: string[];
    toolSelectionStrategy: string;
    responseTimeMs: number;
    feedbackScore?: number;
  },
  reqId: string,
): Promise<void> {
  try {
    // Simple hash for grouping similar queries
    const queryHash = simpleHash(params.queryText.toLowerCase().trim());

    // Check if this pattern already exists
    const { data: existing } = await supabase
      .from("llm_path_patterns")
      .select("*")
      .eq("query_hash", queryHash)
      .maybeSingle();

    if (existing) {
      // Increment occurrence count and update stats
      const newCount = (existing.occurrence_count || 0) + 1;
      const avgTime = Math.round(
        ((existing.avg_response_time_ms || 0) * (existing.occurrence_count || 0) + params.responseTimeMs) / newCount
      );

      await supabase
        .from("llm_path_patterns")
        .update({
          occurrence_count: newCount,
          avg_response_time_ms: avgTime,
          tools_used: params.toolsUsed,
          tool_selection_strategy: params.toolSelectionStrategy,
          last_seen_at: new Date().toISOString(),
          ...(params.feedbackScore != null ? { avg_feedback_score: params.feedbackScore } : {}),
        })
        .eq("id", existing.id);
    } else {
      // Insert new pattern
      await supabase.from("llm_path_patterns").insert({
        query_text: params.queryText,
        query_hash: queryHash,
        entity_id: params.entityId,
        tools_used: params.toolsUsed,
        tool_selection_strategy: params.toolSelectionStrategy,
        occurrence_count: 1,
        avg_response_time_ms: params.responseTimeMs,
        last_seen_at: new Date().toISOString(),
        ...(params.feedbackScore != null ? { avg_feedback_score: params.feedbackScore } : {}),
      });
    }

    console.log(`[${reqId}] RL: llm_path_pattern logged (hash=${queryHash}, tools=${params.toolsUsed.length})`);
  } catch (e) {
    console.error(`[${reqId}] LLM path pattern log exception:`, e);
  }
}

/**
 * Check if an LLM path pattern has occurred enough times to suggest a new intent.
 * Returns patterns with 10+ occurrences that haven't been suggested yet.
 */
export async function checkForSuggestedIntents(
  supabase: ReturnType<typeof createClient>,
  reqId: string,
): Promise<void> {
  try {
    const { data: hotPatterns } = await supabase
      .from("llm_path_patterns")
      .select("*")
      .gte("occurrence_count", 10)
      .is("suggested_intent_id", null)
      .order("occurrence_count", { ascending: false })
      .limit(5);

    if (!hotPatterns || hotPatterns.length === 0) return;

    for (const pattern of hotPatterns) {
      // Create a suggested intent
      const { data: suggested, error } = await supabase
        .from("suggested_intents")
        .insert({
          source_pattern_id: pattern.id,
          suggested_name: `auto_${pattern.query_hash}`,
          suggested_training_phrases: [pattern.query_text],
          suggested_tools: pattern.tools_used || [],
          occurrence_count: pattern.occurrence_count,
          avg_feedback_score: pattern.avg_feedback_score,
          status: "pending",
        })
        .select("id")
        .single();

      if (suggested && !error) {
        // Link back to the pattern
        await supabase
          .from("llm_path_patterns")
          .update({ suggested_intent_id: suggested.id })
          .eq("id", pattern.id);

        console.log(`[${reqId}] RL: Auto-suggested intent from pattern (${pattern.occurrence_count} occurrences)`);
      }
    }
  } catch (e) {
    console.error(`[${reqId}] Suggested intent check exception:`, e);
  }
}

/** Simple string hash for grouping similar queries */
function simpleHash(str: string): string {
  // Normalize: remove extra spaces, lowercase, remove punctuation
  const normalized = str.replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const chr = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
