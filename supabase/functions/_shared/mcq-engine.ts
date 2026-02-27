// MCQ Engine — Gap 3, 4, 5, 6 (Phase 0.5)
// Manages Multiple Choice Question state for entity resolution,
// parameter resolution, and write confirmations

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface MCQOption {
  label: string;
  value: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export type MCQType =
  | "entity_resolution"    // Gap 4: Fuzzy contact/item search
  | "parameter_resolution" // Gap 5: Missing params (period, status)
  | "write_confirmation"   // Gap 6: Confirm before create/update/delete
  | "disambiguation";      // General disambiguation

export interface MCQState {
  id?: string;
  conversationId: string;
  entityId: string;
  userId?: string;
  mcqType: MCQType;
  question: string;
  options: MCQOption[];
  selectedOption?: MCQOption | null;
  context: Record<string, unknown>;
  pendingTool?: string;
  pendingArgs?: Record<string, unknown>;
  status: "pending" | "resolved" | "expired" | "cancelled";
  expiresAt?: string;
}

/**
 * Save a new MCQ state to the database (pause flow).
 */
export async function saveMCQState(
  supabase: SupabaseClient,
  state: MCQState,
  reqId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("mcq_pending_states")
      .insert({
        conversation_id: state.conversationId,
        entity_id: state.entityId,
        user_id: state.userId || "unknown",
        mcq_type: state.mcqType,
        question: state.question,
        options: state.options,
        context: state.context,
        pending_tool: state.pendingTool || null,
        pending_args: state.pendingArgs || {},
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.error(`[${reqId}] MCQ save error:`, error.message);
      return null;
    }
    console.log(`[${reqId}] MCQ: saved pending state ${data.id} (${state.mcqType})`);
    return data.id;
  } catch (e) {
    console.error(`[${reqId}] MCQ save exception:`, e);
    return null;
  }
}

/**
 * Load the latest pending MCQ for a conversation.
 */
export async function loadPendingMCQ(
  supabase: SupabaseClient,
  conversationId: string,
  reqId: string,
): Promise<MCQState | null> {
  try {
    const { data, error } = await supabase
      .from("mcq_pending_states")
      .select("*")
      .eq("conversation_id", conversationId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    // Check if expired
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      await supabase
        .from("mcq_pending_states")
        .update({ status: "expired" })
        .eq("id", data.id);
      console.log(`[${reqId}] MCQ: expired state ${data.id}`);
      return null;
    }

    return {
      id: data.id,
      conversationId: data.conversation_id,
      entityId: data.entity_id,
      userId: data.user_id,
      mcqType: data.mcq_type,
      question: data.question,
      options: data.options,
      selectedOption: data.selected_option,
      context: data.context || {},
      pendingTool: data.pending_tool,
      pendingArgs: data.pending_args || {},
      status: data.status,
      expiresAt: data.expires_at,
    };
  } catch (e) {
    console.error(`[${reqId}] MCQ load exception:`, e);
    return null;
  }
}

/**
 * Resolve a pending MCQ with the user's selection.
 */
export async function resolveMCQ(
  supabase: SupabaseClient,
  mcqId: string,
  selectedOption: MCQOption,
  reqId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("mcq_pending_states")
      .update({
        selected_option: selectedOption,
        status: "resolved",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", mcqId);

    if (error) {
      console.error(`[${reqId}] MCQ resolve error:`, error.message);
      return false;
    }
    console.log(`[${reqId}] MCQ: resolved ${mcqId} with "${selectedOption.label}"`);
    return true;
  } catch (e) {
    console.error(`[${reqId}] MCQ resolve exception:`, e);
    return false;
  }
}

/**
 * Cancel a pending MCQ.
 */
export async function cancelMCQ(
  supabase: SupabaseClient,
  mcqId: string,
  reqId: string,
): Promise<void> {
  try {
    await supabase
      .from("mcq_pending_states")
      .update({ status: "cancelled", resolved_at: new Date().toISOString() })
      .eq("id", mcqId);
    console.log(`[${reqId}] MCQ: cancelled ${mcqId}`);
  } catch (e) {
    console.error(`[${reqId}] MCQ cancel exception:`, e);
  }
}

/**
 * Build an MCQ for entity resolution (Gap 4).
 * Used when a fuzzy search returns multiple matches.
 */
export function buildEntityResolutionMCQ(
  entityType: string,
  searchTerm: string,
  matches: Array<{ name: string; id: string; extra?: string }>,
  pendingTool: string,
  pendingArgs: Record<string, unknown>,
): MCQState {
  return {
    conversationId: "",
    entityId: "",
    mcqType: "entity_resolution",
    question: `I found multiple ${entityType}s matching "${searchTerm}". Which one did you mean?`,
    options: matches.map((m, i) => ({
      label: m.name,
      value: m.id,
      description: m.extra || undefined,
    })),
    context: { entityType, searchTerm },
    pendingTool,
    pendingArgs,
    status: "pending",
  };
}

/**
 * Build an MCQ for write confirmation (Gap 6).
 * Used before destructive actions (delete, void, etc.).
 */
export function buildWriteConfirmationMCQ(
  action: string,
  recordDescription: string,
  details: string,
  pendingTool: string,
  pendingArgs: Record<string, unknown>,
): MCQState {
  return {
    conversationId: "",
    entityId: "",
    mcqType: "write_confirmation",
    question: `Are you sure you want to ${action} ${recordDescription}?`,
    options: [
      { label: `Yes, ${action}`, value: "confirm", description: details },
      { label: "No, cancel", value: "cancel" },
    ],
    context: { action, recordDescription },
    pendingTool,
    pendingArgs,
    status: "pending",
  };
}

/**
 * Build an MCQ for parameter resolution (Gap 5).
 */
export function buildParameterResolutionMCQ(
  paramName: string,
  options: MCQOption[],
  pendingTool: string,
  pendingArgs: Record<string, unknown>,
): MCQState {
  return {
    conversationId: "",
    entityId: "",
    mcqType: "parameter_resolution",
    question: `Which ${paramName} would you like to use?`,
    options,
    context: { paramName },
    pendingTool,
    pendingArgs,
    status: "pending",
  };
}

/**
 * Build SSE events for MCQ.
 */
export function buildMCQSSEEvent(state: MCQState): {
  type: string;
  data: Record<string, unknown>;
} {
  return {
    type: "mcq_prompt",
    data: {
      mcqId: state.id,
      mcqType: state.mcqType,
      question: state.question,
      options: state.options,
      pendingTool: state.pendingTool,
      context: state.context,
    },
  };
}
