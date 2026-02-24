// Streamable HTTP MCP Client — SHARED SOURCE OF TRUTH
// Works with HelloBooks v2.14.2, uses POST with entityid/orgid query params

function parseSSEBuffer(buffer: string): { events: Array<{ type: string; data: string }>; remaining: string } {
  const events: Array<{ type: string; data: string }> = [];
  const parts = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const remaining = parts.pop() || "";
  for (const part of parts) {
    if (!part.trim()) continue;
    let eventType = "message";
    const dataLines: string[] = [];
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) eventType = line.substring(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.substring(5).trim());
    }
    if (dataLines.length > 0) events.push({ type: eventType, data: dataLines.join("\n") });
  }
  return { events, remaining };
}

async function readWithTimeout(reader: ReadableStreamDefaultReader<Uint8Array>, timeoutMs: number): Promise<{ done: boolean; value?: Uint8Array } | null> {
  return Promise.race([reader.read(), new Promise<null>(r => setTimeout(() => r(null), timeoutMs))]);
}

async function readSSEForResult(reqId: string, label: string, response: Response, timeoutMs = 10000): Promise<unknown | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let buffer = "";
  const chunkTimeout = Math.min(5000, timeoutMs); // per-chunk read timeout
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const result = await readWithTimeout(reader, Math.min(chunkTimeout, remaining));
    if (!result) continue;
    if (result.done) break;
    buffer += decoder.decode(result.value, { stream: true });
    const { events, remaining: leftover } = parseSSEBuffer(buffer);
    buffer = leftover;
    for (const ev of events) {
      if (ev.type === "message") {
        try {
          const parsed = JSON.parse(ev.data);
          if (parsed.error) {
            console.log(`[${reqId}] [${label}] SSE error response: ${JSON.stringify(parsed.error).slice(0, 200)}`);
            reader.cancel();
            return null;
          }
          if (parsed.result !== undefined) { reader.cancel(); return parsed.result; }
        } catch (_e) { /* keep reading */ }
      }
    }
  }
  reader.cancel();
  console.log(`[${reqId}] [${label}] SSE read timeout after ${timeoutMs}ms`);
  return null;
}

export class StreamableMCPClient {
  private mcpUrl: string;
  private headers: Record<string, string>;
  private reqId: string;

  constructor(baseUrl: string, authToken: string, entityId: string, orgId: string, reqId: string) {
    this.mcpUrl = `${baseUrl.replace(/\/+$/, "")}/?entityid=${entityId}&orgid=${orgId}`;
    this.headers = {
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "ngrok-skip-browser-warning": "true",
      "User-Agent": "Munimji-Agent/4.0",
    };
    this.reqId = reqId;
  }

  private async post(id: number | null, method: string, params?: unknown): Promise<Response> {
    const body: Record<string, unknown> = { jsonrpc: "2.0", method };
    if (id !== null) body.id = id;
    if (params !== undefined) body.params = params;
    return fetch(this.mcpUrl, { method: "POST", headers: this.headers, body: JSON.stringify(body) });
  }

  private async postAndReadResult(id: number, method: string, params?: unknown, timeoutMs = 10000): Promise<unknown | null> {
    const resp = await this.post(id, method, params);
    if (!resp.ok) { console.error(`[${this.reqId}] MCP ${method} failed: ${resp.status}`); return null; }
    const ct = resp.headers.get("content-type") || "";
    if (ct.includes("text/event-stream")) return readSSEForResult(this.reqId, method, resp, timeoutMs);
    const json = await resp.json();
    return json?.result ?? null;
  }

  async initialize(): Promise<boolean> {
    console.log(`[${this.reqId}] MCP: initialize`);
    const result = await this.postAndReadResult(1, "initialize", {
      protocolVersion: "2024-11-05", capabilities: {},
      clientInfo: { name: "munimji-agent", version: "4.0" },
    }, 10000);
    if (!result) return false;
    this.post(null, "notifications/initialized").catch(() => {});
    await new Promise(r => setTimeout(r, 100));
    console.log(`[${this.reqId}] MCP: initialized OK`);
    return true;
  }

  async listTools(): Promise<Array<{ name: string; description: string; inputSchema: unknown }>> {
    console.log(`[${this.reqId}] MCP: tools/list`);
    const result = await this.postAndReadResult(2, "tools/list", {}, 10000) as { tools?: Array<{ name: string; description: string; inputSchema: unknown }> } | null;
    const tools = result?.tools || [];
    console.log(`[${this.reqId}] MCP: ${tools.length} tools`);
    return tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    console.log(`[${this.reqId}] MCP: call tool ${name}`);
    const id = Date.now() + Math.floor(Math.random() * 1000);
    // Write tools get longer timeout (60s) and one automatic retry
    const isWrite = /^(create|update|delete|edit|file|generate|cancel|reconcile|import|adjust|stock|record)_/.test(name);
    const timeout = isWrite ? 60000 : 30000;
    const result = await this.postAndReadResult(id, "tools/call", { name, arguments: args }, timeout) as {
      content?: Array<{ type: string; text?: string }>;
    } | null;
    if (!result && isWrite) {
      console.log(`[${this.reqId}] MCP: retrying write tool ${name} (timeout on first attempt)`);
      const retryId = Date.now() + Math.floor(Math.random() * 1000);
      const retryResult = await this.postAndReadResult(retryId, "tools/call", { name, arguments: args }, timeout) as {
        content?: Array<{ type: string; text?: string }>;
      } | null;
      if (!retryResult) return `Tool ${name} timed out after retry`;
      return retryResult.content?.filter(c => c.type === "text").map(c => c.text || "").join("\n") || JSON.stringify(retryResult);
    }
    if (!result) return `Tool ${name} returned no result`;
    return result.content?.filter(c => c.type === "text").map(c => c.text || "").join("\n") || JSON.stringify(result);
  }

  close(): void {}
}

export async function createMCPClient(
  reqId: string, baseUrl: string, authToken: string, entityId: string, orgId: string,
): Promise<{ client: StreamableMCPClient; tools: Array<{ name: string; description: string; inputSchema: unknown }> } | null> {
  const client = new StreamableMCPClient(baseUrl, authToken, entityId, orgId, reqId);
  const initialized = await client.initialize();
  if (!initialized) return null;
  const tools = await client.listTools();
  return { client, tools };
}
