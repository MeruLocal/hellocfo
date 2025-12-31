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

    console.log("Connecting to MCP server to fetch tools...");

    // MCP servers use JSON-RPC for tool discovery
    // First, we need to initialize and then list tools
    const mcpUrl = "https://mcp.hellobooks.ai";
    
    // Try to get tools list using the MCP protocol
    // The /sse endpoint is for streaming, but we can try the REST endpoint for tools
    const toolsResponse = await fetch(`${mcpUrl}/tools/list`, {
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

    if (!toolsResponse.ok) {
      // Try alternative endpoint format
      console.log("Trying alternative MCP endpoint...");
      
      const altResponse = await fetch(`${mcpUrl}/mcp/tools`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${authToken}`,
          "X-Entity-Id": entityId,
          "X-Org-Id": orgId,
        },
      });

      if (!altResponse.ok) {
        // Try JSON-RPC on base endpoint
        console.log("Trying JSON-RPC on base endpoint...");
        
        const rpcResponse = await fetch(`${mcpUrl}/`, {
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

        if (!rpcResponse.ok) {
          const errorText = await rpcResponse.text();
          console.error("MCP request failed:", rpcResponse.status, errorText);
          return new Response(
            JSON.stringify({ 
              error: "Failed to fetch MCP tools", 
              status: rpcResponse.status,
              details: errorText 
            }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const rpcData = await rpcResponse.json();
        console.log("MCP response (RPC):", JSON.stringify(rpcData));
        
        const tools = rpcData.result?.tools || rpcData.tools || [];
        return new Response(
          JSON.stringify({ tools, source: "mcp_rpc" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const altData = await altResponse.json();
      console.log("MCP response (alt):", JSON.stringify(altData));
      
      const tools = altData.tools || altData.result?.tools || altData;
      return new Response(
        JSON.stringify({ tools: Array.isArray(tools) ? tools : [], source: "mcp_alt" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await toolsResponse.json();
    console.log("MCP response:", JSON.stringify(data));
    
    const tools = data.result?.tools || data.tools || [];
    
    return new Response(
      JSON.stringify({ tools, source: "mcp_tools_list" }),
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
