import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { intents } = await req.json();

    if (!intents || !Array.isArray(intents)) {
      return new Response(JSON.stringify({ error: "intents array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let inserted = 0;
    let updated = 0;
    let errors: string[] = [];

    for (const intent of intents) {
      try {
        // Extract entities from training phrases ({{entityName}} patterns)
        const entitySet = new Set<string>();
        (intent.training_phrases || []).forEach((phrase: string) => {
          const matches = phrase.match(/\{\{(\w+)\}\}/g);
          if (matches) {
            matches.forEach((m: string) => entitySet.add(m.replace(/\{\{|\}\}/g, '')));
          }
        });

        const entities = Array.from(entitySet).map(name => ({
          name,
          type: "string",
          required: false,
        }));

        // Check if intent already exists by name
        const { data: existing } = await supabase
          .from("intents")
          .select("id")
          .eq("name", intent.name)
          .maybeSingle();

        const intentData = {
          name: intent.name,
          module_id: intent.module,
          sub_module_id: intent.sub_module || null,
          description: intent.description || "",
          is_active: intent.is_active !== false,
          training_phrases: intent.training_phrases || [],
          entities: entities,
          generated_by: "batch_import",
        };

        if (existing) {
          // Update existing
          const { error } = await supabase
            .from("intents")
            .update({
              ...intentData,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);

          if (error) {
            errors.push(`Update ${intent.name}: ${error.message}`);
          } else {
            updated++;
          }
        } else {
          // Insert new
          const { error } = await supabase
            .from("intents")
            .insert(intentData);

          if (error) {
            errors.push(`Insert ${intent.name}: ${error.message}`);
          } else {
            inserted++;
          }
        }
      } catch (e) {
        errors.push(`${intent.name}: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        inserted,
        updated,
        total: intents.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
