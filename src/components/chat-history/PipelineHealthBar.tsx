import React, { useMemo, useState } from 'react';
import { Route, Brain, Package, Wrench, MessageSquare, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id?: string;
  role: string;
  content: string;
  timestamp?: string;
  metadata?: {
    route?: string;
    routingStrategy?: string;
    intent?: { name: string; confidence?: number } | null;
    toolsLoaded?: string[];
    toolsUsed?: string[];
    toolResults?: { tool: string; success: boolean; error?: string }[];
    enrichmentsApplied?: string[];
    executionTime?: string;
    llmModel?: string;
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
    errorDetail?: string;
    [key: string]: unknown;
  };
}

interface StageResult {
  label: string;
  icon: React.ReactNode;
  pass: number;
  total: number;
  detail?: string;
}

function computeStages(messages: ChatMessage[]): StageResult[] {
  const botMessages = messages.filter(m => m.role === 'agent' || m.role === 'assistant');

  let routePass = 0, routeTotal = 0;
  let intentPass = 0, intentTotal = 0;
  let toolLoadPass = 0, toolLoadTotal = 0;
  let toolExecPass = 0, toolExecTotal = 0;
  let enrichPass = 0, enrichTotal = 0;
  let responsePass = 0, responseTotal = 0;
  let totalToolCount = 0;
  const missedIntents: string[] = [];
  const strategies = new Map<string, number>();

  for (const msg of botMessages) {
    const meta = msg.metadata;

    // Routing
    routeTotal++;
    if (meta?.route && meta.route !== 'unknown') routePass++;
    const strat = meta?.routingStrategy || meta?.route || 'unknown';
    strategies.set(strat, (strategies.get(strat) || 0) + 1);

    // Intent
    intentTotal++;
    if (meta?.intent?.name) {
      intentPass++;
    } else {
      // Track which messages had no intent
      const preview = (msg.content || '').slice(0, 40);
      if (preview && meta?.route !== 'general_chat') missedIntents.push(preview);
    }

    // Tool Loading
    toolLoadTotal++;
    const loaded = meta?.toolsLoaded || meta?.toolsUsed;
    if (loaded && loaded.length > 0) {
      toolLoadPass++;
      totalToolCount += loaded.length;
    }

    // Tool Execution
    if (loaded && loaded.length > 0) {
      toolExecTotal++;
      const results = meta?.toolResults;
      if (results) {
        const allSuccess = results.every(r => r.success);
        if (allSuccess) toolExecPass++;
      } else if (meta?.toolsUsed && meta.toolsUsed.length > 0) {
        toolExecPass++;
      }
    }

    // Enrichments
    enrichTotal++;
    if (meta?.enrichmentsApplied && meta.enrichmentsApplied.length > 0) enrichPass++;

    // Response
    responseTotal++;
    if (msg.content && msg.content.trim().length > 0 && !msg.content.includes('encountered an error')) responsePass++;
  }

  const avgToolCount = toolLoadPass > 0 ? Math.round(totalToolCount / toolLoadPass) : 0;

  return [
    { label: 'Routing', icon: <Route size={14} />, pass: routePass, total: routeTotal, detail: [...strategies.entries()].map(([k, v]) => `${k}: ${v}`).join(', ') },
    { label: 'Intent Match', icon: <Brain size={14} />, pass: intentPass, total: intentTotal, detail: missedIntents.length > 0 ? `Missed: ${missedIntents.slice(0, 3).map(m => `"${m}…"`).join(', ')}` : undefined },
    { label: 'Tool Select', icon: <Package size={14} />, pass: toolLoadPass, total: toolLoadTotal, detail: `Avg ${avgToolCount} tools/msg` },
    { label: 'Tool Exec', icon: <Wrench size={14} />, pass: toolExecPass, total: toolExecTotal },
    { label: 'Enrichment', icon: <Sparkles size={14} />, pass: enrichPass, total: enrichTotal },
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
  const botCount = messages.filter(m => m.role === 'agent' || m.role === 'assistant').length;
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
          {stages.map(stage => {
            const ratio = stage.total > 0 ? stage.pass / stage.total : 0;
            const pct = Math.round(ratio * 100);
            return (
              <div
                key={stage.label}
                className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 px-3 py-2 min-w-[110px] flex-1"
              >
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {stage.icon}
                  <span className="font-medium">{stage.label}</span>
                </div>
                <div className={cn('text-sm font-bold', getHealthColor(ratio))}>
                  {stage.pass}/{stage.total}
                  <span className="text-[10px] font-normal ml-1">({pct}%)</span>
                </div>
                <Progress value={pct} className={cn('h-1.5', getProgressColor(ratio))} />
                {stage.detail && (
                  <p className="text-[9px] text-muted-foreground mt-0.5 truncate" title={stage.detail}>
                    {stage.detail}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
