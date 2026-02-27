import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Azure OpenAI endpoint (same as cfo-agent-api)
const AZURE_ENDPOINT =
  "https://lovable-hellobooks-resource.cognitiveservices.azure.com/openai/v1/chat/completions";

// ── Types ──────────────────────────────────────────────────────────────

interface TestCase {
  id: number;
  category: string;
  subCategory: string;
  prompt: string;
  expectedBehavior: string;
}

// Map test-case categories → module IDs in the database
const CATEGORY_TO_MODULE: Record<string, string> = {
  Sales: "sales",
  Purchases: "purchases",
  Inventory: "inventory",
  GST: "gst",
  Taxes: "taxes",
  "Fixed Assets": "fixed_assets",
  "Expense Claims": "expense_claim",
  "Expense Claim": "expense_claim",
  Reports: "reports",
  "Accounting Masters": "accounting_masters",
  Accounting: "accounting_masters",
  "Eway Bills": "eway_bills",
  Drive: "drive",
  Comments: "comment",
  "Task Management": "task_management",
  Tasks: "task_management",
  "Your Workspace": "your_workspace",
};

// Map sub-category → sub-module IDs (best-effort)
const SUB_CATEGORY_TO_SUB_MODULE: Record<string, string> = {
  Revenue: "invoices",
  Invoices: "invoices",
  Orders: "sales_orders",
  Customers: "customers",
  Payments: "customer_advance",
  Returns: "invoice_credit_notes",
  Discounts: "invoices",
  Vendors: "vendors",
  Bills: "bills",
  "Stock Levels": "inventory",
  Reorder: "inventory",
  Valuation: "inventory",
  Movement: "inventory",
  Aging: "inventory",
  "GSTR-1": "gst_workspace",
  "Input Credit": "gst_workspace",
  ITC: "gst_workspace",
  "GSTR-3B": "gst_workspace",
  Reconciliation: "gst_reconciliation",
  Compliance: "gst_workspace",
  Filing: "gst_workspace",
  HSN: "hsn_sac_summary",
  TDS: "tds_report",
  TCS: "tcs_report",
  "Income Tax": "tds_report",
  "Professional Tax": "pf_report",
  Register: "fixed_assets",
  Depreciation: "fixed_assets",
  Additions: "fixed_assets",
  Disposal: "fixed_assets",
  CWIP: "fixed_assets",
  Pending: "expense_claim",
  Summary: "expense_claim",
  Approval: "expense_claim",
  Category: "expense_claim",
  Reimbursement: "expense_claim",
  Policy: "expense_claim",
  Travel: "expense_claim",
  "P&L": "financial_statements",
  "Cash Flow": "financial_statements",
  "Balance Sheet": "financial_statements",
  "Trial Balance": "financial_statements",
  Ratios: "all_reports",
  Ratio: "all_reports",
  Budget: "all_reports",
  Receivables: "aged_receivable",
  Payables: "aged_payables",
  Custom: "all_reports",
  Financial: "financial_statements",
  "Chart of Accounts": "chart_of_accounts",
  Ledger: "accounts_by_payee",
  Journal: "manual_journal_entries",
  "Cost Center": "tracking_options",
  "Period End": "manual_journal_entries",
  Generation: "eway_bills",
  Expiring: "eway_bills",
  Cancelled: "eway_bills",
  Transit: "eway_bills",
  Files: "drive",
  Storage: "drive",
  Shared: "drive",
  Access: "drive",
  Organization: "drive",
  Recent: "comment",
  Mentions: "comment",
  Activity: "comment",
  Threads: "comment",
  "My Tasks": "board",
  Overdue: "board",
  Team: "board",
  Completed: "board",
  Assignment: "board",
  Progress: "board",
  Deadlines: "backlogs",
  Dashboard: "banking",
  Notifications: "banking",
  Favorites: "banking",
  Settings: "banking",
  Alerts: "banking",
};

// ── Azure OpenAI helper ────────────────────────────────────────────────

async function callAzureOpenAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const res = await fetch(AZURE_ENDPOINT, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 4096,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Azure OpenAI error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ── Safe JSON parse ────────────────────────────────────────────────────

function safeParseJSON(text: string): unknown {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch (_e1) {
    // Try to extract JSON object
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch (_e2) {
        // fall through
      }
    }
    throw new Error("Failed to parse AI response as JSON");
  }
}

// ── Intent name from prompt ────────────────────────────────────────────

function promptToIntentName(prompt: string): string {
  // Convert prompt to PascalCase intent name
  return prompt
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("")
    .slice(0, 80);
}

// ── Build prompt for a batch of test cases ─────────────────────────────

function buildBatchPrompt(cases: TestCase[]): string {
  const caseList = cases
    .map(
      (tc) =>
        `- ID: ${tc.id} | Category: ${tc.category} | SubCategory: ${tc.subCategory}\n  Prompt: "${tc.prompt}"\n  Expected: "${tc.expectedBehavior}"`,
    )
    .join("\n\n");

  return `Generate complete intent configurations for these ${cases.length} CFO chatbot test cases.

TEST CASES:
${caseList}

For EACH test case, generate a JSON object with:
1. "caseId": The original test case ID number
2. "name": PascalCase intent name (e.g., "TopCustomersByRevenue")
3. "description": 2-3 sentence description of what this intent handles
4. "trainingPhrases": Array of 5-8 diverse training phrases with {{entity}} placeholders
5. "entities": Array of entities with fields: name, type (project|vendor|customer|date|date_range|number|amount|percentage|period|enum|string), required (boolean), defaultValue, prompt
6. "dataPipeline": Array of 2-3 pipeline nodes with: nodeId, nodeType (api_call|computation|filter|aggregation), sequence, mcpTool (use realistic tool names like get_all_invoices, get_bills, get_customers, get_vendors, get_items, get_journal_entries, get_bank_transactions, etc.), parameters (array of {name, value, source}), outputVariable, description
7. "enrichments": Array of 1-3 enrichments with: id, type (trend_analysis|ranking|percentage_of_total|recommendation|comparison|forecast|benchmark|alert_evaluation), config (object), description
8. "responseConfig": Object with: type (metric_with_trend|ranked_list|comparison_table|summary_card|chart_data), template (string with {variable} placeholders), followUpQuestions (array of 3 strings)

OUTPUT: A JSON array of objects. No markdown, no explanations.
[{"caseId": 1, "name": "...", ...}, ...]`;
}

// ── Main handler ───────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const testCases: TestCase[] = body.testCases || [];
    const batchSize = body.batchSize || 8;

    if (!testCases.length) {
      return new Response(
        JSON.stringify({ error: "No test cases provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get LLM config for API key
    const { data: llmConfig } = await supabase
      .from("llm_configs")
      .select("*")
      .eq("is_default", true)
      .maybeSingle();

    const apiKey = llmConfig?.api_key;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "No LLM API key configured. Please set up LLM Settings first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch existing intent names to skip duplicates
    const { data: existingIntents } = await supabase
      .from("intents")
      .select("name");
    const existingNames = new Set(
      (existingIntents || []).map((i: { name: string }) => i.name.toLowerCase()),
    );

    console.log(`[gen-cases] Processing ${testCases.length} test cases in batches of ${batchSize}`);
    console.log(`[gen-cases] ${existingNames.size} existing intents to skip`);

    const systemPrompt = `You are an expert CFO AI system architect. You design intelligent financial query resolution flows for a CFO chatbot. Output ONLY valid JSON arrays. No explanations. No markdown code blocks. Temperature 0.3 for consistent, high-quality results.`;

    const results: Array<{
      caseId: number;
      success: boolean;
      intentName?: string;
      error?: string;
      skipped?: boolean;
    }> = [];

    let created = 0;
    let skipped = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < testCases.length; i += batchSize) {
      const batch = testCases.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(testCases.length / batchSize);

      console.log(`[gen-cases] Batch ${batchNum}/${totalBatches}: cases ${batch[0].id}-${batch[batch.length - 1].id}`);

      try {
        const userPrompt = buildBatchPrompt(batch);
        const aiResponse = await callAzureOpenAI(apiKey, systemPrompt, userPrompt);
        const parsed = safeParseJSON(aiResponse) as Array<Record<string, unknown>>;

        if (!Array.isArray(parsed)) {
          console.error(`[gen-cases] Batch ${batchNum}: AI response not an array`);
          batch.forEach((tc) => {
            results.push({ caseId: tc.id, success: false, error: "AI response not an array" });
            failed++;
          });
          continue;
        }

        // Process each generated intent
        for (const gen of parsed) {
          const caseId = gen.caseId as number;
          const intentName = (gen.name as string) || promptToIntentName(batch.find((tc) => tc.id === caseId)?.prompt || "");
          const tc = batch.find((b) => b.id === caseId);

          if (!tc) {
            results.push({ caseId: caseId || 0, success: false, error: "Case ID mismatch" });
            failed++;
            continue;
          }

          // Check for duplicates
          if (existingNames.has(intentName.toLowerCase())) {
            results.push({ caseId, success: true, intentName, skipped: true });
            skipped++;
            continue;
          }

          const moduleId = CATEGORY_TO_MODULE[tc.category] || "reports";
          const subModuleId = SUB_CATEGORY_TO_SUB_MODULE[tc.subCategory] || "";

          // Build intent record
          const intentRecord = {
            name: intentName,
            description: (gen.description as string) || tc.expectedBehavior,
            module_id: moduleId,
            sub_module_id: subModuleId,
            training_phrases: Array.isArray(gen.trainingPhrases)
              ? gen.trainingPhrases
              : [tc.prompt],
            entities: Array.isArray(gen.entities) ? gen.entities : [],
            resolution_flow: {
              dataPipeline: Array.isArray(gen.dataPipeline) ? gen.dataPipeline : [],
              enrichments: Array.isArray(gen.enrichments) ? gen.enrichments : [],
              responseConfig: gen.responseConfig || {
                type: "summary_card",
                template: `📊 ${intentName}:\n\n{data}`,
                followUpQuestions: [],
              },
            },
            is_active: true,
            generated_by: "ai",
            ai_confidence: 0.85,
          };

          const { error: insertError } = await supabase
            .from("intents")
            .insert(intentRecord);

          if (insertError) {
            // Handle unique constraint violation as a skip (duplicate)
            if (insertError.code === '23505' || insertError.message?.includes('duplicate') || insertError.message?.includes('unique')) {
              console.log(`[gen-cases] Skipped duplicate intent: ${intentName}`);
              results.push({ caseId, success: true, intentName, skipped: true });
              skipped++;
            } else {
              console.error(`[gen-cases] Insert error for ${intentName}:`, insertError.message);
              results.push({ caseId, success: false, intentName, error: insertError.message });
              failed++;
            }
          } else {
            existingNames.add(intentName.toLowerCase());
            results.push({ caseId, success: true, intentName });
            created++;
          }
        }

        // Handle cases not returned by AI
        for (const tc of batch) {
          if (!results.some((r) => r.caseId === tc.id)) {
            results.push({ caseId: tc.id, success: false, error: "Not generated by AI" });
            failed++;
          }
        }
      } catch (batchErr) {
        console.error(`[gen-cases] Batch ${batchNum} error:`, batchErr);
        batch.forEach((tc) => {
          if (!results.some((r) => r.caseId === tc.id)) {
            results.push({
              caseId: tc.id,
              success: false,
              error: batchErr instanceof Error ? batchErr.message : "Batch failed",
            });
            failed++;
          }
        });
      }

      // Small delay between batches to avoid rate limits
      if (i + batchSize < testCases.length) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    console.log(`[gen-cases] Done: ${created} created, ${skipped} skipped, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: { total: testCases.length, created, skipped, failed },
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[gen-cases] Fatal error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
