import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { intentName, description, trainingPhrases, entities, currentPipeline, availableTools } = await req.json();
    const apiKey = Deno.env.get("OPENAI_GPT_5_2_API_KEY");
    let baseUrl = (Deno.env.get("OPENAI_GPT_5_2_BASE_URL") || "").trim();
    if (!apiKey) throw new Error("OPENAI_GPT_5_2_API_KEY not configured");

    // URL normalization
    if (baseUrl.startsWith("ttps://")) baseUrl = `h${baseUrl}`;
    if (baseUrl && !baseUrl.startsWith("http")) baseUrl = `https://${baseUrl}`;
    const endpoint = baseUrl
      ? (baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`)
      : "https://api.openai.com/v1/chat/completions";

    const toolList = (availableTools || []).join(", ");
    const currentSteps = (currentPipeline || [])
      .map((n: any, i: number) => `${i + 1}. [${n.nodeType}] ${n.mcpTool || n.formula || n.condition || ""} → ${n.outputVariable}`)
      .join("\n");

    const systemPrompt = `You are an elite financial AI architect. Your job is to design the IDEAL data pipeline for a financial chatbot intent.

You must think from 5 financial personas and ensure the pipeline serves ALL of them at a world-class level:
1. **Bookkeeper** – Needs granular transactional data, journal entries, reconciliation
2. **Accountant** – Needs compliance checks, tax calculations, period comparisons
3. **CFO** – Needs KPIs, trend analysis, forecasting, cash flow projections
4. **Business Owner** – Needs simple summaries, alerts, actionable insights
5. **Financial Adviser** – Needs benchmarking, ratio analysis, risk assessment

AVAILABLE MCP TOOLS (only use these for api_call nodes):
${toolList || "No tools provided"}

CURRENT PIPELINE (may be incomplete or suboptimal):
${currentSteps || "Empty - no steps yet"}

Design the most comprehensive pipeline by:
- Adding prerequisite data fetches that the current pipeline misses
- Including computation nodes for KPIs, ratios, trends
- Adding conditional nodes for threshold-based alerts
- Ensuring each persona's needs are addressed
- Flagging tools that are needed but NOT in the available list

Return your analysis using the suggest_pipeline tool.`;

    const userPrompt = `Design the ideal data pipeline for this intent:

**Intent:** ${intentName}
**Description:** ${description || "Not provided"}
**Training Phrases:** ${(trainingPhrases || []).slice(0, 10).join("; ")}
**Entities:** ${JSON.stringify(entities || {})}

Provide a comprehensive pipeline that would make this the best-in-class financial chatbot for this intent.`;

    // Retry wrapper with exponential backoff for rate limits
    const fetchWithRetry = async (url: string, options: RequestInit, retries = 3): Promise<Response> => {
      for (let attempt = 0; attempt < retries; attempt++) {
        const res = await fetch(url, options);
        if (res.status === 429 && attempt < retries - 1) {
          const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
          const delay = retryAfter > 0 ? retryAfter * 1000 : Math.pow(2, attempt + 1) * 2000;
          console.log(`Rate limited (429), retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return res;
      }
      // Should not reach here, but just in case
      return fetch(url, options);
    };

    const response = await fetchWithRetry(endpoint, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_pipeline",
              description: "Return the suggested ideal pipeline with persona analysis",
              parameters: {
                type: "object",
                properties: {
                  summary: {
                    type: "string",
                    description: "Brief analysis of what the current pipeline lacks and how this suggestion improves it",
                  },
                  personaRelevance: {
                    type: "object",
                    properties: {
                      bookkeeper: { type: "number", description: "Relevance score 0-100" },
                      accountant: { type: "number", description: "Relevance score 0-100" },
                      cfo: { type: "number", description: "Relevance score 0-100" },
                      businessOwner: { type: "number", description: "Relevance score 0-100" },
                      financialAdviser: { type: "number", description: "Relevance score 0-100" },
                    },
                    required: ["bookkeeper", "accountant", "cfo", "businessOwner", "financialAdviser"],
                    additionalProperties: false,
                  },
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        nodeType: { type: "string", enum: ["api_call", "computation", "conditional"] },
                        mcpTool: { type: "string", description: "Tool name (only for api_call)" },
                        outputVariable: { type: "string" },
                        description: { type: "string" },
                        formula: { type: "string", description: "Only for computation nodes" },
                        condition: { type: "string", description: "Only for conditional nodes" },
                        personas: {
                          type: "array",
                          items: { type: "string", enum: ["bookkeeper", "accountant", "cfo", "businessOwner", "financialAdviser"] },
                          description: "Which personas benefit from this step",
                        },
                        toolAvailable: { type: "boolean", description: "Is the tool in the available list?" },
                        fallbackSuggestion: { type: "string", description: "If tool not available, suggest alternative" },
                      },
                      required: ["nodeType", "outputVariable", "description", "personas"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["summary", "personaRelevance", "steps"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_pipeline" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-ideal-pipeline error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
