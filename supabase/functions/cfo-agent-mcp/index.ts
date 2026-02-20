/**
 * CFO Agent — MCP Server
 *
 * Exposes the Munimji CFO Agent as a Model Context Protocol (MCP) server.
 * External clients (Claude Desktop, Cursor, n8n, etc.) can connect to:
 *
 *   https://ptftkblnvsybcggbecau.supabase.co/functions/v1/cfo-agent-mcp
 *
 * Protocol: Streamable HTTP (MCP 2025-03-26)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, mcp-session-id, h-authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
};

// ─── MCP JSON-RPC types ────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ─── MCP Tool definitions ──────────────────────────────────────────────────

const MCP_TOOLS = [
  {
    name: "query_cfo_agent",
    description:
      "Ask the Munimji CFO Agent a financial question. It fetches live data from HelloBooks (invoices, bills, payments, aging reports, P&L, cash flow, GST, etc.) and returns a structured answer. Supports queries in English and Hindi.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The financial question or command. Examples: 'Show outstanding invoices', 'What is my cash flow this month?', 'List overdue customers', 'Show GST summary for Q3'",
        },
        entity_id: {
          type: "string",
          description:
            "HelloBooks entity ID to scope the query. Defaults to the server-configured entity.",
        },
        org_id: {
          type: "string",
          description: "HelloBooks organisation ID. Defaults to server-configured org.",
        },
        conversation_id: {
          type: "string",
          description:
            "Optional: pass a conversation UUID to maintain multi-turn context across calls.",
        },
        mcp_auth_token: {
          type: "string",
          description:
            "Optional: HelloBooks MCP auth token. If not provided, falls back to server-side secret.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_conversation_history",
    description:
      "Retrieve recent conversation history for an entity. Returns a list of past chats with preview of the last message.",
    inputSchema: {
      type: "object",
      properties: {
        entity_id: {
          type: "string",
          description: "HelloBooks entity ID to fetch conversations for.",
        },
        limit: {
          type: "number",
          description: "Max number of conversations to return (default: 10, max: 50).",
        },
      },
      required: ["entity_id"],
    },
  },
  {
    name: "get_quick_suggestions",
    description:
      "Get contextual quick-start query suggestions for an entity (most common financial queries).",
    inputSchema: {
      type: "object",
      properties: {
        entity_id: {
          type: "string",
          description: "Optional entity ID to get entity-specific suggestions.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_conversation_messages",
    description:
      "Load all messages from a specific conversation by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        conversation_id: {
          type: "string",
          description: "The conversation UUID.",
        },
      },
      required: ["conversation_id"],
    },
  },
];

// ─── Tool Implementations ─────────────────────────────────────────────────

async function toolQueryCFOAgent(params: Record<string, unknown>): Promise<string> {
  const {
    query,
    entity_id,
    org_id,
    conversation_id = crypto.randomUUID(),
    mcp_auth_token,
  } = params as {
    query: string;
    entity_id?: string;
    org_id?: string;
    conversation_id?: string;
    mcp_auth_token?: string;
  };

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Build headers for munimji-agent
  const headers: Record<string, string> = {
    "apikey": anonKey,
    "Authorization": `Bearer ${anonKey}`,
    "Content-Type": "application/json",
  };

  if (mcp_auth_token) {
    headers["h-authorization"] = `Bearer ${mcp_auth_token}`;
  }

  const body = {
    message: query,
    conversation_id,
    entity_id: entity_id || Deno.env.get("MCP_HELLOBOOKS_ENTITY_ID"),
    org_id: org_id || Deno.env.get("MCP_HELLOBOOKS_ORG_ID"),
    user_id: "mcp-client",
  };

  // Call munimji-agent and collect SSE stream
  const response = await fetch(`${supabaseUrl}/functions/v1/munimji-agent`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Agent call failed: HTTP ${response.status}`);
  }

  // Parse SSE stream and extract final response
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResponse = "";
  let chatDisplayId = "";
  let path = "";
  const toolsUsed: string[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "response") finalResponse = event.data?.text || finalResponse;
          if (event.type === "token" && !finalResponse) finalResponse += (event.data?.text || "");
          if (event.type === "done") {
            chatDisplayId = event.data?.chatDisplayId || "";
            path = event.data?.path || "";
            if (event.data?.toolsUsed) {
              for (const t of event.data.toolsUsed) toolsUsed.push(t.tool);
            }
          }
          if (event.type === "error") throw new Error(event.data?.message || "Agent error");
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
  } finally {
    reader.cancel();
  }

  if (!finalResponse) throw new Error("No response received from CFO agent");

  // Return structured result
  const meta = [
    chatDisplayId ? `Chat: ${chatDisplayId}` : null,
    path ? `Mode: ${path}` : null,
    toolsUsed.length > 0 ? `Tools used: ${toolsUsed.join(", ")}` : null,
    `Conversation ID: ${conversation_id}`,
  ].filter(Boolean).join(" | ");

  return `${finalResponse}\n\n---\n_${meta}_`;
}

async function toolGetConversationHistory(params: Record<string, unknown>): Promise<string> {
  const { entity_id, limit = 10 } = params as { entity_id: string; limit?: number };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data, error } = await supabase
    .from("unified_conversations")
    .select("conversation_id, chat_display_id, chat_name, mode, message_count, updated_at, last_message_preview")
    .eq("entity_id", entity_id)
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false })
    .limit(Math.min(Number(limit), 50));

  if (error) throw new Error(`DB error: ${error.message}`);
  if (!data || data.length === 0) return "No conversations found for this entity.";

  const rows = data.map((c) =>
    `• ${c.chat_display_id || c.conversation_id} — ${c.chat_name || "Unnamed"} (${c.message_count || 0} msgs, ${new Date(c.updated_at).toLocaleDateString("en-IN")})\n  Preview: ${c.last_message_preview || "—"}`
  );

  return `**Recent Conversations (${data.length}):**\n\n${rows.join("\n\n")}`;
}

async function toolGetQuickSuggestions(params: Record<string, unknown>): Promise<string> {
  const { entity_id } = params as { entity_id?: string };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let query = supabase
    .from("quick_suggestions")
    .select("label, message, icon")
    .eq("is_active", true)
    .order("sort_order");

  if (entity_id) {
    query = query.or(`entity_id.eq.${entity_id},entity_id.is.null`);
  } else {
    query = query.is("entity_id", null);
  }

  const { data, error } = await query;
  if (error) throw new Error(`DB error: ${error.message}`);
  if (!data || data.length === 0) return "No suggestions available.";

  const rows = data.map((s) => `${s.icon || "💡"} **${s.label}** → _"${s.message}"_`);
  return `**Quick Suggestions:**\n\n${rows.join("\n")}`;
}

async function toolGetConversationMessages(params: Record<string, unknown>): Promise<string> {
  const { conversation_id } = params as { conversation_id: string };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data, error } = await supabase
    .from("unified_conversations")
    .select("chat_display_id, chat_name, messages, message_count")
    .eq("conversation_id", conversation_id)
    .single();

  if (error || !data) throw new Error("Conversation not found");

  const messages = (data.messages as Array<{ role: string; content: string; timestamp?: string }>) || [];
  if (messages.length === 0) return "This conversation has no messages yet.";

  const formatted = messages.map((m) => {
    const prefix = m.role === "user" ? "**You:**" : "**Munimji:**";
    const time = m.timestamp ? ` _(${new Date(m.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })})_` : "";
    return `${prefix}${time}\n${m.content}`;
  });

  return `**${data.chat_display_id || conversation_id} — ${data.chat_name || "Conversation"}** (${messages.length} messages)\n\n---\n\n${formatted.join("\n\n---\n\n")}`;
}

// ─── MCP Request Handler ───────────────────────────────────────────────────

async function handleMCPRequest(rpc: JsonRpcRequest): Promise<JsonRpcResponse> {
  const id = rpc.id ?? null;

  try {
    switch (rpc.method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2025-03-26",
            capabilities: { tools: {}, resources: {} },
            serverInfo: {
              name: "munimji-cfo-agent",
              version: "1.0.0",
              description: "Munimji AI — CFO Agent for Indian businesses using HelloBooks",
            },
          },
        };

      case "notifications/initialized":
        return { jsonrpc: "2.0", id: null, result: {} };

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: { tools: MCP_TOOLS },
        };

      case "tools/call": {
        const { name, arguments: args = {} } = rpc.params as { name: string; arguments?: Record<string, unknown> };

        let content = "";
        switch (name) {
          case "query_cfo_agent":
            content = await toolQueryCFOAgent(args);
            break;
          case "get_conversation_history":
            content = await toolGetConversationHistory(args);
            break;
          case "get_quick_suggestions":
            content = await toolGetQuickSuggestions(args);
            break;
          case "get_conversation_messages":
            content = await toolGetConversationMessages(args);
            break;
          default:
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32601, message: `Tool '${name}' not found` },
            };
        }

        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: content }],
          },
        };
      }

      case "resources/list":
        return { jsonrpc: "2.0", id, result: { resources: [] } };

      case "prompts/list":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            prompts: [
              {
                name: "financial_summary",
                description: "Get a complete financial health summary for an entity",
                arguments: [{ name: "entity_id", description: "HelloBooks entity ID", required: false }],
              },
            ],
          },
        };

      case "prompts/get": {
        const { name } = rpc.params as { name: string };
        if (name === "financial_summary") {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              description: "Complete financial health summary",
              messages: [
                {
                  role: "user",
                  content: {
                    type: "text",
                    text: "Give me a complete financial health summary: outstanding invoices, overdue payments, cash flow this month, and top 5 customers by revenue.",
                  },
                },
              ],
            },
          };
        }
        return { jsonrpc: "2.0", id, error: { code: -32601, message: "Prompt not found" } };
      }

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method '${rpc.method}' not found` },
        };
    }
  } catch (e) {
    console.error("MCP tool error:", e);
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: e instanceof Error ? e.message : "Internal error",
      },
    };
  }
}

// ─── HTTP Server ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // GET — Server discovery / health check
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        name: "munimji-cfo-agent",
        version: "1.0.0",
        protocol: "MCP 2025-03-26",
        description: "Munimji AI — CFO Agent MCP Server for HelloBooks",
        tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description })),
        endpoint: "https://ptftkblnvsybcggbecau.supabase.co/functions/v1/cfo-agent-mcp",
        documentation: "https://ptftkblnvsybcggbecau.supabase.co/functions/v1/cfo-agent-mcp",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json() as JsonRpcRequest | JsonRpcRequest[];

    // Handle batch requests
    if (Array.isArray(body)) {
      const results = await Promise.all(body.map(handleMCPRequest));
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await handleMCPRequest(body);

    // Notifications don't need a response body
    if (body.method?.startsWith("notifications/")) {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("MCP server error:", e);
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error", data: String(e) },
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
