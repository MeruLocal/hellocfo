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
    if (category === "bookkeeper") {
      return {
        toolNames: getAllToolNames(["invoices", "bills", "payments", "transactions", "customers", "vendors"]),
        matchedCategories: ["invoices", "bills", "payments", "transactions", "customers", "vendors"],
        strategy: "default_bookkeeper",
      };
    } else {
      return {
        toolNames: getAllToolNames(["aging_reports", "reports_pnl", "reports_balance", "reports_cashflow", "kpi_dashboard", "invoices", "bills", "payments", "accounts"]),
        matchedCategories: ["aging_reports", "reports_pnl", "reports_balance", "reports_cashflow", "kpi_dashboard", "invoices", "bills", "payments", "accounts"],
        strategy: "default_cfo",
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

  return {
    toolNames: getAllToolNames(expanded),
    matchedCategories: expanded,
    strategy: "keyword_matched",
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
