import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

  const sseResponse = await fetch("https://mcp.hellobooks.ai/sse", {
    method: "GET",
    headers: {
      ...mcpHeaders,
      "Accept": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });

  if (!sseResponse.ok) {
    console.error(`[${reqId}] SSE connection failed`);
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
          return { messageEndpoint, mcpHeaders };
        }
      }
    }
  }

  reader.cancel();
  return null;
}

// Call MCP tool
async function callMCPTool(
  connection: MCPConnection,
  toolName: string,
  toolArgs: Record<string, unknown>,
  reqId: string
): Promise<unknown> {
  console.log(`[${reqId}] Calling MCP tool: ${toolName}`, toolArgs);

  const response = await fetch(connection.messageEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...connection.mcpHeaders },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
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

  // We need to wait for the SSE response
  // For now, return the HTTP response
  const result = await response.json();
  console.log(`[${reqId}] MCP tool response:`, JSON.stringify(result).substring(0, 500));
  return result;
}

// Fetch available MCP tools
async function fetchMCPTools(connection: MCPConnection, reqId: string): Promise<unknown[]> {
  const response = await fetch(connection.messageEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...connection.mcpHeaders },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 99,
      method: "tools/list",
      params: {}
    }),
  });

  if (!response.ok) {
    console.error(`[${reqId}] Failed to fetch MCP tools`);
    return [];
  }

  // SSE will return the tools - for now we'll list them from cached data
  return [];
}

serve(async (req) => {
  const reqId = crypto.randomUUID().slice(0, 8);
  console.log(`[${reqId}] Test with MCP request received`);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, intents, businessContext, mcpTools } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[${reqId}] Processing query: ${query}`);
    console.log(`[${reqId}] Available intents: ${intents?.length || 0}`);
    console.log(`[${reqId}] MCP tools provided: ${mcpTools?.length || 0}`);

    // Build the system prompt with intent context
    const intentDescriptions = (intents || [])
      .filter((i: any) => i.isActive)
      .map((i: any) => ({
        name: i.name,
        description: i.description || '',
        trainingPhrases: i.trainingPhrases?.slice(0, 5) || [],
        entities: i.entities?.map((e: any) => ({ name: e.name, type: e.type })) || [],
        moduleId: i.moduleId
      }));

    // Build MCP tools for function calling
    const mcpToolDefinitions = (mcpTools || []).map((tool: any) => ({
      type: "function",
      function: {
        name: tool.name || tool.id,
        description: tool.description || `MCP tool: ${tool.name || tool.id}`,
        parameters: tool.inputSchema || {
          type: "object",
          properties: {},
          required: []
        }
      }
    }));

    // Add intent matching tool
    const tools = [
      {
        type: "function",
        function: {
          name: "match_intent",
          description: "Match user query to the most appropriate intent based on training phrases and context",
          parameters: {
            type: "object",
            properties: {
              matched_intent_name: {
                type: "string",
                description: "Name of the matched intent"
              },
              confidence: {
                type: "number",
                description: "Confidence score between 0 and 1"
              },
              extracted_entities: {
                type: "object",
                description: "Extracted entity values from the query"
              },
              reasoning: {
                type: "string",
                description: "Brief explanation of why this intent was matched"
              }
            },
            required: ["matched_intent_name", "confidence", "reasoning"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "generate_response",
          description: "Generate a helpful response for the CFO query",
          parameters: {
            type: "object",
            properties: {
              response: {
                type: "string",
                description: "The generated response text"
              },
              data_sources: {
                type: "array",
                items: { type: "string" },
                description: "List of data sources that would be queried"
              },
              follow_up_questions: {
                type: "array",
                items: { type: "string" },
                description: "Suggested follow-up questions"
              }
            },
            required: ["response"]
          }
        }
      },
      ...mcpToolDefinitions
    ];

    const systemPrompt = `You are an intelligent CFO Query Resolution Engine. Your job is to:
1. Analyze user queries related to finance, accounting, and business metrics
2. Match queries to the most appropriate intent from the available intents
3. Extract relevant entities (amounts, periods, dates, etc.)
4. When MCP tools are available, use them to fetch real data
5. Generate accurate, helpful responses

Available Intents:
${JSON.stringify(intentDescriptions, null, 2)}

Business Context:
- Country: ${businessContext?.country || 'IN'}
- Industry: ${businessContext?.industry || 'Technology'}
- Entity Size: ${businessContext?.entitySize || 'medium'}
- Currency: ${businessContext?.currency || 'INR'}
- Fiscal Year End: ${businessContext?.fiscalYearEnd || 'March'}

Instructions:
1. First, use the match_intent tool to identify which intent best matches the query
2. If MCP tools are available and relevant, use them to fetch real data
3. Finally, use generate_response to provide a helpful answer

Always think step by step and provide accurate financial insights.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // First LLM call - Intent matching
    console.log(`[${reqId}] Calling Lovable AI for intent matching...`);
    
    const llmResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query }
        ],
        tools: tools,
        tool_choice: "auto"
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error(`[${reqId}] Lovable AI error:`, errorText);
      
      if (llmResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (llmResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`LLM request failed: ${errorText}`);
    }

    const llmResult = await llmResponse.json();
    console.log(`[${reqId}] LLM response received`);

    const message = llmResult.choices?.[0]?.message;
    const toolCalls = message?.tool_calls || [];
    
    let matchedIntent = null;
    let extractedEntities = {};
    let reasoning = "";
    let generatedResponse = "";
    let dataSources: string[] = [];
    let followUpQuestions: string[] = [];
    let mcpToolResults: any[] = [];

    // Process tool calls
    for (const toolCall of toolCalls) {
      const functionName = toolCall.function?.name;
      let args: any = {};
      
      try {
        args = JSON.parse(toolCall.function?.arguments || "{}");
      } catch (e) {
        console.error(`[${reqId}] Failed to parse tool arguments:`, e);
      }

      console.log(`[${reqId}] Tool call: ${functionName}`, args);

      if (functionName === "match_intent") {
        matchedIntent = {
          name: args.matched_intent_name,
          confidence: args.confidence || 0.85
        };
        extractedEntities = args.extracted_entities || {};
        reasoning = args.reasoning || "";
        
        // Find full intent data
        const fullIntent = (intents || []).find((i: any) => 
          i.name.toLowerCase() === matchedIntent!.name.toLowerCase()
        );
        if (fullIntent) {
          matchedIntent = {
            ...matchedIntent,
            id: fullIntent.id,
            moduleId: fullIntent.moduleId,
            entities: fullIntent.entities,
            resolutionFlow: fullIntent.resolutionFlow
          };
        }
      } else if (functionName === "generate_response") {
        generatedResponse = args.response || "";
        dataSources = args.data_sources || [];
        followUpQuestions = args.follow_up_questions || [];
      } else if (mcpTools?.some((t: any) => (t.name || t.id) === functionName)) {
        // This is an MCP tool call - try to execute it
        console.log(`[${reqId}] Attempting to execute MCP tool: ${functionName}`);
        
        try {
          const mcpConnection = await establishMCPConnection(reqId);
          if (mcpConnection) {
            const mcpResult = await callMCPTool(mcpConnection, functionName, args, reqId);
            mcpToolResults.push({
              tool: functionName,
              args,
              result: mcpResult
            });
          } else {
            mcpToolResults.push({
              tool: functionName,
              args,
              error: "Failed to establish MCP connection"
            });
          }
        } catch (mcpError) {
          console.error(`[${reqId}] MCP tool error:`, mcpError);
          mcpToolResults.push({
            tool: functionName,
            args,
            error: mcpError instanceof Error ? mcpError.message : "Unknown error"
          });
        }
      }
    }

    // If no response was generated, create a default one
    if (!generatedResponse && matchedIntent) {
      generatedResponse = `Based on your query about "${matchedIntent.name}", I've identified the relevant intent and extracted the following information. The system would normally fetch real data from connected sources to provide a complete answer.`;
    }

    // Build final result
    const result = {
      query,
      timestamp: new Date().toISOString(),
      matchedIntent,
      extractedEntities,
      reasoning,
      response: generatedResponse,
      dataSources,
      followUpQuestions,
      mcpToolResults: mcpToolResults.length > 0 ? mcpToolResults : undefined,
      llmModel: "google/gemini-2.5-flash",
      toolCallsCount: toolCalls.length,
      usage: llmResult.usage
    };

    console.log(`[${reqId}] Test completed successfully`);

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
