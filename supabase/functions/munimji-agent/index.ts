import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createMCPClient, StreamableMCPClient } from "./mcp-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, h-authorization",
};

const MAX_TOOL_RESULT_CHARS = 50000;
const DEFAULT_AZURE_OPENAI_ENDPOINT = "https://lovable-hellobooks-resource.cognitiveservices.azure.com/openai/v1/";

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
  } catch (_e) { /* not JSON */ }
  return result.slice(0, maxChars) + `\n[Truncated]`;
}

function resolveLLMBaseEndpoint(endpoint: string | null | undefined): string {
  const raw = (endpoint || "").trim();
  if (!raw) return DEFAULT_AZURE_OPENAI_ENDPOINT;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (
      host.endsWith(".supabase.co") ||
      path.includes("/functions/v1") ||
      path.endsWith("/v1/messages")
    ) {
      console.warn(`[munimji] LLM endpoint "${raw}" looks incompatible with chat/completions. Falling back to default endpoint.`);
      return DEFAULT_AZURE_OPENAI_ENDPOINT;
    }
    return raw;
  } catch (_e) {
    console.warn(`[munimji] Invalid LLM endpoint "${raw}". Falling back to default endpoint.`);
    return DEFAULT_AZURE_OPENAI_ENDPOINT;
  }
}

function getUserFacingErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("fetch failed")) {
    return "I couldn't reach the AI service right now. Please try again in a moment.";
  }
  if (lower.includes("llm service unreachable")) {
    return "I couldn't reach the AI service right now. Please verify endpoint and API key in settings.";
  }
  if (lower.includes("llm error: 401")) {
    return "AI credentials look invalid. Please verify LLM API key and endpoint.";
  }
  if (lower.includes("llm error: 429")) {
    return "The AI service is rate-limited right now. Please wait a moment and try again.";
  }
  if (lower.includes("llm error: 404")) {
    return "LLM endpoint appears misconfigured. Please verify endpoint and model settings.";
  }
  return "I couldn't complete this request right now. Please try again in a moment.";
}

// Auto-generate chat name from first message + route
function generateChatName(query: string, category: string, toolsUsed: string[]): string {
  const q = query.trim();
  const words = q.split(/\s+/);

  const actionWords = ["show", "get", "fetch", "list", "create", "send", "export", "find"];
  const entityWords = ["invoice", "bill", "payment", "customer", "vendor", "report", "profit", "cash", "gst", "tax"];
  const action = words.find(w => actionWords.some(a => w.toLowerCase().startsWith(a)));
  const entity = words.find(w => entityWords.some(e => w.toLowerCase().includes(e)));
  if (action && entity) {
    return `${action.charAt(0).toUpperCase() + action.slice(1).toLowerCase()} ${entity.charAt(0).toUpperCase() + entity.slice(1).toLowerCase()}`;
  }

  if (words.length >= 3) {
    return words.slice(0, 6).join(" ").replace(/[?!]+$/, "");
  }

  if (category === "bookkeeper") return "Accounting Task";
  if (category === "cfo") return "Financial Query";
  return "New Chat";
}

// Simple keyword-based category classifier
function classifyQuery(query: string): "bookkeeper" | "cfo" | "general_chat" {
  const q = query.toLowerCase().trim();
  const generalPatterns = [/^(hi|hello|hey|thanks|bye|ok|yes|no|namaste)[\s!?.]*$/i];
  if (generalPatterns.some(p => p.test(q))) return "general_chat";

  const bookkeeperKws = ["create", "add", "new", "edit", "update", "delete", "remove", "record", "send", "file", "submit", "void", "import", "clone", "reconcile", "banao", "bhejo"];
  const cfoKws = ["show", "get", "fetch", "list", "view", "report", "analyze", "compare", "revenue", "profit", "loss", "balance", "cash", "receivable", "payable", "gst", "tax", "inventory", "forecast", "aging", "overdue", "outstanding"];

  const bScore = bookkeeperKws.filter(k => q.includes(k)).length;
  const cScore = cfoKws.filter(k => q.includes(k)).length;

  if (bScore > cScore) return "bookkeeper";
  if (cScore > 0) return "cfo";
  return "cfo"; // default
}

// ─── Follow-up Detection ──────────────────────────────────────────────────────
// If user sends a short confirmation/retry message AND there is conversation history,
// reuse the previous tool group instead of re-classifying.

const FOLLOWUP_PATTERNS = [
  /^(yes|yep|yeah|haan|ha|kar\s*do|ok|okay|sure|correct|sahi|theek|try\s*again|retry|do\s*it|go\s*ahead|proceed|confirm)/i,
  /please\s+(try|create|do|make|send|retry)/i,
  /try\s+again/i,
  /correct\s*(info|information|details)?/i,
];

interface FollowUpResult {
  isFollowUp: boolean;
  previousCategory?: "bookkeeper" | "cfo" | "general_chat";
  previousToolsUsed?: string[];
}

function detectFollowUp(query: string, conversationHistory: Message[]): FollowUpResult {
  const words = query.trim().split(/\s+/);
  // Only treat as follow-up if message is short (< 12 words) and matches patterns
  if (words.length > 12) return { isFollowUp: false };
  if (conversationHistory.length < 2) return { isFollowUp: false };

  const isFollowUpMsg = FOLLOWUP_PATTERNS.some(p => p.test(query.trim()));
  if (!isFollowUpMsg) return { isFollowUp: false };

  // Find the last assistant message with metadata
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const msg = conversationHistory[i];
    if (msg.role === "assistant" && msg.metadata) {
      const cat = msg.metadata.category as string | undefined;
      const tools = msg.metadata.toolsUsed as string[] | undefined;
      return {
        isFollowUp: true,
        previousCategory: (cat as "bookkeeper" | "cfo" | "general_chat") || "cfo",
        previousToolsUsed: tools || [],
      };
    }
  }

  return { isFollowUp: false };
}

// Tool group keywords for filtering
const TOOL_KEYWORDS: Record<string, string[]> = {
  invoices: ["invoice", "invoices", "sales", "billing", "billed", "sale"],
  bills: ["bill", "bills", "purchase", "purchases", "payable", "payables", "vendor bill"],
  payments: ["payment", "payments", "paid", "received", "receipt", "collection", "collected"],
  customers: ["customer", "customers", "client", "clients", "debtor", "debtors", "buyer"],
  vendors: ["vendor", "vendors", "supplier", "suppliers", "creditor", "creditors"],
  aging_reports: ["aging", "ageing", "aged", "overdue", "outstanding", "receivable", "receivables", "payable", "payables", "ar", "ap", "dso", "dpo"],
  transactions: ["transaction", "transactions", "bank", "banking", "reconcil", "uncategorized", "categorize", "statement", "transfer"],
  credit_notes: ["credit note", "credit notes", "cn", "debit note", "return", "refund"],
  delivery_challans: ["challan", "challans", "delivery", "dispatch", "dc"],
};

const TOOL_GROUPS: Record<string, string[]> = {
  invoices: [
    "get_all_invoices", "get_invoice_by_id", "update_invoice", "find_invoice_document",
    "create_invoice", "create_invoice_line_item",
  ],
  bills: ["get_bills", "get_bill_by_id", "update_bill", "create_bill"],
  payments: ["get_all_payments", "get_payment_by_id", "update_payment", "find_payment_document", "create_payment"],
  customers: ["get_all_customers", "get_customer_by_id", "create_customer", "update_customer"],
  vendors: ["get_all_vendors", "get_vendor_by_id", "create_vendor", "update_vendor"],
  aging_reports: ["get_aged_receivables_report", "get_aged_payables_report"],
  transactions: [
    "get_all_transactions", "get_transaction_by_id", "get_selected_transactions",
    "update_transactions", "get_grouped_transactions", "get_transaction_line_items",
    "update_transaction_line_item", "find_transfer_document",
  ],
  credit_notes: [
    "get_all_sales_credit_notes", "get_sales_credit_note_by_id", "update_sales_credit_note", "find_sales_credit_note_document",
    "get_all_purchase_credit_notes", "get_purchase_credit_note_by_id", "update_purchase_credit_note", "find_purchase_credit_note_document",
  ],
  delivery_challans: ["get_all_delivery_challans", "get_delivery_challan_by_id", "update_delivery_challan"],
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

// ─── System Prompts ──────────────────────────────────────────────────────────

function getSystemPrompt(category: string, entityId: string, chatDisplayId: string): string {
  const dateStr = new Date().toISOString().split("T")[0];
  const base = `You are Munimji — an AI assistant exclusively for HelloBooks, an accounting and bookkeeping platform. You ONLY help users with HelloBooks-related tasks using the tools available to you.
Category: ${category} | Entity: ${entityId} | Chat: ${chatDisplayId}
Date: ${dateStr}

CRITICAL RULES:
- Use the available MCP tools to fetch REAL financial data
- NEVER make up numbers or financial data
- Format currency as ₹ with Indian number formatting (lakhs, crores)
- Be concise and structured in responses`;

  if (category === "bookkeeper") {
    return base + `
- For write queries (Bookkeeper mode): execute the action and confirm
- When a user CONFIRMS a previously proposed action (says "yes", "correct", "do it", "try again", "haan", "kar do"), you MUST immediately execute the action using the tools. Do NOT ask for confirmation again.
- If a previous message in the conversation contains all the details needed for an action, extract them and execute immediately.

PROGRESSIVE FIELD COLLECTION:
When creating records, apply these rules:
- Customer/vendor name: ALWAYS required (cannot guess)
- Amount: ALWAYS required (cannot guess)
- Items/description: ALWAYS required (need at least one line)
- Date: DEFAULT to today if not specified
- Due date: DEFAULT to Net 30 if not specified
- Tax rate: DEFAULT from HSN/SAC code or 18% GST
- Invoice/bill number: DEFAULT auto-generate
- Currency: DEFAULT to entity currency (INR/₹)
Ask ONLY for what is missing. Never ask for fields you can default.

DUPLICATE DETECTION:
Before ANY create operation, check for duplicates:
- Invoice: Search by invoice number, or same customer + amount + date
- Customer/Vendor: Search by GSTIN, PAN, or fuzzy name match
If a potential duplicate is found, WARN the user before proceeding.

DANGEROUS ACTION TIERS:
- LOW (edit, update): Execute immediately, show result
- MEDIUM (reverse, cancel): Ask single confirmation with impact summary
- HIGH (delete, void, merge): Show linked records affected, ask confirmation
- CRITICAL (file GST, close FY, bulk delete): Show full checklist, require typed confirmation

CLARIFICATION — When you need the user to choose from a specific set of predefined options:
1. Output a clarification block with valid JSON:
\`\`\`clarification
{"question":"Which tax rate should be applied?","type":"radio","options":[{"label":"GST 18%","value":"gst_18"},{"label":"GST 12%","value":"gst_12"},{"label":"GST 5%","value":"gst_5"}]}
\`\`\`
2. Supported types: "radio" (clickable buttons — DEFAULT), "dropdown" (for 6+ options), "checkbox" (multiple selections)
3. Each option needs: "label" (display text) and "value" (internal value)
4. Use clarification blocks for 2-8 clear, distinct options (tax rate, customer, payment method, account)
5. For open-ended questions (dates, amounts, descriptions), use regular text instead
6. Always include text BEFORE the clarification block. Only ONE per response.`;
  }

  return base + `
- For read queries (CFO mode): fetch data then summarize
- Always calculate and show % change vs previous period when time-series data is available
- Use arrows: ▲ for increase, ▼ for decrease, ► for flat (<1% change)
- Flag any expense item that is 2x+ higher than its historical average with ⚠`;
}

// ─── OpenAI Call ──────────────────────────────────────────────────────────────

async function callOpenAI(
  config: LLMConfig,
  systemPrompt: string,
  messages: unknown[],
  tools: unknown[],
  reqId: string,
): Promise<{ finish_reason: string; message: { role: string; content: string | null; tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[] }; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }> {
  const endpoint = `${resolveLLMBaseEndpoint(config.endpoint).replace(/\/$/, "")}/chat/completions`;
  const body: Record<string, unknown> = {
    model: config.model,
    max_completion_tokens: config.max_tokens || 8192,
    messages: [{ role: "developer", content: systemPrompt }, ...messages],
  };
  if (tools.length > 0) body.tools = tools;
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": config.api_key || "" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`LLM service unreachable: ${msg}`);
  }
  if (!res.ok) throw new Error(`LLM error: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const result = await res.json();
  const choice = result.choices?.[0];
  if (!choice) throw new Error("No choices from LLM");
  return { finish_reason: choice.finish_reason, message: choice.message, usage: result.usage };
}

// ─── Conversation Persistence ─────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;

async function getOrCreateConversation(
  supabase: AnySupabaseClient,
  conversationId: string,
  entityId: string,
  userId: string,
): Promise<{ chatNumber: number; chatDisplayId: string; isNew: boolean; existingMessages: Message[] }> {
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
  supabase: AnySupabaseClient,
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
  let mcpClient: StreamableMCPClient | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: SSEEventType, data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data, timestamp: new Date().toISOString() })}\n\n`));
      };

      const heartbeatInterval = setInterval(() => {
        try { send("heartbeat", { ts: Date.now() }); } catch (_e) { /* ignore */ }
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

        // ─── Health Check ─────────────────────────────────────────────────
        if (body.action === "health") {
          clearInterval(heartbeatInterval);

          const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
            Promise.race([
              promise,
              new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
            ]);

          const checks: Record<string, unknown> = {};
          const TIMEOUT = 5000;

          // 1. Environment check (sync, no timeout needed)
          const requiredEnvVars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "MCP_BASE_URL"];
          const missingKeys = requiredEnvVars.filter(k => !Deno.env.get(k));
          checks.environment = { status: missingKeys.length === 0 ? "ok" : "fail", missingKeys };

          // 2-4: Run DB, LLM, MCP checks in parallel
          const [dbResult, mcpResult] = await Promise.allSettled([
            // Database + LLM check (single Supabase client)
            withTimeout((async () => {
              const t0 = Date.now();
              const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
              const { error: pingErr } = await sb.from("llm_configs").select("id").limit(1);
              const dbLatency = Date.now() - t0;
              if (pingErr) return { db: { status: "fail", error: pingErr.message, latencyMs: dbLatency }, llm: { status: "unknown" } };

              const { data: cfg, error: cfgErr } = await sb.from("llm_configs").select("model, endpoint, api_key").eq("is_default", true).single();
              const llm = cfgErr || !cfg?.api_key
                ? { status: "fail", error: cfgErr?.message || "no default config or missing api_key" }
                : { status: "ok", model: cfg.model, endpoint: cfg.endpoint ? "custom" : "default" };
              return { db: { status: "ok", latencyMs: dbLatency }, llm };
            })(), TIMEOUT),

            // MCP check
            withTimeout((async () => {
              const mcpBase = Deno.env.get("MCP_BASE_URL");
              const authToken = Deno.env.get("MCP_HELLOBOOKS_AUTH_TOKEN") || "";
              const entityId = Deno.env.get("MCP_HELLOBOOKS_ENTITY_ID") || "health";
              const orgId = Deno.env.get("MCP_HELLOBOOKS_ORG_ID") || "health";
              if (!mcpBase) return { status: "fail", error: "MCP_BASE_URL not set" };
              const t0 = Date.now();
              const result = await createMCPClient(`health-${reqId}`, mcpBase, authToken, entityId, orgId);
              const latencyMs = Date.now() - t0;
              if (!result) return { status: "fail", latencyMs, error: "connection failed" };
              result.client.close();
              return { status: "ok", toolCount: result.tools.length, latencyMs };
            })(), TIMEOUT),
          ]);

          // Unpack results
          if (dbResult.status === "fulfilled") {
            checks.database = dbResult.value.db;
            checks.llm = dbResult.value.llm;
          } else {
            checks.database = { status: "fail", error: dbResult.reason?.message || "timeout" };
            checks.llm = { status: "unknown" };
          }
          checks.mcp = mcpResult.status === "fulfilled"
            ? mcpResult.value
            : { status: "fail", error: mcpResult.reason?.message || "timeout" };

          // Determine overall status
          const dbOk = (checks.database as { status: string }).status === "ok";
          const llmOk = (checks.llm as { status: string }).status === "ok";
          const mcpOk = (checks.mcp as { status: string }).status === "ok";
          const envOk = (checks.environment as { status: string }).status === "ok";

          let overallStatus: "healthy" | "degraded" | "unhealthy";
          if (dbOk && llmOk && mcpOk && envOk) overallStatus = "healthy";
          else if (!dbOk || !llmOk) overallStatus = "unhealthy";
          else overallStatus = "degraded";

          const healthResponse = JSON.stringify({
            status: overallStatus,
            timestamp: new Date().toISOString(),
            version: "1.0.0",
            checks,
            uptime: "edge_function",
          });

          controller.enqueue(encoder.encode(`data: ${healthResponse}\n\n`));
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

        // ── Follow-up Detection ──
        const followUp = detectFollowUp(userMessage, existingMessages);
        let category: "bookkeeper" | "cfo" | "general_chat";

        if (followUp.isFollowUp) {
          category = followUp.previousCategory || "bookkeeper";
          console.log(`[${reqId}] Follow-up detected → reusing category=${category}, tools=${followUp.previousToolsUsed?.join(",")}`);
        } else {
          category = classifyQuery(userMessage);
        }

        send("route_info", { path: category, category, conversationId, chatDisplayId });

        // ── LLM Config ──
        const { data: llmConfig, error: llmError } = await supabase
          .from("llm_configs").select("*").eq("is_default", true).single();
        if (llmError || !llmConfig?.api_key) {
          send("error", { message: "LLM not configured" });
          clearInterval(heartbeatInterval);
          controller.close(); return;
        }

        // ── Handle general chat after LLM config is loaded ──
        if (category === "general_chat" && !followUp.isFollowUp) {
          send("thinking", { phase: "responding", message: "Generating response..." });
          const systemPrompt = `You are Munimji — an AI assistant exclusively for HelloBooks, an accounting and bookkeeping platform. You ONLY help users with HelloBooks-related tasks.

SCOPE — You may ONLY assist with:
• Accounting & bookkeeping: chart of accounts, journal entries, transactions
• Invoicing & billing: invoices, bills, payments, credit notes
• Contacts: customers, vendors, employees
• Taxes: tax rates, tax groups, tax returns
• Banking: bank accounts, reconciliation, transfers
• Reporting: financial reports, dashboards, summaries

OFF-LIMITS — Politely decline anything outside HelloBooks:
If a user asks about general knowledge, coding help, math homework, creative writing, other software, or any topic unrelated to HelloBooks, respond: "I'm the Munimji and I can only help with HelloBooks accounting and bookkeeping tasks. Could I help you with something in HelloBooks instead?"
Do NOT answer off-topic questions even if you know the answer.

GREETING — Keep it short. Say hi, introduce yourself as the Munimji, and ask how you can help with their accounting or bookkeeping needs. Do NOT list your capabilities unless the user asks.
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

        // ── Cache check (skip for follow-ups / confirmations) ──
        if (!followUp.isFollowUp) {
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
        }

        // ── Connect to MCP (Streamable HTTP) ──
        const hAuth = req.headers.get("h-authorization") || req.headers.get("H-Authorization");
        let authToken = (hAuth?.startsWith("Bearer ") ? hAuth.replace("Bearer ", "").trim() : hAuth)
          || Deno.env.get("MCP_HELLOBOOKS_AUTH_TOKEN");
        while (authToken?.toLowerCase().startsWith("bearer ")) authToken = authToken.substring(7).trim();
        const orgId = body?.org_id || body?.orgId || Deno.env.get("MCP_HELLOBOOKS_ORG_ID");
        const mcpBaseUrl = Deno.env.get("MCP_BASE_URL") || "";

        let mcpTools: Array<{ name: string; description: string; inputSchema: unknown }> = [];

        if (authToken && resolvedEntityId && orgId && mcpBaseUrl) {
          send("thinking", { phase: "connecting", message: "Connecting to data source..." });
          try {
            const mcpResult = await createMCPClient(reqId, mcpBaseUrl, authToken, resolvedEntityId, orgId);
            if (mcpResult) {
              mcpClient = mcpResult.client;
              mcpTools = mcpResult.tools;
              console.log(`[${reqId}] MCP: ${mcpTools.length} tools loaded`);
            } else {
              console.error(`[${reqId}] MCP initialization failed`);
              send("thinking", { phase: "mcp_fallback", message: "Using AI knowledge base..." });
            }
          } catch (e) {
            console.error(`[${reqId}] MCP failed:`, e);
            send("thinking", { phase: "mcp_fallback", message: "Using AI knowledge base..." });
          }
        } else {
          console.warn(`[${reqId}] MCP skipped — missing auth/entity/org/url`);
        }

        // ── Select & build tools ──
        let selectedToolNames: string[];
        
        if (followUp.isFollowUp && followUp.previousToolsUsed && followUp.previousToolsUsed.length > 0) {
          // Reuse the exact tools from the previous turn
          selectedToolNames = followUp.previousToolsUsed;
          console.log(`[${reqId}] Follow-up: reusing ${selectedToolNames.length} tools from previous turn`);
        } else {
          selectedToolNames = selectTools(userMessage);
        }

        let filteredMcpTools = mcpTools.filter(t => selectedToolNames.includes(t.name));
        // Fallback: if keyword filtering yields no matches but MCP has tools, use all tools
        if (filteredMcpTools.length === 0 && mcpTools.length > 0) {
          filteredMcpTools = mcpTools;
        }
        const openAITools = filteredMcpTools
          .map(t => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: (t.inputSchema as Record<string, unknown>) || { type: "object", properties: {} } } }));

        send("thinking", { phase: "planning", message: `Selected ${openAITools.length} tools for your query`, toolCount: openAITools.length });

        // ── Agent loop ──
        const systemPrompt = getSystemPrompt(category, resolvedEntityId, chatDisplayId);

        // Build conversation context — for follow-ups, include more history so the LLM
        // can see the previously proposed action and the user's confirmation
        const historySliceCount = followUp.isFollowUp ? 20 : 10;
        const convHistory = existingMessages.slice(-historySliceCount).map(m => ({ role: m.role, content: m.content }));
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
              try { args = JSON.parse(tc.function.arguments); } catch (_e) { /* empty */ }

              // Always inject entity_id and org_id
              const toolSchema = mcpTools.find(t => t.name === toolName)?.inputSchema as { properties?: Record<string, unknown> } | undefined;
              if (toolSchema?.properties) {
                if ("entity_id" in toolSchema.properties && resolvedEntityId) args.entity_id = resolvedEntityId;
                if ("org_id" in toolSchema.properties && orgId) args.org_id = orgId;
              }

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
                  toolResults.push({ tool: toolName, success: false, data: String(e) });
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

        // Save to cache for non-write queries (skip for bookkeeper / follow-ups)
        if (category === "cfo" && !followUp.isFollowUp && finalResponse.length > 50) {
          const cacheKey = `munimji:${resolvedEntityId}:${btoa(userMessage).slice(0, 32)}`;
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
          implicit_signals: { iterationCount, isFollowUp: followUp.isFollowUp },
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
        controller_send("error", { message: getUserFacingErrorMessage(error) });
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
