import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  BOOKKEEPER_TOOLS,
  CFO_TOOLS,
  buildAnthropicTools,
  resolveMetaToolToMcp,
  type AnthropicTool,
  type ToolGroup,
} from "./tool-groups.ts";
import { classifyQuery, detectCrossOver, type QueryCategory } from "./classifier.ts";
import { selectModelTier, SYSTEM_PROMPTS } from "./model-selector.ts";
import { detectAutoEnrichments, buildEnrichmentInstructions } from "./enrichment-auto-apply.ts";

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

// MCP Client based on working implementation
class MCPClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private sessionUrl: string | null = null;
  private sseReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private pendingRequests = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private buffer = "";
  private reqId: string;

  constructor(baseUrl: string, headers: Record<string, string>, reqId: string) {
    this.baseUrl = baseUrl;
    this.headers = headers;
    this.reqId = reqId;
  }

  async connect(): Promise<void> {
    console.log(`[${this.reqId}] MCP: Connecting to ${this.baseUrl}/sse`);
    const res = await fetch(`${this.baseUrl}/sse`, { headers: this.headers });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }
    this.sseReader = res.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await this.sseReader.read();
      if (done) break;
      this.buffer += decoder.decode(value, { stream: true });
      for (const line of this.buffer.split("\n")) {
        if (line.startsWith("data: /")) {
          this.sessionUrl = `${this.baseUrl}${line.slice(6).trim()}`;
          this.listenSSE(decoder);
          return;
        } else if (line.startsWith("data: http")) {
          this.sessionUrl = line.slice(6).trim();
          this.listenSSE(decoder);
          return;
        }
      }
      this.buffer = "";
    }
    throw new Error("Failed to get session URL from SSE");
  }

  private listenSSE(decoder: TextDecoder): void {
    (async () => {
      while (true) {
        const { value, done } = await this.sseReader!.read();
        if (done) break;
        this.buffer += decoder.decode(value, { stream: true });
        const normalized = this.buffer.replace(/\r\n/g, "\n");
        const messages = normalized.split("\n\n");
        this.buffer = messages.pop() || "";
        for (const msg of messages) {
          const lines = msg.split("\n");
          let eventType = "";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            else if (line.startsWith("data:")) data = line.slice(5).trim();
          }
          if (eventType === "message" && data) {
            try {
              const result = JSON.parse(data);
              const pending = this.pendingRequests.get(result.id);
              if (pending) {
                this.pendingRequests.delete(result.id);
                if (result.error) pending.reject(new Error(result.error.message || JSON.stringify(result.error)));
                else pending.resolve(result.result);
              }
            } catch { /* ignore */ }
          }
        }
      }
    })();
  }

  private async request(method: string, params?: unknown): Promise<unknown> {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout for ${method}`));
        }
      }, 30000);
    });
    await fetch(this.sessionUrl!, {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }),
    });
    return promise;
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "lovable-cfo-agent", version: "3.0" },
    });
    await fetch(this.sessionUrl!, {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
  }

  async listTools(): Promise<Array<{ name: string; description: string; inputSchema: unknown }>> {
    const result = (await this.request("tools/list")) as { tools: Array<{ name: string; description: string; inputSchema: unknown }> };
    return result.tools || [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = (await this.request("tools/call", { name, arguments: args })) as {
      content: Array<{ type: string; text?: string }>;
    };
    return result.content?.filter((c) => c.type === "text").map((c) => c.text).join("\n") || JSON.stringify(result);
  }

  close(): void {
    this.sseReader?.cancel();
  }
}

// Call Anthropic API with optional prompt caching
async function callAnthropic(
  config: LLMConfig,
  system: string | Array<{ type: string; text: string; cache_control?: { type: string } }>,
  messages: unknown[],
  tools: AnthropicTool[],
  reqId: string,
  maxTokens?: number
): Promise<{
  stop_reason: string;
  content: { type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}> {
  const endpoint =
    config.provider === "azure-anthropic"
      ? `${config.endpoint || "https://cursor-api-west-us-resource.openai.azure.com/anthropic"}/v1/messages`
      : "https://api.anthropic.com/v1/messages";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": config.api_key || "",
    "anthropic-version": "2023-06-01",
  };

  // Enable prompt caching if using array-format system prompt
  if (Array.isArray(system)) {
    headers["anthropic-beta"] = "prompt-caching-2024-07-31";
  }

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: maxTokens || config.max_tokens || 4096,
    system,
    messages,
  };
  if (tools.length > 0) body.tools = tools;

  console.log(`[${reqId}] Calling Anthropic: ${config.model} (${tools.length} tools)`);
  const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[${reqId}] Anthropic error: ${res.status} - ${err}`);
    throw new Error(`Anthropic API error: ${res.status} - ${err.slice(0, 200)}`);
  }

  return res.json();
}

serve(async (req) => {
  const reqId = crypto.randomUUID().slice(0, 8);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const encoder = new TextEncoder();
  let mcpClient: MCPClient | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (type: SSEEventType, data: unknown) => {
        const event: SSEEvent = { type, data, timestamp: new Date().toISOString() };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const { query, intents, businessContext, conversationHistory = [] } = await req.json();
        if (!query) {
          sendEvent("error", { message: "Query required" });
          controller.close();
          return;
        }

        const startTime = Date.now();
        console.log(`[${reqId}] Query: ${query}`);

        sendEvent("connected", { requestId: reqId });
        sendEvent("understanding_started", { query });

        // ============================
        // STEP 1: Get LLM config
        // ============================
        const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data: llmConfig, error: llmError } = await supabase
          .from("llm_configs")
          .select("*")
          .eq("is_default", true)
          .single();

        if (llmError || !llmConfig?.api_key) throw new Error("LLM not configured");

        // ============================
        // STEP 2: Connect to MCP
        // ============================
        const authToken = Deno.env.get("MCP_HELLOBOOKS_AUTH_TOKEN");
        const entityId = Deno.env.get("MCP_HELLOBOOKS_ENTITY_ID");
        const orgId = Deno.env.get("MCP_HELLOBOOKS_ORG_ID");

        let mcpTools: Array<{ name: string; description: string; inputSchema: unknown }> = [];

        if (authToken && entityId && orgId) {
          try {
            mcpClient = new MCPClient("https://mcp.hellobooks.ai", {
              Authorization: `Bearer ${authToken}`,
              "X-Entity-Id": entityId,
              "X-Org-Id": orgId,
            }, reqId);
            await mcpClient.connect();
            await mcpClient.initialize();
            mcpTools = await mcpClient.listTools();
            console.log(`[${reqId}] MCP: ${mcpTools.length} tools loaded`);
          } catch (error) {
            console.error(`[${reqId}] MCP connection failed:`, error);
            sendEvent("error", { phase: "mcp_connection", message: String(error) });
            if (mcpClient) { mcpClient.close(); mcpClient = null; }
          }
        }

        const mcpToolNames = new Set(mcpTools.map((t) => t.name));

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

          // Exact phrase match
          for (const phrase of trainingPhrases) {
            const phraseLower = phrase.toLowerCase();
            if (queryLower === phraseLower) {
              bestIntent = { id: intent.id, name: intent.name, moduleId: intent.moduleId, description: intent.description, confidence: 0.95, resolutionFlow: intent.resolutionFlow };
              break;
            }
            // High similarity (query contains the full phrase or vice versa)
            if (queryLower.includes(phraseLower) || phraseLower.includes(queryLower)) {
              const similarity = Math.min(queryLower.length, phraseLower.length) / Math.max(queryLower.length, phraseLower.length);
              const candidateConfidence = 0.7 + similarity * 0.25;
              if (!bestIntent || candidateConfidence > bestIntent.confidence) {
                bestIntent = { id: intent.id, name: intent.name, moduleId: intent.moduleId, description: intent.description, confidence: candidateConfidence, resolutionFlow: intent.resolutionFlow };
              }
            }
          }

          // Intent name match
          if (queryLower.includes(intentNameLower) || intentNameLower.includes(queryLower)) {
            const nameConfidence = 0.6;
            if (!bestIntent || nameConfidence > bestIntent.confidence) {
              bestIntent = { id: intent.id, name: intent.name, moduleId: intent.moduleId, description: intent.description, confidence: nameConfidence, resolutionFlow: intent.resolutionFlow };
            }
          }

          if (bestIntent?.confidence === 0.95) break; // Exact match found
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

          if (mcpClient && pipeline.length > 0) {
            sendEvent("pipeline_executing", { stepCount: pipeline.length });

            for (const step of pipeline) {
              const toolName = step.mcpTool || step.tool;
              if (!toolName) continue;

              sendEvent("executing_tool", { tool: toolName, description: step.description || "" });

              try {
                const mcpResult = await mcpClient.callTool(toolName, {});
                const truncated = truncateResult(mcpResult);
                mcpResults.push({ tool: toolName, result: truncated, success: true });

                let recordCount = 1;
                try { const p = JSON.parse(mcpResult); if (Array.isArray(p)) recordCount = p.length; } catch { /* ok */ }
                sendEvent("tool_result", { tool: toolName, success: true, recordCount });
              } catch (error) {
                mcpResults.push({ tool: toolName, error: String(error), success: false });
                sendEvent("tool_result", { tool: toolName, success: false, error: String(error) });
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

          const systemPrompt: Array<{ type: string; text: string; cache_control?: { type: string } }> = [
            { type: "text", text: SYSTEM_PROMPTS.fast_path, cache_control: { type: "ephemeral" } },
            { type: "text", text: `Context: ${businessContext?.country || "IN"}, ${businessContext?.currency || "INR"}` },
          ];

          const response = await callAnthropic(llmConfig, systemPrompt, fastPathMessages, [], reqId, 2048);
          const textBlock = response.content.find((b) => b.type === "text") as { text?: string } | undefined;
          const finalResponse = textBlock?.text || "";

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
            usage: response.usage || { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
          });

        } else {
          // ========== LLM PATH ==========

          // LAYER 1: Classify via keywords
          const classification = classifyQuery(query);

          // Check cross-over from previous conversation
          const lastCategory = conversationHistory.length > 0 ? "cfo" : undefined; // simplified
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
            const systemPrompt: Array<{ type: string; text: string; cache_control?: { type: string } }> = [
              { type: "text", text: SYSTEM_PROMPTS.general_chat, cache_control: { type: "ephemeral" } },
            ];

            const response = await callAnthropic(llmConfig, systemPrompt, chatMessages, [], reqId, 512);
            const textBlock = response.content.find((b) => b.type === "text") as { text?: string } | undefined;
            const finalResponse = textBlock?.text || "";

            sendEvent("response_chunk", { text: finalResponse });
            sendEvent("complete", {
              query, path: "llm", category: "general_chat",
              matchedIntent: null, extractedEntities: {}, reasoning: "General conversation",
              pipelineSteps: [], enrichments: [], responseFormat: "", response: finalResponse,
              mcpToolResults: [], dataSources: [],
              llmModel: `${llmConfig.provider}/${llmConfig.model}`, iterationCount: 1,
              usage: response.usage || { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
            });

          } else {
            // LAYER 2: Select tool group and build filtered tools
            const toolGroups: ToolGroup[] = effectiveCategory === "bookkeeper" ? BOOKKEEPER_TOOLS : CFO_TOOLS;
            const allGroups = [...BOOKKEEPER_TOOLS, ...CFO_TOOLS]; // For cross-over resolution
            const filteredTools = buildAnthropicTools(toolGroups, mcpToolNames, true);

            sendEvent("tools_filtered", {
              category: effectiveCategory,
              toolCount: filteredTools.length,
              totalMcpTools: mcpTools.length,
              tools: filteredTools.map((t) => t.name),
            });

            // Select model tier
            const modelSelection = selectModelTier(query, effectiveCategory);
            console.log(`[${reqId}] Model: ${modelSelection.tier} (${modelSelection.reason})`);

            // Build category-specific system prompt with caching
            const categoryPrompt = effectiveCategory === "bookkeeper" ? SYSTEM_PROMPTS.bookkeeper : SYSTEM_PROMPTS.cfo;
            const systemPrompt: Array<{ type: string; text: string; cache_control?: { type: string } }> = [
              { type: "text", text: categoryPrompt, cache_control: { type: "ephemeral" } },
              { type: "text", text: `Context: ${businessContext?.country || "IN"}, ${businessContext?.currency || "INR"}, ${businessContext?.industry || "General"}\nAvailable tool groups: ${filteredTools.map((t) => t.name).join(", ")}` },
            ];

            // Build messages
            const messages: unknown[] = [...conversationHistory, { role: "user", content: query }];

            // Call LLM with filtered tools
            let response = await callAnthropic(llmConfig, systemPrompt, messages, filteredTools, reqId);
            let inputTokens = response.usage?.input_tokens || 0;
            let outputTokens = response.usage?.output_tokens || 0;
            let iterations = 0;
            const mcpResults: { tool: string; input?: Record<string, unknown>; result?: string; error?: string; success: boolean }[] = [];

            // Handle tool call loop
            while (response.stop_reason === "tool_use" && iterations < 10) {
              iterations++;
              const toolUses = response.content.filter((b) => b.type === "tool_use") as { id: string; name: string; input: Record<string, unknown> }[];
              if (toolUses.length === 0) break;

              const toolResults: { type: string; tool_use_id: string; content: string; is_error?: boolean }[] = [];

              for (const toolUse of toolUses) {
                const groupName = toolUse.name;
                const action = (toolUse.input as { action?: string })?.action;
                const params = (toolUse.input as { parameters?: Record<string, unknown> })?.parameters || {};

                // Resolve meta-tool to actual MCP tool
                const mcpToolName = action ? resolveMetaToolToMcp(groupName, action, allGroups) : null;

                if (mcpToolName && mcpClient) {
                  sendEvent("executing_tool", { tool: mcpToolName, group: groupName, description: `${groupName} → ${action}` });

                  try {
                    const mcpResult = await mcpClient.callTool(mcpToolName, params);
                    const truncated = truncateResult(mcpResult);
                    mcpResults.push({ tool: mcpToolName, input: params, result: truncated, success: true });

                    let recordCount = 1;
                    try { const p = JSON.parse(mcpResult); if (Array.isArray(p)) recordCount = p.length; } catch { /* ok */ }
                    sendEvent("tool_result", { tool: mcpToolName, group: groupName, success: true, recordCount });

                    toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: truncated });
                  } catch (error) {
                    mcpResults.push({ tool: mcpToolName, error: String(error), success: false });
                    sendEvent("tool_result", { tool: mcpToolName, group: groupName, success: false, error: String(error) });
                    toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify({ error: String(error) }), is_error: true });
                  }
                } else if (!mcpClient) {
                  toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify({ error: "MCP not connected" }), is_error: true });
                } else {
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: toolUse.id,
                    content: JSON.stringify({ error: `Unknown action: ${action} in group ${groupName}` }),
                    is_error: true,
                  });
                }
              }

              // Auto-apply enrichments based on data patterns
              const autoEnrichments = detectAutoEnrichments(mcpResults);
              if (autoEnrichments.length > 0) {
                sendEvent("enrichments_applying", { enrichments: autoEnrichments.map((e) => ({ type: e.type, description: e.description })) });
              }

              // Continue conversation
              messages.push({ role: "assistant", content: response.content });
              messages.push({ role: "user", content: toolResults });

              sendEvent("response_generating", { iteration: iterations, mcpCallsCompleted: mcpResults.filter((r) => r.success).length });

              // Add enrichment instructions to help LLM format better
              const enrichmentContext = buildEnrichmentInstructions(autoEnrichments);
              if (enrichmentContext && iterations === 1) {
                // Inject enrichment hints into the system prompt for the next call
                systemPrompt.push({ type: "text", text: enrichmentContext });
              }

              response = await callAnthropic(llmConfig, systemPrompt, messages, filteredTools, reqId);
              inputTokens += response.usage?.input_tokens || 0;
              outputTokens += response.usage?.output_tokens || 0;
            }

            // Get final response
            const textBlock = response.content.find((b) => b.type === "text") as { text?: string } | undefined;
            const finalResponse = textBlock?.text || "";

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
          }
        }

        // Cleanup
        if (mcpClient) mcpClient.close();
        console.log(`[${reqId}] Done in ${((Date.now() - (Date.now() - 1)) / 1000).toFixed(2)}s`);
        controller.close();

      } catch (error) {
        console.error(`[${reqId}] Error:`, error);
        if (mcpClient) mcpClient.close();
        sendEvent("error", { message: String(error) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
});
