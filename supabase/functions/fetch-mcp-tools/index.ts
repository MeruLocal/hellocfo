import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, h-authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Parse SSE events — handles both \r\n and \n\n delimiters
function parseSSEBuffer(buffer: string): { events: Array<{ type: string; data: string }>; remaining: string } {
  const events: Array<{ type: string; data: string }> = [];
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const remaining = parts.pop() || "";

  for (const part of parts) {
    if (!part.trim()) continue;
    let eventType = "message";
    const dataLines: string[] = [];
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) eventType = line.substring(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.substring(5).trim());
    }
    if (dataLines.length > 0) {
      events.push({ type: eventType, data: dataLines.join("\n") });
    }
  }
  return { events, remaining };
}

async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number
): Promise<{ done: boolean; value?: Uint8Array } | null> {
  return Promise.race([
    reader.read(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

// Read an SSE response body and return the first result.tools found
async function readSSEForResult(
  reqId: string,
  label: string,
  response: Response,
  timeoutMs = 10000
): Promise<unknown | null> {
  const reader = response.body?.getReader();
  if (!reader) {
    console.log(`[${reqId}] [${label}] No body reader`);
    return null;
  }
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await readWithTimeout(reader, 3000);
    if (!result) continue; // timeout, keep waiting
    if (result.done) {
      console.log(`[${reqId}] [${label}] Stream done`);
      break;
    }
    const chunk = decoder.decode(result.value, { stream: true });
    if (buffer.length === 0) console.log(`[${reqId}] [${label}] First chunk: ${chunk.substring(0, 400)}`);
    buffer += chunk;

    const { events, remaining } = parseSSEBuffer(buffer);
    buffer = remaining;

    for (const ev of events) {
      console.log(`[${reqId}] [${label}] SSE event type=${ev.type} data=${ev.data.substring(0, 300)}`);
      if (ev.type === "message") {
        try {
          const parsed = JSON.parse(ev.data);
          if (parsed.error) {
            console.error(`[${reqId}] [${label}] JSON-RPC error: ${JSON.stringify(parsed.error)}`);
            reader.cancel();
            return null;
          }
          if (parsed.result !== undefined) {
            reader.cancel();
            return parsed.result;
          }
        } catch (_e) { /* keep reading */ }
      }
    }
  }

  reader.cancel();
  console.log(`[${reqId}] [${label}] Timeout or no result found`);
  return null;
}

// Clean Streamable HTTP MCP client matching the Cursor config pattern
async function fetchMCPTools(
  reqId: string,
  mcpUrl: string,
  authToken: string
): Promise<unknown[] | null> {
  const headers = {
    "Authorization": `Bearer ${authToken}`,
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "ngrok-skip-browser-warning": "true",
    "User-Agent": "HelloCFO-MCP-Client/1.0",
  };

  // Step 1: POST initialize
  console.log(`[${reqId}] Step 1: POST initialize to ${mcpUrl.replace(/entityid=[^&]+/, "entityid=***").replace(/orgid=[^&]+/, "orgid=***")}`);
  const initResp = await fetch(mcpUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "hellocfo-client", version: "1.0.0" },
      },
    }),
  });

  console.log(`[${reqId}] initialize response: status=${initResp.status}, content-type=${initResp.headers.get("content-type")}`);

  if (!initResp.ok) {
    const text = await initResp.text();
    console.error(`[${reqId}] initialize failed: ${text.substring(0, 300)}`);
    return null;
  }

  const ct = initResp.headers.get("content-type") || "";
  let initResult: unknown;

  if (ct.includes("text/event-stream")) {
    initResult = await readSSEForResult(reqId, "initialize", initResp, 10000);
  } else {
    const json = await initResp.json();
    console.log(`[${reqId}] initialize JSON: ${JSON.stringify(json).substring(0, 300)}`);
    initResult = json?.result ?? null;
  }

  if (!initResult) {
    console.error(`[${reqId}] No initialize result`);
    return null;
  }
  console.log(`[${reqId}] initialize OK: ${JSON.stringify(initResult).substring(0, 200)}`);

  // Step 2: POST notifications/initialized (fire-and-forget per MCP spec)
  console.log(`[${reqId}] Step 2: POST notifications/initialized`);
  fetch(mcpUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }),
  }).catch((e) => console.log(`[${reqId}] notifications/initialized error (ignored): ${e}`));

  // Brief pause to let server process the notification
  await new Promise((r) => setTimeout(r, 100));

  // Step 3: POST tools/list — response is also SSE
  console.log(`[${reqId}] Step 3: POST tools/list`);
  const toolsResp = await fetch(mcpUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
  });

  console.log(`[${reqId}] tools/list response: status=${toolsResp.status}, content-type=${toolsResp.headers.get("content-type")}`);

  if (!toolsResp.ok) {
    const text = await toolsResp.text();
    console.error(`[${reqId}] tools/list failed: ${text.substring(0, 300)}`);
    return null;
  }

  const ct2 = toolsResp.headers.get("content-type") || "";
  let toolsResult: unknown;

  if (ct2.includes("text/event-stream")) {
    toolsResult = await readSSEForResult(reqId, "tools/list", toolsResp, 10000);
  } else {
    const json = await toolsResp.json();
    console.log(`[${reqId}] tools/list JSON: ${JSON.stringify(json).substring(0, 300)}`);
    toolsResult = json?.result ?? null;
  }

  if (!toolsResult || typeof toolsResult !== "object") {
    console.error(`[${reqId}] No tools/list result`);
    return null;
  }

  const tools = (toolsResult as { tools?: unknown[] }).tools;
  if (!Array.isArray(tools)) {
    console.error(`[${reqId}] tools/list result has no tools array: ${JSON.stringify(toolsResult).substring(0, 200)}`);
    return null;
  }

  console.log(`[${reqId}] SUCCESS: got ${tools.length} tools`);
  return tools;
}

serve(async (req) => {
  const reqId = crypto.randomUUID().slice(0, 8);
  console.log(`[${reqId}] fetch-mcp-tools START method=${req.method}`);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract auth token from H-Authorization header (strips any Bearer prefix)
    const hAuthHeader = req.headers.get("H-Authorization") ?? "";
    let authToken = hAuthHeader.trim();
    while (authToken.toLowerCase().startsWith("bearer ")) {
      authToken = authToken.substring(7).trim();
    }
    if (!authToken) authToken = Deno.env.get("MCP_HELLOBOOKS_AUTH_TOKEN") ?? "";

    let entityId = "";
    let orgId = "";

    if (req.method === "POST") {
      try {
        const body = await req.json();
        entityId = body.entityId ?? "";
        orgId = body.orgId ?? "";
      } catch (_e) { /* ignore */ }
    }

    if (!entityId) entityId = Deno.env.get("MCP_HELLOBOOKS_ENTITY_ID") ?? "";
    if (!orgId) orgId = Deno.env.get("MCP_HELLOBOOKS_ORG_ID") ?? "";

    console.log(`[${reqId}] auth=${authToken ? "present" : "MISSING"}, entityId=${entityId ? "present" : "MISSING"}, orgId=${orgId ? "present" : "MISSING"}`);

    if (!authToken || !entityId || !orgId) {
      return new Response(
        JSON.stringify({ error: "Missing credentials. Provide H-Authorization header and entityId/orgId in body." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mcpBaseUrl = (Deno.env.get("MCP_BASE_URL") ?? "").replace(/\/+$/, "");
    if (!mcpBaseUrl) {
      return new Response(
        JSON.stringify({ error: "MCP_BASE_URL is not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build URL exactly as the Cursor config does: base URL + query params
    const mcpUrl = `${mcpBaseUrl}/?entityid=${entityId}&orgid=${orgId}`;
    console.log(`[${reqId}] MCP URL: ${mcpBaseUrl.substring(0, 40)}...?entityid=***&orgid=***`);

    const tools = await fetchMCPTools(reqId, mcpUrl, authToken);

    if (!tools || tools.length === 0) {
      return new Response(
        JSON.stringify({
          error: "MCP server returned no tools",
          details: "Check MCP server logs. The server connected but returned an empty tools list.",
          tools: [],
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ tools, source: "mcp", count: tools.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[${reqId}] Unhandled error: ${msg}`);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
