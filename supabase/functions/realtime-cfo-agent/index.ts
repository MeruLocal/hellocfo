import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Max characters for tool results to prevent token overflow
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

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

// SSE Event Types
type SSEEventType = 
  | 'connected'
  | 'understanding_started'
  | 'intent_detecting'
  | 'intent_detected'
  | 'entities_extracted'
  | 'pipeline_planned'
  | 'enrichments_planned'
  | 'executing_tool'
  | 'tool_result'
  | 'response_generating'
  | 'response_chunk'
  | 'complete'
  | 'error';

interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  timestamp: string;
}

// Truncate large results to prevent token overflow
function truncateResult(result: string, maxChars: number = MAX_TOOL_RESULT_CHARS): string {
  if (result.length <= maxChars) return result;
  
  try {
    const parsed = JSON.parse(result);
    if (Array.isArray(parsed)) {
      let truncated: unknown[] = [];
      let currentLength = 2;
      for (const item of parsed) {
        const itemStr = JSON.stringify(item);
        if (currentLength + itemStr.length + 1 > maxChars) break;
        truncated.push(item);
        currentLength += itemStr.length + 1;
      }
      return JSON.stringify(truncated) + `\n[Truncated: showing ${truncated.length} of ${parsed.length} items]`;
    }
  } catch {
    // Not JSON, truncate as string
  }
  
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
          console.log(`[${this.reqId}] MCP: Got session URL: ${this.sessionUrl}`);
          this.listenSSE(decoder);
          return;
        } else if (line.startsWith("data: http")) {
          this.sessionUrl = line.slice(6).trim();
          console.log(`[${this.reqId}] MCP: Got full session URL: ${this.sessionUrl}`);
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
        if (done) {
          console.log(`[${this.reqId}] MCP: SSE stream ended`);
          break;
        }
        this.buffer += decoder.decode(value, { stream: true });

        const normalized = this.buffer.replace(/\r\n/g, "\n");
        const messages = normalized.split("\n\n");
        this.buffer = messages.pop() || "";

        for (const msg of messages) {
          const lines = msg.split("\n");
          let eventType = "";
          let data = "";
          
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              data = line.slice(5).trim();
            }
          }

          if (eventType === "message" && data) {
            try {
              const result = JSON.parse(data);
              console.log(`[${this.reqId}] MCP: Received message id=${result.id}`);
              
              const pending = this.pendingRequests.get(result.id);
              if (pending) {
                this.pendingRequests.delete(result.id);
                if (result.error) {
                  pending.reject(new Error(result.error.message || JSON.stringify(result.error)));
                } else {
                  pending.resolve(result.result);
                }
              }
            } catch (e) {
              console.log(`[${this.reqId}] MCP: Failed to parse SSE data: ${data.slice(0, 100)}`);
            }
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

    console.log(`[${this.reqId}] MCP: Sending ${method} (id=${id})`);

    await fetch(this.sessionUrl!, {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }),
    });

    return promise;
  }

  async initialize(): Promise<void> {
    console.log(`[${this.reqId}] MCP: Initializing...`);
    
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "lovable-cfo-agent", version: "2.0" },
    });

    await fetch(this.sessionUrl!, {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });

    console.log(`[${this.reqId}] MCP: Initialized`);
  }

  async listTools(): Promise<Array<{ name: string; description: string; inputSchema: unknown }>> {
    const result = await this.request("tools/list") as { tools: Array<{ name: string; description: string; inputSchema: unknown }> };
    console.log(`[${this.reqId}] MCP: Got ${result.tools?.length || 0} tools`);
    return result.tools || [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    console.log(`[${this.reqId}] MCP: Calling tool ${name}`);
    
    const result = await this.request("tools/call", { name, arguments: args }) as { 
      content: Array<{ type: string; text?: string }> 
    };
    
    const textContent = result.content?.filter(c => c.type === "text").map(c => c.text).join("\n") || JSON.stringify(result);
    console.log(`[${this.reqId}] MCP: Tool ${name} returned ${textContent.length} chars`);
    
    return textContent;
  }

  close(): void {
    this.sseReader?.cancel();
    console.log(`[${this.reqId}] MCP: Closed`);
  }
}

// Call Anthropic API
async function callAnthropic(
  config: LLMConfig,
  system: string,
  messages: unknown[],
  tools: AnthropicTool[],
  reqId: string
): Promise<unknown> {
  const endpoint = config.provider === "azure-anthropic"
    ? `${config.endpoint || "https://cursor-api-west-us-resource.openai.azure.com/anthropic"}/v1/messages`
    : "https://api.anthropic.com/v1/messages";

  console.log(`[${reqId}] Calling Anthropic: ${config.model}`);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.api_key || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.max_tokens || 4096,
      system,
      messages,
      tools: tools.length > 0 ? tools : undefined,
    }),
  });

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

  // Create a streaming response using SSE
  const encoder = new TextEncoder();
  let mcpClient: MCPClient | null = null;
  
  const stream = new ReadableStream({
    async start(controller) {
      // Helper to send SSE events
      const sendEvent = (type: SSEEventType, data: unknown) => {
        const event: SSEEvent = {
          type,
          data,
          timestamp: new Date().toISOString()
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const { query, intents, businessContext, conversationHistory = [] } = await req.json();
        
        if (!query) {
          sendEvent('error', { message: "Query required" });
          controller.close();
          return;
        }

        console.log(`[${reqId}] Query: ${query}`);
        
        // Send connected event
        sendEvent('connected', { requestId: reqId });
        
        // Send understanding started
        sendEvent('understanding_started', { query });

        // Get LLM config
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!, 
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        
        const { data: llmConfig, error: llmError } = await supabase
          .from("llm_configs")
          .select("*")
          .eq("is_default", true)
          .single();
        
        if (llmError || !llmConfig?.api_key) {
          throw new Error("LLM not configured");
        }

        // Get MCP credentials
        const authToken = Deno.env.get("MCP_HELLOBOOKS_AUTH_TOKEN");
        const entityId = Deno.env.get("MCP_HELLOBOOKS_ENTITY_ID");
        const orgId = Deno.env.get("MCP_HELLOBOOKS_ORG_ID");

        let mcpTools: Array<{ name: string; description: string; inputSchema: unknown }> = [];

        if (authToken && entityId && orgId) {
          try {
            mcpClient = new MCPClient("https://mcp.hellobooks.ai", {
              "Authorization": `Bearer ${authToken}`,
              "X-Entity-Id": entityId,
              "X-Org-Id": orgId,
            }, reqId);

            await mcpClient.connect();
            await mcpClient.initialize();
            mcpTools = await mcpClient.listTools();
          } catch (error) {
            console.error(`[${reqId}] MCP connection failed:`, error);
            sendEvent('error', { phase: 'mcp_connection', message: String(error) });
            if (mcpClient) {
              mcpClient.close();
              mcpClient = null;
            }
          }
        }

        // Build tools
        const activeIntents = (intents || []).filter((i: { isActive: boolean }) => i.isActive);
        
        const matchIntentTool: AnthropicTool = {
          name: "match_intent",
          description: "Match the user's query to the most appropriate intent. Call this FIRST before any other tool.",
          input_schema: {
            type: "object",
            properties: {
              intent_name: { type: "string", description: "Exact intent name from available list" },
              confidence: { type: "number", description: "0.0 to 1.0" },
              reasoning: { type: "string", description: "Why this intent was matched" },
              extracted_entities: { type: "object", description: "Extracted entities from the query" },
              pipeline_steps: { 
                type: "array", 
                items: { 
                  type: "object",
                  properties: {
                    tool: { type: "string" },
                    description: { type: "string" },
                    purpose: { type: "string" }
                  }
                },
                description: "Data pipeline steps that will be executed"
              },
              enrichments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string" },
                    description: { type: "string" }
                  }
                },
                description: "Enrichments that will be applied to the data"
              },
              response_format: { type: "string", description: "How the response will be formatted" }
            },
            required: ["intent_name", "confidence", "reasoning"]
          }
        };

        const anthropicMcpTools: AnthropicTool[] = mcpTools.map(t => ({
          name: t.name,
          description: t.description || "",
          input_schema: t.inputSchema as Record<string, unknown>,
        }));

        const allTools = [matchIntentTool, ...anthropicMcpTools];

        // System prompt with intent context
        const intentList = activeIntents.map((i: { name: string; description?: string; trainingPhrases: string[]; entities?: { name: string; type: string }[]; resolutionFlow?: { pipeline?: { mcpTool?: string; description?: string }[]; enrichments?: { type: string; description?: string }[] } }, idx: number) => {
          const phrases = (i.trainingPhrases || []).slice(0, 3).join('; ');
          const entities = (i.entities || []).map((e: { name: string; type: string }) => `${e.name}(${e.type})`).join(', ');
          const pipelineSteps = (i.resolutionFlow?.pipeline || []).map((p: { mcpTool?: string; description?: string }) => p.mcpTool || p.description).join(' → ');
          const enrichments = (i.resolutionFlow?.enrichments || []).map((e: { type: string; description?: string }) => e.type).join(', ');
          
          return `${idx + 1}. "${i.name}"
   - Description: ${i.description || 'N/A'}
   - Examples: ${phrases}
   - Entities: ${entities || 'None'}
   - Pipeline: ${pipelineSteps || 'N/A'}
   - Enrichments: ${enrichments || 'N/A'}`;
        }).join('\n\n');

        const systemPrompt = `You are a CFO AI Agent that helps users with financial queries.

YOUR TASK:
1. First call match_intent to identify what the user is asking
2. Include detailed understanding in match_intent: extracted entities, pipeline steps, enrichments
3. Then call the necessary MCP tools to fetch real data
4. Synthesize a helpful response for a CFO

AVAILABLE INTENTS:
${intentList || 'None configured'}

MCP TOOLS AVAILABLE: ${mcpTools.length}
Key tools: ${mcpTools.slice(0, 10).map(t => t.name).join(', ')}

IMPORTANT:
- When you match an intent, be very detailed about WHAT you understood:
  - What specific entities/parameters you extracted (limit, period, vendor name, etc.)
  - What data you plan to fetch (which MCP tools and why)
  - What enrichments you'll apply (trends, rankings, alerts, etc.)
  - How you'll format the response
- This helps the user understand your reasoning

Context: ${businessContext?.country || 'IN'}, ${businessContext?.currency || 'INR'}, ${businessContext?.industry || 'General'}`;

        // Send intent detection started
        sendEvent('intent_detecting', { 
          query,
          availableIntents: activeIntents.map((i: { name: string; description?: string }) => ({ name: i.name, description: i.description }))
        });

        // Build messages with conversation history
        const messages: unknown[] = [
          ...conversationHistory,
          { role: "user", content: query }
        ];
        
        let response = await callAnthropic(llmConfig, systemPrompt, messages, allTools, reqId) as {
          stop_reason: string;
          content: { type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string }[];
          usage?: { input_tokens?: number; output_tokens?: number };
        };

        let matchedIntent: { id?: string; name: string; moduleId?: string; confidence: number; description?: string } | null = null;
        let extractedEntities: Record<string, unknown> = {};
        let reasoning = "";
        let pipelineSteps: { tool: string; description: string; purpose?: string }[] = [];
        let enrichments: { type: string; description: string }[] = [];
        let responseFormat = "";
        let mcpResults: { tool: string; input?: Record<string, unknown>; result?: string; error?: string; success: boolean }[] = [];
        let inputTokens = response.usage?.input_tokens || 0;
        let outputTokens = response.usage?.output_tokens || 0;
        let iterations = 0;

        // Handle tool calls
        while (response.stop_reason === "tool_use" && iterations < 10) {
          iterations++;
          
          const toolUses = response.content.filter((b: { type: string }) => b.type === "tool_use") as { id: string; name: string; input: Record<string, unknown> }[];
          if (toolUses.length === 0) break;

          console.log(`[${reqId}] Processing ${toolUses.length} tool call(s)`);
          
          const toolResults: { type: string; tool_use_id: string; content: string; is_error?: boolean }[] = [];
          
          for (const toolUse of toolUses) {
            console.log(`[${reqId}] Tool: ${toolUse.name}`);
            let result: string;
            let isError = false;

            if (toolUse.name === "match_intent") {
              const input = toolUse.input as {
                intent_name?: string;
                confidence?: number;
                reasoning?: string;
                extracted_entities?: Record<string, unknown>;
                pipeline_steps?: { tool: string; description: string; purpose?: string }[];
                enrichments?: { type: string; description: string }[];
                response_format?: string;
              };
              
              reasoning = input.reasoning || "";
              extractedEntities = input.extracted_entities || {};
              pipelineSteps = input.pipeline_steps || [];
              enrichments = input.enrichments || [];
              responseFormat = input.response_format || "";
              
              // Find matching intent
              const found = activeIntents.find((i: { name: string }) => {
                const intentLower = i.name.toLowerCase();
                const inputLower = (input.intent_name || "").toLowerCase();
                return intentLower === inputLower ||
                       intentLower.includes(inputLower) ||
                       inputLower.includes(intentLower);
              }) as { id: string; name: string; moduleId?: string; description?: string } | undefined;

              if (found) {
                matchedIntent = { 
                  id: found.id, 
                  name: found.name, 
                  moduleId: found.moduleId, 
                  confidence: input.confidence || 0,
                  description: found.description
                };
                result = JSON.stringify({ success: true, matched: found.name });
                
                // Send intent detected event with all understanding details
                sendEvent('intent_detected', {
                  intent: matchedIntent,
                  reasoning,
                  confidence: input.confidence
                });

                // Send entities extracted event
                if (Object.keys(extractedEntities).length > 0) {
                  sendEvent('entities_extracted', { entities: extractedEntities });
                }

                // Send pipeline planned event
                if (pipelineSteps.length > 0) {
                  sendEvent('pipeline_planned', { steps: pipelineSteps });
                }

                // Send enrichments planned event
                if (enrichments.length > 0) {
                  sendEvent('enrichments_planned', { enrichments, responseFormat });
                }
              } else {
                result = JSON.stringify({ 
                  error: `Not found: ${input.intent_name}`, 
                  available: activeIntents.map((i: { name: string }) => i.name) 
                });
                isError = true;
                
                sendEvent('intent_detected', {
                  intent: null,
                  attempted: input.intent_name,
                  reasoning,
                  availableIntents: activeIntents.map((i: { name: string }) => i.name)
                });
              }
            } else if (mcpClient) {
              // MCP tool call
              sendEvent('executing_tool', { 
                tool: toolUse.name, 
                input: toolUse.input,
                description: mcpTools.find(t => t.name === toolUse.name)?.description || ''
              });

              try {
                const mcpResult = await mcpClient.callTool(toolUse.name, toolUse.input || {});
                const truncatedResult = truncateResult(mcpResult);
                
                mcpResults.push({ tool: toolUse.name, input: toolUse.input, result: truncatedResult, success: true });
                result = truncatedResult;
                
                // Send tool result event
                sendEvent('tool_result', { 
                  tool: toolUse.name, 
                  success: true,
                  recordCount: Array.isArray(JSON.parse(mcpResult)) ? JSON.parse(mcpResult).length : 1
                });
              } catch (error) {
                console.error(`[${reqId}] MCP tool error:`, error);
                mcpResults.push({ tool: toolUse.name, error: String(error), success: false });
                result = JSON.stringify({ error: String(error) });
                isError = true;
                
                sendEvent('tool_result', { 
                  tool: toolUse.name, 
                  success: false,
                  error: String(error)
                });
              }
            } else {
              result = JSON.stringify({ error: "MCP not connected" });
              isError = true;
            }

            toolResults.push({ 
              type: "tool_result", 
              tool_use_id: toolUse.id, 
              content: result,
              is_error: isError 
            });
          }

          // Continue conversation with tool results
          messages.push({ role: "assistant", content: response.content });
          messages.push({ role: "user", content: toolResults });

          // Send response generating event
          sendEvent('response_generating', { 
            iteration: iterations,
            mcpCallsCompleted: mcpResults.filter(r => r.success).length
          });

          response = await callAnthropic(llmConfig, systemPrompt, messages, allTools, reqId) as typeof response;
          inputTokens += response.usage?.input_tokens || 0;
          outputTokens += response.usage?.output_tokens || 0;
        }

        // Cleanup MCP
        if (mcpClient) {
          mcpClient.close();
        }

        // Get final response text
        const textBlock = response.content.find((b: { type: string }) => b.type === "text") as { text?: string } | undefined;
        const finalResponse = textBlock?.text || "";

        // Send response chunks (could be split for longer responses)
        sendEvent('response_chunk', { text: finalResponse });

        // Send complete event with full result
        sendEvent('complete', {
          query,
          matchedIntent,
          extractedEntities,
          reasoning,
          pipelineSteps,
          enrichments,
          responseFormat,
          response: finalResponse,
          mcpToolResults: mcpResults,
          dataSources: mcpResults.filter(r => r.success).map(r => r.tool),
          llmModel: `${llmConfig.provider}/${llmConfig.model}`,
          iterationCount: iterations,
          usage: { 
            input_tokens: inputTokens, 
            output_tokens: outputTokens, 
            total_tokens: inputTokens + outputTokens 
          }
        });

        console.log(`[${reqId}] Done. Intent: ${matchedIntent?.name || 'None'}, Iterations: ${iterations}`);
        
        controller.close();

      } catch (error) {
        console.error(`[${reqId}] Error:`, error);
        
        if (mcpClient) {
          mcpClient.close();
        }
        
        sendEvent('error', { message: String(error) });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
