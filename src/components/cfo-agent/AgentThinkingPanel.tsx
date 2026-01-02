import React from 'react';
import { 
  Brain, 
  Variable, 
  GitBranch, 
  Sparkles, 
  Loader2, 
  Check, 
  AlertCircle,
  Zap,
  FileText
} from 'lucide-react';
import { AgentUnderstanding, ToolResult } from './types';
import { cn } from '@/lib/utils';

interface AgentThinkingPanelProps {
  understanding: AgentUnderstanding;
  isProcessing: boolean;
  currentPhase: string;
}

export function AgentThinkingPanel({ 
  understanding, 
  isProcessing, 
  currentPhase 
}: AgentThinkingPanelProps) {
  const phases = [
    { id: 'detecting', label: 'Understanding Query', icon: Brain },
    { id: 'intent', label: 'Intent Detection', icon: Check },
    { id: 'entities', label: 'Entity Extraction', icon: Variable },
    { id: 'pipeline', label: 'Data Pipeline', icon: GitBranch },
    { id: 'enrichments', label: 'Enrichments', icon: Sparkles },
    { id: 'executing', label: 'Fetching Data', icon: Zap },
    { id: 'response', label: 'Generating Response', icon: FileText },
  ];

  const getPhaseStatus = (phaseId: string): 'pending' | 'active' | 'complete' => {
    const phaseOrder = ['detecting', 'intent', 'entities', 'pipeline', 'enrichments', 'executing', 'response'];
    const currentIndex = phaseOrder.indexOf(currentPhase);
    const phaseIndex = phaseOrder.indexOf(phaseId);
    
    if (understanding.isComplete) return 'complete';
    if (phaseIndex < currentIndex) return 'complete';
    if (phaseIndex === currentIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Phase Progress */}
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 mb-3">
          {isProcessing ? (
            <Loader2 size={16} className="animate-spin text-primary" />
          ) : (
            <Brain size={16} className="text-primary" />
          )}
          <span className="font-medium text-sm">Agent Understanding</span>
        </div>
        
        <div className="flex gap-1">
          {phases.map((phase) => {
            const status = getPhaseStatus(phase.id);
            const Icon = phase.icon;
            
            return (
              <div
                key={phase.id}
                className={cn(
                  "flex-1 flex flex-col items-center gap-1 p-2 rounded transition-colors",
                  status === 'complete' && "bg-primary/10",
                  status === 'active' && "bg-primary/20",
                  status === 'pending' && "bg-muted/50 opacity-50"
                )}
                title={phase.label}
              >
                <Icon 
                  size={14} 
                  className={cn(
                    status === 'complete' && "text-primary",
                    status === 'active' && "text-primary animate-pulse",
                    status === 'pending' && "text-muted-foreground"
                  )}
                />
                <span className="text-[10px] text-center truncate w-full">{phase.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Understanding Details */}
      <div className="p-4 space-y-4">
        {/* Intent */}
        {understanding.intent && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Check size={14} className="text-green-500" />
              <span>Matched Intent</span>
              <span className={cn(
                "ml-auto px-2 py-0.5 rounded text-xs",
                understanding.intent.confidence >= 0.7 
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : understanding.intent.confidence >= 0.5
                  ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              )}>
                {Math.round(understanding.intent.confidence * 100)}%
              </span>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="font-medium">{understanding.intent.name}</div>
              {understanding.intent.description && (
                <div className="text-sm text-muted-foreground mt-1">
                  {understanding.intent.description}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Reasoning */}
        {understanding.reasoning && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Brain size={14} className="text-purple-500" />
              <span>AI Reasoning</span>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-sm">
              {understanding.reasoning}
            </div>
          </div>
        )}

        {/* Extracted Entities */}
        {understanding.entities && Object.keys(understanding.entities).length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Variable size={14} className="text-blue-500" />
              <span>What I Understood</span>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(understanding.entities).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="font-mono text-xs text-blue-600 dark:text-blue-400">{key}:</span>
                    <span className="font-mono text-xs">{JSON.stringify(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Pipeline Steps */}
        {understanding.pipelineSteps && understanding.pipelineSteps.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <GitBranch size={14} className="text-orange-500" />
              <span>Data I'll Fetch</span>
            </div>
            <div className="space-y-1">
              {understanding.pipelineSteps.map((step, idx) => (
                <div 
                  key={idx}
                  className="flex items-center gap-2 bg-orange-50 dark:bg-orange-900/20 rounded px-3 py-2 text-sm"
                >
                  <span className="text-orange-600 dark:text-orange-400 font-mono text-xs">
                    {idx + 1}.
                  </span>
                  <span className="font-medium">{step.tool}</span>
                  {step.description && (
                    <span className="text-muted-foreground text-xs">- {step.description}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Enrichments */}
        {understanding.enrichments && understanding.enrichments.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles size={14} className="text-amber-500" />
              <span>Insights I'll Add</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {understanding.enrichments.map((enrichment, idx) => (
                <span 
                  key={idx}
                  className="px-2 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded text-xs"
                  title={enrichment.description}
                >
                  {enrichment.type.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tool Results */}
        {understanding.toolResults && understanding.toolResults.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Zap size={14} className="text-green-500" />
              <span>Data Fetched</span>
            </div>
            <div className="space-y-1">
              {understanding.toolResults.map((result, idx) => (
                <div 
                  key={idx}
                  className={cn(
                    "flex items-center gap-2 rounded px-3 py-2 text-sm",
                    result.success 
                      ? "bg-green-50 dark:bg-green-900/20" 
                      : "bg-red-50 dark:bg-red-900/20"
                  )}
                >
                  {result.success ? (
                    <Check size={12} className="text-green-500" />
                  ) : (
                    <AlertCircle size={12} className="text-red-500" />
                  )}
                  <span className="font-mono text-xs">{result.tool}</span>
                  {result.recordCount && (
                    <span className="text-muted-foreground text-xs">
                      ({result.recordCount} records)
                    </span>
                  )}
                  {result.error && (
                    <span className="text-red-600 text-xs">{result.error}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Response Format */}
        {understanding.responseFormat && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText size={14} className="text-indigo-500" />
              <span>Response Format</span>
            </div>
            <div className="px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 rounded text-sm text-indigo-700 dark:text-indigo-400">
              {understanding.responseFormat}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
