// ============================================================================
// CFO AI - Query Resolution Engine v3.0
// AI-First Architecture: Human creates minimal, AI generates, Human edits
// TypeScript + shadcn/ui + Tailwind
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { UsersManagement } from '@/components/UsersManagement';
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
  CheckCircle2, LockKeyhole
} from 'lucide-react';
import ApiConsole from '@/components/ApiConsole';
import { AIIntentGeneratorModal } from '@/components/AIIntentGeneratorModal';
import { CasesLibraryView } from '@/components/CasesLibraryView';
import { TEST_CASES } from '@/data/testCases';
import UnifiedAnalyticsView from '@/components/UnifiedAnalyticsView';
import MasterPlanView from '@/components/MasterPlanView';

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-gray-900">Data Pipeline</h3>
          <p className="text-sm text-gray-500">Sequence of data fetching and computation steps</p>
        </div>
        <AIBadge 
          confidence={intent.aiConfidence} 
          onRegenerate={onRegenerate}
          isRegenerating={isRegenerating}
        />
      </div>

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
                <span><strong>#Conditional</strong> - Branch logic</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Tab: Enrichments (AI Generated → Editable)
function EnrichmentsTab({ 
  intent, 
  enrichmentTypes,
  onChange,
  onRegenerate,
  isRegenerating
}: { 
  intent: Intent; 
  enrichmentTypes: EnrichmentType[];
  onChange: (updates: Partial<Intent>) => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
}) {
  const enrichments = intent.resolutionFlow?.enrichments || [];

  const updateEnrichments = (newEnrichments: Enrichment[]) => {
    onChange({
      resolutionFlow: {
        ...intent.resolutionFlow!,
        enrichments: newEnrichments
      }
    });
  };

  const addEnrichment = (type: string) => {
    const enrichmentType = enrichmentTypes.find(e => e.id === type);
    const newEnrichment: Enrichment = {
      id: `e${Date.now()}`,
      type,
      config: {},
      description: enrichmentType?.description || ''
    };
    updateEnrichments([...enrichments, newEnrichment]);
  };

  const removeEnrichment = (id: string) => {
    updateEnrichments(enrichments.filter(e => e.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-gray-900">Enrichments</h3>
          <p className="text-sm text-gray-500">Intelligence functions applied to data</p>
        </div>
        <AIBadge 
          confidence={intent.aiConfidence} 
          onRegenerate={onRegenerate}
          isRegenerating={isRegenerating}
        />
      </div>

      {!intent.resolutionFlow ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Sparkles size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500 text-lg">No enrichments configured</p>
          <p className="text-gray-400 text-sm mt-1">Click "Regenerate" to have AI select enrichments</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {enrichments.map((enrichment) => {
              const type = enrichmentTypes.find(t => t.id === enrichment.type);
              return (
                <div key={enrichment.id} className="flex items-center gap-3 p-3 border rounded-lg bg-white">
                  <span className="text-xl">{type?.icon || '✨'}</span>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{type?.name || enrichment.type}</div>
                    <div className="text-xs text-gray-500">{enrichment.description}</div>
                  </div>
                  <button
                    onClick={() => removeEnrichment(enrichment.id)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-5 gap-2">
            {enrichmentTypes.map(type => {
              const isAdded = enrichments.some(e => e.type === type.id);
              return (
                <button
                  key={type.id}
                  onClick={() => !isAdded && addEnrichment(type.id)}
                  disabled={isAdded}
                  className={`p-2 border rounded-lg text-center transition-colors ${
                    isAdded 
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                      : 'hover:bg-gray-50 hover:border-blue-500'
                  }`}
                >
                  <span className="text-lg">{type.icon}</span>
                  <div className="text-xs mt-1 truncate">{type.name}</div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Tab: Response Config (AI Generated → Editable)
function ResponseConfigTab({ 
  intent, 
  onChange,
  onRegenerate,
  isRegenerating,
  responseTypes
}: { 
  intent: Intent; 
  onChange: (updates: Partial<Intent>) => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
  responseTypes: ResponseType[];
}) {
  const responseConfig = intent.resolutionFlow?.responseConfig;
  const [newQuestion, setNewQuestion] = useState('');

  const updateResponseConfig = (updates: Partial<ResponseConfig>) => {
    if (!intent.resolutionFlow) return;
    onChange({
      resolutionFlow: {
        ...intent.resolutionFlow,
        responseConfig: {
          ...intent.resolutionFlow.responseConfig,
          ...updates
        }
      }
    });
  };

  const addFollowUp = () => {
    if (newQuestion.trim() && responseConfig) {
      updateResponseConfig({
        followUpQuestions: [...(responseConfig.followUpQuestions || []), newQuestion.trim()]
      });
      setNewQuestion('');
    }
  };

  const removeFollowUp = (index: number) => {
    if (responseConfig) {
      updateResponseConfig({
        followUpQuestions: (responseConfig.followUpQuestions || []).filter((_, i) => i !== index)
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-gray-900">Response Configuration</h3>
          <p className="text-sm text-gray-500">Template for generating the final response</p>
        </div>
        <AIBadge 
          confidence={intent.aiConfidence} 
          onRegenerate={onRegenerate}
          isRegenerating={isRegenerating}
        />
      </div>

      {!responseConfig ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Code size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500 text-lg">No response template configured</p>
          <p className="text-gray-400 text-sm mt-1">Click "Regenerate" to have AI create a template</p>
        </div>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Response Type</label>
            <select
              value={responseConfig.type}
              onChange={(e) => updateResponseConfig({ type: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg bg-white"
            >
              {(responseTypes || []).map(t => (
                <option key={t.id} value={t.id}>{t.name} - {t.description}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Response Template</label>
            <textarea
              value={responseConfig.template}
              onChange={(e) => updateResponseConfig({ template: e.target.value })}
              rows={12}
              className="w-full px-3 py-2 border rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Template with {variables}, {#if conditions}, {#each loops}..."
            />
            <p className="text-xs text-gray-500 mt-1">
              Use {'{variable}'}, {'{variable | currency}'}, {'{#if condition}'}, {'{#each items}'} syntax
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Follow-up Questions</label>
            <div className="space-y-2 mb-3">
              {(responseConfig.followUpQuestions || []).map((q, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={q}
                    onChange={(e) => {
                      const updated = [...responseConfig.followUpQuestions];
                      updated[i] = e.target.value;
                      updateResponseConfig({ followUpQuestions: updated });
                    }}
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  />
                  <button
                    onClick={() => removeFollowUp(i)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addFollowUp()}
                placeholder="Add follow-up question..."
                className="flex-1 px-3 py-2 border rounded-lg text-sm"
              />
              <button
                onClick={addFollowUp}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                Add
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Tab: Test (Run test query)
function TestTab({ 
  intent,
  businessContext,
  countryConfigs
}: { 
  intent: Intent;
  businessContext: BusinessContext;
  countryConfigs: CountryConfig[];
}) {
  const [query, setQuery] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const sampleQueries = intent.trainingPhrases.slice(0, 3);

  // Extract entities from query based on intent entity definitions
  const extractEntities = (testQuery: string, entities: Entity[]): Record<string, any> => {
    const extracted: Record<string, any> = {};
    
    entities.forEach(entity => {
      // Try to extract entity values from query
      const entityPlaceholder = `{{${entity.name}}}`;
      
      // Find if any training phrase contains this entity and try to match pattern
      for (const phrase of intent.trainingPhrases) {
        if (phrase.includes(entityPlaceholder)) {
          // Simple extraction: look for numbers, dates, or known patterns
          if (entity.type === 'number' || entity.type === 'amount') {
            const numberMatch = testQuery.match(/\b(\d+(?:\.\d+)?)\b/);
            if (numberMatch) {
              extracted[entity.name] = parseFloat(numberMatch[1]);
            }
          } else if (entity.type === 'period') {
            const periodPatterns = ['MTD', 'QTD', 'YTD', '7d', '30d', '90d', 'week', 'month', 'quarter', 'year'];
            for (const period of periodPatterns) {
              if (testQuery.toLowerCase().includes(period.toLowerCase())) {
                extracted[entity.name] = period;
                break;
              }
            }
          } else if (entity.type === 'date_range') {
            const dateMatch = testQuery.match(/(\w+\s+\d{4})\s*(?:to|-)\s*(\w+\s+\d{4})/i);
            if (dateMatch) {
              extracted[entity.name] = { start: dateMatch[1], end: dateMatch[2] };
            }
          }
          break;
        }
      }
      
      // Apply default value if not extracted and has default
      if (extracted[entity.name] === undefined && entity.defaultValue) {
        extracted[entity.name] = entity.defaultValue;
      }
    });
    
    return extracted;
  };

  // Calculate match confidence based on training phrases similarity
  const calculateConfidence = (testQuery: string): number => {
    const queryWords = testQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    let bestMatch = 0;
    
    for (const phrase of intent.trainingPhrases) {
      // Remove entity placeholders for comparison
      const cleanPhrase = phrase.replace(/\{\{[^}]+\}\}/g, '').toLowerCase();
      const phraseWords = cleanPhrase.split(/\s+/).filter(w => w.length > 2);
      
      // Count matching words
      const matchingWords = queryWords.filter(qw => 
        phraseWords.some(pw => pw.includes(qw) || qw.includes(pw))
      );
      
      const similarity = matchingWords.length / Math.max(queryWords.length, phraseWords.length, 1);
      bestMatch = Math.max(bestMatch, similarity);
    }
    
    return Math.min(0.98, Math.max(0.5, bestMatch * 0.9 + 0.1));
  };

  // Process pipeline nodes
  const processPipeline = (pipeline: PipelineNode[], entities: Record<string, any>): Record<string, any> => {
    const pipelineResults: Record<string, any> = {};
    
    pipeline.forEach(node => {
      if (node.nodeType === 'api_call') {
        // Simulate API call result
        pipelineResults[node.outputVariable] = {
          status: 'success',
          tool: node.mcpTool,
          params: node.parameters,
          data: `[Simulated data from ${node.mcpTool}]`
        };
      } else if (node.nodeType === 'computation') {
        pipelineResults[node.outputVariable] = {
          formula: node.formula,
          result: '[Computed value]'
        };
      } else if (node.nodeType === 'conditional') {
        pipelineResults[node.outputVariable] = {
          condition: node.condition,
          result: true
        };
      }
    });
    
    return pipelineResults;
  };

  // Process enrichments
  const processEnrichments = (enrichments: Enrichment[]): Record<string, any> => {
    const enrichmentResults: Record<string, any> = {};
    
    enrichments.forEach(enrichment => {
      enrichmentResults[enrichment.type] = {
        applied: true,
        config: enrichment.config,
        result: `[${enrichment.type} analysis applied]`
      };
    });
    
    return enrichmentResults;
  };

  // Generate response from template
  const generateResponse = (template: string, data: Record<string, any>): string => {
    if (!template) return 'No response template configured';
    
    let response = template;
    
    // Replace simple variables {variableName}
    response = response.replace(/\{(\w+)(?:\s*\|\s*\w+(?::\d+)?)?\}/g, (match, varName) => {
      return data[varName] !== undefined ? String(data[varName]) : `[${varName}]`;
    });
    
    // Handle conditionals {#if condition}...{/if}
    response = response.replace(/\{#if\s+[^}]+\}[\s\S]*?\{\/if\}/g, '[Conditional content]');
    
    // Handle loops {#each items}...{/each}
    response = response.replace(/\{#each\s+[^}]+\}[\s\S]*?\{\/each\}/g, '[Loop content]');
    
    return response;
  };

  const runTest = async (testQuery: string) => {
    setIsRunning(true);
    setQuery(testQuery);
    setError(null);
    
    const startTime = Date.now();
    
    try {
      // Step 1: Extract entities
      const extractedEntities = extractEntities(testQuery, intent.entities);
      
      // Step 2: Calculate match confidence
      const confidence = calculateConfidence(testQuery);
      
      // Step 3: Process pipeline
      const pipeline = intent.resolutionFlow?.dataPipeline || [];
      const pipelineResults = processPipeline(pipeline, extractedEntities);
      
      // Step 4: Process enrichments
      const enrichments = intent.resolutionFlow?.enrichments || [];
      const enrichmentResults = processEnrichments(enrichments);
      
      // Step 5: Generate response
      const responseTemplate = intent.resolutionFlow?.responseConfig?.template || '';
      const allData = { ...extractedEntities, ...pipelineResults, ...enrichmentResults };
      const responsePreview = generateResponse(responseTemplate, allData);
      
      const executionTime = Date.now() - startTime;
      
      setResult({
        matchedIntent: { name: intent.name, confidence },
        entities: extractedEntities,
        pipelineSteps: pipeline.length,
        pipelineResults,
        enrichmentsApplied: enrichments.length,
        enrichmentResults,
        executionTime: `${(executionTime / 1000).toFixed(2)}s`,
        response: responsePreview,
        followUpQuestions: intent.resolutionFlow?.responseConfig?.followUpQuestions || []
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test execution failed');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium text-gray-900">Test Intent</h3>
        <p className="text-sm text-gray-500">Test this intent with sample or custom queries</p>
      </div>

      {/* Sample Queries */}
      {sampleQueries.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Sample Queries</label>
          <div className="space-y-2">
            {sampleQueries.map((q, i) => (
              <button
                key={i}
                onClick={() => runTest(q)}
                disabled={isRunning}
                className="w-full text-left px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 flex items-center justify-between transition-colors disabled:opacity-50"
              >
                <span>{q}</span>
                <Play size={14} className="text-gray-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom Query */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Custom Query</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter a test query..."
            className="flex-1 px-3 py-2 border rounded-lg"
          />
          <button
            onClick={() => runTest(query)}
            disabled={isRunning || !query.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRunning ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            Run Test
          </button>
        </div>
      </div>

      {/* Context */}
      <div className="p-3 bg-gray-50 rounded-lg">
        <div className="text-sm font-medium text-gray-700 mb-2">Context</div>
        <div className="flex gap-4 text-sm text-gray-600">
          <span>{countryConfigs.find(c => c.code === businessContext.country)?.flag} {businessContext.country}</span>
          <span>📊 {businessContext.entitySize}</span>
          <span>🏭 {businessContext.industry}</span>
          <span>💰 {businessContext.currency}</span>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="border border-red-200 rounded-lg overflow-hidden bg-red-50">
          <div className="px-4 py-3 flex items-center gap-2">
            <AlertCircle size={16} className="text-red-600" />
            <span className="font-medium text-red-700">Test Failed</span>
          </div>
          <div className="px-4 pb-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-green-50 border-b flex items-center gap-2">
            <Check size={16} className="text-green-600" />
            <span className="font-medium text-green-700">Test Complete</span>
            <span className="text-sm text-green-600 ml-auto">⏱️ {result.executionTime}</span>
          </div>
          <div className="p-4 space-y-4">
            {/* Matched Intent */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Matched Intent</div>
              <div className="font-medium">
                {result.matchedIntent.name}
                <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                  result.matchedIntent.confidence >= 0.8 ? 'bg-green-100 text-green-700' :
                  result.matchedIntent.confidence >= 0.6 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {Math.round(result.matchedIntent.confidence * 100)}% confidence
                </span>
              </div>
            </div>
            
            {/* Extracted Tool Parameters */}
            {Object.keys(result.entities).length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Extracted Tool Parameters</div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  {Object.entries(result.entities).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-purple-600">{key}:</span>
                      <span className="font-mono text-gray-700">{JSON.stringify(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Pipeline Execution */}
            {result.pipelineSteps > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Pipeline Execution ({result.pipelineSteps} steps)</div>
                <div className="bg-blue-50 p-3 rounded-lg space-y-2">
                  {Object.entries(result.pipelineResults).map(([key, value]: [string, any]) => (
                    <div key={key} className="text-sm">
                      <span className="font-mono text-blue-600">{key}:</span>
                      <span className="ml-2 text-gray-600">
                        {value.tool ? `Called @${value.tool}` : value.formula ? `Computed: ${value.formula}` : 'Evaluated'}
                      </span>
                      <Check size={12} className="inline ml-2 text-green-500" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Enrichments */}
            {result.enrichmentsApplied > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Enrichments Applied ({result.enrichmentsApplied})</div>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(result.enrichmentResults).map(type => (
                    <span key={type} className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs flex items-center gap-1">
                      <Sparkles size={10} />
                      {type}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {/* Response Preview */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Response Preview</div>
              <pre className="text-sm bg-gray-50 p-3 rounded-lg overflow-auto whitespace-pre-wrap border">{result.response}</pre>
            </div>
            
            {/* Follow-up Questions */}
            {result.followUpQuestions && result.followUpQuestions.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Follow-up Questions</div>
                <div className="space-y-1">
                  {result.followUpQuestions.map((q: string, i: number) => (
                    <button
                      key={i}
                      onClick={() => runTest(q)}
                      className="block w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded border transition-colors"
                    >
                      💬 {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// INTENT DETAIL SCREEN
// ============================================================================

interface IntentDetailScreenProps {
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
}

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
  onRegenerate
}: IntentDetailScreenProps) {
  const [activeTab, setActiveTab] = useState('details');
  const [editingIntent, setEditingIntent] = useState<Intent>(initialIntent);
  const [isRegenerating, setIsRegenerating] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const { getIntentAnalytics, isLoading: isAnalyticsLoading } = useToolAnalytics();

  useEffect(() => {
    setEditingIntent(initialIntent);
    setHasChanges(false);
  }, [initialIntent]);

  const handleChange = (updates: Partial<Intent>) => {
    setEditingIntent(prev => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  const handleSave = () => {
    onSave({
      ...editingIntent,
      updatedAt: new Date().toISOString()
    });
    setHasChanges(false);
  };

  const handleRegenerate = async (section?: string, options?: { phraseCount?: number }) => {
    setIsRegenerating(section || 'all');
    try {
      const generated = await onRegenerate(editingIntent.id, section, options);
      const merged = { ...editingIntent, ...generated };
      setEditingIntent(merged);
      // Auto-save after AI generation
      onSave({ ...merged, updatedAt: new Date().toISOString() });
      setHasChanges(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to regenerate';
      console.error('Regenerate failed:', err);
      toast({ title: 'AI Generation Error', description: message, variant: 'destructive' });
    } finally {
      setIsRegenerating(null);
    }
  };

  const selectedModule = modules.find(m => m.id === editingIntent.moduleId);

  const tabs = [
    { id: 'details', label: 'Details', icon: <FileText size={16} /> },
    { id: 'training', label: 'Training Phrases', icon: <MessageSquare size={16} /> },
    { id: 'entities', label: 'Tool Parameters', icon: <Variable size={16} /> },
    { id: 'pipeline', label: 'Data Pipeline', icon: <Database size={16} /> },
    { id: 'enrichments', label: 'Enrichments', icon: <Sparkles size={16} /> },
    { id: 'response', label: 'Response', icon: <Code size={16} /> },
    { id: 'usage', label: 'Usage', icon: <BarChart3 size={16} /> },
    { id: 'test', label: 'Test', icon: <TestTube size={16} /> }
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Panel */}
      <div className="w-80 bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft size={18} /> Back to List
          </button>
          <h2 className="text-lg font-bold text-gray-900 truncate">
            {editingIntent.name || 'New Intent'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {selectedModule?.icon} {selectedModule?.name}
          </p>
        </div>

        {/* Status */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-600">Status</span>
            {editingIntent.generatedBy === 'ai' ? (
              <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs flex items-center gap-1">
                <Check size={12} /> AI Generated
              </span>
            ) : editingIntent.generatedBy === 'pending' ? (
              <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs">
                ⏳ Pending Generation
              </span>
            ) : (
              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                ✏️ Manual
              </span>
            )}
          </div>
          
          {editingIntent.aiConfidence && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-600">AI Confidence</span>
              <span className="text-sm font-medium">{Math.round(editingIntent.aiConfidence * 100)}%</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Active</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={editingIntent.isActive}
                onChange={(e) => handleChange({ isActive: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        {/* Regenerate All */}
        {editingIntent.generatedBy !== 'pending' && (
          <div className="p-4 border-b">
            <button
              onClick={() => handleRegenerate('all')}
              disabled={isRegenerating !== null}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg flex items-center justify-center gap-2 hover:bg-purple-700 disabled:opacity-50"
            >
              {isRegenerating === 'all' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              Regenerate All with AI
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full px-4 py-2.5 flex items-center gap-2 text-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>

        {/* Actions */}
        <div className="p-4 border-t space-y-2">
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} /> Save Changes
          </button>
          <button
            onClick={() => {
              if (confirm('Delete this intent?')) {
                onDelete(editingIntent.id);
              }
            }}
            className="w-full px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg flex items-center justify-center gap-2"
          >
            <Trash2 size={16} /> Delete Intent
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl">
          {/* Unsaved Changes Warning */}
          {hasChanges && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-700">
              <AlertCircle size={16} />
              <span className="text-sm">You have unsaved changes</span>
            </div>
          )}

          {/* Tab Content */}
          {activeTab === 'details' && (
            <IntentDetailsTab 
              intent={editingIntent} 
              modules={modules}
              onChange={handleChange} 
            />
          )}
          
          {activeTab === 'training' && (
            <TrainingPhrasesTab
              intent={editingIntent}
              onChange={handleChange}
              onRegenerate={(count) => handleRegenerate('training', { phraseCount: count })}
              isRegenerating={isRegenerating === 'training'}
            />
          )}
          
          {activeTab === 'entities' && (
            <EntitiesTab
              intent={editingIntent}
              onChange={handleChange}
              onRegenerate={() => handleRegenerate('entities')}
              isRegenerating={isRegenerating === 'entities'}
              entityTypes={entityTypes}
            />
          )}
          
          {activeTab === 'pipeline' && (
            <DataPipelineTab
              intent={editingIntent}
              mcpTools={mcpTools}
              onChange={handleChange}
              onRegenerate={() => handleRegenerate('pipeline')}
              isRegenerating={isRegenerating === 'pipeline'}
            />
          )}
          
          {activeTab === 'enrichments' && (
            <EnrichmentsTab
              intent={editingIntent}
              enrichmentTypes={enrichmentTypes}
              onChange={handleChange}
              onRegenerate={() => handleRegenerate('enrichments')}
              isRegenerating={isRegenerating === 'enrichments'}
            />
          )}
          
          {activeTab === 'response' && (
            <ResponseConfigTab
              intent={editingIntent}
              onChange={handleChange}
              onRegenerate={() => handleRegenerate('response')}
              isRegenerating={isRegenerating === 'response'}
              responseTypes={responseTypes}
            />
          )}
          
          {activeTab === 'usage' && (
            <IntentUsageTab
              intentName={editingIntent.name}
              analytics={getIntentAnalytics(editingIntent.name)}
              isLoading={isAnalyticsLoading}
            />
          )}

          {activeTab === 'test' && (
            <TestTab
              intent={editingIntent}
              businessContext={businessContext}
              countryConfigs={countryConfigs}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// INTENT LIST VIEW
// ============================================================================

interface IntentListViewProps {
  intents: Intent[];
  modules: Module[];
  searchTerm: string;
  filterModule: string | null;
  filterStatus: 'all' | 'configured' | 'pending';
  onSearchChange: (term: string) => void;
  onFilterModuleChange: (module: string | null) => void;
  onFilterStatusChange: (status: 'all' | 'configured' | 'pending') => void;
  onSelectIntent: (id: string) => void;
  onAddIntent: () => void;
  onDeleteIntent: (id: string) => void;
  onGenerateFlow: (intentId: string, section?: 'training' | 'entities' | 'pipeline' | 'enrichments' | 'response' | 'all') => void;
  onImport: (file: File) => void;
  onExportCSV: () => void;
  onExportJSON: () => void;
  onDownloadTemplate: () => void;
  onOpenAIGenerator: () => void;
  isGenerating: string | null;
  isImporting: boolean;
  generationProgress: { current: number; total: number };
}

function IntentListView({
  intents,
  modules,
  searchTerm,
  filterModule,
  filterStatus,
  onSearchChange,
  onFilterModuleChange,
  onFilterStatusChange,
  onSelectIntent,
  onAddIntent,
  onDeleteIntent,
  onGenerateFlow,
  onImport,
  onExportCSV,
  onExportJSON,
  onDownloadTemplate,
  onOpenAIGenerator,
  isGenerating,
  isImporting,
  generationProgress
}: IntentListViewProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [intentSubTab, setIntentSubTab] = React.useState<'intents' | 'cases'>('intents');
  const [casesGenProgress, setCasesGenProgress] = React.useState<{ running: boolean; current: number; total: number; created: number; skipped: number; failed: number }>({ running: false, current: 0, total: 0, created: 0, skipped: 0, failed: 0 });
  const [casesGenCount, setCasesGenCount] = React.useState<number>(10);
  const [showCasesGenInput, setShowCasesGenInput] = React.useState(false);
  const [selectedIntentIds, setSelectedIntentIds] = React.useState<Set<string>>(new Set());
  const [bulkGenProgress, setBulkGenProgress] = React.useState<{ running: boolean; current: number; total: number; completed: number; failed: number }>({ running: false, current: 0, total: 0, completed: 0, failed: 0 });
  const [refImporting, setRefImporting] = React.useState(false);
  const [refImportResult, setRefImportResult] = React.useState<{ inserted: number; updated: number; total: number } | null>(null);

  const allSelected = intents.length > 0 && selectedIntentIds.size === intents.length;
  const someSelected = selectedIntentIds.size > 0 && selectedIntentIds.size < intents.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIntentIds(new Set());
    } else {
      setSelectedIntentIds(new Set(intents.map(i => i.id)));
    }
  };

  const toggleSelectIntent = (id: string) => {
    setSelectedIntentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkGenerate = async (section: 'training' | 'entities' | 'pipeline' | 'enrichments' | 'response' | 'all' = 'all') => {
    if (bulkGenProgress.running || selectedIntentIds.size === 0) return;
    const selected = intents.filter(i => selectedIntentIds.has(i.id));
    setBulkGenProgress({ running: true, current: 0, total: selected.length, completed: 0, failed: 0 });

    let completed = 0;
    let failed = 0;

    for (let i = 0; i < selected.length; i++) {
      setBulkGenProgress(prev => ({ ...prev, current: i + 1 }));
      try {
        await onGenerateFlow(selected[i].id, section);
        completed++;
      } catch {
        failed++;
      }
      setBulkGenProgress(prev => ({ ...prev, completed, failed }));
    }

    setBulkGenProgress(prev => ({ ...prev, running: false }));
    setSelectedIntentIds(new Set());
    const sectionLabel = section === 'all' ? 'full config' : section;
    toast({ 
      title: 'Bulk Generation Complete', 
      description: `${completed} succeeded, ${failed} failed out of ${selected.length} intents (${sectionLabel})` 
    });
  };

  const handleGenerateFromCases = async () => {
    if (casesGenProgress.running) return;
    const count = Math.min(Math.max(1, casesGenCount), 50);
    const casesToProcess = TEST_CASES.slice(0, count);

    const batchSize = 8;
    const totalBatches = Math.ceil(casesToProcess.length / batchSize);
    setCasesGenProgress({ running: true, current: 0, total: totalBatches, created: 0, skipped: 0, failed: 0 });
    setShowCasesGenInput(false);

    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase.functions.invoke('generate-intents-from-cases', {
        body: { testCases: casesToProcess, batchSize },
      });

      if (error) throw error;

      const summary = data?.summary || {};
      setCasesGenProgress(prev => ({
        ...prev,
        running: false,
        current: totalBatches,
        created: summary.created || 0,
        skipped: summary.skipped || 0,
        failed: summary.failed || 0,
      }));

      toast({ title: 'Generation complete', description: `Created: ${summary.created}, Skipped: ${summary.skipped}, Failed: ${summary.failed}` });
    } catch (err) {
      console.error('Generate from cases error:', err);
      setCasesGenProgress(prev => ({ ...prev, running: false }));
      toast({ title: 'Generation failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    }
  };
  // Import reference data from pre-built JSON files
  const handleImportReferenceData = async () => {
    if (refImporting) return;
    setRefImporting(true);
    setRefImportResult(null);
    try {
      // Fetch both batch files
      const [batch1Res, batch2Res] = await Promise.all([
        fetch('/data/batch1_intents_with_phrases.json'),
        fetch('/data/batch2_intents_with_phrases.json'),
      ]);
      const batch1 = await batch1Res.json();
      const batch2 = await batch2Res.json();
      const allIntents = [...batch1, ...batch2];

      // Call edge function to upsert
      const { data, error } = await supabase.functions.invoke('bulk-upsert-intents', {
        body: { intents: allIntents },
      });

      if (error) throw error;

      setRefImportResult({ inserted: data.inserted, updated: data.updated, total: data.total });
      toast({
        title: 'Reference data imported',
        description: `${data.inserted} inserted, ${data.updated} updated out of ${data.total} intents`,
      });

      // Refresh intents list
      window.location.reload();
    } catch (err) {
      console.error('Reference import error:', err);
      toast({ title: 'Import failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setRefImporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
      e.target.value = '';
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Intent Library</h1>
          <p className="text-muted-foreground mt-1">Manage query intents and AI-generated configurations</p>
        </div>
        <div className="flex gap-2">
          {/* Sub-tab toggle */}
          <div className="flex gap-1 bg-muted p-1 rounded-lg mr-2">
            <button
              onClick={() => setIntentSubTab('intents')}
              className={`px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors ${
                intentSubTab === 'intents'
                  ? 'bg-background shadow text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <MessageSquare size={14} /> Intents ({intents.length})
            </button>
            <button
              onClick={() => setIntentSubTab('cases')}
              className={`px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors ${
                intentSubTab === 'cases'
                  ? 'bg-background shadow text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ListOrdered size={14} /> Test Cases ({TEST_CASES.length})
            </button>
          </div>
          {intentSubTab === 'intents' && (
            <>
          {/* Import Dropdown */}
          <div className="relative group">
            <button className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm flex items-center gap-2 hover:bg-gray-200">
              <Upload size={16} /> Import
              <ChevronDown size={14} />
            </button>
            <div className="absolute right-0 mt-1 w-48 bg-white border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <button
                onClick={onDownloadTemplate}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Download size={14} /> Download Template
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Upload size={14} /> Import CSV
              </button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
          
          {/* Export Dropdown */}
          <div className="relative group">
            <button className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm flex items-center gap-2 hover:bg-gray-200">
              <Download size={16} /> Export
              <ChevronDown size={14} />
            </button>
            <div className="absolute right-0 mt-1 w-48 bg-white border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <button
                onClick={onExportCSV}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <FileSpreadsheet size={14} /> Export CSV
              </button>
              <button
                onClick={onExportJSON}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <FileJson size={14} /> Export Full Config
              </button>
            </div>
          </div>
          
          <div className="relative">
            <button
              onClick={() => setShowCasesGenInput(!showCasesGenInput)}
              disabled={casesGenProgress.running}
              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg text-sm flex items-center gap-2 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
            >
              {casesGenProgress.running ? <Loader2 size={16} className="animate-spin" /> : <ListOrdered size={16} />}
              {casesGenProgress.running ? 'Generating...' : `Generate from Cases (${TEST_CASES.length})`}
            </button>
            {showCasesGenInput && !casesGenProgress.running && (
              <div className="absolute top-full mt-2 right-0 bg-white border border-border rounded-lg shadow-lg p-4 z-50 w-72">
                <label className="block text-sm font-medium text-foreground mb-1">
                  Number of cases to generate (max 50)
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={casesGenCount}
                  onChange={(e) => setCasesGenCount(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
                  className="w-full px-3 py-2 border border-input rounded-md text-sm mb-3 bg-background"
                />
                <p className="text-xs text-muted-foreground mb-3">
                  Will process cases 1–{Math.min(casesGenCount, 50)} of {TEST_CASES.length} total.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleGenerateFromCases}
                    className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700"
                  >
                    Start Generation
                  </button>
                  <button
                    onClick={() => setShowCasesGenInput(false)}
                    className="px-3 py-2 border border-border rounded-md text-sm hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={onOpenAIGenerator}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg text-sm flex items-center gap-2 hover:from-purple-700 hover:to-indigo-700"
          >
            <Wand2 size={16} /> Generate with AI
          </button>

          <button
            onClick={handleImportReferenceData}
            disabled={refImporting}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-50"
          >
            {refImporting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {refImporting ? 'Importing...' : 'Import Reference Data'}
          </button>
          
          <button
            onClick={onAddIntent}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm flex items-center gap-2 hover:bg-purple-700"
          >
            <Plus size={16} /> Add Intent
          </button>
            </>
          )}
        </div>
      </div>

      {intentSubTab === 'intents' ? (
        <>
      {/* Cases Generation Progress */}
      {casesGenProgress.running && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
          <div className="flex items-center gap-3">
            <Loader2 size={20} className="animate-spin text-emerald-600" />
            <div className="flex-1">
              <p className="font-medium text-emerald-700">
                Generating intents from {TEST_CASES.length} test cases via Azure OpenAI...
              </p>
              <p className="text-xs text-emerald-600 mt-1">
                This may take several minutes. Do not close this page.
              </p>
            </div>
          </div>
        </div>
      )}
      {!casesGenProgress.running && casesGenProgress.created > 0 && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
          <p className="font-medium text-emerald-700">
            ✅ Generation complete: {casesGenProgress.created} created, {casesGenProgress.skipped} skipped, {casesGenProgress.failed} failed
          </p>
        </div>
      )}

      {/* Reference Import Result */}
      {refImportResult && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
          <p className="font-medium text-emerald-700">
            ✅ Reference import complete: {refImportResult.inserted} inserted, {refImportResult.updated} updated (total {refImportResult.total})
          </p>
          <button onClick={() => setRefImportResult(null)} className="text-xs text-emerald-500 hover:underline">Dismiss</button>
        </div>
      )}


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
  const { getToolAnalytics } = useToolAnalytics();

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
              mappedEntities.push({
                _id: entity._id || entity.id,
                Name: entity.Name,
                OrganizationId: org._id,
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

      {error && <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded text-sm">{error}</div>}

      {tools.length > 0 && (
        <p className="text-xs text-muted-foreground mb-3">{tools.length} tools loaded</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {tools.map(tool => {
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

      {tools.length === 0 && !isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          <Database size={32} className="mx-auto mb-2 opacity-30" />
          <p>No MCP tools loaded</p>
          <p className="text-sm opacity-60 mt-1">{isLoggedIn ? 'Select entity & org, then click Fetch Tools' : 'Login to get started'}</p>
        </div>
      )}
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
    { id: 'mcp', label: 'MCP Tools', icon: <Box size={18} />, count: allMcpTools.length },
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

  // If an intent is selected, show the detail view (use stableSelectedIntent to prevent unmount during refetch)
  if (selectedIntentId && stableSelectedIntent && businessContext) {
    return (
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

        {/* Context Badge */}
        {businessContext && (
          <div className="p-3 mx-3 mt-3 bg-slate-900 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-400">Active Context</p>
              <span className="text-xs">{countryConfigs.find(c => c.code === businessContext.country)?.flag}</span>
            </div>
            <div className="text-sm font-medium">{businessContext.industry.replace('_', ' ')}</div>
            <div className="flex gap-1 mt-2 flex-wrap">
              <span className="px-2 py-0.5 bg-slate-700 rounded text-xs">{businessContext.entitySize}</span>
              <span className="px-2 py-0.5 bg-slate-700 rounded text-xs">{businessContext.currency}</span>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {/* AI Engine */}
          <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">AI Engine</p>
          {[
            { id: 'intents', label: 'Intent Library', icon: <MessageSquare size={18} />, count: intents.length },
            { id: 'test', label: 'Test Console', icon: <FlaskConical size={18} /> },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`w-full px-4 py-2.5 flex items-center justify-between text-sm transition-colors ${activeTab === tab.id ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>
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
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`w-full px-4 py-2.5 flex items-center justify-between text-sm transition-colors ${activeTab === tab.id ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>
                    <span className="flex items-center gap-2">{tab.icon} {tab.label}</span>
                    {tab.count !== undefined && <span className="px-1.5 py-0.5 bg-slate-600 rounded text-xs">{tab.count}</span>}
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
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`w-full px-4 py-2.5 flex items-center justify-between text-sm transition-colors ${activeTab === tab.id ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>
                <span className="flex items-center gap-2">{tab.icon} {tab.label}</span>
              </button>
            ))}
            <a href="/debug/pipeline" target="_blank" rel="noopener noreferrer" className="w-full px-4 py-2.5 flex items-center gap-2 text-sm transition-colors hover:bg-slate-700 text-slate-300">
              <GitBranch size={18} /> Pipeline Debugger
              <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-emerald-600/20 text-emerald-400 rounded">NEW</span>
            </a>
          </div>

          {/* Admin */}
          {isAdmin && (
            <div className="mt-2 border-t border-slate-700/50">
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Admin</p>
              <button onClick={() => setActiveTab('users')} className={`w-full px-4 py-2.5 flex items-center justify-between text-sm transition-colors ${activeTab === 'users' ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>
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
                <button
                  className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                  title="Sign out"
                >
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
                  <AlertDialogCancel className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => signOut()}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Sign out
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'intents' && (
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
          />
        )}
        
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

