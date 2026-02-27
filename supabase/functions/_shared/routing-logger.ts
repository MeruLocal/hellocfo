// Query Routing Logger — Gap 9
// Logs full trace data for every request to query_routing_logs table

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface RoutingLogEntry {
  requestId: string;
  conversationId?: string;
  entityId: string;
  userId?: string;
  query: string;
  routePath: string;
  category?: string;
  intentMatched?: string;
  intentConfidence?: number;
  toolsLoaded?: string[];
  toolsUsed?: string[];
  toolsFailed?: string[];
  toolSelectionStrategy?: string;
  modelUsed?: string;
  modelTier?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  responseTimeMs?: number;
  isWriteOperation?: boolean;
  writeToolResults?: Array<{
    tool: string;
    success: boolean;
    error?: string;
    attempts?: number;
    validationErrors?: string[];
  }>;
  cacheHit?: boolean;
  enrichmentsApplied?: string[];
  errorMessage?: string;
}

/**
 * Log a complete routing trace for a request.
 * Non-blocking — errors are caught and logged, never thrown.
 */
export async function logQueryRouting(
  supabase: SupabaseClient,
  entry: RoutingLogEntry,
  reqId: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("query_routing_logs")
      .insert({
        request_id: entry.requestId,
        conversation_id: entry.conversationId || null,
        entity_id: entry.entityId,
        user_id: entry.userId || null,
        query: entry.query,
        route_path: entry.routePath,
        category: entry.category || null,
        intent_matched: entry.intentMatched || null,
        intent_confidence: entry.intentConfidence || null,
        tools_loaded: entry.toolsLoaded || [],
        tools_used: entry.toolsUsed || [],
        tools_failed: entry.toolsFailed || [],
        tool_selection_strategy: entry.toolSelectionStrategy || null,
        model_used: entry.modelUsed || null,
        model_tier: entry.modelTier || null,
        input_tokens: entry.inputTokens || 0,
        output_tokens: entry.outputTokens || 0,
        total_tokens: entry.totalTokens || 0,
        response_time_ms: entry.responseTimeMs || null,
        is_write_operation: entry.isWriteOperation || false,
        write_tool_results: entry.writeToolResults || [],
        cache_hit: entry.cacheHit || false,
        enrichments_applied: entry.enrichmentsApplied || [],
        error_message: entry.errorMessage || null,
      });

    if (error) {
      console.error(`[${reqId}] Routing log error:`, error.message);
    } else {
      console.log(`[${reqId}] Routing log saved`);
    }
  } catch (e) {
    console.error(`[${reqId}] Routing log exception:`, e);
  }
}
