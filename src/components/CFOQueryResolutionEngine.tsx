// ============================================================================
// CFO AI - Query Resolution Engine v3.0
// AI-First Architecture: Human creates minimal, AI generates, Human edits
// TypeScript + shadcn/ui + Tailwind
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { UsersManagement } from '@/components/UsersManagement';
import { PipelineDebugPage } from '@/components/pipeline-debug';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  useModules,
  useCountryConfigs,
  useEntityTypes,
  useEnrichmentTypes,
  useLLMProviders,
  useResponseTypes,
  useIntents,
  useBusinessContext,
  useLLMConfig,
  useLLMUsageLogs,
  calculateCost,
  type Module,
  type SubModule,
  type CountryConfig,
  type EntityType,
  type EnrichmentType,
  type LLMProvider,
  type ResponseType,
  type Intent,
  type BusinessContext,
  type LLMConfig,
  type Entity,
  type ResolutionFlow,
  type PipelineNode,
  type Enrichment,
  type ResponseConfig,
  type ModelUsage
} from '@/hooks/useCFOData';
import { useMCPTools, type MCPTool } from '@/hooks/useMCPTools';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { IntentUsageTab } from '@/components/cfo-agent/IntentUsageTab';
import { MCPToolUsageBadge } from '@/components/cfo-agent/MCPToolUsageBadge';
import {
  Plus, Edit, Trash2, X, Check, Download, Upload, Wand2, Database, Sparkles,
  Loader2, Brain, GitBranch, Layers, Box, Play, Save, Settings, Search,
  MessageSquare, FlaskConical, ChevronDown, ChevronRight, ChevronUp, Copy, Code,
  AlertCircle, ArrowRight, FileJson, Zap, ArrowLeft, FileSpreadsheet,
  Globe, Building2, Filter, MoreVertical, Eye, TestTube, RefreshCw,
  ListOrdered, Variable, FileText, Users, LogOut, Terminal, BarChart3,
  CheckCircle2, LockKeyhole, LayoutGrid, List, AlertTriangle
} from 'lucide-react';
import ApiConsole from '@/components/ApiConsole';
import { AIIntentGeneratorModal } from '@/components/AIIntentGeneratorModal';
import { CasesLibraryView } from '@/components/CasesLibraryView';
import { TEST_CASES } from '@/data/testCases';
import UnifiedAnalyticsView from '@/components/UnifiedAnalyticsView';
import MasterPlanView from '@/components/MasterPlanView';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// Helper to convert PascalCase to spaced words
const formatIntentName = (name: string): string => {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
};

// PipelineParameter is only used locally
interface PipelineParameter {
  name: string;
  value: string;
  source: 'static' | 'entity' | 'context' | 'previous_node';
}
// All constants are now loaded from the database via hooks

// ============================================================================
// CSV IMPORT/EXPORT (Simplified - only basic fields)
// ============================================================================

const IMPORT_TEMPLATE_HEADERS = ['name', 'module', 'sub_module', 'description', 'is_active'];

const generateImportTemplate = (): string => {
  const headers = IMPORT_TEMPLATE_HEADERS.join(',');
  const sampleRow1 = [
    'Cash Runway Analysis',
    'cash_management',
    'cash_runway',
    'Calculate how long current cash will last',
    'true'
  ].join(',');
  const sampleRow2 = [
    'Top Payables Query',
    'payables',
    'vendor_payments',
    'Show largest outstanding payables',
    'true'
  ].join(',');
  
  return `${headers}\n${sampleRow1}\n${sampleRow2}`;
};

const parseImportedIntents = (csvContent: string): Partial<Intent>[] => {
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const intents: Partial<Intent>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = lines[i].split(',');
    const getValue = (header: string) => {
      const idx = headers.indexOf(header);
      return idx >= 0 ? values[idx]?.trim() : '';
    };
    
    intents.push({
      name: getValue('name'),
      moduleId: getValue('module'),
      subModuleId: getValue('sub_module'),
      description: getValue('description') || undefined,
      isActive: getValue('is_active') !== 'false'
    });
  }
  
  return intents;
};

const exportIntentsToCSV = (intents: Intent[]): string => {
  const headers = IMPORT_TEMPLATE_HEADERS;
  const rows = intents.map(intent => {
    const row: string[] = [
      intent.name,
      intent.moduleId,
      intent.subModuleId,
      intent.description || '',
      String(intent.isActive)
    ];
    return row.join(',');
  });
  
  return [headers.join(','), ...rows].join('\n');
};

// ============================================================================
// LLM SERVICE - CLAUDE API INTEGRATION
// ============================================================================

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  content: Array<{ type: string; text: string }>;
}

const callClaudeAPI = async (
  messages: ClaudeMessage[],
  config: LLMConfig,
  systemPrompt?: string
): Promise<string> => {
  const response = await fetch(`${config.endpoint}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': config.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      system: systemPrompt || getDefaultSystemPrompt(),
      messages
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API Error: ${response.status} - ${errorText}`);
  }

  const data: ClaudeResponse = await response.json();
  return data.content[0]?.text || '';
};

const getDefaultSystemPrompt = (): string => {
  return `You are an expert CFO AI assistant helping to configure a query resolution system for financial chatbots.

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
};

// Training Phrases Generation
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

// Entities Generation
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

// Data Pipeline Generation
const generatePipelinePrompt = (
  intentName: string,
  module: string,
  entities: Entity[],
  mcpTools: MCPTool[]
): string => {
  const toolsDescription = mcpTools.map(t => 
    `- @${t.id}: ${t.description} (params: ${t.parameters.map(p => p.name).join(', ')})`
  ).join('\n');

  return `Design a data pipeline for this CFO chatbot intent:

Intent: ${intentName}
Module: ${module}
Available Entities: ${entities.map(e => e.name).join(', ') || 'None'}

Available MCP Tools:
${toolsDescription}

Pipeline node types:
1. api_call: Fetch data using MCP tools
   - mcpTool: tool id (e.g., "get_cash_balance")
   - parameters: array of {name, value, source}
   - source options: "static" (hardcoded), "entity" (from extracted entity), "context" (from business context), "previous_node"

2. computation: Calculate derived values
   - formula: JavaScript-like expression using previous outputVariables

3. conditional: Branch logic
   - condition: Boolean expression

Each node needs:
- nodeId: Unique ID (e.g., "n1", "n2")
- nodeType: "api_call" | "computation" | "conditional"
- sequence: Order number (1, 2, 3...)
- outputVariable: Variable name for result
- description: What this step does

Respond with ONLY a JSON array:
[
  {
    "nodeId": "n1",
    "nodeType": "api_call",
    "sequence": 1,
    "mcpTool": "get_cash_balance",
    "parameters": [{"name": "accountType", "value": "all", "source": "static"}],
    "outputVariable": "cashData",
    "description": "Fetch current cash balance"
  },
  {
    "nodeId": "n2",
    "nodeType": "computation",
    "sequence": 2,
    "formula": "cashData.totalBalance / 30",
    "outputVariable": "dailyBurn",
    "description": "Calculate daily burn rate"
  }
]`;
};

// Enrichments Generation
const generateEnrichmentsPrompt = (
  intentName: string,
  module: string,
  pipeline: PipelineNode[],
  enrichmentTypes: EnrichmentType[]
): string => {
  const enrichmentsDescription = enrichmentTypes.map(e => 
    `- ${e.id}: ${e.description} (config: ${e.configFields.join(', ')})`
  ).join('\n');

  const pipelineOutputs = pipeline.map(p => p.outputVariable).join(', ');

  return `Select appropriate enrichment functions for this CFO chatbot intent:

Intent: ${intentName}
Module: ${module}
Pipeline Outputs: ${pipelineOutputs}

Available Enrichments:
${enrichmentsDescription}

Select 2-5 enrichments that would add the most value to this intent's response.

For each enrichment provide:
- id: Unique ID (e.g., "e1", "e2")
- type: Enrichment type from the list above
- config: Configuration object with relevant fields
- description: What this enrichment adds

Respond with ONLY a JSON array:
[
  {
    "id": "e1",
    "type": "trend_analysis",
    "config": {"compareWith": "previous_period", "metric": "cashData.totalBalance"},
    "description": "Compare to last period"
  },
  {
    "id": "e2",
    "type": "alert_evaluation",
    "config": {"metric": "runwayMonths", "criticalThreshold": 3, "warningThreshold": 6, "direction": "below"},
    "description": "Evaluate runway thresholds"
  }
]`;
};

// Response Template Generation
const generateResponsePrompt = (
  intentName: string,
  module: string,
  pipeline: PipelineNode[],
  enrichments: Enrichment[]
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
- benchmarkComparison: Industry benchmark comparison
- alertStatus: "critical" | "warning" | "healthy"
- recommendation: AI-generated recommendation

Template Syntax:
- {variableName} - Insert variable
- {variableName | currency} - Format as currency
- {variableName | number:2} - Format number with 2 decimals
- {variableName | date} - Format as date
- {#if condition}...{#elseif}...{#else}...{/if} - Conditionals
- {#each items}...{/each} - Loops

Response Types: metric, metric_with_trend, ranked_list, table, comparison, diagnostic

Create a professional, emoji-enhanced response template. Include:
1. Main metric/data display
2. Context and trends
3. Conditional alerts
4. Recommendations
5. 3 relevant follow-up questions

Respond with ONLY JSON:
{
  "type": "metric_with_trend",
  "template": "💰 Cash Balance: {cashData.totalBalance | currency}\\n\\n📈 Trend: {trendDescription}\\n\\n{#if alertStatus == 'critical'}🚨 CRITICAL{/if}\\n\\n💡 {recommendation}",
  "followUpQuestions": ["Question 1?", "Question 2?", "Question 3?"]
}`;
};

// Parse JSON safely from Claude response
function parseClaudeJSON<T>(response: string): T {
  // Remove markdown code blocks if present
  let cleaned = response.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();
  
  return JSON.parse(cleaned);
}

// ============================================================================
// MCP TOOL RESOLVER - Maps AI-generated tool names to actual tool IDs
// ============================================================================

// Common aliases for tools that AI frequently hallucinates
const MCP_TOOL_ALIASES: Record<string, string[]> = {
  'get_all_bills': ['get_vendor_bills', 'get_bills', 'list_bills', 'fetch_bills', 'vendor_bills'],
  'get_all_vendors': ['get_vendors', 'list_vendors', 'fetch_vendors'],
  'get_all_invoices': ['get_invoices', 'list_invoices', 'fetch_invoices', 'get_customer_invoices'],
  'get_all_customers': ['get_customers', 'list_customers', 'fetch_customers'],
  'get_all_payments': ['get_payments', 'list_payments', 'fetch_payments'],
  'get_all_expenses': ['get_expenses', 'list_expenses', 'fetch_expenses'],
  'get_cash_balance': ['get_balance', 'cash_balance', 'fetch_cash_balance'],
};

// Build reverse lookup for aliases
const buildAliasLookup = (): Record<string, string> => {
  const map: Record<string, string> = {};
  Object.entries(MCP_TOOL_ALIASES).forEach(([toolId, aliases]) => {
    aliases.forEach(alias => {
      map[alias.toLowerCase()] = toolId;
    });
  });
  return map;
};

const ALIAS_TO_TOOL = buildAliasLookup();

// ============================================================================
// MODULE-LEVEL BACKGROUND SUGGESTION STORE & QUEUE
// Persists across component mount/unmount so navigation doesn't cancel the call
// ============================================================================
interface PendingSuggestion {
  status: 'pending' | 'done' | 'error';
  data?: any;
  error?: string;
  intentId: string;
  intentName: string;
}

const pendingSuggestions = new Map<string, PendingSuggestion>();
const suggestionListeners = new Map<string, (result: PendingSuggestion) => void>();

// --- Sequential Queue for bulk suggestions ---
interface QueueItem {
  intentId: string;
  intentName: string;
  body: any;
  onNavigate?: (intentId: string) => void;
}

interface SuggestionQueueState {
  items: QueueItem[];
  processing: boolean;
  current: number;
  total: number;
  completed: number;
  failed: number;
  currentIntentName: string;
  cancelled: boolean;
}

const suggestionQueue: SuggestionQueueState = {
  items: [],
  processing: false,
  current: 0,
  total: 0,
  completed: 0,
  failed: 0,
  currentIntentName: '',
  cancelled: false,
};

const queueStateListeners = new Set<() => void>();
const notifyQueueListeners = () => queueStateListeners.forEach(fn => fn());

const processQueue = async () => {
  if (suggestionQueue.processing) return;
  suggestionQueue.processing = true;
  suggestionQueue.cancelled = false;
  notifyQueueListeners();

  while (suggestionQueue.items.length > 0 && !suggestionQueue.cancelled) {
    const item = suggestionQueue.items.shift()!;
    suggestionQueue.current++;
    suggestionQueue.currentIntentName = item.intentName;
    notifyQueueListeners();

    if (pendingSuggestions.get(item.intentId)?.status === 'done') {
      suggestionQueue.completed++;
      notifyQueueListeners();
      continue;
    }

    pendingSuggestions.set(item.intentId, { status: 'pending', intentId: item.intentId, intentName: item.intentName });

    try {
      const { data, error } = await supabase.functions.invoke('suggest-ideal-pipeline', { body: item.body });
      if (error || data?.error) {
        const errMsg = error?.message || data?.error || 'Unknown error';
        pendingSuggestions.set(item.intentId, { status: 'error', error: errMsg, intentId: item.intentId, intentName: item.intentName });
        suggestionQueue.failed++;
      } else {
        pendingSuggestions.set(item.intentId, { status: 'done', data, intentId: item.intentId, intentName: item.intentName });
        suggestionQueue.completed++;
        // Auto-save to DB
        await autoSaveAISuggestion(item.intentId, data);
        sonnerToast.success(`AI pipeline saved for "${item.intentName}"`, {
          description: `${data.steps?.length || 0} steps suggested & auto-saved`,
          duration: 8000,
          action: item.onNavigate ? { label: 'View', onClick: () => item.onNavigate!(item.intentId) } : undefined,
        });
      }
    } catch (_e) {
      pendingSuggestions.set(item.intentId, { status: 'error', error: 'Network error', intentId: item.intentId, intentName: item.intentName });
      suggestionQueue.failed++;
    }

    const listener = suggestionListeners.get(item.intentId);
    if (listener) listener(pendingSuggestions.get(item.intentId)!);
    notifyQueueListeners();

    // 2s pause between requests to avoid rate limits
    if (suggestionQueue.items.length > 0 && !suggestionQueue.cancelled) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  suggestionQueue.processing = false;
  suggestionQueue.currentIntentName = '';
  notifyQueueListeners();
};

const cancelQueue = () => {
  suggestionQueue.cancelled = true;
  suggestionQueue.items.length = 0;
  notifyQueueListeners();
};

const resetQueueStats = () => {
  suggestionQueue.current = 0;
  suggestionQueue.total = 0;
  suggestionQueue.completed = 0;
  suggestionQueue.failed = 0;
  suggestionQueue.cancelled = false;
  notifyQueueListeners();
};

// Single-intent fire (used by individual intent suggest button)
const fireSuggestionInBackground = (
  intentId: string,
  intentName: string,
  body: any,
  onNavigate?: (intentId: string) => void
) => {
  if (pendingSuggestions.get(intentId)?.status === 'pending') return;
  
  pendingSuggestions.set(intentId, { status: 'pending', intentId, intentName });

  supabase.functions.invoke('suggest-ideal-pipeline', { body }).then(({ data, error }) => {
    if (error || data?.error) {
      const errMsg = error?.message || data?.error || 'Unknown error';
      pendingSuggestions.set(intentId, { status: 'error', error: errMsg, intentId, intentName });
      sonnerToast.error('Pipeline suggestion failed', { description: errMsg });
    } else {
      pendingSuggestions.set(intentId, { status: 'done', data, intentId, intentName });
      // Auto-save to DB
      autoSaveAISuggestion(intentId, data);
      sonnerToast.success(`AI pipeline saved for "${intentName}"`, {
        description: `${data.steps?.length || 0} steps suggested & auto-saved`,
        duration: 10000,
        action: onNavigate ? {
          label: 'View',
          onClick: () => onNavigate(intentId),
        } : undefined,
      });
    }
    const listener = suggestionListeners.get(intentId);
    if (listener) listener(pendingSuggestions.get(intentId)!);
  });
};

// Auto-save AI suggestion: merge suggested steps into intent's pipeline and persist to DB
const autoSaveAISuggestion = async (intentId: string, aiData: any) => {
  try {
    if (!aiData?.steps || aiData.steps.length === 0) return;

    // Fetch current intent data
    const { data: intentRow, error: fetchErr } = await supabase
      .from('intents')
      .select('resolution_flow')
      .eq('id', intentId)
      .single();
    if (fetchErr || !intentRow) {
      console.error('Auto-save: failed to fetch intent', fetchErr);
      return;
    }

    const currentFlow = (intentRow.resolution_flow as any) || {};
    const currentPipeline: any[] = currentFlow.dataPipeline || [];
    const existingTools = new Set(currentPipeline.filter((n: any) => n.mcpTool).map((n: any) => n.mcpTool));
    const existingVars = new Set(currentPipeline.map((n: any) => n.outputVariable));

    // Merge only new steps
    const newSteps = aiData.steps.filter((step: any) => {
      if (step.nodeType === 'api_call' && step.mcpTool && existingTools.has(step.mcpTool)) return false;
      if (existingVars.has(step.outputVariable)) return false;
      return true;
    });

    const mergedPipeline = [
      ...currentPipeline,
      ...newSteps.map((step: any, i: number) => ({
        nodeId: `ai_auto_${Date.now()}_${i}`,
        nodeType: step.nodeType,
        sequence: currentPipeline.length + i + 1,
        mcpTool: step.nodeType === 'api_call' ? step.mcpTool : undefined,
        parameters: [],
        formula: step.nodeType === 'computation' ? (step.formula || '') : undefined,
        condition: step.nodeType === 'conditional' ? (step.condition || '') : undefined,
        outputVariable: step.outputVariable,
        description: step.description,
      })),
    ];

    // Save AI metadata (persona relevance, summary, gaps) alongside the pipeline
    const updatedFlow = {
      ...currentFlow,
      dataPipeline: mergedPipeline,
      aiSuggestion: {
        summary: aiData.summary || '',
        personaRelevance: aiData.personaRelevance || {},
        suggestedAt: new Date().toISOString(),
        stepsAdded: newSteps.length,
        steps: aiData.steps || [],
        gaps: (aiData.steps || [])
          .filter((s: any) => s.toolAvailable === false)
          .map((s: any) => ({
            toolName: s.mcpTool,
            description: s.description,
            fallback: s.fallbackSuggestion,
          })),
      },
    };

    const { error: updateErr } = await supabase
      .from('intents')
      .update({ resolution_flow: updatedFlow })
      .eq('id', intentId);

    if (updateErr) {
      console.error('Auto-save: failed to update intent', updateErr);
    } else {
      console.log(`✅ Auto-saved AI pipeline for intent ${intentId}: ${newSteps.length} new steps merged, ${updatedFlow.aiSuggestion.gaps.length} gaps recorded`);
      // Trigger UI refresh so the saved data is visible
      if (globalRefreshIntents) globalRefreshIntents();
    }
  } catch (e) {
    console.error('Auto-save: unexpected error', e);
  }
};

// Global callbacks — set by the main component
let globalNavigateToIntent: ((intentId: string) => void) | null = null;
let globalRefreshIntents: (() => void) | null = null;

// Resolve AI-generated tool name to actual MCP tool ID
const resolveMcpToolIdWithTools = (generatedName: string | undefined, mcpTools: MCPTool[]): string => {
  if (!generatedName) return '';
  
  // Normalize: remove @ prefix, trim, lowercase
  const normalized = generatedName.toLowerCase().replace(/^@/, '').trim();
  
  if (!normalized) return '';
  if (mcpTools.length === 0) {
    // Tools not loaded yet - return normalized for later resolution
    return normalized;
  }

  // 1. Exact match (case-insensitive)
  const exactMatch = mcpTools.find(t => t.id.toLowerCase() === normalized);
  if (exactMatch) {
    console.log(`✅ MCP Tool exact match: ${generatedName} → ${exactMatch.id}`);
    return exactMatch.id;
  }

  // 2. Check alias map
  const aliasMatch = ALIAS_TO_TOOL[normalized];
  if (aliasMatch) {
    const tool = mcpTools.find(t => t.id.toLowerCase() === aliasMatch.toLowerCase());
    if (tool) {
      console.log(`✅ MCP Tool alias match: ${generatedName} → ${tool.id}`);
      return tool.id;
    }
  }

  // 3. Token-based similarity matching
  const genTokens = normalized.split('_').filter(Boolean);
  let bestMatch: { toolId: string; score: number } | null = null;
  
  for (const tool of mcpTools) {
    const toolTokens = tool.id.toLowerCase().split('_').filter(Boolean);
    
    // Count matching tokens
    let matchingTokens = 0;
    for (const genToken of genTokens) {
      const singularGen = genToken.replace(/s$/, '');
      for (const toolToken of toolTokens) {
        const singularTool = toolToken.replace(/s$/, '');
        if (genToken === toolToken || singularGen === singularTool || genToken === singularTool || singularGen === toolToken) {
          matchingTokens++;
          break;
        }
      }
    }
    
    // Calculate score
    const score = matchingTokens / Math.max(genTokens.length, toolTokens.length);
    
    // Prefer tools starting with "get_all_" when looking for lists
    let adjustedScore = score;
    if (genTokens.includes('all') || genTokens.includes('list') || genTokens.includes('fetch')) {
      if (tool.id.startsWith('get_all_')) {
        adjustedScore += 0.1;
      }
    }
    
    if (!bestMatch || adjustedScore > bestMatch.score) {
      bestMatch = { toolId: tool.id, score: adjustedScore };
    }
  }
  
  // Accept if score is above threshold
  if (bestMatch && bestMatch.score >= 0.5) {
    console.log(`✅ MCP Tool similarity match: ${generatedName} → ${bestMatch.toolId} (score: ${bestMatch.score.toFixed(2)})`);
    return bestMatch.toolId;
  }

  // 4. No good match - return empty
  console.warn(`⚠️ No MCP tool match for: ${generatedName}. Available: ${mcpTools.map(t => t.id).join(', ')}`);
  return '';
};

// ============================================================================
// AI BADGE COMPONENT
// ============================================================================

function AIBadge({ confidence, onRegenerate, isRegenerating }: { 
  confidence?: number; 
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
        🤖 AI Generated
        {confidence && <span className="text-purple-500">({Math.round(confidence * 100)}%)</span>}
      </span>
      {onRegenerate && (
        <button
          onClick={onRegenerate}
          disabled={isRegenerating}
          className="inline-flex items-center gap-1 px-2 py-1 text-purple-600 hover:bg-purple-50 rounded text-xs transition-colors disabled:opacity-50"
        >
          {isRegenerating ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
          Regenerate
        </button>
      )}
    </div>
  );
}

// ============================================================================
// CREATE INTENT MODAL (Simplified)
// ============================================================================

interface CreateIntentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (intent: Partial<Intent>) => void;
  modules: Module[];
}

function CreateIntentModal({ isOpen, onClose, onCreate, modules }: CreateIntentModalProps) {
  const [name, setName] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [subModuleId, setSubModuleId] = useState('');
  const [description, setDescription] = useState('');

  const selectedModule = modules.find(m => m.id === moduleId);
  const subModules = selectedModule?.subModules || [];

  const handleSubmit = () => {
    if (!name.trim() || !moduleId || !subModuleId) {
      alert('Please fill in all required fields');
      return;
    }
    
    onCreate({
      name: name.trim(),
      moduleId,
      subModuleId,
      description: description.trim() || undefined
    });
    
    // Reset form
    setName('');
    setModuleId('');
    setSubModuleId('');
    setDescription('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">Create New Intent</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Cash Runway Analysis"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* Module */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Module <span className="text-red-500">*</span>
            </label>
            <select
              value={moduleId}
              onChange={(e) => {
                setModuleId(e.target.value);
                setSubModuleId('');
              }}
              className="w-full px-3 py-2 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select module...</option>
              {modules.map(m => (
                <option key={m.id} value={m.id}>{m.icon} {m.name}</option>
              ))}
            </select>
          </div>
          
          {/* Sub-Module */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sub-Module <span className="text-red-500">*</span>
            </label>
            <select
              value={subModuleId}
              onChange={(e) => setSubModuleId(e.target.value)}
              disabled={!moduleId}
              className="w-full px-3 py-2 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">Select sub-module...</option>
              {subModules.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          
          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this intent handles..."
              rows={3}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          
          {/* Info Box */}
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex gap-2">
              <Brain className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-purple-700">
                <p className="font-medium">AI will automatically generate:</p>
                <ul className="mt-1 space-y-0.5 text-purple-600">
                  <li>• Training phrases</li>
                  <li>• Tool parameters</li>
                  <li>• Data pipeline</li>
                  <li>• Enrichments</li>
                  <li>• Response template</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-3 p-4 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !moduleId || !subModuleId}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg flex items-center gap-2 hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Wand2 size={16} />
            Create & Generate with AI
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// INTENT DETAIL TABS
// ============================================================================

// Tab: Intent Details (Basic info only)
function IntentDetailsTab({ 
  intent, 
  modules,
  onChange 
}: { 
  intent: Intent; 
  modules: Module[];
  onChange: (updates: Partial<Intent>) => void;
}) {
  const selectedModule = modules.find(m => m.id === intent.moduleId);
  const subModules = selectedModule?.subModules || [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Intent Name</label>
          <input
            type="text"
            value={intent.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <div className="flex items-center gap-3 mt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={intent.isActive}
                onChange={(e) => onChange({ isActive: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-sm">Active</span>
            </label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Module</label>
          <select
            value={intent.moduleId}
            onChange={(e) => onChange({ moduleId: e.target.value, subModuleId: '' })}
            className="w-full px-3 py-2 border rounded-lg bg-white"
          >
            {modules.map(m => (
              <option key={m.id} value={m.id}>{m.icon} {m.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sub-Module</label>
          <select
            value={intent.subModuleId}
            onChange={(e) => onChange({ subModuleId: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg bg-white"
          >
            {subModules.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={intent.description || ''}
          onChange={(e) => onChange({ description: e.target.value || undefined })}
          rows={3}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Optional description..."
        />
      </div>

      {/* Metadata */}
      <div className="pt-4 border-t">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Metadata</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Created:</span>
            <span className="ml-2">{new Date(intent.createdAt).toLocaleString()}</span>
          </div>
          <div>
            <span className="text-gray-500">Updated:</span>
            <span className="ml-2">{new Date(intent.updatedAt).toLocaleString()}</span>
          </div>
          {intent.lastGeneratedAt && (
            <div>
              <span className="text-gray-500">Last Generated:</span>
              <span className="ml-2">{new Date(intent.lastGeneratedAt).toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* API Usage for this Intent */}
      {(intent.totalTokensUsed || intent.generationCount) && (
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <Zap size={14} className="text-purple-500" /> API Usage & Cost
          </h4>
          <div className="grid grid-cols-4 gap-3">
            <div className="p-3 bg-purple-50 rounded-lg text-center">
              <p className="text-lg font-bold text-purple-700">{(intent.totalTokensUsed || 0).toLocaleString()}</p>
              <p className="text-xs text-purple-600">Total Tokens</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg text-center">
              <p className="text-lg font-bold text-blue-700">{intent.generationCount || 0}</p>
              <p className="text-xs text-blue-600">Generations</p>
            </div>
            <div className="p-3 bg-cyan-50 rounded-lg text-center">
              <p className="text-lg font-bold text-cyan-700">{(intent.lastGenerationTokens || 0).toLocaleString()}</p>
              <p className="text-xs text-cyan-600">Last Generation</p>
            </div>
            <div className="p-3 bg-gradient-to-br from-green-50 to-green-100 rounded-lg text-center border border-green-200">
              <p className="text-lg font-bold text-green-700">
                ${((intent.totalTokensUsed || 0) * 0.00001).toFixed(4)}
              </p>
              <p className="text-xs text-green-600">Est. Cost (USD)</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Tab: Training Phrases (AI Generated → Editable)
function TrainingPhrasesTab({ 
  intent, 
  onChange,
  onRegenerate,
  isRegenerating
}: { 
  intent: Intent; 
  onChange: (updates: Partial<Intent>) => void;
  onRegenerate: (count?: number) => void;
  isRegenerating: boolean;
}) {
  const [newPhrase, setNewPhrase] = useState('');
  const [phraseCount, setPhraseCount] = useState(10);

  const addPhrase = () => {
    if (newPhrase.trim()) {
      onChange({ trainingPhrases: [...intent.trainingPhrases, newPhrase.trim()] });
      setNewPhrase('');
    }
  };

  const removePhrase = (index: number) => {
    onChange({ trainingPhrases: intent.trainingPhrases.filter((_, i) => i !== index) });
  };

  const updatePhrase = (index: number, value: string) => {
    const updated = [...intent.trainingPhrases];
    updated[index] = value;
    onChange({ trainingPhrases: updated });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-gray-900">Training Phrases</h3>
          <p className="text-sm text-gray-500">Example queries that map to this intent. Use {'{{entityName}}'} for variables.</p>
        </div>
        {intent.generatedBy === 'ai' && (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
            🤖 AI Generated
            {intent.aiConfidence && <span className="text-purple-500">({Math.round(intent.aiConfidence * 100)}%)</span>}
          </span>
        )}
      </div>

      {/* AI Generation Controls */}
      <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-purple-700">Generate</label>
            <input
              type="number"
              min="1"
              max="50"
              value={phraseCount}
              onChange={(e) => setPhraseCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 10)))}
              className="w-20 px-2 py-1.5 border border-purple-300 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <span className="text-sm text-purple-600">phrases</span>
          </div>
          <button
            onClick={() => onRegenerate(phraseCount)}
            disabled={isRegenerating}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg flex items-center gap-2 hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            {isRegenerating ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Wand2 size={16} />
            )}
            {isRegenerating ? 'Generating...' : 'Generate with AI'}
          </button>
          <p className="text-xs text-purple-500 ml-auto">
            {intent.trainingPhrases.length > 0 ? 'New phrases will be added to existing ones' : 'AI will generate based on intent name & description'}
          </p>
        </div>
      </div>

      {/* Existing Phrases */}
      <div className="space-y-2">
        {intent.trainingPhrases.map((phrase, index) => (
          <div key={index} className="flex gap-2 group">
            <span className="text-gray-400 text-sm w-6 pt-2">{index + 1}.</span>
            <input
              type="text"
              value={phrase}
              onChange={(e) => updatePhrase(index, e.target.value)}
              className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => removePhrase(index)}
              className="p-2 text-red-500 hover:bg-red-50 rounded transition-colors opacity-50 group-hover:opacity-100"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* Manual Add */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newPhrase}
          onChange={(e) => setNewPhrase(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addPhrase()}
          placeholder="Add new training phrase manually..."
          className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={addPhrase}
          disabled={!newPhrase.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Plus size={16} /> Add
        </button>
      </div>

      {intent.trainingPhrases.length === 0 && (
        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed">
          <MessageSquare size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="text-gray-500">No training phrases yet</p>
          <p className="text-sm text-gray-400 mt-1">Use "Generate with AI" above or add phrases manually</p>
        </div>
      )}

      {/* Tips */}
      <div className="p-3 bg-blue-50 rounded-lg">
        <p className="text-sm text-blue-700 font-medium mb-1">💡 Tips for better training phrases:</p>
        <ul className="text-xs text-blue-600 space-y-0.5">
          <li>• Include variations in wording (e.g., "show", "display", "what is")</li>
          <li>• Use {'{{entityName}}'} placeholders for variables (e.g., "Show top {'{{limit}}'} payables")</li>
          <li>• Include common misspellings or abbreviations users might use</li>
          <li>• Mix formal and informal phrasings</li>
        </ul>
      </div>
    </div>
  );
}

// Tab: Entities (AI Generated → Editable)
function EntitiesTab({ 
  intent, 
  onChange,
  onRegenerate,
  isRegenerating,
  entityTypes
}: { 
  intent: Intent; 
  onChange: (updates: Partial<Intent>) => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
  entityTypes: EntityType[];
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const addEntity = () => {
    const newEntity: Entity = {
      name: '',
      type: 'string',
      required: false
    };
    onChange({ entities: [...intent.entities, newEntity] });
    setEditingIndex(intent.entities.length);
  };

  const updateEntity = (index: number, updates: Partial<Entity>) => {
    const updated = [...intent.entities];
    updated[index] = { ...updated[index], ...updates };
    onChange({ entities: updated });
  };

  const removeEntity = (index: number) => {
    onChange({ entities: intent.entities.filter((_, i) => i !== index) });
    setEditingIndex(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-gray-900">Tool Parameters</h3>
          <p className="text-sm text-gray-500">Parameters extracted from queries and passed to MCP tools</p>
        </div>
        <AIBadge 
          confidence={intent.aiConfidence} 
          onRegenerate={onRegenerate}
          isRegenerating={isRegenerating}
        />
      </div>

      <div className="space-y-3">
        {intent.entities.map((entity, index) => (
          <div key={index} className="p-4 border rounded-lg bg-white">
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name</label>
                <input
                  type="text"
                  value={entity.name}
                  onChange={(e) => updateEntity(index, { name: e.target.value })}
                  className="w-full px-2 py-1.5 border rounded text-sm"
                  placeholder="entityName"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Type</label>
                <select
                  value={entity.type}
                  onChange={(e) => updateEntity(index, { type: e.target.value })}
                  className="w-full px-2 py-1.5 border rounded text-sm bg-white"
                >
                  {entityTypes.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Default Value</label>
                <input
                  type="text"
                  value={entity.defaultValue || ''}
                  onChange={(e) => updateEntity(index, { defaultValue: e.target.value || undefined })}
                  className="w-full px-2 py-1.5 border rounded text-sm"
                  placeholder="Optional"
                />
              </div>
              <div className="flex items-end justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={entity.required}
                    onChange={(e) => updateEntity(index, { required: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm">Required</span>
                </label>
                <button
                  onClick={() => removeEntity(index)}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs text-gray-500 mb-1">Follow-up Prompt</label>
              <input
                type="text"
                value={entity.prompt || ''}
                onChange={(e) => updateEntity(index, { prompt: e.target.value || undefined })}
                className="w-full px-2 py-1.5 border rounded text-sm"
                placeholder="Question to ask if entity is missing..."
              />
            </div>
            {entity.type === 'enum' && (
              <div className="mt-3">
                <label className="block text-xs text-gray-500 mb-1">Enum Values (comma-separated)</label>
                <input
                  type="text"
                  value={entity.enumValues?.join(', ') || ''}
                  onChange={(e) => updateEntity(index, { 
                    enumValues: e.target.value.split(',').map(v => v.trim()).filter(v => v) 
                  })}
                  className="w-full px-2 py-1.5 border rounded text-sm"
                  placeholder="value1, value2, value3"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={addEntity}
        className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-500 hover:text-blue-500 transition-colors flex items-center justify-center gap-2"
      >
        <Plus size={16} /> Add Entity
      </button>

      {intent.entities.length === 0 && (
        <div className="text-center py-6 text-gray-500 text-sm">
          <Variable size={24} className="mx-auto mb-2 text-gray-300" />
          <p>No tool parameters defined</p>
          <p className="text-gray-400">AI detected no required parameters for this intent</p>
        </div>
      )}
    </div>
  );
}

// Tab: Data Pipeline (AI Generated → Fully Editable)
function DataPipelineTab({ 
  intent, 
  mcpTools,
  onChange,
  onRegenerate,
  isRegenerating
}: { 
  intent: Intent; 
  mcpTools: MCPTool[];
  onChange: (updates: Partial<Intent>) => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
}) {
  const pipeline = intent.resolutionFlow?.dataPipeline || [];
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const [toolCheckResults, setToolCheckResults] = useState<Record<string, 'found' | 'missing'> | null>(null);
  
  // AI Suggested Pipeline state — backed by module-level store for persistence + DB
  const savedAiSuggestion = intent.resolutionFlow?.aiSuggestion;
  const [suggestedPipeline, setSuggestedPipeline] = useState<any | null>(() => {
    const existing = pendingSuggestions.get(intent.id);
    if (existing?.status === 'done') return existing.data;
    // Fall back to DB-persisted aiSuggestion
    if (savedAiSuggestion?.summary) return savedAiSuggestion;
    return null;
  });
  const [isSuggesting, setIsSuggesting] = useState(() => {
    return pendingSuggestions.get(intent.id)?.status === 'pending';
  });
  const [showSuggestion, setShowSuggestion] = useState(() => {
    if (pendingSuggestions.get(intent.id)?.status === 'done') return true;
    // Auto-show if we have a saved AI suggestion
    return !!savedAiSuggestion?.summary;
  });

  // Listen for background suggestion completion
  useEffect(() => {
    const existing = pendingSuggestions.get(intent.id);
    if (existing?.status === 'done') {
      setSuggestedPipeline(existing.data);
      setShowSuggestion(true);
      setIsSuggesting(false);
    } else if (existing?.status === 'pending') {
      setIsSuggesting(true);
    }

    suggestionListeners.set(intent.id, (result) => {
      if (result.status === 'done') {
        setSuggestedPipeline(result.data);
        setShowSuggestion(true);
      }
      setIsSuggesting(false);
    });

    return () => { suggestionListeners.delete(intent.id); };
  }, [intent.id]);

  // Validate pipeline tools against MCP tools master
  const checkPipelineTools = useCallback(() => {
    const results: Record<string, 'found' | 'missing'> = {};
    for (const node of pipeline) {
      if (node.nodeType === 'api_call' && node.mcpTool) {
        const exists = mcpTools.some(t => t.id === node.mcpTool || t.name === node.mcpTool);
        results[node.mcpTool] = exists ? 'found' : 'missing';
      }
    }
    setToolCheckResults(results);
  }, [pipeline, mcpTools]);

  // Cross-reference suggested pipeline steps against real MCP tools inventory
  const recheckMcpToolMatch = useCallback(() => {
    if (!suggestedPipeline?.steps) return;
    const mcpToolNames = new Set(mcpTools.map(t => t.id));
    const mcpToolNamesAlt = new Set(mcpTools.map(t => t.name));
    const updatedSteps = suggestedPipeline.steps.map((step: any) => {
      if (step.nodeType !== 'api_call' || !step.mcpTool) return step;
      const found = mcpToolNames.has(step.mcpTool) || mcpToolNamesAlt.has(step.mcpTool);
      return { ...step, toolAvailable: found };
    });
    setSuggestedPipeline({ ...suggestedPipeline, steps: updatedSteps });
  }, [suggestedPipeline, mcpTools]);

  // Auto-recheck when suggestion loads or mcpTools change
  useEffect(() => {
    if (suggestedPipeline?.steps && mcpTools.length > 0) {
      recheckMcpToolMatch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mcpTools.length, showSuggestion]);

  // Use the global MCP tool resolver
  const resolveMcpToolId = useCallback((generatedName: string | undefined): string => {
    return resolveMcpToolIdWithTools(generatedName, mcpTools);
  }, [mcpTools]);

  // Define updatePipeline first so it can be used in useEffect
  const updatePipeline = useCallback((newPipeline: PipelineNode[]) => {
    onChange({
      resolutionFlow: {
        ...intent.resolutionFlow!,
        dataPipeline: newPipeline
      }
    });
  }, [onChange, intent.resolutionFlow]);

  // AI Suggest Ideal Pipeline — fires in background, persists across navigation
  const suggestIdealPipeline = useCallback(() => {
    setIsSuggesting(true);
    fireSuggestionInBackground(
      intent.id,
      intent.name,
      {
        intentName: intent.name,
        description: intent.description,
        trainingPhrases: intent.trainingPhrases,
        entities: intent.entities,
        currentPipeline: pipeline,
        availableTools: mcpTools.map(t => t.id),
      },
      globalNavigateToIntent || undefined
    );
  }, [intent, pipeline, mcpTools]);

  // Apply suggested pipeline (replace all)
  const applyAllSuggested = useCallback(() => {
    if (!suggestedPipeline?.steps) return;
    const newPipeline: PipelineNode[] = suggestedPipeline.steps.map((step: any, i: number) => ({
      nodeId: `ai_${Date.now()}_${i}`,
      nodeType: step.nodeType,
      sequence: i + 1,
      mcpTool: step.nodeType === 'api_call' ? step.mcpTool : undefined,
      parameters: [],
      formula: step.nodeType === 'computation' ? (step.formula || '') : undefined,
      condition: step.nodeType === 'conditional' ? (step.condition || '') : undefined,
      outputVariable: step.outputVariable,
      description: step.description,
    }));
    updatePipeline(newPipeline);
    setShowSuggestion(false);
    toast({ title: 'Pipeline replaced with AI suggestion' });
  }, [suggestedPipeline, updatePipeline]);

  // Merge only missing steps
  const mergeMissingSuggested = useCallback(() => {
    if (!suggestedPipeline?.steps) return;
    const existingTools = new Set(pipeline.filter(n => n.mcpTool).map(n => n.mcpTool));
    const existingVars = new Set(pipeline.map(n => n.outputVariable));
    const newSteps = suggestedPipeline.steps.filter((step: any) => {
      if (step.nodeType === 'api_call' && step.mcpTool && existingTools.has(step.mcpTool)) return false;
      if (existingVars.has(step.outputVariable)) return false;
      return true;
    });
    if (newSteps.length === 0) {
      toast({ title: 'No new steps to merge', description: 'All suggested steps already exist' });
      return;
    }
    const merged: PipelineNode[] = [
      ...pipeline,
      ...newSteps.map((step: any, i: number) => ({
        nodeId: `ai_${Date.now()}_${i}`,
        nodeType: step.nodeType,
        sequence: pipeline.length + i + 1,
        mcpTool: step.nodeType === 'api_call' ? step.mcpTool : undefined,
        parameters: [],
        formula: step.nodeType === 'computation' ? (step.formula || '') : undefined,
        condition: step.nodeType === 'conditional' ? (step.condition || '') : undefined,
        outputVariable: step.outputVariable,
        description: step.description,
      })),
    ];
    updatePipeline(merged);
    setShowSuggestion(false);
    toast({ title: `Merged ${newSteps.length} new steps into pipeline` });
  }, [suggestedPipeline, pipeline, updatePipeline]);

  // Auto-fix pipeline nodes when mcpTools load or change
  useEffect(() => {
    if (mcpTools.length === 0) return;
    if (pipeline.length === 0) return;
    
    let hasChanges = false;
    const fixedPipeline = pipeline.map(node => {
      if (node.nodeType !== 'api_call' || !node.mcpTool) return node;
      
      // Check if current mcpTool is valid
      const isValidTool = mcpTools.some(t => t.id === node.mcpTool);
      if (isValidTool) return node;
      
      // Try to resolve to a valid tool
      const resolvedId = resolveMcpToolId(node.mcpTool);
      const isResolvedValid = mcpTools.some(t => t.id === resolvedId);
      
      if (resolvedId && isResolvedValid && resolvedId !== node.mcpTool) {
        console.log(`🔄 Auto-fixing pipeline node: ${node.mcpTool} → ${resolvedId}`);
        hasChanges = true;
        return { ...node, mcpTool: resolvedId };
      }
      
      return node;
    });
    
    if (hasChanges) {
      updatePipeline(fixedPipeline);
    }
  }, [mcpTools, pipeline, resolveMcpToolId, updatePipeline]);

  const addNode = (type: 'api_call' | 'computation' | 'conditional') => {
    const newNode: PipelineNode = {
      nodeId: `n${Date.now()}`,
      nodeType: type,
      sequence: pipeline.length + 1,
      mcpTool: type === 'api_call' ? mcpTools[0]?.id : undefined,
      parameters: [],
      formula: type === 'computation' ? '' : undefined,
      condition: type === 'conditional' ? '' : undefined,
      outputVariable: `result${pipeline.length + 1}`,
      description: ''
    };
    updatePipeline([...pipeline, newNode]);
    setExpandedNode(newNode.nodeId);
  };

  const updateNode = (index: number, updates: Partial<PipelineNode>) => {
    const updated = [...pipeline];
    updated[index] = { ...updated[index], ...updates };
    updatePipeline(updated);
  };

  const removeNode = (index: number) => {
    updatePipeline(pipeline.filter((_, i) => i !== index));
    setExpandedNode(null);
  };

  const moveNode = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === pipeline.length - 1)) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...pipeline];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    // Update sequence numbers
    updated.forEach((node, i) => { node.sequence = i + 1; });
    updatePipeline(updated);
  };

  const addParameter = (nodeIndex: number) => {
    const updated = [...pipeline];
    updated[nodeIndex].parameters.push({ name: '', value: '', source: 'static' });
    updatePipeline(updated);
  };

  const updateParameter = (nodeIndex: number, paramIndex: number, updates: Partial<PipelineParameter>) => {
    const updated = [...pipeline];
    updated[nodeIndex].parameters[paramIndex] = { ...updated[nodeIndex].parameters[paramIndex], ...updates };
    updatePipeline(updated);
  };

  const removeParameter = (nodeIndex: number, paramIndex: number) => {
    const updated = [...pipeline];
    updated[nodeIndex].parameters = updated[nodeIndex].parameters.filter((_, i) => i !== paramIndex);
    updatePipeline(updated);
  };

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'api_call': return <Database size={16} className="text-blue-600" />;
      case 'computation': return <Zap size={16} className="text-amber-600" />;
      case 'conditional': return <GitBranch size={16} className="text-green-600" />;
      default: return null;
    }
  };

  const getNodeColor = (type: string) => {
    switch (type) {
      case 'api_call': return 'border-blue-200 bg-blue-50';
      case 'computation': return 'border-amber-200 bg-amber-50';
      case 'conditional': return 'border-green-200 bg-green-50';
      default: return 'border-gray-200 bg-gray-50';
    }
  };

  const personaConfig = [
    { key: 'bookkeeper', label: 'Bookkeeper', icon: '📒', color: 'bg-emerald-100 text-emerald-800' },
    { key: 'accountant', label: 'Accountant', icon: '📊', color: 'bg-blue-100 text-blue-800' },
    { key: 'cfo', label: 'CFO', icon: '💼', color: 'bg-purple-100 text-purple-800' },
    { key: 'businessOwner', label: 'Owner', icon: '🏢', color: 'bg-amber-100 text-amber-800' },
    { key: 'financialAdviser', label: 'Adviser', icon: '🎯', color: 'bg-rose-100 text-rose-800' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-gray-900">Data Pipeline</h3>
          <p className="text-sm text-gray-500">Sequence of data fetching and computation steps</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={suggestIdealPipeline}
            disabled={isSuggesting}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-40 flex items-center gap-1.5"
          >
            {isSuggesting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {isSuggesting ? 'Analyzing...' : 'Suggest Ideal Pipeline'}
          </button>
          <button
            onClick={checkPipelineTools}
            disabled={pipeline.filter(n => n.nodeType === 'api_call').length === 0}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 flex items-center gap-1.5"
          >
            <CheckCircle2 size={13} /> Check Tools
          </button>
          <AIBadge 
            confidence={intent.aiConfidence} 
            onRegenerate={onRegenerate}
            isRegenerating={isRegenerating}
          />
        </div>
      </div>

      {/* Loading skeleton while GPT-5.2 is analyzing */}
      {isSuggesting && !suggestedPipeline && (
        <div className="rounded-xl border-2 border-violet-200 overflow-hidden animate-pulse">
          <div className="bg-gradient-to-r from-violet-400/60 to-purple-500/60 px-4 py-3 flex items-center gap-3">
            <Loader2 size={16} className="text-white animate-spin" />
            <span className="text-white text-sm font-semibold">GPT-5.2 is analyzing your pipeline…</span>
          </div>
          <div className="p-4 bg-violet-50/50 space-y-4">
            {/* Persona badges skeleton */}
            <div className="flex gap-2">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-7 w-24 rounded-full bg-violet-200/60" />
              ))}
            </div>
            {/* Summary skeleton */}
            <div className="space-y-2">
              <div className="h-4 w-3/4 rounded bg-violet-200/50" />
              <div className="h-4 w-1/2 rounded bg-violet-200/40" />
            </div>
            {/* Step cards skeleton */}
            {[1,2,3].map(i => (
              <div key={i} className="rounded-lg border border-violet-200/60 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded bg-violet-200/60" />
                  <div className="h-4 w-40 rounded bg-violet-200/50" />
                  <div className="ml-auto h-5 w-20 rounded-full bg-violet-200/40" />
                </div>
                <div className="h-3 w-2/3 rounded bg-violet-100/60" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Suggested Pipeline Panel */}
      {showSuggestion && suggestedPipeline && (
        <div className="rounded-xl border-2 border-violet-200 overflow-hidden">
          {/* Header */}
           <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <Sparkles size={16} />
              <span className="font-semibold text-sm">AI Ideal Pipeline</span>
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{suggestedPipeline.steps?.length || 0} steps</span>
              {(() => {
                const apiSteps = (suggestedPipeline.steps || []).filter((s: any) => s.nodeType === 'api_call');
                const matched = apiSteps.filter((s: any) => s.toolAvailable !== false).length;
                const missing = apiSteps.length - matched;
                return (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    missing === 0 ? 'bg-emerald-400/30 text-emerald-100' : 'bg-amber-400/30 text-amber-100'
                  }`}>
                    {matched}/{apiSteps.length} tools matched{missing > 0 ? ` · ${missing} missing` : ''}
                  </span>
                );
              })()}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={recheckMcpToolMatch} className="px-3 py-1 text-xs font-medium bg-white/20 text-white rounded-lg hover:bg-white/30 flex items-center gap-1" title="Re-check tool availability against current MCP inventory">
                <RefreshCw size={12} /> Recheck Tools
              </button>
              <button onClick={applyAllSuggested} className="px-3 py-1 text-xs font-medium bg-white text-violet-700 rounded-lg hover:bg-violet-50 flex items-center gap-1">
                <Check size={12} /> Apply All
              </button>
              <button onClick={mergeMissingSuggested} className="px-3 py-1 text-xs font-medium bg-white/20 text-white rounded-lg hover:bg-white/30 flex items-center gap-1">
                <Plus size={12} /> Merge Missing
              </button>
              <button onClick={() => setShowSuggestion(false)} className="p-1 text-white/70 hover:text-white">
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="p-4 bg-violet-50/50 space-y-4">
            {/* Summary */}
            {suggestedPipeline.summary && (
              <p className="text-sm text-violet-800">{suggestedPipeline.summary}</p>
            )}

            {/* Persona Relevance */}
            {suggestedPipeline.personaRelevance && (
              <div className="flex flex-wrap gap-2">
                {personaConfig.map(p => {
                  const score = suggestedPipeline.personaRelevance?.[p.key] || 0;
                  return (
                    <div key={p.key} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${p.color}`}>
                      <span>{p.icon}</span>
                      <span>{p.label}</span>
                      <span className="font-bold">{score}%</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Suggested Steps */}
            <div className="space-y-2">
              {(suggestedPipeline.steps || []).map((step: any, i: number) => {
                const isToolMissing = step.nodeType === 'api_call' && step.toolAvailable === false;
                return (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${
                    isToolMissing ? 'border-amber-200 bg-amber-50/50' : 'border-violet-200 bg-white'
                  }`}>
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 text-violet-700 text-xs font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getNodeIcon(step.nodeType)}
                        <span className="font-medium text-sm">
                          {step.nodeType === 'api_call' && `@${step.mcpTool || 'unknown'}`}
                          {step.nodeType === 'computation' && '$Computation'}
                          {step.nodeType === 'conditional' && '#Conditional'}
                        </span>
                        <ArrowRight size={12} className="text-gray-400" />
                        <code className="text-xs bg-violet-100 px-1.5 py-0.5 rounded">{step.outputVariable}</code>
                        {step.priority === 'must_have' && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">Must Have</span>
                        )}
                        {step.priority === 'recommended' && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">Recommended</span>
                        )}
                        {step.priority === 'nice_to_have' && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">Nice to Have</span>
                        )}
                        {isToolMissing && (
                          <span className="flex items-center gap-1 text-xs text-amber-600">
                            <AlertTriangle size={12} /> Missing
                          </span>
                        )}
                        {step.nodeType === 'api_call' && step.toolAvailable !== false && (
                          <CheckCircle2 size={12} className="text-emerald-500" />
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-1">{step.description}</p>
                      {isToolMissing && step.fallbackSuggestion && (
                        <p className="text-xs text-amber-700 mt-1 italic">💡 {step.fallbackSuggestion}</p>
                      )}
                      {step.personas && step.personas.length > 0 && (
                        <div className="flex gap-1 mt-1.5">
                          {step.personas.map((pKey: string) => {
                            const pc = personaConfig.find(p => p.key === pKey);
                            return pc ? (
                              <span key={pKey} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                {pc.icon} {pc.label}
                              </span>
                            ) : null;
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tool Check Results Banner */}
      {toolCheckResults && (() => {
        const missingTools = Object.entries(toolCheckResults).filter(([, s]) => s === 'missing');
        const total = Object.keys(toolCheckResults).length;
        if (missingTools.length === 0) {
          return (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
              <CheckCircle2 size={14} /> All {total} pipeline tools found in MCP inventory
            </div>
          );
        }
        return (
          <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs space-y-1">
            <div className="font-medium text-red-700 flex items-center gap-1.5">
              <AlertTriangle size={14} /> {missingTools.length} of {total} tools missing from MCP inventory
            </div>
            {missingTools.map(([name]) => (
              <div key={name} className="text-red-600 font-mono ml-5">• {name}</div>
            ))}
          </div>
        );
      })()}

      {!intent.resolutionFlow ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed">
          <Database size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500 text-lg">No resolution flow configured</p>
          <p className="text-gray-400 text-sm mt-1">Click "Regenerate" to have AI generate the pipeline</p>
        </div>
      ) : (
        <>
          {/* Pipeline Nodes */}
          <div className="space-y-3">
            {pipeline.map((node, index) => {
              const isExpanded = expandedNode === node.nodeId;
              const selectedTool = mcpTools.find(t => t.id === node.mcpTool);
              
              return (
                <div key={node.nodeId} className="relative">
                  {/* Connector Line */}
                  {index > 0 && (
                    <div className="absolute left-6 -top-3 w-0.5 h-3 bg-gray-300" />
                  )}
                  
                  {/* Node Card */}
                  <div className={`border-2 rounded-lg overflow-hidden ${getNodeColor(node.nodeType)}`}>
                    {/* Node Header */}
                    <div 
                      className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-white/50"
                      onClick={() => setExpandedNode(isExpanded ? null : node.nodeId)}
                    >
                      <div className="flex items-center justify-center w-8 h-8 bg-white rounded-lg font-bold text-sm shadow-sm">
                        {node.sequence}
                      </div>
                      <div className="flex items-center gap-2 flex-1">
                        {getNodeIcon(node.nodeType)}
                        <span className="font-medium text-sm">
                          {node.nodeType === 'api_call' && `@${node.mcpTool || 'select_tool'}`}
                          {node.nodeType === 'computation' && '$Computation'}
                          {node.nodeType === 'conditional' && '#Conditional'}
                        </span>
                        <ArrowRight size={14} className="text-gray-400" />
                        <code className="text-xs bg-white px-2 py-0.5 rounded shadow-sm">{node.outputVariable}</code>
                        {toolCheckResults && node.nodeType === 'api_call' && node.mcpTool && (
                          toolCheckResults[node.mcpTool] === 'found'
                            ? <CheckCircle2 size={13} className="text-emerald-500" />
                            : toolCheckResults[node.mcpTool] === 'missing'
                            ? <AlertTriangle size={13} className="text-red-500" />
                            : null
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); moveNode(index, 'up'); }}
                          disabled={index === 0}
                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        >
                          <ChevronUp size={16} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); moveNode(index, 'down'); }}
                          disabled={index === pipeline.length - 1}
                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        >
                          <ChevronDown size={16} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeNode(index); }}
                          className="p-1 text-red-400 hover:text-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>

                    {/* Node Details (Expanded) */}
                    {isExpanded && (
                      <div className="px-4 py-4 bg-white border-t space-y-4">
                        {/* Description */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                          <input
                            type="text"
                            value={node.description}
                            onChange={(e) => updateNode(index, { description: e.target.value })}
                            placeholder="What does this step do?"
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                          />
                        </div>

                        {/* Output Variable */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Output Variable</label>
                          <input
                            type="text"
                            value={node.outputVariable}
                            onChange={(e) => updateNode(index, { outputVariable: e.target.value })}
                            placeholder="resultVariable"
                            className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                          />
                        </div>

                        {/* API Call Specific */}
                        {node.nodeType === 'api_call' && (
                          <>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">MCP Tool</label>
                              <select
                                value={resolveMcpToolId(node.mcpTool)}
                                onChange={(e) => updateNode(index, { mcpTool: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                              >
                                <option value="">Select a tool...</option>
                                {mcpTools.map(tool => (
                                  <option key={tool.id} value={tool.id}>@{tool.id} - {tool.description}</option>
                                ))}
                              </select>
                            </div>

                            {/* Parameters */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-medium text-gray-600">Parameters</label>
                                <button
                                  onClick={() => addParameter(index)}
                                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                >
                                  <Plus size={12} /> Add Parameter
                                </button>
                              </div>
                              
                              {selectedTool && (
                                <div className="text-xs text-gray-500 mb-2">
                                  Available: {selectedTool.parameters.map(p => p.name).join(', ')}
                                </div>
                              )}

                              {node.parameters.length === 0 ? (
                                <p className="text-xs text-gray-400 italic">No parameters configured</p>
                              ) : (
                                <div className="space-y-2">
                                  {node.parameters.map((param, pIndex) => (
                                    <div key={pIndex} className="flex gap-2 items-start">
                                      <input
                                        type="text"
                                        value={param.name}
                                        onChange={(e) => updateParameter(index, pIndex, { name: e.target.value })}
                                        placeholder="name"
                                        className="w-28 px-2 py-1.5 border rounded text-xs font-mono"
                                      />
                                      <span className="text-gray-400 py-1.5">=</span>
                                      <input
                                        type="text"
                                        value={param.value}
                                        onChange={(e) => updateParameter(index, pIndex, { value: e.target.value })}
                                        placeholder="value"
                                        className="flex-1 px-2 py-1.5 border rounded text-xs font-mono"
                                      />
                                      <select
                                        value={param.source}
                                        onChange={(e) => updateParameter(index, pIndex, { source: e.target.value as any })}
                                        className="w-32 px-2 py-1.5 border rounded text-xs bg-white"
                                      >
                                        <option value="static">Static</option>
                                        <option value="entity">From Entity</option>
                                        <option value="context">From Context</option>
                                        <option value="previous_node">Previous Node</option>
                                      </select>
                                      <button
                                        onClick={() => removeParameter(index, pIndex)}
                                        className="p-1.5 text-red-400 hover:text-red-600"
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </>
                        )}

                        {/* Computation Specific */}
                        {node.nodeType === 'computation' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Formula</label>
                            <textarea
                              value={node.formula || ''}
                              onChange={(e) => updateNode(index, { formula: e.target.value })}
                              placeholder="e.g., cashData.totalBalance / avgMonthlyBurn"
                              rows={2}
                              className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Reference variables from previous nodes (e.g., cashData.totalBalance)
                            </p>
                          </div>
                        )}

                        {/* Conditional Specific */}
                        {node.nodeType === 'conditional' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Condition</label>
                            <textarea
                              value={node.condition || ''}
                              onChange={(e) => updateNode(index, { condition: e.target.value })}
                              placeholder="e.g., runwayMonths < 3"
                              rows={2}
                              className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Boolean expression using variables from previous nodes
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Node Buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => addNode('api_call')}
              className="flex-1 py-3 border-2 border-dashed border-blue-300 rounded-lg text-sm text-blue-600 hover:bg-blue-50 hover:border-blue-400 transition-colors flex items-center justify-center gap-2"
            >
              <Database size={16} /> + @API Call
            </button>
            <button
              onClick={() => addNode('computation')}
              className="flex-1 py-3 border-2 border-dashed border-amber-300 rounded-lg text-sm text-amber-600 hover:bg-amber-50 hover:border-amber-400 transition-colors flex items-center justify-center gap-2"
            >
              <Zap size={16} /> + $Computation
            </button>
            <button
              onClick={() => addNode('conditional')}
              className="flex-1 py-3 border-2 border-dashed border-green-300 rounded-lg text-sm text-green-600 hover:bg-green-50 hover:border-green-400 transition-colors flex items-center justify-center gap-2"
            >
              <GitBranch size={16} /> + #Conditional
            </button>
          </div>

          {/* Pipeline Legend */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs font-medium text-gray-700 mb-2">Pipeline Node Types:</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="flex items-center gap-2">
                <Database size={14} className="text-blue-600" />
                <span><strong>@API Call</strong> - Fetch data from MCP tools</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-amber-600" />
                <span><strong>$Computation</strong> - Calculate derived values</span>
              </div>
              <div className="flex items-center gap-2">
                <GitBranch size={14} className="text-green-600" />
                <span><strong>#Conditional</strong> - Branch based on conditions</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Intent List View
function IntentListView({ 
  intents, modules, searchTerm, filterModule, filterStatus,
  onSearchChange, onFilterModuleChange, onFilterStatusChange,
  onSelectIntent, onAddIntent, onDeleteIntent, onGenerateFlow,
  onImport, onExportCSV, onExportJSON, onDownloadTemplate, onOpenAIGenerator,
  isGenerating, isImporting, generationProgress, mcpTools
}: {
  intents: Intent[];
  modules: Module[];
  searchTerm: string;
  filterModule: string | null;
  filterStatus: 'all' | 'configured' | 'pending';
  onSearchChange: (v: string) => void;
  onFilterModuleChange: (v: string | null) => void;
  onFilterStatusChange: (v: 'all' | 'configured' | 'pending') => void;
  onSelectIntent: (id: string) => void;
  onAddIntent: () => void;
  onDeleteIntent: (id: string) => void;
  onGenerateFlow: (id: string) => void;
  onImport: (file: File) => void;
  onExportCSV: () => void;
  onExportJSON: () => void;
  onDownloadTemplate: () => void;
  onOpenAIGenerator: () => void;
  isGenerating: string | null;
  isImporting: boolean;
  generationProgress: { current: number; total: number };
  mcpTools: MCPTool[];
}) {
  const [activeSubTab, setActiveSubTab] = useState<'intents' | 'cases'>('intents');
  const [selectedIntentIds, setSelectedIntentIds] = useState<Set<string>>(new Set());
  const [bulkGenProgress, setBulkGenProgress] = useState({ running: false, current: 0, total: 0, completed: 0, failed: 0 });
  const [queueProgress, setQueueProgress] = useState({ ...suggestionQueue });

  // Subscribe to queue state changes
  useEffect(() => {
    const listener = () => setQueueProgress({ ...suggestionQueue });
    queueStateListeners.add(listener);
    return () => { queueStateListeners.delete(listener); };
  }, []);

  const allSelected = intents.length > 0 && selectedIntentIds.size === intents.length;
  const someSelected = selectedIntentIds.size > 0 && selectedIntentIds.size < intents.length;

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIntentIds(new Set());
    else setSelectedIntentIds(new Set(intents.map(i => i.id)));
  };

  const toggleSelectIntent = (id: string) => {
    const next = new Set(selectedIntentIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIntentIds(next);
  };

  const handleBulkGenerate = async (section: string) => {
    const ids = Array.from(selectedIntentIds);
    if (ids.length === 0) return;
    setBulkGenProgress({ running: true, current: 0, total: ids.length, completed: 0, failed: 0 });
    for (let i = 0; i < ids.length; i++) {
      setBulkGenProgress(prev => ({ ...prev, current: i + 1 }));
      try {
        onGenerateFlow(ids[i]);
        setBulkGenProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
      } catch (_e) {
        setBulkGenProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
      }
    }
    setBulkGenProgress(prev => ({ ...prev, running: false }));
    setSelectedIntentIds(new Set());
  };

  const handleBulkSuggestPipeline = () => {
    const ids = Array.from(selectedIntentIds);
    if (ids.length === 0) return;
    const toolNames = mcpTools.map(t => t.id);

    // Reset queue stats and populate queue items
    resetQueueStats();
    const queueItems: QueueItem[] = [];
    for (const id of ids) {
      const intent = intents.find(i => i.id === id);
      if (!intent) continue;
      const resFlow = intent.resolutionFlow as any;
      const currentPipeline = resFlow?.dataPipeline || [];
      queueItems.push({
        intentId: intent.id,
        intentName: intent.name,
        body: {
          intentName: intent.name,
          description: intent.description,
          trainingPhrases: intent.trainingPhrases,
          entities: intent.entities,
          currentPipeline,
          availableTools: toolNames,
        },
        onNavigate: globalNavigateToIntent || undefined,
      });
    }

    suggestionQueue.items.push(...queueItems);
    suggestionQueue.total = queueItems.length;
    notifyQueueListeners();
    processQueue();
    setSelectedIntentIds(new Set());
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Intent Management</h2>
          <p className="text-sm text-gray-500">Configure chatbot intents and their AI-generated resolution flows</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button onClick={() => setActiveSubTab('intents')} className={`px-3 py-1.5 rounded text-sm transition-colors ${activeSubTab === 'intents' ? 'bg-white shadow text-gray-900' : 'text-gray-600'}`}>
              Intents
            </button>
            <button onClick={() => setActiveSubTab('cases')} className={`px-3 py-1.5 rounded text-sm transition-colors ${activeSubTab === 'cases' ? 'bg-white shadow text-gray-900' : 'text-gray-600'}`}>
              Test Cases
            </button>
          </div>
          <button onClick={onOpenAIGenerator} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-2">
            <Brain size={16} /> AI Generator
          </button>
          <button onClick={onAddIntent} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2">
            <Plus size={16} /> Add Intent
          </button>
          <div className="relative group">
            <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><MoreVertical size={18} /></button>
            <div className="absolute right-0 mt-1 w-48 bg-white border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <div className="py-1">
                <label className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                  <Upload size={14} className="inline mr-2" /> Import CSV
                  <input type="file" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); }} className="hidden" />
                </label>
                <button onClick={onExportCSV} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"><Download size={14} className="inline mr-2" /> Export CSV</button>
                <button onClick={onExportJSON} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"><FileJson size={14} className="inline mr-2" /> Export JSON</button>
                <button onClick={onDownloadTemplate} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"><FileSpreadsheet size={14} className="inline mr-2" /> Download Template</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {activeSubTab === 'intents' ? (
        <>
      {(isImporting || generationProgress.total > 0) && (
        <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="flex items-center gap-3">
            <Loader2 size={20} className="animate-spin text-purple-600" />
            <div className="flex-1">
              <p className="font-medium text-purple-700">
                {isImporting ? 'Importing intents...' : 'Generating AI configurations...'}
              </p>
              {generationProgress.total > 0 && (
                <div className="mt-2">
                  <div className="h-2 bg-purple-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-purple-600 transition-all duration-300"
                      style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-purple-600 mt-1">
                    {generationProgress.current} of {generationProgress.total} intents configured
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 mb-6 items-center">
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search intents..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={filterModule || ''}
          onChange={(e) => onFilterModuleChange(e.target.value || null)}
          className="px-3 py-2 border rounded-lg bg-white"
        >
          <option value="">All Modules</option>
          {modules.map(m => (
            <option key={m.id} value={m.id}>{m.icon} {m.name}</option>
          ))}
        </select>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {(['all', 'configured', 'pending'] as const).map(status => (
            <button
              key={status}
              onClick={() => onFilterStatusChange(status)}
              className={`px-3 py-1.5 rounded text-sm capitalize transition-colors ${
                filterStatus === status
                  ? 'bg-white shadow text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {status === 'configured' ? '✅ Configured' : status === 'pending' ? '⏳ Pending' : 'All'}
            </button>
          ))}
        </div>

        <div className="text-sm text-gray-500">
          {intents.length} intent{intents.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Bulk Generation Progress */}
      {bulkGenProgress.running && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-3">
            <Loader2 size={20} className="animate-spin text-blue-600" />
            <div className="flex-1">
              <p className="font-medium text-blue-700">
                Generating {bulkGenProgress.current} of {bulkGenProgress.total} selected intents...
              </p>
              <div className="mt-2">
                <div className="h-2.5 bg-blue-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                    style={{ width: `${(bulkGenProgress.current / bulkGenProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-blue-600 mt-1">
                  ✅ {bulkGenProgress.completed} completed · ❌ {bulkGenProgress.failed} failed
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      {!bulkGenProgress.running && bulkGenProgress.total > 0 && bulkGenProgress.completed > 0 && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
          <p className="font-medium text-blue-700">
            ✅ Bulk generation complete: {bulkGenProgress.completed} succeeded, {bulkGenProgress.failed} failed
          </p>
          <button onClick={() => setBulkGenProgress({ running: false, current: 0, total: 0, completed: 0, failed: 0 })} className="text-xs text-blue-500 hover:underline">Dismiss</button>
        </div>
      )}

      {/* AI Pipeline Suggestion Queue Progress */}
      {queueProgress.processing && queueProgress.total > 0 && (
        <div className="mb-6 p-4 bg-violet-50 border border-violet-200 rounded-lg">
          <div className="flex items-center gap-3">
            <Loader2 size={20} className="animate-spin text-violet-600" />
            <div className="flex-1">
              <p className="font-medium text-violet-700">
                AI Pipeline Queue: {queueProgress.current} of {queueProgress.total}
              </p>
              <p className="text-xs text-violet-500 mt-0.5">
                Processing: <span className="font-medium">{queueProgress.currentIntentName}</span>
              </p>
              <div className="mt-2">
                <div className="h-2.5 bg-violet-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-violet-600 transition-all duration-500 rounded-full"
                    style={{ width: `${(queueProgress.current / queueProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-violet-600 mt-1">
                  ✅ {queueProgress.completed} done · ❌ {queueProgress.failed} failed · ⏳ {queueProgress.total - queueProgress.current} remaining
                </p>
              </div>
            </div>
            <button 
              onClick={cancelQueue} 
              className="px-3 py-1.5 text-xs font-medium bg-violet-200 text-violet-700 rounded-lg hover:bg-violet-300 flex items-center gap-1"
            >
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      )}
      {!queueProgress.processing && queueProgress.total > 0 && (queueProgress.completed > 0 || queueProgress.failed > 0) && (
        <div className="mb-6 p-4 bg-violet-50 border border-violet-200 rounded-lg flex items-center justify-between">
          <p className="font-medium text-violet-700">
            {queueProgress.cancelled ? '⏹️ Queue cancelled' : '✅ AI pipeline suggestions complete'}: {queueProgress.completed} succeeded, {queueProgress.failed} failed
          </p>
          <button onClick={resetQueueStats} className="text-xs text-violet-500 hover:underline">Dismiss</button>
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedIntentIds.size > 0 && !bulkGenProgress.running && (
        <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-between">
          <span className="text-sm font-medium text-indigo-700">
            {selectedIntentIds.size} intent{selectedIntentIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-3">
            <div className="relative group">
              <button
                onClick={() => handleBulkGenerate('all')}
                className="px-4 py-2 bg-indigo-600 text-white rounded-l-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
              >
                <Wand2 size={14} />
                Generate All ({selectedIntentIds.size})
              </button>
              <button className="px-2 py-2 bg-indigo-700 text-white rounded-r-lg text-sm hover:bg-indigo-800 transition-colors border-l border-indigo-500">
                <ChevronDown size={14} />
              </button>
              <div className="absolute right-0 mt-1 w-56 bg-white border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
                <div className="py-1 text-sm">
                  <button onClick={() => handleBulkGenerate('all')} className="w-full text-left px-4 py-2 hover:bg-indigo-50 flex items-center gap-2">
                    <Sparkles size={14} className="text-indigo-600" /> Generate Everything
                  </button>
                  <div className="border-t my-1" />
                  <p className="px-4 py-1 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Generate Specific Section</p>
                  <button onClick={() => handleBulkGenerate('training')} className="w-full text-left px-4 py-2 hover:bg-indigo-50 flex items-center gap-2">
                    <MessageSquare size={14} className="text-blue-500" /> Training Phrases
                  </button>
                  <button onClick={() => handleBulkGenerate('entities')} className="w-full text-left px-4 py-2 hover:bg-indigo-50 flex items-center gap-2">
                    <Box size={14} className="text-green-500" /> Entities
                  </button>
                  <button onClick={() => handleBulkGenerate('pipeline')} className="w-full text-left px-4 py-2 hover:bg-indigo-50 flex items-center gap-2">
                    <GitBranch size={14} className="text-purple-500" /> Data Pipeline
                  </button>
                  <button onClick={() => handleBulkGenerate('enrichments')} className="w-full text-left px-4 py-2 hover:bg-indigo-50 flex items-center gap-2">
                    <Zap size={14} className="text-amber-500" /> Enrichments
                  </button>
                  <button onClick={() => handleBulkGenerate('response')} className="w-full text-left px-4 py-2 hover:bg-indigo-50 flex items-center gap-2">
                    <Layers size={14} className="text-cyan-500" /> Response Config
                  </button>
                  <div className="border-t my-1" />
                  <p className="px-4 py-1 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">AI Analysis</p>
                  <button onClick={handleBulkSuggestPipeline} className="w-full text-left px-4 py-2 hover:bg-violet-50 flex items-center gap-2">
                    <Sparkles size={14} className="text-violet-600" /> Suggest Ideal Pipeline
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => setSelectedIntentIds(new Set())}
              className="px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Intent Table */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="grid grid-cols-12 gap-4 px-4 py-3 border-b bg-gray-50 text-sm font-medium text-gray-600">
          <div className="col-span-1 flex items-center">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = someSelected; }}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
          </div>
          <div className="col-span-3">Intent Name</div>
          <div className="col-span-2">Module</div>
          <div className="col-span-2">Sub-Module</div>
          <div className="col-span-1 text-center">Phrases</div>
          <div className="col-span-1 text-center">Status</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {intents.length === 0 ? (
          <div className="p-12 text-center">
            <MessageSquare size={48} className="mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500 text-lg">No intents found</p>
            <p className="text-gray-400 text-sm mt-1">Add intents or import from CSV</p>
          </div>
        ) : (
          <div className="divide-y">
            {intents.map(intent => {
              const module = modules.find(m => m.id === intent.moduleId);
              const subModule = module?.subModules.find(s => s.id === intent.subModuleId);
              const isConfigured = intent.generatedBy === 'ai' || intent.generatedBy === 'manual';
              const isSelected = selectedIntentIds.has(intent.id);
              
              return (
                <div
                  key={intent.id}
                  onClick={() => onSelectIntent(intent.id)}
                  className={`grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-gray-50 cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50/50' : ''}`}
                >
                  <div className="col-span-1 flex items-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => { e.stopPropagation(); toggleSelectIntent(intent.id); }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </div>
                  <div className="col-span-3">
                    <div className="font-medium text-gray-900">{formatIntentName(intent.name)}</div>
                    <div className="text-sm text-gray-500 truncate">{intent.description}</div>
                  </div>
                  <div className="col-span-2">
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-sm">
                      {module?.icon} {module?.name}
                    </span>
                  </div>
                  <div className="col-span-2 text-sm text-gray-600">
                    {subModule?.name || '-'}
                  </div>
                  <div className="col-span-1 text-center">
                    <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-sm">
                      {intent.trainingPhrases.length}
                    </span>
                  </div>
                  <div className="col-span-1 text-center">
                    {isConfigured ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                        ✅ {intent.aiConfidence ? `${Math.round(intent.aiConfidence * 100)}%` : 'Ready'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs">
                        ⏳ Pending
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 flex justify-end gap-1">
                    {!isConfigured && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onGenerateFlow(intent.id);
                        }}
                        disabled={isGenerating === intent.id}
                        className="p-2 text-purple-600 hover:bg-purple-50 rounded transition-colors"
                        title="Generate with AI"
                      >
                        {isGenerating === intent.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Wand2 size={16} />
                        )}
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelectIntent(intent.id); }}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Edit"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Delete this intent?')) {
                          onDeleteIntent(intent.id);
                        }
                      }}
                      className="p-2 text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
        </>
      ) : (
        <CasesLibraryView />
      )}
    </div>
  );
}

// ============================================================================
// SIDEBAR VIEWS (MCP Tools, Enrichments, Country Config, LLM, Test)
// ============================================================================

// MCP Tools View
interface HelloBooksOrg {
  _id: string;
  Name: string;
  BusinessId?: string;
  Status?: string;
}

interface HelloBooksEntity {
  _id: string;
  Name: string;
  OrganizationId: string;
  OrgName?: string;
  GSTIN?: string;
  PAN?: string;
  CIN?: string;
  Currency?: string;
  Country?: string;
  State?: string;
  City?: string;
  Address?: string;
  FiscalYearStart?: string;
  FiscalYearEnd?: string;
  Industry?: string;
  EntityType?: string;
  Status?: string;
  CreatedAt?: string;
  [key: string]: unknown;
}

// --- AI Tool Gap Analysis Panel ---
interface GapCategory {
  category: string;
  priority: 'critical' | 'recommended' | 'nice-to-have';
  missingTools: { name: string; description: string; rationale: string }[];
}

function ToolGapAnalysisPanel({ tools }: { tools: MCPTool[] }) {
  const [gapData, setGapData] = useState<{ categories: GapCategory[]; summary: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const analyzeGaps = async () => {
    if (tools.length === 0) {
      toast({ title: 'No tools loaded', description: 'Load MCP tools first before analyzing gaps', variant: 'destructive' });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('analyze-tool-gaps', {
        body: { tools: tools.map(t => t.name) },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setGapData(data);
      setIsOpen(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      setError(msg);
      toast({ title: 'Gap analysis failed', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const priorityConfig = {
    critical: { label: 'CRITICAL', className: 'bg-destructive/10 text-destructive border-destructive/30' },
    recommended: { label: 'RECOMMENDED', className: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
    'nice-to-have': { label: 'NICE-TO-HAVE', className: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  };

  const totalMissing = gapData?.categories.reduce((sum, c) => sum + c.missingTools.length, 0) || 0;

  return (
    <div className="mt-6 border rounded-lg bg-muted/20">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center justify-between p-4">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-left flex-1 hover:opacity-80 transition-opacity">
              <Sparkles size={18} className="text-primary" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">AI Tool Gap Analysis</h3>
                <p className="text-xs text-muted-foreground">Compare your tools against GAAP/IFRS & standard accounting software</p>
              </div>
              {gapData && (
                <Badge variant="secondary" className="ml-2">{totalMissing} gaps found</Badge>
              )}
              <ChevronDown size={16} className={`ml-auto text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          </CollapsibleTrigger>
          <Button
            size="sm"
            variant="outline"
            onClick={analyzeGaps}
            disabled={loading || tools.length === 0}
            className="ml-3 shrink-0"
          >
            {loading ? <Loader2 size={14} className="animate-spin mr-1" /> : <Sparkles size={14} className="mr-1" />}
            {loading ? 'Analyzing...' : 'Analyze Gaps'}
          </Button>
        </div>

        <CollapsibleContent>
          <div className="px-4 pb-4">
            {error && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm mb-3">
                {error}
              </div>
            )}

            {loading && (
              <div className="text-center py-8">
                <Loader2 size={28} className="mx-auto mb-3 animate-spin text-primary" />
                <p className="text-sm font-medium text-foreground">Analyzing tool inventory...</p>
                <p className="text-xs text-muted-foreground mt-1">Comparing against GAAP/IFRS standards & accounting software capabilities</p>
              </div>
            )}

            {gapData && !loading && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="p-3 rounded-md bg-primary/5 border border-primary/20 text-sm text-foreground">
                  {gapData.summary}
                </div>

                {/* Categories */}
                {gapData.categories
                  .sort((a, b) => {
                    const order = { critical: 0, recommended: 1, 'nice-to-have': 2 };
                    return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
                  })
                  .map((cat, idx) => {
                    const config = priorityConfig[cat.priority] || priorityConfig['nice-to-have'];
                    return (
                      <div key={idx} className="border rounded-md overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-muted/40">
                          <span className="text-sm font-medium text-foreground">
                            {cat.category} <span className="text-muted-foreground">({cat.missingTools.length} missing)</span>
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${config.className}`}>
                            {config.label}
                          </span>
                        </div>
                        <div className="divide-y">
                          {cat.missingTools.map((tool, tIdx) => (
                            <div key={tIdx} className="px-3 py-2 text-sm">
                              <div className="font-mono text-xs text-primary">{tool.name}</div>
                              <div className="text-foreground mt-0.5">{tool.description}</div>
                              <div className="text-xs text-muted-foreground mt-0.5 italic">{tool.rationale}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {!gapData && !loading && !error && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Click "Analyze Gaps" to compare your {tools.length} tools against accounting standards
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// Intent Detail Screen - Tabbed editor for a single intent
function IntentDetailScreen({
  intent: initialIntent,
  modules,
  mcpTools,
  enrichmentTypes,
  entityTypes,
  responseTypes,
  countryConfigs,
  businessContext,
  onBack,
  onSave,
  onDelete,
  onRegenerate,
}: {
  intent: Intent;
  modules: Module[];
  mcpTools: MCPTool[];
  enrichmentTypes: EnrichmentType[];
  entityTypes: EntityType[];
  responseTypes: ResponseType[];
  countryConfigs: CountryConfig[];
  businessContext: BusinessContext;
  onBack: () => void;
  onSave: (intent: Intent) => void;
  onDelete: (id: string) => void;
  onRegenerate: (intentId: string, section?: string, options?: { phraseCount?: number }) => Promise<Partial<Intent>>;
}) {
  const [intent, setIntent] = useState<Intent>(initialIntent);
  const [activeDetailTab, setActiveDetailTab] = useState('details');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    setIntent(initialIntent);
  }, [initialIntent]);

  const handleChange = (updates: Partial<Intent>) => {
    setIntent(prev => ({ ...prev, ...updates }));
    setHasUnsavedChanges(true);
  };

  const handleSave = () => {
    onSave(intent);
    setHasUnsavedChanges(false);
  };

  const handleRegenerate = async (section?: string) => {
    setIsRegenerating(true);
    try {
      const updates = await onRegenerate(intent.id, section);
      if (updates) {
        const updatedIntent = { ...intent, ...updates };
        setIntent(updatedIntent);
        // Auto-save AI-generated content immediately
        onSave(updatedIntent);
      }
    } finally {
      setIsRegenerating(false);
    }
  };

  const tabs = [
    { id: 'details', label: 'Details', icon: <FileText size={14} /> },
    { id: 'training', label: 'Training Phrases', icon: <MessageSquare size={14} /> },
    { id: 'entities', label: 'Entities', icon: <Box size={14} /> },
    { id: 'pipeline', label: 'Data Pipeline', icon: <GitBranch size={14} /> },
  ];

  return (
    <div className="h-screen flex bg-white">
      {/* Left sidebar: back + vertical tabs */}
      <div className="w-56 border-r bg-gray-50 flex flex-col">
        {/* Back button + intent name */}
        <div className="p-4 border-b">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-3">
            <ArrowLeft size={16} /> Back to Intents
          </button>
          <h2 className="text-sm font-bold text-gray-900 truncate">{formatIntentName(intent.name)}</h2>
          <p className="text-xs text-gray-500 truncate mt-0.5">{intent.description || 'No description'}</p>
        </div>

        {/* Vertical tabs */}
        <nav className="flex-1 py-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveDetailTab(tab.id)}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeDetailTab === tab.id
                  ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>

        {/* Actions at bottom */}
        <div className="p-3 border-t space-y-2">
          {hasUnsavedChanges && (
            <span className="text-xs text-amber-600 font-medium block text-center">Unsaved changes</span>
          )}
          <button
            onClick={handleSave}
            disabled={!hasUnsavedChanges}
            className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <Save size={14} /> Save
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="w-full px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg text-sm flex items-center justify-center gap-2">
                <Trash2 size={14} /> Delete
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Intent</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{formatIntentName(intent.name)}"? This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => { onDelete(intent.id); onBack(); }}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-auto p-6">
        {activeDetailTab === 'details' && (
          <IntentDetailsTab
            intent={intent}
            modules={modules}
            onChange={handleChange}
          />
        )}
        {activeDetailTab === 'training' && (
          <TrainingPhrasesTab
            intent={intent}
            onChange={handleChange}
            onRegenerate={() => handleRegenerate('training')}
            isRegenerating={isRegenerating}
          />
        )}
        {activeDetailTab === 'entities' && (
          <EntitiesTab
            intent={intent}
            onChange={handleChange}
            entityTypes={entityTypes}
            onRegenerate={() => handleRegenerate('entities')}
            isRegenerating={isRegenerating}
          />
        )}
        {activeDetailTab === 'pipeline' && (
          <DataPipelineTab
            intent={intent}
            mcpTools={mcpTools}
            onChange={handleChange}
            onRegenerate={() => handleRegenerate('pipeline')}
            isRegenerating={isRegenerating}
          />
        )}
      </div>
    </div>
  );
}


function MCPToolsView({ 
  tools,
  isLoading,
  error,
  onRefresh
}: { 
  tools: MCPTool[];
  isLoading: boolean;
  error: string | null;
  onRefresh: (creds: { authToken: string; entityId: string; orgId: string }) => void;
}) {
  const [selectedTool, setSelectedTool] = useState<MCPTool | null>(null);
  const [toolSearch, setToolSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const { getToolAnalytics } = useToolAnalytics();

  const filteredTools = useMemo(() => {
    if (!toolSearch.trim()) return tools;
    const q = toolSearch.toLowerCase();
    return tools.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.parameters.some(p => p.name.toLowerCase().includes(q))
    );
  }, [tools, toolSearch]);

  // Login state
  const [email, setEmail] = useState('cfoagent@gmail.com');
  const [password, setPassword] = useState("lWBBjYy4O%K19u's27&[");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [userName, setUserName] = useState('');

  // Organization state
  const [organizations, setOrganizations] = useState<HelloBooksOrg[]>([]);
  const [entities, setEntities] = useState<HelloBooksEntity[]>([]);
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState('');

  const isLoggedIn = !!authToken;

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoginLoading(true);
    setLoginError('');
    try {
      // Use edge function proxy to avoid CORS
      const { data: loginData, error: loginErr } = await supabase.functions.invoke('hellobooks-proxy', {
        body: { action: 'login', email, password },
      });

      if (loginErr) throw loginErr;
      if (!loginData?.token) {
        throw new Error(loginData?.message || loginData?.error || 'Login failed');
      }

      setAuthToken(loginData.token);
      setUserName(loginData.user?.Name || email);
      toast({ title: `Logged in as ${loginData.user?.Name || email}` });

      // Fetch organizations & entities via organization/read API
      setEntitiesLoading(true);
      const { data: entData, error: entErr } = await supabase.functions.invoke('hellobooks-proxy', {
        body: { action: 'get_organizations', token: loginData.token },
      });

      if (entErr) throw entErr;

      // Map from /organization/read response format
      if (entData?.organizations && Array.isArray(entData.organizations)) {
        const mappedOrgs: HelloBooksOrg[] = entData.organizations.map((org: any) => ({
          _id: org._id,
          Name: org.Name,
          BusinessId: org.BusinessId,
          Status: org.Status,
        }));
        setOrganizations(mappedOrgs);

        // Flatten entities from all organizations
        const mappedEntities: HelloBooksEntity[] = [];
        for (const org of entData.organizations) {
          if (org.Entities && Array.isArray(org.Entities)) {
            for (const entity of org.Entities) {
              // Helper to safely extract string from value that might be {RefId, Name} object
              const str = (v: any): string | undefined => {
                if (!v) return undefined;
                if (typeof v === 'string') return v;
                if (typeof v === 'object' && v.Name) return v.Name;
                return String(v);
              };
              mappedEntities.push({
                _id: entity._id || entity.id,
                Name: str(entity.Name) || '',
                OrganizationId: org._id,
                OrgName: str(org.Name) || '',
                GSTIN: str(entity.GSTIN),
                PAN: str(entity.PAN),
                CIN: str(entity.CIN),
                Currency: str(entity.Currency),
                Country: str(entity.Country),
                State: str(entity.State),
                City: str(entity.City),
                Address: str(entity.Address),
                FiscalYearStart: str(entity.FiscalYearStart),
                FiscalYearEnd: str(entity.FiscalYearEnd),
                Industry: str(entity.Industry),
                EntityType: str(entity.EntityType),
                Status: str(entity.Status),
                CreatedAt: str(entity.CreatedAt),
              });
            }
          }
        }
        setEntities(mappedEntities);
        toast({ title: `Found ${mappedEntities.length} entities across ${mappedOrgs.length} orgs` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setLoginError(msg);
      toast({ title: 'Login failed', description: msg, variant: 'destructive' });
    } finally {
      setLoginLoading(false);
      setEntitiesLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthToken('');
    setUserName('');
    setOrganizations([]);
    setEntities([]);
    setSelectedEntityId('');
    setSelectedOrgId('');
    setEmail('');
    setPassword('');
  };

  const handleEntitySelect = (entityId: string) => {
    const entity = entities.find(e => e._id === entityId);
    if (entity) {
      setSelectedEntityId(entity._id);
      setSelectedOrgId(entity.OrganizationId);
    }
  };

  // Filter entities by selected org
  const filteredEntities = selectedOrgId
    ? entities.filter(e => e.OrganizationId === selectedOrgId)
    : entities;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-foreground">MCP Tools</h2>
          <p className="text-sm text-muted-foreground">Available tools from HelloBooks MCP Server</p>
        </div>
        {isLoggedIn && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
              <CheckCircle2 size={14} /> {userName}
            </span>
            <button onClick={handleLogout} className="text-xs text-muted-foreground hover:text-destructive underline">
              Logout
            </button>
          </div>
        )}
      </div>

      {/* Step 1: Login */}
      {!isLoggedIn && (
        <div className="mb-6 p-4 border rounded-lg bg-muted/30">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <LockKeyhole size={14} /> Step 1: Login to HelloBooks
          </h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Email</label>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
            </div>
          </div>
          {loginError && <p className="text-xs text-destructive mb-2">{loginError}</p>}
          <button
            onClick={handleLogin}
            disabled={loginLoading || !email || !password}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {loginLoading ? 'Logging in...' : 'Login'}
          </button>
        </div>
      )}

      {/* Step 2: Select Entity/Org */}
      {isLoggedIn && (
        <div className="mb-6 p-4 border rounded-lg bg-muted/30">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Building2 size={14} /> Step 2: Select Organization & Entity
          </h3>
          {entitiesLoading ? (
            <p className="text-sm text-muted-foreground">Loading entities...</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Organization</label>
                <select
                  value={selectedOrgId}
                  onChange={e => { setSelectedOrgId(e.target.value); setSelectedEntityId(''); }}
                  className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                >
                  <option value="">Select organization...</option>
                  {organizations.map(org => (
                    <option key={org._id} value={org._id}>
                      {org.Name}{org.BusinessId ? ` (${org.BusinessId})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Entity</label>
                <select
                  value={selectedEntityId}
                  onChange={e => handleEntitySelect(e.target.value)}
                  disabled={!selectedOrgId}
                  className="w-full px-3 py-2 border rounded-md text-sm bg-background disabled:opacity-50"
                >
                  <option value="">{selectedOrgId ? 'Select entity...' : 'Select org first...'}</option>
                  {filteredEntities.map(entity => (
                    <option key={entity._id} value={entity._id}>
                      {entity.Name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Step 3: Fetch Tools */}
          <button
            onClick={() => onRefresh({ authToken, entityId: selectedEntityId, orgId: selectedOrgId })}
            disabled={isLoading || !selectedEntityId || !selectedOrgId}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {isLoading ? 'Fetching Tools...' : 'Fetch MCP Tools'}
          </button>
        </div>
      )}

      {/* Business Context for Selected Entity */}
      {isLoggedIn && selectedEntityId && (() => {
        const selectedEntity = entities.find(e => e._id === selectedEntityId);
        const selectedOrg = organizations.find(o => o._id === selectedOrgId);
        if (!selectedEntity) return null;

        // Collect all meaningful fields from the entity
        const excludeKeys = new Set(['_id', 'id', 'OrganizationId', '__v', 'Entities']);
        const contextFields: Array<{ label: string; value: string }> = [];

        // Priority fields first
        if (selectedEntity.Name) contextFields.push({ label: 'Entity', value: selectedEntity.Name });
        if (selectedOrg?.Name) contextFields.push({ label: 'Organization', value: selectedOrg.Name });
        if (selectedOrg?.BusinessId) contextFields.push({ label: 'Business ID', value: selectedOrg.BusinessId });
        if (selectedEntity.GSTIN) contextFields.push({ label: 'GSTIN', value: selectedEntity.GSTIN });
        if (selectedEntity.PAN) contextFields.push({ label: 'PAN', value: selectedEntity.PAN });
        if (selectedEntity.CIN) contextFields.push({ label: 'CIN', value: selectedEntity.CIN });
        if (selectedEntity.Currency) contextFields.push({ label: 'Currency', value: selectedEntity.Currency });
        if (selectedEntity.Country) contextFields.push({ label: 'Country', value: selectedEntity.Country });
        if (selectedEntity.State) contextFields.push({ label: 'State', value: selectedEntity.State });
        if (selectedEntity.City) contextFields.push({ label: 'City', value: selectedEntity.City });
        if (selectedEntity.Address) contextFields.push({ label: 'Address', value: selectedEntity.Address });
        if (selectedEntity.Industry) contextFields.push({ label: 'Industry', value: selectedEntity.Industry });
        if (selectedEntity.EntityType) contextFields.push({ label: 'Entity Type', value: selectedEntity.EntityType });
        if (selectedEntity.FiscalYearStart) contextFields.push({ label: 'FY Start', value: selectedEntity.FiscalYearStart });
        if (selectedEntity.FiscalYearEnd) contextFields.push({ label: 'FY End', value: selectedEntity.FiscalYearEnd });
        if (selectedEntity.Status) contextFields.push({ label: 'Status', value: selectedEntity.Status });

        // Catch any extra keys not already shown
        const shownLabels = new Set(contextFields.map(f => f.label));
        for (const [key, val] of Object.entries(selectedEntity)) {
          if (excludeKeys.has(key)) continue;
          if (key === 'Name' || key === 'OrgName') continue;
          const label = key.replace(/([a-z])([A-Z])/g, '$1 $2');
          if (shownLabels.has(label)) continue;
          if (val && typeof val !== 'object') {
            contextFields.push({ label, value: String(val) });
          }
        }

        if (contextFields.length <= 2) return null;

        return (
          <Collapsible defaultOpen>
            <div className="mb-6 border rounded-lg bg-muted/30 overflow-hidden">
              <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Globe size={14} /> Business Context — {selectedEntity.Name}
                </h3>
                <ChevronDown size={14} className="text-muted-foreground" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
                    {contextFields.map(({ label, value }) => (
                      <div key={label}>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
                        <p className="text-sm text-foreground font-medium truncate" title={value}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })()}

      {error && <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded text-sm">{error}</div>}

      {tools.length > 0 && (
        <div className="flex items-center gap-3 mb-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={`Search ${tools.length} tools...`}
              value={toolSearch}
              onChange={e => setToolSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {toolSearch && (
              <button onClick={() => setToolSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center border rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              title="Grid view"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 transition-colors ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              title="Table view"
            >
              <List size={14} />
            </button>
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {filteredTools.length}{toolSearch ? ` / ${tools.length}` : ''} tools
          </span>
        </div>
      )}

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredTools.map(tool => {
            const analytics = getToolAnalytics(tool.id);
            return (
              <div key={tool.id} onClick={() => setSelectedTool(tool)} className="p-4 border rounded-lg hover:shadow-md cursor-pointer transition-shadow bg-card">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm text-foreground">{tool.name}</h3>
                      <MCPToolUsageBadge toolName={tool.id} analytics={analytics} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{tool.description}</p>
                  </div>
                </div>
                {tool.parameters.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tool.parameters.slice(0, 4).map(p => (
                      <span key={p.name} className={`text-xs px-1.5 py-0.5 rounded ${p.required ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        {p.name}
                      </span>
                    ))}
                    {tool.parameters.length > 4 && <span className="text-xs text-muted-foreground">+{tool.parameters.length - 4}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && filteredTools.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">#</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Tool Name</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Description</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Method</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Params</th>
                </tr>
              </thead>
              <tbody>
                {filteredTools.map((tool, idx) => (
                  <tr
                    key={tool.id}
                    onClick={() => setSelectedTool(tool)}
                    className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2 text-xs text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2 font-mono text-xs text-primary whitespace-nowrap">{tool.name}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[300px] truncate">{tool.description}</td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{tool.method}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{tool.parameters.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isLoading && tools.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Loader2 size={32} className="mx-auto mb-3 animate-spin text-primary" />
          <p className="font-medium">Loading MCP Tools...</p>
          <p className="text-sm opacity-60 mt-1">Fetching tools from database</p>
        </div>
      )}

      {tools.length === 0 && !isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          <Database size={32} className="mx-auto mb-2 opacity-30" />
          <p>No MCP tools loaded</p>
          <p className="text-sm opacity-60 mt-1">{isLoggedIn ? 'Select entity & org, then click Fetch Tools' : 'Login to get started'}</p>
        </div>
      )}

      {/* AI Tool Gap Analysis Panel */}
      <ToolGapAnalysisPanel tools={tools} />
    </div>
  );
}

// Enrichments View
function EnrichmentsView({
  enrichmentTypes,
  onAdd,
  onUpdate,
  onDelete
}: {
  enrichmentTypes: EnrichmentType[];
  onAdd?: any;
  onUpdate?: any;
  onDelete?: any;
}) {
  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Enrichment Types</h2>
      <p className="text-sm text-gray-500 mb-6">Available out-of-the-box enrichment functions for intent pipelines</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {enrichmentTypes.map(et => (
          <div key={et.id} className="p-4 border rounded-lg bg-white">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{et.icon}</span>
              <h3 className="font-medium text-gray-900">{et.name}</h3>
            </div>
            <p className="text-xs text-gray-500">{et.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Country Config View 
function CountryConfigView({
  countryConfigs,
  onAdd,
  onUpdate,
  onDelete
}: {
  countryConfigs: CountryConfig[];
  onAdd: any;
  onUpdate: any;
  onDelete: any;
}) {
  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Country Configurations</h2>
      <div className="space-y-3">
        {countryConfigs.map(cc => (
          <div key={cc.code} className="p-4 border rounded-lg bg-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{cc.flag}</span>
              <div>
                <h3 className="font-medium">{cc.name}</h3>
                <p className="text-sm text-gray-500">{cc.currency} ({cc.currencySymbol})</p>
              </div>
            </div>
            <button onClick={() => onDelete(cc.code)} className="text-red-500 hover:text-red-700 text-sm">Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Business Context View
function BusinessContextView({
  context,
  allContexts,
  countryConfigs: _cc,
  onChange,
  onCreate,
  onDelete,
  onSetDefault
}: {
  context: any;
  allContexts: any[];
  countryConfigs: CountryConfig[];
  onChange: any;
  onCreate: any;
  onDelete: any;
  onSetDefault: any;
}) {
  const contexts = allContexts || [];
  const activeContext = context;
  const [showCreate, setShowCreate] = React.useState(false);
  const [newCtx, setNewCtx] = React.useState({ name: '', industry: 'manufacturing', country: 'IN', currency: 'INR', entity_size: 'medium', fiscal_year_end: 'March' });

  const handleCreate = () => {
    onCreate(newCtx);
    setShowCreate(false);
    setNewCtx({ name: '', industry: 'manufacturing', country: 'IN', currency: 'INR', entity_size: 'medium', fiscal_year_end: 'March' });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-foreground">Business Contexts</h2>
        <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90">
          + Add Context
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 p-4 border rounded-lg bg-card space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <input value={newCtx.name} onChange={e => setNewCtx({...newCtx, name: e.target.value})} className="w-full px-3 py-2 border rounded-md text-sm bg-background" placeholder="e.g. My Manufacturing Co" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Industry</label>
              <select value={newCtx.industry} onChange={e => setNewCtx({...newCtx, industry: e.target.value})} className="w-full px-3 py-2 border rounded-md text-sm bg-background">
                {['manufacturing','services','retail','technology','healthcare','finance','education','agriculture','construction','logistics'].map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Country</label>
              <input value={newCtx.country} onChange={e => setNewCtx({...newCtx, country: e.target.value})} className="w-full px-3 py-2 border rounded-md text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Currency</label>
              <input value={newCtx.currency} onChange={e => setNewCtx({...newCtx, currency: e.target.value})} className="w-full px-3 py-2 border rounded-md text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Entity Size</label>
              <select value={newCtx.entity_size} onChange={e => setNewCtx({...newCtx, entity_size: e.target.value})} className="w-full px-3 py-2 border rounded-md text-sm bg-background">
                {['micro','small','medium','large','enterprise'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Fiscal Year End</label>
              <input value={newCtx.fiscal_year_end} onChange={e => setNewCtx({...newCtx, fiscal_year_end: e.target.value})} className="w-full px-3 py-2 border rounded-md text-sm bg-background" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            <button onClick={handleCreate} className="px-4 py-1.5 bg-primary text-primary-foreground rounded-md text-sm">Create</button>
          </div>
        </div>
      )}

      {contexts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg mb-2">No business contexts yet</p>
          <p className="text-sm">Click "+ Add Context" to create your first business context.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contexts.map(ctx => (
            <div key={ctx.id} className={`p-4 border rounded-lg bg-card ${ctx.id === activeContext?.id ? 'border-primary ring-1 ring-primary/20' : ''}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-foreground">{ctx.name || ctx.industry}</h3>
                    {ctx.id === activeContext?.id && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Default</span>}
                  </div>
                  <p className="text-sm text-muted-foreground">{ctx.country} · {ctx.currency} · {ctx.entitySize || ctx.entity_size}</p>
                  {ctx.sub_industry && <p className="text-xs text-muted-foreground mt-0.5">Sub-industry: {ctx.sub_industry}</p>}
                  {ctx.fiscal_year_end && <p className="text-xs text-muted-foreground">FY End: {ctx.fiscal_year_end}</p>}
                </div>
                <div className="flex gap-2">
                  {ctx.id !== activeContext?.id && (
                    <button onClick={() => onSetDefault(ctx.id)} className="text-primary hover:opacity-80 text-sm">Set Default</button>
                  )}
                  <button onClick={() => onDelete(ctx.id)} className="text-destructive hover:opacity-80 text-sm">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function CFOQueryResolutionEngine() {
  const { user, isAdmin, signOut } = useAuth();

  // Database hooks for dynamic data
  const { modules, loading: modulesLoading } = useModules();
  const { countryConfigs, loading: countryLoading, createCountryConfig, updateCountryConfig, deleteCountryConfig } = useCountryConfigs();
  const { entityTypes, loading: entityTypesLoading } = useEntityTypes();
  const { enrichmentTypes, loading: enrichmentTypesLoading, createEnrichmentType, updateEnrichmentType, deleteEnrichmentType } = useEnrichmentTypes();
  const { intents, loading: intentsLoading, createIntent, updateIntent, deleteIntent, fetchIntents } = useIntents();
  const { businessContext, allContexts, loading: businessContextLoading, updateContext, createContext, deleteContext, setAsDefault } = useBusinessContext();
  const { llmConfig, loading: llmConfigLoading, updateConfig } = useLLMConfig();
  const { tools: helloBooksMcpTools, loading: isFetchingMcpTools, error: mcpToolsError, fetchTools: fetchHelloBooksMcpTools } = useMCPTools();
  const { responseTypes } = useResponseTypes();
  const { llmProviders } = useLLMProviders();

  // State
  const [activeTab, setActiveTab] = useState('intents');
  const [selectedIntentId, setSelectedIntentId] = useState<string | null>(null);
  const [editingIntentId, setEditingIntentId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAIGeneratorModal, setShowAIGeneratorModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterModule, setFilterModule] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'configured' | 'pending'>('all');
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number; step?: string }>({ current: 0, total: 0 });
  const [isImporting, setIsImporting] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState<string | null>(null);
  const [generationAbortController, setGenerationAbortController] = useState<AbortController | null>(null);

  // Register global callbacks so background processes can refresh UI
  useEffect(() => {
    globalNavigateToIntent = (intentId: string) => {
      setActiveTab('intents');
      setSelectedIntentId(intentId);
    };
    globalRefreshIntents = () => fetchIntents();
    return () => { globalNavigateToIntent = null; globalRefreshIntents = null; };
  }, [fetchIntents]);


  const selectedIntent = intents.find(i => i.id === selectedIntentId);
  // Cache the last valid selected intent to prevent unmount/remount during refetch
  const lastValidIntentRef = React.useRef<Intent | null>(null);
  if (selectedIntent) {
    lastValidIntentRef.current = selectedIntent;
  }
  const stableSelectedIntent = selectedIntent || (selectedIntentId ? lastValidIntentRef.current : null);

  // Loading state
  const isLoading = modulesLoading || intentsLoading || businessContextLoading || llmConfigLoading;

  // Computed values
  const allMcpTools = helloBooksMcpTools;
  const filteredIntents = intents.filter(intent => {
    if (searchTerm && !intent.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterModule && intent.moduleId !== filterModule) return false;
    if (filterStatus === 'configured' && intent.generatedBy !== 'ai' && intent.generatedBy !== 'manual') return false;
    if (filterStatus === 'pending' && (intent.generatedBy === 'ai' || intent.generatedBy === 'manual')) return false;
    return true;
  });

  const GENERATION_TIMEOUT_MS = 120000;

  // AI Generation Functions - Using LLM Config from database
  const generateIntentConfig = async (intent: Intent, abortSignal?: AbortSignal, section: 'training' | 'entities' | 'pipeline' | 'enrichments' | 'response' | 'all' = 'all'): Promise<Intent> => {
    const moduleInfo = modules.find(m => m.id === intent.moduleId);
    const subModuleInfo = moduleInfo?.subModules.find(s => s.id === intent.subModuleId);
    
    const sectionLabels: Record<string, string> = {
      all: 'Generating full configuration...',
      training: 'Generating training phrases...',
      entities: 'Generating entities...',
      pipeline: 'Generating data pipeline...',
      enrichments: 'Generating enrichments...',
      response: 'Generating response config...',
    };
    setGenerationProgress({ current: 1, total: section === 'all' ? 5 : 1, step: sectionLabels[section] || 'Generating...' });
    
    try {
      console.log(`🤖 Generating intent config via AI (section: ${section})...`);
      console.log('Using LLM config:', llmConfig?.provider, llmConfig?.model);
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Generation timed out after 2 minutes. Please try again.'));
        }, GENERATION_TIMEOUT_MS);
        abortSignal?.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          reject(new Error('Generation was cancelled'));
        });
      });
      
      const generationPromise = supabase.functions.invoke('generate-intent', {
        body: {
          intentId: intent.id,
          intentName: intent.name,
          moduleName: moduleInfo?.name || intent.moduleId,
          subModuleName: subModuleInfo?.name || intent.subModuleId,
          description: intent.description,
          section,
          phraseCount: 10,
          existingPhrases: section !== 'all' ? intent.trainingPhrases : undefined,
          existingEntities: section !== 'all' ? intent.entities : undefined,
          existingPipeline: section !== 'all' ? intent.resolutionFlow?.dataPipeline : undefined,
          existingEnrichments: section !== 'all' ? intent.resolutionFlow?.enrichments : undefined,
          mcpTools: allMcpTools.map(tool => ({
            name: tool.id,
            description: tool.description,
            inputSchema: {
              properties: tool.parameters.reduce((acc, p) => {
                acc[p.name] = { type: p.type };
                return acc;
              }, {} as Record<string, { type: string }>),
              required: tool.parameters.filter(p => p.required).map(p => p.name)
            }
          })),
          businessContext: businessContext ? {
            industry: businessContext.industry,
            country: businessContext.country,
            currency: businessContext.currency,
            entitySize: businessContext.entitySize
          } : undefined,
          llmConfig: {
            provider: llmConfig?.provider,
            endpoint: llmConfig?.endpoint,
            model: llmConfig?.model,
            apiKey: llmConfig?.apiKey,
            temperature: llmConfig?.temperature,
            maxTokens: llmConfig?.maxTokens
          }
        }
      });
      
      const { data, error } = await Promise.race([generationPromise, timeoutPromise]) as Awaited<typeof generationPromise>;

      if (error) {
        toast({ title: 'AI Generation Error', description: error.message, variant: 'destructive' });
        throw error;
      }

      if (data?.error) {
        toast({ title: 'AI Generation Error', description: data.error, variant: 'destructive' });
        throw new Error(data.error);
      }

      const resolveMcpToolIdWithTools = (toolName: string, tools: MCPTool[]): string => {
        if (!toolName) return toolName;
        const match = tools.find(t => t.id === toolName || t.name === toolName);
        return match ? match.id : toolName;
      };

      const dataPipeline = (data.dataPipeline || []).map((node: any) => ({
        ...node,
        mcpTool: node.nodeType === 'api_call' ? resolveMcpToolIdWithTools(node.mcpTool, allMcpTools) : node.mcpTool,
        parameters: node.parameters || []
      }));

      return {
        ...intent,
        trainingPhrases: data.trainingPhrases || [],
        entities: data.entities || [],
        resolutionFlow: {
          dataPipeline,
          enrichments: data.enrichments || [],
          responseConfig: data.responseConfig || { type: 'metric_with_trend', template: '📊 Result: {data}', followUpQuestions: [] }
        },
        generatedBy: 'ai',
        aiConfidence: data.aiConfidence,
        lastGeneratedAt: data.generatedAt || new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Generation Error:', error);
      throw error;
    }
  };

  const regenerateSection = async (intentId: string, section?: string, options?: { phraseCount?: number }): Promise<Partial<Intent>> => {
    const intent = intents.find(i => i.id === intentId);
    if (!intent) throw new Error('Intent not found');
    
    // LLM config is optional - edge function falls back to GPT-5.2 secrets if no API key configured
    
    const moduleInfo = modules.find(m => m.id === intent.moduleId);
    const subModuleInfo = moduleInfo?.subModules.find(s => s.id === intent.subModuleId);
    const phraseCount = options?.phraseCount || 10;
    
    try {
      console.log(`🤖 Regenerating ${section || 'all'} via AI...`);
      
      const { data, error, response: invokeResponse } = await supabase.functions.invoke('generate-intent', {
        body: {
          intentName: intent.name,
          moduleName: moduleInfo?.name || intent.moduleId,
          subModuleName: subModuleInfo?.name || intent.subModuleId,
          description: intent.description,
          section: section || 'all',
          existingPhrases: intent.trainingPhrases,
          phraseCount,
          existingEntities: intent.entities,
          existingPipeline: intent.resolutionFlow?.dataPipeline || [],
          existingEnrichments: intent.resolutionFlow?.enrichments || [],
          // Pass real MCP tools for intelligent pipeline generation
          mcpTools: allMcpTools.map(tool => ({
            name: tool.id,
            description: tool.description,
            inputSchema: {
              properties: tool.parameters.reduce((acc, p) => {
                acc[p.name] = { type: p.type };
                return acc;
              }, {} as Record<string, { type: string }>),
              required: tool.parameters.filter(p => p.required).map(p => p.name)
            }
          })),
          // Pass business context for smarter generation
          businessContext: businessContext ? {
            industry: businessContext.industry,
            country: businessContext.country,
            currency: businessContext.currency,
            entitySize: businessContext.entitySize
          } : undefined,
          llmConfig: llmConfig ? {
            provider: llmConfig.provider,
            endpoint: llmConfig.endpoint,
            model: llmConfig.model,
            apiKey: llmConfig.apiKey,
            temperature: llmConfig.temperature,
            maxTokens: llmConfig.maxTokens
          } : undefined
        }
      });

      if (error) {
        console.error('Edge function error:', error);

        let errorMsg = error.message || 'Failed to regenerate';
        if (invokeResponse) {
          try {
            const cloned = invokeResponse.clone();
            const ct = cloned.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
              const body = await cloned.json();
              if (body?.error) errorMsg = body.error;
            } else {
              const text = await cloned.text();
              if (text) errorMsg = text;
            }
          } catch {
            // ignore parse errors
          }
        }

        toast({ title: 'AI Generation Error', description: errorMsg, variant: 'destructive' });
        throw new Error(errorMsg);
      }

      console.log('✅ Regeneration complete!', data);

      // Build result based on section
      const result: Partial<Intent> = {
        lastGeneratedAt: data.generatedAt || new Date().toISOString(),
        generatedBy: 'ai',
        aiConfidence: data.aiConfidence
      };

      // Handle cascaded results - when training/entities/pipeline is regenerated,
      // downstream sections (entities, pipeline, enrichments, response) are also auto-generated
      if (section === 'training' && data.trainingPhrases) {
        // Append new phrases to existing ones instead of replacing
        const existingPhrases: string[] = intent.trainingPhrases || [];
        const merged = [...existingPhrases, ...data.trainingPhrases];
        // Deduplicate (case-insensitive)
        const seen = new Set<string>();
        result.trainingPhrases = merged.filter(p => {
          const key = p.toLowerCase().trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      // For cascading sections (training, entities, pipeline), also apply downstream results
      if ((section === 'training' || section === 'entities' || section === 'pipeline') && 
          (data.entities || data.dataPipeline || data.enrichments || data.responseConfig)) {
        if (data.entities) result.entities = data.entities;
        
        const dataPipeline = (data.dataPipeline || []).map((node: any) => ({
          ...node,
          mcpTool: node.nodeType === 'api_call' ? resolveMcpToolIdWithTools(node.mcpTool, allMcpTools) : node.mcpTool,
          parameters: node.parameters || []
        }));
        
        result.resolutionFlow = {
          ...(intent.resolutionFlow || {}),
          dataPipeline: data.dataPipeline ? dataPipeline : (intent.resolutionFlow?.dataPipeline || []),
          enrichments: data.enrichments || intent.resolutionFlow?.enrichments || [],
          responseConfig: data.responseConfig || intent.resolutionFlow?.responseConfig || {
            type: 'metric_with_trend',
            template: '📊 Result: {data}',
            followUpQuestions: []
          }
        };
      }
      
      if (section === 'entities' && data.entities && !data.dataPipeline) {
        result.entities = data.entities;
      }
      
      if (section === 'pipeline' && data.dataPipeline && !data.enrichments) {
        const dataPipeline = data.dataPipeline.map((node: any) => ({
          ...node,
          mcpTool: node.nodeType === 'api_call' ? resolveMcpToolIdWithTools(node.mcpTool, allMcpTools) : node.mcpTool,
          parameters: node.parameters || []
        }));
        result.resolutionFlow = {
          ...intent.resolutionFlow!,
          dataPipeline
        };
      }
      
      if (section === 'enrichments' && data.enrichments) {
        result.resolutionFlow = {
          ...intent.resolutionFlow!,
          enrichments: data.enrichments
        };
      }
      
      if (section === 'response' && data.responseConfig) {
        result.resolutionFlow = {
          ...intent.resolutionFlow!,
          responseConfig: data.responseConfig
        };
      }
      
      if (section === 'all') {
        const dataPipeline = (data.dataPipeline || []).map((node: any) => ({
          ...node,
          mcpTool: node.nodeType === 'api_call' ? resolveMcpToolIdWithTools(node.mcpTool, allMcpTools) : node.mcpTool,
          parameters: node.parameters || []
        }));
        result.trainingPhrases = data.trainingPhrases || [];
        result.entities = data.entities || [];
        result.resolutionFlow = {
          dataPipeline,
          enrichments: data.enrichments || [],
          responseConfig: data.responseConfig || {
            type: 'metric_with_trend',
            template: '📊 Result: {data}',
            followUpQuestions: []
          }
        };
      }

      toast({
        title: 'Generation Complete',
        description: `Successfully regenerated ${section || 'all sections'} with AI`
      });

      return result;
      
    } catch (error) {
      console.error('❌ Regeneration Error:', error);
      toast({
        title: 'Regeneration Failed',
        description: error instanceof Error ? error.message : 'Check your connection and try again',
        variant: 'destructive'
      });
      
      // Fall back to basic generation
      if (section === 'training') {
        const basePhrases = [
          `What is our ${intent.name.toLowerCase()}?`,
          `Show me the ${intent.name.toLowerCase()}`,
          `Tell me about ${intent.name.toLowerCase()}`,
          `${intent.name} analysis`,
          `Current ${intent.name.toLowerCase()} status`
        ];
        return {
          trainingPhrases: basePhrases.slice(0, phraseCount),
          lastGeneratedAt: new Date().toISOString()
        };
      }
      throw error;
    }
  };

  // Intent CRUD handlers
  const handleCreateIntent = async (intentData: Partial<Intent>) => {
    const newIntentData = {
      name: intentData.name || '',
      moduleId: intentData.moduleId || '',
      subModuleId: intentData.subModuleId || '',
      description: intentData.description,
      isActive: true,
      trainingPhrases: [] as string[],
      entities: [] as Entity[],
      generatedBy: 'pending' as const,
    };
    
    try {
      // Create in database
      const created = await createIntent(newIntentData);
      if (!created) return;
      
      // Auto-generate with AI
      setIsGenerating(created.id);
      try {
        const tempIntent: Intent = {
          id: created.id,
          ...newIntentData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        const generated = await generateIntentConfig(tempIntent);
        await updateIntent(created.id, generated);
        // Don't auto-open intent after generation - stay on the list view
      } finally {
        setIsGenerating(null);
      }
    } catch (error) {
      console.error('Error creating intent:', error);
    }
  };

  const handleSaveIntent = async (intent: Intent) => {
    try {
      await updateIntent(intent.id, intent);
    } catch (error) {
      console.error('Error saving intent:', error);
    }
  };

  const handleDeleteIntent = async (intentId: string) => {
    try {
      await deleteIntent(intentId);
      if (selectedIntentId === intentId) {
        setSelectedIntentId(null);
      }
    } catch (error) {
      console.error('Error deleting intent:', error);
    }
  };

  const handleGenerateFlow = async (intentId: string, section: 'training' | 'entities' | 'pipeline' | 'enrichments' | 'response' | 'all' = 'all') => {
    const controller = new AbortController();
    setGenerationAbortController(controller);
    setIsGenerating(intentId);
    setGenerationProgress({ current: 0, total: section === 'all' ? 5 : 1, step: 'Starting generation...' });
    try {
      const intent = intents.find(i => i.id === intentId);
      if (intent) {
        const generated = await generateIntentConfig(intent, controller.signal, section);
        await updateIntent(intentId, generated);
        const sectionLabel = section === 'all' ? 'full configuration' : section;
        toast({ title: 'Generation Complete', description: `Successfully generated ${sectionLabel} for "${intent.name}"` });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Generation failed';
      if (!message.includes('cancelled')) {
        toast({ title: 'Generation Failed', description: message, variant: 'destructive' });
      }
    } finally {
      setIsGenerating(null);
      setGenerationAbortController(null);
      setGenerationProgress({ current: 0, total: 0, step: '' });
    }
  };

  // Cancel ongoing generation
  const handleCancelGeneration = () => {
    if (generationAbortController) {
      generationAbortController.abort();
      toast({ title: 'Generation Cancelled', description: 'You can retry when ready.' });
    }
  };

  // Retry generation for stuck/failed intents
  const handleRetryGeneration = async (intentId: string) => {
    // Reset intent status first
    await updateIntent(intentId, { generatedBy: 'pending' as const });
    // Then regenerate
    await handleGenerateFlow(intentId);
  };

  // Import handlers
  const handleImport = async (file: File) => {
    setIsImporting(true);
    
    try {
      const content = await file.text();
      const importedData = parseImportedIntents(content);
      
      // Create all intents in database
      for (const data of importedData) {
        const intentData = {
          name: data.name || '',
          moduleId: data.moduleId || '',
          subModuleId: data.subModuleId || '',
          description: data.description,
          isActive: data.isActive ?? true,
          trainingPhrases: [] as string[],
          entities: [] as Entity[],
          generatedBy: 'pending' as const,
        };
        await createIntent(intentData);
      }
      
      // Refetch and generate configurations
      await fetchIntents();
      setIsImporting(false);
      
      // Get newly created intents for generation
      const pendingIntents = intents.filter(i => i.generatedBy === 'pending');
      setGenerationProgress({ current: 0, total: pendingIntents.length, step: 'Starting...' });
      
      for (let i = 0; i < pendingIntents.length; i++) {
        setGenerationProgress({ current: i + 1, total: pendingIntents.length, step: `Generating ${pendingIntents[i].name}` });
        const generated = await generateIntentConfig(pendingIntents[i]);
        await updateIntent(pendingIntents[i].id, generated);
      }
      
      setGenerationProgress({ current: 0, total: 0, step: '' });
      toast({ title: `Successfully imported ${importedData.length} intents!` });
    } catch (error) {
      console.error('Import error:', error);
      toast({ title: 'Error importing intents', variant: 'destructive' });
      setIsImporting(false);
      setGenerationProgress({ current: 0, total: 0, step: '' });
    }
  };

  const handleExportCSV = () => {
    const csv = exportIntentsToCSV(intents);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cfo_intents_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const config = {
      version: '3.0.0',
      exportedAt: new Date().toISOString(),
      llmConfig: { provider: llmConfig.provider, model: llmConfig.model },
      businessContext,
      countryConfigs: countryConfigs,
      modules: modules,
      intents
    };
    
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cfo_ai_config_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadTemplate = () => {
    const template = generateImportTemplate();
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cfo_intent_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Sidebar groups
  const configTabs = [
    { id: 'mcp', label: 'MCP Tools', icon: <Box size={18} />, count: isFetchingMcpTools ? undefined : allMcpTools.length, loading: isFetchingMcpTools },
    { id: 'enrichments', label: 'Enrichments', icon: <Sparkles size={18} />, count: enrichmentTypes.length },
    { id: 'business', label: 'Business Context', icon: <Building2 size={18} /> },
    { id: 'countries', label: 'Country Config', icon: <Globe size={18} /> },
    { id: 'llm', label: 'LLM Settings', icon: <Brain size={18} /> },
  ];
  const configTabIds = configTabs.map(t => t.id);
  const isConfigActive = configTabIds.includes(activeTab);
  const [configOpen, setConfigOpen] = useState(isConfigActive);
  // Auto-expand config group when a config tab is active
  useEffect(() => { if (isConfigActive) setConfigOpen(true); }, [isConfigActive]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 size={24} className="animate-spin" />
          <span>Loading CFO AI Engine...</span>
        </div>
      </div>
    );
  }

  // Main view with sidebar
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-slate-800 text-white flex flex-col">
        <div className="p-4 border-b border-slate-700">
          <h1 className="text-xl font-bold">HelloCFO</h1>
          <p className="text-xs text-slate-400 mt-1">Query Resolution Platform v3.0</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {/* AI Engine */}
          <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">AI Engine</p>
          {[
            { id: 'intents', label: 'Intent Library', icon: <MessageSquare size={18} />, count: intents.length },
            { id: 'test', label: 'Test Console', icon: <FlaskConical size={18} /> },
          ].map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedIntentId(null); }} className={`w-full px-4 py-2.5 flex items-center justify-between text-sm transition-colors ${activeTab === tab.id ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>
              <span className="flex items-center gap-2">{tab.icon} {tab.label}</span>
              {tab.count !== undefined && <span className="px-1.5 py-0.5 bg-slate-600 rounded text-xs">{tab.count}</span>}
            </button>
          ))}

          {/* Configuration (collapsible) */}
          <div className="mt-2 border-t border-slate-700/50">
            <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
              <CollapsibleTrigger className="w-full px-4 pt-3 pb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors">
                <span>Configuration</span>
                <ChevronDown size={12} className={`transition-transform duration-200 ${configOpen ? 'rotate-180' : ''}`} />
              </CollapsibleTrigger>
              <CollapsibleContent>
                {configTabs.map(tab => (
                  <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedIntentId(null); }} className={`w-full px-4 py-2.5 flex items-center justify-between text-sm transition-colors ${activeTab === tab.id ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>
                    <span className="flex items-center gap-2">{tab.icon} {tab.label}</span>
                    {'loading' in tab && (tab as any).loading ? (
                      <span className="px-1.5 py-0.5 bg-slate-600 rounded text-xs flex items-center gap-1">
                        <Loader2 size={10} className="animate-spin" />
                      </span>
                    ) : tab.count !== undefined ? (
                      <span className="px-1.5 py-0.5 bg-slate-600 rounded text-xs">{tab.count}</span>
                    ) : null}
                  </button>
                ))}
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Operations */}
          <div className="mt-2 border-t border-slate-700/50">
            <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Operations</p>
            {[
              { id: 'analytics', label: 'Analytics & History', icon: <BarChart3 size={18} /> },
              { id: 'api-console', label: 'API Console', icon: <Terminal size={18} /> },
              { id: 'master-plan', label: 'Master Plan', icon: <FileText size={18} /> },
            ].map(tab => (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedIntentId(null); }} className={`w-full px-4 py-2.5 flex items-center justify-between text-sm transition-colors ${activeTab === tab.id ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>
                <span className="flex items-center gap-2">{tab.icon} {tab.label}</span>
              </button>
            ))}
            <button onClick={() => { setActiveTab('pipeline-debug'); setSelectedIntentId(null); }} className={`w-full px-4 py-2.5 flex items-center justify-between text-sm transition-colors ${activeTab === 'pipeline-debug' ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>
              <span className="flex items-center gap-2"><GitBranch size={18} /> Pipeline Debugger</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-600/20 text-emerald-400 rounded">NEW</span>
            </button>
          </div>

          {/* Admin */}
          {isAdmin && (
            <div className="mt-2 border-t border-slate-700/50">
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Admin</p>
              <button onClick={() => { setActiveTab('users'); setSelectedIntentId(null); }} className={`w-full px-4 py-2.5 flex items-center justify-between text-sm transition-colors ${activeTab === 'users' ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>
                <span className="flex items-center gap-2"><Users size={18} /> Users</span>
              </button>
            </div>
          )}
        </nav>

        {/* LLM Status */}
        {llmConfig && (
          <div className="p-3 mx-3 mb-3 bg-slate-900 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-lg">{llmProviders.find(p => p.id === llmConfig.provider)?.icon || '🤖'}</span>
              <div>
                <p className="text-xs text-slate-400">LLM Provider</p>
                <p className="text-sm font-medium">{llmConfig.model}</p>
              </div>
            </div>
          </div>
        )}

        {/* User Info & Logout */}
        <div className="p-3 mx-3 mb-3 border-t border-slate-700">
          <div className="flex items-center justify-between">
            <div className="truncate">
              <p className="text-xs font-medium truncate">{user?.email}</p>
              <p className="text-xs text-slate-400">{isAdmin ? 'Admin' : 'User'}</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="p-2 hover:bg-slate-700 rounded-lg transition-colors" title="Sign out">
                  <LogOut size={16} className="text-slate-400" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-slate-800 border-slate-700">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-white">Sign out</AlertDialogTitle>
                  <AlertDialogDescription className="text-slate-400">
                    Are you sure you want to sign out of your account?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => signOut()} className="bg-red-600 hover:bg-red-700 text-white">Sign out</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'intents' && selectedIntentId && stableSelectedIntent && businessContext ? (
          <IntentDetailScreen
            key={selectedIntentId}
            intent={stableSelectedIntent}
            modules={modules}
            mcpTools={allMcpTools}
            enrichmentTypes={enrichmentTypes}
            entityTypes={entityTypes}
            responseTypes={responseTypes}
            countryConfigs={countryConfigs}
            businessContext={businessContext}
            onBack={() => setSelectedIntentId(null)}
            onSave={handleSaveIntent}
            onDelete={handleDeleteIntent}
            onRegenerate={regenerateSection}
          />
        ) : activeTab === 'intents' ? (
          <IntentListView
            intents={filteredIntents}
            modules={modules}
            searchTerm={searchTerm}
            filterModule={filterModule}
            filterStatus={filterStatus}
            onSearchChange={setSearchTerm}
            onFilterModuleChange={setFilterModule}
            onFilterStatusChange={setFilterStatus}
            onSelectIntent={setSelectedIntentId}
            onAddIntent={() => setShowCreateModal(true)}
            onDeleteIntent={handleDeleteIntent}
            onGenerateFlow={handleGenerateFlow}
            onImport={handleImport}
            onExportCSV={handleExportCSV}
            onExportJSON={handleExportJSON}
            onDownloadTemplate={handleDownloadTemplate}
            onOpenAIGenerator={() => setShowAIGeneratorModal(true)}
            isGenerating={isGenerating}
            isImporting={isImporting}
            generationProgress={generationProgress}
            mcpTools={allMcpTools}
          />
        ) : null}
        
        {activeTab === 'mcp' && (
          <MCPToolsView 
            tools={helloBooksMcpTools}
            isLoading={isFetchingMcpTools}
            error={mcpToolsError}
            onRefresh={(creds) => fetchHelloBooksMcpTools(creds)}
          />
        )}
        {activeTab === 'enrichments' && (
          <EnrichmentsView 
            enrichmentTypes={enrichmentTypes} 
            onAdd={createEnrichmentType}
            onUpdate={updateEnrichmentType}
            onDelete={deleteEnrichmentType}
          />
        )}
        {activeTab === 'business' && (
          <BusinessContextView 
            context={businessContext} 
            allContexts={allContexts}
            countryConfigs={countryConfigs} 
            onChange={updateContext} 
            onCreate={createContext}
            onDelete={deleteContext}
            onSetDefault={setAsDefault}
          />
        )}
        {activeTab === 'countries' && (
          <CountryConfigView 
            countryConfigs={countryConfigs}
            onAdd={createCountryConfig}
            onUpdate={updateCountryConfig}
            onDelete={deleteCountryConfig}
          />
        )}
        {activeTab === 'llm' && llmConfig && (
          <div className="p-6">
            <h2 className="text-xl font-bold text-foreground mb-4">LLM Configuration</h2>
            <div className="p-4 border rounded-lg bg-white space-y-3">
              <div><span className="text-sm text-muted-foreground">Provider:</span> <span className="font-medium">{llmConfig.provider}</span></div>
              <div><span className="text-sm text-muted-foreground">Model:</span> <span className="font-medium">{llmConfig.model}</span></div>
              <div><span className="text-sm text-muted-foreground">Temperature:</span> <span className="font-medium">{llmConfig.temperature}</span></div>
              <div><span className="text-sm text-muted-foreground">Max Tokens:</span> <span className="font-medium">{llmConfig.maxTokens}</span></div>
            </div>
          </div>
        )}
        {activeTab === 'test' && (
          <div className="p-6">
            <h2 className="text-xl font-bold text-foreground mb-4">Test Console</h2>
            <p className="text-muted-foreground">Use the CFO Agent tab to test queries interactively.</p>
          </div>
        )}
        
        {activeTab === 'analytics' && <UnifiedAnalyticsView />}
        {activeTab === 'api-console' && <ApiConsole />}
        {activeTab === 'master-plan' && <MasterPlanView />}
        {activeTab === 'pipeline-debug' && <PipelineDebugPage />}
        {activeTab === 'users' && isAdmin && (
          <div className="p-6">
            <UsersManagement />
          </div>
        )}
      </div>

      {/* Create Intent Modal */}
      <CreateIntentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateIntent}
        modules={modules}
      />

      {/* AI Intent Generator Modal */}
      <AIIntentGeneratorModal
        isOpen={showAIGeneratorModal}
        onClose={() => setShowAIGeneratorModal(false)}
        modules={modules}
        existingIntents={intents}
        businessContext={businessContext}
        mcpTools={allMcpTools}
        onIntentsGenerated={fetchIntents}
      />
    </div>
  );
}

