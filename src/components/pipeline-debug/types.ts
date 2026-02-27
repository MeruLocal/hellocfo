// Pipeline Debug Dashboard Types

export type PipelineStepStatus = 'pending' | 'running' | 'pass' | 'warn' | 'fail' | 'skipped';

export interface PipelineStepDef {
  id: string;
  number: number | string; // e.g. 0, 1, 6.5
  label: string;
  shortLabel: string;
  phase: 'pre' | 'classify' | 'resolve' | 'execute' | 'post';
}

export interface PipelineStepState {
  stepId: string;
  status: PipelineStepStatus;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  decision?: string;
  logs?: string[];
  summary?: string;
}

export interface PipelineRunState {
  id: string;
  query: string;
  entityId: string;
  orgId: string;
  startedAt: number;
  completedAt?: number;
  totalDurationMs?: number;
  steps: Record<string, PipelineStepState>;
  rawEvents: Array<{ type: string; data: unknown; timestamp: string; receivedAt: number }>;
  finalResponse?: string;
  error?: string;
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
  model?: string;
  routePath?: string;
  category?: string;
}

// All 14 pipeline steps from the doc
export const PIPELINE_STEPS: PipelineStepDef[] = [
  { id: 'step-0',   number: 0,    label: 'Rate Limit + Guardrails', shortLabel: 'Guard',     phase: 'pre' },
  { id: 'step-1',   number: 1,    label: 'Auth + Parse Request',    shortLabel: 'Auth',      phase: 'pre' },
  { id: 'step-2',   number: 2,    label: 'Conversation History',    shortLabel: 'History',   phase: 'pre' },
  { id: 'step-3',   number: 3,    label: 'Hybrid Classification',   shortLabel: 'Classify',  phase: 'classify' },
  { id: 'step-4',   number: 4,    label: 'Embedding Lookup',        shortLabel: 'Embed',     phase: 'classify' },
  { id: 'step-5',   number: 5,    label: 'MCP Connect',             shortLabel: 'MCP',       phase: 'resolve' },
  { id: 'step-6',   number: 6,    label: 'Intent Resolution',       shortLabel: 'Intent',    phase: 'resolve' },
  { id: 'step-6.5', number: 6.5,  label: 'MCQ Prompt',              shortLabel: 'MCQ',       phase: 'resolve' },
  { id: 'step-6.6', number: 6.6,  label: 'Write Validation',        shortLabel: 'Write',     phase: 'resolve' },
  { id: 'step-7',   number: 7,    label: 'Tool Selection',          shortLabel: 'Tools',     phase: 'execute' },
  { id: 'step-8',   number: 8,    label: 'LLM Call',                shortLabel: 'LLM',       phase: 'execute' },
  { id: 'step-9',   number: 9,    label: 'Tool Execution',          shortLabel: 'Exec',      phase: 'execute' },
  { id: 'step-9.5', number: 9.5,  label: 'Iterative Refinement',    shortLabel: 'Refine',    phase: 'execute' },
  { id: 'step-10',  number: 10,   label: 'Response Enrichment',     shortLabel: 'Enrich',    phase: 'post' },
  { id: 'step-11',  number: 11,   label: 'Feedback Logging',        shortLabel: 'Log',       phase: 'post' },
  { id: 'step-12',  number: 12,   label: 'Stream + Save',           shortLabel: 'Stream',    phase: 'post' },
];

// Steps that can be mapped from existing SSE events (Phase 1)
export const PHASE1_SUPPORTED_STEPS = new Set([
  'step-1', 'step-3', 'step-4', 'step-5', 'step-6', 'step-7', 'step-8', 'step-9', 'step-10', 'step-12',
]);

export function createInitialRunState(query: string, entityId: string, orgId: string): PipelineRunState {
  const steps: Record<string, PipelineStepState> = {};
  for (const step of PIPELINE_STEPS) {
    steps[step.id] = {
      stepId: step.id,
      status: PHASE1_SUPPORTED_STEPS.has(step.id) ? 'pending' : 'skipped',
    };
  }
  return {
    id: crypto.randomUUID(),
    query,
    entityId,
    orgId,
    startedAt: Date.now(),
    steps,
    rawEvents: [],
  };
}
