import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;
import {
  selectToolsForQuery,
  buildOpenAIToolsFromMcp,
  type OpenAITool,
} from "./tool-groups.ts";
import { classifyQuery, type QueryCategory } from "./classifier.ts";
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
import { logIntentRouting, logLLMPathPattern, checkForSuggestedIntents } from "../_shared/rl-logger.ts";
import { createMCPClient, StreamableMCPClient } from "./mcp-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_TOOL_RESULT_CHARS = 50000;
const SIMPLE_DIRECT_LLM_MODE = true;

const DEFAULT_AZURE_OPENAI_ENDPOINT = "https://lovable-hellobooks-resource.cognitiveservices.azure.com/openai/v1/";

interface LLMConfig {
  id: string;
  provider: string;
  model: string;
  api_key: string | null;
  endpoint: string | null;
  max_tokens: number;
  temperature: number;
}

// SSE Event Types (extended for hybrid routing)
type SSEEventType =
  | "connected"
  | "understanding_started"
  | "route_started"
  | "route_classified"
  | "tools_filtered"
  | "intent_detecting"
  | "intent_detected"
  | "entities_extracted"
  | "pipeline_planned"
  | "pipeline_executing"
  | "enrichments_planned"
  | "enrichments_applying"
  | "executing_tool"
  | "tool_result"
  | "mode_switch"
  | "response_generating"
  | "response_chunk"
  | "complete"
  | "error";

interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  timestamp: string;
}

function truncateResult(result: string, maxChars: number = MAX_TOOL_RESULT_CHARS): string {
  if (result.length <= maxChars) return result;
  try {
    const parsed = JSON.parse(result);
    if (Array.isArray(parsed)) {
      const truncated: unknown[] = [];
      let currentLength = 2;
      for (const item of parsed) {
        const itemStr = JSON.stringify(item);
        if (currentLength + itemStr.length + 1 > maxChars) break;
        truncated.push(item);
        currentLength += itemStr.length + 1;
      }
      return JSON.stringify(truncated) + `\n[Truncated: showing ${truncated.length} of ${parsed.length} items]`;
    }
  } catch (_e) { /* not JSON */ }
  return result.slice(0, maxChars) + `\n[Truncated: ${result.length} chars total]`;
}

function resolveLLMBaseEndpoint(endpoint: string | null | undefined): string {
  const raw = (endpoint || "").trim();
  if (!raw) return DEFAULT_AZURE_OPENAI_ENDPOINT;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (
      host.endsWith(".supabase.co") ||
      path.includes("/functions/v1") ||
      path.endsWith("/v1/messages")
    ) {
      console.warn(`[realtime] LLM endpoint "${raw}" looks incompatible with chat/completions. Falling back to default endpoint.`);
      return DEFAULT_AZURE_OPENAI_ENDPOINT;
    }
    return raw;
  } catch (_e) {
    console.warn(`[realtime] Invalid LLM endpoint "${raw}". Falling back to default endpoint.`);
    return DEFAULT_AZURE_OPENAI_ENDPOINT;
  }
}

function getUserFacingErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("fetch failed")) {
    return "I couldn't reach the AI service right now. Please try again in a moment.";
  }
  if (lower.includes("llm service unreachable")) {
    return "I couldn't reach the AI service right now. Please verify endpoint and API key in settings.";
  }
  if (lower.includes("openai api error") && lower.includes("401")) {
    return "AI credentials look invalid. Please verify the LLM API key and endpoint.";
  }
  if (lower.includes("openai api error") && lower.includes("429")) {
    return "The AI service is rate-limited right now. Please wait a moment and try again.";
  }
  if (lower.includes("openai api error") && lower.includes("404")) {
    return "LLM endpoint appears misconfigured. Please verify endpoint and model settings.";
  }
  return "I couldn't complete this request right now. Please try again in a moment.";
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

function normalizeConversationMessages(history: unknown): ConversationMessage[] {
  if (!Array.isArray(history)) return [];
  const normalized: ConversationMessage[] = [];
  for (const item of history) {
    if (!item || typeof item !== "object") continue;
    const msg = item as Record<string, unknown>;
    const content = typeof msg.content === "string" ? msg.content.trim() : "";
    if (!content) continue;
    const roleRaw = typeof msg.role === "string" ? msg.role.toLowerCase() : "assistant";
    normalized.push({
      role: roleRaw === "user" ? "user" : "assistant",
      content,
    });
  }
  return normalized;
}

// MCPClient is now imported from mcp-client.ts (StreamableMCPClient)

// Call Azure OpenAI API
async function callOpenAI(
  config: LLMConfig,
  systemPrompt: string,
  messages: unknown[],
  tools: OpenAITool[],
  reqId: string,
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
  // Build the endpoint URL for Azure OpenAI
  const baseEndpoint = resolveLLMBaseEndpoint(config.endpoint);
  const endpoint = `${baseEndpoint.replace(/\/$/, "")}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "api-key": config.api_key || "",
  };

  // Build messages with system prompt
  const allMessages = [
    { role: "developer", content: systemPrompt },
    ...messages,
  ];

  const body: Record<string, unknown> = {
    model: config.model,
    max_completion_tokens: maxTokens || config.max_tokens || 4096,
    messages: allMessages,
  };
  if (tools.length > 0) body.tools = tools;

  console.log(`[${reqId}] Calling OpenAI: ${config.model} (${tools.length} tools)`);
  let res: Response;
  try {
    res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`LLM service unreachable: ${msg}`);
  }

  if (!res.ok) {
    const err = await res.text();
    console.error(`[${reqId}] OpenAI error: ${res.status} - ${err}`);
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
  const reqId = crypto.randomUUID().slice(0, 8);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const encoder = new TextEncoder();
  let mcpClientLegacy: null = null; // unused, kept for type compat

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (type: SSEEventType, data: unknown) => {
        const event: SSEEvent = { type, data, timestamp: new Date().toISOString() };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const requestPayload = await req.json();
        const {
          query,
          intents,
          businessContext,
          conversationHistory: incomingConversationHistory = [],
          conversationId: incomingConversationId,
          entityId: bodyEntityId,
          orgId: bodyOrgId,
        } = requestPayload as {
          query: string;
          // deno-lint-ignore no-explicit-any
          intents?: Array<Record<string, any>>;
          businessContext?: Record<string, unknown>;
          conversationHistory?: unknown[];
          conversationId?: string;
          entityId?: string;
          orgId?: string;
        };
        let conversationHistory = normalizeConversationMessages(incomingConversationHistory);
        if (!query) {
          sendEvent("error", { message: "Query required" });
          controller.close();
          return;
        }

        const startTime = Date.now();
        const messageId = reqId;
        console.log(`[${reqId}] Query: ${query}`);

        // Tracking vars for feedback logging
        let feedbackPath = "unknown";
        let feedbackIntent: string | null = null;
        let feedbackIntentConfidence: number | null = null;
        let feedbackModel: string | null = null;
        let feedbackToolsLoaded: string[] = [];
        let feedbackToolsUsed: string[] = [];
        let feedbackStrategy: string | null = null;
        let feedbackResponse: string | null = null;
        let feedbackTokenCost: number | null = null;

        sendEvent("connected", { requestId: reqId, messageId });
        sendEvent("understanding_started", { query });

        // ============================
        // STEP 1: Get LLM config + entity context
        // ============================
        const supabase: AnySupabaseClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

        // Entity isolation — entityId from request body/headers, fallback to env
        const entityId = bodyEntityId || req.headers.get("X-Entity-Id") || Deno.env.get("MCP_HELLOBOOKS_ENTITY_ID") || "default";
        const orgIdFromPayload = bodyOrgId || Deno.env.get("MCP_HELLOBOOKS_ORG_ID");

        // Prefer persisted conversation history when available
        if (incomingConversationId) {
          try {
            const { data: existingConversation } = await supabase
              .from("unified_conversations")
              .select("messages")
              .eq("conversation_id", incomingConversationId)
              .maybeSingle();
            const persisted = normalizeConversationMessages(existingConversation?.messages);
            if (persisted.length > 0) {
              conversationHistory = persisted;
              console.log(`[${reqId}] Loaded ${persisted.length} persisted history messages`);
            }
          } catch (historyError) {
            console.warn(`[${reqId}] Failed to load persisted conversation history:`, historyError);
          }
        }

        const { data: llmConfig, error: llmError } = await (supabase as AnySupabaseClient)
          .from("llm_configs")
          .select("*")
          .eq("is_default", true)
          .single();

        if (llmError || !llmConfig?.api_key) throw new Error("LLM not configured");

        // ============================
        // STEP 1.5: CACHE CHECK — skip MCP+LLM if cached
        // ============================
        const { cacheKey, queryHash } = generateCacheKey(query, entityId, "realtime");
        if (!SIMPLE_DIRECT_LLM_MODE) {
          const cachedResponse = await checkCache(supabase as AnySupabaseClient, entityId, cacheKey, reqId);

          if (cachedResponse) {
            console.log(`[${reqId}] Serving from cache`);
            sendEvent("route_classified", { path: "cached", reason: "Response served from cache" });
            sendEvent("response_chunk", { text: cachedResponse.content });
            sendEvent("complete", {
              query, path: "cached", matchedIntent: null, extractedEntities: {},
              reasoning: "Served from response cache", pipelineSteps: [], enrichments: [],
              responseFormat: "", response: cachedResponse.content, mcpToolResults: [], dataSources: [],
              llmModel: "cache", iterationCount: 0,
              usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
            });
            controller.close();
            return;
          }
        }

        // STEP 2: Connect to MCP using Streamable HTTP
        const hAuth = req.headers.get("H-Authorization") || req.headers.get("h-authorization");
        const authToken = (hAuth?.startsWith("Bearer ") ? hAuth.replace("Bearer ", "").trim() : hAuth) || Deno.env.get("MCP_HELLOBOOKS_AUTH_TOKEN");
        const orgId = orgIdFromPayload;
        const mcpBaseUrl = Deno.env.get("MCP_BASE_URL") || "";

        let mcpTools: Array<{ name: string; description: string; inputSchema: unknown }> = [];
        let mcpClientInstance: StreamableMCPClient | null = null;

        if (authToken && entityId && orgId) {
          try {
            const result = await createMCPClient(reqId, mcpBaseUrl, authToken, entityId, orgId);
            if (result) {
              mcpClientInstance = result.client;
              mcpTools = result.tools;
              console.log(`[${reqId}] MCP: ${mcpTools.length} tools loaded`);
            } else {
              sendEvent("error", { phase: "mcp_connection", message: "MCP initialization failed" });
            }
          } catch (error) {
            console.error(`[${reqId}] MCP connection failed:`, error);
            sendEvent("error", { phase: "mcp_connection", message: String(error) });
          }
        }

        // mcpToolNames no longer needed — we pass real MCP tool definitions directly

        // ============================
        // STEP 3: LAYER 1 — Intent matching against DB (free)
        // ============================
        const activeIntents = (intents || []).filter((i: Record<string, unknown>) => i.isActive);

        sendEvent("route_started", { query, intentCount: activeIntents.length, mcpToolCount: mcpTools.length });

        // Try to match intent from DB using training phrases
        let bestIntent: { id: string; name: string; moduleId?: string; description?: string; confidence: number; resolutionFlow?: Record<string, unknown> } | null = null;

        for (const intent of activeIntents) {
          const trainingPhrases = (intent.trainingPhrases || []) as string[];
          const queryLower = query.toLowerCase();
          const intentNameLower = intent.name.toLowerCase();

          for (const phrase of trainingPhrases) {
            const phraseLower = phrase.toLowerCase();
            if (queryLower === phraseLower) {
              bestIntent = { id: intent.id, name: intent.name, moduleId: intent.moduleId, description: intent.description, confidence: 0.95, resolutionFlow: intent.resolutionFlow };
              break;
            }
            if (queryLower.includes(phraseLower) || phraseLower.includes(queryLower)) {
              const similarity = Math.min(queryLower.length, phraseLower.length) / Math.max(queryLower.length, phraseLower.length);
              const candidateConfidence = 0.7 + similarity * 0.25;
              if (!bestIntent || candidateConfidence > bestIntent.confidence) {
                bestIntent = { id: intent.id, name: intent.name, moduleId: intent.moduleId, description: intent.description, confidence: candidateConfidence, resolutionFlow: intent.resolutionFlow };
              }
            }
          }

          if (queryLower.includes(intentNameLower) || intentNameLower.includes(queryLower)) {
            const nameConfidence = 0.6;
            if (!bestIntent || nameConfidence > bestIntent.confidence) {
              bestIntent = { id: intent.id, name: intent.name, moduleId: intent.moduleId, description: intent.description, confidence: nameConfidence, resolutionFlow: intent.resolutionFlow };
            }
          }

          if (bestIntent?.confidence === 0.95) break;
        }

        const CONFIDENCE_THRESHOLD = 0.85;
        const useFastPath = !SIMPLE_DIRECT_LLM_MODE && bestIntent !== null && bestIntent.confidence >= CONFIDENCE_THRESHOLD;

        console.log(`[${reqId}] Intent match: ${bestIntent?.name || "none"} (${bestIntent?.confidence?.toFixed(2) || 0}), fastPath: ${useFastPath}`);

        // ============================
        // STEP 4: Route decision
        // ============================

        if (useFastPath && bestIntent) {
          // ========== FAST PATH ==========
          sendEvent("route_classified", {
            path: "fast",
            intent: { name: bestIntent.name, confidence: bestIntent.confidence, description: bestIntent.description },
            reason: "High confidence intent match from DB",
          });

          sendEvent("intent_detected", {
            intent: { id: bestIntent.id, name: bestIntent.name, moduleId: bestIntent.moduleId, confidence: bestIntent.confidence, description: bestIntent.description },
            reasoning: `Matched training phrase with ${(bestIntent.confidence * 100).toFixed(0)}% confidence`,
          });

          // Execute the intent's fixed pipeline
          const resolutionFlow = bestIntent.resolutionFlow as { pipeline?: { mcpTool?: string; tool?: string; description?: string; purpose?: string }[]; enrichments?: { type: string; description?: string }[]; responseConfig?: { template?: string; format?: string } } | undefined;
          const pipeline = resolutionFlow?.pipeline || [];
          const enrichments = resolutionFlow?.enrichments || [];
          const responseConfig = resolutionFlow?.responseConfig;

          if (pipeline.length > 0) {
            sendEvent("pipeline_planned", {
              steps: pipeline.map((s) => ({ tool: s.mcpTool || s.tool, description: s.description, purpose: s.purpose })),
            });
          }

          if (enrichments.length > 0) {
            sendEvent("enrichments_planned", {
              enrichments: enrichments.map((e) => ({ type: e.type, description: e.description })),
              responseFormat: responseConfig?.format,
            });
          }

          // Execute pipeline steps via MCP
          const mcpResults: { tool: string; result?: string; error?: string; success: boolean }[] = [];

          if (mcpClientInstance && pipeline.length > 0) {
            sendEvent("pipeline_executing", { stepCount: pipeline.length });
            for (const step of pipeline) {
              const toolName = step.mcpTool || step.tool;
              if (!toolName) continue;
              sendEvent("executing_tool", { tool: toolName });
              try {
                // entity_id/org_id are already in the MCP URL query params — do not pass as tool args
                const mcpResult = await mcpClientInstance.callTool(toolName, {});
                const truncated = truncateResult(mcpResult);
                mcpResults.push({ tool: toolName, result: truncated, success: true });
                sendEvent("tool_result", { tool: toolName, success: true });
              } catch (err) {
                mcpResults.push({ tool: toolName, error: String(err), success: false });
                sendEvent("tool_result", { tool: toolName, success: false, error: String(err) });
              }
            }
          }

          // Apply enrichments
          if (enrichments.length > 0) {
            sendEvent("enrichments_applying", { enrichments: enrichments.map((e) => e.type) });
          }

          // Call cheapest LLM just for formatting (no tools)
          sendEvent("response_generating", { path: "fast", model: llmConfig.model });

          const dataContext = mcpResults
            .filter((r) => r.success)
            .map((r) => `[${r.tool}]: ${r.result}`)
            .join("\n\n");

          const enrichmentInstructions = enrichments.length > 0
            ? `\n\nENRICHMENTS TO APPLY:\n${enrichments.map((e) => `- ${e.type}: ${e.description || ""}`).join("\n")}`
            : "";

          const fastPathMessages = [
            ...conversationHistory,
            { role: "user", content: `Query: ${query}\n\nData fetched:\n${dataContext}${enrichmentInstructions}\n\n${responseConfig?.template ? `Format hint: ${responseConfig.template}` : ""}` },
          ];

          const fastSystemPrompt = `${SYSTEM_PROMPTS.fast_path}\n\nContext: ${businessContext?.country || "IN"}, ${businessContext?.currency || "INR"}`;

          const response = await callOpenAI(llmConfig, fastSystemPrompt, fastPathMessages, [], reqId, 2048);
          const finalResponse = response.message.content || "";

          sendEvent("response_chunk", { text: finalResponse });
          sendEvent("complete", {
            query,
            path: "fast",
            matchedIntent: { id: bestIntent.id, name: bestIntent.name, moduleId: bestIntent.moduleId, confidence: bestIntent.confidence, description: bestIntent.description },
            extractedEntities: {},
            reasoning: `Fast path: matched training phrase with ${(bestIntent.confidence * 100).toFixed(0)}% confidence`,
            pipelineSteps: pipeline.map((s) => ({ tool: s.mcpTool || s.tool, description: s.description, purpose: s.purpose })),
            enrichments: enrichments.map((e) => ({ type: e.type, description: e.description || "" })),
            responseFormat: responseConfig?.format || "",
            response: finalResponse,
            mcpToolResults: mcpResults.map((r) => ({ tool: r.tool, result: r.result, error: r.error, success: r.success })),
            dataSources: mcpResults.filter((r) => r.success).map((r) => r.tool),
            llmModel: `${llmConfig.provider}/${llmConfig.model}`,
            iterationCount: 1,
            usage: response.usage ? { input_tokens: response.usage.prompt_tokens || 0, output_tokens: response.usage.completion_tokens || 0, total_tokens: response.usage.total_tokens || 0 } : { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
          });

          // Track for feedback
          feedbackPath = "fast";
          feedbackIntent = bestIntent.name;
          feedbackIntentConfidence = bestIntent.confidence;
          feedbackModel = `${llmConfig.provider}/${llmConfig.model}`;
          feedbackToolsUsed = mcpResults.filter(r => r.success).map(r => r.tool);
          feedbackStrategy = "fast_path_intent";
          feedbackResponse = finalResponse;
          feedbackTokenCost = response.usage?.total_tokens || null;
          // Cache write — fast path (skip if write ops were used)
          const fastToolsUsed = mcpResults.map(r => r.tool);
          if (!SIMPLE_DIRECT_LLM_MODE && !hasWriteOperations(fastToolsUsed)) {
            const ttl = determineTTL("fast", "fast", fastToolsUsed);
            await writeCache(supabase as AnySupabaseClient, entityId, cacheKey, queryHash, query, finalResponse, "fast", ttl, reqId);
          } else if (hasWriteOperations(fastToolsUsed)) {
            await invalidateCacheForEntity(supabase as AnySupabaseClient, entityId, fastToolsUsed, reqId);
          }
          // ========== LLM PATH ==========

          // LAYER 1: Classify via keywords
          const classification = classifyQuery(query);
          const effectiveCategory = classification.category;

          sendEvent("route_classified", {
            path: "llm",
            category: effectiveCategory,
            confidence: classification.confidence,
            subCategory: classification.subCategory,
            matchedKeywords: classification.matchedKeywords,
            intentAttempted: bestIntent ? { name: bestIntent.name, confidence: bestIntent.confidence } : null,
          });

          if (bestIntent) {
            sendEvent("intent_detected", {
              intent: { id: bestIntent.id, name: bestIntent.name, moduleId: bestIntent.moduleId, confidence: bestIntent.confidence, description: bestIntent.description },
              reasoning: `Low confidence match (${(bestIntent.confidence * 100).toFixed(0)}%) — using LLM path with filtered tools`,
              lowConfidence: true,
            });
          }

          // Handle general chat — no tools needed
          if (!SIMPLE_DIRECT_LLM_MODE && effectiveCategory === "general_chat") {
            sendEvent("tools_filtered", { category: "general_chat", toolCount: 0, reason: "General conversation" });
            sendEvent("response_generating", { path: "llm", category: "general_chat" });

            const chatMessages = [...conversationHistory, { role: "user", content: query }];

            const response = await callOpenAI(llmConfig, SYSTEM_PROMPTS.general_chat, chatMessages, [], reqId, 512);
            const finalResponse = response.message.content || "";

            sendEvent("response_chunk", { text: finalResponse });
            sendEvent("complete", {
              query, path: "llm", category: "general_chat",
              matchedIntent: null, extractedEntities: {}, reasoning: "General conversation",
              pipelineSteps: [], enrichments: [], responseFormat: "", response: finalResponse,
              mcpToolResults: [], dataSources: [],
              llmModel: `${llmConfig.provider}/${llmConfig.model}`, iterationCount: 1,
              usage: response.usage ? { input_tokens: response.usage.prompt_tokens || 0, output_tokens: response.usage.completion_tokens || 0, total_tokens: response.usage.total_tokens || 0 } : { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
            });

            // Cache write — general chat (long TTL)
            if (!SIMPLE_DIRECT_LLM_MODE) {
              const chatTTL = determineTTL("llm", "general_chat", []);
              await writeCache(supabase as AnySupabaseClient, entityId, cacheKey, queryHash, query, finalResponse, "general_chat", chatTTL, reqId);
            }

            // Track for feedback
            feedbackPath = "general_chat";
            feedbackModel = `${llmConfig.provider}/${llmConfig.model}`;
            feedbackStrategy = "general_chat_bypass";
            feedbackResponse = finalResponse;
            feedbackTokenCost = response.usage?.total_tokens || null;

          } else {
            // LAYER 2: Select relevant tools via keyword matching against real MCP tools
            const toolSelection = SIMPLE_DIRECT_LLM_MODE
              ? { toolNames: mcpTools.map((t) => t.name), matchedCategories: ["all_mcp_tools"], strategy: "direct_llm_all_mcp_tools" }
              : selectToolsForQuery(query, effectiveCategory, mcpTools);
            let filteredTools = buildOpenAIToolsFromMcp(mcpTools, toolSelection.toolNames);

            // FALLBACK: If keyword filtering yielded 0 tools but MCP has tools, pass ALL of them.
            // This prevents the LLM from hallucinating that tools don't exist.
            const usingAllTools = filteredTools.length === 0 && mcpTools.length > 0;
            if (usingAllTools) {
              filteredTools = buildOpenAIToolsFromMcp(mcpTools, mcpTools.map(t => t.name));
              console.log(`[${reqId}] No keyword match — falling back to all ${filteredTools.length} MCP tools`);
            }

            sendEvent("tools_filtered", {
              category: effectiveCategory,
              toolCount: filteredTools.length,
              totalMcpTools: mcpTools.length,
              tools: filteredTools.map((t) => t.function.name),
              strategy: usingAllTools ? "all_tools_fallback" : toolSelection.strategy,
              groupsSelected: toolSelection.matchedCategories,
            });

            // Select model tier
            const modelSelection = selectModelTier(query, effectiveCategory);
            console.log(`[${reqId}] Model: ${modelSelection.tier} (${modelSelection.reason})`);

            // Build category-specific system prompt
            const categoryPrompt = SIMPLE_DIRECT_LLM_MODE
              ? "You are a finance assistant connected to live MCP tools. For every user request, call MCP tools when data/action is needed. Do not invent data. Use tool results as source of truth."
              : SYSTEM_PROMPTS.unified;
            let systemPrompt = `${categoryPrompt}\n\nContext: ${businessContext?.country || "IN"}, ${businessContext?.currency || "INR"}, ${businessContext?.industry || "General"}\nAvailable tools: ${filteredTools.map((t) => t.function.name).join(", ")}\n\n⚠️ TOOL USAGE RULE: When the user asks for "all" records (all invoices, all bills, all customers, etc.), you MUST call the appropriate list tool immediately. Never say you cannot list records — always use the available tool to fetch them. Only pass parameters that are explicitly defined in the tool's schema.`;

            // Build messages
            const messages: unknown[] = [...conversationHistory, { role: "user", content: query }];

            // Call LLM with filtered tools
            let response = await callOpenAI(llmConfig, systemPrompt, messages, filteredTools, reqId);
            let inputTokens = response.usage?.prompt_tokens || 0;
            let outputTokens = response.usage?.completion_tokens || 0;
            let iterations = 0;
            const mcpResults: { tool: string; input?: Record<string, unknown>; result?: string; error?: string; success: boolean }[] = [];

            // Handle tool call loop
            while (response.finish_reason === "tool_calls" && iterations < 10) {
              iterations++;
              const toolCalls = response.message.tool_calls || [];
              if (toolCalls.length === 0) break;

              // Add assistant message with tool calls to conversation
              messages.push(response.message);

              for (const toolCall of toolCalls) {
                const toolName = toolCall.function.name;
                let toolInput: Record<string, unknown> = {};
                try { toolInput = JSON.parse(toolCall.function.arguments); } catch (_e) { /* ok */ }

                if (mcpClientInstance) {
                  sendEvent("executing_tool", { tool: toolName, description: toolName });

                  try {
                    // entity_id/org_id are already in the MCP URL query params — do not pass as tool args
                    const mcpResult = await mcpClientInstance.callTool(toolName, toolInput);
                    const truncated = truncateResult(mcpResult);
                    mcpResults.push({ tool: toolName, input: toolInput, result: truncated, success: true });

                    let recordCount = 1;
                    try { const p = JSON.parse(mcpResult); if (Array.isArray(p)) recordCount = p.length; } catch (_e) { /* ok */ }
                    sendEvent("tool_result", { tool: toolName, success: true, recordCount });

                    messages.push({ role: "tool", tool_call_id: toolCall.id, content: truncated });
                  } catch (error) {
                    mcpResults.push({ tool: toolName, error: String(error), success: false });
                    sendEvent("tool_result", { tool: toolName, success: false, error: String(error) });
                    messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify({ error: String(error) }) });
                  }
                } else {
                  messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify({ error: "MCP not connected" }) });
                }
              }

              // Auto-apply enrichments based on data patterns
              const autoEnrichments = detectAutoEnrichments(mcpResults);
              if (autoEnrichments.length > 0) {
                sendEvent("enrichments_applying", { enrichments: autoEnrichments.map((e) => ({ type: e.type, description: e.description })) });
              }

              sendEvent("response_generating", { iteration: iterations, mcpCallsCompleted: mcpResults.filter((r) => r.success).length });

              // Add enrichment instructions to help LLM format better
              const enrichmentContext = buildEnrichmentInstructions(autoEnrichments);
              if (enrichmentContext && iterations === 1) {
                systemPrompt += `\n\n${enrichmentContext}`;
              }

              response = await callOpenAI(llmConfig, systemPrompt, messages, filteredTools, reqId);
              inputTokens += response.usage?.prompt_tokens || 0;
              outputTokens += response.usage?.completion_tokens || 0;
            }

            // Get final response
            const finalResponse = response.message.content || "";

            sendEvent("response_chunk", { text: finalResponse });

            // Auto enrichments for complete event
            const finalEnrichments = detectAutoEnrichments(mcpResults);

            sendEvent("complete", {
              query,
              path: "llm",
              category: effectiveCategory,
              matchedIntent: bestIntent ? { id: bestIntent.id, name: bestIntent.name, moduleId: bestIntent.moduleId, confidence: bestIntent.confidence, description: bestIntent.description } : null,
              extractedEntities: {},
              reasoning: bestIntent
                ? `Low confidence intent match (${(bestIntent.confidence * 100).toFixed(0)}%), used ${effectiveCategory} tools via LLM`
                : `No intent match, classified as ${effectiveCategory} via keywords`,
              pipelineSteps: mcpResults.map((r) => ({ tool: r.tool, description: r.success ? "Completed" : `Error: ${r.error}` })),
              enrichments: finalEnrichments.map((e) => ({ type: e.type, description: e.description })),
              responseFormat: (effectiveCategory as string) === "unified" ? "analytical" : "action-oriented",
              response: finalResponse,
              mcpToolResults: mcpResults,
              dataSources: mcpResults.filter((r) => r.success).map((r) => r.tool),
              llmModel: `${llmConfig.provider}/${llmConfig.model}`,
              iterationCount: iterations,
              usage: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
            });

            // Track for feedback
            feedbackPath = "llm";
            feedbackIntent = bestIntent?.name || null;
            feedbackIntentConfidence = bestIntent?.confidence || null;
            feedbackModel = `${llmConfig.provider}/${llmConfig.model}`;
            feedbackToolsLoaded = filteredTools.map(t => t.function.name);
            feedbackToolsUsed = mcpResults.filter(r => r.success).map(r => r.tool);
            feedbackStrategy = toolSelection.strategy;
            feedbackResponse = finalResponse;
            feedbackTokenCost = inputTokens + outputTokens;

            // Cache write — LLM path (skip if write ops)
            const llmToolsUsed = mcpResults.map(r => r.tool);
            if (!SIMPLE_DIRECT_LLM_MODE && !hasWriteOperations(llmToolsUsed)) {
              const ttl = determineTTL("llm", effectiveCategory, llmToolsUsed);
              await writeCache(supabase as AnySupabaseClient, entityId, cacheKey, queryHash, query, finalResponse, effectiveCategory, ttl, reqId);
            } else if (hasWriteOperations(llmToolsUsed)) {
              await invalidateCacheForEntity(supabase as AnySupabaseClient, entityId, llmToolsUsed, reqId);
            }
          }
        }

        // Cleanup (StreamableMCPClient.close() is a no-op but kept for consistency)
        mcpClientInstance?.close();
        const responseTimeMs = Date.now() - startTime;
        const effectiveConversationId = incomingConversationId || reqId;
        console.log(`[${reqId}] Done in ${(responseTimeMs / 1000).toFixed(2)}s`);

        // Persist conversation to unified_conversations
        try {
          const userMsg = {
            id: crypto.randomUUID(),
            role: "user",
            content: query,
            timestamp: new Date().toISOString(),
          };
          const agentMsg = {
            id: messageId,
            role: "agent",
            content: feedbackResponse || "",
            timestamp: new Date().toISOString(),
            metadata: {
              route: feedbackPath,
              intent: feedbackIntent ? { name: feedbackIntent, confidence: feedbackIntentConfidence } : null,
              toolsUsed: feedbackToolsUsed,
              toolsLoaded: feedbackToolsLoaded,
              executionTime: `${(responseTimeMs / 1000).toFixed(2)}s`,
              usage: { input_tokens: feedbackTokenCost || 0 },
              llmModel: feedbackModel,
            },
          };

          // Try to fetch existing conversation
          const { data: existing } = await supabase
            .from("unified_conversations")
            .select("id, messages, message_count")
            .eq("conversation_id", effectiveConversationId)
            .single();

          if (existing) {
            const existingMessages = (existing.messages as unknown[]) || [];
            const updatedMessages = [...existingMessages, userMsg, agentMsg];
            await supabase
              .from("unified_conversations")
              .update({
                messages: updatedMessages,
                message_count: updatedMessages.length,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id);
          } else {
            await supabase.from("unified_conversations").insert({
              conversation_id: effectiveConversationId,
              entity_id: entityId,
              user_id: "realtime-user",
              summary: query.slice(0, 100),
              messages: [userMsg, agentMsg],
              message_count: 2,
            });
          }
        } catch (convError) {
          console.error(`[${reqId}] Failed to persist conversation:`, convError);
        }

        // Non-blocking feedback log
        await logFeedback(supabase, {
          message_id: messageId,
          conversation_id: effectiveConversationId,
          entity_id: entityId,
          user_id: "realtime-user",
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
          implicit_signals: { source: "realtime" },
        }, reqId);

        // RL logging — intent routing stats or LLM path patterns
        if (feedbackPath === "fast" && feedbackIntent) {
          await logIntentRouting(supabase, {
            intentId: feedbackIntent,
            intentName: feedbackIntent,
            confidenceBucket: feedbackIntentConfidence ?? 0.85,
            success: !!feedbackResponse,
            responseTimeMs,
          }, reqId);
        } else if (feedbackPath === "llm" || feedbackPath === "llm_tools") {
          await logLLMPathPattern(supabase, {
            queryText: query,
            entityId: entityId,
            toolsUsed: feedbackToolsUsed || [],
            toolSelectionStrategy: feedbackStrategy || "unknown",
            responseTimeMs,
          }, reqId);
          if (Math.random() < 0.1) {
            await checkForSuggestedIntents(supabase, reqId);
          }
        }

        controller.close();

      } catch (error) {
        console.error(`[${reqId}] Error:`, error);
        sendEvent("error", { message: getUserFacingErrorMessage(error) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
});
