import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { action, maxPerIntent } = await req.json();

    if (action !== 'seed_level1') {
      return new Response(JSON.stringify({ error: 'Invalid action. Use seed_level1' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch all active intents with training phrases
    const { data: intents, error: intErr } = await supabase
      .from('intents')
      .select('id, name, training_phrases')
      .eq('is_active', true)
      .order('name');

    if (intErr) throw intErr;
    if (!intents || intents.length === 0) {
      return new Response(JSON.stringify({ error: 'No active intents found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check existing test cases to avoid duplicates
    const { data: existing, error: exErr } = await supabase
      .from('intent_test_cases')
      .select('intent_name, test_phrase')
      .eq('test_level', 1);

    if (exErr) throw exErr;

    const existingSet = new Set(
      (existing || []).map(e => `${e.intent_name}::${e.test_phrase}`)
    );

    const limit = maxPerIntent || 3;
    const toInsert: Array<{
      intent_id: string;
      intent_name: string;
      test_level: number;
      test_phrase: string;
      expected_similarity_min: number;
    }> = [];

    for (const intent of intents) {
      let phrases: string[] = [];
      
      // Parse training_phrases (could be JSON array or array of objects)
      if (Array.isArray(intent.training_phrases)) {
        phrases = intent.training_phrases
          .map((p: unknown) => {
            if (typeof p === 'string') return p;
            if (p && typeof p === 'object' && 'text' in (p as Record<string, unknown>)) return String((p as Record<string, unknown>).text);
            return null;
          })
          .filter((p: string | null): p is string => !!p && p.length > 5);
      }

      if (phrases.length === 0) continue;

      // Pick diverse phrases: first, middle, last (up to limit)
      const selected: string[] = [];
      if (phrases.length <= limit) {
        selected.push(...phrases);
      } else {
        // Pick evenly spaced phrases for diversity
        const step = Math.floor(phrases.length / limit);
        for (let i = 0; i < limit; i++) {
          selected.push(phrases[Math.min(i * step, phrases.length - 1)]);
        }
      }

      for (const phrase of selected) {
        const key = `${intent.name}::${phrase}`;
        if (existingSet.has(key)) continue;
        
        toInsert.push({
          intent_id: intent.id,
          intent_name: intent.name,
          test_level: 1,
          test_phrase: phrase,
          expected_similarity_min: 0.850,
        });
      }
    }

    if (toInsert.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No new test cases to seed — all already exist',
        intents_scanned: intents.length,
        new_cases: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Batch insert in chunks of 500
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500);
      const { error: insErr } = await supabase
        .from('intent_test_cases')
        .insert(chunk);
      if (insErr) {
        console.error('Insert error at chunk', i, insErr.message);
        throw insErr;
      }
      inserted += chunk.length;
    }

    return new Response(JSON.stringify({
      message: `Seeded ${inserted} Level 1 test cases`,
      intents_scanned: intents.length,
      new_cases: inserted,
      skipped_existing: existingSet.size,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('seed-test-cases error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
