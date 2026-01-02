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

// Simple MCP Client (based on reference code)
class MCPClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private sessionUrl: string | null = null;

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

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Failed to get SSE reader");

    const decoder = new TextDecoder();
    const startTime = Date.now();
    const timeout = 10000;

    while (Date.now() - startTime < timeout) {
      const { value, done } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split("\n");

      for (const line of lines) {
        if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          if (data.startsWith("/")) {
            this.sessionUrl = `${this.baseUrl}${data}`;
            console.log(`[${reqId}] MCP: Got session URL: ${this.sessionUrl}`);
            reader.cancel();
            return;
          }
        }
      }
    }

    reader.cancel();
    throw new Error("Timeout waiting for session URL");
  }

  private async sendRequest(method: string, params?: unknown, reqId?: string): Promise<unknown> {
    if (!this.sessionUrl) throw new Error("Not connected");

    const requestId = Date.now();
    console.log(`[${reqId}] MCP: Sending ${method}`);

    const response = await fetch(this.sessionUrl, {
      method: "POST",
      headers: {
        ...this.headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        method,
        params,
      }),
    });

    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error.message || JSON.stringify(result.error));
    }
    
    return result.result;
  }

  async initialize(reqId: string): Promise<void> {
    console.log(`[${reqId}] MCP: Initializing...`);
    
    await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      clientInfo: { name: "lovable-cfo", version: "1.0.0" }
    }, reqId);

    if (this.sessionUrl) {
      await fetch(this.sessionUrl, {
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

    let mcpClient: MCPClient | null = null;
    let mcpTools: Array<{ name: string; description: string; inputSchema: unknown }> = [];

    if (authToken && entityId && orgId) {
      try {
        mcpClient = new MCPClient("https://mcp.hellobooks.ai", {
          "Authorization": `Bearer ${authToken}`,
          "X-Entity-Id": entityId,
          "X-Org-Id": orgId,
        });

        await mcpClient.connect(reqId);
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
        mcpClient = null;
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
    return new Response(
      JSON.stringify({ error: String(error), debugLogs }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
