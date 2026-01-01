import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Parse SSE events properly - handles \r\n and \n\n delimiters
function parseSSEBuffer(buffer: string): { events: Array<{type: string, data: string}>, remaining: string } {
  const events: Array<{type: string, data: string}> = [];
  
  // Normalize line endings and split by double newline (event separator)
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  
  // Last part may be incomplete
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

serve(async (req) => {
  const reqId = crypto.randomUUID().slice(0, 8);
  console.log(`[${reqId}] Starting MCP tools fetch`);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authToken = Deno.env.get("MCP_HELLOBOOKS_AUTH_TOKEN");
    const entityId = Deno.env.get("MCP_HELLOBOOKS_ENTITY_ID");
    const orgId = Deno.env.get("MCP_HELLOBOOKS_ORG_ID");

    if (!authToken || !entityId || !orgId) {
      console.error(`[${reqId}] Missing MCP credentials`);
      return new Response(
        JSON.stringify({ error: "MCP credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mcpHeaders = {
      "Authorization": `Bearer ${authToken}`,
      "X-Entity-Id": entityId,
      "X-Org-Id": orgId,
    };

    console.log(`[${reqId}] Connecting to MCP SSE endpoint...`);

    // Connect to SSE endpoint
    const sseResponse = await fetch("https://mcp.hellobooks.ai/sse", {
      method: "GET",
      headers: {
        ...mcpHeaders,
        "Accept": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });

    console.log(`[${reqId}] SSE response status: ${sseResponse.status}`);

    if (!sseResponse.ok) {
      const errorText = await sseResponse.text();
      console.error(`[${reqId}] SSE connection failed: ${errorText}`);
      return new Response(
        JSON.stringify({ error: "Failed to connect to MCP SSE", details: errorText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reader = sseResponse.body?.getReader();
    if (!reader) {
      return new Response(
        JSON.stringify({ error: "Failed to get SSE reader" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let messageEndpoint = "";
    let tools: unknown[] = [];
    
    // State machine
    let state: 'waiting_endpoint' | 'waiting_init_response' | 'waiting_tools_response' = 'waiting_endpoint';
    
    const OVERALL_TIMEOUT = 30000;
    const READ_TIMEOUT = 5000;
    const startTime = Date.now();

    // Helper to send JSON-RPC request
    async function sendRequest(endpoint: string, body: object) {
      console.log(`[${reqId}] Sending to ${endpoint}: ${JSON.stringify(body)}`);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...mcpHeaders,
        },
        body: JSON.stringify(body),
      });
      console.log(`[${reqId}] POST response status: ${response.status}`);
      if (!response.ok && response.status !== 202) {
        const text = await response.text();
        console.error(`[${reqId}] POST failed: ${text}`);
        throw new Error(`POST failed: ${response.status} ${text}`);
      }
    }

    // Main read loop
    while (Date.now() - startTime < OVERALL_TIMEOUT) {
      const result = await readWithTimeout(reader, READ_TIMEOUT);
      
      if (result === null) {
        // Timeout on this read, but overall not expired yet
        console.log(`[${reqId}] Read timeout, state=${state}, continuing...`);
        continue;
      }
      
      if (result.done) {
        console.log(`[${reqId}] SSE stream ended`);
        break;
      }

      buffer += decoder.decode(result.value, { stream: true });
      const { events, remaining } = parseSSEBuffer(buffer);
      buffer = remaining;

      for (const event of events) {
        console.log(`[${reqId}] SSE event: type=${event.type}, data=${event.data.substring(0, 200)}`);

        if (event.type === "endpoint" && state === 'waiting_endpoint') {
          // Server sends the message endpoint URL
          messageEndpoint = event.data;
          if (!messageEndpoint.startsWith("http")) {
            messageEndpoint = `https://mcp.hellobooks.ai${messageEndpoint}`;
          }
          console.log(`[${reqId}] Got message endpoint: ${messageEndpoint}`);

          // Send initialize request
          state = 'waiting_init_response';
          await sendRequest(messageEndpoint, {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "lovable-mcp-client", version: "1.0.0" }
            }
          });
          console.log(`[${reqId}] Initialize request sent`);
        }

        if (event.type === "message") {
          try {
            const data = JSON.parse(event.data);
            console.log(`[${reqId}] Parsed message: id=${data.id}, hasResult=${!!data.result}, hasError=${!!data.error}`);

            // Handle errors
            if (data.error) {
              console.error(`[${reqId}] MCP error: ${JSON.stringify(data.error)}`);
              reader.cancel();
              return new Response(
                JSON.stringify({ error: data.error.message || "MCP error", details: data.error }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }

            // Check for initialize response (id: 1)
            if (data.id === 1 && data.result && state === 'waiting_init_response') {
              console.log(`[${reqId}] Initialize successful, sending notifications/initialized...`);
              
              // Send notifications/initialized (required by MCP spec)
              await sendRequest(messageEndpoint, {
                jsonrpc: "2.0",
                method: "notifications/initialized",
                params: {}
              });
              console.log(`[${reqId}] notifications/initialized sent`);

              // Now request tools list
              state = 'waiting_tools_response';
              await sendRequest(messageEndpoint, {
                jsonrpc: "2.0",
                id: 2,
                method: "tools/list",
                params: {}
              });
              console.log(`[${reqId}] tools/list request sent`);
            }

            // Check for tools/list response (id: 2)
            if (data.id === 2 && data.result && state === 'waiting_tools_response') {
              tools = data.result.tools || [];
              console.log(`[${reqId}] Got tools: ${tools.length} tools`);
              reader.cancel();
              break;
            }
          } catch (e) {
            console.log(`[${reqId}] Failed to parse message: ${e}`);
          }
        }
      }

      // Exit if we got tools
      if (tools.length > 0) break;
    }

    reader.cancel();

    // Check if we timed out in a specific state
    if (tools.length === 0) {
      let errorMsg = "Unknown error";
      if (state === 'waiting_endpoint') {
        errorMsg = "No endpoint event received from SSE";
      } else if (state === 'waiting_init_response') {
        errorMsg = "Initialize response timeout";
      } else if (state === 'waiting_tools_response') {
        errorMsg = "tools/list response timeout";
      }
      console.error(`[${reqId}] Timeout in state: ${state}`);
      return new Response(
        JSON.stringify({ error: errorMsg, state, tools: [] }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[${reqId}] Success! Returning ${tools.length} tools`);

    return new Response(
      JSON.stringify({ tools, source: "mcp_sse" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error(`[${reqId}] Error fetching MCP tools:`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
