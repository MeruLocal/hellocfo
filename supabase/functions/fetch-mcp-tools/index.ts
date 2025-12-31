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

    // MCP uses SSE for communication. We need to:
    // 1. Connect to the SSE endpoint to get the session
    // 2. Send JSON-RPC messages to list tools
    
    const mcpSseUrl = "https://mcp.hellobooks.ai/sse";
    const headers = {
      "Authorization": `Bearer ${authToken}`,
      "X-Entity-Id": entityId,
      "X-Org-Id": orgId,
      "Accept": "text/event-stream",
      "Cache-Control": "no-cache",
    };

    // First, try to connect to SSE and parse the initial messages
    const sseResponse = await fetch(mcpSseUrl, {
      method: "GET",
      headers,
    });

    if (!sseResponse.ok) {
      console.error("SSE connection failed:", sseResponse.status);
      
      // Fallback: Try a direct message endpoint
      const messageUrl = "https://mcp.hellobooks.ai/message";
      console.log("Trying message endpoint...");
      
      const msgResponse = await fetch(messageUrl, {
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

      if (!msgResponse.ok) {
        const errorText = await msgResponse.text();
        console.error("Message endpoint failed:", msgResponse.status, errorText);
        return new Response(
          JSON.stringify({ 
            error: "Failed to connect to MCP server", 
            status: msgResponse.status,
            details: errorText 
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const msgData = await msgResponse.json();
      console.log("Message response:", JSON.stringify(msgData));
      
      const tools = msgData.result?.tools || msgData.tools || [];
      return new Response(
        JSON.stringify({ tools, source: "mcp_message" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse SSE response to get the message endpoint
    const sseText = await sseResponse.text();
    console.log("SSE response received, length:", sseText.length);
    
    // Parse SSE events - look for endpoint event
    const lines = sseText.split('\n');
    let messageEndpoint = "";
    
    for (const line of lines) {
      if (line.startsWith('event:')) {
        const eventType = line.substring(6).trim();
        console.log("SSE event type:", eventType);
      }
      if (line.startsWith('data:')) {
        const data = line.substring(5).trim();
        console.log("SSE data:", data);
        
        // Check if this is an endpoint URL
        if (data.startsWith('http') || data.startsWith('/')) {
          messageEndpoint = data.startsWith('http') ? data : `https://mcp.hellobooks.ai${data}`;
        }
        
        // Try to parse as JSON to see if it contains tools directly
        try {
          const jsonData = JSON.parse(data);
          if (jsonData.tools || jsonData.result?.tools) {
            const tools = jsonData.result?.tools || jsonData.tools || [];
            return new Response(
              JSON.stringify({ tools, source: "sse_direct" }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          // Check for endpoint in JSON
          if (jsonData.endpoint) {
            messageEndpoint = jsonData.endpoint.startsWith('http') 
              ? jsonData.endpoint 
              : `https://mcp.hellobooks.ai${jsonData.endpoint}`;
          }
        } catch {
          // Not JSON, continue
        }
      }
    }

    // If we got a message endpoint, use it to list tools
    if (messageEndpoint) {
      console.log("Using message endpoint:", messageEndpoint);
      
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

      if (toolsResponse.ok) {
        const data = await toolsResponse.json();
        console.log("Tools response:", JSON.stringify(data));
        const tools = data.result?.tools || data.tools || [];
        return new Response(
          JSON.stringify({ tools, source: "mcp_endpoint" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // If nothing worked, return empty tools with debug info
    console.log("No tools found in SSE stream");
    return new Response(
      JSON.stringify({ 
        tools: [], 
        source: "sse_parsed",
        debug: {
          sseLength: sseText.length,
          messageEndpoint,
          ssePreview: sseText.substring(0, 500)
        }
      }),
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
