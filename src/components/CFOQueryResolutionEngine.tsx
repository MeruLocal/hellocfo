// ============================================================================
// CFO AI - Query Resolution Engine v3.0
// AI-First Architecture: Human creates minimal, AI generates, Human edits
// TypeScript + shadcn/ui + Tailwind
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
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
import {
  Plus, Edit, Trash2, X, Check, Download, Upload, Wand2, Database, Sparkles,
  Loader2, Brain, GitBranch, Layers, Box, Play, Save, Settings, Search,
  MessageSquare, FlaskConical, ChevronDown, ChevronRight, ChevronUp, Copy, Code,
  AlertCircle, ArrowRight, FileJson, Zap, ArrowLeft, FileSpreadsheet,
  Globe, Building2, Filter, MoreVertical, Eye, TestTube, RefreshCw,
  ListOrdered, Variable, FileText
} from 'lucide-react';

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
                  <li>• Entities to extract</li>
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
            {intent.trainingPhrases.length > 0 ? 'This will replace existing phrases' : 'AI will generate based on intent name & description'}
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
          <h3 className="font-medium text-gray-900">Entities</h3>
          <p className="text-sm text-gray-500">Parameters to extract from user queries</p>
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
          <p>No entities defined</p>
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

  const updatePipeline = (newPipeline: PipelineNode[]) => {
    onChange({
      resolutionFlow: {
        ...intent.resolutionFlow!,
        dataPipeline: newPipeline
      }
    });
  };

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
                                value={node.mcpTool || ''}
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
        followUpQuestions: [...responseConfig.followUpQuestions, newQuestion.trim()]
      });
      setNewQuestion('');
    }
  };

  const removeFollowUp = (index: number) => {
    if (responseConfig) {
      updateResponseConfig({
        followUpQuestions: responseConfig.followUpQuestions.filter((_, i) => i !== index)
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
              {responseTypes.map(t => (
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
              {responseConfig.followUpQuestions.map((q, i) => (
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

  const sampleQueries = intent.trainingPhrases.slice(0, 3);

  const runTest = async (testQuery: string) => {
    setIsRunning(true);
    setQuery(testQuery);
    
    // Simulate test execution
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setResult({
      matchedIntent: { name: intent.name, confidence: 0.94 },
      entities: { limit: 3 },
      executionTime: '1.24s',
      response: intent.resolutionFlow?.responseConfig?.template || 'No response template configured'
    });
    
    setIsRunning(false);
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

      {/* Results */}
      {result && (
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-green-50 border-b flex items-center gap-2">
            <Check size={16} className="text-green-600" />
            <span className="font-medium text-green-700">Test Complete</span>
            <span className="text-sm text-green-600 ml-auto">⏱️ {result.executionTime}</span>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <div className="text-xs text-gray-500 mb-1">Matched Intent</div>
              <div className="font-medium">{result.matchedIntent.name} ({Math.round(result.matchedIntent.confidence * 100)}%)</div>
            </div>
            {Object.keys(result.entities).length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Extracted Entities</div>
                <code className="text-sm bg-gray-100 px-2 py-1 rounded">{JSON.stringify(result.entities)}</code>
              </div>
            )}
            <div>
              <div className="text-xs text-gray-500 mb-1">Response Preview</div>
              <pre className="text-sm bg-gray-50 p-3 rounded-lg overflow-auto whitespace-pre-wrap">{result.response}</pre>
            </div>
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
      setEditingIntent(prev => ({ ...prev, ...generated }));
      setHasChanges(true);
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
    { id: 'entities', label: 'Entities', icon: <Variable size={16} /> },
    { id: 'pipeline', label: 'Data Pipeline', icon: <Database size={16} /> },
    { id: 'enrichments', label: 'Enrichments', icon: <Sparkles size={16} /> },
    { id: 'response', label: 'Response', icon: <Code size={16} /> },
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
  onGenerateFlow: (intentId: string) => void;
  onImport: (file: File) => void;
  onExportCSV: () => void;
  onExportJSON: () => void;
  onDownloadTemplate: () => void;
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
  isGenerating,
  isImporting,
  generationProgress
}: IntentListViewProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
          <h1 className="text-2xl font-bold text-gray-900">Intent Library</h1>
          <p className="text-gray-500 mt-1">Manage query intents and AI-generated configurations</p>
        </div>
        <div className="flex gap-2">
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
          
          <button
            onClick={onAddIntent}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm flex items-center gap-2 hover:bg-purple-700"
          >
            <Plus size={16} /> Add Intent
          </button>
        </div>
      </div>

      {/* Import/Generation Progress */}
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

      {/* Intent Table */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="grid grid-cols-12 gap-4 px-4 py-3 border-b bg-gray-50 text-sm font-medium text-gray-600">
          <div className="col-span-4">Intent Name</div>
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
              
              return (
                <div
                  key={intent.id}
                  onClick={() => onSelectIntent(intent.id)}
                  className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="col-span-4">
                    <div className="font-medium text-gray-900">{intent.name}</div>
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
    </div>
  );
}

// ============================================================================
// SIDEBAR VIEWS (MCP Tools, Enrichments, Country Config, LLM, Test)
// ============================================================================

// MCP Tools View
function MCPToolsView({ 
  tools, 
  isLoading,
  error,
  onRefresh
}: { 
  tools: MCPTool[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const [selectedTool, setSelectedTool] = useState<MCPTool | null>(null);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">MCP Tools</h1>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          Refresh HelloBooks
        </button>
      </div>
      <p className="text-gray-500 mb-4">Available data sources for resolution flows</p>
      
      {/* HelloBooks Badge */}
      <div className="mb-4">
        <span className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white">
          🔌 HelloBooks MCP ({tools.length})
        </span>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle size={16} />
            <span className="font-medium">Error loading HelloBooks tools</span>
          </div>
          <p className="text-sm text-red-600 mt-1">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-gray-500">
            <Loader2 size={24} className="animate-spin" />
            <span>Connecting to HelloBooks MCP server...</span>
          </div>
        </div>
      )}

      {/* Tools List */}
      {!isLoading && (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-1 space-y-2 max-h-[500px] overflow-y-auto">
            {tools.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No tools loaded. Click Refresh to fetch from HelloBooks.
              </div>
            ) : (
              tools.map(tool => (
                <button
                  key={tool.id}
                  onClick={() => setSelectedTool(tool)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedTool?.id === tool.id
                      ? 'bg-purple-100 text-purple-700'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="font-medium">@{tool.id}</div>
                  <div className="text-xs text-gray-500 truncate">{tool.description}</div>
                </button>
              ))
            )}
          </div>
          <div className="col-span-2">
            {selectedTool ? (
              <div className="p-4 border rounded-lg bg-white">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                    HelloBooks
                  </span>
                  <h3 className="font-bold text-lg">@{selectedTool.id}</h3>
                </div>
                <p className="text-gray-600 mb-4">{selectedTool.description}</p>
                
                <div className="mb-4">
                  <div className="text-sm font-medium text-gray-700 mb-2">Endpoint</div>
                  <code className="text-sm bg-gray-100 px-2 py-1 rounded">{selectedTool.method} {selectedTool.endpoint}</code>
                </div>
                
                <div className="mb-4">
                  <div className="text-sm font-medium text-gray-700 mb-2">Parameters ({selectedTool.parameters.length})</div>
                  {selectedTool.parameters.length === 0 ? (
                    <p className="text-sm text-gray-500">No parameters</p>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {selectedTool.parameters.map(p => (
                        <div key={p.name} className="text-sm flex items-center gap-2">
                          <code className="bg-gray-100 px-1 rounded">{p.name}</code>
                          <span className="text-gray-500">({p.type})</span>
                          {p.required && <span className="text-red-500 text-xs">required</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">Response Fields</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedTool.responseFields.map(f => (
                      <code key={f} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">{f}</code>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                Select a tool to view details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Enrichments View
function EnrichmentsView({ enrichmentTypes }: { enrichmentTypes: EnrichmentType[] }) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Enrichment Functions</h1>
      <p className="text-gray-500 mb-6">Available intelligence functions for data enrichment (read-only)</p>

      <div className="grid grid-cols-2 gap-4">
        {enrichmentTypes.map(type => (
          <div key={type.id} className="p-4 border rounded-lg bg-white">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{type.icon}</span>
              <div>
                <div className="font-medium">{type.name}</div>
                <div className="text-sm text-gray-500">!{type.id}</div>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-3">{type.description}</p>
            <div className="flex flex-wrap gap-1">
              {type.configFields.map(f => (
                <span key={f} className="text-xs bg-gray-100 px-2 py-0.5 rounded">{f}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Country Config View
function CountryConfigView({ countryConfigs }: { countryConfigs: CountryConfig[] }) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Country Configuration</h1>
      <p className="text-gray-500 mb-6">Entity size classifications by country</p>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Country</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Currency</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Micro</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Small</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Medium</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Large</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {countryConfigs.map(config => (
              <tr key={config.code} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    <span className="text-xl">{config.flag}</span>
                    <span>{config.name}</span>
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-sm">{config.currency}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{config.displayThresholds.micro}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{config.displayThresholds.small}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{config.displayThresholds.medium}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{config.displayThresholds.large}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Business Context Settings View
function BusinessContextView({ 
  context, 
  countryConfigs,
  onChange 
}: { 
  context: BusinessContext;
  countryConfigs: CountryConfig[];
  onChange: (updates: Partial<BusinessContext>) => void;
}) {
  const selectedCountry = countryConfigs.find(c => c.code === context.country);

  const industries = [
    { id: 'real_estate', name: 'Real Estate', subIndustries: ['residential_construction', 'commercial_construction', 'property_management'] },
    { id: 'manufacturing', name: 'Manufacturing', subIndustries: ['automotive', 'electronics', 'textiles', 'food_processing'] },
    { id: 'retail', name: 'Retail', subIndustries: ['ecommerce', 'brick_and_mortar', 'wholesale'] },
    { id: 'services', name: 'Services', subIndustries: ['consulting', 'it_services', 'healthcare', 'education'] },
    { id: 'technology', name: 'Technology', subIndustries: ['software', 'hardware', 'saas', 'fintech'] },
    { id: 'financial_services', name: 'Financial Services', subIndustries: ['banking', 'insurance', 'investment'] }
  ];

  const selectedIndustry = industries.find(i => i.id === context.industry);

  const complianceOptions: Record<string, string[]> = {
    IN: ['GST', 'TDS', 'RERA', 'Companies Act', 'SEBI'],
    US: ['GAAP', 'SOX', 'SEC', 'IRS'],
    GB: ['VAT', 'HMRC', 'Companies House', 'FCA'],
    SG: ['GST', 'IRAS', 'ACRA', 'MAS'],
    AE: ['VAT', 'FTA', 'DIFC', 'ADGM'],
    ZA: ['VAT', 'SARS', 'CIPC', 'JSE'],
    CA: ['GST/HST', 'CRA', 'OSC', 'PIPEDA']
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Business Context</h1>
      <p className="text-gray-500 mb-6">Configure your organization's context for AI-powered insights</p>

      <div className="max-w-3xl space-y-6">
        {/* Location & Currency */}
        <div className="bg-white p-6 rounded-xl border">
          <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
            <Globe size={18} /> Location & Currency
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
              <select
                value={context.country}
                onChange={(e) => {
                  const newCountry = countryConfigs.find(c => c.code === e.target.value);
                  onChange({ 
                    country: e.target.value, 
                    currency: newCountry?.currency || context.currency,
                    complianceFrameworks: []
                  });
                }}
                className="w-full px-3 py-2 border rounded-lg bg-white"
              >
                {countryConfigs.map(c => (
                  <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
              <div className="px-3 py-2 border rounded-lg bg-gray-50 text-gray-700">
                {selectedCountry?.currencySymbol} {selectedCountry?.currency}
              </div>
            </div>
          </div>
        </div>

        {/* Industry */}
        <div className="bg-white p-6 rounded-xl border">
          <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
            <Building2 size={18} /> Industry
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Industry</label>
              <select
                value={context.industry}
                onChange={(e) => onChange({ industry: e.target.value, subIndustry: undefined })}
                className="w-full px-3 py-2 border rounded-lg bg-white"
              >
                {industries.map(i => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sub-Industry</label>
              <select
                value={context.subIndustry || ''}
                onChange={(e) => onChange({ subIndustry: e.target.value || undefined })}
                className="w-full px-3 py-2 border rounded-lg bg-white"
              >
                <option value="">Select sub-industry...</option>
                {selectedIndustry?.subIndustries.map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Entity Size */}
        <div className="bg-white p-6 rounded-xl border">
          <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
            <Layers size={18} /> Entity Size
          </h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Size Classification</label>
              <select
                value={context.entitySize}
                onChange={(e) => onChange({ entitySize: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg bg-white"
              >
                <option value="micro">Micro - {selectedCountry?.displayThresholds.micro}</option>
                <option value="small">Small - {selectedCountry?.displayThresholds.small}</option>
                <option value="medium">Medium - {selectedCountry?.displayThresholds.medium}</option>
                <option value="large">Large - {selectedCountry?.displayThresholds.large}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Annual Revenue</label>
              <input
                type="number"
                value={context.annualRevenue || ''}
                onChange={(e) => onChange({ annualRevenue: parseInt(e.target.value) || undefined })}
                placeholder="Enter annual revenue"
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Employee Count</label>
              <input
                type="number"
                value={context.employeeCount || ''}
                onChange={(e) => onChange({ employeeCount: parseInt(e.target.value) || undefined })}
                placeholder="Number of employees"
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fiscal Year End</label>
              <select
                value={context.fiscalYearEnd}
                onChange={(e) => onChange({ fiscalYearEnd: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg bg-white"
              >
                <option value="march">March</option>
                <option value="december">December</option>
                <option value="june">June</option>
                <option value="september">September</option>
              </select>
            </div>
          </div>
        </div>

        {/* Compliance Frameworks */}
        <div className="bg-white p-6 rounded-xl border">
          <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
            <FileText size={18} /> Compliance Frameworks
          </h3>
          <p className="text-sm text-gray-500 mb-4">Select applicable compliance frameworks for {selectedCountry?.name}</p>
          <div className="flex flex-wrap gap-2">
            {(complianceOptions[context.country] || []).map(framework => {
              const isSelected = context.complianceFrameworks.includes(framework);
              return (
                <button
                  key={framework}
                  onClick={() => {
                    if (isSelected) {
                      onChange({ complianceFrameworks: context.complianceFrameworks.filter(f => f !== framework) });
                    } else {
                      onChange({ complianceFrameworks: [...context.complianceFrameworks, framework] });
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    isSelected
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {isSelected && <Check size={14} className="inline mr-1" />}
                  {framework}
                </button>
              );
            })}
          </div>
        </div>

        {/* Context Summary */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">Current Context Summary</h4>
          <div className="text-sm text-blue-700 space-y-1">
            <p>📍 {selectedCountry?.flag} {selectedCountry?.name} ({context.currency})</p>
            <p>🏭 {context.industry.replace(/_/g, ' ')} {context.subIndustry ? `→ ${context.subIndustry.replace(/_/g, ' ')}` : ''}</p>
            <p>📊 {context.entitySize.charAt(0).toUpperCase() + context.entitySize.slice(1)} Entity ({selectedCountry?.displayThresholds[context.entitySize as keyof typeof selectedCountry.displayThresholds]})</p>
            <p>📅 Fiscal Year End: {context.fiscalYearEnd.charAt(0).toUpperCase() + context.fiscalYearEnd.slice(1)}</p>
            {context.complianceFrameworks.length > 0 && (
              <p>📋 Compliance: {context.complianceFrameworks.join(', ')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// LLM Config View
function LLMConfigView({ 
  config, 
  onChange 
}: { 
  config: LLMConfig; 
  onChange: (updates: Partial<LLMConfig>) => void;
}) {
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedConfig, setEditedConfig] = useState<Partial<LLMConfig>>({});
  
  // Fetch usage logs with model breakdown
  const { totalUsage, usageByModel, loading: usageLoading, refetch: refetchUsage } = useLLMUsageLogs();

  const providers = [
    { id: 'azure-anthropic', name: 'Azure Anthropic', icon: '🔷' },
    { id: 'openai', name: 'OpenAI', icon: '🟢' }
  ];

  const handleStartEdit = () => {
    setEditedConfig({
      provider: config.provider,
      endpoint: config.endpoint,
      model: config.model,
      apiKey: config.apiKey,
      temperature: config.temperature,
      maxTokens: config.maxTokens
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    onChange(editedConfig);
    setIsEditing(false);
    toast({ title: 'LLM Configuration saved successfully' });
  };

  const handleCancel = () => {
    setEditedConfig({});
    setIsEditing(false);
  };

  const currentConfig = isEditing ? { ...config, ...editedConfig } : config;
  const updateField = (updates: Partial<LLMConfig>) => {
    if (isEditing) {
      setEditedConfig(prev => ({ ...prev, ...updates }));
    } else {
      onChange(updates);
    }
  };

  const testConnection = async () => {
    setTestStatus('testing');
    setTestMessage('Testing connection...');
    
    try {
      const response = await fetch(`${currentConfig.endpoint}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': currentConfig.apiKey || '',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: currentConfig.model,
          max_tokens: 50,
          messages: [{ role: 'user', content: 'Say "Connection successful!" in exactly those words.' }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        setTestStatus('success');
        setTestMessage(`✅ Connected! Response: ${data.content[0]?.text?.slice(0, 50) || 'OK'}`);
      } else {
        const errorText = await response.text();
        setTestStatus('error');
        setTestMessage(`❌ Error ${response.status}: ${errorText.slice(0, 100)}`);
      }
    } catch (error) {
      setTestStatus('error');
      setTestMessage(`❌ Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Format currency
  const formatUsd = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(amount);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">LLM Configuration</h1>
        {!isEditing ? (
          <button
            onClick={handleStartEdit}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Edit size={16} />
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <X size={16} />
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Save size={16} />
              Save
            </button>
          </div>
        )}
      </div>
      <p className="text-gray-500 mb-6">Configure the AI model for intent generation</p>

      <div className="max-w-4xl space-y-6">
        <div className="bg-white p-6 rounded-xl border">
          {/* Provider Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">Provider</label>
            <div className="grid grid-cols-2 gap-3">
              {providers.map(provider => (
                <button
                  key={provider.id}
                  onClick={() => isEditing && updateField({ provider: provider.id })}
                  disabled={!isEditing}
                  className={`p-3 border rounded-lg text-center transition-colors ${
                    currentConfig.provider === provider.id
                      ? 'border-blue-500 bg-blue-50'
                      : isEditing ? 'hover:bg-gray-50' : 'opacity-60'
                  } ${!isEditing ? 'cursor-default' : ''}`}
                >
                  <span className="text-2xl">{provider.icon}</span>
                  <div className="text-xs mt-1">{provider.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Endpoint */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">API Endpoint</label>
            <input
              type="text"
              value={currentConfig.endpoint || ''}
              onChange={(e) => updateField({ endpoint: e.target.value })}
              disabled={!isEditing}
              placeholder="https://your-resource.openai.azure.com/anthropic"
              className={`w-full px-3 py-2 border rounded-lg font-mono text-sm ${!isEditing ? 'bg-gray-50 cursor-default' : ''}`}
            />
            <p className="text-xs text-gray-500 mt-1">Full URL to the API endpoint</p>
          </div>

          {/* Model - Text Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Model</label>
            <input
              type="text"
              value={currentConfig.model || ''}
              onChange={(e) => updateField({ model: e.target.value })}
              disabled={!isEditing}
              placeholder="claude-opus-4-5"
              className={`w-full px-3 py-2 border rounded-lg font-mono text-sm ${!isEditing ? 'bg-gray-50 cursor-default' : ''}`}
            />
            <p className="text-xs text-gray-500 mt-1">Enter the model name (e.g., claude-opus-4-5, gpt-4-turbo)</p>
          </div>

          {/* API Key */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">API Key</label>
            <input
              type="password"
              value={currentConfig.apiKey || ''}
              onChange={(e) => updateField({ apiKey: e.target.value })}
              disabled={!isEditing}
              placeholder="Enter your API key..."
              className={`w-full px-3 py-2 border rounded-lg font-mono ${!isEditing ? 'bg-gray-50 cursor-default' : ''}`}
            />
            <p className="text-xs text-gray-500 mt-1">Your API key is stored locally and never sent anywhere except to the configured endpoint</p>
          </div>

          {/* Temperature */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Temperature: {currentConfig.temperature}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={currentConfig.temperature}
              onChange={(e) => updateField({ temperature: parseFloat(e.target.value) })}
              disabled={!isEditing}
              className={`w-full ${!isEditing ? 'opacity-60' : ''}`}
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Deterministic (0.0)</span>
              <span>Creative (1.0)</span>
            </div>
          </div>

          {/* Max Tokens */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Max Tokens</label>
            <input
              type="number"
              value={currentConfig.maxTokens}
              onChange={(e) => updateField({ maxTokens: parseInt(e.target.value) || 4096 })}
              disabled={!isEditing}
              className={`w-full px-3 py-2 border rounded-lg ${!isEditing ? 'bg-gray-50 cursor-default' : ''}`}
            />
          </div>

          {/* Test Connection Button */}
          <div className="pt-4 border-t">
            <button
              onClick={testConnection}
              disabled={testStatus === 'testing' || !currentConfig.apiKey || !currentConfig.endpoint}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testStatus === 'testing' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Play size={16} />
              )}
              Test Connection
            </button>
            
            {testMessage && (
              <div className={`mt-3 p-3 rounded-lg text-sm ${
                testStatus === 'success' ? 'bg-green-50 text-green-700' :
                testStatus === 'error' ? 'bg-red-50 text-red-700' :
                'bg-gray-50 text-gray-700'
              }`}>
                {testMessage}
              </div>
            )}
          </div>
        </div>

        {/* Current Configuration Summary */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-2">Current Configuration</h4>
          <div className="text-sm text-gray-600 space-y-1 font-mono">
            <p>Provider: {config.provider}</p>
            <p>Model: {config.model}</p>
            <p>Endpoint: {config.endpoint}</p>
            <p>Temperature: {config.temperature}</p>
            <p>Max Tokens: {config.maxTokens}</p>
            <p>API Key: {config.apiKey ? '••••••••' + config.apiKey.slice(-8) : 'Not set'}</p>
          </div>
        </div>

        {/* Total Cost & Usage Overview */}
        <div className="bg-white p-6 rounded-xl border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-900 flex items-center gap-2">
              <Zap size={18} className="text-purple-500" /> API Usage & Cost Overview
            </h3>
            <button
              onClick={() => refetchUsage()}
              disabled={usageLoading}
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <RefreshCw size={14} className={usageLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg text-center border border-green-200">
              <p className="text-2xl font-bold text-green-700">{formatUsd(totalUsage.totalCostUsd)}</p>
              <p className="text-xs text-green-600 font-medium">Total Cost (USD)</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-purple-700">{totalUsage.totalTokens.toLocaleString()}</p>
              <p className="text-xs text-purple-600">Total Tokens</p>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-blue-700">{totalUsage.requestCount.toLocaleString()}</p>
              <p className="text-xs text-blue-600">Total Requests</p>
            </div>
            <div className="p-4 bg-cyan-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-cyan-700">{totalUsage.inputTokens.toLocaleString()}</p>
              <p className="text-xs text-cyan-600">Input Tokens</p>
            </div>
            <div className="p-4 bg-orange-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-orange-700">{totalUsage.outputTokens.toLocaleString()}</p>
              <p className="text-xs text-orange-600">Output Tokens</p>
            </div>
          </div>
        </div>

        {/* Usage By Model */}
        {usageByModel.length > 0 && (
          <div className="bg-white p-6 rounded-xl border">
            <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
              <Database size={18} className="text-blue-500" /> Usage By Model
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Model</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Provider</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-700">Requests</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-700">Input Tokens</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-700">Output Tokens</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-700">Total Tokens</th>
                    <th className="text-right py-2 px-3 font-medium text-green-700">Cost (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {usageByModel.map((usage, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3 font-mono text-xs">{usage.model}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          usage.provider === 'azure-anthropic' ? 'bg-blue-100 text-blue-700' :
                          usage.provider === 'openai' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {usage.provider}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">{usage.requestCount.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right">{usage.inputTokens.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right">{usage.outputTokens.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right font-medium">{usage.totalTokens.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right font-medium text-green-700">{formatUsd(usage.estimatedCostUsd)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-medium">
                    <td className="py-2 px-3" colSpan={2}>Total</td>
                    <td className="py-2 px-3 text-right">{totalUsage.requestCount.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right">{totalUsage.inputTokens.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right">{totalUsage.outputTokens.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right">{totalUsage.totalTokens.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right text-green-700">{formatUsd(totalUsage.totalCostUsd)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              💡 Cost estimates are based on standard API pricing. Actual costs may vary based on your provider agreement.
            </p>
          </div>
        )}

        {usageByModel.length === 0 && !usageLoading && (
          <div className="bg-white p-6 rounded-xl border text-center">
            <Database size={32} className="mx-auto mb-2 text-gray-300" />
            <p className="text-gray-500">No usage data yet</p>
            <p className="text-sm text-gray-400 mt-1">Usage will be tracked when you generate intent configurations</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Test Console View
function TestConsoleView({ 
  intents, 
  businessContext,
  countryConfigs
}: { 
  intents: Intent[]; 
  businessContext: BusinessContext;
  countryConfigs: CountryConfig[];
}) {
  const [query, setQuery] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runTest = async () => {
    if (!query.trim()) return;
    
    setIsRunning(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Find matching intent (simple simulation)
    const matchedIntent = intents.find(i => 
      i.trainingPhrases.some(p => 
        p.toLowerCase().includes(query.toLowerCase().split(' ')[0])
      )
    );
    
    setResult({
      query,
      matchedIntent: matchedIntent ? {
        name: matchedIntent.name,
        confidence: 0.85 + Math.random() * 0.1
      } : null,
      executionTime: `${(Math.random() * 1.5 + 0.5).toFixed(2)}s`
    });
    
    setIsRunning(false);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Test Console</h1>
      <p className="text-gray-500 mb-6">Test queries and view AI decisions</p>

      <div className="max-w-3xl space-y-6">
        {/* Query Input */}
        <div className="bg-white p-6 rounded-xl border">
          <label className="block text-sm font-medium text-gray-700 mb-2">Query</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runTest()}
              placeholder="Enter a test query..."
              className="flex-1 px-3 py-2 border rounded-lg"
            />
            <button
              onClick={runTest}
              disabled={isRunning || !query.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50"
            >
              {isRunning ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Run Test
            </button>
          </div>

          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-sm font-medium text-gray-700 mb-2">Context</div>
            <div className="flex gap-4 text-sm text-gray-600">
              <span>{countryConfigs.find(c => c.code === businessContext.country)?.flag} {businessContext.country}</span>
              <span>📊 {businessContext.entitySize}</span>
              <span>🏭 {businessContext.industry}</span>
              <span>💰 {businessContext.currency}</span>
            </div>
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className={`px-4 py-3 border-b flex items-center gap-2 ${
              result.matchedIntent ? 'bg-green-50' : 'bg-amber-50'
            }`}>
              {result.matchedIntent ? (
                <>
                  <Check size={16} className="text-green-600" />
                  <span className="font-medium text-green-700">Intent Matched</span>
                </>
              ) : (
                <>
                  <AlertCircle size={16} className="text-amber-600" />
                  <span className="font-medium text-amber-700">No Intent Match</span>
                </>
              )}
              <span className="text-sm ml-auto">⏱️ {result.executionTime}</span>
            </div>
            <div className="p-4">
              <div className="mb-4">
                <div className="text-xs text-gray-500 mb-1">Query</div>
                <div className="font-medium">{result.query}</div>
              </div>
              {result.matchedIntent && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">Matched Intent</div>
                  <div className="font-medium">
                    {result.matchedIntent.name}
                    <span className="ml-2 text-sm text-gray-500">
                      ({Math.round(result.matchedIntent.confidence * 100)}% confidence)
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CFOQueryResolutionEngine() {
  // Database hooks for dynamic data
  const { modules, loading: modulesLoading } = useModules();
  const { countryConfigs, loading: countryLoading } = useCountryConfigs();
  const { entityTypes, loading: entityTypesLoading } = useEntityTypes();
  const { enrichmentTypes, loading: enrichmentTypesLoading } = useEnrichmentTypes();
  const { llmProviders, loading: llmProvidersLoading } = useLLMProviders();
  const { responseTypes, loading: responseTypesLoading } = useResponseTypes();
  const { intents, loading: intentsLoading, createIntent, updateIntent, deleteIntent, fetchIntents } = useIntents();
  const { businessContext, loading: businessContextLoading, updateContext } = useBusinessContext();
  const { llmConfig, loading: llmConfigLoading, updateConfig } = useLLMConfig();
  const { tools: helloBooksMcpTools, loading: isFetchingMcpTools, error: mcpToolsError, fetchTools: fetchHelloBooksMcpTools } = useMCPTools();

  // Local UI state
  const [selectedIntentId, setSelectedIntentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('intents');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterModule, setFilterModule] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'configured' | 'pending'>('all');
  const [isImporting, setIsImporting] = useState(false);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch MCP tools on initial mount
  useEffect(() => {
    fetchHelloBooksMcpTools();
  }, []);

  // MCP tools from HelloBooks
  const allMcpTools = helloBooksMcpTools;

  // Loading state
  const isLoading = modulesLoading || intentsLoading || businessContextLoading || llmConfigLoading;

  // Computed values
  const selectedIntent = intents.find(i => i.id === selectedIntentId);
  
  const filteredIntents = useMemo(() => intents.filter(intent => {
    const matchesSearch = !searchTerm || 
      intent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      intent.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      intent.trainingPhrases.some(p => p.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesModule = !filterModule || intent.moduleId === filterModule;
    
    const isConfigured = intent.generatedBy === 'ai' || intent.generatedBy === 'manual';
    const matchesStatus = filterStatus === 'all' ||
      (filterStatus === 'configured' && isConfigured) ||
      (filterStatus === 'pending' && !isConfigured);
    
    return matchesSearch && matchesModule && matchesStatus;
  }), [intents, searchTerm, filterModule, filterStatus]);

  // AI Generation Functions - Using LLM Config from database
  const generateIntentConfig = async (intent: Intent): Promise<Intent> => {
    const moduleInfo = modules.find(m => m.id === intent.moduleId);
    const subModuleInfo = moduleInfo?.subModules.find(s => s.id === intent.subModuleId);
    
    // Validate LLM config before calling API
    if (!llmConfig?.apiKey) {
      toast({
        title: 'LLM Configuration Required',
        description: 'Please configure your API key in LLM Settings before generating intents.',
        variant: 'destructive'
      });
      throw new Error('LLM configuration not set');
    }
    
    if (llmConfig.provider === 'azure-anthropic' && !llmConfig.endpoint) {
      toast({
        title: 'LLM Configuration Required',
        description: 'Please configure your API endpoint in LLM Settings for Azure Anthropic.',
        variant: 'destructive'
      });
      throw new Error('LLM endpoint not set');
    }
    
    try {
      console.log('🤖 Generating intent config via AI...');
      console.log('Using LLM config:', llmConfig?.provider, llmConfig?.model);
      
      const { data, error, response: invokeResponse } = await supabase.functions.invoke('generate-intent', {
        body: {
          intentName: intent.name,
          moduleName: moduleInfo?.name || intent.moduleId,
          subModuleName: subModuleInfo?.name || intent.subModuleId,
          description: intent.description,
          section: 'all',
          phraseCount: 10,
          llmConfig: {
            provider: llmConfig.provider,
            endpoint: llmConfig.endpoint,
            model: llmConfig.model,
            apiKey: llmConfig.apiKey,
            temperature: llmConfig.temperature,
            maxTokens: llmConfig.maxTokens
          }
        }
      });

      if (error) {
        console.error('Edge function error:', error);

        let errorMsg = error.message || 'Failed to generate intent';
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

      if (data?.error) {
        console.error('AI generation error:', data.error);
        toast({
          title: 'AI Generation Error',
          description: data.error,
          variant: 'destructive'
        });
        throw new Error(data.error);
      }

      console.log('✅ AI generation complete!', data);

      // Ensure pipeline nodes have required parameters field
      const dataPipeline = (data.dataPipeline || []).map((node: any) => ({
        ...node,
        parameters: node.parameters || []
      }));

      return {
        ...intent,
        trainingPhrases: data.trainingPhrases || [],
        entities: data.entities || [],
        resolutionFlow: {
          dataPipeline,
          enrichments: data.enrichments || [],
          responseConfig: data.responseConfig || {
            type: 'metric_with_trend',
            template: '📊 Result: {data}',
            followUpQuestions: []
          }
        },
        generatedBy: 'ai',
        aiConfidence: data.aiConfidence || 0.9,
        lastGeneratedAt: data.generatedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Generation failed';
      console.error('❌ AI Generation Error:', error);
      toast({
        title: 'Generation Failed',
        description: message,
        variant: 'destructive'
      });
      throw error;
    }
  };


  const regenerateSection = async (intentId: string, section?: string, options?: { phraseCount?: number }): Promise<Partial<Intent>> => {
    const intent = intents.find(i => i.id === intentId);
    if (!intent) throw new Error('Intent not found');
    
    // Validate LLM config before calling API
    if (!llmConfig?.apiKey) {
      toast({
        title: 'LLM Configuration Required',
        description: 'Please configure your API key in LLM Settings before regenerating.',
        variant: 'destructive'
      });
      throw new Error('LLM configuration not set');
    }
    
    if (llmConfig.provider === 'azure-anthropic' && !llmConfig.endpoint) {
      toast({
        title: 'LLM Configuration Required',
        description: 'Please configure your API endpoint in LLM Settings for Azure Anthropic.',
        variant: 'destructive'
      });
      throw new Error('LLM endpoint not set');
    }
    
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
          llmConfig: {
            provider: llmConfig.provider,
            endpoint: llmConfig.endpoint,
            model: llmConfig.model,
            apiKey: llmConfig.apiKey,
            temperature: llmConfig.temperature,
            maxTokens: llmConfig.maxTokens
          }
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

      if (section === 'training' && data.trainingPhrases) {
        result.trainingPhrases = data.trainingPhrases;
      }
      
      if (section === 'entities' && data.entities) {
        result.entities = data.entities;
      }
      
      if (section === 'pipeline' && data.dataPipeline) {
        const dataPipeline = data.dataPipeline.map((node: any) => ({
          ...node,
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
        setSelectedIntentId(created.id);
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

  const handleGenerateFlow = async (intentId: string) => {
    setIsGenerating(intentId);
    try {
      const intent = intents.find(i => i.id === intentId);
      if (intent) {
        const generated = await generateIntentConfig(intent);
        await updateIntent(intentId, generated);
      }
    } finally {
      setIsGenerating(null);
    }
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
      setGenerationProgress({ current: 0, total: pendingIntents.length });
      
      for (let i = 0; i < pendingIntents.length; i++) {
        setGenerationProgress({ current: i + 1, total: pendingIntents.length });
        const generated = await generateIntentConfig(pendingIntents[i]);
        await updateIntent(pendingIntents[i].id, generated);
      }
      
      setGenerationProgress({ current: 0, total: 0 });
      toast({ title: `Successfully imported ${importedData.length} intents!` });
    } catch (error) {
      console.error('Import error:', error);
      toast({ title: 'Error importing intents', variant: 'destructive' });
      setIsImporting(false);
      setGenerationProgress({ current: 0, total: 0 });
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

  // Sidebar tabs
  const sidebarTabs = [
    { id: 'intents', label: 'Intent Library', icon: <MessageSquare size={18} />, count: intents.length },
    { id: 'mcp', label: 'MCP Tools', icon: <Box size={18} />, count: allMcpTools.length },
    { id: 'enrichments', label: 'Enrichments', icon: <Sparkles size={18} />, count: enrichmentTypes.length },
    { id: 'business', label: 'Business Context', icon: <Building2 size={18} /> },
    { id: 'countries', label: 'Country Config', icon: <Globe size={18} /> },
    { id: 'llm', label: 'LLM Settings', icon: <Brain size={18} /> },
    { id: 'test', label: 'Test Console', icon: <FlaskConical size={18} /> },
  ];

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

  // If an intent is selected, show the detail view
  if (selectedIntentId && selectedIntent && businessContext) {
    return (
      <IntentDetailScreen
        intent={selectedIntent}
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
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Brain size={22} /> CFO AI Engine
          </h1>
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
          {sidebarTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full px-4 py-2.5 flex items-center justify-between text-sm transition-colors ${
                activeTab === tab.id ? 'bg-blue-600' : 'hover:bg-slate-700'
              }`}
            >
              <span className="flex items-center gap-2">{tab.icon} {tab.label}</span>
              {tab.count !== undefined && (
                <span className="px-1.5 py-0.5 bg-slate-600 rounded text-xs">{tab.count}</span>
              )}
            </button>
          ))}
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
            onRefresh={fetchHelloBooksMcpTools}
          />
        )}
        {activeTab === 'enrichments' && <EnrichmentsView enrichmentTypes={enrichmentTypes} />}
        {activeTab === 'business' && businessContext && <BusinessContextView context={businessContext} countryConfigs={countryConfigs} onChange={updateContext} />}
        {activeTab === 'countries' && <CountryConfigView countryConfigs={countryConfigs} />}
        {activeTab === 'llm' && llmConfig && <LLMConfigView config={llmConfig} onChange={updateConfig} />}
        {activeTab === 'test' && businessContext && <TestConsoleView intents={intents} businessContext={businessContext} countryConfigs={countryConfigs} />}
      </div>

      {/* Create Intent Modal */}
      <CreateIntentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateIntent}
        modules={modules}
      />
    </div>
  );
}
