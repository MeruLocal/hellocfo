import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  let conversationId = url.searchParams.get("conversationId");
  let userId = url.searchParams.get("userId");
  let entityId = url.searchParams.get("entityId");
  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");
  const limit = Math.min(Math.max(Number.parseInt(limitRaw || "100", 10) || 100, 1), 1000);
  const offset = Math.max(Number.parseInt(offsetRaw || "0", 10) || 0, 0);

  // Also support POST body
  if (req.method === "POST") {
    try {
      const body = await req.json();
      conversationId = conversationId || body.conversationId || null;
      userId = userId || body.userId || null;
      entityId = entityId || body.entityId || null;
    } catch { /* ignore */ }
  }

  try {
    // Detail mode: return full conversation
    if (conversationId) {
      let detailQuery = supabase
        .from("unified_conversations")
        .select("*")
        .eq("conversation_id", conversationId);

      if (userId) detailQuery = detailQuery.eq("user_id", userId);
      if (entityId) detailQuery = detailQuery.eq("entity_id", entityId);

      const { data, error } = await detailQuery.maybeSingle();

      if (error) throw error;
      if (!data) {
        return new Response(JSON.stringify({ error: "Conversation not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List mode: return summaries
    if (userId && entityId) {
      const { data, error } = await supabase
        .from("unified_conversations")
        .select("conversation_id, summary, message_count, created_at, updated_at")
        .eq("user_id", userId)
        .eq("entity_id", entityId)
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return new Response(JSON.stringify(data || []), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Provide conversationId or userId+entityId" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
