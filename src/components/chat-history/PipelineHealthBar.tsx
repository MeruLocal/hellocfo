import React, { useMemo, useState } from 'react';
import { Route, Brain, Package, Wrench, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id?: string;
  role: string;
  content: string;
  timestamp?: string;
  metadata?: {
    route?: string;
    intent?: { name: string; confidence?: number } | null;
    toolsLoaded?: string[];
    toolsUsed?: string[];
    executionTime?: string;
    llmModel?: string;
    [key: string]: unknown;
  };
}

interface StageResult {
  label: string;
  icon: React.ReactNode;
  pass: number;
  total: number;
}

function computeStages(messages: ChatMessage[]): StageResult[] {
  const botMessages = messages.filter((m) => m.role === 'agent' || m.role === 'assistant');

  let routePass = 0, routeTotal = 0;
  let intentPass = 0, intentTotal = 0;
  let toolLoadPass = 0, toolLoadTotal = 0;
  let toolExecPass = 0, toolExecTotal = 0;
  let responsePass = 0, responseTotal = 0;

  for (const msg of botMessages) {
    const meta = msg.metadata;

    // Routing
    routeTotal++;
    if (meta?.route && meta.route !== 'unknown') routePass++;

    // Intent
    intentTotal++;
    if (meta?.intent?.name) intentPass++;

    // Tool Loading
    toolLoadTotal++;
    if (meta?.toolsLoaded && meta.toolsLoaded.length > 0) toolLoadPass++;

    // Tool Execution (only when tools were loaded)
    if (meta?.toolsLoaded && meta.toolsLoaded.length > 0) {
      toolExecTotal++;
      if (meta?.toolsUsed && meta.toolsUsed.length > 0) toolExecPass++;
    }

    // Response
    responseTotal++;
    if (msg.content && msg.content.trim().length > 0) responsePass++;
  }

  return [
    { label: 'Routing', icon: <Route size={14} />, pass: routePass, total: routeTotal },
    { label: 'Intent', icon: <Brain size={14} />, pass: intentPass, total: intentTotal },
    { label: 'Tool Load', icon: <Package size={14} />, pass: toolLoadPass, total: toolLoadTotal },
    { label: 'Tool Exec', icon: <Wrench size={14} />, pass: toolExecPass, total: toolExecTotal },
    { label: 'Response', icon: <MessageSquare size={14} />, pass: responsePass, total: responseTotal },
  ];
}

function getHealthColor(ratio: number): string {
  if (ratio >= 0.8) return 'text-green-600 dark:text-green-400';
  if (ratio >= 0.5) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function getProgressColor(ratio: number): string {
  if (ratio >= 0.8) return '[&>div]:bg-green-500';
  if (ratio >= 0.5) return '[&>div]:bg-amber-500';
  return '[&>div]:bg-red-500';
}

export function PipelineHealthBar({ messages }: { messages: ChatMessage[] }) {
  const stages = useMemo(() => computeStages(messages), [messages]);
  const botCount = messages.filter((m) => m.role === 'agent' || m.role === 'assistant').length;
  const [open, setOpen] = useState(botCount >= 3);

  if (botCount === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-border">
      <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/50 transition-colors">
        <span className="flex items-center gap-1.5">
          🔬 Pipeline Health
          <span className="font-normal">({botCount} bot messages)</span>
        </span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          {stages.map((stage) => {
            const ratio = stage.total > 0 ? stage.pass / stage.total : 0;
            const pct = Math.round(ratio * 100);
            return (
              <div
                key={stage.label}
                className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 px-3 py-2 min-w-[100px] flex-1"
              >
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {stage.icon}
                  <span className="font-medium">{stage.label}</span>
                </div>
                <div className={cn('text-sm font-bold', getHealthColor(ratio))}>
                  {stage.pass}/{stage.total}
                  <span className="text-[10px] font-normal ml-1">({pct}%)</span>
                </div>
                <Progress
                  value={pct}
                  className={cn('h-1.5', getProgressColor(ratio))}
                />
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
