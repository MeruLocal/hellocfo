# Munimji Agent — Health Check API

## Endpoint

- **URL:** `https://ptftkblnvsybcggbecau.supabase.co/functions/v1/munimji-agent`
- **Method:** `POST`
- **Response:** Plain JSON (not SSE)
- **Auth:** None required (public health endpoint)

## Request

```bash
curl -X POST \
  https://ptftkblnvsybcggbecau.supabase.co/functions/v1/munimji-agent \
  -H "Content-Type: application/json" \
  -d '{"action": "health"}'
```

### Request Body

```json
{
  "action": "health"
}
```

No other fields are needed.

## Response

The response is wrapped in an SSE `data:` frame (since it reuses the same stream handler). Parse it by stripping the `data: ` prefix.

### Example — Healthy

```json
{
  "status": "healthy",
  "timestamp": "2026-02-27T10:15:30.123Z",
  "version": "1.0.0",
  "checks": {
    "environment": { "status": "ok", "missingKeys": [] },
    "database": { "status": "ok", "latencyMs": 12 },
    "llm": { "status": "ok", "model": "gpt-4o", "endpoint": "custom" },
    "mcp": { "status": "ok", "toolCount": 42, "latencyMs": 230 }
  },
  "uptime": "edge_function"
}
```

### Example — Degraded (MCP down)

```json
{
  "status": "degraded",
  "timestamp": "2026-02-27T10:15:30.123Z",
  "version": "1.0.0",
  "checks": {
    "environment": { "status": "ok", "missingKeys": [] },
    "database": { "status": "ok", "latencyMs": 15 },
    "llm": { "status": "ok", "model": "gpt-4o", "endpoint": "custom" },
    "mcp": { "status": "fail", "error": "connection failed", "latencyMs": 5000 }
  },
  "uptime": "edge_function"
}
```

### Example — Unhealthy (DB or LLM down)

```json
{
  "status": "unhealthy",
  "timestamp": "2026-02-27T10:15:30.123Z",
  "version": "1.0.0",
  "checks": {
    "environment": { "status": "ok", "missingKeys": [] },
    "database": { "status": "fail", "error": "timeout", "latencyMs": 5000 },
    "llm": { "status": "unknown" },
    "mcp": { "status": "ok", "toolCount": 42, "latencyMs": 200 }
  },
  "uptime": "edge_function"
}
```

## Status Logic

| Overall Status | Condition |
|----------------|-----------|
| `healthy` | All 4 checks pass |
| `degraded` | MCP or environment fails, but DB and LLM are OK |
| `unhealthy` | Database or LLM check fails |

## Individual Checks

| Check | What It Does | Timeout |
|-------|-------------|---------|
| **environment** | Verifies `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MCP_BASE_URL` exist | Instant |
| **database** | Pings `llm_configs` table with `.select("id").limit(1)`, measures latency | 5s |
| **llm** | Verifies a default LLM config exists with a valid API key | 5s (shared with DB) |
| **mcp** | Connects to MCP server, runs `initialize` + `tools/list`, reports tool count | 5s |

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"healthy" \| "degraded" \| "unhealthy"` | Overall system status |
| `timestamp` | ISO 8601 string | When the check was performed |
| `version` | string | Agent version identifier |
| `checks` | object | Individual check results (see below) |
| `uptime` | string | Always `"edge_function"` |

### Check Object Fields

| Field | Type | Present In | Description |
|-------|------|-----------|-------------|
| `status` | `"ok" \| "fail" \| "unknown"` | All | Check result |
| `latencyMs` | number | database, mcp | Round-trip time in ms |
| `missingKeys` | string[] | environment | List of missing env vars |
| `model` | string | llm | Configured model name |
| `endpoint` | `"custom" \| "default"` | llm | Whether custom endpoint is set |
| `toolCount` | number | mcp | Number of tools available |
| `error` | string | Any (on failure) | Error description |

## Parsing the Response

Since the health response comes through the SSE stream handler, it's wrapped in a `data:` prefix:

```
data: {"status":"healthy","timestamp":"...","version":"1.0.0","checks":{...},"uptime":"edge_function"}
```

### JavaScript Example

```typescript
const res = await fetch(
  "https://ptftkblnvsybcggbecau.supabase.co/functions/v1/munimji-agent",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "health" }),
  }
);

const text = await res.text();
const jsonStr = text.replace(/^data:\s*/, "").trim();
const health = JSON.parse(jsonStr);

console.log(health.status);       // "healthy" | "degraded" | "unhealthy"
console.log(health.checks.mcp);   // { status: "ok", toolCount: 42, latencyMs: 230 }
```

## Integration Notes

- **Monitoring:** Suitable for uptime monitors (Datadog, UptimeRobot, etc.) — just POST and check `status` field
- **No auth required:** Same pattern as the existing `action: "feedback"` endpoint
- **Target latency:** Under 2 seconds for a healthy system
- **Each check has a 5-second timeout** — total worst case is ~5s (checks run in parallel)
