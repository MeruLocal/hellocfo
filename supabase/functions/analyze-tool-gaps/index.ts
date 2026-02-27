import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tools } = await req.json();
    if (!Array.isArray(tools)) {
      return new Response(JSON.stringify({ error: 'tools must be an array of tool names' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Azure OpenAI GPT-5.2 secrets
    const apiKey = Deno.env.get("OPENAI_GPT_5_2_API_KEY");
    let baseUrl = (Deno.env.get("OPENAI_GPT_5_2_BASE_URL") || "").trim();
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_GPT_5_2_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // URL normalization (same as generate-intent)
    if (baseUrl.startsWith("ttps://")) baseUrl = `h${baseUrl}`;
    if (baseUrl && !baseUrl.startsWith("http")) baseUrl = `https://${baseUrl}`;
    const endpoint = baseUrl
      ? (baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`)
      : "https://api.openai.com/v1/chat/completions";

    const toolList = tools.join(', ');

    const systemPrompt = `You are an expert accounting systems architect. Analyze the provided list of MCP (Model Context Protocol) tools available in a CFO AI agent and identify GAPS — tools that are MISSING but should exist based on:

1. Generally Accepted Accounting Principles (GAAP) and IFRS requirements
2. Standard accounting software capabilities (Tally Prime, QuickBooks, Xero, Zoho Books, SAP Business One, FreshBooks)
3. Complete financial operations lifecycle

ACCOUNTING MODULES TO CHECK AGAINST:
- Accounts Receivable (AR): Invoicing, credit notes, customer statements, aging, collections, receipts
- Accounts Payable (AP): Bills, vendor payments, debit notes, vendor aging, payment scheduling
- General Ledger (GL): Journal entries, chart of accounts, trial balance, ledger reports
- Banking & Reconciliation: Bank feeds, reconciliation, fund transfers, bank statements
- Inventory Management: Stock tracking, valuation (FIFO/LIFO/weighted avg), stock transfers, BOM
- Payroll: Salary processing, payslips, statutory deductions (PF, ESI, PT), payroll reports
- Tax & GST/VAT: Tax computation, return filing, input credit, TDS/TCS, tax audit
- Fixed Assets: Asset register, depreciation (SLM/WDV), disposal, revaluation, impairment
- Budgeting & Forecasting: Budget creation, variance analysis, rolling forecasts, scenario planning
- Audit Trail: Change logs, document history, approval workflows, access logs
- Multi-Currency: Exchange rates, forex gain/loss, revaluation, multi-currency reports
- Financial Reporting: P&L, Balance Sheet, Cash Flow Statement, ratio analysis, MIS reports
- Cost Centers & Profit Centers: Allocation, tracking, center-wise P&L
- Purchase Orders & Sales Orders: Order management, fulfillment tracking, order-to-cash cycle
- Expense Management: Claims, approvals, policy enforcement, reimbursements
- Compliance & Regulatory: Statutory reports, filing deadlines, compliance checklists

For each gap found, categorize by priority:
- critical: Core accounting functions that any business MUST have (GL, AR, AP, Tax)
- recommended: Important for operational efficiency (Payroll, Fixed Assets, Budgeting)
- nice-to-have: Advanced features for mature organizations (Audit Trail, Multi-Currency advanced)

IMPORTANT: Only report genuinely MISSING capabilities. If a tool already covers a function (even under a different name), do NOT list it as missing.`;

    const userPrompt = `Here are the ${tools.length} MCP tools currently available in our CFO AI agent:

${toolList}

Analyze these tools against standard accounting software capabilities and GAAP/IFRS requirements. Identify what's MISSING and group by accounting category. Use the report_gaps function to return your analysis.`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        model: 'gpt-5.2',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'report_gaps',
            description: 'Report missing tool gaps grouped by accounting category',
            parameters: {
              type: 'object',
              properties: {
                categories: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      category: { type: 'string', description: 'Accounting module name e.g. Fixed Assets' },
                      priority: { type: 'string', enum: ['critical', 'recommended', 'nice-to-have'] },
                      missingTools: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string', description: 'Suggested tool name in snake_case' },
                            description: { type: 'string', description: 'What the tool does' },
                            rationale: { type: 'string', description: 'Why this tool is needed' },
                          },
                          required: ['name', 'description', 'rationale'],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ['category', 'priority', 'missingTools'],
                    additionalProperties: false,
                  },
                },
                summary: { type: 'string', description: 'Brief overall assessment' },
              },
              required: ['categories', 'summary'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'report_gaps' } },
        temperature: 0.3,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Azure OpenAI error:', response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required. Please check your Azure OpenAI subscription.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: `AI error: ${response.status}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await response.json();
    
    // Extract tool call arguments
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: 'No structured response from AI' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const gaps = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(gaps), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('analyze-tool-gaps error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
