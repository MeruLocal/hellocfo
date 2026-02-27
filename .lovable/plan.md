

# Pipeline Debug Dashboard - Implementation Plan

## Overview

Build a new `/debug/pipeline` route with a full pipeline debugging dashboard. Following the document's priority guidance, we'll implement **Phase 1** first (Live Test Panel + Step Inspector for existing steps), with the architecture ready for Phases 2-4.

## What Gets Built (Phase 1)

### 1. New Route & Page
- Add `/debug/pipeline` route in `App.tsx`
- Create `src/pages/PipelineDebugger.tsx` as the page shell (dark mode forced)

### 2. New Components (all under `src/components/pipeline-debug/`)

| Component | Purpose |
|-----------|---------|
| `PipelineDebugPage.tsx` | Main layout: Live Test Panel (top), Step Inspector (middle), Health Monitor (bottom) |
| `LiveTestPanel.tsx` | Query input, org/entity selectors, Execute/Clear buttons |
| `PipelineProgressBar.tsx` | Horizontal step nodes (circles + lines) with status colors, sticky positioning |
| `StepInspectorCard.tsx` | Expandable card per step: header (status badge, timing, summary) + body (Input/Output JSON, decision, logs) |
| `StepJsonViewer.tsx` | Collapsible JSON viewer with monospace styling and syntax highlighting |
| `HistoricalHealthMonitor.tsx` | Placeholder shell for Phase 4 charts (heatmap, failures, routing distribution) |
| `types.ts` | Pipeline step definitions, status types, step data interfaces |

### 3. Pipeline Steps Mapped to Existing SSE Events

The edge function already emits events we can map to steps without backend changes:

```text
Step 1 (Auth+Parse)     <- 'connected' event (sessionId, entityId present = auth passed)
Step 3 (Classification) <- 'route_started' + 'route_classified' events
Step 4 (Embedding)      <- 'intent_detected' event (confidence, intent name)
Step 5 (MCP Connect)    <- inferred from route_started (mcpToolCount > 0)
Step 6 (Intent Legacy)  <- 'intent_detected' event data
Step 7 (Tool Selection) <- 'tools_filtered' event (toolCount, tools list, category)
Step 8 (LLM Call)       <- 'response_generating' event
Step 9 (Tool Execution) <- 'executing_tool' + 'tool_result' events (per tool)
Step 10 (Enrichment)    <- 'enrichments_applying' event
Step 12 (Stream+Save)   <- 'complete' event (usage, model, response)
```

Steps 0, 2, 6.5, 6.6, 9.5, 11 will show as "Skipped" for now (Phase 2-3).

### 4. How It Works

1. User types query, selects org/entity, clicks Execute
2. Frontend calls `/cfo-agent-api` via SSE (same as RealtimeCFOAgent, reusing the pattern)
3. As SSE events arrive, a mapper function updates each step's status (grey -> blue -> green/yellow/red)
4. Step cards auto-expand on completion, pipeline progress bar updates in real-time
5. "Copy Debug Report" button exports all collected step data as JSON

### 5. Database Changes

Add `step_timings` and `step_results` JSONB columns to `query_routing_logs` (as specified in the doc). This prepares for Phase 4's historical health monitor:

```sql
ALTER TABLE query_routing_logs ADD COLUMN IF NOT EXISTS step_timings JSONB DEFAULT '{}';
ALTER TABLE query_routing_logs ADD COLUMN IF NOT EXISTS step_results JSONB DEFAULT '{}';
ALTER TABLE query_routing_logs ADD COLUMN IF NOT EXISTS mcq_shown BOOLEAN DEFAULT false;
ALTER TABLE query_routing_logs ADD COLUMN IF NOT EXISTS mcq_type TEXT;
ALTER TABLE query_routing_logs ADD COLUMN IF NOT EXISTS mcq_resolved BOOLEAN;
ALTER TABLE query_routing_logs ADD COLUMN IF NOT EXISTS guardrails_triggered TEXT[] DEFAULT '{}';
ALTER TABLE query_routing_logs ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(10,6);
```

### 6. UI Specifications
- Dark mode only (forced via class, not theme toggle)
- Monospace font for all JSON/code displays
- Pipeline progress bar is sticky (CSS `position: sticky`)
- Color system: green = pass, yellow = warning, red = fail, grey = not started, blue = in progress
- Keyboard shortcut: Ctrl+Enter to execute
- Desktop-only (no mobile responsive needed)

## Files to Create/Modify

| Action | File |
|--------|------|
| Create | `src/pages/PipelineDebugger.tsx` |
| Create | `src/components/pipeline-debug/PipelineDebugPage.tsx` |
| Create | `src/components/pipeline-debug/LiveTestPanel.tsx` |
| Create | `src/components/pipeline-debug/PipelineProgressBar.tsx` |
| Create | `src/components/pipeline-debug/StepInspectorCard.tsx` |
| Create | `src/components/pipeline-debug/StepJsonViewer.tsx` |
| Create | `src/components/pipeline-debug/HistoricalHealthMonitor.tsx` |
| Create | `src/components/pipeline-debug/types.ts` |
| Create | `src/components/pipeline-debug/index.ts` |
| Modify | `src/App.tsx` (add route) |
| DB Migration | Add columns to `query_routing_logs` |

## Phases 2-4 (Future)
- **Phase 2**: Add Steps 0, 6.5, 6.6, 9.5 (after MCQ ships) -- requires backend `debug_step` events
- **Phase 3**: Add Step 10 enrichment detail view
- **Phase 4**: Historical Health Monitor charts (heatmap, failure patterns, routing distribution, response time histogram), Compare Runs feature

