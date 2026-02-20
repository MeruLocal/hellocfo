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
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_TOOL_RESULT_CHARS = 50000;

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
  } catch { /* not JSON */ }
  return result.slice(0, maxChars) + `\n[Truncated: ${result.length} chars total]`;
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
  const baseEndpoint = config.endpoint || "https://lovable-hellobooks-resource.cognitiveservices.azure.com/openai/v1/";
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
  const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });

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
        const { query, intents, businessContext, conversationHistory = [], conversationId: incomingConversationId } = await req.json();
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
        const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

        // Entity isolation — entityId from request body/headers, fallback to env
        const body = await req.clone().json().catch(() => ({}));
        const entityId = body?.entityId || req.headers.get("X-Entity-Id") || Deno.env.get("MCP_HELLOBOOKS_ENTITY_ID") || "default";

        const { data: llmConfig, error: llmError } = await supabase
          .from("llm_configs")
          .select("*")
          .eq("is_default", true)
          .single();

        if (llmError || !llmConfig?.api_key) throw new Error("LLM not configured");

        // ============================
        // STEP 1.5: CACHE CHECK — skip MCP+LLM if cached
        // ============================
        const { cacheKey, queryHash } = generateCacheKey(query, entityId, "realtime");
        const cachedResponse = await checkCache(supabase, entityId, cacheKey, reqId);

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

        // STEP 2: Connect to MCP using Streamable HTTP
        const hAuth = req.headers.get("H-Authorization") || req.headers.get("h-authorization");
        const authToken = (hAuth?.startsWith("Bearer ") ? hAuth.replace("Bearer ", "").trim() : hAuth) || Deno.env.get("MCP_HELLOBOOKS_AUTH_TOKEN");
        const orgId = body?.orgId || Deno.env.get("MCP_HELLOBOOKS_ORG_ID");
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
        const activeIntents = (intents || []).filter((i: { isActive: boolean }) => i.isActive);

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
        const useFastPath = bestIntent !== null && bestIntent.confidence >= CONFIDENCE_THRESHOLD;

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
          if (!hasWriteOperations(fastToolsUsed)) {
            const ttl = determineTTL("fast", "fast", fastToolsUsed);
            await writeCache(supabase, entityId, cacheKey, queryHash, query, finalResponse, "fast", ttl, reqId);
          } else {
            await invalidateCacheForEntity(supabase, entityId, fastToolsUsed, reqId);
          }
          // ========== LLM PATH ==========

          // LAYER 1: Classify via keywords
          const classification = classifyQuery(query);

          // Check cross-over from previous conversation
          const lastCategory = conversationHistory.length > 0 ? "cfo" : undefined;
          const isCrossOver = lastCategory && detectCrossOver(query, lastCategory as QueryCategory);
          const effectiveCategory = isCrossOver ? "bookkeeper" : classification.category;

          sendEvent("route_classified", {
            path: "llm",
            category: effectiveCategory,
            confidence: classification.confidence,
            subCategory: classification.subCategory,
            matchedKeywords: classification.matchedKeywords,
            crossOver: isCrossOver || false,
            intentAttempted: bestIntent ? { name: bestIntent.name, confidence: bestIntent.confidence } : null,
          });

          if (isCrossOver) {
            sendEvent("mode_switch", { from: lastCategory, to: "bookkeeper", reason: "Action keywords detected in CFO context" });
          }

          if (bestIntent) {
            sendEvent("intent_detected", {
              intent: { id: bestIntent.id, name: bestIntent.name, moduleId: bestIntent.moduleId, confidence: bestIntent.confidence, description: bestIntent.description },
              reasoning: `Low confidence match (${(bestIntent.confidence * 100).toFixed(0)}%) — using LLM path with filtered tools`,
              lowConfidence: true,
            });
          }

          // Handle general chat — no tools needed
          if (effectiveCategory === "general_chat") {
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
            const chatTTL = determineTTL("llm", "general_chat", []);
            await writeCache(supabase, entityId, cacheKey, queryHash, query, finalResponse, "general_chat", chatTTL, reqId);

            // Track for feedback
            feedbackPath = "general_chat";
            feedbackModel = `${llmConfig.provider}/${llmConfig.model}`;
            feedbackStrategy = "general_chat_bypass";
            feedbackResponse = finalResponse;
            feedbackTokenCost = response.usage?.total_tokens || null;

          } else {
            // LAYER 2: Select relevant tools via keyword matching against real MCP tools
            const toolSelection = selectToolsForQuery(query, effectiveCategory);
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
            const categoryPrompt = effectiveCategory === "bookkeeper" ? SYSTEM_PROMPTS.bookkeeper : SYSTEM_PROMPTS.cfo;
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
                try { toolInput = JSON.parse(toolCall.function.arguments); } catch { /* ok */ }

                if (mcpClientInstance) {
                  sendEvent("executing_tool", { tool: toolName, description: toolName });

                  try {
                    // entity_id/org_id are already in the MCP URL query params — do not pass as tool args
                    const mcpResult = await mcpClientInstance.callTool(toolName, toolInput);
                    const truncated = truncateResult(mcpResult);
                    mcpResults.push({ tool: toolName, input: toolInput, result: truncated, success: true });

                    let recordCount = 1;
                    try { const p = JSON.parse(mcpResult); if (Array.isArray(p)) recordCount = p.length; } catch { /* ok */ }
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
              responseFormat: effectiveCategory === "cfo" ? "analytical" : "action-oriented",
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
            if (!hasWriteOperations(llmToolsUsed)) {
              const ttl = determineTTL("llm", effectiveCategory, llmToolsUsed);
              await writeCache(supabase, entityId, cacheKey, queryHash, query, finalResponse, effectiveCategory, ttl, reqId);
            } else {
              await invalidateCacheForEntity(supabase, entityId, llmToolsUsed, reqId);
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

        controller.close();

      } catch (error) {
        console.error(`[${reqId}] Error:`, error);
        mcpClientInstance?.close();
        sendEvent("error", { message: String(error) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
});
