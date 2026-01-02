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
  sseUrl: string;
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

// Wait for JSON-RPC response via SSE
async function waitForResponse(
  sseUrl: string, 
  headers: Record<string, string>, 
  expectedId: number, 
  reqId: string,
  timeoutMs = 30000
): Promise<any> {
  const sse = await fetch(sseUrl, { 
    headers: { ...headers, "Accept": "text/event-stream" } 
  });
  
  if (!sse.ok) throw new Error(`SSE failed: ${sse.status}`);
  
  const reader = sse.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const start = Date.now();

  try {
    while (Date.now() - start < timeoutMs) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const { events, remaining } = parseSSEBuffer(buffer);
      buffer = remaining;
      
      for (const event of events) {
        if (event.type === "message") {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.id === expectedId) {
              console.log(`[${reqId}] Got response for id ${expectedId}`);
              return parsed;
            }
          } catch {}
        }
      }
    }
    throw new Error(`Timeout waiting for response id ${expectedId}`);
  } finally {
    reader.cancel();
  }
}

// Send MCP request and wait for response
async function mcpRequest(
  messageEndpoint: string,
  sseUrl: string,
  headers: Record<string, string>,
  method: string,
  params: Record<string, unknown>,
  reqId: string,
  debugLogs: DebugLog[]
): Promise<any> {
  const requestId = Date.now();
  
  // Start listening for response BEFORE sending request
  const responsePromise = waitForResponse(sseUrl, headers, requestId, reqId);
  
  // Small delay to ensure SSE is connected
  await new Promise(r => setTimeout(r, 100));
  
  // Send the request
  const res = await fetch(messageEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ 
      jsonrpc: "2.0", 
      id: requestId, 
      method, 
      params 
    }),
  });
  
  const responseText = await res.text();
  console.log(`[${reqId}] MCP ${method} -> ${res.status}: ${responseText.substring(0, 100)}`);
  
  // If we get a direct JSON response (not 202), use it
  if (res.ok && responseText && responseText !== "Accepted" && responseText.startsWith("{")) {
    try {
      const direct = JSON.parse(responseText);
      if (direct.result !== undefined || direct.error !== undefined) {
        return direct;
      }
    } catch {}
  }
  
  // Otherwise wait for SSE response
  return await responsePromise;
}

// Connect to MCP server
async function connectMCP(reqId: string, debugLogs: DebugLog[]): Promise<MCPConnection | null> {
  const authToken = Deno.env.get("MCP_HELLOBOOKS_AUTH_TOKEN");
  const entityId = Deno.env.get("MCP_HELLOBOOKS_ENTITY_ID");
  const orgId = Deno.env.get("MCP_HELLOBOOKS_ORG_ID");

  if (!authToken || !entityId || !orgId) {
    console.log(`[${reqId}] MCP credentials missing`);
    return null;
  }

  const headers = {
    "Authorization": `Bearer ${authToken}`,
    "X-Entity-Id": entityId,
    "X-Org-Id": orgId,
    "Content-Type": "application/json",
  };

  const sseUrl = "https://mcp.hellobooks.ai/sse";
  debugLogs.push({ timestamp: new Date().toISOString(), type: 'mcp_connection', data: { status: 'connecting' } });

  try {
    // Step 1: Get message endpoint from SSE
    console.log(`[${reqId}] Connecting to MCP SSE...`);
    const sseResponse = await fetch(sseUrl, {
      headers: { ...headers, "Accept": "text/event-stream" },
    });

    if (!sseResponse.ok) throw new Error(`SSE failed: ${sseResponse.status}`);

    const reader = sseResponse.body?.getReader();
    if (!reader) throw new Error("No SSE body");

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
      
      for (const event of events) {
        if (event.type === "endpoint") {
          messageEndpoint = event.data.startsWith("http") 
            ? event.data 
            : `https://mcp.hellobooks.ai${event.data}`;
          break;
        }
      }
    }
    reader.cancel();

    if (!messageEndpoint) throw new Error("No endpoint received from SSE");
    console.log(`[${reqId}] MCP endpoint: ${messageEndpoint}`);

    // Step 2: Initialize - fire and forget (notification-like)
    console.log(`[${reqId}] Sending initialize...`);
    await fetch(messageEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ 
        jsonrpc: "2.0", 
        id: 1, 
        method: "initialize", 
        params: { 
          protocolVersion: "2024-11-05", 
          capabilities: { tools: {} }, 
          clientInfo: { name: "lovable-cfo", version: "1.0.0" } 
        } 
      }),
    });

    // Small delay for server to process
    await new Promise(r => setTimeout(r, 200));

    // Step 3: Send initialized notification
    console.log(`[${reqId}] Sending initialized notification...`);
    await fetch(messageEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ 
        jsonrpc: "2.0", 
        method: "notifications/initialized", 
        params: {} 
      }),
    });

    await new Promise(r => setTimeout(r, 200));

    // Step 4: List tools using proper SSE response handling
    console.log(`[${reqId}] Requesting tools list...`);
    const toolsResponse = await mcpRequest(
      messageEndpoint, 
      sseUrl, 
      headers, 
      "tools/list", 
      {}, 
      reqId, 
      debugLogs
    );

    const tools: MCPTool[] = toolsResponse.result?.tools || [];
    console.log(`[${reqId}] MCP connected with ${tools.length} tools: ${tools.map(t => t.name).join(', ')}`);
    
    debugLogs.push({ 
      timestamp: new Date().toISOString(), 
      type: 'mcp_tools', 
      data: { count: tools.length, tools: tools.map(t => t.name) } 
    });

    return { sseUrl, messageEndpoint, headers, tools };
  } catch (error) {
    console.error(`[${reqId}] MCP connection error:`, error);
    debugLogs.push({ 
      timestamp: new Date().toISOString(), 
      type: 'error', 
      data: { phase: 'connection', error: String(error) } 
    });
    return null;
  }
}

// Call MCP tool
async function callMCPTool(
  conn: MCPConnection, 
  toolName: string, 
  args: Record<string, unknown>, 
  reqId: string, 
  debugLogs: DebugLog[]
): Promise<unknown> {
  console.log(`[${reqId}] Calling MCP tool: ${toolName}`);
  debugLogs.push({ 
    timestamp: new Date().toISOString(), 
    type: 'mcp_request', 
    data: { tool: toolName, args } 
  });

  const response = await mcpRequest(
    conn.messageEndpoint,
    conn.sseUrl,
    conn.headers,
    "tools/call",
    { name: toolName, arguments: args },
    reqId,
    debugLogs
  );

  if (response.error) {
    throw new Error(response.error.message || JSON.stringify(response.error));
  }

  // Extract text content from result
  const content = (response.result?.content || [])
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('\n');

  debugLogs.push({ 
    timestamp: new Date().toISOString(), 
    type: 'mcp_response', 
    data: { tool: toolName, contentLength: content.length } 
  });

  // Try to parse as JSON
  try {
    return JSON.parse(content);
  } catch {
    return content;
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
      max_tokens: config.max_tokens,
      system,
      messages,
      tools: tools.length > 0 ? tools : undefined,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[${reqId}] Anthropic error:`, err);
    throw new Error(`Anthropic API error: ${res.status} - ${err}`);
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
      throw new Error("LLM not configured - please set up an LLM provider with API key");
    }

    // Connect to MCP
    const mcp = await connectMCP(reqId, debugLogs);
    
    if (!mcp) {
      console.log(`[${reqId}] MCP not available, proceeding without tools`);
    }

    // Build tools list
    const activeIntents = (intents || []).filter((i: any) => i.isActive);
    
    const matchIntentTool: AnthropicTool = {
      name: "match_intent",
      description: "Match the user's query to the most appropriate intent. Call this FIRST before any other tools.",
      input_schema: {
        type: "object",
        properties: {
          intent_name: { 
            type: "string", 
            description: "The exact name of the matched intent from the available list" 
          },
          confidence: { 
            type: "number", 
            description: "Confidence score from 0.0 to 1.0" 
          },
          reasoning: { 
            type: "string",
            description: "Brief explanation of why this intent was matched"
          },
          extracted_entities: { 
            type: "object",
            description: "Any entities extracted from the query (dates, amounts, names, etc.)"
          }
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

    // Build system prompt
    const intentList = activeIntents.map((i: any, idx: number) => {
      const phrases = (i.trainingPhrases || []).slice(0, 5).join('; ');
      return `${idx + 1}. "${i.name}"\n   Description: ${i.description || 'N/A'}\n   Examples: ${phrases}`;
    }).join('\n');

    const mcpToolList = mcpTools.map(t => `- ${t.name}: ${t.description}`).join('\n');

    const system = `You are a CFO Query Resolution Engine. Your job is to understand financial queries and retrieve data.

WORKFLOW:
1. FIRST: Call match_intent to identify which intent matches the user's query
2. THEN: Use MCP tools to retrieve the actual data needed to answer the query
3. FINALLY: Present the results clearly to the user

AVAILABLE INTENTS:
${intentList || 'No intents configured'}

INTENT MATCHING RULES:
- Match based on SEMANTIC meaning, not just keywords
- "give me top 10 vendors" should match vendor-related intents, NOT invoice intents
- "what is my cash balance" should match cash/balance intents
- Use the training phrase examples as guidance
- If no intent matches well (confidence < 0.5), still try to help using available MCP tools

AVAILABLE MCP TOOLS:
${mcpToolList || 'No MCP tools available'}

IMPORTANT:
- You MUST call MCP tools to get real data - do not make up or hallucinate data
- If MCP tools are not available, explain that you cannot retrieve the data
- Present results in a clear, formatted way

Business Context:
- Country: ${businessContext?.country || 'IN'}
- Currency: ${businessContext?.currency || 'INR'}`;

    // Run the conversation loop
    const messages: any[] = [{ role: "user", content: query }];
    let response = await callAnthropic(llmConfig, system, messages, allTools, reqId);

    let matchedIntent: any = null;
    let extractedEntities: Record<string, unknown> = {};
    let reasoning = "";
    let mcpResults: any[] = [];
    let inputTokens = response.usage?.input_tokens || 0;
    let outputTokens = response.usage?.output_tokens || 0;
    let iterations = 0;

    // Process tool calls
    while (response.stop_reason === "tool_use" && iterations < 10) {
      iterations++;
      const toolUseBlocks = response.content.filter((b: any) => b.type === "tool_use");
      
      if (toolUseBlocks.length === 0) break;

      const toolResults: any[] = [];

      for (const toolUse of toolUseBlocks) {
        console.log(`[${reqId}] Tool call: ${toolUse.name}`);
        
        let result: string;
        let isError = false;

        if (toolUse.name === "match_intent") {
          const input = toolUse.input as any;
          reasoning = input.reasoning || "";
          extractedEntities = input.extracted_entities || {};
          
          // Find matching intent (flexible matching)
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
            result = JSON.stringify({ 
              success: true, 
              matched_intent: found.name,
              message: "Intent matched successfully. Now use MCP tools to get the data."
            });
            debugLogs.push({ 
              timestamp: new Date().toISOString(), 
              type: 'intent_match', 
              data: { 
                matched: found.name, 
                confidence: input.confidence,
                reasoning: input.reasoning 
              } 
            });
          } else {
            result = JSON.stringify({ 
              error: `Intent not found: "${input.intent_name}"`, 
              available_intents: activeIntents.map((i: any) => i.name),
              suggestion: "Try matching to one of the available intents listed above"
            });
            isError = true;
          }
        } else if (mcp) {
          // Call MCP tool
          try {
            const mcpResult = await callMCPTool(mcp, toolUse.name, toolUse.input || {}, reqId, debugLogs);
            mcpResults.push({ 
              tool: toolUse.name, 
              input: toolUse.input, 
              result: mcpResult, 
              success: true 
            });
            result = typeof mcpResult === 'string' ? mcpResult : JSON.stringify(mcpResult);
          } catch (error) {
            console.error(`[${reqId}] MCP tool error:`, error);
            mcpResults.push({ 
              tool: toolUse.name, 
              input: toolUse.input,
              error: String(error), 
              success: false 
            });
            result = JSON.stringify({ error: String(error) });
            isError = true;
          }
        } else {
          result = JSON.stringify({ 
            error: "MCP tools are not available. Cannot retrieve data.",
            suggestion: "Please check MCP connection settings"
          });
          isError = true;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
          is_error: isError
        });
      }

      // Add assistant response and tool results to messages
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });

      // Get next response
      response = await callAnthropic(llmConfig, system, messages, allTools, reqId);
      inputTokens += response.usage?.input_tokens || 0;
      outputTokens += response.usage?.output_tokens || 0;
    }

    // Extract final text response
    const finalText = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    const output: any = {
      query,
      timestamp: new Date().toISOString(),
      matchedIntent,
      extractedEntities,
      reasoning,
      response: finalText,
      mcpToolResults: mcpResults.length > 0 ? mcpResults : undefined,
      dataSources: mcpResults.filter(r => r.success).map(r => r.tool),
      llmModel: `${llmConfig.provider}/${llmConfig.model}`,
      iterationCount: iterations,
      usage: { 
        input_tokens: inputTokens, 
        output_tokens: outputTokens, 
        total_tokens: inputTokens + outputTokens 
      }
    };

    if (debug) {
      output.debugLogs = debugLogs;
    }

    console.log(`[${reqId}] Done. Intent: ${matchedIntent?.name || 'None'}, Iterations: ${iterations}`);
    
    return new Response(
      JSON.stringify(output), 
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(`[${reqId}] Error:`, error);
    return new Response(
      JSON.stringify({ 
        error: String(error), 
        debugLogs: debugLogs.length > 0 ? debugLogs : undefined 
      }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
