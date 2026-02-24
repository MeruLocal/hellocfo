import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { classifyQuery, type QueryCategory } from './classifier.ts';
import { createMCPClient } from './mcp-client.ts';
import { selectMcpToolsForQuery } from './tool-search.ts';
import { buildAgentInput } from './attachments.ts';
import { executeMasterAgent, type LLMConfig } from './agents.ts';
import {
  buildCreatedDocs,
  applyWriteGuardrails,
  collectToolResultsFromRunItems,
  extractTextFromRunResult,
  type ToolExecutionResult,
} from './result-mapper.ts';
import {
  normalizeConversationHistory,
  parseConversationMessages,
  isConfirmationMessage,
  extractPendingAction,
  mergePendingActionArgs,
  detectDetailLookup,
  extractCreatedDocs,
  normalizeDocRef,
  isBulkListQuery,
  detectRequestedEntities,
  isPaginationFollowUp,
  extractPaginationState,
  buildPaginationStateFromToolResults,
  isWriteTool,
  type Attachment,
  type ChatMessage,
} from './conversation-state.ts';
import { logFeedback } from './feedback-logger.ts';
import { logLLMPathPattern, checkForSuggestedIntents } from '../_shared/rl-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, h-authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SSEEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

interface RunPayload {
  query: string;
  conversationId?: string;
  conversationHistory?: ChatMessage[];
  stream?: boolean;
  entityId?: string;
  orgId?: string;
  attachments?: Attachment[];
}

interface PromptEventData {
  tool?: string;
  requestedTool?: string;
  success?: boolean;
  attempts?: number;
  recordCount?: number;
  isWrite?: boolean;
  [key: string]: unknown;
}

function getUserFacingErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('fetch failed')) {
    return "I couldn't reach the AI service right now. Please try again in a moment. If this keeps happening, check LLM endpoint and API key in settings.";
  }
  if (lower.includes('llm service unreachable')) {
    return "I couldn't reach the AI service right now. Please verify LLM endpoint and API key in settings.";
  }
  if (lower.includes('401') && lower.includes('api')) {
    return 'AI credentials look invalid. Please verify the LLM API key and endpoint in settings.';
  }
  if (lower.includes('429')) {
    return 'The AI service is rate-limited right now. Please wait a moment and try again.';
  }
  if (lower.includes('404')) {
    return 'LLM endpoint appears misconfigured. Please verify endpoint and model settings.';
  }
  if (lower.includes('mcp connection failed')) {
    return 'HelloBooks connection failed. Please reconnect and try again.';
  }
  return "I couldn't complete this request right now. Please try again in a moment.";
}

function extractToolName(item: Record<string, unknown>): string | null {
  const direct = item.toolName || item.name || (item.function as Record<string, unknown> | undefined)?.name;
  if (typeof direct === 'string' && direct.trim()) return direct;
  const raw = item.rawItem as Record<string, unknown> | undefined;
  if (raw && typeof raw.name === 'string' && raw.name.trim()) return raw.name;
  return null;
}

function extractToolResultSummary(item: Record<string, unknown>): { success: boolean; recordCount: number } {
  const content = item.output ?? item.result ?? item.content ?? (item.rawItem as Record<string, unknown> | undefined)?.output;
  const text = typeof content === 'string' ? content : JSON.stringify(content || '');
  let recordCount = 1;
  let success = true;

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) recordCount = parsed.length;
    if (parsed && typeof parsed === 'object' && ('error' in parsed || 'Error' in parsed)) success = false;
  } catch (_e) {
    if (/^(error:|\{\s*"error")/i.test(text)) success = false;
  }

  return { success, recordCount };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized', code: 'MISSING_AUTH' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const token = authHeader.replace('Bearer ', '').trim();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token', code: 'INVALID_TOKEN' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: RunPayload;
  try {
    body = await req.json();
  } catch (_e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const {
    query,
    conversationId,
    conversationHistory: rawConversationHistory = [],
    stream = true,
    entityId,
    orgId,
    attachments,
  } = body;

  if (!query || typeof query !== 'string') {
    return new Response(JSON.stringify({ error: 'Query is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const normalizedConversationId = typeof conversationId === 'string' ? conversationId.trim() : '';
  const effectiveConversationId = normalizedConversationId || crypto.randomUUID();

  let conversationHistory = normalizeConversationHistory(rawConversationHistory || []);

  if (normalizedConversationId) {
    try {
      const { data: existingRows, error: historyLoadError } = await supabase
        .from('unified_conversations')
        .select('messages')
        .eq('conversation_id', effectiveConversationId)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (historyLoadError) throw historyLoadError;

      const persistedHistory = parseConversationMessages(existingRows?.[0]?.messages);
      if (persistedHistory.length > 0) {
        conversationHistory = persistedHistory;
      }
    } catch (historyError) {
      console.warn('[chat-agent-api] Failed to load persisted conversation history:', historyError);
    }
  }

  const { data: llmConfig, error: llmError } = await supabase
    .from('llm_configs')
    .select('*')
    .eq('is_default', true)
    .single();

  if (llmError || !llmConfig?.api_key) {
    return new Response(JSON.stringify({ error: 'LLM not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const hAuthHeader = req.headers.get('H-Authorization');
  const mcpAuthFromHeader = hAuthHeader?.startsWith('Bearer ') ? hAuthHeader.replace('Bearer ', '').trim() : null;
  const mcpAuthToken = mcpAuthFromHeader || Deno.env.get('MCP_HELLOBOOKS_AUTH_TOKEN') || '';
  const mcpEntityId = entityId || Deno.env.get('MCP_HELLOBOOKS_ENTITY_ID') || '';
  const mcpOrgId = orgId || Deno.env.get('MCP_HELLOBOOKS_ORG_ID') || '';
  const effectiveEntityId = mcpEntityId || 'default';

  const isConfirmation = isConfirmationMessage(query);
  const pendingActionBase = isConfirmation ? extractPendingAction(conversationHistory) : null;
  const pendingAction = isConfirmation ? mergePendingActionArgs(pendingActionBase, query) : null;

  const classification = classifyQuery(query);
  let effectiveCategory: QueryCategory = classification.category;
  if (isConfirmation) effectiveCategory = 'unified';

  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array>;

  const responseStream = new ReadableStream({
    start(controller) { streamController = controller; },
    cancel() { /* connection closed */ },
  });

  const sendEvent = (type: string, data: unknown) => {
    const event: SSEEvent = { type, data, timestamp: new Date().toISOString() };
    const message = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
    try {
      streamController.enqueue(encoder.encode(message));
    } catch (_e) {
      // client disconnected
    }
  };

  const sendComplete = (data: Record<string, unknown>) => {
    sendEvent('complete', {
      conversationId: effectiveConversationId,
      ...data,
    });
  };

  const closeStream = () => {
    try {
      streamController.close();
    } catch (_e) {
      // already closed
    }
  };

  const startTime = Date.now();

  (async () => {
    const apiMessageId = crypto.randomUUID().slice(0, 8);
    let feedbackPath = 'unknown';
    let feedbackIntent: string | null = null;
    let feedbackIntentConfidence: number | null = null;
    let feedbackModel: string | null = `${(llmConfig as LLMConfig).provider}/${(llmConfig as LLMConfig).model}`;
    let feedbackToolsLoaded: string[] = [];
    let feedbackToolsUsed: string[] = [];
    let feedbackStrategy: string | null = null;
    let feedbackResponse: string | null = null;
    let feedbackTokenCost: number | null = null;
    let feedbackCategory: QueryCategory | 'unknown' = effectiveCategory;
    let allToolResults: ToolExecutionResult[] = [];

    let mcpTools: Array<{ name: string; description: string; inputSchema: unknown }> = [];
    let agentClose: (() => Promise<void>) | null = null;

    try {
      sendEvent('connected', {
        sessionId: effectiveConversationId,
        conversationId: effectiveConversationId,
        userId: user.id,
        messageId: apiMessageId,
      });
      sendEvent('understanding_started', { message: 'Analyzing your query...' });

      const needsTools = effectiveCategory !== 'general_chat';
      sendEvent('route_started', { query, intentCount: 0, mcpToolCount: 0 });

      const mcpMissing = !mcpAuthToken || !mcpEntityId || !mcpOrgId;
      if (!mcpMissing) {
        try {
          const mcpBaseUrl = Deno.env.get('MCP_BASE_URL') || '';
          if (mcpBaseUrl) {
            const mcpProbe = await createMCPClient(apiMessageId, mcpBaseUrl, mcpAuthToken, mcpEntityId, mcpOrgId);
            if (mcpProbe) {
              mcpTools = mcpProbe.tools;
              mcpProbe.client.close();
            }
          }
        } catch (mcpError) {
          console.warn('[chat-agent-api] MCP probe failed:', mcpError);
        }
      }

      if (needsTools && mcpTools.length === 0 && !isConfirmation) {
        const missingParts: string[] = [];
        if (!mcpAuthToken) missingParts.push('H-Authorization');
        if (!mcpEntityId) missingParts.push('entityId');
        if (!mcpOrgId) missingParts.push('orgId');

        const errorMsg = missingParts.length > 0
          ? `HelloBooks connection is not active. Please reconnect and retry. Missing: ${missingParts.join(', ')}`
          : 'HelloBooks connection could not be established. Please check your connection and try again.';

        sendEvent('route_classified', { path: 'error', category: 'mcp_unavailable' });
        sendEvent('response_chunk', { text: errorMsg });
        sendComplete({
          success: false,
          query,
          path: 'error',
          response: errorMsg,
          matchedIntent: null,
          reasoning: 'MCP not connected',
          executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
        });

        feedbackPath = 'error_mcp';
        feedbackResponse = errorMsg;
        return;
      }

      const routeCategory = effectiveCategory === 'general_chat' ? 'general_chat' : 'unified';
      sendEvent('route_classified', {
        path: 'llm',
        category: routeCategory,
        confidence: classification.confidence,
        isConfirmation,
      });

      const toolSearch = routeCategory === 'unified'
        ? selectMcpToolsForQuery(query, mcpTools, {
            requiredToolNames: pendingAction?.toolName ? [pendingAction.toolName] : [],
          })
        : {
            selectedToolNames: [] as string[],
            matchedCategories: ['general_chat'],
            strategy: 'general_chat_bypass',
            totalTools: mcpTools.length,
          };

      feedbackToolsLoaded = toolSearch.selectedToolNames;
      feedbackStrategy = toolSearch.strategy;

      sendEvent('tools_filtered', {
        category: routeCategory,
        toolCount: toolSearch.selectedToolNames.length,
        totalMcpTools: toolSearch.totalTools,
        tools: toolSearch.selectedToolNames,
        strategy: toolSearch.strategy,
        groupsSelected: toolSearch.matchedCategories,
        isConfirmation,
      });

      const queryIsPaginationFollow = isPaginationFollowUp(query);
      const queryPaginationState = queryIsPaginationFollow ? extractPaginationState(conversationHistory) : null;
      const queryIsBulk = isBulkListQuery(query);
      const requestedEntities = detectRequestedEntities(query);

      let paginationContext = '';
      if (queryIsPaginationFollow && queryPaginationState) {
        const stateEntries = Object.entries(queryPaginationState);
        const stateDesc = stateEntries.map(([tool, state]) =>
          `Tool "${tool}": returned ${state.returnedSoFar} so far, hasMore=${state.hasMore}, nextPage=${state.lastPage + 1}, offset=${state.lastOffset}`
        ).join('; ');
        paginationContext = `\n\n📄 PAGINATION CONTEXT: The user wants the NEXT page of results. Previous state: ${stateDesc}. Call the same list tool(s) with the next page/offset. Do NOT repeat the first page.`;
      }

      let bulkListContext = '';
      if (queryIsBulk && requestedEntities.length >= 2) {
        bulkListContext = `\n\n📋 MULTI-LIST REQUEST: The user asked for ${requestedEntities.join(' AND ')}. You MUST call SEPARATE list tools for EACH entity type. Do NOT call just one tool. Call them all and present results in separate sections.`;
      }

      const detailLookup = detectDetailLookup(query);
      let detailLookupContext = '';
      if (detailLookup) {
        const createdDocs = extractCreatedDocs(conversationHistory);
        const normalizedRef = normalizeDocRef(detailLookup.docRef);
        const matchedDoc = createdDocs.find(d => d.docNumber && normalizeDocRef(d.docNumber) === normalizedRef);

        if (matchedDoc && matchedDoc.internalId) {
          detailLookupContext = `\n\n🔍 DOCUMENT LOOKUP CONTEXT: The user is asking about ${detailLookup.docType} "${detailLookup.docRef}". This document was created in this conversation. Internal ID: ${matchedDoc.internalId}. Use the get/view detail tool with this internal ID to fetch full details. If the first lookup returns empty, retry once after a brief pause — the record may still be syncing.`;
        } else {
          detailLookupContext = `\n\n🔍 DOCUMENT LOOKUP CONTEXT: The user is asking about ${detailLookup.docType} "${detailLookup.docRef}". Search by the document NUMBER/reference, NOT by ID. Use a search or find tool with the invoice/bill number parameter. If not found on first try and the document was recently created, retry once. Do NOT call get_invoice_by_id with the human-readable number — that requires an internal ID.`;
        }
      }

      const { input, attachmentWarnings } = await buildAgentInput(query, conversationHistory, attachments);
      if (attachmentWarnings.length > 0) {
        console.warn('[chat-agent-api] Attachment warnings:', attachmentWarnings);
      }

      const mcpBaseUrl = Deno.env.get('MCP_BASE_URL') || '';
      const execution = await executeMasterAgent(llmConfig as LLMConfig, input, {
        routeCategory,
        query,
        selectedToolNames: toolSearch.selectedToolNames,
        mcpBaseUrl,
        mcpAuthToken,
        entityId: mcpEntityId,
        orgId: mcpOrgId,
        isConfirmation,
        pendingActionSummary: pendingAction?.summary,
        pendingActionTool: pendingAction?.toolName,
        paginationContext,
        bulkListContext,
        detailLookupContext,
      });
      agentClose = execution.close;

      const runItems: unknown[] = [];
      const pendingToolCalls = new Set<string>();

      sendEvent('response_generating', { path: 'llm', category: routeCategory });

      for await (const rawEvent of execution.runResult) {
        const event = rawEvent as Record<string, unknown>;
        const eventType = String(event.type || '');

        if (eventType !== 'run_item_stream_event') continue;

        const itemUnknown = event.item || (event.data as Record<string, unknown> | undefined)?.item;
        if (!itemUnknown || typeof itemUnknown !== 'object') continue;

        const item = itemUnknown as Record<string, unknown>;
        runItems.push(item);

        const itemType = String(item.type || (item.rawItem as Record<string, unknown> | undefined)?.type || '').toLowerCase();
        const toolName = extractToolName(item);

        const isToolCall = itemType.includes('tool_call') || itemType.includes('function_call');
        const isToolResult = itemType.includes('tool_result') || itemType.includes('tool_output') || itemType.includes('function_call_output') || itemType.includes('tool_call_output');

        if (isToolCall && toolName) {
          pendingToolCalls.add(toolName);
          const payload: PromptEventData = {
            tool: toolName,
            requestedTool: toolName,
            isWrite: isWriteTool(toolName),
          };
          sendEvent('executing_tool', payload);
        }

        if (isToolResult && toolName) {
          const summary = extractToolResultSummary(item);
          const payload: PromptEventData = {
            tool: toolName,
            success: summary.success,
            recordCount: summary.recordCount,
            attempts: 1,
            isWrite: isWriteTool(toolName),
          };
          sendEvent('tool_result', payload);
          pendingToolCalls.delete(toolName);
        }
      }

      if (pendingToolCalls.size > 0) {
        for (const toolName of pendingToolCalls) {
          sendEvent('tool_result', {
            tool: toolName,
            success: false,
            attempts: 1,
            recordCount: 0,
            isWrite: isWriteTool(toolName),
          });
        }
      }

      const runResultRecord = execution.runResult as Record<string, unknown>;
      const newItems = Array.isArray(runResultRecord.newItems) ? runResultRecord.newItems : [];
      const allItems = [...runItems, ...newItems];
      allToolResults = collectToolResultsFromRunItems(allItems);

      feedbackToolsUsed = allToolResults.filter(r => r.success).map(r => r.tool);

      let responseText = extractTextFromRunResult(runResultRecord);
      if (!responseText || !responseText.trim()) {
        const fallbackFromItems = allItems
          .map(item => {
            if (!item || typeof item !== 'object') return '';
            const rec = item as Record<string, unknown>;
            const text = rec.text || rec.content || rec.output_text;
            return typeof text === 'string' ? text : '';
          })
          .filter(Boolean)
          .join('\n')
          .trim();
        responseText = fallbackFromItems;
      }

      responseText = applyWriteGuardrails(responseText, allToolResults);
      if (!responseText) {
        responseText = "I couldn't generate a complete response right now. Please try again.";
      }

      const paramsMatch = responseText.match(/```params\s*\n?([\s\S]*?)\n?\s*```/);
      if (paramsMatch) {
        try {
          const paramsData = JSON.parse(paramsMatch[1].trim());
          sendEvent('extraction_state', paramsData);
        } catch (_e) {
          // ignore parse failures in params block
        }
        responseText = responseText.replace(/```params\s*\n?[\s\S]*?\n?\s*```/, '').trim();
      }

      const chunkSize = 50;
      for (let i = 0; i < responseText.length; i += chunkSize) {
        sendEvent('response_chunk', { text: responseText.slice(i, i + chunkSize) });
        await new Promise(resolve => setTimeout(resolve, 20));
      }

      const createdDocsForComplete = buildCreatedDocs(allToolResults);

      sendComplete({
        success: true,
        query,
        path: 'llm',
        category: routeCategory,
        matchedIntent: null,
        extractedEntities: {},
        reasoning: isConfirmation ? 'Confirmation flow: executed pending action' : `Classified as ${routeCategory}`,
        pipelineSteps: allToolResults.map(r => ({ tool: r.tool, description: r.success ? 'Completed' : `Error: ${r.error || 'Tool failed'}` })),
        enrichments: [],
        toolResults: allToolResults.map(r => ({ tool: r.tool, success: r.success, error: r.error, attempts: r.attempts })),
        response: responseText,
        executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
        isConfirmation,
        ...(createdDocsForComplete.length > 0 ? { createdDocs: createdDocsForComplete } : {}),
      });

      feedbackPath = 'llm';
      feedbackIntent = null;
      feedbackIntentConfidence = null;
      feedbackResponse = responseText;
      feedbackCategory = routeCategory;

    } catch (error) {
      console.error('[chat-agent-api] Error:', error);
      const safeMessage = getUserFacingErrorMessage(error);
      feedbackPath = 'error';
      feedbackResponse = safeMessage;
      sendEvent('error', { message: safeMessage, code: 'PROCESSING_ERROR' });
      sendEvent('response_chunk', { text: safeMessage });
      sendComplete({
        success: false,
        query,
        path: 'error',
        response: safeMessage,
        matchedIntent: null,
        reasoning: 'Processing failed',
        executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
      });
    } finally {
      try {
        if (agentClose) await agentClose();
      } catch (closeError) {
        console.warn('[chat-agent-api] Failed to close MCP server:', closeError);
      }

      try {
        const userMsg = {
          id: crypto.randomUUID(),
          role: 'user',
          content: query,
          timestamp: new Date().toISOString(),
        };

        let pendingToolForMeta: string | null = null;
        let pendingArgsForMeta: Record<string, unknown> | null = null;
        let pendingSummaryForMeta: string | null = null;

        const writeToolResults = allToolResults.filter(r => isWriteTool(r.tool));
        if (writeToolResults.length > 0) {
          const lastWrite = writeToolResults[writeToolResults.length - 1];
          pendingToolForMeta = lastWrite.tool;
          pendingArgsForMeta = lastWrite.input || {};
          pendingSummaryForMeta = (feedbackResponse || '').slice(0, 300);
        }

        if (!pendingToolForMeta && feedbackResponse) {
          const proposalMatch = feedbackResponse.match(/(create|update)\s+(?:the\s+)?(?:this\s+)?(invoice|bill|payment|customer|vendor)/i);
          if (proposalMatch) {
            pendingToolForMeta = `${proposalMatch[1].toLowerCase()}_${proposalMatch[2].toLowerCase()}`;
            pendingSummaryForMeta = feedbackResponse.slice(0, 300);
            const relatedResult = allToolResults.find(r => r.tool.toLowerCase().includes(proposalMatch[2].toLowerCase()));
            if (relatedResult?.input) pendingArgsForMeta = relatedResult.input;
          }
        }

        const createdDocsForMeta = buildCreatedDocs(allToolResults);
        const paginationStateForMeta = buildPaginationStateFromToolResults(
          conversationHistory,
          allToolResults.map(r => ({ tool: r.tool, result: r.result, success: r.success })),
        );

        const agentMsg = {
          id: apiMessageId,
          role: 'agent',
          content: feedbackResponse || '',
          timestamp: new Date().toISOString(),
          metadata: {
            route: feedbackPath,
            category: feedbackCategory,
            intent: feedbackIntent ? { name: feedbackIntent, confidence: feedbackIntentConfidence } : null,
            toolsUsed: feedbackToolsUsed,
            toolsLoaded: feedbackToolsLoaded,
            executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
            llmModel: feedbackModel,
            isConfirmation,
            ...(pendingToolForMeta ? {
              pendingTool: pendingToolForMeta,
              pendingArgs: pendingArgsForMeta || {},
              pendingSummary: pendingSummaryForMeta || '',
            } : {}),
            ...(paginationStateForMeta ? {
              pendingPagination: paginationStateForMeta,
            } : {}),
            ...(createdDocsForMeta.length > 0 ? {
              createdDocs: createdDocsForMeta,
            } : {}),
          },
        };

        const { data: existingRows, error: existingLookupError } = await supabase
          .from('unified_conversations')
          .select('id, messages, message_count')
          .eq('conversation_id', effectiveConversationId)
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (existingLookupError) throw existingLookupError;
        const existing = existingRows?.[0];

        if (existing) {
          const existingMessages = (existing.messages as unknown[]) || [];
          const updatedMessages = [...existingMessages, userMsg, agentMsg];
          const { error: updateError } = await supabase
            .from('unified_conversations')
            .update({
              messages: updatedMessages,
              message_count: updatedMessages.length,
              updated_at: new Date().toISOString(),
              last_message_preview: (feedbackResponse || '').slice(0, 200),
              mode: feedbackCategory || 'unified',
              entity_id: effectiveEntityId,
              org_id: mcpOrgId || null,
            })
            .eq('id', existing.id);
          if (updateError) {
            console.error('[chat-agent-api] Failed to UPDATE conversation:', updateError);
            sendEvent('conversation_save_error', { error: 'update_failed' });
          }
        } else {
          const { error: insertError } = await supabase.from('unified_conversations').insert({
            conversation_id: effectiveConversationId,
            entity_id: effectiveEntityId,
            org_id: mcpOrgId || null,
            user_id: user.id,
            summary: query.slice(0, 100),
            messages: [userMsg, agentMsg],
            message_count: 2,
            auto_generated_name: query.slice(0, 80),
            mode: feedbackCategory || 'unified',
            last_message_preview: (feedbackResponse || '').slice(0, 200),
          });
          if (insertError) {
            console.error('[chat-agent-api] Failed to INSERT conversation:', JSON.stringify(insertError));
            sendEvent('conversation_save_error', { error: 'insert_failed', detail: insertError.message || String(insertError) });
          }
        }
      } catch (convError) {
        console.error('[chat-agent-api] Failed to persist conversation:', convError);
        try {
          sendEvent('conversation_save_error', { error: String(convError) });
        } catch (_e) {
          // stream may be closed
        }
      }

      try {
        const responseTimeMs = Date.now() - startTime;
        await logFeedback(supabase, {
          message_id: apiMessageId,
          conversation_id: effectiveConversationId,
          entity_id: effectiveEntityId,
          user_id: user.id,
          user_message: query,
          assistant_response: feedbackResponse,
          route_path: feedbackPath,
          intent_matched: feedbackIntent,
          intent_confidence: feedbackIntentConfidence,
          model_used: feedbackModel,
          tools_loaded: feedbackToolsLoaded,
          tools_used: feedbackToolsUsed,
          tool_selection_strategy: feedbackStrategy,
          response_time_ms: responseTimeMs,
          token_cost: feedbackTokenCost,
          implicit_signals: { source: 'chat-agent-api', isConfirmation, stream },
        }, 'chat-agent-api');

        if (feedbackPath === 'llm') {
          await logLLMPathPattern(supabase, {
            queryText: query,
            entityId: effectiveEntityId,
            toolsUsed: feedbackToolsUsed || [],
            toolSelectionStrategy: feedbackStrategy || 'unknown',
            responseTimeMs,
          }, 'chat-agent-api');
          if (Math.random() < 0.1) {
            await checkForSuggestedIntents(supabase, 'chat-agent-api');
          }
        }
      } catch (feedbackError) {
        console.warn('[chat-agent-api] Feedback logging failed:', feedbackError);
      }

      closeStream();
    }
  })();

  return new Response(responseStream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});
