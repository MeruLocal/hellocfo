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
    keywords: [
      "invoice", "invoices", "sales", "revenue", "billing", "billed", "sale",
      "create invoice", "new invoice", "raise invoice",
      "discount", "discounted", "churn", "channel", "recurring revenue",
      "lifetime value", "clv", "acquisition", "fulfilment", "back order",
      "disputed", "partial payment", "advance received",
    ],
  },
  // ----- BILLS / PURCHASES -----
  {
    name: "bills",
    description: "Vendor bills — list, search, view, create, update",
    tools: ["get_bills", "get_bill_by_id", "update_bill", "create_bill"],
    keywords: [
      "bill", "bills", "purchase", "purchases", "vendor bill", "payable", "payables", "ap",
      "create bill", "new bill",
      "grn", "goods received", "three-way match", "price variance",
      "purchase order", "po", "blanket order", "spend concentration",
      "vendor contract", "sole source", "early payment discount",
    ],
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
  // ----- CHART OF ACCOUNTS / FIXED ASSETS -----
  {
    name: "accounts",
    description: "Chart of accounts, fixed assets, account hierarchy, inactive accounts, cost centers",
    tools: ["get_charts_of_accounts", "get_chart_of_accounts_by_id", "update_chart_of_accounts"],
    keywords: [
      "account", "accounts", "chart of accounts", "coa", "ledger", "gl", "general ledger",
      "fixed asset", "asset register", "depreciation", "book value", "net book value",
      "capital work", "cwip", "fully depreciated", "disposed asset", "asset addition",
      "it act depreciation", "companies act depreciation", "wdv", "slm",
      "inactive account", "dormant account", "cost center", "cost centre",
      "account hierarchy", "account balance", "party outstanding",
      "suspense account", "control account", "subsidiary ledger",
      "foreign currency ledger", "prepaid expense", "amortization",
      "lease agreement", "revaluation", "impairment loss",
      "asset tag", "physical verification", "useful life",
      "component depreciation", "insurance expiring", "maintenance cost",
      "zero balance", "unusual balance",
    ],
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
  // ----- EWAY BILLS -----
  {
    name: "eway_bills",
    description: "E-way bill generation, tracking, cancellation, extension, compliance",
    tools: [
      "create_eway_bill", "get_eway_bill", "cancel_eway_bill", "extend_eway_bill",
      "list_eway_bills", "get_eway_bill_summary", "update_eway_bill_vehicle",
    ],
    keywords: [
      "eway", "e-way", "eway bill", "e-way bill", "ewb",
      "eway expiring", "eway cancelled", "eway pending",
      "shipment", "transit", "transporter", "vehicle",
      "part-b", "part b", "consolidated eway",
    ],
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
  // ----- EXPENSES & EXPENSE CLAIMS -----
  {
    name: "expenses",
    description: "Expense management, expense claims — create, edit, list, categorize, approve, reimburse",
    tools: ["create_expense", "edit_expense", "delete_expense", "list_expenses", "categorize_expense", "list_expense_categories", "list_bank_accounts"],
    keywords: [
      "expense", "expenses", "spending", "expenditure", "kharcha",
      "claim", "claims", "expense claim", "reimbursement", "reimburse",
      "pending approval", "approved claim", "rejected claim", "policy limit",
      "employee claim", "processing time", "travel claim", "meal claim",
      "per diem", "mileage", "petty cash", "auto approved",
      "receipt missing", "receipt attached", "policy violation",
      "fuel expense", "client entertainment", "travel expense",
      "international travel", "department wise expense",
    ],
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
    keywords: [
      "stock", "warehouse", "product", "item", "sku", "inventory",
      "fifo", "weighted average", "dead stock", "slow moving", "expiry",
      "reorder", "safety stock", "eoq", "bin", "batch",
      "scrap", "wastage", "stock adjustment", "landed cost",
      "negative stock", "stock valuation", "turnover ratio",
    ],
  },
  // ----- JOURNAL ENTRIES -----
  {
    name: "journal",
    description: "Journal entries, chart of accounts, ledger, recurring entries, provisions, accruals",
    tools: ["create_journal_entry", "edit_journal_entry", "delete_journal_entry", "list_journal_entries", "get_chart_of_accounts", "list_accounts"],
    keywords: [
      "journal", "ledger", "day book", "journal entry",
      "unposted", "recurring entry", "provision", "accrual",
      "suspense", "inter-company", "year-end closing", "adjusting entry",
      "foreign currency revaluation", "period end", "unclosed period",
      "doubtful debt", "loan reconciliation", "credit card reconciliation",
      "narration", "high value transaction", "control total",
    ],
  },
  // ----- GST ACTIONS -----
  {
    name: "gst_actions",
    description: "GST filing, e-invoice, e-way bill, ITC reconciliation, TDS/TCS, compliance",
    tools: ["file_gstr1", "file_gstr3b", "generate_einvoice", "cancel_einvoice", "reconcile_gst", "get_gst_summary", "list_hsn_codes", "validate_gstin"],
    keywords: [
      "gst", "gstr", "tax file", "einvoice", "eway", "hsn", "itc", "gst filing",
      "reconciliation", "mismatch", "b2c", "b2b", "blocked", "payable", "export invoice",
      "compliance", "challan", "amendment", "tds", "tcs", "advance tax", "professional tax",
      "form 16", "form 26q", "form 24q", "form 15g", "form 15h", "section 194", "section 192",
      "tax return", "tax due", "tax calendar", "tax audit", "oltas",
      "net payable", "input credit", "reverse charge", "rcm",
      "nil rated", "exempt supply", "cdn", "place of supply",
      "gstr-9", "annual return", "late fee", "interest on gst",
      "form 26as", "pan verification", "lower deduction", "withholding",
      "mat", "minimum alternate tax", "deferred tax", "transfer pricing",
      "tds return", "tds challan", "tds default", "short deduction",
      "tds on salary", "brought forward loss", "effective tax rate",
    ],
  },
  // ----- P&L REPORTS -----
  {
    name: "reports_pnl",
    description: "Profit & Loss, revenue breakdown, expense breakdown, margins, EBITDA",
    tools: ["get_profit_loss", "get_revenue_breakdown", "get_expense_breakdown", "get_gross_margin", "get_operating_margin", "compare_periods"],
    keywords: [
      "p&l", "profit loss", "income statement", "revenue", "margin", "munafa", "profit",
      "ebitda", "gross margin", "operating margin", "net margin", "pbt", "net profit",
      "cost of goods", "gross profit", "income", "loss", "quarterly profit",
      "segment wise", "contribution margin", "common size", "common-size",
      "fund flow", "revenue recognition", "capex vs opex",
      "cogs breakdown", "expense by department",
    ],
  },
  // ----- BALANCE SHEET REPORTS -----
  {
    name: "reports_balance",
    description: "Balance sheet, trial balance, equity, borrowings",
    tools: ["get_balance_sheet", "get_trial_balance", "get_chart_of_accounts"],
    keywords: [
      "balance sheet", "trial balance", "account balance",
      "equity", "borrowings", "loan", "reserves", "retained earnings",
      "net worth", "total assets", "liabilities", "asset liability",
      "comparative balance", "year over year balance", "three year",
      "consolidated financials", "standalone financials",
    ],
  },
  // ----- CASH FLOW REPORTS -----
  {
    name: "reports_cashflow",
    description: "Cash flow, liquidity, runway, burn rate, operating cash flow",
    tools: ["get_account_balance", "get_account_transactions", "get_cash_flow_statement", "get_bank_balance", "get_cash_position", "forecast_cash_flow", "list_bank_accounts"],
    keywords: [
      "cash flow", "cash position", "liquidity", "runway", "burn rate",
      "operating cash", "free cash", "cash runway", "investing activities",
      "financing activities", "cash burn", "net cash",
      "cash conversion cycle", "fcf", "free cash flow",
      "monthly cash burn", "cash burn rate",
    ],
  },
  // ----- PAYABLES REPORTS -----
  {
    name: "reports_payables",
    description: "AP aging, overdue bills, vendor balances, DPO, payment schedule",
    tools: ["get_ap_aging", "list_overdue_bills", "get_vendor_balance", "get_dpo", "list_vendors", "get_payment_schedule"],
    keywords: [
      "ap aging", "overdue bill", "dpo", "payment schedule",
      "vendor aging", "bill aging", "payable aging", "vendor balance",
    ],
  },
  // ----- GST REPORTS -----
  {
    name: "reports_gst",
    description: "GST summary, GSTR data, ITC summary, HSN summary, reconciliation",
    tools: ["get_gst_summary", "get_gstr1_data", "get_gstr3b_data", "get_itc_summary", "get_hsn_summary", "get_gst_reconciliation"],
    keywords: [
      "gst summary", "gst report", "gstr data", "itc summary",
      "gst reconciliation", "gst mismatch", "itc blocked", "net gst",
      "hsn summary", "hsn wise", "b2c sales", "b2b", "export invoice",
      "gstr-2b", "gstr-2a", "itc reversal", "filing status", "auto populated",
      "nil return", "hsn purchase", "gstr-9 readiness", "itc utilization",
      "itc on capital", "reverse charge mechanism",
    ],
  },
  // ----- KPI DASHBOARD -----
  {
    name: "kpi_dashboard",
    description: "Key performance indicators, dashboard overview, health snapshot, financial ratios",
    tools: ["get_revenue_kpi", "get_expense_kpi", "get_profit_kpi", "get_cashflow_kpi", "get_ar_kpi", "get_ap_kpi", "get_growth_rate", "get_runway"],
    keywords: [
      "kpi", "dashboard", "health", "overview", "snapshot",
      "ratio", "current ratio", "quick ratio", "debt equity", "dso", "dpo",
      "ebitda", "pbt", "working capital", "financial ratio",
      "roe", "roi", "return on equity", "dupont",
      "altman", "z-score", "interest coverage", "operating leverage",
      "cash position snapshot", "scorecard",
    ],
  },
  // ----- TRENDS & ANALYSIS -----
  {
    name: "trends_analysis",
    description: "Period comparisons, trend analysis, forecasting, anomaly detection, budget vs actual",
    tools: ["compare_periods", "trend", "forecast", "anomaly_detection", "budget_vs_actual", "what_if_analysis", "get_profit_loss", "get_balance_sheet"],
    keywords: [
      "compare", "vs", "trend", "forecast", "anomaly", "budget", "what if", "analysis",
      "budget vs actual", "variance", "scenario", "projection", "runway",
      "break even", "break-even", "variance analysis",
      "capex vs opex", "year over year", "yoy",
      "quarter over quarter", "qoq", "month over month", "mom",
    ],
  },
];

// ============================================================
// Helpers
// ============================================================

/**
 * Given a query, returns the set of actual MCP tool names that should
 * be provided to the LLM. Category parameter is kept for backward
 * compat but ignored — all queries get the same unified tool selection.
 */
export function selectToolsForQuery(
  query: string,
  _category?: string,
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

  // If no specific match, provide broad defaults covering both transactional and analytical
  if (matchedCategories.length === 0) {
    const defaultCategories = [
      "invoices", "bills", "payments", "transactions", "customers", "vendors",
      "aging_reports", "reports_pnl", "reports_balance", "reports_cashflow", "kpi_dashboard", "accounts",
    ];

    return {
      toolNames: resolveToolNames(defaultCategories, mcpTools),
      matchedCategories: defaultCategories,
      strategy: mcpTools?.length ? "default_unified_dynamic" : "default_unified",
    };
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
  if (matchedCategories.includes("reports_gst") && !expanded.includes("gst_actions")) expanded.push("gst_actions");
  if (matchedCategories.includes("expenses") && !expanded.includes("accounts")) expanded.push("accounts");
  if (matchedCategories.includes("inventory") && !expanded.includes("invoices")) expanded.push("invoices");
  // Fixed assets always need journal for depreciation entries
  if (matchedCategories.includes("accounts") && queryLower.match(/depreciation|asset|cwip|fixed/)) {
    if (!expanded.includes("journal")) expanded.push("journal");
    if (!expanded.includes("reports_balance")) expanded.push("reports_balance");
  }
  // GST-related queries always benefit from invoice data
  if ((matchedCategories.includes("gst_actions") || matchedCategories.includes("reports_gst")) && !expanded.includes("invoices")) {
    expanded.push("invoices");
  }
  // Eway bill queries need invoice context and GST context
  if (matchedCategories.includes("eway_bills")) {
    if (!expanded.includes("invoices")) expanded.push("invoices");
    if (!expanded.includes("delivery_challans")) expanded.push("delivery_challans");
    if (!expanded.includes("gst_actions")) expanded.push("gst_actions");
  }
  // Tax compliance queries need both GST and P&L context
  if (queryLower.match(/advance tax|tax liability|tds|tcs|professional tax/)) {
    if (!expanded.includes("gst_actions")) expanded.push("gst_actions");
    if (!expanded.includes("reports_pnl")) expanded.push("reports_pnl");
  }
  // KPI / ratio queries include aging and cashflow
  if (matchedCategories.includes("kpi_dashboard")) {
    if (!expanded.includes("aging_reports")) expanded.push("aging_reports");
    if (!expanded.includes("reports_cashflow")) expanded.push("reports_cashflow");
  }
  // Expense claims benefit from accounts context for category mapping
  if (matchedCategories.includes("expenses") && queryLower.match(/department|per diem|travel|mileage|petty cash/)) {
    if (!expanded.includes("reports_pnl")) expanded.push("reports_pnl");
  }
  // Journal/accounting queries benefit from balance sheet context
  if (matchedCategories.includes("journal") && queryLower.match(/period end|year.?end|provision|doubtful|prepaid|amortiz/)) {
    if (!expanded.includes("reports_balance")) expanded.push("reports_balance");
    if (!expanded.includes("accounts")) expanded.push("accounts");
  }
  // P&L + Balance Sheet for comprehensive financial analysis
  if (matchedCategories.includes("reports_pnl") && queryLower.match(/segment|common.?size|contribution|fund flow|break.?even/)) {
    if (!expanded.includes("reports_balance")) expanded.push("reports_balance");
  }
  // Inventory queries with valuation need accounts context
  if (matchedCategories.includes("inventory") && queryLower.match(/valuation|holding cost|landed|write.?off|obsolescence|provision/)) {
    if (!expanded.includes("accounts")) expanded.push("accounts");
  }

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

  if (matchedStatic.length === 0) return [];
  return matchedStatic;
}

// ============================================================
// Hard Cap + Emergency Fallback + tool_registry DB Lookup
// ============================================================

export const HARD_CAP_TOOLS = 40;

export const EMERGENCY_FALLBACK_TOOLS = [
  'search_contacts', 'get_all_invoices', 'get_all_bills',
  'get_accounts', 'get_profit_and_loss', 'get_balance_sheet',
  'search_items', 'get_organisation',
];

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'and', 'but', 'or', 'if', 'while', 'because', 'until', 'about',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'i', 'me', 'my', 'mine', 'we', 'our', 'ours', 'you', 'your', 'yours',
  'he', 'him', 'his', 'she', 'her', 'hers', 'it', 'its', 'they', 'them',
  'their', 'theirs', 'show', 'get', 'give', 'tell', 'find', 'list',
  'please', 'want', 'know', 'see', 'look', 'make', 'let', 'help',
]);

export function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * Lookup tools from the tool_registry table via the match_tools_from_registry RPC.
 * Zero LLM cost, zero latency overhead — just a DB query.
 */
export async function lookupToolsFromRegistry(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: Array<{ tool_name: string; module: string; match_source: string }> | null; error: unknown }> },
  query: string,
  matchedCategories: string[],
  alreadySelected: string[],
  reqId: string,
): Promise<{ toolNames: string[]; strategy: string }> {
  try {
    const keywords = extractKeywords(query);
    if (matchedCategories.length === 0 && keywords.length === 0) {
      return { toolNames: [], strategy: 'registry_no_input' };
    }

    const { data, error } = await supabase.rpc('match_tools_from_registry', {
      p_modules: matchedCategories,
      p_keywords: keywords,
      p_exclude: alreadySelected,
      p_limit: 20,
    });

    if (error) {
      console.warn(`[${reqId}] tool_registry lookup error:`, error);
      return { toolNames: [], strategy: 'registry_error' };
    }

    const toolNames = (data || []).map((r: { tool_name: string }) => r.tool_name);
    console.log(`[${reqId}] tool_registry lookup: ${toolNames.length} tools from ${matchedCategories.length} modules + ${keywords.length} keywords`);
    return { toolNames, strategy: 'tool_registry_lookup' };
  } catch (err) {
    console.warn(`[${reqId}] tool_registry lookup exception:`, err);
    return { toolNames: [], strategy: 'registry_exception' };
  }
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
  reconcile_gst: ["gst", "tax", "itc"],
  // Inventory
  create_product: ["inventory", "stock"],
  edit_product: ["inventory", "stock"],
  adjust_stock: ["inventory", "stock"],
  stock_transfer: ["inventory", "stock"],
  // Eway bills
  create_eway_bill: ["gst", "eway", "invoice"],
  cancel_eway_bill: ["gst", "eway"],
  extend_eway_bill: ["gst", "eway"],
  update_eway_bill_vehicle: ["gst", "eway"],
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
