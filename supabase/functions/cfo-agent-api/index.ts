import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  selectToolsForQuery,
  buildOpenAIToolsFromMcp,
  type OpenAITool,
} from "./tool-groups.ts";
import { classifyQuery, detectCrossOver, type QueryCategory } from "./classifier.ts";
import { selectModelTier, SYSTEM_PROMPTS } from "./model-selector.ts";
import { detectAutoEnrichments, buildEnrichmentInstructions } from "./enrichment-auto-apply.ts";
import {
  generateCacheKey,
  checkCache,
  writeCache,
  determineTTL,
  invalidateCacheForEntity,
  hasWriteOperations,
} from "./response-cache.ts";
import { logFeedback } from "./feedback-logger.ts";
import { createMCPClient, StreamableMCPClient } from "./mcp-client.ts";

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

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface LLMConfig {
  id: string;
  provider: string;
  model: string;
  api_key: string | null;
  endpoint: string | null;
  max_tokens: number;
  temperature: number;
}

interface Intent {
  id: string;
  name: string;
  description: string;
  module_id: string;
  training_phrases: string[];
  entities: Record<string, unknown>[];
  resolution_flow: {
    dataPipeline?: { tool: string; mcpTool?: string; description: string; purpose?: string; nodeType?: string }[];
    enrichments?: { type: string; description: string }[];
    responseConfig?: { template: string; format: string };
  };
  is_active: boolean;
}

const MAX_TOOL_RESULT_CHARS = 50000;

function truncateResult(result: unknown, maxLength = 8000): string {
  const str = typeof result === 'string' ? result : JSON.stringify(result);
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + `... [truncated, ${str.length - maxLength} chars omitted]`;
}

// MCPClient is now imported from mcp-client.ts (StreamableMCPClient)

// Call Azure OpenAI API
async function callOpenAI(
  config: LLMConfig,
  systemPrompt: string,
  messages: unknown[],
  tools?: OpenAITool[],
  maxTokens?: number
): Promise<{
  finish_reason: string;
  message: {
    role: string;
    content: string | null;
    tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[];
  };
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}> {
  const baseEndpoint = config.endpoint || "https://lovable-hellobooks-resource.cognitiveservices.azure.com/openai/v1/";
  const endpoint = `${baseEndpoint.replace(/\/$/, "")}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "api-key": config.api_key || "",
  };

  const allMessages = [
    { role: "developer", content: systemPrompt },
    ...messages,
  ];

  const body: Record<string, unknown> = {
    model: config.model,
    max_completion_tokens: maxTokens || config.max_tokens || 4096,
    messages: allMessages,
  };
  if (tools && tools.length > 0) body.tools = tools;

  const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} - ${err.slice(0, 200)}`);
  }

  const result = await res.json();
  const choice = result.choices?.[0];
  if (!choice) throw new Error("No choices returned from OpenAI");

  return {
    finish_reason: choice.finish_reason,
    message: choice.message,
    usage: result.usage,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Validate Authorization
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized', code: 'MISSING_AUTH' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const token = authHeader.replace('Bearer ', '').trim();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token', code: 'INVALID_TOKEN' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  let body: {
    query: string;
    conversationId?: string;
    conversationHistory?: ChatMessage[];
    stream?: boolean;
    entityId?: string;
    orgId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { query, conversationId, conversationHistory = [], stream = true, entityId, orgId } = body;
  const hAuthHeader = req.headers.get('H-Authorization');
  const mcpAuthFromHeader = hAuthHeader?.startsWith('Bearer ') ? hAuthHeader.replace('Bearer ', '').trim() : null;

  if (!query || typeof query !== 'string') {
    return new Response(JSON.stringify({ error: 'Query is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Get LLM config
  const { data: llmConfig, error: llmError } = await supabase
    .from("llm_configs").select("*").eq("is_default", true).single();

  if (llmError || !llmConfig?.api_key) {
    return new Response(JSON.stringify({ error: 'LLM not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const mcpAuthToken = mcpAuthFromHeader || Deno.env.get('MCP_HELLOBOOKS_AUTH_TOKEN');
  const mcpEntityId = entityId || Deno.env.get('MCP_HELLOBOOKS_ENTITY_ID');
  const mcpOrgId = orgId || Deno.env.get('MCP_HELLOBOOKS_ORG_ID');
  const effectiveEntityId = mcpEntityId || "default";
  const startTime = Date.now();

  // ============================
  // CACHE CHECK — skip everything if cached
  // ============================
  const { cacheKey, queryHash } = generateCacheKey(query, effectiveEntityId, "api");
  const cachedResponse = await checkCache(supabase, effectiveEntityId, cacheKey, "api");

  if (cachedResponse) {
    // Return cached response immediately (no SSE needed)
    if (!stream) {
      return new Response(JSON.stringify({
        success: true, query, path: "cached", response: cachedResponse.content,
        matchedIntent: null, reasoning: "Served from cache",
        usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
        executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // SSE cached response
    const encoder = new TextEncoder();
    const cacheStream = new ReadableStream({
      start(controller) {
        const send = (type: string, data: unknown) => {
          const event: SSEEvent = { type, data, timestamp: new Date().toISOString() };
          controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(event)}\n\n`));
        };
        send('connected', { sessionId: conversationId || crypto.randomUUID(), userId: user.id });
        send('route_classified', { path: 'cached', reason: 'Response served from cache' });
        send('response_chunk', { text: cachedResponse.content });
        send('complete', {
          success: true, query, path: 'cached', response: cachedResponse.content,
          matchedIntent: null, reasoning: 'Served from cache',
          usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
          executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
        });
        controller.close();
      }
    });
    return new Response(cacheStream, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
    });
  }

  // Setup SSE stream
  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array>;

  const responseStream = new ReadableStream({
    start(controller) { streamController = controller; },
    cancel() { console.log('[SSE] Client disconnected'); }
  });

  const sendEvent = (type: string, data: unknown) => {
    const event: SSEEvent = { type, data, timestamp: new Date().toISOString() };
    const message = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
    try { streamController.enqueue(encoder.encode(message)); } catch { /* ignore */ }
  };

  const closeStream = () => {
    try { streamController.close(); } catch { /* ignore */ }
  };

  // Process in background
  (async () => {
    // mcpClientInstance is used instead (see below)

    const apiMessageId = crypto.randomUUID().slice(0, 8);
    let feedbackPath = "unknown";
    let feedbackIntent: string | null = null;
    let feedbackIntentConfidence: number | null = null;
    let feedbackModel: string | null = null;
    let feedbackToolsLoaded: string[] = [];
    let feedbackToolsUsed: string[] = [];
    let feedbackStrategy: string | null = null;
    let feedbackResponse: string | null = null;
    let feedbackTokenCost: number | null = null;

    try {
      sendEvent('connected', { sessionId: conversationId || crypto.randomUUID(), userId: user.id, messageId: apiMessageId });
      sendEvent('understanding_started', { message: 'Analyzing your query...' });

      // Fetch intents
      const { data: intents, error: intentsError } = await supabase
        .from('intents').select('*').eq('is_active', true);
      if (intentsError) throw new Error(`Failed to fetch intents: ${intentsError.message}`);

      // Connect to MCP using Streamable HTTP
      let mcpTools: { name: string; description: string; inputSchema: unknown }[] = [];
      let mcpClientInstance: StreamableMCPClient | null = null;

      console.log(`[api] MCP credentials check — auth:${!!mcpAuthToken}, entityId:${!!mcpEntityId}, orgId:${!!mcpOrgId}`);
      if (mcpAuthToken && mcpEntityId && mcpOrgId) {
        try {
          const mcpBaseUrl = Deno.env.get('MCP_BASE_URL') || '';
          const result = await createMCPClient(apiMessageId, mcpBaseUrl, mcpAuthToken, mcpEntityId, mcpOrgId);
          if (result) {
            mcpClientInstance = result.client;
            mcpTools = result.tools;
            console.log(`[api] MCP: ${mcpTools.length} tools loaded`);
          } else {
            sendEvent('error', { message: 'MCP connection failed: could not initialize', recoverable: true });
          }
        } catch (e) {
          sendEvent('error', { message: `MCP connection failed: ${e instanceof Error ? e.message : String(e)}`, recoverable: true });
        }
      }

      // mcpToolNames no longer needed — we pass real MCP tool definitions directly

      // ============================
      // LAYER 1: Intent matching against DB
      // ============================
      sendEvent('route_started', { query, intentCount: intents?.length || 0, mcpToolCount: mcpTools.length });

      let bestIntent: { id: string; name: string; description: string; confidence: number; resolution_flow?: Intent['resolution_flow'] } | null = null;

      for (const intent of (intents as Intent[]) || []) {
        const queryLower = query.toLowerCase();
        const trainingPhrases = intent.training_phrases || [];

        for (const phrase of trainingPhrases) {
          const phraseLower = (typeof phrase === 'string' ? phrase : '').toLowerCase();
          if (!phraseLower) continue;

          if (queryLower === phraseLower) {
            bestIntent = { id: intent.id, name: intent.name, description: intent.description, confidence: 0.95, resolution_flow: intent.resolution_flow };
            break;
          }
          if (queryLower.includes(phraseLower) || phraseLower.includes(queryLower)) {
            const similarity = Math.min(queryLower.length, phraseLower.length) / Math.max(queryLower.length, phraseLower.length);
            const candidateConfidence = 0.7 + similarity * 0.25;
            if (!bestIntent || candidateConfidence > bestIntent.confidence) {
              bestIntent = { id: intent.id, name: intent.name, description: intent.description, confidence: candidateConfidence, resolution_flow: intent.resolution_flow };
            }
          }
        }

        if (bestIntent?.confidence === 0.95) break;
      }

      const CONFIDENCE_THRESHOLD = 0.85;
      const useFastPath = bestIntent !== null && bestIntent.confidence >= CONFIDENCE_THRESHOLD;

      if (useFastPath && bestIntent) {
        // ========== FAST PATH ==========
        sendEvent('route_classified', { path: 'fast', intent: { name: bestIntent.name, confidence: bestIntent.confidence } });
        sendEvent('intent_detected', { intent: { id: bestIntent.id, name: bestIntent.name, confidence: bestIntent.confidence, description: bestIntent.description }, reasoning: `Matched with ${(bestIntent.confidence * 100).toFixed(0)}% confidence` });

        const resolutionFlow = bestIntent.resolution_flow || {};
        const pipeline = resolutionFlow.dataPipeline || [];
        const enrichments = resolutionFlow.enrichments || [];
        const responseConfig = resolutionFlow.responseConfig;

        if (pipeline.length > 0) sendEvent('pipeline_planned', { steps: pipeline.map(s => ({ tool: s.mcpTool || s.tool, description: s.description })) });
        if (enrichments.length > 0) sendEvent('enrichments_planned', { enrichments });

        // Execute pipeline
        const toolResults: { tool: string; success: boolean; data?: string; error?: string }[] = [];
        if (mcpClientInstance && pipeline.length > 0) {
          sendEvent('pipeline_executing', { stepCount: pipeline.length });
          for (const step of pipeline) {
            if (step.nodeType && step.nodeType !== 'api_call') continue;
            const toolName = step.mcpTool || step.tool;
            if (!toolName) continue;
            sendEvent('executing_tool', { tool: toolName });
            try {
              const mcpTool = mcpTools.find(t => t.name === toolName || t.name.toLowerCase().includes(toolName.toLowerCase()));
              if (mcpTool) {
                // Pass entity_id and org_id so HelloBooks MCP tools can scope the data
                const toolArgs: Record<string, unknown> = {};
                // Always inject entity_id and org_id — required for data scoping regardless of tool schema
                if (mcpEntityId) toolArgs.entity_id = mcpEntityId;
                if (mcpOrgId) toolArgs.org_id = mcpOrgId;
                console.log(`[api] Fast path calling tool: ${mcpTool.name} with args:`, JSON.stringify(toolArgs));
                const result = await mcpClientInstance!.callTool(mcpTool.name, toolArgs);
                console.log(`[api] Tool raw result for ${mcpTool.name}:`, result.slice(0, 500));
                const truncated = truncateResult(result);
                let recordCount = 1;
                try { const p = JSON.parse(result); if (Array.isArray(p)) recordCount = p.length; } catch { /* ok */ }
                toolResults.push({ tool: toolName, success: true, data: truncated });
                sendEvent('tool_result', { tool: toolName, success: true, recordCount });
              } else {
                toolResults.push({ tool: toolName, success: false, error: 'Tool not found' });
                sendEvent('tool_result', { tool: toolName, success: false, error: 'Tool not available' });
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Unknown error';
              toolResults.push({ tool: toolName, success: false, error: msg });
              sendEvent('tool_result', { tool: toolName, success: false, error: msg });
            }
          }
        }

        // Format with cheapest LLM
        sendEvent('response_generating', { path: 'fast' });

        const dataContext = toolResults.filter(r => r.success).map(r => `[${r.tool}]: ${r.data}`).join('\n\n');
        const fastSystemPrompt = SYSTEM_PROMPTS.fast_path;

        const response = await callOpenAI(llmConfig as LLMConfig, fastSystemPrompt, [
          ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: `Query: ${query}\n\nData:\n${dataContext}\n\n${responseConfig?.template ? `Format: ${responseConfig.template}` : ''}` }
        ], [], 2048);

        const responseText = response.message.content || '';

        // Stream response
        const chunkSize = 50;
        for (let i = 0; i < responseText.length; i += chunkSize) {
          sendEvent('response_chunk', { text: responseText.slice(i, i + chunkSize) });
          await new Promise(r => setTimeout(r, 20));
        }

        sendEvent('complete', {
          success: true, query, path: 'fast',
          matchedIntent: { id: bestIntent.id, name: bestIntent.name, confidence: bestIntent.confidence },
          extractedEntities: {}, reasoning: `Fast path: ${(bestIntent.confidence * 100).toFixed(0)}% confidence`,
          pipelineSteps: pipeline, enrichments,
          toolResults: toolResults.map(r => ({ tool: r.tool, success: r.success, error: r.error })),
          response: responseText,
          executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
        });

        // Cache write — fast path
        const fastToolsUsed = toolResults.map(r => r.tool);
        if (!hasWriteOperations(fastToolsUsed)) {
          const ttl = determineTTL("fast", "fast", fastToolsUsed);
          await writeCache(supabase, effectiveEntityId, cacheKey, queryHash, query, responseText, "fast", ttl, "api");
        } else {
          await invalidateCacheForEntity(supabase, effectiveEntityId, fastToolsUsed, "api");
        }

      } else {
        // ========== LLM PATH ==========
        const classification = classifyQuery(query);
        const effectiveCategory = classification.category;

        sendEvent('route_classified', {
          path: 'llm', category: effectiveCategory, confidence: classification.confidence,
          subCategory: classification.subCategory, matchedKeywords: classification.matchedKeywords,
          intentAttempted: bestIntent ? { name: bestIntent.name, confidence: bestIntent.confidence } : null,
        });

        if (bestIntent) {
          sendEvent('intent_detected', {
            intent: { id: bestIntent.id, name: bestIntent.name, confidence: bestIntent.confidence },
            reasoning: `Low confidence (${(bestIntent.confidence * 100).toFixed(0)}%) — using LLM path`,
            lowConfidence: true,
          });
        }

        if (effectiveCategory === 'general_chat') {
          sendEvent('tools_filtered', { category: 'general_chat', toolCount: 0 });
          sendEvent('response_generating', { path: 'llm', category: 'general_chat' });

          const response = await callOpenAI(llmConfig as LLMConfig,
            SYSTEM_PROMPTS.general_chat,
            [...conversationHistory.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: query }],
            [], 512
          );

          const responseText = response.message.content || '';
          const chunkSize = 50;
          for (let i = 0; i < responseText.length; i += chunkSize) {
            sendEvent('response_chunk', { text: responseText.slice(i, i + chunkSize) });
            await new Promise(r => setTimeout(r, 20));
          }

          sendEvent('complete', {
            success: true, query, path: 'llm', category: 'general_chat',
            matchedIntent: null, extractedEntities: {}, reasoning: 'General conversation',
            pipelineSteps: [], enrichments: [], response: responseText,
            executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
          });

          // Cache write — general chat
          const chatTTL = determineTTL("llm", "general_chat", []);
          await writeCache(supabase, effectiveEntityId, cacheKey, queryHash, query, responseText, "general_chat", chatTTL, "api");

          // Track for feedback
          feedbackPath = "general_chat";
          feedbackModel = `${(llmConfig as LLMConfig).provider}/${(llmConfig as LLMConfig).model}`;
          feedbackStrategy = "general_chat_bypass";
          feedbackResponse = responseText;

        } else {
          // Bookkeeper or CFO path with filtered tools
          const toolSelection = selectToolsForQuery(query, effectiveCategory);
          const filteredTools = buildOpenAIToolsFromMcp(mcpTools, toolSelection.toolNames);

          sendEvent('tools_filtered', {
            category: effectiveCategory, toolCount: filteredTools.length,
            totalMcpTools: mcpTools.length, tools: filteredTools.map(t => t.function.name),
            strategy: toolSelection.strategy, groupsSelected: toolSelection.matchedCategories,
          });

          const categoryPrompt = effectiveCategory === 'bookkeeper' ? SYSTEM_PROMPTS.bookkeeper : SYSTEM_PROMPTS.cfo;
          let systemPrompt = `${categoryPrompt}\n\nAvailable tools: ${filteredTools.map(t => t.function.name).join(', ')}`;

          const messages: unknown[] = [
            ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: query }
          ];

          let response = await callOpenAI(llmConfig as LLMConfig, systemPrompt, messages, filteredTools);
          let iterations = 0;
          const mcpResults: { tool: string; input?: Record<string, unknown>; result?: string; error?: string; success: boolean }[] = [];

          while (response.finish_reason === 'tool_calls' && iterations < 10) {
            iterations++;
            const toolCalls = response.message.tool_calls || [];
            if (toolCalls.length === 0) break;

            // Add assistant message with tool calls
            messages.push(response.message);

            for (const toolCall of toolCalls) {
              const toolName = toolCall.function.name;
              let toolInput: Record<string, unknown> = {};
              try { toolInput = JSON.parse(toolCall.function.arguments); } catch { /* ok */ }

              if (mcpClientInstance) {
                sendEvent('executing_tool', { tool: toolName });
                try {
                  // Always inject entity_id and org_id — HelloBooks MCP requires these for data scoping
                // Always inject entity_id and org_id — required for data scoping regardless of tool schema
                  if (mcpEntityId) toolInput.entity_id = mcpEntityId;
                  if (mcpOrgId) toolInput.org_id = mcpOrgId;
                  console.log(`[api] Calling tool: ${toolName} with args:`, JSON.stringify(toolInput));
                  const result = await mcpClientInstance!.callTool(toolName, toolInput);
                  const truncated = truncateResult(result);
                  mcpResults.push({ tool: toolName, input: toolInput, result: truncated, success: true });
                  let recordCount = 1;
                  try { const p = JSON.parse(result); if (Array.isArray(p)) recordCount = p.length; } catch { /* ok */ }
                  sendEvent('tool_result', { tool: toolName, success: true, recordCount });
                  messages.push({ role: 'tool', tool_call_id: toolCall.id, content: truncated });
                } catch (error) {
                  mcpResults.push({ tool: toolName, error: String(error), success: false });
                  sendEvent('tool_result', { tool: toolName, success: false, error: String(error) });
                  messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ error: String(error) }) });
                }
              } else {
                messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ error: 'MCP not available' }) });
              }
            }

            const autoEnrichments = detectAutoEnrichments(mcpResults);
            if (autoEnrichments.length > 0) sendEvent('enrichments_applying', { enrichments: autoEnrichments });

            sendEvent('response_generating', { iteration: iterations });

            const enrichmentContext = buildEnrichmentInstructions(autoEnrichments);
            if (enrichmentContext && iterations === 1) {
              systemPrompt += `\n\n${enrichmentContext}`;
            }

            response = await callOpenAI(llmConfig as LLMConfig, systemPrompt, messages, filteredTools);
          }

          const responseText = response.message.content || '';
          const chunkSize = 50;
          for (let i = 0; i < responseText.length; i += chunkSize) {
            sendEvent('response_chunk', { text: responseText.slice(i, i + chunkSize) });
            await new Promise(r => setTimeout(r, 20));
          }

          const finalEnrichments = detectAutoEnrichments(mcpResults);
          sendEvent('complete', {
            success: true, query, path: 'llm', category: effectiveCategory,
            matchedIntent: bestIntent ? { id: bestIntent.id, name: bestIntent.name, confidence: bestIntent.confidence } : null,
            extractedEntities: {},
            reasoning: bestIntent ? `Low confidence (${(bestIntent.confidence * 100).toFixed(0)}%), used ${effectiveCategory} tools` : `Classified as ${effectiveCategory}`,
            pipelineSteps: mcpResults.map(r => ({ tool: r.tool, description: r.success ? 'Completed' : `Error: ${r.error}` })),
            enrichments: finalEnrichments, toolResults: mcpResults.map(r => ({ tool: r.tool, success: r.success, error: r.error })),
            response: responseText,
            executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
          });

          // Cache write — LLM path
          const llmToolsUsed = mcpResults.map(r => r.tool);
          if (!hasWriteOperations(llmToolsUsed)) {
            const ttl = determineTTL("llm", effectiveCategory, llmToolsUsed);
            await writeCache(supabase, effectiveEntityId, cacheKey, queryHash, query, responseText, effectiveCategory, ttl, "api");
          } else {
            await invalidateCacheForEntity(supabase, effectiveEntityId, llmToolsUsed, "api");
          }

          // Track for feedback
          feedbackPath = "llm";
          feedbackIntent = bestIntent?.name || null;
          feedbackIntentConfidence = bestIntent?.confidence || null;
          feedbackModel = `${(llmConfig as LLMConfig).provider}/${(llmConfig as LLMConfig).model}`;
          feedbackToolsLoaded = filteredTools.map(t => t.function.name);
          feedbackToolsUsed = mcpResults.filter(r => r.success).map(r => r.tool);
          feedbackStrategy = toolSelection.strategy;
          feedbackResponse = responseText;
        }
      }

    } catch (error) {
      console.error('[Error]', error);
      sendEvent('error', { message: error instanceof Error ? error.message : 'An unexpected error occurred', code: 'PROCESSING_ERROR' });
    } finally {
      // Persist conversation to unified_conversations
      const effectiveConversationId = conversationId || apiMessageId;
      try {
        const userMsg = {
          id: crypto.randomUUID(),
          role: "user",
          content: query,
          timestamp: new Date().toISOString(),
        };
        const agentMsg = {
          id: apiMessageId,
          role: "agent",
          content: feedbackResponse || "",
          timestamp: new Date().toISOString(),
          metadata: {
            route: feedbackPath,
            intent: feedbackIntent ? { name: feedbackIntent, confidence: feedbackIntentConfidence } : null,
            toolsUsed: feedbackToolsUsed,
            toolsLoaded: feedbackToolsLoaded,
            executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
            llmModel: feedbackModel,
          },
        };

        const { data: existing } = await supabase
          .from("unified_conversations")
          .select("id, messages, message_count")
          .eq("conversation_id", effectiveConversationId)
          .single();

        if (existing) {
          const existingMessages = (existing.messages as unknown[]) || [];
          await supabase
            .from("unified_conversations")
            .update({
              messages: [...existingMessages, userMsg, agentMsg],
              message_count: (existing.message_count || 0) + 2,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("unified_conversations").insert({
            conversation_id: effectiveConversationId,
            entity_id: effectiveEntityId,
            user_id: user.id,
            summary: query.slice(0, 100),
            messages: [userMsg, agentMsg],
            message_count: 2,
          });
        }
      } catch (convError) {
        console.error('[Error] Failed to persist conversation:', convError);
      }

      // Non-blocking feedback log
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
        implicit_signals: { source: "api" },
      }, "api");

      mcpClientInstance?.close();
      closeStream();
    }
  })();

  return new Response(responseStream, {
    headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
  });
});
