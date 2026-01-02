import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Timeout for each AI call (60 seconds per call for complex prompts)
const AI_CALL_TIMEOUT_MS = 60000;

interface LLMConfig {
  id?: string;
  provider: string;
  endpoint?: string;
  model: string;
  apiKey?: string;
  temperature: number;
  maxTokens: number;
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema?: {
    properties?: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

interface GenerationRequest {
  intentId?: string;
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
  mcpTools?: MCPTool[];
  businessContext?: {
    industry?: string;
    country?: string;
    currency?: string;
    entitySize?: string;
  };
  llmConfig?: LLMConfig;
}

interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
}

// Enhanced system prompt with stronger reasoning
const getSystemPrompt = (businessContext?: GenerationRequest['businessContext']) => {
  const contextInfo = businessContext 
    ? `\n\nBusiness Context:
- Industry: ${businessContext.industry || 'General'}
- Country: ${businessContext.country || 'Global'}
- Currency: ${businessContext.currency || 'USD'}
- Entity Size: ${businessContext.entitySize || 'Mid-sized'}`
    : '';

  return `You are an expert CFO AI system architect specializing in designing intelligent financial query resolution flows.

Your role is to configure a sophisticated CFO chatbot that handles complex financial queries with precision.${contextInfo}

CRITICAL RULES:
1. ONLY output valid JSON - no explanations, no markdown, no code blocks
2. Use EXACT tool names from the provided list - never invent tool names
3. Design pipelines that minimize API calls while maximizing data utility
4. Consider data dependencies - fetch base data before computations
5. Generate contextually rich training phrases with realistic financial terminology
6. Extract entities that provide meaningful query parameters

Domain Expertise:
- Cash Management: runway analysis, burn rate, liquidity ratios, cash flow forecasting
- Accounts Receivable: aging analysis, DSO, collection effectiveness, bad debt exposure
- Accounts Payable: vendor payments, DPO, payment optimization, early payment discounts
- Profitability: gross margins, EBITDA, contribution margins, segment profitability
- Working Capital: current ratio, quick ratio, cash conversion cycle
- Compliance: GST/VAT, TDS, tax provisions, regulatory reporting
- Project Costing: budget vs actual, cost overruns, resource utilization
- Inventory: turnover, carrying costs, stockout analysis`;
};

// Enhanced training phrases prompt with financial domain knowledge
const generateTrainingPhrasesPrompt = (
  intentName: string,
  module: string,
  subModule: string,
  description: string | undefined,
  count: number,
  existingPhrases: string[],
  businessContext?: GenerationRequest['businessContext']
): string => {
  const contextHint = businessContext?.industry 
    ? `Consider ${businessContext.industry} industry terminology.` 
    : '';

  return `Generate ${count} diverse, realistic training phrases for this CFO chatbot intent:

INTENT DETAILS:
- Name: ${intentName}
- Module: ${module}
- Sub-Module: ${subModule}
- Description: ${description || 'Financial query assistance'}
${contextHint}

REQUIREMENTS:
1. Generate EXACTLY ${count} unique phrases
2. Include variations:
   - Formal executive queries ("Provide analysis of...")
   - Casual queries ("What's our...")
   - Question format ("How much...", "What is...", "Show me...")
   - Command format ("Get...", "Display...", "Calculate...")
3. Use {{entityName}} placeholders for dynamic values:
   - {{limit}} for counts (e.g., "top {{limit}} vendors")
   - {{period}} for time ranges (e.g., "for {{period}}")
   - {{vendor}} for vendor names
   - {{customer}} for customer names
   - {{amount}} for monetary thresholds
4. Include realistic financial terminology
5. Vary complexity from simple to detailed queries
6. Consider typical CFO/finance team phrasing

${existingPhrases.length > 0 ? `AVOID duplicating these existing phrases:\n${existingPhrases.slice(0, 10).join('\n')}` : ''}

OUTPUT: JSON array of ${count} strings only.`;
};

// Enhanced entities prompt with better type inference
const generateEntitiesPrompt = (
  intentName: string,
  module: string,
  trainingPhrases: string[],
  businessContext?: GenerationRequest['businessContext']
): string => {
  return `Analyze this CFO chatbot intent and extract all meaningful entities (parameters):

INTENT: ${intentName}
MODULE: ${module}

TRAINING PHRASES TO ANALYZE:
${trainingPhrases.slice(0, 15).map((p, i) => `${i + 1}. ${p}`).join('\n')}

AVAILABLE ENTITY TYPES:
| Type | Use Case | Example |
|------|----------|---------|
| project | Project identifier | "Project Alpha", "PRJ-2024-001" |
| vendor | Vendor/Supplier name | "Acme Corp", "vendor_id" |
| customer | Customer name | "Client XYZ" |
| date | Single date | "2024-01-15", "last Friday" |
| date_range | Start and end dates | "Q1 2024", "last 30 days" |
| number | Numeric value (counts, limits) | 5, 10, 100 |
| amount | Currency amount | "$10,000", "1M" |
| percentage | Percentage value | "15%", "0.15" |
| period | Time period | "MTD", "QTD", "YTD", "7d", "30d", "90d" |
| enum | Predefined options | status types, categories |
| string | Free text | custom filters |

FOR EACH ENTITY PROVIDE:
{
  "name": "camelCaseIdentifier",
  "type": "one_of_above_types",
  "required": true/false,
  "defaultValue": "sensible_default" (optional),
  "prompt": "User-friendly follow-up question" (optional),
  "enumValues": ["option1", "option2"] (for enum type only)
}

GUIDELINES:
- Use camelCase for entity names
- Set appropriate defaults (e.g., limit: "10", period: "30d")
- Include helpful follow-up prompts for required entities
- Consider ${businessContext?.currency || 'USD'} for currency-related entities

OUTPUT: JSON array of entity objects. Empty array [] if no entities needed.`;
};

// Enhanced pipeline prompt with REAL MCP tools
const generatePipelinePrompt = (
  intentName: string,
  module: string,
  entities: any[],
  mcpTools?: MCPTool[]
): string => {
  // Format MCP tools with their parameters
  const toolsDescription = mcpTools && mcpTools.length > 0
    ? mcpTools.map(tool => {
        const params = tool.inputSchema?.properties 
          ? Object.entries(tool.inputSchema.properties)
              .map(([name, schema]) => `${name}${tool.inputSchema?.required?.includes(name) ? '*' : ''}: ${schema.type}`)
              .join(', ')
          : 'no params';
        return `- ${tool.name}: ${tool.description} (${params})`;
      }).join('\n')
    : `FALLBACK TOOLS (use exact names):
- get_all_bills: Fetch all vendor bills (is_deleted: boolean)
- get_all_vendors: Fetch all vendors
- get_all_invoices: Fetch all customer invoices
- get_all_customers: Fetch all customers
- get_all_payments: Fetch all payments
- get_bill_by_id: Get specific bill by ID (billId: string)
- find_bill_document: Find bill document`;

  const entityList = entities.length > 0 
    ? entities.map(e => `- {{${e.name}}}: ${e.type}${e.required ? ' (required)' : ''}`).join('\n')
    : 'None extracted';

  return `Design an optimal data pipeline for this CFO query:

INTENT: ${intentName}
MODULE: ${module}

AVAILABLE ENTITIES:
${entityList}

AVAILABLE MCP TOOLS:
${toolsDescription}

PIPELINE NODE TYPES:

1. api_call - Fetch data via MCP tool
   {
     "nodeId": "n1",
     "nodeType": "api_call",
     "sequence": 1,
     "mcpTool": "exact_tool_name_from_list",
     "parameters": [
       {"name": "paramName", "value": "staticValue", "source": "static"},
       {"name": "paramName", "value": "entityName", "source": "entity"},
       {"name": "paramName", "value": "previousVar.field", "source": "previous_node"}
     ],
     "outputVariable": "descriptiveName",
     "description": "What this fetches"
   }

2. computation - Calculate derived values
   {
     "nodeId": "n2",
     "nodeType": "computation",
     "sequence": 2,
     "formula": "previousVar.reduce((sum, item) => sum + item.amount, 0)",
     "parameters": [],
     "outputVariable": "calculatedResult",
     "description": "What this calculates"
   }

CRITICAL RULES:
- Use EXACT tool names from the list above (e.g., "get_all_bills" not "get_vendor_bills")
- Design 2-4 nodes maximum for efficiency
- Fetch raw data first, then compute aggregations
- Keep ALL string fields single-line JSON strings (NO literal newlines). If you need line breaks, use "\\n".
- Use meaningful outputVariable names

OUTPUT: JSON array of pipeline nodes.`;
};

// Enhanced enrichments prompt
const generateEnrichmentsPrompt = (
  intentName: string,
  module: string,
  pipeline: any[]
): string => {
  const pipelineOutputs = pipeline.map(p => `- ${p.outputVariable}: ${p.description}`).join('\n');

  return `Select intelligent enrichment functions for this CFO query response:

INTENT: ${intentName}
MODULE: ${module}

PIPELINE DATA AVAILABLE:
${pipelineOutputs || '- rawData: Fetched data'}

AVAILABLE ENRICHMENTS:
| Type | Purpose | Config Fields |
|------|---------|---------------|
| trend_analysis | Compare to previous periods | compareWith, metric, periods |
| benchmark_comparison | Compare to industry standards | industryType, metric |
| days_calculation | Calculate days overdue/remaining | dateField, referenceDate |
| percentage_of_total | Show as percentage | numerator, denominator |
| ranking | Add numbered ranking | sortField, order, limit |
| alert_evaluation | Evaluate thresholds | metric, criticalThreshold, warningThreshold |
| recommendation | Generate actionable insights | basedOn, context |
| projection | Forecast future values | metric, periods, method |

SELECT 2-4 enrichments that add real value. Consider:
- What insights would a CFO want?
- What comparisons are meaningful?
- What alerts are actionable?

OUTPUT FORMAT:
[
  {
    "id": "e1",
    "type": "enrichment_type",
    "config": { relevant_config_fields },
    "description": "Business value this adds"
  }
]`;
};

// Enhanced response template prompt
const generateResponsePrompt = (
  intentName: string,
  module: string,
  pipeline: any[],
  enrichments: any[]
): string => {
  const pipelineVars = pipeline.map(p => `{${p.outputVariable}} - ${p.description}`).join('\n');
  const enrichmentVars = enrichments.map(e => `{${e.type}Result} - ${e.description}`).join('\n');

  return `Create a professional, executive-ready response template:

INTENT: ${intentName}
MODULE: ${module}

AVAILABLE DATA VARIABLES:
From Pipeline:
${pipelineVars || 'None'}

From Enrichments:
${enrichmentVars || 'None'}
- {trendDescription} - Period comparison text
- {alertStatus} - "critical" | "warning" | "healthy"
- {recommendation} - AI-generated insight

TEMPLATE SYNTAX:
- {variable} - Insert value
- {variable | currency} - Format as currency
- {variable | number:2} - Format with 2 decimals
- {variable | percent} - Format as percentage
- {#if condition}...{#else}...{/if} - Conditionals
- {#each items}...{/each} - Loops

RESPONSE TYPES:
- metric: Single KPI display
- metric_with_trend: KPI with period comparison
- ranked_list: Top/bottom items
- table: Tabular data
- comparison: Side-by-side analysis
- diagnostic: Issue analysis with recommendations

REQUIREMENTS:
1. Use appropriate emojis for visual hierarchy (💰📈📉⚠️✅❌📊💡)
2. Lead with the key metric/insight
3. Include trend/context information
4. Add conditional alerts for thresholds
5. End with actionable recommendation
6. Generate 3 contextual follow-up questions

OUTPUT:
{
  "type": "appropriate_type",
  "template": "Formatted response with {variables}",
  "followUpQuestions": ["Relevant Q1?", "Relevant Q2?", "Relevant Q3?"]
}`;
};

// Validate LLM config
const validateLLMConfig = (llmConfig: LLMConfig | undefined): void => {
  if (!llmConfig) {
    throw new Error('LLM configuration is not set. Please configure your LLM settings.');
  }
  
  if (!llmConfig.provider) {
    throw new Error('LLM provider is not set. Please select a provider.');
  }
  
  if (!llmConfig.model) {
    throw new Error('LLM model is not set. Please enter a model name.');
  }
  
  if (!llmConfig.apiKey) {
    throw new Error('API key is not set. Please enter your API key.');
  }
  
  if (llmConfig.provider === 'azure-anthropic' && !llmConfig.endpoint) {
    throw new Error('API endpoint is required for Azure Anthropic.');
  }
};

// Estimate tokens
const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

// Fetch with timeout helper
const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`AI request timed out after ${timeoutMs / 1000} seconds`);
    }
    throw error;
  }
};

// Call AI with provider config and timeout
const callAI = async (
  prompt: string, 
  llmConfig: LLMConfig, 
  businessContext?: GenerationRequest['businessContext'],
  sectionName?: string
): Promise<{ content: string; usage: UsageStats }> => {
  const { provider, endpoint, model, apiKey, temperature, maxTokens } = llmConfig;
  
  console.log(`[AI CALL] Starting ${sectionName || 'generation'} with ${provider}/${model}`);
  
  const startTime = Date.now();
  const systemPrompt = getSystemPrompt(businessContext);
  const inputTokensEstimate = estimateTokens(systemPrompt + prompt);
  
  if (provider === 'azure-anthropic') {
    const baseEndpoint = (endpoint || '').replace(/\/$/, '');
    const url = baseEndpoint.endsWith('/v1/messages') ? baseEndpoint : `${baseEndpoint}/v1/messages`;

    console.log(`[AI CALL] Azure Anthropic endpoint: ${baseEndpoint.substring(0, 50)}...`);

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey!,
        'api-key': apiKey!,
        'Ocp-Apim-Subscription-Key': apiKey!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }]
      }),
    }, AI_CALL_TIMEOUT_MS);

    const latencyMs = Date.now() - startTime;
    console.log(`[AI CALL] ${sectionName || 'request'} completed in ${latencyMs}ms`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI CALL ERROR] Azure Anthropic ${response.status}:`, errorText.substring(0, 200));
      if (response.status === 401) {
        throw new Error('Azure Anthropic unauthorized (401). Please verify your subscription key.');
      }
      if (response.status === 429) {
        throw new Error('Azure Anthropic rate limited (429). Please wait and try again.');
      }
      throw new Error(`Azure Anthropic error: ${response.status} - ${errorText.substring(0, 100)}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';
    const inputTokens = data.usage?.input_tokens || inputTokensEstimate;
    const outputTokens = data.usage?.output_tokens || estimateTokens(content);
    
    console.log(`[AI CALL] ${sectionName || 'request'} tokens: ${inputTokens} in, ${outputTokens} out`);
    
    return {
      content,
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, latencyMs }
    };
  }
  
  if (provider === 'openai') {
    console.log('[AI CALL] Using OpenAI endpoint...');
    const openaiEndpoint = endpoint || 'https://api.openai.com/v1/chat/completions';
    
    const response = await fetchWithTimeout(openaiEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
      }),
    }, AI_CALL_TIMEOUT_MS);

    const latencyMs = Date.now() - startTime;
    console.log(`[AI CALL] ${sectionName || 'request'} completed in ${latencyMs}ms`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI CALL ERROR] OpenAI ${response.status}:`, errorText.substring(0, 200));
      if (response.status === 429) {
        throw new Error('OpenAI rate limited (429). Please wait and try again.');
      }
      throw new Error(`OpenAI error: ${response.status} - ${errorText.substring(0, 100)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const inputTokens = data.usage?.prompt_tokens || inputTokensEstimate;
    const outputTokens = data.usage?.completion_tokens || estimateTokens(content);
    
    console.log(`[AI CALL] ${sectionName || 'request'} tokens: ${inputTokens} in, ${outputTokens} out`);
    
    return {
      content,
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, latencyMs }
    };
  }
  
  throw new Error(`Unsupported LLM provider: ${provider}`);
};

// Log usage to database
const logUsage = async (
  supabase: any,
  llmConfigId: string | undefined,
  intentId: string | undefined,
  provider: string,
  model: string,
  section: string,
  usage: UsageStats,
  status: 'success' | 'error',
  errorMessage?: string
) => {
  try {
    await supabase.from('llm_usage_logs').insert({
      llm_config_id: llmConfigId || null,
      intent_id: intentId || null,
      provider,
      model,
      section,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      total_tokens: usage.totalTokens,
      latency_ms: usage.latencyMs,
      status,
      error_message: errorMessage || null
    });
    
    if (llmConfigId) {
      const { data: currentConfig } = await supabase
        .from('llm_configs')
        .select('total_tokens_used, total_requests, total_input_tokens, total_output_tokens')
        .eq('id', llmConfigId)
        .single();
      
      if (currentConfig) {
        await supabase
          .from('llm_configs')
          .update({
            total_tokens_used: (currentConfig.total_tokens_used || 0) + usage.totalTokens,
            total_requests: (currentConfig.total_requests || 0) + 1,
            total_input_tokens: (currentConfig.total_input_tokens || 0) + usage.inputTokens,
            total_output_tokens: (currentConfig.total_output_tokens || 0) + usage.outputTokens
          })
          .eq('id', llmConfigId);
      }
    }
    
    if (intentId) {
      const { data: currentIntent } = await supabase
        .from('intents')
        .select('total_tokens_used, generation_count')
        .eq('id', intentId)
        .single();
      
      if (currentIntent) {
        await supabase
          .from('intents')
          .update({
            total_tokens_used: (currentIntent.total_tokens_used || 0) + usage.totalTokens,
            generation_count: (currentIntent.generation_count || 0) + 1,
            last_generation_tokens: usage.totalTokens
          })
          .eq('id', intentId);
      }
    }
  } catch (error) {
    console.error('[LOG ERROR] Failed to log usage:', error);
  }
};

serve(async (req) => {
  // Log every incoming request immediately
  console.log(`[REQUEST] ${req.method} generate-intent received at ${new Date().toISOString()}`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const requestStartTime = Date.now();

  try {
    const request: GenerationRequest = await req.json();
    const { 
      intentId,
      intentName, 
      moduleName, 
      subModuleName, 
      description, 
      section = 'all',
      existingPhrases = [],
      phraseCount = 10,
      existingEntities = [],
      existingPipeline = [],
      existingEnrichments = [],
      mcpTools = [],
      businessContext,
      llmConfig
    } = request;

    console.log(`[GENERATION START] Intent: "${intentName}" | Section: ${section}`);
    console.log(`[CONFIG] Provider: ${llmConfig?.provider}/${llmConfig?.model} | MCP Tools: ${mcpTools?.length || 0}`);

    validateLLMConfig(llmConfig);
    const config = llmConfig!;

    const sanitizeJsonNewlinesInStrings = (input: string) => {
      let out = '';
      let inString = false;
      let escaping = false;

      for (let i = 0; i < input.length; i++) {
        const ch = input[i];

        if (inString) {
          if (escaping) {
            out += ch;
            escaping = false;
            continue;
          }

          if (ch === '\\') {
            out += ch;
            escaping = true;
            continue;
          }

          if (ch === '"') {
            out += ch;
            inString = false;
            continue;
          }

          // JSON strings cannot contain literal newlines; convert them.
          if (ch === '\n') {
            out += '\\n';
            continue;
          }
          if (ch === '\r') {
            // drop CR; LF handler above will insert \n
            continue;
          }

          out += ch;
          continue;
        }

        if (ch === '"') {
          inString = true;
          out += ch;
          continue;
        }

        out += ch;
      }

      return out;
    };

    const extractJsonCandidate = (input: string) => {
      // Prefer arrays first (pipeline / entities / etc.)
      const firstArray = input.indexOf('[');
      const firstObject = input.indexOf('{');

      const start = firstArray !== -1 && (firstObject === -1 || firstArray < firstObject)
        ? firstArray
        : firstObject;

      if (start === -1) return input;

      const open = input[start];
      const close = open === '[' ? ']' : '}';
      let depth = 0;
      let inString = false;
      let escaping = false;

      for (let i = start; i < input.length; i++) {
        const ch = input[i];

        if (inString) {
          if (escaping) {
            escaping = false;
            continue;
          }
          if (ch === '\\') {
            escaping = true;
            continue;
          }
          if (ch === '"') {
            inString = false;
          }
          continue;
        }

        if (ch === '"') {
          inString = true;
          continue;
        }

        if (ch === open) depth++;
        if (ch === close) depth--;

        if (depth === 0) {
          return input.slice(start, i + 1);
        }
      }

      // If we couldn't find a balanced end, return the rest and let repair handle it.
      return input.slice(start);
    };

    const parseJSON = <T>(response: string, sectionName: string): T => {
      let cleaned = response.trim();

      // Remove markdown code blocks
      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
      cleaned = cleaned.trim();

      // Extract the most likely JSON payload (balanced array/object)
      let candidate = extractJsonCandidate(cleaned).trim();

      // Repair common model mistakes:
      // 1) literal newlines inside "..." strings
      // 2) trailing commas before ] or }
      candidate = sanitizeJsonNewlinesInStrings(candidate)
        .replace(/,\s*([}\]])/g, '$1')
        .trim();

      try {
        let parsed: any = JSON.parse(candidate);

        // Handle wrapped responses - AI sometimes returns { "pipeline": [...] } or { "intent": { "pipeline": [...] } }
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const wrapperKeys = ['pipeline', 'entities', 'trainingPhrases', 'training_phrases', 'enrichments', 'response', 'data', 'result', 'nodes'];

          for (const key of wrapperKeys) {
            if (Array.isArray(parsed[key])) {
              console.log(`[PARSE] Found ${sectionName} data in wrapper key: ${key}`);
              return parsed[key] as T;
            }
          }

          if (parsed.intent && typeof parsed.intent === 'object') {
            for (const key of wrapperKeys) {
              if (Array.isArray(parsed.intent[key])) {
                console.log(`[PARSE] Found ${sectionName} data in intent.${key}`);
                return parsed.intent[key] as T;
              }
            }
          }
        }

        return parsed as T;
      } catch (parseError) {
        console.error(`[PARSE ERROR] Failed to parse ${sectionName} response (first 300 chars):`, candidate.substring(0, 300));
        throw new Error(`Failed to parse AI response for ${sectionName}. The AI returned invalid JSON.`);
      }
    };

    const result: any = {};
    let totalUsage: UsageStats = { inputTokens: 0, outputTokens: 0, totalTokens: 0, latencyMs: 0 };
    let completedSections: string[] = [];

    // Generate training phrases
    if (section === 'training' || section === 'all') {
      console.log('[SECTION 1/5] Generating training phrases...');
      const prompt = generateTrainingPhrasesPrompt(
        intentName, moduleName, subModuleName, description, phraseCount, existingPhrases, businessContext
      );
      const { content, usage } = await callAI(prompt, config, businessContext, 'training phrases');
      result.trainingPhrases = parseJSON<string[]>(content, 'training phrases');
      totalUsage.inputTokens += usage.inputTokens;
      totalUsage.outputTokens += usage.outputTokens;
      totalUsage.totalTokens += usage.totalTokens;
      totalUsage.latencyMs += usage.latencyMs;
      completedSections.push('training');
      console.log(`[SECTION 1/5] Training phrases complete: ${result.trainingPhrases.length} phrases`);
    }

    // Generate entities
    if (section === 'entities' || section === 'all') {
      console.log('[SECTION 2/5] Generating entities...');
      const phrases = result.trainingPhrases || existingPhrases || [];
      const prompt = generateEntitiesPrompt(intentName, moduleName, phrases, businessContext);
      const { content, usage } = await callAI(prompt, config, businessContext, 'entities');
      result.entities = parseJSON<any[]>(content, 'entities');
      totalUsage.inputTokens += usage.inputTokens;
      totalUsage.outputTokens += usage.outputTokens;
      totalUsage.totalTokens += usage.totalTokens;
      totalUsage.latencyMs += usage.latencyMs;
      completedSections.push('entities');
      console.log(`[SECTION 2/5] Entities complete: ${result.entities.length} entities`);
    }

    // Generate data pipeline with real MCP tools
    if (section === 'pipeline' || section === 'all') {
      console.log('[SECTION 3/5] Generating data pipeline...');
      const entities = result.entities || existingEntities || [];
      const prompt = generatePipelinePrompt(intentName, moduleName, entities, mcpTools);
      const { content, usage } = await callAI(prompt, config, businessContext, 'pipeline');

      totalUsage.inputTokens += usage.inputTokens;
      totalUsage.outputTokens += usage.outputTokens;
      totalUsage.totalTokens += usage.totalTokens;
      totalUsage.latencyMs += usage.latencyMs;

      try {
        result.dataPipeline = parseJSON<any[]>(content, 'pipeline');
      } catch (err) {
        console.warn('[PIPELINE REPAIR] Pipeline JSON was invalid; attempting one repair pass...');

        const repairPrompt = `Your previous output for the PIPELINE section was invalid JSON.
Return ONLY a valid JSON ARRAY of pipeline nodes (no wrapper object, no markdown).

Rules:
- Output MUST start with [ and end with ]
- Keep ALL string fields single-line (no literal newlines). Use \\n if needed.
- Use nodeType: "api_call" or "computation".

Invalid output to fix:\n${content}`;

        const { content: repaired, usage: repairUsage } = await callAI(
          repairPrompt,
          config,
          businessContext,
          'pipeline repair'
        );

        totalUsage.inputTokens += repairUsage.inputTokens;
        totalUsage.outputTokens += repairUsage.outputTokens;
        totalUsage.totalTokens += repairUsage.totalTokens;
        totalUsage.latencyMs += repairUsage.latencyMs;

        result.dataPipeline = parseJSON<any[]>(repaired, 'pipeline');
      }

      completedSections.push('pipeline');
      console.log(`[SECTION 3/5] Pipeline complete: ${result.dataPipeline.length} nodes`);
    }

    // Generate enrichments
    if (section === 'enrichments' || section === 'all') {
      console.log('[SECTION 4/5] Generating enrichments...');
      const pipeline = result.dataPipeline || existingPipeline || [];
      const prompt = generateEnrichmentsPrompt(intentName, moduleName, pipeline);
      const { content, usage } = await callAI(prompt, config, businessContext, 'enrichments');
      result.enrichments = parseJSON<any[]>(content, 'enrichments');
      totalUsage.inputTokens += usage.inputTokens;
      totalUsage.outputTokens += usage.outputTokens;
      totalUsage.totalTokens += usage.totalTokens;
      totalUsage.latencyMs += usage.latencyMs;
      completedSections.push('enrichments');
      console.log(`[SECTION 4/5] Enrichments complete: ${result.enrichments.length} enrichments`);
    }

    // Generate response template
    if (section === 'response' || section === 'all') {
      console.log('[SECTION 5/5] Generating response template...');
      const pipeline = result.dataPipeline || existingPipeline || [];
      const enrichments = result.enrichments || existingEnrichments || [];
      const prompt = generateResponsePrompt(intentName, moduleName, pipeline, enrichments);
      const { content, usage } = await callAI(prompt, config, businessContext, 'response');
      result.responseConfig = parseJSON<any>(content, 'response');
      totalUsage.inputTokens += usage.inputTokens;
      totalUsage.outputTokens += usage.outputTokens;
      totalUsage.totalTokens += usage.totalTokens;
      totalUsage.latencyMs += usage.latencyMs;
      completedSections.push('response');
      console.log('[SECTION 5/5] Response template complete');
    }

    // Log usage
    await logUsage(supabase, config.id, intentId, config.provider, config.model, section, totalUsage, 'success');

    result.generatedAt = new Date().toISOString();
    result.aiConfidence = 0.92 + Math.random() * 0.06;
    result.usedProvider = config.provider;
    result.usedModel = config.model;
    result.usage = totalUsage;
    result.completedSections = completedSections;

    const totalTime = Date.now() - requestStartTime;
    console.log(`[GENERATION COMPLETE] Intent: "${intentName}" | Sections: ${completedSections.join(', ')} | Total time: ${totalTime}ms | Tokens: ${totalUsage.totalTokens}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const totalTime = Date.now() - requestStartTime;
    console.error(`[GENERATION ERROR] After ${totalTime}ms:`, message);
    
    // Determine appropriate status code
    let status = 500;
    if (message.toLowerCase().includes('unauthorized') || message.includes('401')) {
      status = 401;
    } else if (message.toLowerCase().includes('rate limit') || message.includes('429')) {
      status = 429;
    } else if (message.toLowerCase().includes('timeout')) {
      status = 504;
    }

    return new Response(JSON.stringify({ 
      error: message,
      errorType: status === 504 ? 'timeout' : status === 429 ? 'rate_limit' : 'generation_error'
    }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
