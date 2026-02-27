// Write Tool Pre-flight Validator — Gap 7 (Phase 2B)
// Validates arguments before sending to MCP to prevent payment failures

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

  // Check for obviously empty args on create tools
  if (toolName.startsWith("create_") && Object.keys(args).length === 0) {
    errors.push("Cannot create a record with no parameters. At least one field is required.");
  }

  // Validate date formats if present
  const dateFields = ["Date", "DueDate", "date", "due_date", "PaymentDate"];
  for (const field of dateFields) {
    const val = args[field];
    if (val && typeof val === "string") {
      // Basic date format check
      if (!/^\d{4}-\d{2}-\d{2}/.test(val) && !/^\d{2}\/\d{2}\/\d{4}/.test(val)) {
        errors.push(`${field} should be a valid date format (YYYY-MM-DD or DD/MM/YYYY)`);
      }
    }
  }

  // Validate amounts are positive
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
 * Validate write tool arguments before sending to MCP.
 * Returns validation result with errors and sanitized args.
 */
export function validateWriteToolArgs(
  toolName: string,
  args: Record<string, unknown>,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Only validate write tools
  if (!/^(create|update|delete|void|cancel|extend|file|generate|import|adjust|record)_/.test(toolName)) {
    return { valid: true, errors: [], warnings: [] };
  }

  // Generic validations
  errors.push(...genericValidations(toolName, args));

  // Tool-specific validations
  const toolConfig = WRITE_TOOL_REQUIREMENTS[toolName];
  if (toolConfig) {
    // Check required fields
    for (const field of toolConfig.required) {
      if (args[field] === undefined || args[field] === null || args[field] === "") {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Run field-specific validators
    if (toolConfig.validators) {
      for (const [field, validator] of Object.entries(toolConfig.validators)) {
        const error = validator(args[field]);
        if (error) errors.push(error);
      }
    }
  }

  // Delete/void/cancel require confirmation context (warning only)
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

/**
 * Track write tool execution results for reverse guardrail.
 */
export interface WriteToolTracker {
  tool: string;
  args: Record<string, unknown>;
  success: boolean;
  result?: string;
  error?: string;
  attempts: number;
  validationErrors?: string[];
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
