import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, h-authorization",
};

const MAX_TOOL_RESULT_CHARS = 50000;

// ─── Types ────────────────────────────────────────────────────────────────────

type SSEEventType =
  | "connected" | "route_info" | "thinking" | "tool_call" | "tool_result"
  | "token" | "response" | "done" | "error" | "heartbeat";

interface LLMConfig {
  id: string; provider: string; model: string;
  api_key: string | null; endpoint: string | null;
  max_tokens: number; temperature: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncateResult(result: string, maxChars = MAX_TOOL_RESULT_CHARS): string {
  if (result.length <= maxChars) return result;
  try {
    const parsed = JSON.parse(result);
    if (Array.isArray(parsed)) {
      const truncated: unknown[] = [];
      let len = 2;
      for (const item of parsed) {
        const s = JSON.stringify(item);
        if (len + s.length + 1 > maxChars) break;
        truncated.push(item); len += s.length + 1;
      }
      return JSON.stringify(truncated) + `\n[Truncated: ${truncated.length}/${parsed.length}]`;
    }
  } catch { /* not JSON */ }
  return result.slice(0, maxChars) + `\n[Truncated]`;
}

// Auto-generate chat name from first message + route
function generateChatName(query: string, category: string, toolsUsed: string[]): string {
  const q = query.trim();
  const words = q.split(/\s+/);

  // Priority 1: Action + entity (e.g. "Show Outstanding Invoices")
  const actionWords = ["show", "get", "fetch", "list", "create", "send", "export", "find"];
  const entityWords = ["invoice", "bill", "payment", "customer", "vendor", "report", "profit", "cash", "gst", "tax"];
  const action = words.find(w => actionWords.some(a => w.toLowerCase().startsWith(a)));
  const entity = words.find(w => entityWords.some(e => w.toLowerCase().includes(e)));
  if (action && entity) {
    return `${action.charAt(0).toUpperCase() + action.slice(1).toLowerCase()} ${entity.charAt(0).toUpperCase() + entity.slice(1).toLowerCase()}`;
  }

  // Priority 2: First 6 words of message
  if (words.length >= 3) {
    return words.slice(0, 6).join(" ").replace(/[?!]+$/, "");
  }

  // Priority 3: Category-based
  if (category === "bookkeeper") return "Accounting Task";
  if (category === "cfo") return "Financial Query";
  return "New Chat";
}

// Simple keyword-based category classifier
function classifyQuery(query: string): "bookkeeper" | "cfo" | "general_chat" {
  const q = query.toLowerCase();
  const generalPatterns = [/^(hi|hello|hey|thanks|bye|ok|yes|no)[\s!?.]*$/i];
  if (generalPatterns.some(p => p.test(q.trim()))) return "general_chat";

  const bookkeeperKws = ["create", "add", "new", "edit", "update", "delete", "remove", "record", "send", "file", "submit", "void", "import", "clone", "reconcile"];
  const cfoKws = ["show", "get", "fetch", "list", "view", "report", "analyze", "compare", "revenue", "profit", "loss", "balance", "cash", "receivable", "payable", "gst", "tax", "inventory", "forecast", "aging", "overdue", "outstanding"];

  const bScore = bookkeeperKws.filter(k => q.includes(k)).length;
  const cScore = cfoKws.filter(k => q.includes(k)).length;

  if (bScore > cScore) return "bookkeeper";
  if (cScore > 0) return "cfo";
  return "cfo"; // default
}

// Tool group keywords for filtering
const TOOL_KEYWORDS: Record<string, string[]> = {
  invoices: ["invoice", "invoices", "sales", "billing"],
  bills: ["bill", "bills", "purchase", "payable"],
  payments: ["payment", "payments", "paid", "received", "collection"],
  customers: ["customer", "customers", "client", "debtor"],
  vendors: ["vendor", "vendors", "supplier", "creditor"],
  aging_reports: ["aging", "aged", "overdue", "outstanding", "receivable", "payable", "ar", "ap"],
  transactions: ["transaction", "bank", "banking", "reconcil", "statement"],
};

const TOOL_GROUPS: Record<string, string[]> = {
  invoices: ["get_all_invoices", "get_invoice_by_id", "update_invoice"],
  bills: ["get_bills", "get_bill_by_id", "update_bill"],
  payments: ["get_all_payments", "get_payment_by_id", "update_payment"],
  customers: ["get_all_customers", "get_customer_by_id", "create_customer", "update_customer"],
  vendors: ["get_all_vendors", "get_vendor_by_id", "create_vendor", "update_vendor"],
  aging_reports: ["get_aged_receivables_report", "get_aged_payables_report"],
  transactions: ["get_all_transactions", "get_transaction_by_id", "get_grouped_transactions"],
};

function selectTools(query: string): string[] {
  const q = query.toLowerCase();
  const matched: string[] = [];
  for (const [group, keywords] of Object.entries(TOOL_KEYWORDS)) {
    if (keywords.some(k => q.includes(k))) matched.push(group);
  }
  if (matched.length === 0) matched.push("aging_reports", "invoices", "payments");
  const tools: string[] = [];
  for (const g of matched) if (TOOL_GROUPS[g]) tools.push(...TOOL_GROUPS[g]);
  return [...new Set(tools)];
}

// ─── MCP Client ───────────────────────────────────────────────────────────────

class MCPClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private sessionUrl: string | null = null;
  private sseReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private pendingRequests = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private buffer = "";
  private reqId: string;

  constructor(baseUrl: string, headers: Record<string, string>, reqId: string) {
    this.baseUrl = baseUrl; this.headers = headers; this.reqId = reqId;
  }

  async connect(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/sse`, { headers: this.headers });
    if (!res.ok) throw new Error(`MCP connect failed: HTTP ${res.status}`);
    this.sseReader = res.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await this.sseReader.read();
      if (done) break;
      this.buffer += decoder.decode(value, { stream: true });
      for (const line of this.buffer.split("\n")) {
        if (line.startsWith("data: /") || line.startsWith("data: http")) {
          this.sessionUrl = line.startsWith("data: /")
            ? `${this.baseUrl}${line.slice(6).trim()}`
            : line.slice(6).trim();
          this.listenSSE(decoder);
          return;
        }
      }
      this.buffer = "";
    }
    throw new Error("Failed to get MCP session URL");
  }

  private listenSSE(decoder: TextDecoder): void {
    (async () => {
      while (true) {
        const { value, done } = await this.sseReader!.read();
        if (done) break;
        this.buffer += decoder.decode(value, { stream: true });
        const msgs = this.buffer.replace(/\r\n/g, "\n").split("\n\n");
        this.buffer = msgs.pop() || "";
        for (const msg of msgs) {
          let evType = "", data = "";
          for (const line of msg.split("\n")) {
            if (line.startsWith("event:")) evType = line.slice(6).trim();
            else if (line.startsWith("data:")) data = line.slice(5).trim();
          }
          if (evType === "message" && data) {
            try {
              const r = JSON.parse(data);
              const p = this.pendingRequests.get(r.id);
              if (p) {
                this.pendingRequests.delete(r.id);
                if (r.error) p.reject(new Error(r.error.message || JSON.stringify(r.error)));
                else p.resolve(r.result);
              }
            } catch { /* ignore */ }
          }
        }
      }
    })();
  }

  private async request(method: string, params?: unknown): Promise<unknown> {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Timeout: ${method}`));
        }
      }, 30000);
    });
    await fetch(this.sessionUrl!, {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }),
    });
    return promise;
  }

  async initialize(): Promise<void> {
    await this.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "munimji-agent", version: "1.0" } });
    await fetch(this.sessionUrl!, {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
  }

  async listTools(): Promise<Array<{ name: string; description: string; inputSchema: unknown }>> {
    const r = (await this.request("tools/list")) as { tools: Array<{ name: string; description: string; inputSchema: unknown }> };
    return r.tools || [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const r = (await this.request("tools/call", { name, arguments: args })) as { content: Array<{ type: string; text?: string }> };
    return r.content?.filter(c => c.type === "text").map(c => c.text).join("\n") || JSON.stringify(r);
  }

  close(): void { this.sseReader?.cancel(); }
}

// ─── OpenAI Call ──────────────────────────────────────────────────────────────

async function callOpenAI(
  config: LLMConfig,
  systemPrompt: string,
  messages: unknown[],
  tools: unknown[],
  reqId: string,
): Promise<{ finish_reason: string; message: { role: string; content: string | null; tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[] }; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }> {
  const endpoint = `${(config.endpoint || "https://lovable-hellobooks-resource.cognitiveservices.azure.com/openai/v1/").replace(/\/$/, "")}/chat/completions`;
  const body: Record<string, unknown> = {
    model: config.model,
    max_completion_tokens: config.max_tokens || 4096,
    messages: [{ role: "developer", content: systemPrompt }, ...messages],
  };
  if (tools.length > 0) body.tools = tools;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": config.api_key || "" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LLM error: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const result = await res.json();
  const choice = result.choices?.[0];
  if (!choice) throw new Error("No choices from LLM");
  return { finish_reason: choice.finish_reason, message: choice.message, usage: result.usage };
}

// ─── Conversation Persistence ─────────────────────────────────────────────────

async function getOrCreateConversation(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  entityId: string,
  userId: string,
): Promise<{ chatNumber: number; chatDisplayId: string; isNew: boolean; existingMessages: Message[] }> {
  // Check if conversation exists
  const { data: existing } = await supabase
    .from("unified_conversations")
    .select("conversation_id, chat_number, chat_display_id, messages")
    .eq("conversation_id", conversationId)
    .single();

  if (existing) {
    return {
      chatNumber: existing.chat_number || 0,
      chatDisplayId: existing.chat_display_id || `#MJ-${String(existing.chat_number || 0).padStart(4, "0")}`,
      isNew: false,
      existingMessages: (existing.messages as Message[]) || [],
    };
  }

  // Generate sequential chat_number per entity
  const { data: maxRow } = await supabase
    .from("unified_conversations")
    .select("chat_number")
    .eq("entity_id", entityId)
    .order("chat_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const chatNumber = (maxRow?.chat_number || 0) + 1;
  const chatDisplayId = `#MJ-${String(chatNumber).padStart(4, "0")}`;

  await supabase.from("unified_conversations").insert({
    conversation_id: conversationId,
    entity_id: entityId,
    user_id: userId,
    chat_number: chatNumber,
    chat_display_id: chatDisplayId,
    messages: [],
    message_count: 0,
    mode: "general",
  });

  return { chatNumber, chatDisplayId, isNew: true, existingMessages: [] };
}

async function saveConversation(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  messages: Message[],
  chatName: string,
  autoGeneratedName: string,
  lastMessagePreview: string,
  mode: string,
): Promise<void> {
  await supabase.from("unified_conversations").update({
    messages,
    message_count: messages.length,
    chat_name: chatName,
    auto_generated_name: autoGeneratedName,
    last_message_preview: lastMessagePreview,
    mode,
    updated_at: new Date().toISOString(),
  }).eq("conversation_id", conversationId);
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  const reqId = crypto.randomUUID().slice(0, 8);

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const encoder = new TextEncoder();
  let mcpClient: MCPClient | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: SSEEventType, data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data, timestamp: new Date().toISOString() })}\n\n`));
      };

      // Heartbeat every 15s to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try { send("heartbeat", { ts: Date.now() }); } catch { /* ignore */ }
      }, 15000);

      try {
        const body = await req.json();

        // Support feedback action
        if (body.action === "feedback") {
          clearInterval(heartbeatInterval);
          const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
          const { message_id, feedback, reason } = body;
          if (!message_id || !feedback) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "message_id and feedback required" })}\n\n`));
            controller.close();
            return;
          }
          await supabase.from("feedback_log").update({
            explicit_feedback: feedback,
            implicit_signals: reason ? { reason } : {},
          }).eq("message_id", message_id);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ success: true, message_id, feedback })}\n\n`));
          controller.close();
          return;
        }

        const {
          message: userMessage,
          conversation_id: conversationId = crypto.randomUUID(),
          entity_id: entityId,
          user_id: userId = "anonymous",
        } = body;

        if (!userMessage) { send("error", { message: "message is required" }); controller.close(); return; }

        const resolvedEntityId = entityId || Deno.env.get("MCP_HELLOBOOKS_ENTITY_ID") || "default";
        const startTime = Date.now();

        send("connected", { requestId: reqId, conversationId });

        // ── DB: Get/Create conversation ──
        const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { chatNumber, chatDisplayId, isNew, existingMessages } = await getOrCreateConversation(
          supabase, conversationId, resolvedEntityId, userId
        );

        // ── LLM Config ──
        const { data: llmConfig, error: llmError } = await supabase
          .from("llm_configs").select("*").eq("is_default", true).single();
        if (llmError || !llmConfig?.api_key) {
          send("error", { message: "LLM not configured" });
          controller.close(); return;
        }

        // ── Cache check ──
        const cacheKey = `munimji:${resolvedEntityId}:${btoa(userMessage).slice(0, 32)}`;
        const { data: cached } = await supabase
          .from("response_cache")
          .select("content")
          .eq("cache_key", cacheKey)
          .eq("entity_id", resolvedEntityId)
          .gte("created_at", new Date(Date.now() - 300000).toISOString())
          .maybeSingle();

        if (cached) {
          send("route_info", { path: "cached", category: "cache" });
          for (const chunk of cached.content.match(/.{1,100}/g) || [cached.content]) {
            send("token", { text: chunk });
          }
          send("response", { text: cached.content });
          send("done", {
            conversationId, chatNumber, chatDisplayId,
            auto_generated_name: null, chat_name: null,
            path: "cached", executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
          });
          clearInterval(heartbeatInterval); controller.close(); return;
        }

        // ── Classify query ──
        const category = classifyQuery(userMessage);
        send("route_info", { path: category, category, conversationId, chatDisplayId });

        // ── General Chat: skip MCP ──
        if (category === "general_chat") {
          send("thinking", { phase: "responding", message: "Generating response..." });
          const systemPrompt = `You are Munimji, a friendly AI accounting assistant for Indian businesses. 
Be warm, helpful, and concise. If users greet you, greet back and offer to help with their accounting needs.
Chat ID: ${chatDisplayId}`;
          const convHistory = existingMessages.slice(-10).map(m => ({ role: m.role, content: m.content }));
          const llmRes = await callOpenAI(llmConfig, systemPrompt, [...convHistory, { role: "user", content: userMessage }], [], reqId);
          const response = llmRes.message.content || "I'm here to help with your accounting needs!";

          send("token", { text: response });
          send("response", { text: response });

          const updatedMessages: Message[] = [...existingMessages, { role: "user", content: userMessage, timestamp: new Date().toISOString() }, { role: "assistant", content: response, timestamp: new Date().toISOString() }];
          const chatName = isNew ? generateChatName(userMessage, category, []) : undefined;
          await saveConversation(supabase, conversationId, updatedMessages, chatName || "", chatName || "", response.slice(0, 80), "general");

          send("done", {
            conversationId, chatNumber, chatDisplayId,
            auto_generated_name: isNew ? chatName : undefined,
            chat_name: isNew ? chatName : undefined,
            path: "general_chat",
            executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
            usage: llmRes.usage,
          });
          clearInterval(heartbeatInterval); controller.close(); return;
        }

        // ── Connect to MCP ──
        const authToken = req.headers.get("h-authorization")?.replace("Bearer ", "")
          || Deno.env.get("MCP_HELLOBOOKS_AUTH_TOKEN");
        const orgId = Deno.env.get("MCP_HELLOBOOKS_ORG_ID");

        let mcpTools: Array<{ name: string; description: string; inputSchema: unknown }> = [];

        if (authToken && resolvedEntityId && orgId) {
          send("thinking", { phase: "connecting", message: "Connecting to data source..." });
          try {
            mcpClient = new MCPClient("https://mcp.hellobooks.ai", {
              Authorization: `Bearer ${authToken}`,
              "X-Entity-Id": resolvedEntityId,
              "X-Org-Id": orgId,
            }, reqId);
            await mcpClient.connect();
            await mcpClient.initialize();
            mcpTools = await mcpClient.listTools();
            console.log(`[${reqId}] MCP: ${mcpTools.length} tools`);
          } catch (e) {
            console.error(`[${reqId}] MCP failed:`, e);
            send("thinking", { phase: "mcp_fallback", message: "Using AI knowledge base..." });
          }
        }

        // ── Select & build tools ──
        const selectedToolNames = selectTools(userMessage);
        const openAITools = mcpTools
          .filter(t => selectedToolNames.includes(t.name))
          .map(t => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: (t.inputSchema as Record<string, unknown>) || { type: "object", properties: {} } } }));

        send("thinking", { phase: "planning", message: `Selected ${openAITools.length} tools for your query`, toolCount: openAITools.length });

        // ── Agent loop ──
        const systemPrompt = `You are Munimji, an expert AI financial assistant for Indian businesses using HelloBooks accounting software.
Category: ${category} | Entity: ${resolvedEntityId} | Chat: ${chatDisplayId}
Date: ${new Date().toISOString().split("T")[0]}

CRITICAL RULES:
- Use the available MCP tools to fetch REAL financial data
- NEVER make up numbers or financial data
- Format currency as ₹ with Indian number formatting (lakhs, crores)
- Be concise and structured in responses
- For read queries (CFO mode): fetch data then summarize
- For write queries (Bookkeeper mode): execute the action and confirm`;

        const convHistory = existingMessages.slice(-10).map(m => ({ role: m.role, content: m.content }));
        const llmMessages: unknown[] = [...convHistory, { role: "user", content: userMessage }];
        const toolResults: { tool: string; success: boolean; data?: string }[] = [];

        let finalResponse = "";
        let iterationCount = 0;
        const MAX_ITERATIONS = 5;

        while (iterationCount < MAX_ITERATIONS) {
          iterationCount++;
          send("thinking", { phase: "reasoning", iteration: iterationCount });

          const llmRes = await callOpenAI(llmConfig, systemPrompt, llmMessages, openAITools, reqId);

          if (llmRes.finish_reason === "tool_calls" && llmRes.message.tool_calls) {
            llmMessages.push(llmRes.message);

            for (const tc of llmRes.message.tool_calls) {
              const toolName = tc.function.name;
              let args: Record<string, unknown> = {};
              try { args = JSON.parse(tc.function.arguments); } catch { /* empty */ }

              send("tool_call", { tool: toolName, args });

              let toolResultStr = "";
              let toolSuccess = false;

              if (mcpClient) {
                try {
                  toolResultStr = await mcpClient.callTool(toolName, args);
                  toolResultStr = truncateResult(toolResultStr);
                  toolSuccess = true;
                  toolResults.push({ tool: toolName, success: true });
                  send("tool_result", { tool: toolName, success: true, preview: toolResultStr.slice(0, 200) });
                } catch (e) {
                  toolResultStr = `Error: ${String(e)}`;
                  toolResults.push({ tool: toolName, success: false });
                  send("tool_result", { tool: toolName, success: false, error: String(e) });
                }
              } else {
                toolResultStr = JSON.stringify({ error: "MCP not connected", message: "No live data available" });
                send("tool_result", { tool: toolName, success: false, error: "MCP not connected" });
              }

              llmMessages.push({ role: "tool", tool_call_id: tc.id, content: toolResultStr });
            }
          } else {
            finalResponse = llmRes.message.content || "I encountered an issue generating a response. Please try again.";
            break;
          }
        }

        if (!finalResponse) finalResponse = "Maximum tool iterations reached. Please try a more specific query.";

        // Stream response tokens
        send("response", { text: finalResponse });
        for (const chunk of finalResponse.match(/.{1,80}/g) || [finalResponse]) {
          send("token", { text: chunk });
        }

        // Save to cache for non-write queries
        if (category === "cfo" && finalResponse.length > 50) {
          const queryHash = btoa(userMessage).slice(0, 32);
          await supabase.from("response_cache").upsert({
            cache_key: cacheKey, entity_id: resolvedEntityId,
            query_hash: queryHash, query_text: userMessage,
            content: finalResponse, path: category, ttl_seconds: 300,
          }, { onConflict: "cache_key" });
        }

        // Persist conversation
        const updatedMessages: Message[] = [
          ...existingMessages,
          { role: "user", content: userMessage, timestamp: new Date().toISOString(), metadata: { category } },
          {
            role: "assistant", content: finalResponse, timestamp: new Date().toISOString(),
            metadata: { category, toolsUsed: toolResults.map(t => t.tool), path: category },
          },
        ];

        const chatName = isNew ? generateChatName(userMessage, category, toolResults.map(t => t.tool)) : undefined;
        await saveConversation(
          supabase, conversationId, updatedMessages,
          chatName || "", chatName || "",
          finalResponse.slice(0, 80), category
        );

        // Log to feedback_log
        await supabase.from("feedback_log").insert({
          message_id: reqId,
          conversation_id: conversationId,
          entity_id: resolvedEntityId,
          user_id: userId,
          user_message: userMessage,
          assistant_response: finalResponse,
          route_path: category,
          intent_matched: null,
          tools_used: toolResults.map(t => t.tool),
          tools_loaded: openAITools.map(t => t.function.name),
          response_time_ms: Date.now() - startTime,
          implicit_signals: { iterationCount },
        });

        send("done", {
          conversationId,
          chatNumber,
          chatDisplayId,
          auto_generated_name: isNew ? chatName : undefined,
          chat_name: isNew ? chatName : undefined,
          path: category,
          toolsUsed: toolResults,
          executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
          messageCount: updatedMessages.length,
        });

      } catch (error) {
        console.error(`[${reqId}] Fatal error:`, error);
        const controller_send = (type: SSEEventType, data: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data, timestamp: new Date().toISOString() })}\n\n`));
        };
        controller_send("error", { message: error instanceof Error ? error.message : "Internal server error" });
      } finally {
        clearInterval(heartbeatInterval);
        if (mcpClient) mcpClient.close();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
