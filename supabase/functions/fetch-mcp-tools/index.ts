import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, h-authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Parse SSE events properly - handles \r\n and \n\n delimiters
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

async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number
): Promise<{ done: boolean; value?: Uint8Array } | null> {
  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), timeoutMs);
  });
  return Promise.race([reader.read(), timeoutPromise]);
}

// --- Approach 1: Streamable HTTP (new MCP spec 2025) ---
// POST initialize directly, server responds with SSE or JSON
async function tryStreamableHTTP(
  reqId: string,
  mcpBaseUrl: string,
  authToken: string,
  entityId: string,
  orgId: string
): Promise<unknown[] | null> {
  console.log(`[${reqId}] Trying Streamable HTTP approach (POST initialize)...`);
  
  const baseHeaders = {
    "Authorization": `Bearer ${authToken}`,
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": "2024-11-05",
    "ngrok-skip-browser-warning": "true",
    "User-Agent": "MCP-Client/1.0",
  };

  // Try POST to root or /mcp path with initialize
  const urls = [
    `${mcpBaseUrl}/?entityid=${entityId}&orgid=${orgId}`,
    `${mcpBaseUrl}/mcp?entityid=${entityId}&orgid=${orgId}`,
    `${mcpBaseUrl}/sse?entityid=${entityId}&orgid=${orgId}`,
  ];

  for (const url of urls) {
    try {
      console.log(`[${reqId}] Streamable HTTP POST to: ${url.replace(/entityid=[^&]+/, 'entityid=***').replace(/orgid=[^&]+/, 'orgid=***')}`);
      const initResp = await fetch(url, {
        method: "POST",
        headers: baseHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "hellocfo-client", version: "1.0.0" }
          }
        })
      });

      console.log(`[${reqId}] POST ${url.split('?')[0].split('/').pop()}: status=${initResp.status}, content-type=${initResp.headers.get('content-type')}`);

      if (!initResp.ok) {
        const text = await initResp.text();
        console.log(`[${reqId}] Non-OK response: ${text.substring(0, 200)}`);
        continue;
      }

      const ct = initResp.headers.get('content-type') || '';

      if (ct.includes('text/event-stream')) {
        // Server responded with SSE — read events from this stream
        console.log(`[${reqId}] Got SSE response from POST, reading events...`);
        const tools = await readSSEForTools(reqId, initResp, authToken, url, entityId, orgId, 10000);
        if (tools !== null) return tools;
      } else {
        // JSON response
        const data = await initResp.json();
        console.log(`[${reqId}] JSON init response: ${JSON.stringify(data).substring(0, 200)}`);
        if (data.result) {
          // Send initialized + tools/list
          const toolsResp = await fetch(url, {
            method: "POST",
            headers: baseHeaders,
            body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
          });
          if (toolsResp.ok) {
            const toolsData = await toolsResp.json();
            if (toolsData.result?.tools) {
              console.log(`[${reqId}] Got ${toolsData.result.tools.length} tools via JSON`);
              return toolsData.result.tools;
            }
          }
        }
      }
    } catch (e) {
      console.log(`[${reqId}] Streamable HTTP attempt failed: ${e}`);
    }
  }
  return null;
}

// --- Approach 2: Classic HTTP+SSE (2024-11-05) ---
// GET SSE endpoint → wait for `endpoint` event → POST messages
async function tryClassicSSE(
  reqId: string,
  mcpBaseUrl: string,
  authToken: string,
  entityId: string,
  orgId: string
): Promise<unknown[] | null> {
  console.log(`[${reqId}] Trying Classic SSE approach (GET for SSE stream)...`);

  const mcpHeaders = {
    "Authorization": `Bearer ${authToken}`,
    "ngrok-skip-browser-warning": "true",
    "User-Agent": "MCP-Client/1.0",
  };

  const sseUrl = new URL(`${mcpBaseUrl}/`);
  sseUrl.searchParams.set("entityid", entityId);
  sseUrl.searchParams.set("orgid", orgId);

  const sseResponse = await fetch(sseUrl.toString(), {
    method: "GET",
    headers: {
      ...mcpHeaders,
      "Accept": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });

  const contentType = sseResponse.headers.get("content-type") || "unknown";
  console.log(`[${reqId}] SSE GET status: ${sseResponse.status}, content-type: ${contentType}`);

  if (!sseResponse.ok) {
    const text = await sseResponse.text();
    console.log(`[${reqId}] SSE GET failed: ${text.substring(0, 300)}`);
    return null;
  }

  // Helper to send JSON-RPC to message endpoint
  async function sendRequest(endpoint: string, body: object) {
    console.log(`[${reqId}] POST to ${endpoint.split('?')[0]}: ${JSON.stringify(body).substring(0, 100)}`);
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
        "User-Agent": "MCP-Client/1.0",
        ...mcpHeaders,
      },
      body: JSON.stringify(body),
    });
    console.log(`[${reqId}] POST response: ${resp.status}`);
    if (!resp.ok && resp.status !== 202) {
      const text = await resp.text();
      console.error(`[${reqId}] POST failed: ${text.substring(0, 200)}`);
      throw new Error(`POST failed: ${resp.status}`);
    }
    // consume body
    try { await resp.text(); } catch { /* ignore */ }
  }

  const reader = sseResponse.body?.getReader();
  if (!reader) return null;

  const tools = await readSSEForToolsWithHandshake(reqId, reader, mcpBaseUrl, authToken, entityId, orgId, sendRequest, 25000);
  reader.cancel();
  return tools;
}

// Read SSE stream from a POST response (Streamable HTTP)
async function readSSEForTools(
  reqId: string,
  response: Response,
  authToken: string,
  baseUrl: string,
  entityId: string,
  orgId: string,
  timeoutMs: number
): Promise<unknown[] | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;

  const decoder = new TextDecoder();
  let buffer = "";
  let tools: unknown[] | null = null;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await readWithTimeout(reader, 3000);
    if (result === null) continue;
    if (result.done) break;

    const chunk = decoder.decode(result.value, { stream: true });
    if (buffer.length === 0) console.log(`[${reqId}] SSE chunk: ${chunk.substring(0, 300)}`);
    buffer += chunk;

    const { events, remaining } = parseSSEBuffer(buffer);
    buffer = remaining;

    for (const event of events) {
      console.log(`[${reqId}] SSE event type=${event.type}: ${event.data.substring(0, 200)}`);
      if (event.type === 'message') {
        try {
          const data = JSON.parse(event.data);
          if (data.result?.tools) {
            tools = data.result.tools;
            break;
          }
          if (data.result && data.id === 1) {
            // Got init response, now ask for tools
            const toolsResp = await fetch(baseUrl, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${authToken}`,
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true",
                "User-Agent": "MCP-Client/1.0",
              },
              body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
            });
            if (toolsResp.ok) {
              const td = await toolsResp.json();
              if (td.result?.tools) { tools = td.result.tools; break; }
            }
          }
        } catch { /* continue */ }
      }
    }
    if (tools) break;
  }

  reader.cancel();
  return tools;
}

// Read SSE stream from GET, managing MCP handshake
async function readSSEForToolsWithHandshake(
  reqId: string,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  mcpBaseUrl: string,
  _authToken: string,
  entityId: string,
  orgId: string,
  sendRequest: (endpoint: string, body: object) => Promise<void>,
  timeoutMs: number
): Promise<unknown[] | null> {
  const decoder = new TextDecoder();
  let buffer = "";
  let tools: unknown[] | null = null;
  let state: 'waiting_endpoint' | 'waiting_init' | 'waiting_tools' = 'waiting_endpoint';
  let messageEndpoint = "";
  const deadline = Date.now() + timeoutMs;
  let firstChunk = true;

  while (Date.now() < deadline) {
    const result = await readWithTimeout(reader, 4000);
    if (result === null) {
      console.log(`[${reqId}] Read timeout, state=${state}, elapsed=${Date.now() - (deadline - timeoutMs)}ms`);
      continue;
    }
    if (result.done) { console.log(`[${reqId}] Stream ended`); break; }

    const chunk = decoder.decode(result.value, { stream: true });
    if (firstChunk) {
      console.log(`[${reqId}] First chunk (${chunk.length}b): ${chunk.substring(0, 400)}`);
      firstChunk = false;
    }
    buffer += chunk;

    const { events, remaining } = parseSSEBuffer(buffer);
    buffer = remaining;

    for (const event of events) {
      console.log(`[${reqId}] Event type=${event.type} data=${event.data.substring(0, 200)}`);

      if (event.type === "endpoint" && state === 'waiting_endpoint') {
        messageEndpoint = event.data.trim();
        if (!messageEndpoint.startsWith("http")) {
          const base = (Deno.env.get("MCP_BASE_URL") || "").replace(/\/+$/, "");
          messageEndpoint = `${base}${messageEndpoint}`;
        }
        try {
          const epUrl = new URL(messageEndpoint);
          if (!epUrl.searchParams.has("entityid")) epUrl.searchParams.set("entityid", entityId);
          if (!epUrl.searchParams.has("orgid")) epUrl.searchParams.set("orgid", orgId);
          messageEndpoint = epUrl.toString();
        } catch { /* keep as-is */ }
        console.log(`[${reqId}] Got endpoint: ${messageEndpoint.replace(/entityid=[^&]+/, '***').replace(/orgid=[^&]+/, '***')}`);
        state = 'waiting_init';
        await sendRequest(messageEndpoint, {
          jsonrpc: "2.0", id: 1, method: "initialize",
          params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "hellocfo-client", version: "1.0.0" } }
        });
      }

      if (event.type === "message" && state !== 'waiting_endpoint') {
        try {
          const data = JSON.parse(event.data);
          console.log(`[${reqId}] Message id=${data.id} hasResult=${!!data.result} hasError=${!!data.error}`);
          if (data.error) {
            console.error(`[${reqId}] MCP error: ${JSON.stringify(data.error)}`);
            return null;
          }
          if (data.id === 1 && data.result && state === 'waiting_init') {
            await sendRequest(messageEndpoint, { jsonrpc: "2.0", method: "notifications/initialized", params: {} });
            state = 'waiting_tools';
            await sendRequest(messageEndpoint, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
          }
          if (data.id === 2 && data.result && state === 'waiting_tools') {
            tools = data.result.tools || [];
            console.log(`[${reqId}] Got ${tools?.length} tools!`);
            return tools;
          }
        } catch { /* continue */ }
      }
    }
    if (tools) break;
  }
  console.log(`[${reqId}] Classic SSE ended in state=${state}`);
  return tools;
}

serve(async (req) => {
  const reqId = crypto.randomUUID().slice(0, 8);
  console.log(`[${reqId}] fetch-mcp-tools START`);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const hAuthHeader = req.headers.get("H-Authorization");
    let authTokenFromHeader: string | null = hAuthHeader ?? null;
    while (authTokenFromHeader?.toLowerCase().startsWith("bearer ")) {
      authTokenFromHeader = authTokenFromHeader.substring(7).trim();
    }
    if (!authTokenFromHeader) authTokenFromHeader = null;

    let bodyEntityId: string | null = null;
    let bodyOrgId: string | null = null;

    if (req.method === "POST") {
      try {
        const body = await req.json();
        bodyEntityId = body.entityId || null;
        bodyOrgId = body.orgId || null;
      } catch { /* ignore */ }
    }

    const authToken = authTokenFromHeader || Deno.env.get("MCP_HELLOBOOKS_AUTH_TOKEN");
    const entityId = bodyEntityId || Deno.env.get("MCP_HELLOBOOKS_ENTITY_ID");
    const orgId = bodyOrgId || Deno.env.get("MCP_HELLOBOOKS_ORG_ID");

    console.log(`[${reqId}] auth=${authTokenFromHeader ? 'header' : 'env'}, entityId=${bodyEntityId ? 'body' : 'env'}, orgId=${bodyOrgId ? 'body' : 'env'}`);

    if (!authToken || !entityId || !orgId) {
      return new Response(
        JSON.stringify({ error: "MCP credentials not configured. Provide H-Authorization header and entityId/orgId in body." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mcpBaseUrl = (Deno.env.get("MCP_BASE_URL") || "").replace(/\/+$/, "");
    if (!mcpBaseUrl) {
      return new Response(
        JSON.stringify({ error: "MCP_BASE_URL secret is not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log(`[${reqId}] MCP_BASE_URL: ${mcpBaseUrl.substring(0, 40)}...`);

    // Try Streamable HTTP first (newer spec), then fall back to Classic SSE
    let tools: unknown[] | null = null;

    tools = await tryStreamableHTTP(reqId, mcpBaseUrl, authToken, entityId, orgId);

    if (!tools) {
      console.log(`[${reqId}] Streamable HTTP failed, trying Classic SSE...`);
      tools = await tryClassicSSE(reqId, mcpBaseUrl, authToken, entityId, orgId);
    }

    if (!tools || tools.length === 0) {
      return new Response(
        JSON.stringify({
          error: "MCP server temporarily unavailable",
          details: "Could not retrieve tools via Streamable HTTP or Classic SSE. Check MCP server logs.",
          tools: [],
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[${reqId}] SUCCESS: ${tools.length} tools`);
    return new Response(
      JSON.stringify({ tools, source: "mcp" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[${reqId}] Error:`, msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
