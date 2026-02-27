// Maps SSE events from cfo-agent-api to pipeline step state updates
import type { PipelineRunState, PipelineStepState, PipelineStepStatus } from './types';

type StepUpdate = Partial<PipelineStepState> & { stepId: string };

function mark(stepId: string, status: PipelineStepStatus, extras?: Partial<PipelineStepState>): StepUpdate {
  return { stepId, status, ...extras };
}

export function mapSSEEventToStepUpdates(
  eventType: string,
  data: Record<string, unknown>,
  run: PipelineRunState,
): StepUpdate[] {
  const now = Date.now();
  const elapsed = (stepId: string) => {
    const s = run.steps[stepId];
    return s?.startedAt ? now - s.startedAt : undefined;
  };

  switch (eventType) {
    case 'connected':
      return [
        mark('step-1', 'pass', {
          completedAt: now,
          startedAt: run.startedAt,
          durationMs: now - run.startedAt,
          output: data,
          summary: `Session: ${(data.sessionId as string || '').slice(0, 8)}…`,
        }),
        mark('step-3', 'running', { startedAt: now }),
      ];

    case 'route_started':
      return [mark('step-3', 'running', { startedAt: now })];

    case 'route_classified': {
      const path = data.path as string;
      const category = data.category as string;
      return [
        mark('step-3', 'pass', {
          completedAt: now,
          durationMs: elapsed('step-3'),
          output: data,
          decision: `${path} → ${category}`,
          summary: `Route: ${path} | Category: ${category}`,
        }),
        mark('step-4', 'running', { startedAt: now }),
      ];
    }

    case 'intent_detected': {
      const intent = data.intent as { name: string; confidence: number } | null;
      const conf = intent?.confidence ?? 0;
      return [
        mark('step-4', conf > 0 ? 'pass' : 'warn', {
          completedAt: now,
          durationMs: elapsed('step-4'),
          output: data,
          summary: intent ? `${intent.name} (${(conf * 100).toFixed(0)}%)` : 'No embedding match',
        }),
        mark('step-6', intent ? 'pass' : 'warn', {
          completedAt: now,
          output: data,
          summary: intent ? `Resolved: ${intent.name}` : 'LLM fallback',
        }),
      ];
    }

    case 'tools_filtered': {
      const toolCount = data.toolCount as number;
      return [
        mark('step-5', 'pass', {
          completedAt: now,
          durationMs: elapsed('step-5') || elapsed('step-3'),
          output: data,
          summary: `MCP: ${data.totalMcpTools || '?'} tools available`,
        }),
        mark('step-7', toolCount > 0 ? 'pass' : 'warn', {
          startedAt: now,
          completedAt: now,
          output: data,
          summary: `${toolCount} tools selected for ${data.category}`,
          decision: data.reason as string,
        }),
      ];
    }

    case 'response_generating':
      return [mark('step-8', 'running', { startedAt: now, summary: 'LLM generating response…' })];

    case 'executing_tool':
      return [
        mark('step-8', 'pass', { completedAt: now, durationMs: elapsed('step-8') }),
        mark('step-9', 'running', {
          startedAt: run.steps['step-9']?.startedAt || now,
          summary: `Executing: ${data.tool || data.name}`,
        }),
      ];

    case 'tool_result': {
      const success = data.success as boolean;
      const existing = run.steps['step-9'];
      const logs = [...(existing?.logs || []), `${data.tool}: ${success ? '✓' : '✗'}`];
      const anyFail = logs.some(l => l.includes('✗'));
      return [
        mark('step-9', anyFail ? 'warn' : 'running', {
          startedAt: existing?.startedAt,
          output: data,
          logs,
          summary: `${logs.length} tool(s) executed`,
        }),
      ];
    }

    case 'enrichments_applying':
      return [
        mark('step-9', run.steps['step-9']?.status === 'running' ? 'pass' : run.steps['step-9']?.status || 'pending', {
          completedAt: now,
          durationMs: elapsed('step-9'),
        }),
        mark('step-10', 'pass', {
          startedAt: now,
          completedAt: now,
          output: data,
          summary: `Enrichments: ${(data.enrichments as unknown[])?.length || 0}`,
        }),
      ];

    case 'mcq_prompt':
      return [mark('step-6.5', 'warn', {
        startedAt: now,
        completedAt: now,
        output: data,
        summary: `MCQ: ${data.question}`,
      })];

    case 'write_validation':
      return [mark('step-6.6', data.approved ? 'pass' : 'warn', {
        startedAt: now,
        completedAt: now,
        output: data,
        summary: data.approved ? 'Write approved' : 'Write needs confirmation',
      })];

    case 'complete':
      return [
        mark('step-8', run.steps['step-8']?.status === 'running' ? 'pass' : run.steps['step-8']?.status || 'pass', {
          completedAt: now,
          durationMs: elapsed('step-8'),
        }),
        mark('step-9', run.steps['step-9']?.status === 'running' ? 'pass' : run.steps['step-9']?.status || 'skipped', {
          completedAt: now,
          durationMs: elapsed('step-9'),
        }),
        mark('step-12', 'pass', {
          startedAt: now,
          completedAt: now,
          output: { model: data.llmModel, usage: data.usage, executionTime: data.executionTime },
          summary: `Model: ${data.llmModel || '?'} | Tokens: ${(data.usage as any)?.total_tokens || '?'}`,
        }),
      ];

    case 'error':
      return [mark('step-12', 'fail', {
        completedAt: now,
        output: data,
        summary: `Error: ${data.message || 'Unknown'}`,
      })];

    default:
      return [];
  }
}
