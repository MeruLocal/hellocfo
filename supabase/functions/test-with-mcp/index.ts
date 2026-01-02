import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

// SSE-based MCP Client for production server (mcp.hellobooks.ai)
// The production server returns 202 Accepted for POSTs and delivers responses via SSE
class MCPClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private messageEndpoint: string | null = null;
  private sseReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private decoder = new TextDecoder();
  private buffer = "";

  constructor(baseUrl: string, headers: Record<string, string>) {
    this.baseUrl = baseUrl;
    this.headers = headers;
  }

  async connect(reqId: string): Promise<void> {
    console.log(`[${reqId}] MCP: Connecting to ${this.baseUrl}/sse`);
    
    const response = await fetch(`${this.baseUrl}/sse`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`SSE connection failed: ${response.status}`);
    }

    this.sseReader = response.body!.getReader();
    
    // Read until we get the endpoint event
    const startTime = Date.now();
    const timeout = 15000;

    while (Date.now() - startTime < timeout) {
      const { value, done } = await this.sseReader.read();
      if (done) throw new Error("SSE stream ended unexpectedly");

      this.buffer += this.decoder.decode(value, { stream: true });
      
      // Parse SSE events from buffer
      const events = this.parseSSEBuffer();
      
      for (const event of events) {
        if (event.event === "endpoint" && event.data) {
          this.messageEndpoint = event.data.startsWith("http")
            ? event.data
            : `${this.baseUrl}${event.data}`;
          console.log(`[${reqId}] MCP: Got endpoint: ${this.messageEndpoint}`);
          return;
        }
      }
    }

    throw new Error("Timeout waiting for endpoint");
  }

  private parseSSEBuffer(): Array<{ event?: string; data?: string }> {
    // Robust SSE parsing:
    // - normalize CRLF
    // - split events by blank line ("\n\n")
    // - accumulate multiple data: lines
    const events: Array<{ event?: string; data?: string }> = [];

    const normalized = this.buffer.replace(/\r\n/g, "\n");
    const parts = normalized.split("\n\n");

    // The last part may be an incomplete event → keep it in buffer
    const remaining = parts.pop() ?? "";

    for (const part of parts) {
      if (!part.trim()) continue;

      let eventType: string | undefined;
      const dataLines: string[] = [];

      for (const line of part.split("\n")) {
        if (line.startsWith("event:")) {
          eventType = line.substring(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.substring(5).trim());
        }
      }

      if (dataLines.length > 0 || eventType) {
        events.push({ event: eventType, data: dataLines.length ? dataLines.join("\n") : undefined });
      }
    }

    this.buffer = remaining;
    return events;
  }

  private async waitForResponse(requestId: number, reqId: string, timeoutMs = 30000): Promise<unknown> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      if (!this.sseReader) throw new Error("SSE reader not available");
      
      const { value, done } = await this.sseReader.read();
      if (done) throw new Error("SSE stream ended while waiting for response");

      this.buffer += this.decoder.decode(value, { stream: true });
      
      const events = this.parseSSEBuffer();
      
      for (const event of events) {
        if (event.event === "message" && event.data) {
          try {
            const parsed = JSON.parse(event.data);
            console.log(`[${reqId}] MCP: Got message, id=${parsed.id}, looking for ${requestId}`);
            
            if (parsed.id === requestId) {
              if (parsed.error) {
                throw new Error(parsed.error.message || JSON.stringify(parsed.error));
              }
              return parsed.result;
            }
          } catch (e) {
            if (e instanceof SyntaxError) {
              console.log(`[${reqId}] MCP: Failed to parse SSE data: ${event.data.slice(0, 100)}`);
            } else {
              throw e;
            }
          }
        }
      }
    }

    throw new Error(`Timeout waiting for response to request ${requestId}`);
  }

  private async sendRequest(method: string, params?: unknown, reqId = "?"): Promise<unknown> {
    if (!this.messageEndpoint) throw new Error("Not connected");

    const requestId = Date.now();
    console.log(`[${reqId}] MCP: Sending ${method} (id=${requestId})`);

    // Send POST request (will return 202 Accepted)
    const response = await fetch(this.messageEndpoint, {
      method: "POST",
      headers: {
        ...this.headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        method,
        params: params || {},
      }),
    });

    console.log(`[${reqId}] MCP: POST ${method} returned ${response.status}`);

    // Wait for response on SSE stream
    return this.waitForResponse(requestId, reqId);
  }

  async initialize(reqId: string): Promise<void> {
    console.log(`[${reqId}] MCP: Initializing...`);
    
    await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      clientInfo: { name: "lovable-cfo", version: "1.0.0" }
    }, reqId);

    // Send initialized notification (no response expected)
    if (this.messageEndpoint) {
      await fetch(this.messageEndpoint, {
        method: "POST",
        headers: {
          ...this.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
          params: {},
        }),
      });
    }
    
    console.log(`[${reqId}] MCP: Initialized`);
  }

  async listTools(reqId: string): Promise<Array<{ name: string; description: string; inputSchema: unknown }>> {
    const result = await this.sendRequest("tools/list", {}, reqId) as { tools: Array<{ name: string; description: string; inputSchema: unknown }> };
    const tools = result.tools || [];
    console.log(`[${reqId}] MCP: Got ${tools.length} tools`);
    return tools;
  }

  async callTool(name: string, args: Record<string, unknown>, reqId: string): Promise<string> {
    console.log(`[${reqId}] MCP: Calling tool ${name}`);
    
    const result = await this.sendRequest("tools/call", { name, arguments: args }, reqId) as { 
      content: Array<{ type: string; text?: string }> 
    };
    
    const textContent = result.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n") || JSON.stringify(result);
    
    console.log(`[${reqId}] MCP: Tool ${name} returned ${textContent.length} chars`);
    return textContent;
  }

  close(): void {
    if (this.sseReader) {
      this.sseReader.cancel();
      this.sseReader = null;
    }
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
    throw new Error(`Anthropic API error: ${res.status}`);
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
        });

        await mcpClient.connect(reqId);
        
        debugLogs.push({ 
          timestamp: new Date().toISOString(), 
          type: 'mcp_connection', 
          data: { status: 'connected' } 
        });

        await mcpClient.initialize(reqId);
        mcpTools = await mcpClient.listTools(reqId);

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

    // Build tools
    const activeIntents = (intents || []).filter((i: any) => i.isActive);
    
    const matchIntentTool: AnthropicTool = {
      name: "match_intent",
      description: "Match the user's query to the most appropriate intent. Call this FIRST.",
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

    // System prompt
    const intentList = activeIntents.map((i: any, idx: number) => {
      const phrases = (i.trainingPhrases || []).slice(0, 5).join('; ');
      return `${idx + 1}. "${i.name}" - ${i.description || ''}\n   Examples: ${phrases}`;
    }).join('\n');

    const mcpToolList = mcpTools.map(t => `- ${t.name}: ${t.description}`).join('\n');

    const systemPrompt = `You are a CFO Query Resolution Engine.

WORKFLOW:
1. Call match_intent FIRST to identify the intent
2. Use MCP tools to retrieve actual data
3. Present results clearly

AVAILABLE INTENTS:
${intentList || 'None configured'}

INTENT MATCHING:
- Match by SEMANTIC meaning
- "give me top 10 vendors" matches vendor intents, not invoice intents

AVAILABLE MCP TOOLS (${mcpTools.length} tools):
${mcpToolList || 'None available'}

IMPORTANT: Use MCP tools to get REAL data. Do not make up data.

Context: ${businessContext?.country || 'IN'}, ${businessContext?.currency || 'INR'}`;

    // Chat
    const messages: any[] = [{ role: "user", content: query }];
    let response = await callAnthropic(llmConfig, systemPrompt, messages, allTools, reqId);

    let matchedIntent: any = null;
    let extractedEntities: Record<string, unknown> = {};
    let reasoning = "";
    let mcpResults: any[] = [];
    let inputTokens = response.usage?.input_tokens || 0;
    let outputTokens = response.usage?.output_tokens || 0;
    let iterations = 0;

    // Handle tool calls
    while (response.stop_reason === "tool_use" && iterations < 10) {
      iterations++;
      
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

          const mcpResult = await mcpClient.callTool(toolUse.name, toolUse.input || {}, reqId);
          mcpResults.push({ tool: toolUse.name, input: toolUse.input, result: mcpResult, success: true });
          result = mcpResult;
          
          debugLogs.push({ 
            timestamp: new Date().toISOString(), 
            type: 'mcp_response', 
            data: { tool: toolUse.name, length: mcpResult.length } 
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

      // Continue conversation
      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: toolUse.id, content: result, is_error: isError }],
      });

      response = await callAnthropic(llmConfig, systemPrompt, messages, allTools, reqId);
      inputTokens += response.usage?.input_tokens || 0;
      outputTokens += response.usage?.output_tokens || 0;
    }

    // Cleanup MCP connection
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

    console.log(`[${reqId}] Done. Intent: ${matchedIntent?.name || 'None'}, Iterations: ${iterations}, MCP: ${mcpTools.length} tools`);
    
    return new Response(JSON.stringify(output), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error(`[${reqId}] Error:`, error);
    
    // Cleanup on error
    if (mcpClient) {
      mcpClient.close();
    }
    
    return new Response(
      JSON.stringify({ error: String(error), debugLogs }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
