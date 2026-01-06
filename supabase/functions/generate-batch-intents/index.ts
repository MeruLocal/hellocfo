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
  console.log('📝 Raw AI response length:', text.length);
  console.log('📝 First 500 chars:', text.substring(0, 500));
  
  let cleaned = text.trim();
  
  // Remove markdown code blocks
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  // First attempt: direct parse
  try {
    return JSON.parse(cleaned);
  } catch (e1) {
    console.log('📝 Direct parse failed, trying extraction...');
    
    // Find the outermost array brackets
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      const arrayStr = cleaned.substring(firstBracket, lastBracket + 1);
      try {
        return JSON.parse(arrayStr);
      } catch (e2) {
        console.log('📝 Array extraction failed, trying to fix common issues...');
        
        // Try to fix common JSON issues
        let fixedStr = arrayStr
          .replace(/,\s*}/g, '}')  // Remove trailing commas in objects
          .replace(/,\s*\]/g, ']') // Remove trailing commas in arrays
          .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3') // Quote unquoted keys
          .replace(/:\s*'([^']*)'/g, ': "$1"'); // Convert single quotes to double
        
        try {
          return JSON.parse(fixedStr);
        } catch (e3) {
          console.log('📝 Fixed parse failed:', (e3 as Error).message);
        }
      }
    }
    
    // Try to find any valid JSON array
    const arrayMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch {
        // Continue
      }
    }
    
    console.error('📝 All parse attempts failed. Response preview:', cleaned.substring(0, 1000));
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
7. EVERY pipeline step MUST have complete information - no empty or placeholder values

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

For EACH intent, you MUST provide ALL of these with COMPLETE information:

1. "name": A clear, descriptive PascalCase intent name (e.g., "TopVendorSpendAnalysis", "CashRunwayProjection")

2. "description": Detailed description (2-3 sentences) of what this intent handles and its business value

3. "trainingPhrases": Array of 8-10 diverse training phrases with {{entity}} placeholders. Examples:
   - "Show me {{entity}} for {{period}}"
   - "What are the top {{limit}} {{items}} by {{metric}}"

4. "entities": Array of entities with ALL fields:
   - "name": entity variable name (e.g., "limit", "period", "vendor")
   - "type": one of [project, vendor, customer, date, date_range, number, amount, percentage, period, enum, string]
   - "required": boolean
   - "defaultValue": sensible default value as string
   - "prompt": question to ask user if entity is missing (e.g., "How many results would you like to see?")

5. "dataPipeline": Array of 2-4 pipeline nodes. EACH node MUST have:
   - "nodeId": unique id like "n1", "n2", "n3"
   - "nodeType": one of ["api_call", "calculation", "filter", "aggregation", "transformation"]
   - "sequence": number starting from 1
   - "mcpTool": exact tool name from AVAILABLE MCP TOOLS (if nodeType is api_call)
   - "parameters": array of {"name": "param_name", "value": "{{entity_name}} or static_value", "source": "entity|static|previous_node"}
   - "formula": calculation formula if nodeType is calculation (e.g., "sum(amount) / count(*)")
   - "outputVariable": variable name to store result (e.g., "vendorData", "totalAmount")
   - "description": what this step does (e.g., "Fetch vendor payment data from accounting system")

6. "enrichments": Array of 2-4 enrichments. EACH enrichment MUST have:
   - "id": unique id like "e1", "e2"
   - "type": one of ["trend_analysis", "ranking", "percentage_of_total", "recommendation", "comparison", "forecast", "benchmark"]
   - "config": object with type-specific config:
     * trend_analysis: {"periods": 6, "metric": "amount"}
     * ranking: {"by": "field_name", "order": "desc", "limit": 10}
     * percentage_of_total: {"value": "field_name", "total": "total_field"}
     * recommendation: {"threshold": 0.1, "metric": "field_name"}
   - "description": what insight this provides (e.g., "Analyze spending trend over past 6 months")

7. "responseConfig": Complete response configuration:
   - "type": one of ["metric_with_trend", "ranked_list", "comparison_table", "summary_card", "chart_data"]
   - "template": full response template with {variable} placeholders, e.g., "📊 Top {limit} vendors by spend:\\n{vendorList}\\n\\n💡 Total: {totalAmount}"
   - "followUpQuestions": array of 3 relevant follow-up questions users might ask

OUTPUT ONLY the JSON array - no explanations:
[
  {
    "name": "IntentName",
    "description": "Full description...",
    "trainingPhrases": ["phrase 1", "phrase 2", ...],
    "entities": [{"name": "...", "type": "...", "required": true/false, "defaultValue": "...", "prompt": "..."}],
    "dataPipeline": [{"nodeId": "n1", "nodeType": "api_call", "sequence": 1, "mcpTool": "tool_name", "parameters": [...], "outputVariable": "...", "description": "..."}],
    "enrichments": [{"id": "e1", "type": "trend_analysis", "config": {...}, "description": "..."}],
    "responseConfig": {"type": "ranked_list", "template": "...", "followUpQuestions": ["...", "...", "..."]}
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

    // Validate and structure each intent with complete information
    const validatedIntents = uniqueIntents.map((intent, idx) => ({
      name: intent.name || `Intent${idx + 1}`,
      description: intent.description || `Auto-generated intent for ${subModuleName}`,
      moduleId,
      subModuleId,
      trainingPhrases: Array.isArray(intent.trainingPhrases) && intent.trainingPhrases.length > 0 
        ? intent.trainingPhrases 
        : [`What is the ${intent.name}?`, `Show me ${intent.name}`, `Tell me about ${intent.name}`],
      entities: Array.isArray(intent.entities) ? intent.entities.map((e, eIdx) => ({
        name: e.name || `entity${eIdx + 1}`,
        type: e.type || 'string',
        required: typeof e.required === 'boolean' ? e.required : false,
        defaultValue: e.defaultValue || '',
        prompt: e.prompt || `Please provide the ${e.name || 'value'}`
      })) : [],
      resolutionFlow: {
        dataPipeline: Array.isArray(intent.dataPipeline) && intent.dataPipeline.length > 0 
          ? intent.dataPipeline.map((node, nodeIdx) => ({
              nodeId: node.nodeId || `n${nodeIdx + 1}`,
              nodeType: node.nodeType || 'api_call',
              sequence: typeof node.sequence === 'number' ? node.sequence : nodeIdx + 1,
              mcpTool: node.mcpTool || null,
              parameters: Array.isArray(node.parameters) ? node.parameters.map(p => ({
                name: p.name || '',
                value: p.value || '',
                source: p.source || 'static'
              })) : [],
              formula: node.formula || null,
              outputVariable: node.outputVariable || `result${nodeIdx + 1}`,
              description: node.description || `Step ${nodeIdx + 1}: ${node.nodeType || 'Process data'}`
            }))
          : [{
              nodeId: 'n1',
              nodeType: 'api_call',
              sequence: 1,
              mcpTool: mcpTools?.[0]?.name || null,
              parameters: [],
              formula: null,
              outputVariable: 'result1',
              description: 'Fetch data from source'
            }],
        enrichments: Array.isArray(intent.enrichments) && intent.enrichments.length > 0
          ? intent.enrichments.map((e, eIdx) => ({
              id: e.id || `e${eIdx + 1}`,
              type: e.type || 'trend_analysis',
              config: e.config && typeof e.config === 'object' ? e.config : {},
              description: e.description || `${e.type || 'Enrichment'} analysis`
            }))
          : [{
              id: 'e1',
              type: 'trend_analysis',
              config: { periods: 6, metric: 'amount' },
              description: 'Analyze trends over time'
            }],
        responseConfig: {
          type: intent.responseConfig?.type || 'metric_with_trend',
          template: intent.responseConfig?.template || `📊 ${intent.name || 'Result'}:\n\n{data}\n\n💡 Analysis complete.`,
          followUpQuestions: Array.isArray(intent.responseConfig?.followUpQuestions) && intent.responseConfig.followUpQuestions.length > 0
            ? intent.responseConfig.followUpQuestions 
            : [
                `Would you like more details on this ${subModuleName}?`,
                `Should I compare this with the previous period?`,
                `Would you like to export this data?`
              ]
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
