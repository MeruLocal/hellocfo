import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MCPTool {
  name: string;
  description: string;
  inputSchema?: {
    properties?: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

interface BatchGenerationRequest {
  moduleId: string;
  moduleName: string;
  subModuleId: string;
  subModuleName: string;
  intentCount: number;
  existingIntentNames: string[];
  mcpTools?: MCPTool[];
  businessContext?: {
    industry?: string;
    country?: string;
    currency?: string;
    entitySize?: string;
  };
}

interface GeneratedIntent {
  name: string;
  description: string;
  trainingPhrases: string[];
  entities: Array<{
    name: string;
    type: string;
    required: boolean;
    defaultValue?: string;
    prompt?: string;
  }>;
  dataPipeline: Array<{
    nodeId: string;
    nodeType: string;
    sequence: number;
    mcpTool?: string;
    parameters: Array<{ name: string; value: string; source: string }>;
    formula?: string;
    outputVariable: string;
    description: string;
  }>;
  enrichments: Array<{
    id: string;
    type: string;
    config: Record<string, unknown>;
    description: string;
  }>;
  responseConfig: {
    type: string;
    template: string;
    followUpQuestions: string[];
  };
}

// Call Lovable AI Gateway
const callLovableAI = async (
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number = 120000
): Promise<string> => {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 8192,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("Rate limit exceeded. Please try again later.");
      }
      if (response.status === 402) {
        throw new Error("AI credits exhausted. Please add credits to continue.");
      }
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('AI request timed out');
    }
    throw error;
  }
};

// Parse JSON safely with repair attempts
const parseJSON = (text: string): unknown => {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch {
        // Continue
      }
    }
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {
        // Continue
      }
    }
    throw new Error('Failed to parse AI response as JSON');
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body: BatchGenerationRequest = await req.json();
    const { moduleId, moduleName, subModuleId, subModuleName, intentCount, existingIntentNames, mcpTools, businessContext } = body;

    console.log(`📋 Generating ${intentCount} intents for ${moduleName} / ${subModuleName}`);
    console.log(`📋 Existing intent names to avoid:`, existingIntentNames);

    const contextInfo = businessContext 
      ? `Business Context: ${businessContext.industry || 'General'} industry, ${businessContext.country || 'Global'}, ${businessContext.currency || 'USD'} currency, ${businessContext.entitySize || 'Mid-sized'} entity.`
      : '';

    const toolsDescription = mcpTools && mcpTools.length > 0
      ? mcpTools.map(tool => {
          const params = tool.inputSchema?.properties 
            ? Object.entries(tool.inputSchema.properties)
                .map(([name, schema]) => `${name}: ${schema.type}`)
                .join(', ')
            : 'no params';
          return `- ${tool.name}: ${tool.description} (${params})`;
        }).join('\n')
      : 'No MCP tools available';

    const existingNamesStr = existingIntentNames.length > 0
      ? `\n\nIMPORTANT: These intent names already exist - DO NOT generate duplicates:\n${existingIntentNames.map(n => `- ${n}`).join('\n')}`
      : '';

    const systemPrompt = `You are an expert CFO AI system architect specializing in designing intelligent financial query resolution flows.

Your role is to generate unique, practical intents for a CFO chatbot that handles complex financial queries.

${contextInfo}

CRITICAL RULES:
1. Output ONLY valid JSON - no explanations, no markdown code blocks
2. Generate EXACTLY the requested number of intents
3. Each intent must be UNIQUE and non-overlapping
4. Use EXACT tool names from the provided MCP tools list
5. Design practical, real-world CFO queries
6. Include diverse training phrases with entity placeholders like {{limit}}, {{period}}, {{vendor}}

Domain expertise areas:
- Cash Management: runway analysis, burn rate, liquidity ratios, cash flow forecasting
- Accounts Receivable: aging analysis, DSO, collection effectiveness, bad debt
- Accounts Payable: vendor payments, DPO, payment optimization
- Profitability: gross margins, EBITDA, contribution margins
- Working Capital: current ratio, quick ratio, cash conversion cycle
- Compliance: GST/VAT, TDS, tax provisions, regulatory reporting
- Project Costing: budget vs actual, cost overruns, resource utilization
- Inventory: turnover, carrying costs, stockout analysis`;

    const userPrompt = `Generate ${intentCount} unique CFO query intents for:
- Module: ${moduleName}
- Sub-Module: ${subModuleName}
${existingNamesStr}

AVAILABLE MCP TOOLS:
${toolsDescription}

For EACH intent, provide:
1. "name": A clear, descriptive intent name (e.g., "Top Vendor Spend Analysis", "Cash Runway Projection")
2. "description": Brief description of what this intent handles
3. "trainingPhrases": Array of 8-10 diverse training phrases with {{entity}} placeholders
4. "entities": Array of entities to extract (name, type, required, defaultValue, prompt)
5. "dataPipeline": Array of pipeline nodes using available MCP tools
6. "enrichments": Array of 2-4 enrichments (trend_analysis, ranking, percentage_of_total, recommendation, etc.)
7. "responseConfig": Response template with type, template, and 3 followUpQuestions

Entity types: project, vendor, customer, date, date_range, number, amount, percentage, period, enum, string

Output format - JSON array of ${intentCount} complete intent objects:
[
  {
    "name": "Intent Name",
    "description": "What this intent handles",
    "trainingPhrases": ["phrase 1", "phrase 2", ...],
    "entities": [{"name": "limit", "type": "number", "required": false, "defaultValue": "10"}],
    "dataPipeline": [...],
    "enrichments": [...],
    "responseConfig": {"type": "ranked_list", "template": "...", "followUpQuestions": [...]}
  }
]`;

    console.log('🤖 Calling Lovable AI for batch intent generation...');
    const aiResponse = await callLovableAI(systemPrompt, userPrompt);
    console.log('✅ AI response received');

    const generatedIntents = parseJSON(aiResponse) as GeneratedIntent[];

    if (!Array.isArray(generatedIntents)) {
      throw new Error('AI response was not an array of intents');
    }

    console.log(`✅ Parsed ${generatedIntents.length} intents from AI response`);

    // Filter out duplicates
    const existingNamesLower = new Set(existingIntentNames.map(n => n.toLowerCase().trim()));
    const uniqueIntents = generatedIntents.filter(intent => {
      const nameLower = intent.name?.toLowerCase().trim();
      if (!nameLower || existingNamesLower.has(nameLower)) {
        console.log(`⚠️ Skipping duplicate intent: ${intent.name}`);
        return false;
      }
      existingNamesLower.add(nameLower);
      return true;
    });

    console.log(`✅ ${uniqueIntents.length} unique intents after filtering duplicates`);

    // Validate and structure each intent
    const validatedIntents = uniqueIntents.map((intent, idx) => ({
      name: intent.name || `Intent ${idx + 1}`,
      description: intent.description || '',
      moduleId,
      subModuleId,
      trainingPhrases: Array.isArray(intent.trainingPhrases) ? intent.trainingPhrases : [],
      entities: Array.isArray(intent.entities) ? intent.entities.map(e => ({
        name: e.name || '',
        type: e.type || 'string',
        required: e.required || false,
        defaultValue: e.defaultValue,
        prompt: e.prompt
      })) : [],
      resolutionFlow: {
        dataPipeline: Array.isArray(intent.dataPipeline) ? intent.dataPipeline.map((node, nodeIdx) => ({
          nodeId: node.nodeId || `n${nodeIdx + 1}`,
          nodeType: node.nodeType || 'api_call',
          sequence: node.sequence || nodeIdx + 1,
          mcpTool: node.mcpTool,
          parameters: Array.isArray(node.parameters) ? node.parameters : [],
          formula: node.formula,
          outputVariable: node.outputVariable || `output${nodeIdx + 1}`,
          description: node.description || ''
        })) : [],
        enrichments: Array.isArray(intent.enrichments) ? intent.enrichments.map((e, eIdx) => ({
          id: e.id || `e${eIdx + 1}`,
          type: e.type || 'trend_analysis',
          config: e.config || {},
          description: e.description || ''
        })) : [],
        responseConfig: {
          type: intent.responseConfig?.type || 'metric_with_trend',
          template: intent.responseConfig?.template || '📊 Result: {data}',
          followUpQuestions: Array.isArray(intent.responseConfig?.followUpQuestions) 
            ? intent.responseConfig.followUpQuestions 
            : []
        }
      },
      isActive: true,
      generatedBy: 'ai',
      aiConfidence: 0.9
    }));

    return new Response(JSON.stringify({
      success: true,
      intents: validatedIntents,
      count: validatedIntents.length,
      message: `Successfully generated ${validatedIntents.length} unique intents`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Batch generation error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to generate intents'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
