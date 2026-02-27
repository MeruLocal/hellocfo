import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Play, Loader2, Download, RefreshCw, ChevronDown, ChevronRight,
  CheckCircle2, AlertTriangle, XCircle, Clock, Database, Sparkles,
} from 'lucide-react';

interface StepResult {
  step: string;
  status: 'pass' | 'warn' | 'fail' | 'skipped';
  expected: unknown;
  actual: unknown;
  message: string;
}

interface CaseResult {
  test_case_id: string;
  intent_name: string;
  test_phrase: string;
  test_level: number;
  overall: 'pass' | 'warn' | 'fail';
  steps: StepResult[];
  duration_ms: number;
}

interface RunSummary {
  run_id: string;
  level: number;
  total_cases: number;
  passed: number;
  warned: number;
  failed: number;
  pass_rate: number;
  duration_ms: number;
  step_summary: Record<string, { tested: number; pass: number; warn: number; fail: number }>;
  results: CaseResult[];
}

interface TestRun {
  id: string;
  run_level: number;
  total_cases: number;
  passed: number;
  warned: number;
  failed: number;
  pass_rate: number;
  duration_ms: number;
  triggered_by: string;
  step_summary: Record<string, { tested: number; pass: number; warn: number; fail: number }>;
  results: CaseResult[];
  created_at: string;
}

interface TestCaseStats {
  total: number;
  level1: number;
  level2: number;
  level3: number;
}

const statusIcon = (status: string) => {
  if (status === 'pass') return <CheckCircle2 size={14} className="text-emerald-500" />;
  if (status === 'warn') return <AlertTriangle size={14} className="text-amber-500" />;
  if (status === 'fail') return <XCircle size={14} className="text-destructive" />;
  return <Clock size={14} className="text-muted-foreground" />;
};

const statusColor = (rate: number) => {
  if (rate >= 95) return 'text-emerald-500';
  if (rate >= 80) return 'text-amber-500';
  return 'text-destructive';
};

const statusEmoji = (rate: number) => {
  if (rate >= 95) return '🟢';
  if (rate >= 80) return '🟡';
  return '🔴';
};

export function RegressionSuitePanel() {
  const [stats, setStats] = useState<TestCaseStats>({ total: 0, level1: 0, level2: 0, level3: 0 });
  const [recentRuns, setRecentRuns] = useState<TestRun[]>([]);
  const [currentRun, setCurrentRun] = useState<RunSummary | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runningLevel, setRunningLevel] = useState<number | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [expandedFailures, setExpandedFailures] = useState<Set<string>>(new Set());
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // Load stats and recent runs
  const loadData = useCallback(async () => {
    // Count test cases by level
    const { data: cases, error: _cErr } = await supabase
      .from('intent_test_cases')
      .select('test_level')
      .eq('is_active', true);

    if (cases) {
      setStats({
        total: cases.length,
        level1: cases.filter(c => c.test_level === 1).length,
        level2: cases.filter(c => c.test_level === 2).length,
        level3: cases.filter(c => c.test_level === 3).length,
      });
    }

    // Load recent runs
    const { data: runs, error: _rErr } = await supabase
      .from('intent_test_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (runs) {
      setRecentRuns(runs as unknown as TestRun[]);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Seed Level 1 test cases
  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      const { data, error } = await supabase.functions.invoke('seed-test-cases', {
        body: { action: 'seed_level1', maxPerIntent: 3 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: data.message || 'Seeding complete', description: `${data.new_cases} new test cases created` });
      loadData();
    } catch (err) {
      toast({ title: 'Seed failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsSeeding(false);
    }
  };

  // Run regression tests
  const handleRun = async (level: number) => {
    setIsRunning(true);
    setRunningLevel(level);
    setCurrentRun(null);
    try {
      const { data, error } = await supabase.functions.invoke('run-regression-tests', {
        body: { level },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setCurrentRun(data as RunSummary);
      toast({
        title: `Level ${level} complete`,
        description: `${data.passed}/${data.total_cases} passed (${data.pass_rate}%)`,
      });
      loadData();
    } catch (err) {
      toast({ title: 'Run failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsRunning(false);
      setRunningLevel(null);
    }
  };

  // Load a historical run
  const loadHistoricalRun = (run: TestRun) => {
    setSelectedRunId(run.id);
    setCurrentRun({
      run_id: run.id,
      level: run.run_level,
      total_cases: run.total_cases,
      passed: run.passed,
      warned: run.warned,
      failed: run.failed,
      pass_rate: run.pass_rate,
      duration_ms: run.duration_ms,
      step_summary: run.step_summary || {},
      results: (run.results as unknown as CaseResult[]) || [],
    });
  };

  const toggleFailure = (id: string) => {
    setExpandedFailures(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const exportReport = () => {
    if (!currentRun) return;
    const blob = new Blob([JSON.stringify(currentRun, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `regression-level${currentRun.level}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const displayRun = currentRun;
  const failures = displayRun?.results.filter(r => r.overall === 'fail') || [];
  const warnings = displayRun?.results.filter(r => r.overall === 'warn') || [];

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">🔬 Pipeline Regression Suite</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Automated testing across all pipeline steps for every intent
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RefreshCw size={14} className="mr-1" /> Refresh
        </Button>
      </div>

      {/* Test Case Stats + Actions */}
      <div className="grid grid-cols-4 gap-3">
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-2xl font-bold text-foreground">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Total Test Cases</div>
        </div>
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-2xl font-bold text-foreground">{stats.level1}</div>
          <div className="text-xs text-muted-foreground">Level 1 — Embedding</div>
        </div>
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-2xl font-bold text-foreground">{stats.level2}</div>
          <div className="text-xs text-muted-foreground">Level 2 — Tool Selection</div>
        </div>
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-2xl font-bold text-foreground">{stats.level3}</div>
          <div className="text-xs text-muted-foreground">Level 3 — Full Pipeline</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        {stats.level1 === 0 && (
          <Button onClick={handleSeed} disabled={isSeeding} variant="outline" size="sm">
            {isSeeding ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Sparkles size={14} className="mr-1" />}
            {isSeeding ? 'Seeding...' : 'Auto-Seed Level 1 Cases'}
          </Button>
        )}
        <Button onClick={() => handleRun(1)} disabled={isRunning || stats.level1 === 0} size="sm">
          {isRunning && runningLevel === 1 ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Play size={14} className="mr-1" />}
          Run Level 1 ({stats.level1})
        </Button>
        <Button onClick={() => handleRun(2)} disabled={isRunning || stats.level2 === 0} size="sm" variant="secondary">
          {isRunning && runningLevel === 2 ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Play size={14} className="mr-1" />}
          Run Level 2 ({stats.level2})
        </Button>
        <Button onClick={() => handleRun(3)} disabled={isRunning || stats.level3 === 0} size="sm" variant="secondary">
          {isRunning && runningLevel === 3 ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Play size={14} className="mr-1" />}
          Run Level 3 ({stats.level3})
        </Button>
        {displayRun && (
          <Button onClick={exportReport} variant="ghost" size="sm">
            <Download size={14} className="mr-1" /> Export Report
          </Button>
        )}
      </div>

      {/* Loading State */}
      {isRunning && (
        <div className="border rounded-lg p-6 text-center bg-card">
          <Loader2 size={32} className="mx-auto mb-3 animate-spin text-primary" />
          <p className="font-medium text-foreground">Running Level {runningLevel} tests...</p>
          <p className="text-sm text-muted-foreground mt-1">
            {runningLevel === 1 && 'Testing embedding matches for all phrases'}
            {runningLevel === 2 && 'Validating tool selection against intent configs'}
            {runningLevel === 3 && 'Running full pipeline with real API calls'}
          </p>
        </div>
      )}

      {/* Results */}
      {displayRun && !isRunning && (
        <div className="space-y-4">
          {/* Summary Bar */}
          <div className="border rounded-lg p-4 bg-card flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`text-2xl font-bold ${statusColor(displayRun.pass_rate)}`}>
                {displayRun.pass_rate}%
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">Level {displayRun.level} Results</div>
                <div className="text-xs text-muted-foreground">
                  {displayRun.total_cases} cases · {displayRun.duration_ms}ms
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-lg font-bold text-emerald-500">{displayRun.passed}</div>
                <div className="text-[10px] text-muted-foreground">Pass</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-amber-500">{displayRun.warned}</div>
                <div className="text-[10px] text-muted-foreground">Warn</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-destructive">{displayRun.failed}</div>
                <div className="text-[10px] text-muted-foreground">Fail</div>
              </div>
            </div>
          </div>

          {/* Step Summary Table */}
          {Object.keys(displayRun.step_summary).length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-muted/50 border-b">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Results by Step</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20">
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Step</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Tested</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Pass</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Warn</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Fail</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(displayRun.step_summary)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([step, s]) => {
                      const rate = s.tested > 0 ? Math.round((s.pass / s.tested) * 100) : 0;
                      return (
                        <tr key={step} className="border-b last:border-0">
                          <td className="px-4 py-2 font-medium text-foreground">{step}</td>
                          <td className="text-center px-3 py-2 text-muted-foreground">{s.tested}</td>
                          <td className="text-center px-3 py-2 text-emerald-600">{s.pass}</td>
                          <td className="text-center px-3 py-2 text-amber-600">{s.warn}</td>
                          <td className="text-center px-3 py-2 text-destructive">{s.fail}</td>
                          <td className="text-center px-3 py-2 font-medium">
                            <span className={statusColor(rate)}>{rate}% {statusEmoji(rate)}</span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          {/* Failures Detail */}
          {failures.length > 0 && (
            <div className="border rounded-lg overflow-hidden border-destructive/30">
              <div className="px-4 py-2 bg-destructive/5 border-b border-destructive/20">
                <h3 className="text-xs font-semibold text-destructive uppercase tracking-wider">
                  Failures ({failures.length})
                </h3>
              </div>
              <div className="divide-y">
                {failures.map(f => (
                  <div key={f.test_case_id} className="px-4 py-3">
                    <button
                      onClick={() => toggleFailure(f.test_case_id)}
                      className="w-full flex items-center gap-2 text-left"
                    >
                      {expandedFailures.has(f.test_case_id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <XCircle size={14} className="text-destructive shrink-0" />
                      <span className="font-medium text-sm text-foreground">{f.intent_name}</span>
                      <span className="text-xs text-muted-foreground">— Level {f.test_level}</span>
                      <span className="ml-auto text-xs font-mono text-muted-foreground">{f.duration_ms}ms</span>
                    </button>
                    {expandedFailures.has(f.test_case_id) && (
                      <div className="mt-2 ml-7 space-y-2">
                        <div className="text-xs text-muted-foreground">
                          Phrase: <span className="font-mono text-foreground">"{f.test_phrase}"</span>
                        </div>
                        {f.steps.map((s, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            {statusIcon(s.status)}
                            <div>
                              <span className="font-medium">{s.step}:</span>{' '}
                              <span className="text-muted-foreground">{s.message}</span>
                              {s.status === 'fail' && (
                                <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                                  Expected: {JSON.stringify(s.expected)} | Actual: {JSON.stringify(s.actual)}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="border rounded-lg overflow-hidden border-amber-500/30">
              <div className="px-4 py-2 bg-amber-500/5 border-b border-amber-500/20">
                <h3 className="text-xs font-semibold text-amber-600 uppercase tracking-wider">
                  Warnings ({warnings.length})
                </h3>
              </div>
              <div className="divide-y max-h-64 overflow-auto">
                {warnings.slice(0, 20).map(w => (
                  <div key={w.test_case_id} className="px-4 py-2 flex items-center gap-2 text-xs">
                    <AlertTriangle size={12} className="text-amber-500 shrink-0" />
                    <span className="font-medium text-foreground">{w.intent_name}</span>
                    <span className="text-muted-foreground truncate flex-1">
                      {w.steps.find(s => s.status === 'warn')?.message || w.test_phrase}
                    </span>
                  </div>
                ))}
                {warnings.length > 20 && (
                  <div className="px-4 py-2 text-xs text-muted-foreground text-center">
                    +{warnings.length - 20} more warnings
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent Runs History */}
      {recentRuns.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-muted/50 border-b">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Run History</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Date</th>
                <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Level</th>
                <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Cases</th>
                <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Pass</th>
                <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Rate</th>
                <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Duration</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map(run => (
                <tr
                  key={run.id}
                  className={`border-b last:border-0 cursor-pointer hover:bg-muted/30 transition-colors ${selectedRunId === run.id ? 'bg-primary/5' : ''}`}
                  onClick={() => loadHistoricalRun(run)}
                >
                  <td className="px-4 py-2 text-xs text-foreground">
                    {new Date(run.created_at).toLocaleString()}
                  </td>
                  <td className="text-center px-3 py-2">
                    <Badge variant="secondary" className="text-[10px]">L{run.run_level}</Badge>
                  </td>
                  <td className="text-center px-3 py-2 text-muted-foreground">{run.total_cases}</td>
                  <td className="text-center px-3 py-2">
                    <span className="text-emerald-600">{run.passed}</span>
                    {run.failed > 0 && <span className="text-destructive ml-1">/ {run.failed}❌</span>}
                  </td>
                  <td className="text-center px-3 py-2">
                    <span className={`font-medium ${statusColor(run.pass_rate)}`}>
                      {run.pass_rate}%
                    </span>
                  </td>
                  <td className="text-center px-3 py-2 text-xs text-muted-foreground font-mono">
                    {run.duration_ms < 1000 ? `${run.duration_ms}ms` : `${(run.duration_ms / 1000).toFixed(1)}s`}
                  </td>
                  <td className="text-right px-4 py-2">
                    <ChevronRight size={14} className="text-muted-foreground" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!displayRun && !isRunning && stats.total === 0 && (
        <div className="border rounded-lg p-12 text-center bg-card">
          <Database size={40} className="mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold text-foreground">No Test Cases Yet</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Click "Auto-Seed Level 1 Cases" to generate embedding test cases from all your active intents and training phrases.
          </p>
        </div>
      )}
    </div>
  );
}
