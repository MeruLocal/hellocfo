import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Parse SSE events from a buffer
function parseSSEEvents(buffer: string): { events: Array<{type: string, data: string}>, remaining: string } {
  const events: Array<{type: string, data: string}> = [];
  const lines = buffer.split('\n');
  let currentEvent = { type: 'message', data: '' };
  let remaining = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('event:')) {
      currentEvent.type = line.substring(6).trim();
    } else if (line.startsWith('data:')) {
      currentEvent.data = line.substring(5).trim();
    } else if (line === '' && currentEvent.data) {
      events.push({ ...currentEvent });
      currentEvent = { type: 'message', data: '' };
    } else if (i === lines.length - 1 && line !== '') {
      // Incomplete line, keep as remaining
      remaining = line;
    }
  }
  
  return { events, remaining };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authToken = Deno.env.get("MCP_HELLOBOOKS_AUTH_TOKEN");
    const entityId = Deno.env.get("MCP_HELLOBOOKS_ENTITY_ID");
    const orgId = Deno.env.get("MCP_HELLOBOOKS_ORG_ID");

    if (!authToken || !entityId || !orgId) {
      console.error("Missing MCP credentials");
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

    console.log("Connecting to MCP SSE endpoint...");

    // Connect to SSE endpoint
    const sseResponse = await fetch("https://mcp.hellobooks.ai/sse", {
      method: "GET",
      headers: {
        ...mcpHeaders,
        "Accept": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });

    console.log("SSE response status:", sseResponse.status);

    if (!sseResponse.ok) {
      const errorText = await sseResponse.text();
      console.error("SSE connection failed:", errorText);
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
    let initializeSent = false;
    let toolsListSent = false;
    const startTime = Date.now();
    const timeout = 30000; // 30 second timeout

    // Helper to send JSON-RPC request
    async function sendRequest(endpoint: string, body: object) {
      console.log("Sending request to:", endpoint, JSON.stringify(body));
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...mcpHeaders,
        },
        body: JSON.stringify(body),
      });
      console.log("Request response status:", response.status);
      if (!response.ok) {
        const text = await response.text();
        console.error("Request failed:", text);
      }
    }

    // Read SSE stream and handle events
    while (Date.now() - startTime < timeout) {
      const { done, value } = await reader.read();
      if (done) {
        console.log("SSE stream ended");
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const { events, remaining } = parseSSEEvents(buffer);
      buffer = remaining;

      for (const event of events) {
        console.log("SSE event:", event.type, event.data);

        if (event.type === "endpoint") {
          // Server sends the message endpoint URL
          messageEndpoint = event.data;
          if (!messageEndpoint.startsWith("http")) {
            messageEndpoint = `https://mcp.hellobooks.ai${messageEndpoint}`;
          }
          console.log("Message endpoint:", messageEndpoint);

          // Send initialize request
          if (!initializeSent) {
            initializeSent = true;
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
          }
        }

        if (event.type === "message") {
          try {
            const data = JSON.parse(event.data);
            console.log("Received message:", JSON.stringify(data));

            // Check for initialize response (id: 1)
            if (data.id === 1 && data.result && !toolsListSent) {
              console.log("Initialize successful, requesting tools list...");
              toolsListSent = true;
              await sendRequest(messageEndpoint, {
                jsonrpc: "2.0",
                id: 2,
                method: "tools/list",
                params: {}
              });
            }

            // Check for tools/list response (id: 2)
            if (data.id === 2 && data.result) {
              tools = data.result.tools || [];
              console.log("Received tools:", tools.length);
              reader.cancel();
              break;
            }

            // Handle errors
            if (data.error) {
              console.error("MCP error:", data.error);
              reader.cancel();
              return new Response(
                JSON.stringify({ error: data.error.message || "MCP error" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          } catch (e) {
            console.log("Failed to parse message:", e);
          }
        }
      }

      // Exit if we got tools
      if (tools.length > 0) break;
    }

    reader.cancel();

    console.log("Final tools count:", tools.length);

    return new Response(
      JSON.stringify({ tools, source: "mcp_sse" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error fetching MCP tools:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
