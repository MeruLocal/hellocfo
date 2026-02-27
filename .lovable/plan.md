

# Add Health Check Route to Munimji Agent

## Overview
Add a lightweight health endpoint to the `munimji-agent` edge function that reports the status of all critical dependencies without executing a real query.

## What It Returns

```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "timestamp": "2026-02-27T...",
  "version": "1.0.0",
  "checks": {
    "database": { "status": "ok", "latencyMs": 12 },
    "llm": { "status": "ok", "model": "gpt-4o", "endpoint": "azure" },
    "mcp": { "status": "ok", "toolCount": 42, "latencyMs": 230 },
    "environment": { "status": "ok", "missingKeys": [] }
  },
  "uptime": "edge_function"
}
```

## Health Checks Performed

| Check | What It Does |
|-------|-------------|
| **Database** | Pings `llm_configs` table with a `.select("id").limit(1)` query, measures latency |
| **LLM Config** | Verifies a default LLM config exists with a valid API key and endpoint |
| **MCP** | Connects to MCP server, lists tools, reports tool count and latency |
| **Environment** | Checks required env vars exist: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MCP_BASE_URL` |

Overall status:
- **healthy** = all checks pass
- **degraded** = MCP or non-critical check fails
- **unhealthy** = DB or LLM check fails

## How to Trigger

Send a POST with `{ "action": "health" }` to the munimji-agent endpoint. No auth required (same as existing feedback action pattern).

## Changes

### 1. Modify `supabase/functions/munimji-agent/index.ts`
- Add a new `action === "health"` handler block (right after the existing `action === "feedback"` block around line 416)
- Runs all 4 checks in parallel using `Promise.allSettled`
- Returns a single JSON response (not SSE) with the health report
- Timeout: each check gets 5 seconds max

### 2. No new files needed
The health check logic lives entirely within the existing edge function handler.

### 3. No database changes needed
Uses existing tables for connectivity checks only.

## Technical Details

The health handler will:
1. Early-exit from the SSE stream pattern (like the feedback handler does)
2. Run checks concurrently via `Promise.allSettled`
3. Return plain JSON (not SSE) for easy integration with monitoring tools
4. Include a `latencyMs` field per check for performance monitoring
5. Total response target: under 2 seconds

