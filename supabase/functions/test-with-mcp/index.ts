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

interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface MCPConnection {
  messageEndpoint: string;
  headers: Record<string, string>;
  tools: MCPTool[];
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

// Parse SSE buffer into events
function parseSSEBuffer(buffer: string): { events: Array<{type: string, data: string}>, remaining: string } {
  const events: Array<{type: string, data: string}> = [];
  const parts = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const remaining = parts.pop() || '';
  
  for (const part of parts) {
    if (!part.trim()) continue;
    let eventType = 'message';
    const dataLines: string[] = [];
    
    for (const line of part.split('\n')) {
      if (line.startsWith('event:')) eventType = line.substring(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.substring(5).trim());
    }
    
    if (dataLines.length > 0) {
      events.push({ type: eventType, data: dataLines.join('\n') });
    }
  }
  
  return { events, remaining };
}

// Connect to MCP server
async function connectMCP(reqId: string, debugLogs: DebugLog[]): Promise<MCPConnection | null> {
  const authToken = Deno.env.get("MCP_HELLOBOOKS_AUTH_TOKEN");
  const entityId = Deno.env.get("MCP_HELLOBOOKS_ENTITY_ID");
  const orgId = Deno.env.get("MCP_HELLOBOOKS_ORG_ID");

  if (!authToken || !entityId || !orgId) return null;

  const headers = {
    "Authorization": `Bearer ${authToken}`,
    "X-Entity-Id": entityId,
    "X-Org-Id": orgId,
    "Content-Type": "application/json",
  };

  debugLogs.push({ timestamp: new Date().toISOString(), type: 'mcp_connection', data: { status: 'connecting' } });

  try {
    // Get SSE endpoint
    const sseResponse = await fetch("https://mcp.hellobooks.ai/sse", {
      headers: { ...headers, "Accept": "text/event-stream" },
    });

    if (!sseResponse.ok) throw new Error(`SSE failed: ${sseResponse.status}`);

    const reader = sseResponse.body?.getReader();
    if (!reader) throw new Error("No body");

    const decoder = new TextDecoder();
    let buffer = "";
    let messageEndpoint = "";
    const start = Date.now();

    while (Date.now() - start < 10000 && !messageEndpoint) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, remaining } = parseSSEBuffer(buffer);
      buffer = remaining;
      for (const e of events) {
        if (e.type === "endpoint") {
          messageEndpoint = e.data.startsWith("http") ? e.data : `https://mcp.hellobooks.ai${e.data}`;
          break;
        }
      }
    }
    reader.cancel();

    if (!messageEndpoint) throw new Error("No endpoint");

    console.log(`[${reqId}] MCP endpoint: ${messageEndpoint}`);

    // Initialize
    await fetch(messageEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, clientInfo: { name: "lovable", version: "1.0.0" } } }),
    });

    await fetch(messageEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }),
    });

    // List tools
    const toolsRes = await fetch(messageEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });

    const toolsData = await toolsRes.json();
    const tools: MCPTool[] = toolsData.result?.tools || [];

    console.log(`[${reqId}] MCP: ${tools.length} tools`);
    debugLogs.push({ timestamp: new Date().toISOString(), type: 'mcp_tools', data: { tools: tools.map(t => t.name) } });

    return { messageEndpoint, headers, tools };
  } catch (e) {
    console.error(`[${reqId}] MCP error:`, e);
    debugLogs.push({ timestamp: new Date().toISOString(), type: 'error', data: { error: String(e) } });
    return null;
  }
}

// Call MCP tool
async function callMCPTool(conn: MCPConnection, tool: string, args: Record<string, unknown>, reqId: string, debugLogs: DebugLog[]): Promise<unknown> {
  const callId = Date.now();
  console.log(`[${reqId}] MCP call: ${tool}`);
  debugLogs.push({ timestamp: new Date().toISOString(), type: 'mcp_request', data: { tool, args } });

  const res = await fetch(conn.messageEndpoint, {
    method: "POST",
    headers: conn.headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: callId, method: "tools/call", params: { name: tool, arguments: args } }),
  });

  const text = await res.text();

  // Handle async 202
  if (res.status === 202 || text === "Accepted") {
    const sse = await fetch("https://mcp.hellobooks.ai/sse", { headers: { ...conn.headers, "Accept": "text/event-stream" } });
    if (!sse.ok) throw new Error("SSE failed");
    
    const reader = sse.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const start = Date.now();

    while (Date.now() - start < 30000) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const { events, remaining } = parseSSEBuffer(buf);
      buf = remaining;
      
      for (const e of events) {
        if (e.type === "message") {
          try {
            const p = JSON.parse(e.data);
            if (p.id === callId && p.result) {
              reader.cancel();
              const content = (p.result.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
              debugLogs.push({ timestamp: new Date().toISOString(), type: 'mcp_response', data: { tool, async: true } });
              try { return JSON.parse(content); } catch { return content; }
            }
          } catch {}
        }
      }
    }
    reader.cancel();
    throw new Error("MCP timeout");
  }

  // Sync response
  const result = JSON.parse(text);
  if (result.result?.content) {
    const content = result.result.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
    debugLogs.push({ timestamp: new Date().toISOString(), type: 'mcp_response', data: { tool, sync: true } });
    try { return JSON.parse(content); } catch { return content; }
  }
  return result.result || result;
}

// Call Anthropic API
async function callAnthropic(config: LLMConfig, system: string, messages: any[], tools: AnthropicTool[], reqId: string): Promise<any> {
  const endpoint = config.provider === "azure-anthropic" 
    ? `${config.endpoint || "https://cursor-api-west-us-resource.openai.azure.com/anthropic"}/v1/messages`
    : "https://api.anthropic.com/v1/messages";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.api_key || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.max_tokens,
      system,
      messages,
      tools: tools.length > 0 ? tools : undefined,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[${reqId}] Anthropic error:`, err);
    throw new Error(`Anthropic API error: ${res.status}`);
  }

  return res.json();
}

serve(async (req) => {
  const reqId = crypto.randomUUID().slice(0, 8);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const debugLogs: DebugLog[] = [];

  try {
    const { query, intents, businessContext, debug = false } = await req.json();
    if (!query) return new Response(JSON.stringify({ error: "Query required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    console.log(`[${reqId}] Query: ${query}`);

    // Get LLM config
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: llmConfig } = await supabase.from("llm_configs").select("*").eq("is_default", true).single();
    if (!llmConfig?.api_key) throw new Error("LLM not configured");

    // Connect MCP
    const mcp = await connectMCP(reqId, debugLogs);

    // Build tools
    const activeIntents = (intents || []).filter((i: any) => i.isActive);
    
    const matchIntentTool: AnthropicTool = {
      name: "match_intent",
      description: "Match query to intent. Call FIRST.",
      input_schema: {
        type: "object",
        properties: {
          intent_name: { type: "string", description: "Exact intent name" },
          confidence: { type: "number", description: "0.0-1.0" },
          reasoning: { type: "string" },
          extracted_entities: { type: "object" }
        },
        required: ["intent_name", "confidence", "reasoning"]
      }
    };

    const mcpTools: AnthropicTool[] = (mcp?.tools || []).map(t => ({
      name: t.name,
      description: t.description || "",
      input_schema: t.inputSchema,
    }));

    const allTools = [matchIntentTool, ...mcpTools];

    // System prompt
    const intentList = activeIntents.map((i: any, idx: number) => 
      `${idx + 1}. "${i.name}" - ${i.description || ''}\n   Examples: ${(i.trainingPhrases || []).slice(0, 3).join('; ')}`
    ).join('\n');

    const system = `You are a CFO Query Resolution Engine.

WORKFLOW:
1. Call match_intent FIRST
2. Call MCP tools to get real data
3. Present results clearly

INTENTS:
${intentList || 'None'}

MATCHING: Use SEMANTIC meaning. "give me top 10 vendors" matches vendor intents, not invoice intents.

MCP TOOLS:
${mcpTools.map(t => `- ${t.name}: ${t.description}`).join('\n') || 'None'}

Context: ${businessContext?.country || 'IN'}, ${businessContext?.currency || 'INR'}`;

    // Run conversation
    const messages: any[] = [{ role: "user", content: query }];
    let response = await callAnthropic(llmConfig, system, messages, allTools, reqId);

    let matchedIntent: any = null;
    let extractedEntities: Record<string, unknown> = {};
    let reasoning = "";
    let mcpResults: any[] = [];
    let inputTokens = response.usage?.input_tokens || 0;
    let outputTokens = response.usage?.output_tokens || 0;
    let iterations = 0;

    while (response.stop_reason === "tool_use" && iterations < 5) {
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
        
        const found = activeIntents.find((i: any) => 
          i.name.toLowerCase() === input.intent_name.toLowerCase() ||
          i.name.toLowerCase().includes(input.intent_name.toLowerCase()) ||
          input.intent_name.toLowerCase().includes(i.name.toLowerCase())
        );

        if (found) {
          matchedIntent = { id: found.id, name: found.name, moduleId: found.moduleId, confidence: input.confidence };
          result = JSON.stringify({ success: true, intent: found.name });
          debugLogs.push({ timestamp: new Date().toISOString(), type: 'intent_match', data: { matched: found.name, confidence: input.confidence } });
        } else {
          result = JSON.stringify({ error: `Not found: ${input.intent_name}`, available: activeIntents.map((i: any) => i.name) });
          isError = true;
        }
      } else if (mcp) {
        try {
          const r = await callMCPTool(mcp, toolUse.name, toolUse.input, reqId, debugLogs);
          mcpResults.push({ tool: toolUse.name, input: toolUse.input, result: r, success: true });
          result = typeof r === 'string' ? r : JSON.stringify(r);
        } catch (e) {
          mcpResults.push({ tool: toolUse.name, error: String(e), success: false });
          result = JSON.stringify({ error: String(e) });
          isError = true;
        }
      } else {
        result = JSON.stringify({ error: "MCP not connected" });
        isError = true;
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: toolUse.id, content: result, is_error: isError }] });

      response = await callAnthropic(llmConfig, system, messages, allTools, reqId);
      inputTokens += response.usage?.input_tokens || 0;
      outputTokens += response.usage?.output_tokens || 0;
    }

    const text = response.content.find((b: any) => b.type === "text")?.text || "";

    const output: any = {
      query,
      timestamp: new Date().toISOString(),
      matchedIntent,
      extractedEntities,
      reasoning,
      response: text,
      mcpToolResults: mcpResults.length > 0 ? mcpResults : undefined,
      dataSources: mcpResults.map(r => r.tool),
      llmModel: `${llmConfig.provider}/${llmConfig.model}`,
      iterationCount: iterations,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens }
    };

    if (debug) output.debugLogs = debugLogs;

    console.log(`[${reqId}] Done. Intent: ${matchedIntent?.name || 'None'}`);
    return new Response(JSON.stringify(output), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error(`[${reqId}] Error:`, e);
    return new Response(JSON.stringify({ error: String(e), debugLogs }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
