// Tool Group Definitions — Maps module-level "meta-tools" to underlying MCP tools
// These are the tools the LLM sees (not the raw 200+ MCP tools)

export interface ToolGroupAction {
  mcpTool: string;
  description: string;
}

export interface ToolGroup {
  name: string;
  description: string;
  actions: ToolGroupAction[];
}

// ============================================================
// BOOKKEEPER GROUP — 18 module tools for write/action operations
// ============================================================

export const BOOKKEEPER_TOOLS: ToolGroup[] = [
  {
    name: "manage_invoices",
    description: "Create, edit, delete, send, void, or clone invoices",
    actions: [
      { mcpTool: "create_invoice", description: "Create a new sales invoice" },
      { mcpTool: "edit_invoice", description: "Edit an existing invoice" },
      { mcpTool: "delete_invoice", description: "Delete an invoice" },
      { mcpTool: "send_invoice", description: "Send invoice via email" },
      { mcpTool: "void_invoice", description: "Void an invoice" },
      { mcpTool: "clone_invoice", description: "Clone/duplicate an invoice" },
    ],
  },
  {
    name: "manage_credit_notes",
    description: "Create, edit, delete, or apply credit notes",
    actions: [
      { mcpTool: "create_credit_note", description: "Create a credit note" },
      { mcpTool: "edit_credit_note", description: "Edit a credit note" },
      { mcpTool: "delete_credit_note", description: "Delete a credit note" },
      { mcpTool: "apply_credit_note", description: "Apply credit note to invoice" },
    ],
  },
  {
    name: "record_payments_received",
    description: "Record customer payments and advances",
    actions: [
      { mcpTool: "record_payment_received", description: "Record a payment received" },
      { mcpTool: "record_advance_payment", description: "Record an advance payment" },
      { mcpTool: "edit_payment_received", description: "Edit a received payment" },
      { mcpTool: "delete_payment_received", description: "Delete a received payment" },
    ],
  },
  {
    name: "manage_recurring_invoices",
    description: "Create, edit, stop, or resume recurring invoices",
    actions: [
      { mcpTool: "create_recurring_invoice", description: "Create a recurring invoice" },
      { mcpTool: "edit_recurring_invoice", description: "Edit a recurring invoice" },
      { mcpTool: "stop_recurring_invoice", description: "Stop a recurring invoice" },
      { mcpTool: "resume_recurring_invoice", description: "Resume a recurring invoice" },
    ],
  },
  {
    name: "send_reminders",
    description: "Send payment reminders to customers",
    actions: [
      { mcpTool: "send_payment_reminder", description: "Send reminder to one customer" },
      { mcpTool: "send_bulk_reminders", description: "Send reminders to multiple customers" },
    ],
  },
  {
    name: "manage_bills",
    description: "Create, edit, or delete vendor bills",
    actions: [
      { mcpTool: "create_bill", description: "Create a vendor bill" },
      { mcpTool: "edit_bill", description: "Edit a vendor bill" },
      { mcpTool: "delete_bill", description: "Delete a vendor bill" },
    ],
  },
  {
    name: "manage_purchase_orders",
    description: "Create, edit, delete POs, convert to bill, or create GRN",
    actions: [
      { mcpTool: "create_purchase_order", description: "Create a purchase order" },
      { mcpTool: "edit_purchase_order", description: "Edit a purchase order" },
      { mcpTool: "delete_purchase_order", description: "Delete a purchase order" },
      { mcpTool: "convert_po_to_bill", description: "Convert PO to bill" },
      { mcpTool: "create_grn", description: "Create goods received note" },
    ],
  },
  {
    name: "manage_vendor_credits",
    description: "Create, apply, or delete vendor credits",
    actions: [
      { mcpTool: "create_vendor_credit", description: "Create a vendor credit" },
      { mcpTool: "apply_vendor_credit", description: "Apply vendor credit to bill" },
      { mcpTool: "delete_vendor_credit", description: "Delete a vendor credit" },
    ],
  },
  {
    name: "record_payments_made",
    description: "Record vendor payments and advances",
    actions: [
      { mcpTool: "record_payment_made", description: "Record a payment made" },
      { mcpTool: "record_vendor_advance", description: "Record a vendor advance" },
      { mcpTool: "edit_payment_made", description: "Edit a payment made" },
      { mcpTool: "delete_payment_made", description: "Delete a payment made" },
    ],
  },
  {
    name: "manage_banking",
    description: "Import, categorize, match, reconcile bank transactions",
    actions: [
      { mcpTool: "import_bank_statement", description: "Import bank statement" },
      { mcpTool: "categorize_transaction", description: "Categorize a bank transaction" },
      { mcpTool: "split_transaction", description: "Split a bank transaction" },
      { mcpTool: "match_transaction", description: "Match transaction to record" },
      { mcpTool: "create_bank_rule", description: "Create a categorization rule" },
      { mcpTool: "fund_transfer", description: "Record a fund transfer" },
      { mcpTool: "mark_reconciled", description: "Mark transaction as reconciled" },
      { mcpTool: "undo_reconciliation", description: "Undo reconciliation" },
    ],
  },
  {
    name: "manage_contacts",
    description: "Create, edit, delete, merge, or import contacts",
    actions: [
      { mcpTool: "create_contact", description: "Create a contact" },
      { mcpTool: "edit_contact", description: "Edit a contact" },
      { mcpTool: "delete_contact", description: "Delete a contact" },
      { mcpTool: "merge_contacts", description: "Merge duplicate contacts" },
      { mcpTool: "import_contacts", description: "Import contacts from file" },
    ],
  },
  {
    name: "manage_inventory",
    description: "Create, edit, delete items, adjust stock, transfer, manage prices",
    actions: [
      { mcpTool: "create_item", description: "Create an inventory item" },
      { mcpTool: "edit_item", description: "Edit an inventory item" },
      { mcpTool: "delete_item", description: "Delete an inventory item" },
      { mcpTool: "adjust_stock", description: "Adjust stock levels" },
      { mcpTool: "transfer_stock", description: "Transfer stock between locations" },
      { mcpTool: "manage_price_list", description: "Manage price lists" },
      { mcpTool: "import_items", description: "Import items from file" },
    ],
  },
  {
    name: "manage_expenses",
    description: "Create, edit, delete expenses, attach receipts",
    actions: [
      { mcpTool: "create_expense", description: "Create an expense" },
      { mcpTool: "edit_expense", description: "Edit an expense" },
      { mcpTool: "delete_expense", description: "Delete an expense" },
      { mcpTool: "attach_receipt", description: "Attach receipt to expense" },
    ],
  },
  {
    name: "manage_journal_entries",
    description: "Create, edit, reverse, or delete journal entries",
    actions: [
      { mcpTool: "create_journal_entry", description: "Create a journal entry" },
      { mcpTool: "edit_journal_entry", description: "Edit a journal entry" },
      { mcpTool: "reverse_journal_entry", description: "Reverse a journal entry" },
      { mcpTool: "delete_journal_entry", description: "Delete a journal entry" },
    ],
  },
  {
    name: "manage_chart_of_accounts",
    description: "Create, edit, delete accounts, set opening balances",
    actions: [
      { mcpTool: "create_account", description: "Create a chart of accounts entry" },
      { mcpTool: "edit_account", description: "Edit an account" },
      { mcpTool: "delete_account", description: "Delete an account" },
      { mcpTool: "set_opening_balance", description: "Set account opening balance" },
    ],
  },
  {
    name: "gst_actions",
    description: "File GST returns, sync GSTR data, generate e-invoices, manage e-way bills",
    actions: [
      { mcpTool: "file_gstr1", description: "File GSTR-1 return" },
      { mcpTool: "sync_gstr2a", description: "Sync GSTR-2A data" },
      { mcpTool: "sync_gstr2b", description: "Sync GSTR-2B data" },
      { mcpTool: "run_gst_reconciliation", description: "Run GST reconciliation" },
      { mcpTool: "generate_einvoice", description: "Generate e-invoice" },
      { mcpTool: "cancel_einvoice", description: "Cancel e-invoice" },
      { mcpTool: "create_eway_bill", description: "Create e-way bill" },
      { mcpTool: "cancel_eway_bill", description: "Cancel e-way bill" },
    ],
  },
  {
    name: "bulk_operations",
    description: "Bulk import, categorize, approve, or send records",
    actions: [
      { mcpTool: "bulk_import", description: "Bulk import records" },
      { mcpTool: "bulk_categorize", description: "Bulk categorize records" },
      { mcpTool: "bulk_approve", description: "Bulk approve records" },
      { mcpTool: "bulk_send", description: "Bulk send documents" },
    ],
  },
  {
    name: "manage_settings",
    description: "Manage organization profile, tax rates, templates, payment terms, currencies",
    actions: [
      { mcpTool: "update_org_profile", description: "Update organization profile" },
      { mcpTool: "manage_tax_rates", description: "Manage tax rates" },
      { mcpTool: "manage_templates", description: "Manage document templates" },
      { mcpTool: "manage_payment_terms", description: "Manage payment terms" },
      { mcpTool: "manage_currencies", description: "Manage currencies" },
    ],
  },
];

// ============================================================
// CFO GROUP — 15 module tools for read/report operations
// ============================================================

export const CFO_TOOLS: ToolGroup[] = [
  {
    name: "financial_statements",
    description: "Get P&L, Balance Sheet, Trial Balance, or Cash Flow statements",
    actions: [
      { mcpTool: "get_profit_and_loss", description: "Get Profit & Loss report" },
      { mcpTool: "get_balance_sheet", description: "Get Balance Sheet" },
      { mcpTool: "get_trial_balance", description: "Get Trial Balance" },
      { mcpTool: "get_cash_flow_statement", description: "Get Cash Flow Statement" },
    ],
  },
  {
    name: "receivables_report",
    description: "AR aging, overdue invoices, customer outstanding, collection, DSO",
    actions: [
      { mcpTool: "get_ar_aging", description: "Get accounts receivable aging" },
      { mcpTool: "get_overdue_invoices", description: "Get overdue invoices" },
      { mcpTool: "get_customer_outstanding", description: "Get customer outstanding amounts" },
      { mcpTool: "get_collection_report", description: "Get collection report" },
      { mcpTool: "get_dso", description: "Get Days Sales Outstanding" },
    ],
  },
  {
    name: "payables_report",
    description: "AP aging, overdue bills, vendor outstanding, payment schedule, DPO",
    actions: [
      { mcpTool: "get_ap_aging", description: "Get accounts payable aging" },
      { mcpTool: "get_overdue_bills", description: "Get overdue bills" },
      { mcpTool: "get_vendor_outstanding", description: "Get vendor outstanding amounts" },
      { mcpTool: "get_payment_schedule", description: "Get payment schedule" },
      { mcpTool: "get_dpo", description: "Get Days Payable Outstanding" },
    ],
  },
  {
    name: "sales_insights",
    description: "Revenue trends, top customers, sales by item, invoice volume, growth rate",
    actions: [
      { mcpTool: "get_revenue_trend", description: "Get revenue trend analysis" },
      { mcpTool: "get_top_customers", description: "Get top customers by revenue" },
      { mcpTool: "get_sales_by_item", description: "Get sales breakdown by item" },
      { mcpTool: "get_invoice_volume", description: "Get invoice volume stats" },
      { mcpTool: "get_avg_invoice_value", description: "Get average invoice value" },
      { mcpTool: "get_growth_rate", description: "Get revenue growth rate" },
    ],
  },
  {
    name: "expense_insights",
    description: "Expense breakdown, trends, top categories, vendor spend, anomalies",
    actions: [
      { mcpTool: "get_expense_breakdown", description: "Get expense breakdown" },
      { mcpTool: "get_expense_trend", description: "Get expense trends" },
      { mcpTool: "get_top_expense_categories", description: "Get top expense categories" },
      { mcpTool: "get_vendor_spend", description: "Get vendor spend analysis" },
      { mcpTool: "get_expense_anomalies", description: "Detect expense anomalies" },
    ],
  },
  {
    name: "cash_flow_analysis",
    description: "Current cash position, forecast, burn rate, runway, inflow/outflow",
    actions: [
      { mcpTool: "get_cash_position", description: "Get current cash position" },
      { mcpTool: "get_cash_forecast", description: "Get cash flow forecast" },
      { mcpTool: "get_burn_rate", description: "Get burn rate" },
      { mcpTool: "get_runway", description: "Get cash runway" },
      { mcpTool: "get_inflow_outflow", description: "Get inflow vs outflow analysis" },
    ],
  },
  {
    name: "gst_reports",
    description: "GSTR1 summary, GSTR3B, ITC, HSN, reconciliation, filing status",
    actions: [
      { mcpTool: "get_gstr1_summary", description: "Get GSTR-1 summary" },
      { mcpTool: "get_gstr3b", description: "Get GSTR-3B data" },
      { mcpTool: "get_itc_report", description: "Get Input Tax Credit report" },
      { mcpTool: "get_hsn_summary", description: "Get HSN summary" },
      { mcpTool: "get_gst_reconciliation", description: "Get GST reconciliation report" },
      { mcpTool: "get_filing_status", description: "Get GST filing status" },
    ],
  },
  {
    name: "ledger_queries",
    description: "General ledger, day book, account balance, search transactions",
    actions: [
      { mcpTool: "get_general_ledger", description: "Get general ledger" },
      { mcpTool: "get_day_book", description: "Get day book entries" },
      { mcpTool: "get_account_balance", description: "Get account balance" },
      { mcpTool: "search_transactions", description: "Search transactions" },
    ],
  },
  {
    name: "contact_queries",
    description: "Customer/vendor statements, balances, history, lists",
    actions: [
      { mcpTool: "get_customer_statement", description: "Get customer statement" },
      { mcpTool: "get_vendor_statement", description: "Get vendor statement" },
      { mcpTool: "get_contact_balance", description: "Get contact balance" },
      { mcpTool: "get_contact_history", description: "Get contact history" },
      { mcpTool: "list_customers", description: "List all customers" },
      { mcpTool: "list_vendors", description: "List all vendors" },
    ],
  },
  {
    name: "inventory_queries",
    description: "Stock levels, low stock alerts, item movement, valuation, stock aging",
    actions: [
      { mcpTool: "get_stock_levels", description: "Get current stock levels" },
      { mcpTool: "get_low_stock", description: "Get low stock alerts" },
      { mcpTool: "get_item_movement", description: "Get item movement history" },
      { mcpTool: "get_stock_valuation", description: "Get stock valuation" },
      { mcpTool: "get_stock_aging", description: "Get stock aging report" },
    ],
  },
  {
    name: "banking_queries",
    description: "Bank balance, unreconciled transactions, reconciliation status, history",
    actions: [
      { mcpTool: "get_bank_balance", description: "Get bank balance" },
      { mcpTool: "get_unreconciled", description: "Get unreconciled transactions" },
      { mcpTool: "get_reconciliation_status", description: "Get reconciliation status" },
      { mcpTool: "get_bank_history", description: "Get bank transaction history" },
    ],
  },
  {
    name: "business_kpis",
    description: "Margins, working capital, current ratio, liquidity, efficiency, health score",
    actions: [
      { mcpTool: "get_margins", description: "Get profit margins" },
      { mcpTool: "get_working_capital", description: "Get working capital" },
      { mcpTool: "get_current_ratio", description: "Get current ratio" },
      { mcpTool: "get_liquidity_ratios", description: "Get liquidity ratios" },
      { mcpTool: "get_efficiency_ratios", description: "Get efficiency ratios" },
      { mcpTool: "get_health_score", description: "Get business health score" },
      { mcpTool: "get_budget_vs_actual", description: "Get budget vs actual" },
      { mcpTool: "get_all_kpis", description: "Get all KPIs at once" },
    ],
  },
  {
    name: "comparative_analysis",
    description: "Period comparison, entity comparison, YoY trend, seasonal analysis",
    actions: [
      { mcpTool: "compare_periods", description: "Compare two periods" },
      { mcpTool: "compare_entities", description: "Compare entities" },
      { mcpTool: "get_yoy_trend", description: "Get year-over-year trend" },
      { mcpTool: "get_seasonal_analysis", description: "Get seasonal analysis" },
    ],
  },
  {
    name: "tax_reports",
    description: "GST summary, tax liability, TDS, tax planning",
    actions: [
      { mcpTool: "get_gst_summary", description: "Get GST summary" },
      { mcpTool: "get_tax_liability", description: "Get tax liability" },
      { mcpTool: "get_tds_report", description: "Get TDS report" },
      { mcpTool: "get_tax_planning", description: "Get tax planning insights" },
    ],
  },
  {
    name: "ask_anything",
    description: "Open-ended financial question — use this when no specific report tool fits",
    actions: [
      { mcpTool: "ask_anything", description: "Free-form financial query" },
    ],
  },
];

// ============================================================
// Helper: Build OpenAI-format tools from a tool group
// ============================================================

export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Converts a ToolGroup[] into OpenAI function-calling tool definitions.
 * Each group becomes a single tool with an "action" enum parameter.
 */
export function buildOpenAITools(
  groups: ToolGroup[],
  availableMcpToolNames: Set<string>,
): OpenAITool[] {
  const tools: OpenAITool[] = groups
    .map((group) => {
      // Only include actions whose MCP tools actually exist on the server
      const validActions = group.actions.filter((a) =>
        availableMcpToolNames.has(a.mcpTool)
      );
      if (validActions.length === 0) return null;

      const actionDescriptions = validActions
        .map((a) => `- ${a.mcpTool}: ${a.description}`)
        .join("\n");

      const tool: OpenAITool = {
        type: "function",
        function: {
          name: group.name,
          description: `${group.description}\n\nAvailable actions:\n${actionDescriptions}`,
          parameters: {
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: validActions.map((a) => a.mcpTool),
                description: "Which specific action to perform",
              },
              parameters: {
                type: "object",
                description: "Parameters for the action (varies by action)",
                additionalProperties: true,
              },
            },
            required: ["action"],
          },
        },
      };
      return tool;
    })
    .filter(Boolean) as OpenAITool[];

  return tools;
}

/**
 * Given a meta-tool call (group name + action), returns the actual MCP tool name.
 */
export function resolveMetaToolToMcp(
  groupName: string,
  action: string,
  allGroups: ToolGroup[]
): string | null {
  const group = allGroups.find((g) => g.name === groupName);
  if (!group) return null;
  const match = group.actions.find((a) => a.mcpTool === action);
  return match?.mcpTool || null;
}

/**
 * Get all MCP tool names referenced by a set of tool groups.
 */
export function getAllMcpToolNames(groups: ToolGroup[]): string[] {
  return groups.flatMap((g) => g.actions.map((a) => a.mcpTool));
}
