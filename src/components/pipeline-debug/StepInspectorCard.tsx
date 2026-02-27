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
  pending:  'bg-zinc-700 text-zinc-300',
  running:  'bg-blue-600 text-white animate-pulse',
  pass:     'bg-emerald-600 text-white',
  warn:     'bg-amber-500 text-black',
  fail:     'bg-red-600 text-white',
  skipped:  'bg-zinc-800 text-zinc-500',
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
      'border rounded-lg transition-colors',
      stepState.status === 'skipped' ? 'border-zinc-800 opacity-50' : 'border-zinc-700',
      stepState.status === 'running' && 'border-blue-600/50',
      stepState.status === 'fail' && 'border-red-600/50',
    )}>
      <button
        onClick={() => hasContent && setOpen(!open)}
        className={cn(
          'flex items-center justify-between w-full px-4 py-2.5 text-left',
          hasContent && 'cursor-pointer hover:bg-zinc-800/30',
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          {hasContent && (
            open ? <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" /> : <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0" />
          )}
          <span className="text-xs font-mono text-zinc-500 shrink-0">#{stepDef.number}</span>
          <span className="text-sm font-medium text-zinc-200 truncate">{stepDef.label}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {stepState.durationMs !== undefined && (
            <span className="text-xs font-mono text-zinc-500">{stepState.durationMs}ms</span>
          )}
          <Badge className={cn('text-[10px] px-2 py-0', STATUS_STYLES[stepState.status])}>
            {STATUS_LABELS[stepState.status]}
          </Badge>
        </div>
      </button>

      {open && hasContent && (
        <div className="px-4 pb-3 space-y-2 border-t border-zinc-800">
          {stepState.summary && (
            <p className="text-xs text-zinc-400 pt-2">{stepState.summary}</p>
          )}
          {stepState.decision && (
            <div className="text-xs font-mono text-amber-400/80 bg-amber-900/10 rounded px-2 py-1">
              Decision: {stepState.decision}
            </div>
          )}
          <StepJsonViewer label="Input" data={stepState.input} />
          <StepJsonViewer label="Output" data={stepState.output} defaultOpen />
          {stepState.logs && stepState.logs.length > 0 && (
            <div className="space-y-0.5 pt-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Logs</span>
              {stepState.logs.map((log, i) => (
                <div key={i} className="text-xs font-mono text-zinc-500">{log}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
