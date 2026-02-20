// Tool Group Definitions — Maps ACTUAL MCP tool names to categories for filtering
// Instead of meta-tools, we pass real MCP tool definitions directly to the LLM

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
];

// ============================================================
// Helpers
// ============================================================

/**
 * Given a query and category (bookkeeper/cfo), returns the set of
 * actual MCP tool names that should be provided to the LLM.
 *
 * Strategy:
 * 1. Match query keywords against tool categories
 * 2. Include all tools from matched categories
 * 3. If no specific match, include a broad default set
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
      // Bookkeeper default: invoices, bills, payments, transactions
      return {
        toolNames: getAllToolNames(["invoices", "bills", "payments", "transactions", "customers", "vendors"]),
        matchedCategories: ["invoices", "bills", "payments", "transactions", "customers", "vendors"],
        strategy: "default_bookkeeper",
      };
    } else {
      // CFO default: aging reports, invoices, bills, payments, accounts
      return {
        toolNames: getAllToolNames(["aging_reports", "invoices", "bills", "payments", "accounts"]),
        matchedCategories: ["aging_reports", "invoices", "bills", "payments", "accounts"],
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
