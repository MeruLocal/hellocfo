import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Max characters for tool results to prevent token overflow
const MAX_TOOL_RESULT_CHARS = 50000;

interface DebugLog {
  timestamp: string;
  type: 'mcp_connection' | 'mcp_tools' | 'mcp_request' | 'mcp_response' | 'llm_request' | 'llm_response' | 'intent_match' | 'error';
  data: unknown;
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

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

// Truncate large results to prevent token overflow
function truncateResult(result: string, maxChars: number = MAX_TOOL_RESULT_CHARS): string {
  if (result.length <= maxChars) return result;
  
  // Try to parse as JSON and truncate intelligently
  try {
    const parsed = JSON.parse(result);
    if (Array.isArray(parsed)) {
      // Keep first items that fit within limit
      let truncated: any[] = [];
      let currentLength = 2; // for []
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
      clientInfo: { name: "lovable-cfo-client", version: "1.0" },
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
  messages: any[],
  tools: AnthropicTool[],
  reqId: string
): Promise<any> {
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

  const debugLogs: DebugLog[] = [];
  let mcpClient: MCPClient | null = null;

  try {
    const { query, intents, businessContext, debug = false } = await req.json();
    
    if (!query) {
      return new Response(
        JSON.stringify({ error: "Query required" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[${reqId}] Query: ${query}`);

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
        
        debugLogs.push({ 
          timestamp: new Date().toISOString(), 
          type: 'mcp_connection', 
          data: { status: 'connected' } 
        });

        await mcpClient.initialize();
        mcpTools = await mcpClient.listTools();

        debugLogs.push({ 
          timestamp: new Date().toISOString(), 
          type: 'mcp_tools', 
          data: { count: mcpTools.length, tools: mcpTools.map(t => t.name) } 
        });
      } catch (error) {
        console.error(`[${reqId}] MCP connection failed:`, error);
        debugLogs.push({ 
          timestamp: new Date().toISOString(), 
          type: 'error', 
          data: { phase: 'mcp_connection', error: String(error) } 
        });
        if (mcpClient) {
          mcpClient.close();
          mcpClient = null;
        }
      }
    } else {
      console.log(`[${reqId}] MCP credentials not configured`);
    }

    // Build tools - only include relevant MCP tools based on query
    const activeIntents = (intents || []).filter((i: any) => i.isActive);
    
    const matchIntentTool: AnthropicTool = {
      name: "match_intent",
      description: "Match the user's query to the most appropriate intent. Call this FIRST before any other tool.",
      input_schema: {
        type: "object",
        properties: {
          intent_name: { type: "string", description: "Exact intent name from available list" },
          confidence: { type: "number", description: "0.0 to 1.0" },
          reasoning: { type: "string", description: "Why this intent was matched" },
          extracted_entities: { type: "object", description: "Extracted entities" }
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

    // System prompt - more focused
    const intentList = activeIntents.map((i: any, idx: number) => {
      const phrases = (i.trainingPhrases || []).slice(0, 3).join('; ');
      return `${idx + 1}. "${i.name}" - ${i.description || ''} (Examples: ${phrases})`;
    }).join('\n');

    const systemPrompt = `You are a CFO Query Resolution Engine.

CRITICAL RULES:
1. Call match_intent FIRST to classify the query
2. Then call ONLY the ONE most relevant MCP tool for the query
3. Do NOT call multiple tools or unrelated tools
4. For "top 10 vendors" - call get_all_vendors, NOT get_all_bills or other tools

AVAILABLE INTENTS:
${intentList || 'None configured'}

MCP TOOLS AVAILABLE: ${mcpTools.length}
Key tools: get_all_vendors, get_all_customers, get_all_invoices, get_all_bills, get_all_payments

TOOL SELECTION:
- For vendor queries → use get_all_vendors
- For customer queries → use get_all_customers  
- For invoice queries → use get_all_invoices
- For bill queries → use get_all_bills
- For payment queries → use get_all_payments

Context: ${businessContext?.country || 'IN'}, ${businessContext?.currency || 'INR'}`;

    // Start chat
    const messages: any[] = [{ role: "user", content: query }];
    let response = await callAnthropic(llmConfig, systemPrompt, messages, allTools, reqId);

    let matchedIntent: any = null;
    let extractedEntities: Record<string, unknown> = {};
    let reasoning = "";
    let mcpResults: any[] = [];
    let inputTokens = response.usage?.input_tokens || 0;
    let outputTokens = response.usage?.output_tokens || 0;
    let iterations = 0;

    // Handle tool calls - process ONE at a time like working code
    while (response.stop_reason === "tool_use" && iterations < 10) {
      iterations++;
      
      // Find first tool_use block
      const toolUse = response.content.find((b: any) => b.type === "tool_use");
      if (!toolUse) break;

      console.log(`[${reqId}] Tool: ${toolUse.name}`);
      let result: string;
      let isError = false;

      if (toolUse.name === "match_intent") {
        const input = toolUse.input as any;
        reasoning = input.reasoning || "";
        extractedEntities = input.extracted_entities || {};
        
        const found = activeIntents.find((i: any) => {
          const intentLower = i.name.toLowerCase();
          const inputLower = (input.intent_name || "").toLowerCase();
          return intentLower === inputLower ||
                 intentLower.includes(inputLower) ||
                 inputLower.includes(intentLower);
        });

        if (found) {
          matchedIntent = { 
            id: found.id, 
            name: found.name, 
            moduleId: found.moduleId, 
            confidence: input.confidence 
          };
          result = JSON.stringify({ success: true, matched: found.name });
          debugLogs.push({ 
            timestamp: new Date().toISOString(), 
            type: 'intent_match', 
            data: { matched: found.name, confidence: input.confidence } 
          });
        } else {
          result = JSON.stringify({ 
            error: `Not found: ${input.intent_name}`, 
            available: activeIntents.map((i: any) => i.name) 
          });
          isError = true;
        }
      } else if (mcpClient) {
        try {
          debugLogs.push({ 
            timestamp: new Date().toISOString(), 
            type: 'mcp_request', 
            data: { tool: toolUse.name, input: toolUse.input } 
          });

          const mcpResult = await mcpClient.callTool(toolUse.name, toolUse.input || {});
          
          // Truncate large results to prevent token overflow
          const truncatedResult = truncateResult(mcpResult);
          console.log(`[${reqId}] MCP result: ${mcpResult.length} chars -> ${truncatedResult.length} chars`);
          
          mcpResults.push({ tool: toolUse.name, input: toolUse.input, result: truncatedResult, success: true });
          result = truncatedResult;
          
          debugLogs.push({ 
            timestamp: new Date().toISOString(), 
            type: 'mcp_response', 
            data: { tool: toolUse.name, originalLength: mcpResult.length, truncatedLength: truncatedResult.length } 
          });
        } catch (error) {
          console.error(`[${reqId}] MCP tool error:`, error);
          mcpResults.push({ tool: toolUse.name, error: String(error), success: false });
          result = JSON.stringify({ error: String(error) });
          isError = true;
          
          debugLogs.push({ 
            timestamp: new Date().toISOString(), 
            type: 'error', 
            data: { phase: 'mcp_tool_call', tool: toolUse.name, error: String(error) } 
          });
        }
      } else {
        result = JSON.stringify({ error: "MCP not connected" });
        isError = true;
      }

      // Continue conversation with tool result
      messages.push({ role: "assistant", content: response.content });
      messages.push({ 
        role: "user", 
        content: [{ type: "tool_result", tool_use_id: toolUse.id, content: result }] 
      });

      response = await callAnthropic(llmConfig, systemPrompt, messages, allTools, reqId);
      inputTokens += response.usage?.input_tokens || 0;
      outputTokens += response.usage?.output_tokens || 0;
    }

    // Cleanup
    if (mcpClient) {
      mcpClient.close();
    }

    const textBlock = response.content.find((b: any) => b.type === "text");

    const output: any = {
      query,
      timestamp: new Date().toISOString(),
      matchedIntent,
      extractedEntities,
      reasoning,
      response: textBlock?.text || "",
      mcpToolResults: mcpResults.length > 0 ? mcpResults : undefined,
      dataSources: mcpResults.filter(r => r.success).map(r => r.tool),
      llmModel: `${llmConfig.provider}/${llmConfig.model}`,
      iterationCount: iterations,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens }
    };

    if (debug) output.debugLogs = debugLogs;

    console.log(`[${reqId}] Done. Intent: ${matchedIntent?.name || 'None'}, Iterations: ${iterations}`);
    
    return new Response(JSON.stringify(output), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error(`[${reqId}] Error:`, error);
    
    if (mcpClient) {
      mcpClient.close();
    }
    
    return new Response(
      JSON.stringify({ error: String(error), debugLogs }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
