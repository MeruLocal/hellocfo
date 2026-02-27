import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HELLOBOOKS_BASE = "https://devapi.hellobooks.ai";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, email, password, token } = body;
    console.log(`[hellobooks-proxy] action=${action}`);

    if (action === "login") {
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "Email and password required" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[hellobooks-proxy] Calling ${HELLOBOOKS_BASE}/auth/login`);
      const res = await fetch(`${HELLOBOOKS_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      console.log(`[hellobooks-proxy] login status=${res.status}, hasToken=${!!data.token}`);

      // Always return 200 so supabase.functions.invoke doesn't throw
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "getallusers") {
      if (!token) {
        return new Response(JSON.stringify({ error: "Token required" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[hellobooks-proxy] Calling ${HELLOBOOKS_BASE}/user/getallusers`);
      const res = await fetch(`${HELLOBOOKS_BASE}/user/getallusers`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const text = await res.text();
      console.log(`[hellobooks-proxy] getallusers status=${res.status}, body=${text.substring(0, 500)}`);

      // Always return 200
      return new Response(text, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[hellobooks-proxy] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
