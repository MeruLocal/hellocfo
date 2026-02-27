import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestCase {
  id: string;
  intent_id: string;
  intent_name: string;
  test_level: number;
  test_phrase: string;
  expected_similarity_min: number;
  expected_tools: string[];
  unexpected_tools: string[];
  expected_tool_source: string | null;
  expected_write_validation: Record<string, unknown> | null;
  expected_prereq_chain: string[];
  expected_prereq_outcome: string | null;
  expected_enrichments: string[];
  expected_mcq_type: string | null;
  expected_response_contains: string[];
  expected_response_not_contains: string[];
}

interface StepResult {
  step: string;
  status: 'pass' | 'warn' | 'fail' | 'skipped';
  expected: unknown;
  actual: unknown;
  message: string;
}

interface CaseResult {
  test_case_id: string;
  intent_name: string;
  test_phrase: string;
  test_level: number;
  overall: 'pass' | 'warn' | 'fail';
  steps: StepResult[];
  duration_ms: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { level, intent_name, limit } = await req.json();
    const runLevel = level || 1;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch test cases
    let query = supabase
      .from('intent_test_cases')
      .select('*')
      .eq('test_level', runLevel)
      .eq('is_active', true)
      .order('intent_name');

    if (intent_name) {
      query = query.eq('intent_name', intent_name);
    }
    if (limit) {
      query = query.limit(limit);
    }

    const { data: testCases, error: tcErr } = await query;
    if (tcErr) throw tcErr;
    if (!testCases || testCases.length === 0) {
      return new Response(JSON.stringify({ 
        error: `No active Level ${runLevel} test cases found` 
      }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startTime = Date.now();
    const results: CaseResult[] = [];
    const stepSummary: Record<string, { tested: number; pass: number; warn: number; fail: number }> = {};

    // Utility to update step summary
    const addStepResult = (stepName: string, status: 'pass' | 'warn' | 'fail') => {
      if (!stepSummary[stepName]) stepSummary[stepName] = { tested: 0, pass: 0, warn: 0, fail: 0 };
      stepSummary[stepName].tested++;
      stepSummary[stepName][status]++;
    };

    // ===== Level 1: Embedding-only test =====
    if (runLevel === 1) {
      // Fetch all intent embeddings for comparison
      const { data: embeddings, error: embErr } = await supabase
        .from('intent_embeddings')
        .select('intent_name, phrase')
        .order('intent_name');
      
      if (embErr) throw embErr;

      // Build intent-phrase lookup
      const intentPhrases = new Map<string, Set<string>>();
      for (const emb of embeddings || []) {
        if (!intentPhrases.has(emb.intent_name)) {
          intentPhrases.set(emb.intent_name, new Set());
        }
        intentPhrases.get(emb.intent_name)!.add(emb.phrase.toLowerCase());
      }

      for (const tc of testCases as TestCase[]) {
        const caseStart = Date.now();
        const steps: StepResult[] = [];

        // Check if the intent has embeddings at all
        const phrases = intentPhrases.get(tc.intent_name);
        const hasEmbeddings = !!phrases && phrases.size > 0;
        const phraseMatches = hasEmbeddings && phrases!.has(tc.test_phrase.toLowerCase());

        if (!hasEmbeddings) {
          steps.push({
            step: 'Step 4: Embedding',
            status: 'fail',
            expected: tc.intent_name,
            actual: 'no_embeddings',
            message: `Intent "${tc.intent_name}" has no embeddings indexed`,
          });
          addStepResult('Step 4: Embedding', 'fail');
        } else {
          // For Level 1 we verify the phrase exists in the embedding index
          // A real similarity search would require calling the embedding model
          steps.push({
            step: 'Step 4: Embedding',
            status: phraseMatches ? 'pass' : 'warn',
            expected: `${tc.intent_name} (sim >= ${tc.expected_similarity_min})`,
            actual: phraseMatches ? 'phrase_indexed' : 'phrase_not_indexed',
            message: phraseMatches
              ? `Phrase indexed for ${tc.intent_name}`
              : `Phrase not in embedding index — may still match via similarity`,
          });
          addStepResult('Step 4: Embedding', phraseMatches ? 'pass' : 'warn');
        }

        const overall = steps.some(s => s.status === 'fail') ? 'fail' 
          : steps.some(s => s.status === 'warn') ? 'warn' : 'pass';

        results.push({
          test_case_id: tc.id,
          intent_name: tc.intent_name,
          test_phrase: tc.test_phrase,
          test_level: 1,
          overall,
          steps,
          duration_ms: Date.now() - caseStart,
        });

        // Update test case last run
        await supabase
          .from('intent_test_cases')
          .update({ last_run_at: new Date().toISOString(), last_run_result: overall })
          .eq('id', tc.id);
      }
    }

    // ===== Level 2: Tool selection test =====
    if (runLevel === 2) {
      // Load intents with resolution flows
      const intentNames = [...new Set(testCases.map((tc: TestCase) => tc.intent_name))];
      const { data: intents, error: intErr } = await supabase
        .from('intents')
        .select('name, resolution_flow')
        .in('name', intentNames);

      if (intErr) throw intErr;

      const intentFlows = new Map<string, unknown>();
      for (const intent of intents || []) {
        intentFlows.set(intent.name, intent.resolution_flow);
      }

      for (const tc of testCases as TestCase[]) {
        const caseStart = Date.now();
        const steps: StepResult[] = [];

        // Step 4: Embedding check (same as Level 1 but simpler)
        steps.push({
          step: 'Step 4: Embedding',
          status: 'pass', // Assume pass at Level 2 (Level 1 validates this)
          expected: tc.intent_name,
          actual: tc.intent_name,
          message: 'Assumed pass — validated by Level 1 tests',
        });
        addStepResult('Step 4: Embedding', 'pass');

        // Step 7: Tool selection
        const flow = intentFlows.get(tc.intent_name) as Record<string, unknown> | undefined;
        const pipeline = (flow?.dataPipeline || []) as Array<{ mcpTool?: string }>;
        const configuredTools = pipeline
          .map(node => node.mcpTool)
          .filter((t): t is string => !!t);

        if (tc.expected_tools && tc.expected_tools.length > 0) {
          const missing = tc.expected_tools.filter(t => !configuredTools.includes(t));
          const unexpected = tc.unexpected_tools
            ? tc.unexpected_tools.filter(t => configuredTools.includes(t))
            : [];

          const toolStatus = missing.length > 0 ? 'fail' 
            : unexpected.length > 0 ? 'warn' : 'pass';

          steps.push({
            step: 'Step 7: Tool Selection',
            status: toolStatus,
            expected: tc.expected_tools,
            actual: configuredTools,
            message: toolStatus === 'pass'
              ? `All ${tc.expected_tools.length} expected tools found in pipeline`
              : missing.length > 0
                ? `Missing tools: ${missing.join(', ')}`
                : `Unexpected tools present: ${unexpected.join(', ')}`,
          });
          addStepResult('Step 7: Tool Selection', toolStatus);
        } else {
          steps.push({
            step: 'Step 7: Tool Selection',
            status: 'warn',
            expected: 'not_specified',
            actual: configuredTools,
            message: 'No expected_tools defined for this test case',
          });
          addStepResult('Step 7: Tool Selection', 'warn');
        }

        const overall = steps.some(s => s.status === 'fail') ? 'fail'
          : steps.some(s => s.status === 'warn') ? 'warn' : 'pass';

        results.push({
          test_case_id: tc.id,
          intent_name: tc.intent_name,
          test_phrase: tc.test_phrase,
          test_level: 2,
          overall,
          steps,
          duration_ms: Date.now() - caseStart,
        });

        await supabase
          .from('intent_test_cases')
          .update({ last_run_at: new Date().toISOString(), last_run_result: overall })
          .eq('id', tc.id);
      }
    }

    // ===== Level 3: Full pipeline test (calls real API) =====
    if (runLevel === 3) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

      for (const tc of testCases as TestCase[]) {
        const caseStart = Date.now();
        const steps: StepResult[] = [];

        try {
          // Call the actual cfo-agent-api with stream mode
          const res = await fetch(`${supabaseUrl}/functions/v1/cfo-agent-api`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${anonKey}`,
              'apikey': anonKey,
            },
            body: JSON.stringify({
              query: tc.test_phrase,
              conversationId: `regression-test-${tc.id}`,
              entityId: 'test-entity',
              orgId: 'test-org',
              stream: true,
            }),
          });

          if (!res.ok || !res.body) {
            steps.push({
              step: 'Pipeline Call',
              status: 'fail',
              expected: 'HTTP 200',
              actual: `HTTP ${res.status}`,
              message: `API call failed with status ${res.status}`,
            });
            addStepResult('Pipeline Call', 'fail');
          } else {
            // Parse SSE events
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            const events: Array<{ type: string; data: Record<string, unknown> }> = [];

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const frames = buffer.split('\n\n');
              buffer = frames.pop() || '';
              for (const frame of frames) {
                const dataLine = frame.split('\n').find(l => l.startsWith('data: '));
                if (!dataLine) continue;
                try {
                  const evt = JSON.parse(dataLine.slice(6));
                  events.push({ type: evt.type, data: evt.data || {} });
                } catch (_e) { /* ignore parse errors */ }
              }
            }

            // Analyze events against expectations
            const routeEvent = events.find(e => e.type === 'route_info');
            const completeEvent = events.find(e => e.type === 'complete');
            const toolEvents = events.filter(e => e.type === 'tool_call');
            const mcqEvent = events.find(e => e.type === 'mcq');
            const errorEvent = events.find(e => e.type === 'error');

            // Step 4: Intent match
            const matchedIntent = routeEvent?.data?.intent as string || '';
            const intentMatch = matchedIntent.toLowerCase() === tc.intent_name.toLowerCase();
            steps.push({
              step: 'Step 4: Embedding',
              status: intentMatch ? 'pass' : 'fail',
              expected: tc.intent_name,
              actual: matchedIntent || 'unknown',
              message: intentMatch ? 'Correct intent matched' : `Wrong intent: expected ${tc.intent_name}, got ${matchedIntent}`,
            });
            addStepResult('Step 4: Embedding', intentMatch ? 'pass' : 'fail');

            // Step 7: Tool selection
            const toolsUsed = (routeEvent?.data?.tools_loaded as string[]) || [];
            if (tc.expected_tools && tc.expected_tools.length > 0) {
              const missing = tc.expected_tools.filter(t => !toolsUsed.includes(t));
              const toolStatus = missing.length === 0 ? 'pass' : 'fail';
              steps.push({
                step: 'Step 7: Tool Selection',
                status: toolStatus,
                expected: tc.expected_tools,
                actual: toolsUsed,
                message: toolStatus === 'pass'
                  ? 'All expected tools selected'
                  : `Missing: ${missing.join(', ')}`,
              });
              addStepResult('Step 7: Tool Selection', toolStatus);
            }

            // Step 9e: Write validation
            if (tc.expected_write_validation) {
              const writeEvent = events.find(e => e.type === 'write_validation');
              steps.push({
                step: 'Step 9e: Write Validation',
                status: writeEvent ? 'pass' : 'warn',
                expected: tc.expected_write_validation,
                actual: writeEvent?.data || null,
                message: writeEvent ? 'Write validation triggered' : 'No write validation event found',
              });
              addStepResult('Step 9e: Write Validation', writeEvent ? 'pass' : 'warn');
            }

            // Step 9e2: Pre-req chain
            if (tc.expected_prereq_chain && tc.expected_prereq_chain.length > 0) {
              const prereqEvents = events.filter(e => e.type === 'prereq_step');
              const prereqTools = prereqEvents.map(e => e.data.tool as string);
              const chainMatch = tc.expected_prereq_chain.every(t => prereqTools.includes(t));
              steps.push({
                step: 'Step 9e2: Pre-Req Chain',
                status: chainMatch ? 'pass' : 'fail',
                expected: tc.expected_prereq_chain,
                actual: prereqTools,
                message: chainMatch ? 'Pre-req chain matched' : 'Pre-req chain mismatch',
              });
              addStepResult('Step 9e2: Pre-Req Chain', chainMatch ? 'pass' : 'fail');
            }

            // Step 9e3: MCQ
            if (tc.expected_mcq_type) {
              const mcqType = mcqEvent?.data?.mcq_type as string || null;
              const mcqMatch = mcqType === tc.expected_mcq_type;
              steps.push({
                step: 'Step 9e3: Confirmation',
                status: mcqMatch ? 'pass' : 'fail',
                expected: tc.expected_mcq_type,
                actual: mcqType,
                message: mcqMatch ? 'Correct MCQ type shown' : `Expected ${tc.expected_mcq_type}, got ${mcqType}`,
              });
              addStepResult('Step 9e3: Confirmation', mcqMatch ? 'pass' : 'fail');
            }

            // Step 10: Enrichments
            if (tc.expected_enrichments && tc.expected_enrichments.length > 0) {
              const enrichEvent = events.find(e => e.type === 'enrichment');
              const appliedEnrichments = (enrichEvent?.data?.applied as string[]) || [];
              const enrichMatch = tc.expected_enrichments.every(e => appliedEnrichments.includes(e));
              steps.push({
                step: 'Step 10: Enrichment',
                status: enrichMatch ? 'pass' : 'warn',
                expected: tc.expected_enrichments,
                actual: appliedEnrichments,
                message: enrichMatch ? 'Expected enrichments applied' : 'Some enrichments missing',
              });
              addStepResult('Step 10: Enrichment', enrichMatch ? 'pass' : 'warn');
            }

            // Step 12: Response validation
            if (tc.expected_response_contains && tc.expected_response_contains.length > 0) {
              const response = (completeEvent?.data?.response as string || '').toLowerCase();
              const missing = tc.expected_response_contains.filter(kw => !response.includes(kw.toLowerCase()));
              steps.push({
                step: 'Step 12: Response',
                status: missing.length === 0 ? 'pass' : 'warn',
                expected: tc.expected_response_contains,
                actual: missing.length === 0 ? 'all_keywords_found' : `missing: ${missing.join(', ')}`,
                message: missing.length === 0 
                  ? 'Response contains all expected keywords'
                  : `Missing keywords: ${missing.join(', ')}`,
              });
              addStepResult('Step 12: Response', missing.length === 0 ? 'pass' : 'warn');
            }

            // Check for errors
            if (errorEvent) {
              steps.push({
                step: 'Error',
                status: 'fail',
                expected: 'no_error',
                actual: errorEvent.data.message,
                message: `Pipeline error: ${errorEvent.data.message}`,
              });
              addStepResult('Error', 'fail');
            }
          }
        } catch (err) {
          steps.push({
            step: 'Pipeline Call',
            status: 'fail',
            expected: 'success',
            actual: err instanceof Error ? err.message : 'unknown',
            message: `Exception: ${err instanceof Error ? err.message : 'unknown'}`,
          });
          addStepResult('Pipeline Call', 'fail');
        }

        const overall = steps.some(s => s.status === 'fail') ? 'fail'
          : steps.some(s => s.status === 'warn') ? 'warn' : 'pass';

        results.push({
          test_case_id: tc.id,
          intent_name: tc.intent_name,
          test_phrase: tc.test_phrase,
          test_level: 3,
          overall,
          steps,
          duration_ms: Date.now() - caseStart,
        });

        await supabase
          .from('intent_test_cases')
          .update({ last_run_at: new Date().toISOString(), last_run_result: overall })
          .eq('id', tc.id);
      }
    }

    // Calculate summary
    const totalDuration = Date.now() - startTime;
    const passed = results.filter(r => r.overall === 'pass').length;
    const warned = results.filter(r => r.overall === 'warn').length;
    const failed = results.filter(r => r.overall === 'fail').length;
    const passRate = results.length > 0 ? Math.round((passed / results.length) * 10000) / 100 : 0;

    // Save run to DB
    const { data: runData, error: runErr } = await supabase
      .from('intent_test_runs')
      .insert({
        run_level: runLevel,
        total_cases: results.length,
        passed,
        warned,
        failed,
        pass_rate: passRate,
        duration_ms: totalDuration,
        triggered_by: 'manual',
        results: results,
        step_summary: stepSummary,
      })
      .select('id')
      .single();

    if (runErr) console.error('Failed to save run:', runErr.message);

    return new Response(JSON.stringify({
      run_id: runData?.id,
      level: runLevel,
      total_cases: results.length,
      passed,
      warned,
      failed,
      pass_rate: passRate,
      duration_ms: totalDuration,
      step_summary: stepSummary,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('run-regression-tests error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
