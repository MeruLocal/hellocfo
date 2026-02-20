import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildHtml(conversation: {
  chat_display_id: string;
  chat_name?: string;
  entity_id: string;
  created_at: string;
  updated_at: string;
  messages: Array<{ role: string; content: string; timestamp?: string; metadata?: Record<string, unknown> }>;
}): string {
  const title = conversation.chat_name || conversation.chat_display_id || "Chat Export";
  const exportDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  const messagesHtml = (conversation.messages || []).map(msg => {
    const isUser = msg.role === "user";
    const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "";
    const content = escapeHtml(msg.content || "").replace(/\n/g, "<br/>");
    
    return `
      <div class="message ${isUser ? "user-message" : "agent-message"}">
        <div class="message-header">
          <strong>${isUser ? "You" : "Munimji"}</strong>
          ${time ? `<span class="timestamp">${time}</span>` : ""}
        </div>
        <div class="message-body">${content}</div>
      </div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; color: #1a1a1a; }
    .container { max-width: 800px; margin: 0 auto; background: white; min-height: 100vh; }
    .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; padding: 32px; }
    .header h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .header .meta { font-size: 13px; opacity: 0.7; display: flex; gap: 16px; flex-wrap: wrap; margin-top: 12px; }
    .header .badge { background: rgba(255,255,255,0.15); padding: 3px 10px; border-radius: 12px; font-size: 12px; }
    .messages { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
    .message { max-width: 85%; padding: 12px 16px; border-radius: 12px; page-break-inside: avoid; }
    .user-message { align-self: flex-end; background: #e8f0fe; border: 1px solid #c5d8fc; margin-left: auto; }
    .agent-message { align-self: flex-start; background: #f8f9fa; border: 1px solid #e0e0e0; }
    .message-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .message-header strong { font-size: 12px; font-weight: 600; color: #444; text-transform: uppercase; letter-spacing: 0.5px; }
    .timestamp { font-size: 11px; color: #999; }
    .message-body { font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
    .footer { text-align: center; padding: 24px; font-size: 12px; color: #999; border-top: 1px solid #eee; }
    @media print {
      body { background: white; }
      .container { max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge" style="display:inline-block;margin-bottom:12px;">${escapeHtml(conversation.chat_display_id || "")}</div>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">
        <span>📅 Exported: ${exportDate}</span>
        <span>💬 ${(conversation.messages || []).length} messages</span>
        <span>🏢 Entity: ${escapeHtml(conversation.entity_id || "")}</span>
      </div>
    </div>
    <div class="messages">
      ${messagesHtml || '<p style="color:#999;text-align:center;padding:40px">No messages in this conversation</p>'}
    </div>
    <div class="footer">
      Exported from Munimji AI · ${exportDate}
    </div>
  </div>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { conversation_id } = await req.json();

    if (!conversation_id) {
      return new Response(JSON.stringify({ error: "conversation_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch conversation
    const { data: conversation, error } = await supabase
      .from("unified_conversations")
      .select("*")
      .eq("conversation_id", conversation_id)
      .single();

    if (error || !conversation) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build HTML
    const html = buildHtml({
      chat_display_id: conversation.chat_display_id || conversation.conversation_id,
      chat_name: conversation.chat_name || conversation.summary,
      entity_id: conversation.entity_id,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      messages: (conversation.messages as Array<{ role: string; content: string; timestamp?: string; metadata?: Record<string, unknown> }>) || [],
    });

    // Upload HTML to storage as a downloadable file
    const fileName = [
      conversation.chat_display_id?.replace("#", "MJ"),
      (conversation.chat_name || "chat").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30),
      new Date().toISOString().split("T")[0],
    ].filter(Boolean).join("_") + ".html";

    const storagePath = `exports/${conversation.entity_id}/${fileName}`;
    const htmlBytes = new TextEncoder().encode(html);

    const { error: uploadError } = await supabase.storage
      .from("chat-attachments")
      .upload(storagePath, htmlBytes, {
        contentType: "text/html",
        upsert: true,
      });

    if (uploadError) {
      console.error("Export upload error:", uploadError);
      // Fallback: return HTML directly
      return new Response(html, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/html",
          "Content-Disposition": `attachment; filename="${fileName}"`,
        },
      });
    }

    // Generate signed download URL (24 hours)
    const { data: signedData, error: signedError } = await supabase.storage
      .from("chat-attachments")
      .createSignedUrl(storagePath, 86400);

    if (signedError || !signedData?.signedUrl) {
      // Fallback: return HTML directly
      return new Response(html, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/html",
          "Content-Disposition": `attachment; filename="${fileName}"`,
        },
      });
    }

    return new Response(
      JSON.stringify({
        download_url: signedData.signedUrl,
        file_name: fileName,
        expires_in: 86400,
        conversation_id,
        chat_display_id: conversation.chat_display_id,
        message_count: (conversation.messages as unknown[])?.length || 0,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("export-chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Export failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
