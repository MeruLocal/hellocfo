// RL Logger — Logs to intent_routing_stats and llm_path_patterns
// for the reinforcement learning pipeline

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

/**
 * Log intent routing outcome for adaptive threshold tuning.
 * Called after every fast-path (intent-matched) execution.
 */
export async function logIntentRouting(
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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

// ============================================================
// Adaptive Confidence Thresholds (Task 14)
// ============================================================

/**
 * Get an adaptive confidence threshold for an intent based on historical success rates.
 * - Success rate > 90% & 20+ attempts → lower threshold by 0.05 (min 0.70)
 * - Success rate < 70% & 10+ attempts → raise threshold by 0.05 (max 0.95)
 * - Otherwise → return default
 */
export async function getAdaptiveThreshold(
  supabase: SupabaseClient,
  intentId: string,
  defaultThreshold: number = 0.85,
): Promise<number> {
  try {
    const { data: stats } = await supabase
      .from("intent_routing_stats")
      .select("total_attempts, successful_attempts")
      .eq("intent_id", intentId);

    if (!stats || stats.length === 0) return defaultThreshold;

    // Aggregate across all confidence buckets for this intent
    let totalAttempts = 0;
    let successfulAttempts = 0;
    for (const s of stats) {
      totalAttempts += s.total_attempts || 0;
      successfulAttempts += s.successful_attempts || 0;
    }

    if (totalAttempts === 0) return defaultThreshold;

    const successRate = successfulAttempts / totalAttempts;

    if (successRate > 0.9 && totalAttempts >= 20) {
      return Math.max(0.70, defaultThreshold - 0.05);
    }
    if (successRate < 0.7 && totalAttempts >= 10) {
      return Math.min(0.95, defaultThreshold + 0.05);
    }

    return defaultThreshold;
  } catch (e) {
    console.error("Adaptive threshold error:", e);
    return defaultThreshold;
  }
}

// ============================================================
// Implicit Signal Detection (Task 15)
// ============================================================

export interface ImplicitSignals {
  rephrase?: boolean;
  followUp?: boolean;
  actionTaken?: boolean;
  signal: number; // -1 = negative, 0 = neutral, +1 = positive, +2 = strong positive
  source?: string;
}

/**
 * Detect implicit feedback signals from user behavior.
 * - Rephrase: user repeats similar query → negative signal (-1)
 * - Follow-up: user builds on previous response → positive signal (+1)
 * - Action taken: user acts on read data → strong positive (+2)
 */
export function detectImplicitSignals(
  query: string,
  conversationHistory: { role: string; content: string }[],
): ImplicitSignals {
  if (conversationHistory.length < 2) {
    return { signal: 0, source: "no_history" };
  }

  const queryLower = query.toLowerCase().trim();
  const queryWords = new Set(queryLower.split(/\s+/).filter(w => w.length > 2));

  // Find the last user message
  let lastUserMsg = "";
  let lastAssistantMsg = "";
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const msg = conversationHistory[i];
    if (msg.role === "user" && !lastUserMsg) lastUserMsg = msg.content.toLowerCase().trim();
    if ((msg.role === "assistant" || msg.role === "agent") && !lastAssistantMsg) lastAssistantMsg = msg.content.toLowerCase().trim();
    if (lastUserMsg && lastAssistantMsg) break;
  }

  if (!lastUserMsg) return { signal: 0, source: "no_prior_user_msg" };

  // Rephrase detection: high keyword overlap with previous user message
  const lastWords = new Set(lastUserMsg.split(/\s+/).filter(w => w.length > 2));
  if (lastWords.size > 0 && queryWords.size > 0) {
    let overlap = 0;
    for (const w of queryWords) { if (lastWords.has(w)) overlap++; }
    const overlapRatio = overlap / Math.max(queryWords.size, lastWords.size);
    if (overlapRatio > 0.6 && queryLower !== lastUserMsg) {
      return { rephrase: true, signal: -1, source: `rephrase_${(overlapRatio * 100).toFixed(0)}pct` };
    }
  }

  // Action taken: write verbs after a read response
  const actionVerbs = ["create", "add", "send", "update", "edit", "delete", "record", "pay", "file"];
  const isAction = actionVerbs.some(v => queryLower.includes(v));
  const lastWasRead = lastAssistantMsg && (
    lastAssistantMsg.includes("₹") || lastAssistantMsg.includes("|") ||
    lastAssistantMsg.includes("total") || lastAssistantMsg.includes("invoice") ||
    lastAssistantMsg.includes("bill")
  );
  if (isAction && lastWasRead) {
    return { actionTaken: true, signal: 2, source: "action_after_read" };
  }

  // Follow-up: short message building on context
  if (queryWords.size <= 6 && lastAssistantMsg) {
    return { followUp: true, signal: 1, source: "follow_up" };
  }

  return { signal: 0, source: "neutral" };
}
