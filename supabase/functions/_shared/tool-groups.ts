// Tool Group Definitions — SINGLE SOURCE OF TRUTH
// Maps ACTUAL MCP tool names to categories for filtering
// Both cfo-agent-api and realtime-cfo-agent import from here

export interface ToolCategory {
  name: string;
  description: string;
  tools: string[]; // actual MCP tool names
  keywords: string[]; // query keywords that trigger this category
}

// ============================================================
// ACTUAL MCP TOOLS grouped by functional area
// These names match exactly what mcp.hellobooks.ai exposes
// ============================================================

export const TOOL_CATEGORIES: ToolCategory[] = [
  // ----- INVOICES / SALES -----
  {
    name: "invoices",
    description: "Sales invoices — list, search, view, create, update",
    tools: ["get_all_invoices", "get_invoice_by_id", "update_invoice", "find_invoice_document", "create_invoice", "create_invoice_line_item"],
    keywords: ["invoice", "invoices", "sales", "revenue", "billing", "billed", "sale", "create invoice", "new invoice", "raise invoice"],
  },
  // ----- BILLS / PURCHASES -----
  {
    name: "bills",
    description: "Vendor bills — list, search, view, create, update",
    tools: ["get_bills", "get_bill_by_id", "update_bill", "create_bill"],
    keywords: ["bill", "bills", "purchase", "purchases", "vendor bill", "payable", "payables", "ap", "create bill", "new bill"],
  },
  // ----- PAYMENTS -----
  {
    name: "payments",
    description: "Payments received and made — list, search, view, create, update",
    tools: ["get_all_payments", "get_payment_by_id", "update_payment", "find_payment_document", "create_payment"],
    keywords: ["payment", "payments", "paid", "pay", "received", "receipt", "collection", "collected", "create payment", "record payment"],
  },
  // ----- CUSTOMERS -----
  {
    name: "customers",
    description: "Customer management — list, view, create, update",
    tools: ["get_all_customers", "get_customer_by_id", "create_customer", "update_customer"],
    keywords: ["customer", "customers", "client", "clients", "buyer", "debtor", "debtors", "create customer", "add customer", "new customer"],
  },
  // ----- VENDORS -----
  {
    name: "vendors",
    description: "Vendor management — list, view, create, update",
    tools: ["get_all_vendors", "get_vendor_by_id", "create_vendor", "update_vendor"],
    keywords: ["vendor", "vendors", "supplier", "suppliers", "creditor", "creditors", "create vendor", "add vendor", "new vendor"],
  },
  // ----- CREDIT NOTES -----
  {
    name: "credit_notes",
    description: "Sales & purchase credit notes — list, search, view, update",
    tools: [
      "get_all_sales_credit_notes", "get_sales_credit_note_by_id", "update_sales_credit_note", "find_sales_credit_note_document",
      "get_all_purchase_credit_notes", "get_purchase_credit_note_by_id", "update_purchase_credit_note", "find_purchase_credit_note_document",
    ],
    keywords: ["credit note", "credit notes", "cn", "debit note", "return", "refund"],
  },
  // ----- CHART OF ACCOUNTS -----
  {
    name: "accounts",
    description: "Chart of accounts — list, view, update",
    tools: ["get_charts_of_accounts", "get_chart_of_accounts_by_id", "update_chart_of_accounts"],
    keywords: ["account", "accounts", "chart of accounts", "coa", "ledger", "gl", "general ledger"],
  },
  // ----- TRANSACTIONS / BANKING -----
  {
    name: "transactions",
    description: "Bank transactions — list, view, update, group, find transfers",
    tools: [
      "get_all_transactions", "get_transaction_by_id", "get_selected_transactions",
      "update_transactions", "get_grouped_transactions",
      "get_transaction_line_items", "update_transaction_line_item",
      "find_transfer_document",
    ],
    keywords: [
      "transaction", "transactions", "bank", "banking", "reconcil", "uncategorized",
      "categorize", "transfer", "debit", "credit", "statement",
    ],
  },
  // ----- AGING REPORTS -----
  {
    name: "aging_reports",
    description: "Aged receivables and payables reports",
    tools: ["get_aged_receivables_report", "get_aged_payables_report"],
    keywords: [
      "aging", "ageing", "aged", "overdue", "outstanding", "receivable", "receivables",
      "payable", "payables", "ar", "ap", "dso", "dpo", "collection",
    ],
  },
  // ----- DELIVERY CHALLANS -----
  {
    name: "delivery_challans",
    description: "Delivery challans — list, view, update",
    tools: ["get_all_delivery_challans", "get_delivery_challan_by_id", "update_delivery_challan"],
    keywords: ["challan", "challans", "delivery", "dispatch", "dc"],
  },
  // ----- ACCOUNT-PAYEE MAPPING -----
  {
    name: "account_payee",
    description: "Account-payee mappings",
    tools: ["get_account_by_payee_id", "get_all_accounts_by_payee"],
    keywords: ["payee", "mapping", "account mapping"],
  },
  // ----- USAGE TRACKING -----
  {
    name: "usage",
    description: "Track AI usage costs",
    tools: ["update_usage"],
    keywords: ["usage", "cost", "token"],
  },
  // ----- EXPENSES -----
  {
    name: "expenses",
    description: "Expense management — create, edit, list, categorize",
    tools: ["create_expense", "edit_expense", "delete_expense", "list_expenses", "categorize_expense", "list_expense_categories", "list_bank_accounts"],
    keywords: ["expense", "expenses", "spending", "expenditure", "kharcha"],
  },
  // ----- BANKING -----
  {
    name: "banking",
    description: "Bank statement import, transaction categorization, reconciliation",
    tools: ["import_bank_statement", "categorize_transaction", "match_transaction", "create_bank_rule", "list_bank_transactions", "list_bank_accounts", "reconcile_account", "get_bank_balance"],
    keywords: ["bank", "reconcile", "statement", "import", "bank transaction", "bank balance"],
  },
  // ----- INVENTORY -----
  {
    name: "inventory",
    description: "Product and stock management",
    tools: ["create_product", "edit_product", "adjust_stock", "list_products", "get_product", "stock_transfer", "list_warehouses", "stock_valuation"],
    keywords: ["stock", "warehouse", "product", "item", "sku", "inventory"],
  },
  // ----- JOURNAL ENTRIES -----
  {
    name: "journal",
    description: "Journal entries and chart of accounts",
    tools: ["create_journal_entry", "edit_journal_entry", "delete_journal_entry", "list_journal_entries", "get_chart_of_accounts", "list_accounts"],
    keywords: ["journal", "ledger", "day book", "journal entry"],
  },
  // ----- GST ACTIONS -----
  {
    name: "gst_actions",
    description: "GST filing, e-invoice, e-way bill, ITC reconciliation",
    tools: ["file_gstr1", "file_gstr3b", "generate_einvoice", "cancel_einvoice", "create_eway_bill", "reconcile_gst", "get_gst_summary", "list_hsn_codes", "validate_gstin"],
    keywords: ["gst", "gstr", "tax file", "einvoice", "eway", "hsn", "itc", "gst filing"],
  },
  // ----- P&L REPORTS -----
  {
    name: "reports_pnl",
    description: "Profit & Loss, revenue breakdown, expense breakdown, margins",
    tools: ["get_profit_loss", "get_revenue_breakdown", "get_expense_breakdown", "get_gross_margin", "get_operating_margin", "compare_periods"],
    keywords: ["p&l", "profit loss", "income statement", "revenue", "margin", "munafa", "profit"],
  },
  // ----- BALANCE SHEET REPORTS -----
  {
    name: "reports_balance",
    description: "Balance sheet and trial balance reports",
    tools: ["get_balance_sheet", "get_trial_balance", "get_chart_of_accounts"],
    keywords: ["balance sheet", "trial balance", "account balance"],
  },
  // ----- CASH FLOW REPORTS -----
  {
    name: "reports_cashflow",
    description: "Cash flow, liquidity, runway, burn rate analysis",
    tools: ["get_account_balance", "get_account_transactions", "get_cash_flow_statement", "get_bank_balance", "get_cash_position", "forecast_cash_flow", "list_bank_accounts"],
    keywords: ["cash flow", "cash position", "liquidity", "runway", "burn rate"],
  },
  // ----- PAYABLES REPORTS -----
  {
    name: "reports_payables",
    description: "AP aging, overdue bills, vendor balances, DPO",
    tools: ["get_ap_aging", "list_overdue_bills", "get_vendor_balance", "get_dpo", "list_vendors", "get_payment_schedule"],
    keywords: ["ap aging", "overdue bill", "dpo", "payment schedule"],
  },
  // ----- GST REPORTS -----
  {
    name: "reports_gst",
    description: "GST summary, GSTR data, ITC summary, HSN summary",
    tools: ["get_gst_summary", "get_gstr1_data", "get_gstr3b_data", "get_itc_summary", "get_hsn_summary", "get_gst_reconciliation"],
    keywords: ["gst summary", "gst report", "gstr data", "itc summary"],
  },
  // ----- KPI DASHBOARD -----
  {
    name: "kpi_dashboard",
    description: "Key performance indicators, dashboard overview, health snapshot",
    tools: ["get_revenue_kpi", "get_expense_kpi", "get_profit_kpi", "get_cashflow_kpi", "get_ar_kpi", "get_ap_kpi", "get_growth_rate", "get_runway"],
    keywords: ["kpi", "dashboard", "health", "overview", "summary", "snapshot"],
  },
  // ----- TRENDS & ANALYSIS -----
  {
    name: "trends_analysis",
    description: "Period comparisons, trend analysis, forecasting, anomaly detection",
    tools: ["compare_periods", "trend", "forecast", "anomaly_detection", "budget_vs_actual", "what_if_analysis", "get_profit_loss", "get_balance_sheet"],
    keywords: ["compare", "vs", "trend", "forecast", "anomaly", "budget", "what if", "analysis"],
  },
];

// ============================================================
// Helpers
// ============================================================

/**
 * Given a query and category (bookkeeper/cfo), returns the set of
 * actual MCP tool names that should be provided to the LLM.
 */
export function selectToolsForQuery(
  query: string,
  category: "bookkeeper" | "cfo",
  mcpTools?: Array<{ name: string; description: string; inputSchema: unknown }>,
): { toolNames: string[]; matchedCategories: string[]; strategy: string } {
  const queryLower = query.toLowerCase();

  const matchedCategories: string[] = [];

  for (const cat of TOOL_CATEGORIES) {
    for (const kw of cat.keywords) {
      if (queryLower.includes(kw)) {
        if (!matchedCategories.includes(cat.name)) {
          matchedCategories.push(cat.name);
        }
        break;
      }
    }
  }

  // If no specific match, provide broad defaults based on category
  if (matchedCategories.length === 0) {
    const defaultCategories = category === "bookkeeper"
      ? ["invoices", "bills", "payments", "transactions", "customers", "vendors"]
      : ["aging_reports", "reports_pnl", "reports_balance", "reports_cashflow", "kpi_dashboard", "invoices", "bills", "payments", "accounts"];

    if (category === "bookkeeper") {
      return {
        toolNames: resolveToolNames(defaultCategories, mcpTools),
        matchedCategories: defaultCategories,
        strategy: mcpTools?.length ? "default_bookkeeper_dynamic" : "default_bookkeeper",
      };
    } else {
      return {
        toolNames: resolveToolNames(defaultCategories, mcpTools),
        matchedCategories: defaultCategories,
        strategy: mcpTools?.length ? "default_cfo_dynamic" : "default_cfo",
      };
    }
  }

  // Add related categories for better context
  const expanded = [...matchedCategories];
  if (matchedCategories.includes("invoices") && !expanded.includes("customers")) expanded.push("customers");
  if (matchedCategories.includes("bills") && !expanded.includes("vendors")) expanded.push("vendors");
  if (matchedCategories.includes("aging_reports") && !expanded.includes("invoices")) expanded.push("invoices");
  if (matchedCategories.includes("aging_reports") && !expanded.includes("bills")) expanded.push("bills");
  if (matchedCategories.includes("payments") && !expanded.includes("invoices")) expanded.push("invoices");
  if (matchedCategories.includes("credit_notes") && !expanded.includes("invoices")) expanded.push("invoices");
  if (matchedCategories.includes("reports_pnl") && !expanded.includes("trends_analysis")) expanded.push("trends_analysis");
  if (matchedCategories.includes("reports_cashflow") && !expanded.includes("banking")) expanded.push("banking");
  if (matchedCategories.includes("reports_payables") && !expanded.includes("bills")) expanded.push("bills");
  if (matchedCategories.includes("reports_payables") && !expanded.includes("vendors")) expanded.push("vendors");
  if (matchedCategories.includes("gst_actions") && !expanded.includes("reports_gst")) expanded.push("reports_gst");
  if (matchedCategories.includes("expenses") && !expanded.includes("accounts")) expanded.push("accounts");
  if (matchedCategories.includes("inventory") && !expanded.includes("invoices")) expanded.push("invoices");

  const toolNames = resolveToolNames(expanded, mcpTools);

  return {
    toolNames,
    matchedCategories: expanded,
    strategy: mcpTools?.length ? "keyword_matched_dynamic" : "keyword_matched",
  };
}

function getAllToolNames(categoryNames: string[]): string[] {
  const names: string[] = [];
  for (const catName of categoryNames) {
    const cat = TOOL_CATEGORIES.find((c) => c.name === catName);
    if (cat) {
      for (const t of cat.tools) {
        if (!names.includes(t)) names.push(t);
      }
    }
  }
  return names;
}

function resolveToolNames(
  categoryNames: string[],
  mcpTools?: Array<{ name: string; description: string; inputSchema: unknown }>,
): string[] {
  const staticNames = getAllToolNames(categoryNames);
  if (!mcpTools || mcpTools.length === 0) return staticNames;

  const available = new Set(mcpTools.map(t => t.name));
  const matchedStatic = staticNames.filter(name => available.has(name));
  const dynamic = getDynamicToolNames(categoryNames, mcpTools);

  const merged: string[] = [];
  for (const name of [...matchedStatic, ...dynamic]) {
    if (!merged.includes(name)) merged.push(name);
  }

  // Final safety: if dynamic/static matching found nothing, fall back to all MCP tools.
  if (merged.length === 0) return mcpTools.map(t => t.name);
  return merged;
}

function getDynamicToolNames(
  categoryNames: string[],
  mcpTools: Array<{ name: string; description: string; inputSchema: unknown }>,
): string[] {
  const result: string[] = [];
  const stopWords = new Set([
    "and", "the", "for", "with", "from", "into", "over", "under", "this", "that",
    "list", "view", "show", "get", "all", "data", "report", "reports", "summary",
  ]);

  for (const catName of categoryNames) {
    const cat = TOOL_CATEGORIES.find(c => c.name === catName);
    if (!cat) continue;

    const nameHints = cat.name.toLowerCase().split(/[_\s]+/).filter(Boolean);
    const keywordHints = cat.keywords.map(k => k.toLowerCase()).filter(Boolean);
    const descHints = cat.description
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .filter(w => w.length >= 4 && !stopWords.has(w));

    for (const tool of mcpTools) {
      const text = `${tool.name} ${tool.description || ""}`.toLowerCase();
      let score = 0;

      for (const hint of keywordHints) {
        if (hint.length < 3) continue;
        if (text.includes(hint)) score += 3;
      }
      for (const hint of nameHints) {
        if (hint.length < 3) continue;
        if (text.includes(hint)) score += 2;
      }
      for (const hint of descHints) {
        if (text.includes(hint)) score += 1;
      }

      if (score >= 3 && !result.includes(tool.name)) result.push(tool.name);
    }
  }
  return result;
}

/**
 * Convert actual MCP tools (from listTools) into OpenAI function-calling format,
 * filtered to only the selected tool names.
 */
export function buildOpenAIToolsFromMcp(
  mcpTools: Array<{ name: string; description: string; inputSchema: unknown }>,
  selectedToolNames: string[],
): OpenAITool[] {
  const selected = new Set(selectedToolNames);
  return mcpTools
    .filter((t) => selected.has(t.name))
    .map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description || t.name,
        parameters: (t.inputSchema as Record<string, unknown>) || { type: "object", properties: {} },
      },
    }));
}

export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// ============================================================
// Follow-up Detection (Strategy 3)
// Short messages (<5 words) with conversation history reuse
// the previous tool group instead of re-classifying
// ============================================================

export interface FollowUpResult {
  isFollowUp: boolean;
  reuseToolGroup?: string[];
  reason?: string;
}

/**
 * Detect if a query is a follow-up to a previous conversation turn.
 * If so, returns the tool names from the last assistant message metadata.
 */
export function detectFollowUp(
  query: string,
  conversationHistory: { role: string; content: string; metadata?: { toolsUsed?: string[]; toolsLoaded?: string[] } }[],
): FollowUpResult {
  const words = query.trim().split(/\s+/);
  if (words.length >= 5) return { isFollowUp: false };
  if (conversationHistory.length < 2) return { isFollowUp: false };

  // Find the last assistant message with tool metadata
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const msg = conversationHistory[i];
    if ((msg.role === "assistant" || msg.role === "agent") && msg.metadata) {
      const tools = msg.metadata.toolsUsed || msg.metadata.toolsLoaded || [];
      if (tools.length > 0) {
        return {
          isFollowUp: true,
          reuseToolGroup: tools,
          reason: `Short follow-up (${words.length} words), reusing ${tools.length} tools from last turn`,
        };
      }
    }
  }

  return { isFollowUp: false };
}

// ============================================================
// Cache Invalidation Map — Targeted invalidation per write op
// ============================================================

export const CACHE_INVALIDATION_MAP: Record<string, string[]> = {
  // Invoice operations
  create_invoice: ["profit", "revenue", "aging", "receivable", "balance", "trial", "cash", "kpi"],
  update_invoice: ["profit", "revenue", "aging", "receivable", "balance", "trial", "cash", "kpi"],
  create_invoice_line_item: ["profit", "revenue", "balance", "trial"],
  // Bill operations
  create_bill: ["profit", "expense", "aging", "payable", "balance", "trial", "cash", "kpi"],
  update_bill: ["profit", "expense", "aging", "payable", "balance", "trial", "cash", "kpi"],
  // Payment operations
  create_payment: ["aging", "receivable", "payable", "balance", "cash", "bank", "kpi"],
  update_payment: ["aging", "receivable", "payable", "balance", "cash", "bank", "kpi"],
  record_payment: ["aging", "receivable", "payable", "balance", "cash", "bank", "kpi"],
  // Expense operations
  create_expense: ["profit", "expense", "balance", "trial", "cash", "kpi"],
  edit_expense: ["profit", "expense", "balance", "trial", "cash", "kpi"],
  delete_expense: ["profit", "expense", "balance", "trial", "cash", "kpi"],
  // Journal entries
  create_journal_entry: ["profit", "balance", "trial", "ledger"],
  edit_journal_entry: ["profit", "balance", "trial", "ledger"],
  delete_journal_entry: ["profit", "balance", "trial", "ledger"],
  // Banking
  import_bank_statement: ["bank", "cash", "balance", "reconcil"],
  categorize_transaction: ["bank", "cash", "balance", "reconcil"],
  match_transaction: ["bank", "cash", "balance", "reconcil"],
  update_transactions: ["bank", "cash", "balance", "reconcil"],
  update_transaction_line_item: ["bank", "cash", "balance"],
  // Customer/vendor
  create_customer: ["customer", "receivable"],
  update_customer: ["customer", "receivable"],
  create_vendor: ["vendor", "payable"],
  update_vendor: ["vendor", "payable"],
  // Credit notes
  update_sales_credit_note: ["receivable", "aging", "balance"],
  update_purchase_credit_note: ["payable", "aging", "balance"],
  // GST
  file_gstr1: ["gst", "tax", "itc", "filing"],
  file_gstr3b: ["gst", "tax", "itc", "filing"],
  generate_einvoice: ["gst", "invoice"],
  cancel_einvoice: ["gst", "invoice"],
  create_eway_bill: ["gst"],
  reconcile_gst: ["gst", "tax", "itc"],
  // Inventory
  create_product: ["inventory", "stock"],
  edit_product: ["inventory", "stock"],
  adjust_stock: ["inventory", "stock"],
  stock_transfer: ["inventory", "stock"],
};

/**
 * Get the cache path patterns that should be invalidated for a given set of tools.
 * Returns null to indicate "invalidate ALL" (safe fallback for unknown tools).
 */
export function getInvalidationTargets(toolsUsed: string[]): string[] | null {
  const targets = new Set<string>();
  let hasUnknown = false;

  for (const tool of toolsUsed) {
    if (!tool.startsWith("update_") && !tool.startsWith("create_") && !tool.startsWith("delete_") &&
        !tool.startsWith("edit_") && !tool.startsWith("file_") && !tool.startsWith("generate_") &&
        !tool.startsWith("cancel_") && !tool.startsWith("reconcile_") && !tool.startsWith("import_") &&
        !tool.startsWith("categorize_") && !tool.startsWith("match_") && !tool.startsWith("adjust_") &&
        !tool.startsWith("stock_") && !tool.startsWith("record_")) {
      continue; // not a write op
    }

    const patterns = CACHE_INVALIDATION_MAP[tool];
    if (patterns) {
      for (const p of patterns) targets.add(p);
    } else {
      hasUnknown = true;
    }
  }

  // If any unknown write op, invalidate everything (safe fallback)
  if (hasUnknown) return null;
  if (targets.size === 0) return [];
  return [...targets];
}
