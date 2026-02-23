import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  let conversationId = normalizeOptionalString(url.searchParams.get("conversationId"));
  let userId = normalizeOptionalString(url.searchParams.get("userId"));
  let entityId = normalizeOptionalString(url.searchParams.get("entityId"));
  let limitRaw = url.searchParams.get("limit");
  let offsetRaw = url.searchParams.get("offset");

  // Also support POST body
  if (req.method === "POST") {
    try {
      const body = await req.json() as Record<string, unknown>;
      conversationId = conversationId || normalizeOptionalString(body.conversationId);
      userId = userId || normalizeOptionalString(body.userId);
      entityId = entityId || normalizeOptionalString(body.entityId);

      if (!limitRaw && body.limit !== undefined && body.limit !== null) {
        limitRaw = String(body.limit);
      }
      if (!offsetRaw && body.offset !== undefined && body.offset !== null) {
        offsetRaw = String(body.offset);
      }
    } catch {
      // ignore invalid/empty POST body and rely on query params
    }
  }

  const limit = parseBoundedInt(limitRaw, 100, 1, 1000);
  const offset = parseBoundedInt(offsetRaw, 0, 0, Number.MAX_SAFE_INTEGER);

  try {
    // Prefer authenticated user ID when available; keep userId fallback for service-style callers.
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.replace("Bearer ", "").trim()
      : null;

    let authUserId: string | null = null;
    if (bearerToken) {
      const { data: authData, error: authError } = await supabase.auth.getUser(bearerToken);
      if (!authError && authData?.user?.id) {
        authUserId = authData.user.id;
      }
    }

    if (authUserId && userId && userId !== authUserId) {
      return new Response(JSON.stringify({ error: "userId does not match authenticated user" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const effectiveUserId = authUserId || userId;

    // Detail mode: return full conversation
    if (conversationId) {
      let detailQuery = supabase
        .from("unified_conversations")
        .select("*")
        .eq("conversation_id", conversationId)
        .or("is_deleted.is.null,is_deleted.eq.false")
        .order("updated_at", { ascending: false })
        .limit(1);

      if (effectiveUserId) detailQuery = detailQuery.eq("user_id", effectiveUserId);
      if (entityId) detailQuery = detailQuery.eq("entity_id", entityId);

      const { data, error } = await detailQuery;
      if (error) throw error;

      const detail = data?.[0] || null;
      if (!detail) {
        return new Response(JSON.stringify({ error: "Conversation not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(detail), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List mode: return summaries
    if (effectiveUserId) {
      let listQuery = supabase
        .from("unified_conversations")
        .select("conversation_id, summary, message_count, created_at, updated_at, chat_name, auto_generated_name, mode, last_message_preview")
        .eq("user_id", effectiveUserId)
        .or("is_deleted.is.null,is_deleted.eq.false")
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (entityId) listQuery = listQuery.eq("entity_id", entityId);

      const { data, error } = await listQuery;
      if (error) throw error;

      return new Response(JSON.stringify(data || []), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Provide conversationId, or userId (entityId optional)" }), {
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
