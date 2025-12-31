import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
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

    console.log("Connecting to MCP SSE endpoint...");

    const mcpSseUrl = "https://mcp.hellobooks.ai/sse";
    const headers = {
      "Authorization": `Bearer ${authToken}`,
      "X-Entity-Id": entityId,
      "X-Org-Id": orgId,
      "Accept": "text/event-stream",
      "Cache-Control": "no-cache",
    };

    // Step 1: Connect to SSE endpoint to get the message endpoint
    const sseResponse = await fetch(mcpSseUrl, {
      method: "GET",
      headers,
    });

    console.log("SSE response status:", sseResponse.status);

    if (!sseResponse.ok) {
      const errorText = await sseResponse.text();
      console.error("SSE connection failed:", sseResponse.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: "Failed to connect to MCP SSE endpoint", 
          status: sseResponse.status,
          details: errorText 
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read SSE stream to find the endpoint event
    const reader = sseResponse.body?.getReader();
    if (!reader) {
      return new Response(
        JSON.stringify({ error: "Failed to get SSE stream reader" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const decoder = new TextDecoder();
    let messageEndpoint = "";
    let buffer = "";
    let attempts = 0;
    const maxAttempts = 10;

    // Read SSE events to find the endpoint
    while (attempts < maxAttempts) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      console.log("SSE buffer:", buffer);
      
      // Parse SSE events from buffer
      const lines = buffer.split('\n');
      let currentEventType = "";
      
      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEventType = line.substring(6).trim();
          console.log("Event type:", currentEventType);
        } else if (line.startsWith('data:')) {
          const data = line.substring(5).trim();
          console.log("Event data:", data);
          
          // The endpoint event contains the URL for sending messages
          if (currentEventType === 'endpoint' || data.includes('/message')) {
            messageEndpoint = data.startsWith('http') 
              ? data 
              : `https://mcp.hellobooks.ai${data}`;
            console.log("Found message endpoint:", messageEndpoint);
            break;
          }
        }
      }
      
      if (messageEndpoint) break;
      attempts++;
    }

    // Cancel the reader since we have what we need
    reader.cancel();

    if (!messageEndpoint) {
      console.log("No message endpoint found, trying default endpoint...");
      messageEndpoint = "https://mcp.hellobooks.ai/message";
    }

    console.log("Sending tools/list request to:", messageEndpoint);

    // Step 2: Send JSON-RPC request to list tools
    const toolsResponse = await fetch(messageEndpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "X-Entity-Id": entityId,
        "X-Org-Id": orgId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {}
      }),
    });

    console.log("Tools response status:", toolsResponse.status);

    if (!toolsResponse.ok) {
      const errorText = await toolsResponse.text();
      console.error("Tools request failed:", toolsResponse.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: "Failed to fetch tools from MCP server", 
          status: toolsResponse.status,
          details: errorText,
          endpoint: messageEndpoint
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await toolsResponse.json();
    console.log("Tools response:", JSON.stringify(data));
    
    // Handle JSON-RPC response format
    const tools = data.result?.tools || data.tools || [];
    
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
