import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new Response(JSON.stringify({ error: "No audio file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate size (25MB — Azure OpenAI limit)
    if (file.size > 25 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "Audio file exceeds 25MB limit" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate audio MIME type
    const allowedTypes = [
      "audio/webm", "audio/ogg", "audio/mp3", "audio/mpeg",
      "audio/mp4", "audio/m4a", "audio/wav", "audio/x-wav",
      "audio/flac", "audio/x-flac", "video/webm",
    ];
    if (!allowedTypes.includes(file.type) && !file.type.startsWith("audio/")) {
      return new Response(JSON.stringify({ error: `Unsupported audio type: ${file.type}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read Azure STT credentials from Deno env (set via supabase secrets set)
    const azureEndpoint = Deno.env.get("AZURE_STT_ENDPOINT");
    const azureApiKey = Deno.env.get("AZURE_STT_API_KEY");

    if (!azureEndpoint || !azureApiKey) {
      console.error("[audio-transcribe] AZURE_STT_ENDPOINT or AZURE_STT_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Speech-to-text service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Forward to Azure OpenAI gpt-4o-mini-transcribe
    const azureForm = new FormData();
    azureForm.append("file", file, file.name || "recording.webm");
    azureForm.append("model", "gpt-4o-mini-transcribe");

    console.log(`[audio-transcribe] Sending ${file.size} bytes (${file.type}) to Azure STT`);

    const azureRes = await fetch(azureEndpoint, {
      method: "POST",
      headers: { "api-key": azureApiKey },
      body: azureForm,
    });

    if (!azureRes.ok) {
      const errText = await azureRes.text();
      console.error(`[audio-transcribe] Azure STT error ${azureRes.status}: ${errText}`);
      return new Response(JSON.stringify({ error: "Transcription failed", details: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await azureRes.json();
    const text = result.text || "";

    console.log(`[audio-transcribe] Transcribed ${text.length} chars`);

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[audio-transcribe] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
