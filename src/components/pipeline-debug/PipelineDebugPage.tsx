import React, { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { LiveTestPanel } from './LiveTestPanel';
import { PipelineProgressBar } from './PipelineProgressBar';
import { StepInspectorCard } from './StepInspectorCard';
import { HistoricalHealthMonitor } from './HistoricalHealthMonitor';
import { RegressionSuitePanel } from './RegressionSuitePanel';
import { MissingToolsAudit } from './MissingToolsAudit';
import { mapSSEEventToStepUpdates } from './sseMapper';
import { PIPELINE_STEPS, createInitialRunState, type PipelineRunState } from './types';
import { Play, BarChart3, TestTube, SearchX } from 'lucide-react';

type TabId = 'live' | 'regression' | 'health' | 'missing-tools';

export function PipelineDebugPage() {
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('live');
  const [run, setRun] = useState<PipelineRunState | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const runRef = useRef<PipelineRunState | null>(null);

  const handleExecute = useCallback(async (query: string, entityId: string, orgId: string) => {
    if (isRunning) return;

    const newRun = createInitialRunState(query, entityId, orgId);
    runRef.current = newRun;
    setRun(newRun);
    setIsRunning(true);

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const accessToken = session?.access_token || apiKey;

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/cfo-agent-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': apiKey,
        },
        body: JSON.stringify({
          query,
          conversationId: newRun.id,
          entityId,
          orgId,
          stream: true,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';

        for (const frame of frames) {
          const dataLine = frame.split('\n').find(l => l.startsWith('data: '));
          if (!dataLine) continue;

          try {
            const evt = JSON.parse(dataLine.slice(6));
            const eventType = evt.type as string;
            const eventData = (evt.data || {}) as Record<string, unknown>;

            const currentRun = runRef.current!;
            currentRun.rawEvents.push({
              type: eventType,
              data: eventData,
              timestamp: evt.timestamp,
              receivedAt: Date.now(),
            });

            const updates = mapSSEEventToStepUpdates(eventType, eventData, currentRun);
            for (const upd of updates) {
              const existing = currentRun.steps[upd.stepId];
              if (existing) {
                currentRun.steps[upd.stepId] = { ...existing, ...upd };
              }
            }

            if (eventType === 'complete') {
              currentRun.completedAt = Date.now();
              currentRun.totalDurationMs = Date.now() - currentRun.startedAt;
              currentRun.finalResponse = eventData.response as string;
              currentRun.usage = eventData.usage as any;
              currentRun.model = eventData.llmModel as string;
              currentRun.routePath = eventData.path as string;
              currentRun.category = eventData.category as string;
            }

            if (eventType === 'error') {
              currentRun.error = eventData.message as string;
            }

            runRef.current = { ...currentRun, steps: { ...currentRun.steps } };
            setRun(runRef.current);

            if (eventType === 'response_chunk') {
              currentRun.finalResponse = (currentRun.finalResponse || '') + (eventData.text as string || '');
            }
          } catch (e) {
            console.error('Parse SSE error:', e);
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      toast({ title: 'Pipeline Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, session]);

  const handleClear = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setRun(null);
    runRef.current = null;
    setIsRunning(false);
  }, []);

  const handleCopyReport = useCallback(() => {
    if (!runRef.current) return;
    const report = {
      ...runRef.current,
      rawEvents: runRef.current.rawEvents.length + ' events (truncated)',
    };
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    toast({ title: 'Debug report copied to clipboard' });
  }, []);

  const stepStates = run?.steps || {};

  const lastCompletedStep = run
    ? PIPELINE_STEPS.filter(s => {
        const st = stepStates[s.id];
        return st && (st.status === 'pass' || st.status === 'warn' || st.status === 'fail');
      }).pop()
    : null;

  const tabs = [
    { id: 'live' as TabId, label: 'Live Tester', icon: <Play size={14} /> },
    { id: 'regression' as TabId, label: 'Regression Suite', icon: <TestTube size={14} /> },
    { id: 'health' as TabId, label: 'Health Monitor', icon: <BarChart3 size={14} /> },
    { id: 'missing-tools' as TabId, label: 'Missing Tools', icon: <SearchX size={14} /> },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          <h1 className="text-lg font-bold text-foreground">Pipeline Debugger</h1>
          <span className="text-[10px] text-muted-foreground font-mono">v2 — Regression</span>
        </div>
        {activeTab === 'live' && run?.totalDurationMs && (
          <span className="text-xs font-mono text-muted-foreground">
            Total: {run.totalDurationMs}ms | Route: {run.routePath || '—'} | Model: {run.model || '—'}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b px-6 flex gap-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'live' && (
          <div className="p-6 space-y-4 max-w-6xl mx-auto w-full">
            {/* Progress Bar */}
            {run && <PipelineProgressBar steps={PIPELINE_STEPS} stepStates={stepStates} />}

            <LiveTestPanel
              onExecute={handleExecute}
              onClear={handleClear}
              onCopyReport={handleCopyReport}
              isRunning={isRunning}
              hasRun={!!run}
            />

            {/* Step Inspector */}
            {run && (
              <div className="space-y-2">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Step Inspector</h2>
                {PIPELINE_STEPS.map(step => (
                  <StepInspectorCard
                    key={step.id}
                    stepDef={step}
                    stepState={stepStates[step.id] || { stepId: step.id, status: 'pending' }}
                    autoExpand={lastCompletedStep?.id === step.id}
                  />
                ))}
              </div>
            )}

            {/* Final Response Preview */}
            {run?.finalResponse && (
              <div className="border rounded-lg bg-card p-4">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Final Response</h2>
                <div className="text-sm text-foreground whitespace-pre-wrap font-mono max-h-48 overflow-auto">
                  {run.finalResponse}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'regression' && <RegressionSuitePanel />}

        {activeTab === 'health' && (
          <div className="p-6 max-w-6xl mx-auto w-full">
            <HistoricalHealthMonitor />
          </div>
        )}

        {activeTab === 'missing-tools' && <MissingToolsAudit />}
      </div>
    </div>
  );
}
