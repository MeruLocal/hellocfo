import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const entityId = formData.get("entity_id") as string || "default";
    const conversationId = formData.get("conversation_id") as string || "";

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate file size (20MB)
    if (file.size > 20 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "File exceeds 20MB limit" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Allowed MIME types
    const allowedTypes = [
      "image/jpeg", "image/png", "image/webp", "image/gif",
      "application/pdf", "text/csv", "text/plain",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!allowedTypes.includes(file.type)) {
      return new Response(JSON.stringify({ error: `File type '${file.type}' not supported` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate unique file path
    const fileId = crypto.randomUUID();
    const ext = file.name.split(".").pop() || "bin";
    const filePath = `${entityId}/${conversationId || "general"}/${fileId}.${ext}`;

    // Upload to storage
    const arrayBuffer = await file.arrayBuffer();
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("chat-attachments")
      .upload(filePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Upload failed", details: uploadError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate signed URL (valid 1 hour) for preview
    const { data: signedData } = await supabase.storage
      .from("chat-attachments")
      .createSignedUrl(filePath, 3600);

    // Determine file category for agent context
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    const isCsv = file.type === "text/csv" || file.name.endsWith(".csv");
    const isExcel = file.type.includes("spreadsheet") || file.type.includes("excel") || file.name.match(/\.xlsx?$/);

    let fileCategory = "document";
    if (isImage) fileCategory = "image";
    else if (isCsv || isExcel) fileCategory = "spreadsheet";
    else if (isPdf) fileCategory = "pdf";

    return new Response(
      JSON.stringify({
        file_id: fileId,
        file_name: file.name,
        file_type: file.type,
        file_category: fileCategory,
        file_size: file.size,
        storage_path: uploadData?.path || filePath,
        preview_url: signedData?.signedUrl || null,
        entity_id: entityId,
        conversation_id: conversationId,
        // Suggested agent message based on file type
        suggested_message: isImage
          ? `Process this receipt/document image`
          : isCsv || isExcel
          ? `Process this bank statement or spreadsheet`
          : `Process this ${fileCategory}`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("upload-attachment error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
