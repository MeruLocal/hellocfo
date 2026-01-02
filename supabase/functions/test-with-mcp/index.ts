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
async function establishMCPConnection(reqId: string): Promise<MCPConnection | null> {
  const authToken = Deno.env.get("MCP_HELLOBOOKS_AUTH_TOKEN");
  const entityId = Deno.env.get("MCP_HELLOBOOKS_ENTITY_ID");
  const orgId = Deno.env.get("MCP_HELLOBOOKS_ORG_ID");

  if (!authToken || !entityId || !orgId) {
    console.error(`[${reqId}] Missing MCP credentials`);
    return null;
  }

  const mcpHeaders = {
    "Authorization": `Bearer ${authToken}`,
    "X-Entity-Id": entityId,
    "X-Org-Id": orgId,
  };

  console.log(`[${reqId}] Establishing MCP connection...`);

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
          return { messageEndpoint, mcpHeaders };
        }
      }
    }
  }

  reader.cancel();
  return null;
}

// Call MCP tool and wait for result via SSE
async function callMCPTool(
  connection: MCPConnection,
  toolName: string,
  toolArgs: Record<string, unknown>,
  reqId: string
): Promise<unknown> {
  console.log(`[${reqId}] Calling MCP tool: ${toolName}`, JSON.stringify(toolArgs));

  const callId = Date.now();
  
  // Send the tool call request
  const response = await fetch(connection.messageEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...connection.mcpHeaders },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: callId,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: toolArgs
      }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[${reqId}] MCP tool call failed:`, errorText);
    throw new Error(`MCP tool call failed: ${errorText}`);
  }

  const result = await response.json();
  console.log(`[${reqId}] MCP tool response:`, JSON.stringify(result).substring(0, 1000));
  
  // Extract the actual content from the MCP response
  if (result.result?.content) {
    // MCP returns content as an array of content blocks
    const textContent = result.result.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n');
    
    // Try to parse as JSON if it looks like JSON
    try {
      return JSON.parse(textContent);
    } catch {
      return textContent;
    }
  }
  
  return result.result || result;
}

// Call Anthropic API (Azure or Direct)
async function callAnthropicAPI(
  config: LLMConfig,
  messages: AnthropicMessage[],
  tools: AnthropicTool[],
  systemPrompt: string,
  reqId: string
): Promise<any> {
  let endpoint: string;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.provider === "azure-anthropic") {
    // Azure Anthropic endpoint
    endpoint = config.endpoint 
      ? `${config.endpoint}/v1/messages` 
      : "https://cursor-api-west-us-resource.openai.azure.com/anthropic/v1/messages";
    headers["x-api-key"] = config.api_key || "";
    headers["anthropic-version"] = "2023-06-01";
  } else if (config.provider === "anthropic") {
    // Direct Anthropic API
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

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[${reqId}] LLM API error ${response.status}:`, errorText);
    throw new Error(`LLM API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

serve(async (req) => {
  const reqId = crypto.randomUUID().slice(0, 8);
  console.log(`[${reqId}] Test with MCP request received`);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, intents, businessContext, mcpTools, llmConfig: providedConfig } = await req.json();

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

    // Build intent descriptions for the prompt
    const intentDescriptions = (intents || [])
      .filter((i: any) => i.isActive)
      .map((i: any) => ({
        name: i.name,
        description: i.description || '',
        trainingPhrases: i.trainingPhrases?.slice(0, 5) || [],
        entities: i.entities?.map((e: any) => ({ name: e.name, type: e.type })) || [],
        moduleId: i.moduleId,
        resolutionFlow: i.resolutionFlow
      }));

    // Convert MCP tools to Anthropic tool format
    const anthropicTools: AnthropicTool[] = (mcpTools || []).map((tool: any) => ({
      name: tool.name || tool.id,
      description: tool.description || `MCP tool: ${tool.name || tool.id}`,
      input_schema: tool.inputSchema || {
        type: "object",
        properties: {},
        required: []
      }
    }));

    console.log(`[${reqId}] Converted ${anthropicTools.length} MCP tools to Anthropic format`);

    // Build system prompt
    const systemPrompt = `You are an intelligent CFO Query Resolution Engine for a financial assistant. Your job is to:
1. Analyze user queries related to finance, accounting, and business metrics
2. Match queries to the most appropriate intent from the available intents
3. Extract relevant entities (amounts, periods, dates, vendor names, account numbers, etc.)
4. Use MCP tools to fetch REAL data from the connected accounting/ERP system
5. Format and present the data in a clear, actionable way for CFO/finance users

Available Intents:
${JSON.stringify(intentDescriptions, null, 2)}

Business Context:
- Country: ${businessContext?.country || 'IN'}
- Industry: ${businessContext?.industry || 'Technology'}
- Entity Size: ${businessContext?.entitySize || 'medium'}
- Currency: ${businessContext?.currency || 'INR'}
- Fiscal Year End: ${businessContext?.fiscalYearEnd || 'March'}

Available MCP Tools:
${anthropicTools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

IMPORTANT INSTRUCTIONS:
1. When the user asks for data (vendors, invoices, payments, etc.), you MUST use the appropriate MCP tool to fetch real data
2. Identify which MCP tool is most appropriate for the query:
   - For vendor-related queries, look for vendor/supplier related tools
   - For payment queries, look for payment/transaction tools
   - For invoice queries, look for invoice/bill tools
   - For account balance queries, look for balance/account tools
3. Pass appropriate filters based on the user's query (e.g., limit, date range, status)
4. Present the real data returned from the MCP tools in a clear, formatted way
5. If no relevant MCP tool is available, explain what data sources would be needed

Always provide accurate, real data from the MCP tools - never make up fake data.`;

    // Establish MCP connection for tool calls
    let mcpConnection: MCPConnection | null = null;
    if (anthropicTools.length > 0) {
      mcpConnection = await establishMCPConnection(reqId);
      if (!mcpConnection) {
        console.warn(`[${reqId}] Failed to establish MCP connection, will proceed without tool execution`);
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
      anthropicTools,
      systemPrompt,
      reqId
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

        if (mcpConnection) {
          try {
            toolResult = await callMCPTool(mcpConnection, toolName, toolInput, reqId);
            
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
        anthropicTools,
        systemPrompt,
        reqId
      );

      totalInputTokens += llmResponse.usage?.input_tokens || 0;
      totalOutputTokens += llmResponse.usage?.output_tokens || 0;
      
      console.log(`[${reqId}] Follow-up response stop_reason: ${llmResponse.stop_reason}`);
    }

    // Extract final text response
    const textBlocks = llmResponse.content?.filter((block: any) => block.type === "text") || [];
    finalResponse = textBlocks.map((block: any) => block.text).join("\n");

    // Try to extract intent matching info from the response
    const intentMatch = finalResponse.match(/intent[:\s]*["']?([^"'\n,]+)["']?/i);
    if (intentMatch) {
      const matchedIntentName = intentMatch[1].trim();
      const fullIntent = (intents || []).find((i: any) => 
        i.name.toLowerCase().includes(matchedIntentName.toLowerCase()) ||
        matchedIntentName.toLowerCase().includes(i.name.toLowerCase())
      );
      
      if (fullIntent) {
        matchedIntent = {
          id: fullIntent.id,
          name: fullIntent.name,
          moduleId: fullIntent.moduleId,
          confidence: 0.9
        };
      }
    }

    // If we got MCP results, try to match intent based on the tool used
    if (!matchedIntent && mcpToolResults.length > 0) {
      const toolName = mcpToolResults[0].tool.toLowerCase();
      const matchingIntent = (intents || []).find((i: any) => {
        const intentName = i.name.toLowerCase();
        return intentName.includes(toolName) || 
               toolName.includes(intentName.split(' ')[0]) ||
               (i.resolutionFlow?.pipeline?.some((p: any) => 
                 p.toolId?.toLowerCase().includes(toolName)
               ));
      });
      
      if (matchingIntent) {
        matchedIntent = {
          id: matchingIntent.id,
          name: matchingIntent.name,
          moduleId: matchingIntent.moduleId,
          confidence: 0.85
        };
      }
    }

    // Build the result
    const result = {
      query,
      timestamp: new Date().toISOString(),
      matchedIntent,
      extractedEntities,
      reasoning: reasoning || "Processed query using LLM and MCP tools",
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

    console.log(`[${reqId}] Test completed successfully`);
    console.log(`[${reqId}] Total tokens used: ${result.usage.total_tokens}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(`[${reqId}] Error:`, error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
