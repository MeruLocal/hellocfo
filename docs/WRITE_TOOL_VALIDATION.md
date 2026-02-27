# Write Tool Pre-Flight Validation — Architecture & Frontend Guide

> **Version**: v3.1 — Last updated: 2026-02-27  
> **Scope**: How `validateWriteToolArgs()` prevents silent write failures and how the frontend surfaces validation errors to users.

---

## 1. The Problem

MCP (HelloBooks) does **not** validate required fields. It accepts malformed payloads and either:
- Creates broken records (₹0 payments, blank invoices)
- Returns cryptic API errors that the LLM cannot interpret
- Silently succeeds with missing data

**Result**: Users see "Payment created successfully" but the payment has no amount, no invoice link, and breaks their books.

---

## 2. Where Validation Sits in the Pipeline

```
User: "Record ₹5000 payment from Acme Corp"
          │
          ▼
    ┌─ Steps 1-8: Classification → Intent → Tool Selection ─┐
    │   LLM decides: call create_payment({AccountId: 'xxx'}) │
    └────────────────────────────────────────────────────────┘
          │
          ▼
    ┌─ Step 9e: validateWriteToolArgs() ── PRE-FLIGHT ──────┐
    │                                                        │
    │  Checks create_payment requirements:                   │
    │    ✅ AccountId: present                               │
    │    ❌ Amount: MISSING                                  │
    │    ❌ Applications[]: MISSING                          │
    │                                                        │
    │  DECISION: BLOCK — do NOT call MCP                     │
    │                                                        │
    │  Returns to LLM:                                       │
    │    "Missing: Amount, Applications[].                    │
    │     Fetch invoice first via get_all_invoices            │
    │     to obtain InvoiceId for Applications."             │
    └────────────────────────────────────────────────────────┘
          │
          ▼
    LLM self-corrects → calls get_all_invoices → retries
    create_payment with all required fields → SUCCESS
```

**Key insight**: Validation happens **inside the Edge Function** (Steps 9d–9e), before MCP is ever called. The frontend does not perform this validation — it receives the outcome via SSE events.

---

## 3. Current Validation Coverage (v3)

### 3.1 Covered Tools

| Tool | Required Fields | Risk If Missing |
|------|----------------|-----------------|
| `create_payment` | `Applications[]`, `Amount`, `AccountId` | Payment with ₹0 or no invoice link |
| `create_invoice` | `Lines[]`, `ContactId` | Blank invoice with no customer |
| `create_bill` | `Lines[]`, `ContactId` | Blank bill with no vendor |
| `create_credit_note` | `Lines[]`, `ContactId` | Orphan credit note |

### 3.2 Tools That Need Validation (Gaps)

| Tool | Required Fields | Risk If Missing |
|------|----------------|-----------------|
| `update_invoice` | `InvoiceId` | Random invoice modified |
| `update_bill` | `BillId` | Random bill modified |
| `void_invoice` | `InvoiceId` | Wrong invoice voided — **irreversible** |
| `delete_contact` | `ContactId` | Wrong customer/vendor deleted |
| `send_invoice` | `InvoiceId`, `email` | Sent to wrong recipient |
| `approve_bill` | `BillId` | Wrong bill approved for payment |
| `create_journal_entry` | `Lines[]` (min 2, debit=credit) | Unbalanced entry breaks books |
| `update_payment` | `PaymentId` | Wrong payment modified |

### 3.3 Discovery Query

```sql
SELECT tool_name FROM tool_registry 
WHERE tool_name LIKE 'create_%' 
   OR tool_name LIKE 'update_%' 
   OR tool_name LIKE 'delete_%' 
   OR tool_name LIKE 'void_%' 
   OR tool_name LIKE 'approve_%' 
   OR tool_name LIKE 'send_%'
ORDER BY tool_name;
```

---

## 4. Backend Implementation

### 4.1 Validation Map (`_shared/write-validator.ts`)

```typescript
export const WRITE_TOOL_VALIDATIONS: Record<string, {
  required: string[];
  arrayFields?: string[];        // Must be non-empty arrays
  customCheck?: (args: any) => string | null;  // Return error or null
}> = {
  // ── Currently covered ──
  create_payment: {
    required: ['AccountId', 'Amount'],
    arrayFields: ['Applications'],
  },
  create_invoice: {
    required: ['ContactId'],
    arrayFields: ['Lines'],
  },
  create_bill: {
    required: ['ContactId'],
    arrayFields: ['Lines'],
  },
  create_credit_note: {
    required: ['ContactId'],
    arrayFields: ['Lines'],
  },

  // ── Expansion targets ──
  update_invoice:       { required: ['InvoiceId'] },
  update_bill:          { required: ['BillId'] },
  void_invoice:         { required: ['InvoiceId'] },
  delete_contact:       { required: ['ContactId'] },
  send_invoice:         { required: ['InvoiceId'] },
  approve_bill:         { required: ['BillId'] },
  update_payment:       { required: ['PaymentId'] },
  create_journal_entry: {
    required: [],
    arrayFields: ['Lines'],
    customCheck: (args) => {
      const lines = args?.Lines || [];
      if (lines.length < 2) return 'Journal entry requires at least 2 lines.';
      const debits = lines.reduce((s, l) => s + (l.DebitAmount || 0), 0);
      const credits = lines.reduce((s, l) => s + (l.CreditAmount || 0), 0);
      if (Math.abs(debits - credits) > 0.01) {
        return `Debits (${debits}) must equal Credits (${credits}).`;
      }
      return null;
    },
  },
};
```

### 4.2 Validation Function

```typescript
export function validateWriteToolArgs(
  toolName: string, 
  args: Record<string, any>
): { valid: boolean; errors: string[] } {
  const rules = WRITE_TOOL_VALIDATIONS[toolName];
  if (!rules) return { valid: true, errors: [] };

  const errors: string[] = [];

  // Check required scalar fields
  for (const field of rules.required) {
    if (args[field] === undefined || args[field] === null || args[field] === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check required array fields (must exist and be non-empty)
  for (const field of (rules.arrayFields || [])) {
    const val = args[field];
    if (!Array.isArray(val) || val.length === 0) {
      errors.push(`${field} must be a non-empty array`);
    }
  }

  // Custom validation
  if (rules.customCheck) {
    const customError = rules.customCheck(args);
    if (customError) errors.push(customError);
  }

  return { valid: errors.length === 0, errors };
}
```

### 4.3 Where It's Called (Edge Function Pipeline)

```
cfo-agent-api/index.ts  →  Tool-calling loop (Step 9)
                              │
                              ├── 9a: LLM returns tool_call
                              ├── 9b: Extract tool_name + args
                              ├── 9c: Check if write tool (is_write flag)
                              ├── 9d: MCQ confirmation (if needed)
                              ├── 9e: validateWriteToolArgs() ← HERE
                              │       If invalid → return error to LLM
                              │       LLM gets another iteration to fix
                              ├── 9f: Execute via MCP (only if valid)
                              └── 9g: Parse result + continue
```

---

## 5. SSE Events the Frontend Receives

The frontend **does not validate** — it observes. Here are the SSE events related to write validation:

### 5.1 Validation Blocked (tool NOT called)

```json
{
  "type": "write_validation",
  "data": {
    "tool": "create_payment",
    "status": "blocked",
    "missing_fields": ["Amount", "Applications"],
    "message": "Missing Amount and Applications[]. Fetching invoices to resolve."
  }
}
```

### 5.2 Validation Passed (tool will be called)

```json
{
  "type": "write_validation",
  "data": {
    "tool": "create_payment",
    "status": "passed",
    "fields_validated": ["AccountId", "Amount", "Applications"]
  }
}
```

### 5.3 Write Execution Result

```json
{
  "type": "tool_result",
  "data": {
    "tool": "create_payment",
    "success": true,
    "result": { "PaymentId": "PAY-001", ... }
  }
}
```

### 5.4 Write Retry (after self-correction)

```json
{
  "type": "tool_retry",
  "data": {
    "tool": "create_payment",
    "attempt": 2,
    "reason": "Previous attempt blocked by pre-flight validation"
  }
}
```

---

## 6. Frontend Handling

### 6.1 Where Validation Events Appear

| Component | What It Shows |
|-----------|--------------|
| **RealtimeCFOAgent** (chat) | Users see the final result only. Validation retries happen silently — the LLM self-corrects and the user gets a clean response. |
| **Pipeline Debugger** | Full visibility: every `write_validation`, `tool_retry`, and `tool_result` event is shown in the Step Inspector cards. |
| **AgentThinkingPanel** | Shows "Validating write arguments…" and "Missing fields detected, retrying…" in the thinking stream. |

### 6.2 Chat UI — User Experience

Users **never see** raw validation errors. The flow is transparent:

```
User: "Record payment of ₹5000 from Acme Corp"

  [Behind the scenes]
  LLM → create_payment({AccountId: 'xxx'})  
  → BLOCKED (missing Amount, Applications)
  → LLM calls get_all_invoices for Acme
  → LLM retries create_payment with all fields
  → SUCCESS

User sees: "✅ Payment of ₹5,000 recorded against Invoice INV-042 for Acme Corp."
```

If validation **cannot be resolved** after retries:

```
User sees: "I need a few more details to record this payment:
            • Which invoice should this payment apply to?
            • Please confirm the exact amount."
```

### 6.3 Pipeline Debugger — Developer Experience

The Pipeline Debugger surfaces every validation event:

```
Step 9e: Write Validation
├── Tool: create_payment
├── Status: ❌ BLOCKED
├── Missing: Amount, Applications[]
├── Action: Returning error to LLM for self-correction
└── Duration: 2ms

Step 9e (retry): Write Validation  
├── Tool: create_payment
├── Status: ✅ PASSED
├── Fields: AccountId, Amount, Applications[1]
└── Duration: 1ms

Step 9f: MCP Execution
├── Tool: create_payment
├── Status: ✅ SUCCESS
├── Result: {PaymentId: "PAY-001"}
└── Duration: 1,247ms
```

### 6.4 SSE Mapper Integration

In `sseMapper.ts`, map validation events to step updates:

```typescript
// In mapSSEEventToStepUpdates()
case 'write_validation': {
  const status = eventData.status === 'blocked' ? 'warn' : 'pass';
  return [{
    stepId: 'write_validation',
    status,
    durationMs: eventData.duration_ms,
    detail: eventData.status === 'blocked'
      ? `Blocked: missing ${(eventData.missing_fields as string[]).join(', ')}`
      : `Validated: ${eventData.tool}`,
    raw: eventData,
  }];
}

case 'tool_retry': {
  return [{
    stepId: 'mcp_execute',
    status: 'running',
    detail: `Retry #${eventData.attempt}: ${eventData.reason}`,
    raw: eventData,
  }];
}
```

---

## 7. MCQ Confirmation Flow (Step 9d)

For **dangerous** write operations, the system asks for explicit user confirmation via MCQ before validation:

### 7.1 Tier Classification

| Tier | Operations | Confirmation Type |
|------|-----------|-------------------|
| **Tier 1** (Low risk) | `create_invoice`, `create_bill`, `create_payment` | Single "Confirm?" MCQ |
| **Tier 2** (Medium risk) | `update_invoice`, `update_bill`, `send_invoice` | Detailed summary MCQ showing what changes |
| **Tier 3** (High risk) | `void_invoice`, `delete_contact`, `approve_bill` | Type-to-confirm (e.g., "Type VOID to confirm") |

### 7.2 Frontend MCQ Component

The `MCQCard` component renders confirmation options sent via SSE:

```json
{
  "type": "mcq",
  "data": {
    "mcq_type": "write_confirmation",
    "question": "Confirm: Create payment of ₹5,000 for Acme Corp against INV-042?",
    "options": [
      {"label": "✅ Yes, create payment", "value": "confirm"},
      {"label": "❌ Cancel", "value": "cancel"}
    ],
    "pending_tool": "create_payment",
    "pending_args": { ... }
  }
}
```

### 7.3 Flow After MCQ

```
MCQ Shown → User clicks "Confirm"
  → Frontend sends mcq_response to API
  → Step 9e: validateWriteToolArgs() runs
  → Step 9f: MCP execution
  → Result streamed back
```

If user clicks "Cancel":
```
MCQ Shown → User clicks "Cancel"
  → Frontend sends mcq_response with "cancel"
  → Agent responds: "Okay, payment creation cancelled."
  → No MCP call made
```

---

## 8. Error Handling Matrix

| Scenario | Backend Behavior | Frontend Behavior |
|----------|-----------------|-------------------|
| Missing required field | Block tool, return error to LLM | Silent — LLM self-corrects |
| LLM can't self-correct after 2 tries | Generate fallback asking user for details | Show conversational prompt for missing info |
| MCP returns error after validation passes | Retry once with 60s timeout | Show error in chat with human-readable message |
| MCP returns success but LLM says "failed" | Reverse Guardrail overrides LLM response | User sees accurate success message |
| LLM says "success" but no tool executed | Strip hallucinated success card | User sees honest "I couldn't complete this" |

---

## 9. Monitoring & Debugging

### 9.1 Database Logging

Every write validation is logged in `query_routing_logs`:

| Column | Value |
|--------|-------|
| `is_write_operation` | `true` |
| `write_tool_results` | `[{tool, validation_status, fields_checked, mcp_result}]` |
| `guardrails_triggered` | `['write_preflight_block']` if blocked |
| `tools_used` | Final list of tools that actually executed |
| `tools_failed` | Tools that were blocked or failed |

### 9.2 Pipeline Debugger Queries

To find failed validations:
```sql
SELECT query, write_tool_results, created_at
FROM query_routing_logs
WHERE 'write_preflight_block' = ANY(guardrails_triggered)
ORDER BY created_at DESC
LIMIT 20;
```

### 9.3 Historical Health Monitor

The `HistoricalHealthMonitor` component in Pipeline Debugger can show:
- Write validation block rate (should be > 0 — means it's catching errors)
- Self-correction success rate (how often LLM fixes itself after a block)
- Write tool failure rate after validation (should be near 0)

---

## 10. Implementation Checklist

### Backend (Edge Functions)

- [ ] Expand `WRITE_TOOL_VALIDATIONS` map in `_shared/write-validator.ts`
- [ ] Add all write tools from `tool_registry` query
- [ ] Add `create_journal_entry` custom balance check
- [ ] Emit `write_validation` SSE event (blocked and passed)
- [ ] Emit `tool_retry` SSE event on self-correction attempts
- [ ] Log validation results in `query_routing_logs.write_tool_results`
- [ ] Log blocks in `query_routing_logs.guardrails_triggered`

### Frontend (React)

- [ ] Add `write_validation` case in `sseMapper.ts`
- [ ] Add `tool_retry` case in `sseMapper.ts`
- [ ] Add write validation step to `PIPELINE_STEPS` in types.ts
- [ ] Style validation block/pass states in `StepInspectorCard`
- [ ] Add write validation metrics to `HistoricalHealthMonitor`

### Testing

- [ ] Test `create_payment` with missing Amount → expect block
- [ ] Test `create_invoice` with missing Lines → expect block
- [ ] Test `void_invoice` with missing InvoiceId → expect block
- [ ] Test `create_journal_entry` with unbalanced lines → expect block
- [ ] Test valid payload → expect pass and MCP execution
- [ ] Test LLM self-correction flow end-to-end
- [ ] Test MCQ confirmation → cancel → no MCP call

---

## 11. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                         │
│                                                             │
│  ┌──────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │ CFO Chat UI  │  │ Pipeline Debug  │  │ Thinking Panel│  │
│  │              │  │                 │  │               │  │
│  │ Shows final  │  │ Shows every SSE │  │ Shows "Vali-  │  │
│  │ result only  │  │ event + timing  │  │ dating args…" │  │
│  └──────┬───────┘  └────────┬────────┘  └───────┬───────┘  │
│         │                   │                    │          │
│         └───────────────────┼────────────────────┘          │
│                             │                               │
│                        SSE Stream                           │
└─────────────────────────────┼───────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────┐
│              EDGE FUNCTION (cfo-agent-api)                  │
│                             │                               │
│  Step 1-8: Classify → Route → Select Tools                  │
│                             │                               │
│  Step 9: Tool Execution Loop                                │
│  ┌──────────────────────────┼────────────────────────────┐  │
│  │                          │                            │  │
│  │  9a. LLM returns tool_call                            │  │
│  │  9b. Extract tool_name + args                         │  │
│  │  9c. is_write? → Yes                                  │  │
│  │  9d. MCQ confirmation (Tier 1/2/3)                    │  │
│  │         │                                             │  │
│  │  9e. ┌──┴──────────────────────────┐                  │  │
│  │      │  validateWriteToolArgs()    │                  │  │
│  │      │                             │                  │  │
│  │      │  ✅ Pass → continue to 9f   │                  │  │
│  │      │  ❌ Block → error to LLM    │──→ LLM retries  │  │
│  │      └─────────────────────────────┘                  │  │
│  │         │                                             │  │
│  │  9f. MCP Execute (60s timeout)                        │  │
│  │  9g. Parse result                                     │  │
│  │  9h. Reverse Guardrail check                          │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                             │                               │
│                        MCP Client                           │
└─────────────────────────────┼───────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │  HelloBooks MCP   │
                    │  (mcp.hellobooks) │
                    │                   │
                    │  No validation!   │
                    │  Accepts anything │
                    └───────────────────┘
```

---

*Document maintained by HelloCFO Engineering. For questions, refer to `public/HelloCFO_System_Documentation.md` and `public/Munimji_Architecture_v3.md`.*
