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

    // Step 1: Connect to SSE endpoint to get the message endpoint
    const sseResponse = await fetch("https://mcp.hellobooks.ai/sse", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "X-Entity-Id": entityId,
        "X-Org-Id": orgId,
        "Accept": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });

    console.log("SSE response status:", sseResponse.status);

    if (!sseResponse.ok) {
      const errorText = await sseResponse.text();
      console.error("SSE connection failed:", sseResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to connect to MCP SSE endpoint", status: sseResponse.status, details: errorText }),
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

    // Read SSE events to find the endpoint
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // Parse SSE events - look for endpoint event
      const endpointMatch = buffer.match(/event:\s*endpoint\s*\ndata:\s*([^\n]+)/);
      if (endpointMatch) {
        const data = endpointMatch[1].trim();
        messageEndpoint = data.startsWith('http') ? data : `https://mcp.hellobooks.ai${data}`;
        console.log("Found message endpoint:", messageEndpoint);
        break;
      }

      // Also check for /messages pattern
      const messagesMatch = buffer.match(/data:\s*(\/messages[^\n]*)/);
      if (messagesMatch) {
        messageEndpoint = `https://mcp.hellobooks.ai${messagesMatch[1].trim()}`;
        console.log("Found message endpoint:", messageEndpoint);
        break;
      }
    }

    reader.cancel();

    if (!messageEndpoint) {
      return new Response(
        JSON.stringify({ error: "Could not find message endpoint from SSE" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Send initialize request first (required by MCP protocol)
    console.log("Sending initialize request to:", messageEndpoint);
    
    const initResponse = await fetch(messageEndpoint, {
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
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "lovable-client", version: "1.0.0" }
        }
      }),
    });

    console.log("Initialize response status:", initResponse.status);
    
    // The server returns 202 Accepted for async processing - we need to wait for the SSE response
    // For now, proceed to tools/list - the server should handle the session
    
    // Step 3: Send tools/list request
    console.log("Sending tools/list request to:", messageEndpoint);
    
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
        id: 2,
        method: "tools/list",
        params: {}
      }),
    });

    console.log("Tools request HTTP status:", toolsResponse.status);

    // Server returns 202 Accepted - response comes via SSE
    // We need to reconnect to SSE and listen for the response
    if (toolsResponse.status === 202) {
      console.log("Server returned 202 - listening for response via SSE...");
      
      // Reconnect to SSE to get the response
      const sseResponse2 = await fetch("https://mcp.hellobooks.ai/sse", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${authToken}`,
          "X-Entity-Id": entityId,
          "X-Org-Id": orgId,
          "Accept": "text/event-stream",
        },
      });

      if (!sseResponse2.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to reconnect to SSE for response" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const reader2 = sseResponse2.body?.getReader();
      if (!reader2) {
        return new Response(
          JSON.stringify({ error: "Failed to get SSE reader for response" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let responseBuffer = "";
      let tools: unknown[] = [];
      const timeout = Date.now() + 10000; // 10 second timeout

      while (Date.now() < timeout) {
        const { done, value } = await reader2.read();
        if (done) break;
        
        responseBuffer += decoder.decode(value, { stream: true });
        console.log("SSE response buffer:", responseBuffer);

        // Look for message event with JSON-RPC response containing tools
        const messageMatch = responseBuffer.match(/event:\s*message\s*\ndata:\s*(\{[^}]*"tools"[^}]*\}|\{.*\})/s);
        if (messageMatch) {
          try {
            const jsonData = JSON.parse(messageMatch[1]);
            tools = jsonData.result?.tools || jsonData.tools || [];
            console.log("Received tools via SSE, count:", tools.length);
            break;
          } catch (e) {
            console.log("Failed to parse SSE message as JSON:", e);
          }
        }
      }

      reader2.cancel();

      return new Response(
        JSON.stringify({ tools, source: "mcp_sse" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If we got a direct response
    const responseText = await toolsResponse.text();
    console.log("Direct response:", responseText);
    
    try {
      const data = JSON.parse(responseText);
      const tools = data.result?.tools || data.tools || [];
      return new Response(
        JSON.stringify({ tools, source: "mcp_direct" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON response", details: responseText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error: unknown) {
    console.error("Error fetching MCP tools:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    return new Response(
      JSON.stringify({ error: errorMessage, stack: errorStack }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
