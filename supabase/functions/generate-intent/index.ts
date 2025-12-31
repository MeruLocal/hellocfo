import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerationRequest {
  intentName: string;
  moduleName: string;
  subModuleName: string;
  description?: string;
  section?: 'training' | 'entities' | 'pipeline' | 'enrichments' | 'response' | 'all';
  existingPhrases?: string[];
  phraseCount?: number;
  existingEntities?: any[];
  existingPipeline?: any[];
  existingEnrichments?: any[];
}

const getSystemPrompt = () => `You are an expert CFO AI assistant helping to configure a query resolution system for financial chatbots.

You will be asked to generate various components for intent configurations:
- Training phrases: Natural language queries users might ask
- Entities: Parameters to extract from queries
- Data pipelines: Steps to fetch and compute data
- Enrichments: Intelligence functions to apply
- Response templates: How to format the final response

Always respond with valid JSON matching the exact schema requested. Do not include any explanation or markdown - only the JSON.

Domain expertise areas:
- Cash management (runway, flow, liquidity)
- Receivables (AR aging, collections, DSO)
- Payables (AP aging, vendor payments, DPO)
- Profitability (margins, EBITDA)
- Compliance (GST, TDS, VAT)
- Project costing
- Inventory management
- Executive reporting`;

const generateTrainingPhrasesPrompt = (
  intentName: string,
  module: string,
  subModule: string,
  description: string | undefined,
  count: number,
  existingPhrases: string[]
): string => {
  return `Generate ${count} diverse training phrases for the following CFO chatbot intent:

Intent Name: ${intentName}
Module: ${module}
Sub-Module: ${subModule}
Description: ${description || 'Not provided'}

Requirements:
1. Generate exactly ${count} unique phrases
2. Include variations in wording (formal/informal)
3. Use {{entityName}} syntax for variables (e.g., "Show top {{limit}} payables")
4. Cover different ways users might ask the same question
5. Include short and detailed versions
6. Make them natural and conversational

${existingPhrases.length > 0 ? `Existing phrases to avoid duplicating:\n${existingPhrases.join('\n')}` : ''}

Respond with ONLY a JSON array of strings:
["phrase 1", "phrase 2", ...]`;
};

const generateEntitiesPrompt = (
  intentName: string,
  module: string,
  trainingPhrases: string[]
): string => {
  return `Analyze this CFO chatbot intent and identify entities (parameters) that should be extracted from user queries:

Intent Name: ${intentName}
Module: ${module}
Training Phrases:
${trainingPhrases.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Available entity types:
- project: Project name or ID
- vendor: Vendor/Supplier name  
- customer: Customer name
- date: Single date
- date_range: Start and end date
- number: Numeric value (counts, limits)
- amount: Currency amount
- percentage: Percentage value
- period: Time period (MTD, QTD, YTD, 7d, 30d, 90d)
- enum: Predefined options
- string: Free text

For each entity, provide:
- name: camelCase identifier
- type: One of the types above
- required: Whether it must be provided
- defaultValue: Default if not provided (optional)
- prompt: Follow-up question if missing (optional)
- enumValues: Array of options for enum type (optional)

Respond with ONLY a JSON array:
[
  {
    "name": "entityName",
    "type": "number",
    "required": false,
    "defaultValue": "5",
    "prompt": "How many items would you like to see?"
  }
]

If no entities are needed, return an empty array: []`;
};

const generatePipelinePrompt = (
  intentName: string,
  module: string,
  entities: any[]
): string => {
  const mcpTools = [
    '@get_cash_balance: Fetch current cash position',
    '@get_cash_flow: Fetch cash inflow/outflow',
    '@get_vendor_bills: Fetch vendor bills and payables',
    '@get_receivables: Fetch accounts receivable',
    '@get_project_costs: Fetch project cost information',
    '@get_inventory: Fetch inventory/stock information',
    '@get_gst_summary: Fetch GST liability summary',
    '@get_industry_benchmark: Fetch industry benchmark data',
    '@get_trend_data: Fetch historical trend for metrics',
    '@get_working_capital: Calculate working capital metrics'
  ];

  return `Design a data pipeline for this CFO chatbot intent:

Intent: ${intentName}
Module: ${module}
Available Entities: ${entities.map(e => e.name).join(', ') || 'None'}

Available MCP Tools:
${mcpTools.join('\n')}

Pipeline node types:
1. api_call: Fetch data using MCP tools
   - mcpTool: tool id (e.g., "get_cash_balance")
   - parameters: array of {name, value, source}
   - source options: "static" (hardcoded), "entity" (from extracted entity), "context" (from business context), "previous_node"

2. computation: Calculate derived values
   - formula: JavaScript-like expression using previous outputVariables

Each node needs:
- nodeId: Unique ID (e.g., "n1", "n2")
- nodeType: "api_call" | "computation"
- sequence: Order number (1, 2, 3...)
- parameters: array of parameters (can be empty for computation)
- outputVariable: Variable name for result
- description: What this step does

Respond with ONLY a JSON array of 2-4 nodes:
[
  {
    "nodeId": "n1",
    "nodeType": "api_call",
    "sequence": 1,
    "mcpTool": "get_cash_balance",
    "parameters": [{"name": "accountType", "value": "all", "source": "static"}],
    "outputVariable": "cashData",
    "description": "Fetch current cash balance"
  }
]`;
};

const generateEnrichmentsPrompt = (
  intentName: string,
  module: string,
  pipeline: any[]
): string => {
  const enrichmentTypes = [
    'trend_analysis: Compare to previous period',
    'benchmark_comparison: Compare to industry standards',
    'days_calculation: Calculate days overdue/remaining',
    'percentage_of_total: Show as percentage of total',
    'ranking: Add numbered ranking',
    'alert_evaluation: Evaluate thresholds',
    'recommendation: Generate recommendations',
    'projection: Forecast future values'
  ];

  const pipelineOutputs = pipeline.map(p => p.outputVariable).join(', ');

  return `Select appropriate enrichment functions for this CFO chatbot intent:

Intent: ${intentName}
Module: ${module}
Pipeline Outputs: ${pipelineOutputs}

Available Enrichments:
${enrichmentTypes.join('\n')}

Select 2-4 enrichments that would add the most value.

Respond with ONLY a JSON array:
[
  {
    "id": "e1",
    "type": "trend_analysis",
    "config": {"compareWith": "previous_period", "metric": "cashData.totalBalance"},
    "description": "Compare to last period"
  }
]`;
};

const generateResponsePrompt = (
  intentName: string,
  module: string,
  pipeline: any[],
  enrichments: any[]
): string => {
  const pipelineVars = pipeline.map(p => `- ${p.outputVariable}: ${p.description}`).join('\n');
  const enrichmentVars = enrichments.map(e => `- ${e.type}: ${e.description}`).join('\n');

  return `Create a response template for this CFO chatbot intent:

Intent: ${intentName}
Module: ${module}

Available Variables from Pipeline:
${pipelineVars}

Available Variables from Enrichments:
${enrichmentVars}
- trendDescription: Trend comparison text
- alertStatus: "critical" | "warning" | "healthy"
- recommendation: AI-generated recommendation

Template Syntax:
- {variableName} - Insert variable
- {variableName | currency} - Format as currency
- {variableName | number:2} - Format number with 2 decimals

Create a professional, emoji-enhanced response. Include 3 follow-up questions.

Respond with ONLY JSON:
{
  "type": "metric_with_trend",
  "template": "Main result with emojis and formatting",
  "followUpQuestions": ["Question 1?", "Question 2?", "Question 3?"]
}`;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const request: GenerationRequest = await req.json();
    const { 
      intentName, 
      moduleName, 
      subModuleName, 
      description, 
      section = 'all',
      existingPhrases = [],
      phraseCount = 10,
      existingEntities = [],
      existingPipeline = [],
      existingEnrichments = []
    } = request;

    console.log(`Generating ${section} for intent: ${intentName}`);

    const callAI = async (prompt: string): Promise<string> => {
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: getSystemPrompt() },
            { role: 'user', content: prompt }
          ],
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        if (response.status === 402) {
          throw new Error('AI credits exhausted. Please add more credits.');
        }
        const errorText = await response.text();
        console.error('AI Gateway error:', response.status, errorText);
        throw new Error(`AI Gateway error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || '';
    };

    const parseJSON = <T>(response: string): T => {
      let cleaned = response.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.slice(7);
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.slice(3);
      }
      if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
      }
      return JSON.parse(cleaned.trim());
    };

    const result: any = {};

    if (section === 'training' || section === 'all') {
      console.log('Generating training phrases...');
      const prompt = generateTrainingPhrasesPrompt(
        intentName, moduleName, subModuleName, description, phraseCount, existingPhrases
      );
      const response = await callAI(prompt);
      result.trainingPhrases = parseJSON<string[]>(response);
    }

    if (section === 'entities' || section === 'all') {
      console.log('Generating entities...');
      const phrases = result.trainingPhrases || existingPhrases || [];
      const prompt = generateEntitiesPrompt(intentName, moduleName, phrases);
      const response = await callAI(prompt);
      result.entities = parseJSON<any[]>(response);
    }

    if (section === 'pipeline' || section === 'all') {
      console.log('Generating data pipeline...');
      const entities = result.entities || existingEntities || [];
      const prompt = generatePipelinePrompt(intentName, moduleName, entities);
      const response = await callAI(prompt);
      result.dataPipeline = parseJSON<any[]>(response);
    }

    if (section === 'enrichments' || section === 'all') {
      console.log('Generating enrichments...');
      const pipeline = result.dataPipeline || existingPipeline || [];
      const prompt = generateEnrichmentsPrompt(intentName, moduleName, pipeline);
      const response = await callAI(prompt);
      result.enrichments = parseJSON<any[]>(response);
    }

    if (section === 'response' || section === 'all') {
      console.log('Generating response template...');
      const pipeline = result.dataPipeline || existingPipeline || [];
      const enrichments = result.enrichments || existingEnrichments || [];
      const prompt = generateResponsePrompt(intentName, moduleName, pipeline, enrichments);
      const response = await callAI(prompt);
      result.responseConfig = parseJSON<any>(response);
    }

    result.generatedAt = new Date().toISOString();
    result.aiConfidence = 0.90 + Math.random() * 0.08;

    console.log('Generation complete:', Object.keys(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-intent function:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
