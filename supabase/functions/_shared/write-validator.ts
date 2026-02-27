// Write Tool Pre-flight Validator — Gap 7 (Phase 2B)
// Layer 1: Field presence check
// Layer 2: Pre-requisite chain — dependency resolution & business rule validation

// ═══════════════════════════════════════════════════════════════
//  LAYER 1 — Field Validation (existing)
// ═══════════════════════════════════════════════════════════════

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedArgs?: Record<string, unknown>;
}

// Required fields per write tool type
const WRITE_TOOL_REQUIREMENTS: Record<string, {
  required: string[];
  conditionalRequired?: Record<string, string[]>;
  validators?: Record<string, (val: unknown) => string | null>;
}> = {
  create_invoice: {
    required: ["Lines"],
    conditionalRequired: {},
    validators: {
      Lines: (val) => {
        if (!Array.isArray(val) || val.length === 0) return "Lines array must have at least one item with description, quantity, and rate";
        for (const line of val) {
          if (!line || typeof line !== "object") return "Each line item must be an object";
        }
        return null;
      },
    },
  },
  create_bill: {
    required: ["Lines"],
    validators: {
      Lines: (val) => {
        if (!Array.isArray(val) || val.length === 0) return "Lines array must have at least one item";
        return null;
      },
    },
  },
  create_payment: {
    required: [],
    validators: {
      Applications: (val) => {
        if (val !== undefined && (!Array.isArray(val) || val.length === 0)) {
          return "Applications array must link to at least one invoice";
        }
        return null;
      },
      Amount: (val) => {
        if (val !== undefined) {
          const num = typeof val === "number" ? val : parseFloat(String(val));
          if (isNaN(num) || num <= 0) return "Amount must be a positive number";
        }
        return null;
      },
    },
  },
  create_customer: {
    required: [],
    validators: {},
  },
  create_vendor: {
    required: [],
    validators: {},
  },
  create_expense: {
    required: [],
    validators: {
      Amount: (val) => {
        if (val !== undefined) {
          const num = typeof val === "number" ? val : parseFloat(String(val));
          if (isNaN(num) || num <= 0) return "Amount must be a positive number";
        }
        return null;
      },
    },
  },
  create_journal_entry: {
    required: [],
    validators: {},
  },
};

// Generic validators applied to all write tools
function genericValidations(toolName: string, args: Record<string, unknown>): string[] {
  const errors: string[] = [];

  if (toolName.startsWith("create_") && Object.keys(args).length === 0) {
    errors.push("Cannot create a record with no parameters. At least one field is required.");
  }

  const dateFields = ["Date", "DueDate", "date", "due_date", "PaymentDate"];
  for (const field of dateFields) {
    const val = args[field];
    if (val && typeof val === "string") {
      if (!/^\d{4}-\d{2}-\d{2}/.test(val) && !/^\d{2}\/\d{2}\/\d{4}/.test(val)) {
        errors.push(`${field} should be a valid date format (YYYY-MM-DD or DD/MM/YYYY)`);
      }
    }
  }

  const amountFields = ["Amount", "TotalAmount", "Rate", "Quantity", "amount", "rate", "quantity"];
  for (const field of amountFields) {
    const val = args[field];
    if (val !== undefined && val !== null) {
      const num = typeof val === "number" ? val : parseFloat(String(val));
      if (!isNaN(num) && num < 0) {
        errors.push(`${field} cannot be negative`);
      }
    }
  }

  return errors;
}

/**
 * Layer 1: Validate write tool arguments before sending to MCP.
 */
export function validateWriteToolArgs(
  toolName: string,
  args: Record<string, unknown>,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!/^(create|update|delete|void|cancel|extend|file|generate|import|adjust|record|send|approve|reconcile)_/.test(toolName)) {
    return { valid: true, errors: [], warnings: [] };
  }

  errors.push(...genericValidations(toolName, args));

  const toolConfig = WRITE_TOOL_REQUIREMENTS[toolName];
  if (toolConfig) {
    for (const field of toolConfig.required) {
      if (args[field] === undefined || args[field] === null || args[field] === "") {
        errors.push(`Missing required field: ${field}`);
      }
    }
    if (toolConfig.validators) {
      for (const [field, validator] of Object.entries(toolConfig.validators)) {
        const error = validator(args[field]);
        if (error) errors.push(error);
      }
    }
  }

  if (/^(delete|void|cancel)_/.test(toolName)) {
    warnings.push(`Destructive action: ${toolName}. Ensure user has confirmed.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sanitizedArgs: args,
  };
}

// ═══════════════════════════════════════════════════════════════
//  LAYER 2 — Pre-Requisite Tool Chain Engine
// ═══════════════════════════════════════════════════════════════

export interface PreReqStepResult {
  valid: boolean;
  resolvedValue?: unknown;
  block?: boolean;
  reason?: string;
  askUser?: string;
  mcqType?: "entity_selection" | "free_text";
  mcqOptions?: { label: string; sublabel?: string; value: string }[];
  missingField?: string;
}

export interface PreReqStep {
  /** MCP tool to call for this pre-req check */
  tool: string;
  /** Only run this step if condition returns true (default: always) */
  condition?: (writeArgs: Record<string, unknown>, chainData: Record<string, unknown>) => boolean;
  /** Build args for the pre-req tool call */
  extractArgs: (writeArgs: Record<string, unknown>, chainData: Record<string, unknown>) => Record<string, unknown>;
  /** Pull a single field from the result into chainData */
  extractField?: string;
  /** Validate the result — can block, ask user, or resolve values */
  validate?: (result: unknown, writeArgs: Record<string, unknown>) => PreReqStepResult;
  /** Where to store the resolved value (in writeArgs if no __ prefix, in chainData if __ prefix) */
  injectInto: string;
  /** What to do if this step's MCP call fails */
  onFailure?: "abort" | "skip" | "ask_user";
}

export interface PreReqConfig {
  steps: PreReqStep[];
  maxChainDepth: number;
}

/** Result of running the full pre-req chain */
export interface PreReqChainResult {
  passed: boolean;
  enrichedArgs: Record<string, unknown>;
  blocked?: boolean;
  blockReason?: string;
  askUser?: string;
  mcqType?: "entity_selection" | "free_text";
  mcqOptions?: { label: string; sublabel?: string; value: string }[];
  missingField?: string;
  stepsExecuted: { tool: string; success: boolean; durationMs: number; skipped?: boolean }[];
}

// ─────────────────────────────────────────────────────────────
//  Pre-Requisite Configs for ALL write tools
// ─────────────────────────────────────────────────────────────

// Helper: safely parse a JSON tool result string
function parseMcpResult(raw: string): unknown {
  try { return JSON.parse(raw); } catch (_e) { return raw; }
}

// Helper: extract items/records from various MCP result shapes
function extractItems(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.Items)) return obj.Items;
    if (Array.isArray(obj.Invoices)) return obj.Invoices;
    if (Array.isArray(obj.Bills)) return obj.Bills;
    if (Array.isArray(obj.Payments)) return obj.Payments;
    if (Array.isArray(obj.Contacts)) return obj.Contacts;
    if (Array.isArray(obj.Accounts)) return obj.Accounts;
    if (Array.isArray(obj.CreditNotes)) return obj.CreditNotes;
    // Single-record result
    if (obj.InvoiceId || obj.BillId || obj.ContactId || obj.PaymentId) return [obj];
  }
  return [];
}

function getField(obj: unknown, field: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  return (obj as Record<string, unknown>)[field];
}

export const WRITE_TOOL_PREREQUISITES: Record<string, PreReqConfig> = {

  // ── send_invoice: need email from contact ──
  send_invoice: {
    maxChainDepth: 2,
    steps: [
      {
        tool: "get_invoice",
        condition: (wa) => !!wa.InvoiceId && !wa.EmailAddress,
        extractArgs: (wa) => ({ InvoiceId: wa.InvoiceId }),
        extractField: "ContactId",
        injectInto: "__contactId",
        onFailure: "abort",
      },
      {
        tool: "get_contact",
        condition: (_wa, cd) => !!cd.__contactId && !_wa.EmailAddress,
        extractArgs: (_wa, cd) => ({ ContactId: cd.__contactId }),
        validate: (result) => {
          const items = extractItems(result);
          const contact = items[0] as Record<string, unknown> | undefined;
          const email = contact?.EmailAddress as string | undefined;
          if (!email) {
            return {
              valid: false,
              missingField: "EmailAddress",
              askUser: "Customer ka email address nahi mila. Kaunse email pe invoice bhejein?",
            };
          }
          return { valid: true, resolvedValue: email };
        },
        injectInto: "EmailAddress",
        onFailure: "ask_user",
      },
    ],
  },

  // ── void_invoice: check status before voiding ──
  void_invoice: {
    maxChainDepth: 1,
    steps: [
      {
        tool: "get_invoice",
        extractArgs: (wa) => ({ InvoiceId: wa.InvoiceId }),
        validate: (result) => {
          const items = extractItems(result);
          const inv = items[0] as Record<string, unknown> | undefined;
          const status = inv?.Status as string | undefined;
          if (status === "PAID") return { valid: false, block: true, reason: "Paid invoice void nahi ho sakta. Pehle credit note banayein." };
          if (status === "VOIDED") return { valid: false, block: true, reason: "Ye invoice pehle se void hai." };
          if (status && status !== "AUTHORISED" && status !== "SUBMITTED" && status !== "DRAFT") {
            return { valid: false, block: true, reason: `Invoice status "${status}" hai — sirf AUTHORISED/SUBMITTED/DRAFT void ho sakta hai.` };
          }
          return { valid: true };
        },
        injectInto: "__status",
        onFailure: "abort",
      },
    ],
  },

  // ── delete_contact: check outstanding balance ──
  delete_contact: {
    maxChainDepth: 1,
    steps: [
      {
        tool: "get_contact",
        extractArgs: (wa) => ({ ContactId: wa.ContactId }),
        validate: (result) => {
          const items = extractItems(result);
          const contact = items[0] as Record<string, unknown> | undefined;
          const arBalance = Number(contact?.AccountsReceivableOutstanding || 0);
          const apBalance = Number(contact?.AccountsPayableOutstanding || 0);
          const totalOutstanding = Math.abs(arBalance) + Math.abs(apBalance);
          if (totalOutstanding > 0) {
            return { valid: false, block: true, reason: `Contact delete nahi ho sakta — ₹${totalOutstanding.toLocaleString("en-IN")} outstanding hai. Pehle settle karein.` };
          }
          return { valid: true };
        },
        injectInto: "__contactCheck",
        onFailure: "abort",
      },
    ],
  },

  // ── approve_bill: check status ──
  approve_bill: {
    maxChainDepth: 1,
    steps: [
      {
        tool: "get_bill",
        extractArgs: (wa) => ({ BillId: wa.BillId }),
        validate: (result) => {
          const items = extractItems(result);
          const bill = items[0] as Record<string, unknown> | undefined;
          const status = bill?.Status as string | undefined;
          if (status === "PAID") return { valid: false, block: true, reason: "Bill already paid hai — approve nahi ho sakta." };
          if (status === "AUTHORISED") return { valid: false, block: true, reason: "Bill pehle se approved (AUTHORISED) hai." };
          if (status && status !== "SUBMITTED") {
            return { valid: false, block: true, reason: `Bill status "${status}" hai — sirf SUBMITTED approve ho sakta hai.` };
          }
          return { valid: true };
        },
        injectInto: "__billCheck",
        onFailure: "abort",
      },
    ],
  },

  // ── update_invoice: verify invoice exists ──
  update_invoice: {
    maxChainDepth: 1,
    steps: [
      {
        tool: "get_invoice",
        condition: (wa) => !!wa.InvoiceId,
        extractArgs: (wa) => ({ InvoiceId: wa.InvoiceId }),
        validate: (result) => {
          const items = extractItems(result);
          if (items.length === 0) return { valid: false, block: true, reason: "Invoice nahi mila. Invoice ID verify karein." };
          const inv = items[0] as Record<string, unknown> | undefined;
          const status = inv?.Status as string | undefined;
          if (status === "VOIDED") return { valid: false, block: true, reason: "Voided invoice update nahi ho sakta." };
          if (status === "PAID") return { valid: false, block: true, reason: "Paid invoice update nahi ho sakta — pehle credit note banayein." };
          return { valid: true };
        },
        injectInto: "__invoiceCheck",
        onFailure: "abort",
      },
    ],
  },

  // ── update_bill: verify bill exists ──
  update_bill: {
    maxChainDepth: 1,
    steps: [
      {
        tool: "get_bill",
        condition: (wa) => !!wa.BillId,
        extractArgs: (wa) => ({ BillId: wa.BillId }),
        validate: (result) => {
          const items = extractItems(result);
          if (items.length === 0) return { valid: false, block: true, reason: "Bill nahi mila. Bill ID verify karein." };
          const bill = items[0] as Record<string, unknown> | undefined;
          const status = bill?.Status as string | undefined;
          if (status === "PAID") return { valid: false, block: true, reason: "Paid bill update nahi ho sakta." };
          return { valid: true };
        },
        injectInto: "__billCheck",
        onFailure: "abort",
      },
    ],
  },

  // ── update_payment: check if reconciled ──
  update_payment: {
    maxChainDepth: 1,
    steps: [
      {
        tool: "get_payment",
        condition: (wa) => !!wa.PaymentId,
        extractArgs: (wa) => ({ PaymentId: wa.PaymentId }),
        validate: (result) => {
          const items = extractItems(result);
          if (items.length === 0) return { valid: false, block: true, reason: "Payment nahi mila. Payment ID verify karein." };
          const payment = items[0] as Record<string, unknown> | undefined;
          const isReconciled = payment?.IsReconciled as boolean | undefined;
          if (isReconciled) return { valid: false, block: true, reason: "Reconciled payment modify nahi ho sakta." };
          return { valid: true };
        },
        injectInto: "__paymentCheck",
        onFailure: "abort",
      },
    ],
  },

  // ── create_credit_note: verify source invoice ──
  create_credit_note: {
    maxChainDepth: 1,
    steps: [
      {
        tool: "get_invoice",
        condition: (wa) => !!wa.InvoiceId || !!wa.__invoiceId,
        extractArgs: (wa, cd) => ({ InvoiceId: wa.InvoiceId || cd.__invoiceId }),
        validate: (result, wa) => {
          const items = extractItems(result);
          if (items.length === 0) return { valid: false, block: true, reason: "Source invoice nahi mila." };
          const inv = items[0] as Record<string, unknown> | undefined;
          const status = inv?.Status as string | undefined;
          if (status === "DRAFT") return { valid: false, block: true, reason: "Draft invoice pe credit note nahi ban sakta — pehle invoice approve karein." };
          if (status === "VOIDED") return { valid: false, block: true, reason: "Voided invoice pe credit note nahi ban sakta." };
          // Auto-fill ContactId from invoice if not provided
          if (!wa.ContactId && inv?.ContactId) {
            return { valid: true, resolvedValue: inv.ContactId };
          }
          return { valid: true };
        },
        injectInto: "ContactId",
        onFailure: "abort",
      },
    ],
  },

  // ── create_payment: validate invoice + bank account ──
  create_payment: {
    maxChainDepth: 2,
    steps: [
      {
        tool: "get_accounts",
        condition: (wa) => !wa.AccountId,
        extractArgs: () => ({ Type: "BANK" }),
        validate: (result) => {
          const accounts = extractItems(result);
          if (accounts.length === 0) return { valid: false, block: true, reason: "Koi bank account nahi mila." };
          if (accounts.length === 1) {
            return { valid: true, resolvedValue: getField(accounts[0], "AccountId") };
          }
          return {
            valid: false,
            mcqType: "entity_selection",
            mcqOptions: accounts.slice(0, 5).map((acc: unknown) => {
              const a = acc as Record<string, unknown>;
              return {
                label: String(a.Name || a.AccountId || "Unknown"),
                sublabel: String(a.BankAccountNumber || a.Code || ""),
                value: String(a.AccountId || ""),
              };
            }),
            askUser: "Multiple bank accounts hain — kaunse se payment karein?",
          };
        },
        injectInto: "AccountId",
        onFailure: "skip",
      },
    ],
  },

  // ── send_purchase_order: same as send_invoice pattern ──
  send_purchase_order: {
    maxChainDepth: 2,
    steps: [
      {
        tool: "get_purchase_order",
        condition: (wa) => !!wa.PurchaseOrderId && !wa.EmailAddress,
        extractArgs: (wa) => ({ PurchaseOrderId: wa.PurchaseOrderId }),
        extractField: "ContactId",
        injectInto: "__contactId",
        onFailure: "abort",
      },
      {
        tool: "get_contact",
        condition: (_wa, cd) => !!cd.__contactId && !_wa.EmailAddress,
        extractArgs: (_wa, cd) => ({ ContactId: cd.__contactId }),
        validate: (result) => {
          const items = extractItems(result);
          const contact = items[0] as Record<string, unknown> | undefined;
          const email = contact?.EmailAddress as string | undefined;
          if (!email) return { valid: false, missingField: "EmailAddress", askUser: "Vendor ka email nahi mila. Email batayein?" };
          return { valid: true, resolvedValue: email };
        },
        injectInto: "EmailAddress",
        onFailure: "ask_user",
      },
    ],
  },

  // ── create_journal_entry: no chain, but keep placeholder for balance check ──
  create_journal_entry: {
    maxChainDepth: 0,
    steps: [],
  },
};

// ─────────────────────────────────────────────────────────────
//  Chain Executor
// ─────────────────────────────────────────────────────────────

/** MCP caller interface — the chain engine doesn't own the MCP client */
export type MCPToolCaller = (toolName: string, args: Record<string, unknown>) => Promise<string>;

/**
 * Layer 2: Execute pre-requisite chain before a write tool.
 * Calls read tools via MCP to validate/enrich write args.
 * Returns enriched args or a block/ask-user instruction.
 */
export async function executePreRequisiteChain(
  reqId: string,
  toolName: string,
  writeArgs: Record<string, unknown>,
  callTool: MCPToolCaller,
  onStepEvent?: (step: { tool: string; status: string; durationMs: number; data?: unknown }) => void,
): Promise<PreReqChainResult> {
  const config = WRITE_TOOL_PREREQUISITES[toolName];
  if (!config || config.steps.length === 0) {
    return { passed: true, enrichedArgs: { ...writeArgs }, stepsExecuted: [] };
  }

  const enrichedArgs = { ...writeArgs };
  const chainData: Record<string, unknown> = {};
  const stepsExecuted: PreReqChainResult["stepsExecuted"] = [];
  const visited = new Set<string>();

  for (let i = 0; i < Math.min(config.steps.length, config.maxChainDepth || 3); i++) {
    const step = config.steps[i];

    // Prevent circular calls
    const stepKey = `${step.tool}:${JSON.stringify(step.extractArgs(enrichedArgs, chainData))}`;
    if (visited.has(stepKey)) {
      console.warn(`[${reqId}] PreReq chain: circular call detected for ${step.tool}, skipping`);
      stepsExecuted.push({ tool: step.tool, success: false, durationMs: 0, skipped: true });
      continue;
    }
    visited.add(stepKey);

    // Check condition
    if (step.condition && !step.condition(enrichedArgs, chainData)) {
      stepsExecuted.push({ tool: step.tool, success: true, durationMs: 0, skipped: true });
      continue;
    }

    const args = step.extractArgs(enrichedArgs, chainData);
    const start = Date.now();

    try {
      console.log(`[${reqId}] PreReq chain: calling ${step.tool} (step ${i + 1}/${config.steps.length})`);
      onStepEvent?.({ tool: step.tool, status: "executing", durationMs: 0 });

      const rawResult = await callTool(step.tool, args);
      const elapsed = Date.now() - start;
      const parsed = parseMcpResult(rawResult);

      // Extract field into chainData if specified
      if (step.extractField) {
        const items = extractItems(parsed);
        if (items.length > 0) {
          chainData[step.injectInto] = getField(items[0], step.extractField);
        }
      }

      // Run validation
      if (step.validate) {
        const vResult = step.validate(parsed, enrichedArgs);

        if (vResult.block) {
          onStepEvent?.({ tool: step.tool, status: "blocked", durationMs: elapsed, data: { reason: vResult.reason } });
          stepsExecuted.push({ tool: step.tool, success: false, durationMs: elapsed });
          return {
            passed: false,
            enrichedArgs,
            blocked: true,
            blockReason: vResult.reason,
            stepsExecuted,
          };
        }

        if (!vResult.valid) {
          onStepEvent?.({ tool: step.tool, status: "needs_input", durationMs: elapsed, data: { askUser: vResult.askUser } });
          stepsExecuted.push({ tool: step.tool, success: false, durationMs: elapsed });
          return {
            passed: false,
            enrichedArgs,
            askUser: vResult.askUser,
            mcqType: vResult.mcqType,
            mcqOptions: vResult.mcqOptions,
            missingField: vResult.missingField,
            stepsExecuted,
          };
        }

        // Inject resolved value into writeArgs (non-__ keys) or chainData (__ keys)
        if (vResult.resolvedValue !== undefined) {
          if (step.injectInto.startsWith("__")) {
            chainData[step.injectInto] = vResult.resolvedValue;
          } else {
            enrichedArgs[step.injectInto] = vResult.resolvedValue;
          }
        }
      }

      onStepEvent?.({ tool: step.tool, status: "passed", durationMs: elapsed });
      stepsExecuted.push({ tool: step.tool, success: true, durationMs: elapsed });

    } catch (err) {
      const elapsed = Date.now() - start;
      const failAction = step.onFailure || "abort";
      console.error(`[${reqId}] PreReq chain: ${step.tool} failed (${failAction}): ${err}`);
      onStepEvent?.({ tool: step.tool, status: "failed", durationMs: elapsed, data: { error: String(err) } });
      stepsExecuted.push({ tool: step.tool, success: false, durationMs: elapsed });

      if (failAction === "abort") {
        return {
          passed: false,
          enrichedArgs,
          blocked: true,
          blockReason: `Pre-requisite check failed: ${step.tool} — ${err}`,
          stepsExecuted,
        };
      }
      if (failAction === "ask_user") {
        return {
          passed: false,
          enrichedArgs,
          askUser: `${step.tool} call failed. Please provide the required information manually.`,
          stepsExecuted,
        };
      }
      // "skip" — continue to next step
    }
  }

  return { passed: true, enrichedArgs, stepsExecuted };
}

// ═══════════════════════════════════════════════════════════════
//  Write Tool Tracker (existing)
// ═══════════════════════════════════════════════════════════════

export interface WriteToolTracker {
  tool: string;
  args: Record<string, unknown>;
  success: boolean;
  result?: string;
  error?: string;
  attempts: number;
  validationErrors?: string[];
  preReqChainSteps?: PreReqChainResult["stepsExecuted"];
}

export function buildWriteToolSummary(trackers: WriteToolTracker[]): {
  totalWrites: number;
  successfulWrites: number;
  failedWrites: number;
  blockedWrites: number;
  details: WriteToolTracker[];
} {
  return {
    totalWrites: trackers.length,
    successfulWrites: trackers.filter(t => t.success).length,
    failedWrites: trackers.filter(t => !t.success && !t.validationErrors?.length).length,
    blockedWrites: trackers.filter(t => t.validationErrors && t.validationErrors.length > 0).length,
    details: trackers,
  };
}
