import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { StepJsonViewer } from './StepJsonViewer';
import type { PipelineStepDef, PipelineStepState, PipelineStepStatus } from './types';

interface StepInspectorCardProps {
  stepDef: PipelineStepDef;
  stepState: PipelineStepState;
  autoExpand?: boolean;
}

const STATUS_STYLES: Record<PipelineStepStatus, string> = {
  pending:  'bg-gray-200 text-gray-600',
  running:  'bg-blue-100 text-blue-700 animate-pulse',
  pass:     'bg-emerald-100 text-emerald-700',
  warn:     'bg-amber-100 text-amber-700',
  fail:     'bg-red-100 text-red-700',
  skipped:  'bg-gray-100 text-gray-400',
};

const STATUS_LABELS: Record<PipelineStepStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  pass: 'Pass',
  warn: 'Warning',
  fail: 'Fail',
  skipped: 'Skipped',
};

export function StepInspectorCard({ stepDef, stepState, autoExpand }: StepInspectorCardProps) {
  const [open, setOpen] = useState(autoExpand || false);
  const hasContent = stepState.input || stepState.output || stepState.decision || (stepState.logs && stepState.logs.length > 0);

  return (
    <div className={cn(
      'border rounded-lg bg-white transition-colors',
      stepState.status === 'skipped' && 'opacity-50',
      stepState.status === 'running' && 'border-blue-300 ring-1 ring-blue-100',
      stepState.status === 'fail' && 'border-red-300 ring-1 ring-red-100',
    )}>
      <button
        onClick={() => hasContent && setOpen(!open)}
        className={cn(
          'flex items-center justify-between w-full px-4 py-2.5 text-left',
          hasContent && 'cursor-pointer hover:bg-muted/30',
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          {hasContent && (
            open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="text-xs font-mono text-muted-foreground shrink-0">#{stepDef.number}</span>
          <span className="text-sm font-medium text-foreground truncate">{stepDef.label}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {stepState.durationMs !== undefined && (
            <span className="text-xs font-mono text-muted-foreground">{stepState.durationMs}ms</span>
          )}
          <Badge className={cn('text-[10px] px-2 py-0 border-0', STATUS_STYLES[stepState.status])}>
            {STATUS_LABELS[stepState.status]}
          </Badge>
        </div>
      </button>

      {open && hasContent && (
        <div className="px-4 pb-3 space-y-2 border-t">
          {stepState.summary && (
            <p className="text-xs text-muted-foreground pt-2">{stepState.summary}</p>
          )}
          {stepState.decision && (
            <div className="text-xs font-mono text-amber-700 bg-amber-50 rounded px-2 py-1 border border-amber-200">
              Decision: {stepState.decision}
            </div>
          )}
          <StepJsonViewer label="Input" data={stepState.input} />
          <StepJsonViewer label="Output" data={stepState.output} defaultOpen />
          {stepState.logs && stepState.logs.length > 0 && (
            <div className="space-y-0.5 pt-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Logs</span>
              {stepState.logs.map((log, i) => (
                <div key={i} className="text-xs font-mono text-muted-foreground">{log}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
