import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Parse SSE events properly
function parseSSEBuffer(buffer: string): { events: Array<{type: string, data: string}>, remaining: string } {
  const events: Array<{type: string, data: string}> = [];
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const remaining = parts.pop() || '';
  
  for (const part of parts) {
    if (!part.trim()) continue;
    let eventType = 'message';
    const dataLines: string[] = [];
    
    const lines = part.split('\n');
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.substring(5).trim());
      }
    }
    
    if (dataLines.length > 0) {
      events.push({ type: eventType, data: dataLines.join('\n') });
    }
  }
  
  return { events, remaining };
}

// Read from stream with timeout
async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number
): Promise<{ done: boolean; value?: Uint8Array } | null> {
  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), timeoutMs);
  });
  return Promise.race([reader.read(), timeoutPromise]);
}

interface MCPConnection {
  messageEndpoint: string;
  mcpHeaders: Record<string, string>;
  sseReader?: ReadableStreamDefaultReader<Uint8Array>;
}

interface DebugLog {
  timestamp: string;
  type: 'mcp_connection' | 'mcp_request' | 'mcp_response' | 'llm_request' | 'llm_response' | 'intent_match' | 'error';
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
  system_prompt_override: string | null;
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | Array<{ type: string; [key: string]: unknown }>;
}

// Establish MCP connection and get endpoint
async function establishMCPConnection(reqId: string, debugLogs: DebugLog[]): Promise<MCPConnection | null> {
  const authToken = Deno.env.get("MCP_HELLOBOOKS_AUTH_TOKEN");
  const entityId = Deno.env.get("MCP_HELLOBOOKS_ENTITY_ID");
  const orgId = Deno.env.get("MCP_HELLOBOOKS_ORG_ID");

  if (!authToken || !entityId || !orgId) {
    console.error(`[${reqId}] Missing MCP credentials`);
    debugLogs.push({
      timestamp: new Date().toISOString(),
      type: 'error',
      data: { message: 'Missing MCP credentials', hasAuthToken: !!authToken, hasEntityId: !!entityId, hasOrgId: !!orgId }
    });
    return null;
  }

  const mcpHeaders = {
    "Authorization": `Bearer ${authToken}`,
    "X-Entity-Id": entityId,
    "X-Org-Id": orgId,
  };

  console.log(`[${reqId}] Establishing MCP connection...`);
  debugLogs.push({
    timestamp: new Date().toISOString(),
    type: 'mcp_connection',
    data: { status: 'connecting', endpoint: 'https://mcp.hellobooks.ai/sse' }
  });

  const sseResponse = await fetch("https://mcp.hellobooks.ai/sse", {
    method: "GET",
    headers: {
      ...mcpHeaders,
      "Accept": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });

  if (!sseResponse.ok) {
    console.error(`[${reqId}] SSE connection failed: ${sseResponse.status}`);
    debugLogs.push({
      timestamp: new Date().toISOString(),
      type: 'error',
      data: { message: 'SSE connection failed', status: sseResponse.status }
    });
    return null;
  }

  const reader = sseResponse.body?.getReader();
  if (!reader) return null;

  const decoder = new TextDecoder();
  let buffer = "";
  let messageEndpoint = "";
  const startTime = Date.now();
  const TIMEOUT = 15000;

  while (Date.now() - startTime < TIMEOUT) {
    const result = await readWithTimeout(reader, 3000);
    if (result === null) continue;
    if (result.done) break;

    buffer += decoder.decode(result.value, { stream: true });
    const { events, remaining } = parseSSEBuffer(buffer);
    buffer = remaining;

    for (const event of events) {
      if (event.type === "endpoint") {
        messageEndpoint = event.data;
        if (!messageEndpoint.startsWith("http")) {
          messageEndpoint = `https://mcp.hellobooks.ai${messageEndpoint}`;
        }

        console.log(`[${reqId}] Got MCP endpoint: ${messageEndpoint}`);

        // Initialize MCP connection
        const initResponse = await fetch(messageEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...mcpHeaders },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "lovable-test-console", version: "1.0.0" }
            }
          }),
        });

        if (initResponse.ok) {
          // Send initialized notification
          await fetch(messageEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...mcpHeaders },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "notifications/initialized",
              params: {}
            }),
          });

          reader.cancel();
          console.log(`[${reqId}] MCP connection established successfully`);
          debugLogs.push({
            timestamp: new Date().toISOString(),
            type: 'mcp_connection',
            data: { status: 'connected', endpoint: messageEndpoint }
          });
          
          return { messageEndpoint, mcpHeaders, sseReader: reader };
        }
      }
    }
  }

  reader.cancel();
  return null;
}

// Wait for MCP result via SSE (for async 202 responses)
async function waitForMCPResult(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callId: number,
  reqId: string,
  debugLogs: DebugLog[],
  timeoutMs: number = 30000
): Promise<unknown> {
  const decoder = new TextDecoder();
  let buffer = "";
  const startTime = Date.now();

  console.log(`[${reqId}] Waiting for MCP result via SSE for call ID: ${callId}`);

  while (Date.now() - startTime < timeoutMs) {
    const result = await readWithTimeout(reader, 5000);
    if (result === null) continue;
    if (result.done) break;

    buffer += decoder.decode(result.value, { stream: true });
    const { events, remaining } = parseSSEBuffer(buffer);
    buffer = remaining;

    for (const event of events) {
      console.log(`[${reqId}] SSE event received: ${event.type}`, event.data.substring(0, 200));
      
      if (event.type === "message") {
        try {
          const parsed = JSON.parse(event.data);
          
          debugLogs.push({
            timestamp: new Date().toISOString(),
            type: 'mcp_response',
            data: { event: 'sse_message', callId, parsed: JSON.stringify(parsed).substring(0, 500) }
          });
          
          // Check if this is the response for our call
          if (parsed.id === callId) {
            console.log(`[${reqId}] Received MCP response for call ${callId}`);
            
            if (parsed.result?.content) {
              const textContent = parsed.result.content
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text)
                .join('\n');
              
              try {
                return JSON.parse(textContent);
              } catch {
                return textContent;
              }
            }
            
            return parsed.result || parsed;
          }
        } catch (e) {
          console.log(`[${reqId}] Failed to parse SSE data:`, e);
        }
      }
    }
  }

  throw new Error(`Timeout waiting for MCP result for call ${callId}`);
}

// Call MCP tool with async response handling
async function callMCPTool(
  connection: MCPConnection,
  toolName: string,
  toolArgs: Record<string, unknown>,
  reqId: string,
  debugLogs: DebugLog[]
): Promise<unknown> {
  console.log(`[${reqId}] Calling MCP tool: ${toolName}`, JSON.stringify(toolArgs));

  const callId = Date.now();
  
  const requestBody = {
    jsonrpc: "2.0",
    id: callId,
    method: "tools/call",
    params: {
      name: toolName,
      arguments: toolArgs
    }
  };
  
  debugLogs.push({
    timestamp: new Date().toISOString(),
    type: 'mcp_request',
    data: { 
      tool: toolName, 
      args: toolArgs, 
      callId,
      endpoint: connection.messageEndpoint
    }
  });

  // Send the tool call request
  const response = await fetch(connection.messageEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...connection.mcpHeaders },
    body: JSON.stringify(requestBody),
  });

  const responseStatus = response.status;
  const responseText = await response.text();
  
  console.log(`[${reqId}] MCP response status: ${responseStatus}`);
  console.log(`[${reqId}] MCP response text: ${responseText.substring(0, 500)}`);
  
  debugLogs.push({
    timestamp: new Date().toISOString(),
    type: 'mcp_response',
    data: { 
      tool: toolName, 
      status: responseStatus, 
      body: responseText.substring(0, 1000),
      callId
    }
  });

  // Handle 202 Accepted - async response via SSE
  if (responseStatus === 202 || responseText === "Accepted") {
    console.log(`[${reqId}] Received 202 Accepted, waiting for SSE response...`);
    
    if (connection.sseReader) {
      return await waitForMCPResult(connection.sseReader, callId, reqId, debugLogs);
    } else {
      // Open a new SSE connection to wait for the result
      const authToken = Deno.env.get("MCP_HELLOBOOKS_AUTH_TOKEN");
      const entityId = Deno.env.get("MCP_HELLOBOOKS_ENTITY_ID");
      const orgId = Deno.env.get("MCP_HELLOBOOKS_ORG_ID");
      
      const sseResponse = await fetch("https://mcp.hellobooks.ai/sse", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${authToken}`,
          "X-Entity-Id": entityId!,
          "X-Org-Id": orgId!,
          "Accept": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
      
      if (sseResponse.ok && sseResponse.body) {
        const reader = sseResponse.body.getReader();
        try {
          return await waitForMCPResult(reader, callId, reqId, debugLogs);
        } finally {
          reader.cancel();
        }
      }
      
      throw new Error("Failed to open SSE connection for async result");
    }
  }

  if (!response.ok && responseStatus !== 200) {
    throw new Error(`MCP tool call failed: ${responseStatus} - ${responseText}`);
  }

  // Try to parse as JSON
  try {
    const result = JSON.parse(responseText);
    console.log(`[${reqId}] MCP tool response parsed:`, JSON.stringify(result).substring(0, 500));
    
    // Extract the actual content from the MCP response
    if (result.result?.content) {
      const textContent = result.result.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');
      
      try {
        return JSON.parse(textContent);
      } catch {
        return textContent;
      }
    }
    
    return result.result || result;
  } catch {
    return responseText;
  }
}

// Call Anthropic API (Azure or Direct)
async function callAnthropicAPI(
  config: LLMConfig,
  messages: AnthropicMessage[],
  tools: AnthropicTool[],
  systemPrompt: string,
  reqId: string,
  debugLogs: DebugLog[]
): Promise<any> {
  let endpoint: string;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.provider === "azure-anthropic") {
    endpoint = config.endpoint 
      ? `${config.endpoint}/v1/messages` 
      : "https://cursor-api-west-us-resource.openai.azure.com/anthropic/v1/messages";
    headers["x-api-key"] = config.api_key || "";
    headers["anthropic-version"] = "2023-06-01";
  } else if (config.provider === "anthropic") {
    endpoint = "https://api.anthropic.com/v1/messages";
    headers["x-api-key"] = config.api_key || "";
    headers["anthropic-version"] = "2023-06-01";
  } else {
    throw new Error(`Unsupported provider: ${config.provider}`);
  }

  const body: any = {
    model: config.model,
    max_tokens: config.max_tokens,
    system: systemPrompt,
    messages: messages,
  };

  // Only add temperature if not using a model that doesn't support it
  const noTempModels = ["claude-opus-4", "claude-sonnet-4", "claude-3-7", "o3", "o4"];
  const shouldSkipTemp = noTempModels.some(m => config.model.includes(m));
  if (!shouldSkipTemp) {
    body.temperature = config.temperature;
  }

  // Add tools if available
  if (tools.length > 0) {
    body.tools = tools;
  }

  console.log(`[${reqId}] Calling ${config.provider} API at ${endpoint}`);
  console.log(`[${reqId}] Model: ${config.model}, Tools: ${tools.length}`);

  debugLogs.push({
    timestamp: new Date().toISOString(),
    type: 'llm_request',
    data: { 
      provider: config.provider,
      model: config.model,
      endpoint,
      toolCount: tools.length,
      messageCount: messages.length,
      systemPromptLength: systemPrompt.length
    }
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[${reqId}] LLM API error ${response.status}:`, errorText);
    debugLogs.push({
      timestamp: new Date().toISOString(),
      type: 'error',
      data: { message: 'LLM API error', status: response.status, error: errorText }
    });
    throw new Error(`LLM API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  
  debugLogs.push({
    timestamp: new Date().toISOString(),
    type: 'llm_response',
    data: { 
      stopReason: result.stop_reason,
      usage: result.usage,
      contentTypes: result.content?.map((c: any) => c.type)
    }
  });

  return result;
}

serve(async (req) => {
  const reqId = crypto.randomUUID().slice(0, 8);
  console.log(`[${reqId}] Test with MCP request received`);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const debugLogs: DebugLog[] = [];

  try {
    const { query, intents, businessContext, mcpTools, llmConfig: providedConfig, debug = false } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[${reqId}] Processing query: ${query}`);
    console.log(`[${reqId}] Available intents: ${intents?.length || 0}`);
    console.log(`[${reqId}] MCP tools provided: ${mcpTools?.length || 0}`);

    // Get LLM config from database if not provided
    let llmConfig: LLMConfig | null = providedConfig;
    
    if (!llmConfig?.api_key) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { data: configData, error: configError } = await supabase
        .from("llm_configs")
        .select("*")
        .eq("is_default", true)
        .single();
      
      if (configError) {
        console.error(`[${reqId}] Failed to fetch LLM config:`, configError);
        throw new Error("Failed to fetch LLM configuration");
      }
      
      llmConfig = configData as LLMConfig;
      console.log(`[${reqId}] Using LLM config: ${llmConfig.provider}/${llmConfig.model}`);
    }

    if (!llmConfig?.api_key) {
      throw new Error("LLM API key not configured");
    }

    // Build intent list with exact names for matching
    const activeIntents = (intents || []).filter((i: any) => i.isActive);
    const intentList = activeIntents.map((i: any, idx: number) => ({
      index: idx + 1,
      name: i.name,
      description: i.description || '',
      trainingPhrases: i.trainingPhrases?.slice(0, 5) || [],
      entities: i.entities?.map((e: any) => ({ name: e.name, type: e.type })) || [],
      moduleId: i.moduleId
    }));

    // Create the match_intent tool for structured intent matching
    const matchIntentTool: AnthropicTool = {
      name: "match_intent",
      description: "Match the user's query to the most appropriate intent from the available list. You MUST call this first before any other tools.",
      input_schema: {
        type: "object",
        properties: {
          intent_name: { 
            type: "string", 
            description: "The EXACT name of the matched intent from the available intents list. Must match exactly!" 
          },
          confidence: { 
            type: "number", 
            description: "Confidence score from 0.0 to 1.0 indicating how well the query matches the intent" 
          },
          reasoning: { 
            type: "string", 
            description: "Brief explanation of why this intent was selected and how it matches the query" 
          },
          extracted_entities: { 
            type: "object", 
            description: "Entities extracted from the user's query (e.g., vendor_name, date_range, amount)",
            additionalProperties: true
          }
        },
        required: ["intent_name", "confidence", "reasoning"]
      }
    };

    // Convert MCP tools to Anthropic tool format
    const mcpAnthropicTools: AnthropicTool[] = (mcpTools || []).map((tool: any) => ({
      name: tool.name || tool.id,
      description: tool.description || `MCP tool: ${tool.name || tool.id}`,
      input_schema: tool.inputSchema || {
        type: "object",
        properties: {},
        required: []
      }
    }));

    // Combine match_intent tool with MCP tools
    const allTools: AnthropicTool[] = [matchIntentTool, ...mcpAnthropicTools];

    console.log(`[${reqId}] Total tools: ${allTools.length} (1 match_intent + ${mcpAnthropicTools.length} MCP)`);

    // Build optimized system prompt for intent matching
    const systemPrompt = `You are an intelligent CFO Query Resolution Engine. Your job is to:
1. FIRST, match the user's query to the most appropriate intent using the match_intent tool
2. THEN, use MCP tools to fetch real data from the connected accounting system
3. Present the data clearly for CFO/finance users

## AVAILABLE INTENTS (you MUST match to one of these):
${intentList.map((i: { index: number; name: string; description: string; trainingPhrases: string[]; entities: { name: string; type: string }[]; moduleId: string }) => `
${i.index}. "${i.name}"
   - Description: ${i.description || 'No description'}
   - Example phrases: ${i.trainingPhrases.join('; ') || 'None'}
   - Module: ${i.moduleId}
   - Entities: ${i.entities.map((e: any) => e.name).join(', ') || 'None'}`).join('\n')}

## INTENT MATCHING RULES:
- Match based on SEMANTIC MEANING, not just keywords
- "give me top 10 vendors" should match to an intent about getting top vendors, NOT unpaid invoices
- "show unpaid bills for ABC Corp" should match to unpaid invoices/bills intent
- Always pick the intent whose training phrases are MOST SIMILAR to the user's query
- If no intent matches well (confidence < 0.3), still call match_intent but with low confidence

## BUSINESS CONTEXT:
- Country: ${businessContext?.country || 'IN'}
- Industry: ${businessContext?.industry || 'Technology'}
- Entity Size: ${businessContext?.entitySize || 'medium'}
- Currency: ${businessContext?.currency || 'INR'}
- Fiscal Year End: ${businessContext?.fiscalYearEnd || 'March'}

## MCP TOOLS FOR DATA:
${mcpAnthropicTools.map(t => `- ${t.name}: ${t.description}`).join('\n') || 'No MCP tools available'}

## WORKFLOW:
1. ALWAYS call match_intent FIRST to declare which intent you're matching
2. Then call appropriate MCP tools to fetch real data
3. Format the data response clearly

CRITICAL: You MUST call match_intent as your first tool call. Never skip this step.`;

    // Establish MCP connection for tool calls
    let mcpConnection: MCPConnection | null = null;
    if (mcpAnthropicTools.length > 0) {
      mcpConnection = await establishMCPConnection(reqId, debugLogs);
      if (!mcpConnection) {
        console.warn(`[${reqId}] Failed to establish MCP connection`);
      }
    }

    // Initial messages
    const messages: AnthropicMessage[] = [
      { role: "user", content: query }
    ];

    // Call LLM
    console.log(`[${reqId}] Making initial LLM call...`);
    let llmResponse = await callAnthropicAPI(
      llmConfig,
      messages,
      allTools,
      systemPrompt,
      reqId,
      debugLogs
    );

    console.log(`[${reqId}] LLM response stop_reason: ${llmResponse.stop_reason}`);

    // Track all results
    let matchedIntent: any = null;
    let extractedEntities: Record<string, unknown> = {};
    let reasoning = "";
    let mcpToolResults: any[] = [];
    let finalResponse = "";
    let totalInputTokens = llmResponse.usage?.input_tokens || 0;
    let totalOutputTokens = llmResponse.usage?.output_tokens || 0;
    let iterationCount = 0;
    const maxIterations = 5;

    // Process tool calls iteratively
    while (llmResponse.stop_reason === "tool_use" && iterationCount < maxIterations) {
      iterationCount++;
      console.log(`[${reqId}] Processing tool use response (iteration ${iterationCount})`);

      const assistantContent = llmResponse.content;
      const toolUseBlocks = assistantContent.filter((block: any) => block.type === "tool_use");
      
      if (toolUseBlocks.length === 0) break;

      // Add assistant message to conversation
      messages.push({
        role: "assistant",
        content: assistantContent
      });

      // Process each tool call
      const toolResults: any[] = [];
      
      for (const toolBlock of toolUseBlocks) {
        const { id: toolUseId, name: toolName, input: toolInput } = toolBlock;
        
        console.log(`[${reqId}] Tool call: ${toolName}`, JSON.stringify(toolInput).substring(0, 500));

        let toolResult: any;
        let isError = false;

        // Handle match_intent tool specially
        if (toolName === "match_intent") {
          console.log(`[${reqId}] Processing match_intent result`);
          
          const intentName = toolInput.intent_name;
          const confidence = toolInput.confidence || 0.5;
          reasoning = toolInput.reasoning || "";
          extractedEntities = toolInput.extracted_entities || {};
          
          // Find the actual intent from our list
          const fullIntent = activeIntents.find((i: any) => 
            i.name.toLowerCase() === intentName.toLowerCase() ||
            i.name.toLowerCase().includes(intentName.toLowerCase()) ||
            intentName.toLowerCase().includes(i.name.toLowerCase())
          );
          
          if (fullIntent) {
            matchedIntent = {
              id: fullIntent.id,
              name: fullIntent.name,
              moduleId: fullIntent.moduleId,
              confidence: confidence
            };
            
            debugLogs.push({
              timestamp: new Date().toISOString(),
              type: 'intent_match',
              data: { 
                queriedName: intentName, 
                matchedName: fullIntent.name, 
                confidence,
                reasoning,
                entities: extractedEntities
              }
            });
            
            toolResult = {
              success: true,
              matched_intent: fullIntent.name,
              confidence,
              message: `Successfully matched to intent: ${fullIntent.name}`
            };
          } else {
            toolResult = {
              success: false,
              error: `Intent "${intentName}" not found in available intents. Available: ${activeIntents.map((i: any) => i.name).join(', ')}`
            };
            isError = true;
          }
          
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUseId,
            content: JSON.stringify(toolResult),
            is_error: isError
          });
          continue;
        }

        // Handle MCP tool calls
        if (mcpConnection) {
          try {
            toolResult = await callMCPTool(mcpConnection, toolName, toolInput, reqId, debugLogs);
            
            mcpToolResults.push({
              tool: toolName,
              input: toolInput,
              result: toolResult,
              success: true
            });
          } catch (error) {
            console.error(`[${reqId}] MCP tool error:`, error);
            toolResult = { error: error instanceof Error ? error.message : "Unknown error" };
            isError = true;
            
            mcpToolResults.push({
              tool: toolName,
              input: toolInput,
              error: toolResult.error,
              success: false
            });
          }
        } else {
          toolResult = { error: "MCP connection not available" };
          isError = true;
          
          mcpToolResults.push({
            tool: toolName,
            input: toolInput,
            error: "MCP connection not available",
            success: false
          });
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUseId,
          content: JSON.stringify(toolResult),
          is_error: isError
        });
      }

      // Add tool results to conversation
      messages.push({
        role: "user",
        content: toolResults
      });

      // Make another LLM call
      console.log(`[${reqId}] Making follow-up LLM call with tool results...`);
      llmResponse = await callAnthropicAPI(
        llmConfig,
        messages,
        allTools,
        systemPrompt,
        reqId,
        debugLogs
      );

      totalInputTokens += llmResponse.usage?.input_tokens || 0;
      totalOutputTokens += llmResponse.usage?.output_tokens || 0;
      
      console.log(`[${reqId}] Follow-up response stop_reason: ${llmResponse.stop_reason}`);
    }

    // Extract final text response
    const textBlocks = llmResponse.content?.filter((block: any) => block.type === "text") || [];
    finalResponse = textBlocks.map((block: any) => block.text).join("\n");

    // Clean up MCP connection
    if (mcpConnection?.sseReader) {
      try {
        mcpConnection.sseReader.cancel();
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    // Build the result
    const result: any = {
      query,
      timestamp: new Date().toISOString(),
      matchedIntent,
      extractedEntities,
      reasoning,
      response: finalResponse,
      mcpToolResults: mcpToolResults.length > 0 ? mcpToolResults : undefined,
      dataSources: mcpToolResults.map(r => r.tool),
      llmModel: `${llmConfig.provider}/${llmConfig.model}`,
      iterationCount,
      usage: {
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        total_tokens: totalInputTokens + totalOutputTokens
      }
    };

    // Add debug logs if requested
    if (debug) {
      result.debugLogs = debugLogs;
    }

    console.log(`[${reqId}] Test completed successfully`);
    console.log(`[${reqId}] Matched intent: ${matchedIntent?.name || 'None'}`);
    console.log(`[${reqId}] Total tokens used: ${result.usage.total_tokens}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(`[${reqId}] Error:`, error);
    debugLogs.push({
      timestamp: new Date().toISOString(),
      type: 'error',
      data: { message: error instanceof Error ? error.message : "Unknown error" }
    });
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
        debugLogs
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
