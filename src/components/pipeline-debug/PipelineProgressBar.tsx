import React from 'react';
import { cn } from '@/lib/utils';
import type { PipelineStepDef, PipelineStepState, PipelineStepStatus } from './types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface PipelineProgressBarProps {
  steps: PipelineStepDef[];
  stepStates: Record<string, PipelineStepState>;
}

const STATUS_COLORS: Record<PipelineStepStatus, string> = {
  pending:  'bg-gray-300 border-gray-300',
  running:  'bg-blue-500 border-blue-400 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.3)]',
  pass:     'bg-emerald-500 border-emerald-400',
  warn:     'bg-amber-500 border-amber-400',
  fail:     'bg-red-500 border-red-400',
  skipped:  'bg-gray-200 border-gray-200',
};

const LINE_COLORS: Record<PipelineStepStatus, string> = {
  pending:  'bg-gray-200',
  running:  'bg-blue-300',
  pass:     'bg-emerald-300',
  warn:     'bg-amber-300',
  fail:     'bg-red-300',
  skipped:  'bg-gray-200',
};

export function PipelineProgressBar({ steps, stepStates }: PipelineProgressBarProps) {
  return (
    <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b px-6 py-4">
      <div className="flex items-center gap-0 overflow-x-auto">
        {steps.map((step, i) => {
          const state = stepStates[step.id];
          const status = state?.status || 'pending';
          return (
            <React.Fragment key={step.id}>
              {i > 0 && (
                <div className={cn('h-0.5 flex-1 min-w-[12px] max-w-[24px]', LINE_COLORS[status])} />
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className={cn(
                      'w-5 h-5 rounded-full border-2 transition-all duration-300',
                      STATUS_COLORS[status],
                    )} />
                    <span className={cn(
                      'text-[9px] font-mono leading-none',
                      status === 'skipped' ? 'text-gray-400' : 'text-muted-foreground',
                    )}>
                      {step.shortLabel}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <div className="font-medium">{step.label}</div>
                  {state?.durationMs !== undefined && <div className="text-muted-foreground">{state.durationMs}ms</div>}
                </TooltipContent>
              </Tooltip>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
