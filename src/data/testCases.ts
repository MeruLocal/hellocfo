// ============================================================================
// CFO Agent - Pre-built Test Cases Library (516 cases)
// Organized by module categories for comprehensive testing
// ============================================================================

export interface TestCase {
  id: number;
  category: string;
  subCategory: string;
  prompt: string;
  expectedBehavior: string;
}

export const TEST_CASES: TestCase[] = [
  // ── Sales (15 cases) ──
  { id: 1, category: 'Sales', subCategory: 'Revenue', prompt: 'Show me top 10 customers by revenue this quarter', expectedBehavior: 'Returns ranked list of customers with revenue amounts for current quarter' },
  { id: 2, category: 'Sales', subCategory: 'Invoices', prompt: 'What are my pending sales invoices?', expectedBehavior: 'Lists all unpaid/partially paid sales invoices with amounts and due dates' },
  { id: 3, category: 'Sales', subCategory: 'Revenue', prompt: 'Compare this month sales with last month', expectedBehavior: 'Shows month-over-month sales comparison with percentage change' },
  { id: 4, category: 'Sales', subCategory: 'Invoices', prompt: 'Show overdue invoices older than 30 days', expectedBehavior: 'Filters and displays invoices past due by more than 30 days' },
  { id: 5, category: 'Sales', subCategory: 'Revenue', prompt: 'What is my total revenue YTD?', expectedBehavior: 'Calculates and displays year-to-date total revenue' },
  { id: 6, category: 'Sales', subCategory: 'Orders', prompt: 'List all sales orders created today', expectedBehavior: 'Shows sales orders created on current date with details' },
  { id: 7, category: 'Sales', subCategory: 'Revenue', prompt: 'Show revenue breakdown by product category', expectedBehavior: 'Displays revenue grouped by product/item categories' },
  { id: 8, category: 'Sales', subCategory: 'Invoices', prompt: 'How many invoices were raised last week?', expectedBehavior: 'Returns count and summary of invoices from previous week' },
  { id: 9, category: 'Sales', subCategory: 'Returns', prompt: 'Show me all credit notes issued this month', expectedBehavior: 'Lists credit notes/sales returns for current month' },
  { id: 10, category: 'Sales', subCategory: 'Revenue', prompt: 'What is the average invoice value this quarter?', expectedBehavior: 'Calculates mean invoice amount for current quarter' },
  { id: 11, category: 'Sales', subCategory: 'Customers', prompt: 'Which customers have not ordered in last 90 days?', expectedBehavior: 'Identifies inactive customers based on order history' },
  { id: 12, category: 'Sales', subCategory: 'Orders', prompt: 'Show pending sales orders not yet invoiced', expectedBehavior: 'Lists sales orders awaiting invoice generation' },
  { id: 13, category: 'Sales', subCategory: 'Revenue', prompt: 'Give me daily sales trend for this month', expectedBehavior: 'Shows day-by-day sales data with trend visualization' },
  { id: 14, category: 'Sales', subCategory: 'Payments', prompt: 'Show recent payment receipts from customers', expectedBehavior: 'Lists recent customer payments received with details' },
  { id: 15, category: 'Sales', subCategory: 'Revenue', prompt: 'What is my best selling item this year?', expectedBehavior: 'Identifies top product/item by sales volume or revenue' },

  // ── Purchases (14 cases) ──
  { id: 16, category: 'Purchases', subCategory: 'Vendors', prompt: 'List overdue vendor payments', expectedBehavior: 'Shows all vendor bills past their due date with amounts' },
  { id: 17, category: 'Purchases', subCategory: 'Orders', prompt: 'Show purchase order summary for last month', expectedBehavior: 'Summarizes POs created last month by count and value' },
  { id: 18, category: 'Purchases', subCategory: 'Bills', prompt: 'What bills are due this week?', expectedBehavior: 'Lists vendor bills with due dates in current week' },
  { id: 19, category: 'Purchases', subCategory: 'Vendors', prompt: 'Show top 5 vendors by purchase volume', expectedBehavior: 'Ranks vendors by total purchase amount' },
  { id: 20, category: 'Purchases', subCategory: 'Bills', prompt: 'How much do we owe to vendors in total?', expectedBehavior: 'Calculates total outstanding accounts payable' },
  { id: 21, category: 'Purchases', subCategory: 'Orders', prompt: 'Show purchase orders pending approval', expectedBehavior: 'Lists POs in pending/draft approval status' },
  { id: 22, category: 'Purchases', subCategory: 'Bills', prompt: 'Compare this month purchases with last month', expectedBehavior: 'Month-over-month purchase comparison with change %' },
  { id: 23, category: 'Purchases', subCategory: 'Returns', prompt: 'Show debit notes issued this quarter', expectedBehavior: 'Lists purchase returns/debit notes for current quarter' },
  { id: 24, category: 'Purchases', subCategory: 'Vendors', prompt: 'Which vendors have pending advances?', expectedBehavior: 'Shows vendors with unadjusted advance payments' },
  { id: 25, category: 'Purchases', subCategory: 'Bills', prompt: 'Show bills received but not yet paid', expectedBehavior: 'Lists unpaid vendor bills with aging info' },
  { id: 26, category: 'Purchases', subCategory: 'Orders', prompt: 'List purchase orders not yet received', expectedBehavior: 'Shows POs where goods/services not yet delivered' },
  { id: 27, category: 'Purchases', subCategory: 'Bills', prompt: 'What is our average payment cycle to vendors?', expectedBehavior: 'Calculates average days to pay vendor bills (DPO)' },
  { id: 28, category: 'Purchases', subCategory: 'Vendors', prompt: 'Show vendor-wise outstanding summary', expectedBehavior: 'Grouped summary of amounts owed per vendor' },
  { id: 29, category: 'Purchases', subCategory: 'Bills', prompt: 'List all recurring purchase bills', expectedBehavior: 'Shows bills set up as recurring entries' },

  // ── Inventory (13 cases) ──
  { id: 30, category: 'Inventory', subCategory: 'Stock Levels', prompt: 'What is the current stock level for all items?', expectedBehavior: 'Displays current quantity on hand for all inventory items' },
  { id: 31, category: 'Inventory', subCategory: 'Reorder', prompt: 'Show items below reorder level', expectedBehavior: 'Lists items where current stock is below reorder point' },
  { id: 32, category: 'Inventory', subCategory: 'Valuation', prompt: 'What is the total inventory valuation?', expectedBehavior: 'Calculates total value of all inventory on hand' },
  { id: 33, category: 'Inventory', subCategory: 'Movement', prompt: 'Show stock movement for last 30 days', expectedBehavior: 'Displays inward/outward stock transactions for past month' },
  { id: 34, category: 'Inventory', subCategory: 'Stock Levels', prompt: 'Which items have zero stock?', expectedBehavior: 'Lists all items with zero quantity on hand' },
  { id: 35, category: 'Inventory', subCategory: 'Aging', prompt: 'Show slow moving inventory items', expectedBehavior: 'Identifies items with no movement in specified period' },
  { id: 36, category: 'Inventory', subCategory: 'Valuation', prompt: 'Show item-wise stock valuation report', expectedBehavior: 'Detailed valuation per item with quantity and rate' },
  { id: 37, category: 'Inventory', subCategory: 'Movement', prompt: 'What items were received today?', expectedBehavior: 'Lists goods received entries for current date' },
  { id: 38, category: 'Inventory', subCategory: 'Stock Levels', prompt: 'Show warehouse-wise stock summary', expectedBehavior: 'Stock levels grouped by warehouse/location' },
  { id: 39, category: 'Inventory', subCategory: 'Reorder', prompt: 'Generate reorder suggestions based on consumption', expectedBehavior: 'Recommends reorder quantities based on usage patterns' },
  { id: 40, category: 'Inventory', subCategory: 'Movement', prompt: 'Show top 10 fast moving items this month', expectedBehavior: 'Ranks items by transaction volume in current month' },
  { id: 41, category: 'Inventory', subCategory: 'Aging', prompt: 'What is my dead stock value?', expectedBehavior: 'Calculates value of items with no movement for extended period' },
  { id: 42, category: 'Inventory', subCategory: 'Movement', prompt: 'Show stock transfer between warehouses this week', expectedBehavior: 'Lists inter-warehouse transfer entries for current week' },

  // ── GST (14 cases) ──
  { id: 43, category: 'GST', subCategory: 'GSTR-1', prompt: 'Calculate my GSTR-1 liability for this month', expectedBehavior: 'Computes outward supply tax liability for GSTR-1 filing' },
  { id: 44, category: 'GST', subCategory: 'Input Credit', prompt: 'Show GST input credit summary', expectedBehavior: 'Displays total ITC available with breakup by tax type' },
  { id: 45, category: 'GST', subCategory: 'GSTR-3B', prompt: 'Prepare GSTR-3B summary for this month', expectedBehavior: 'Generates GSTR-3B return summary with all sections' },
  { id: 46, category: 'GST', subCategory: 'Reconciliation', prompt: 'Show GSTR-2A vs books reconciliation', expectedBehavior: 'Compares vendor-reported data with purchase books' },
  { id: 47, category: 'GST', subCategory: 'GSTR-1', prompt: 'List B2B invoices for GST filing', expectedBehavior: 'Shows business-to-business invoices formatted for GSTR-1' },
  { id: 48, category: 'GST', subCategory: 'Input Credit', prompt: 'What is my ITC utilization this quarter?', expectedBehavior: 'Shows how input credit was used against output liability' },
  { id: 49, category: 'GST', subCategory: 'Compliance', prompt: 'Show pending GST returns to be filed', expectedBehavior: 'Lists GST returns due with filing deadlines' },
  { id: 50, category: 'GST', subCategory: 'HSN', prompt: 'Show HSN-wise sales summary', expectedBehavior: 'Sales data grouped by HSN/SAC codes for GSTR-1' },
  { id: 51, category: 'GST', subCategory: 'Reconciliation', prompt: 'Any mismatches in GST reconciliation?', expectedBehavior: 'Highlights discrepancies between filed returns and books' },
  { id: 52, category: 'GST', subCategory: 'GSTR-1', prompt: 'Show B2C sales for this month', expectedBehavior: 'Lists business-to-consumer sales for GSTR-1 filing' },
  { id: 53, category: 'GST', subCategory: 'Input Credit', prompt: 'Show blocked ITC items', expectedBehavior: 'Lists items where input credit is blocked under GST rules' },
  { id: 54, category: 'GST', subCategory: 'Compliance', prompt: 'What is my net GST payable this month?', expectedBehavior: 'Calculates net tax payable after ITC adjustment' },
  { id: 55, category: 'GST', subCategory: 'GSTR-1', prompt: 'Show export invoices for GST', expectedBehavior: 'Lists export invoices with shipping bill details' },
  { id: 56, category: 'GST', subCategory: 'Reconciliation', prompt: 'Compare GSTR-1 filed vs books', expectedBehavior: 'Reconciles filed GSTR-1 data with sales books' },

  // ── Taxes (12 cases) ──
  { id: 57, category: 'Taxes', subCategory: 'TDS', prompt: 'Show TDS deducted this quarter', expectedBehavior: 'Summarizes TDS deductions by section for current quarter' },
  { id: 58, category: 'Taxes', subCategory: 'TDS', prompt: 'List pending TDS payments', expectedBehavior: 'Shows TDS amounts deducted but not yet deposited' },
  { id: 59, category: 'Taxes', subCategory: 'TCS', prompt: 'Show TCS collected this month', expectedBehavior: 'Displays tax collected at source for current month' },
  { id: 60, category: 'Taxes', subCategory: 'Income Tax', prompt: 'What is my advance tax liability?', expectedBehavior: 'Estimates advance tax due based on projected income' },
  { id: 61, category: 'Taxes', subCategory: 'TDS', prompt: 'Show TDS certificate status for vendors', expectedBehavior: 'Lists Form 16A issuance status for vendor TDS' },
  { id: 62, category: 'Taxes', subCategory: 'Income Tax', prompt: 'Calculate estimated tax for this financial year', expectedBehavior: 'Projects total income tax based on current financials' },
  { id: 63, category: 'Taxes', subCategory: 'TDS', prompt: 'Show section-wise TDS summary', expectedBehavior: 'TDS breakup by section (194A, 194C, etc.)' },
  { id: 64, category: 'Taxes', subCategory: 'Compliance', prompt: 'What tax returns are due this month?', expectedBehavior: 'Lists upcoming tax filing deadlines' },
  { id: 65, category: 'Taxes', subCategory: 'TDS', prompt: 'Show TDS receivable from customers', expectedBehavior: 'Displays TDS deducted by customers on our invoices' },
  { id: 66, category: 'Taxes', subCategory: 'Professional Tax', prompt: 'Show professional tax liability', expectedBehavior: 'Calculates professional tax payable for employees' },
  { id: 67, category: 'Taxes', subCategory: 'TDS', prompt: 'Generate Form 26Q data for this quarter', expectedBehavior: 'Prepares TDS return data for non-salary deductions' },
  { id: 68, category: 'Taxes', subCategory: 'Compliance', prompt: 'Show tax compliance calendar for next month', expectedBehavior: 'Lists all tax-related deadlines for next month' },

  // ── Fixed Assets (10 cases) ──
  { id: 69, category: 'Fixed Assets', subCategory: 'Register', prompt: 'Show complete fixed asset register', expectedBehavior: 'Displays all fixed assets with cost, depreciation, and book value' },
  { id: 70, category: 'Fixed Assets', subCategory: 'Depreciation', prompt: 'Calculate depreciation for this month', expectedBehavior: 'Computes monthly depreciation for all assets' },
  { id: 71, category: 'Fixed Assets', subCategory: 'Register', prompt: 'What is the total book value of all assets?', expectedBehavior: 'Sums net book value across all fixed assets' },
  { id: 72, category: 'Fixed Assets', subCategory: 'Additions', prompt: 'Show assets added this financial year', expectedBehavior: 'Lists new asset additions with capitalization dates' },
  { id: 73, category: 'Fixed Assets', subCategory: 'Depreciation', prompt: 'Show depreciation schedule for next quarter', expectedBehavior: 'Projects depreciation charges for upcoming quarter' },
  { id: 74, category: 'Fixed Assets', subCategory: 'Disposal', prompt: 'List assets disposed this year', expectedBehavior: 'Shows assets sold/scrapped with gain/loss on disposal' },
  { id: 75, category: 'Fixed Assets', subCategory: 'Register', prompt: 'Show category-wise asset summary', expectedBehavior: 'Assets grouped by category (furniture, vehicles, etc.)' },
  { id: 76, category: 'Fixed Assets', subCategory: 'Depreciation', prompt: 'Compare IT Act vs Companies Act depreciation', expectedBehavior: 'Shows depreciation under both methods side by side' },
  { id: 77, category: 'Fixed Assets', subCategory: 'Register', prompt: 'Which assets are fully depreciated?', expectedBehavior: 'Lists assets where book value has reached zero/salvage value' },
  { id: 78, category: 'Fixed Assets', subCategory: 'Additions', prompt: 'Show capital work in progress items', expectedBehavior: 'Lists assets under construction not yet capitalized' },

  // ── Expense Claims (10 cases) ──
  { id: 79, category: 'Expense Claims', subCategory: 'Pending', prompt: 'Show all pending expense claims', expectedBehavior: 'Lists expense claims awaiting approval' },
  { id: 80, category: 'Expense Claims', subCategory: 'Summary', prompt: 'What is total expense claims this month?', expectedBehavior: 'Summarizes total claimed amount for current month' },
  { id: 81, category: 'Expense Claims', subCategory: 'Approval', prompt: 'How many claims are pending my approval?', expectedBehavior: 'Shows count and details of claims in approver queue' },
  { id: 82, category: 'Expense Claims', subCategory: 'Summary', prompt: 'Show employee-wise expense summary', expectedBehavior: 'Expense claims grouped by employee with totals' },
  { id: 83, category: 'Expense Claims', subCategory: 'Category', prompt: 'Show expense breakdown by category', expectedBehavior: 'Claims grouped by expense type (travel, meals, etc.)' },
  { id: 84, category: 'Expense Claims', subCategory: 'Reimbursement', prompt: 'List claims approved but not reimbursed', expectedBehavior: 'Shows approved claims pending payment' },
  { id: 85, category: 'Expense Claims', subCategory: 'Policy', prompt: 'Show claims exceeding policy limits', expectedBehavior: 'Flags claims that exceed defined expense policy thresholds' },
  { id: 86, category: 'Expense Claims', subCategory: 'Summary', prompt: 'Compare expense claims this quarter vs last', expectedBehavior: 'Quarter-over-quarter expense claim comparison' },
  { id: 87, category: 'Expense Claims', subCategory: 'Pending', prompt: 'Show rejected expense claims this month', expectedBehavior: 'Lists claims that were rejected with reasons' },
  { id: 88, category: 'Expense Claims', subCategory: 'Reimbursement', prompt: 'What is the average claim processing time?', expectedBehavior: 'Calculates average days from submission to reimbursement' },

  // ── Reports (15 cases) ──
  { id: 89, category: 'Reports', subCategory: 'P&L', prompt: 'Generate profit and loss statement for Q3', expectedBehavior: 'Creates P&L statement for the specified quarter' },
  { id: 90, category: 'Reports', subCategory: 'Cash Flow', prompt: 'Show cash flow summary', expectedBehavior: 'Displays cash flow from operations, investing, financing' },
  { id: 91, category: 'Reports', subCategory: 'Balance Sheet', prompt: 'Show balance sheet as of today', expectedBehavior: 'Generates balance sheet with assets, liabilities, equity' },
  { id: 92, category: 'Reports', subCategory: 'P&L', prompt: 'Show monthly P&L comparison for this year', expectedBehavior: 'Month-by-month P&L comparison for current FY' },
  { id: 93, category: 'Reports', subCategory: 'Receivables', prompt: 'Show accounts receivable aging report', expectedBehavior: 'AR aging buckets (current, 30, 60, 90+ days)' },
  { id: 94, category: 'Reports', subCategory: 'Payables', prompt: 'Show accounts payable aging report', expectedBehavior: 'AP aging buckets with vendor-wise breakup' },
  { id: 95, category: 'Reports', subCategory: 'Trial Balance', prompt: 'Generate trial balance for this month', expectedBehavior: 'Lists all accounts with debit/credit balances' },
  { id: 96, category: 'Reports', subCategory: 'Cash Flow', prompt: 'What is my operating cash flow this quarter?', expectedBehavior: 'Calculates cash generated from core operations' },
  { id: 97, category: 'Reports', subCategory: 'Ratios', prompt: 'Show key financial ratios', expectedBehavior: 'Displays current ratio, quick ratio, debt-equity, etc.' },
  { id: 98, category: 'Reports', subCategory: 'P&L', prompt: 'Show gross margin trend for last 6 months', expectedBehavior: 'Gross profit margin percentage month over month' },
  { id: 99, category: 'Reports', subCategory: 'Budget', prompt: 'Show budget vs actual comparison', expectedBehavior: 'Compares budgeted amounts with actual spend by category' },
  { id: 100, category: 'Reports', subCategory: 'Cash Flow', prompt: 'Show cash runway analysis', expectedBehavior: 'Estimates how long current cash will last at burn rate' },
  { id: 101, category: 'Reports', subCategory: 'P&L', prompt: 'What is my EBITDA this quarter?', expectedBehavior: 'Calculates earnings before interest, tax, depreciation' },
  { id: 102, category: 'Reports', subCategory: 'Receivables', prompt: 'What is our DSO (Days Sales Outstanding)?', expectedBehavior: 'Calculates average collection period' },
  { id: 103, category: 'Reports', subCategory: 'Custom', prompt: 'Show expense summary by department', expectedBehavior: 'Expenses grouped by cost center/department' },

  // ── Accounting Masters (11 cases) ──
  { id: 104, category: 'Accounting Masters', subCategory: 'Chart of Accounts', prompt: 'Show chart of accounts', expectedBehavior: 'Displays complete account hierarchy' },
  { id: 105, category: 'Accounting Masters', subCategory: 'Ledger', prompt: 'Show ledger for cash account this month', expectedBehavior: 'Displays all entries in cash account for current month' },
  { id: 106, category: 'Accounting Masters', subCategory: 'Journal', prompt: 'List journal entries for today', expectedBehavior: 'Shows manual journal entries posted today' },
  { id: 107, category: 'Accounting Masters', subCategory: 'Chart of Accounts', prompt: 'How many accounts are there in total?', expectedBehavior: 'Returns count of all accounts in chart of accounts' },
  { id: 108, category: 'Accounting Masters', subCategory: 'Ledger', prompt: 'Show bank reconciliation status', expectedBehavior: 'Displays reconciled vs unreconciled bank entries' },
  { id: 109, category: 'Accounting Masters', subCategory: 'Journal', prompt: 'Show unposted journal entries', expectedBehavior: 'Lists draft/unposted JVs pending approval' },
  { id: 110, category: 'Accounting Masters', subCategory: 'Cost Center', prompt: 'Show cost center wise profitability', expectedBehavior: 'P&L breakup by cost center' },
  { id: 111, category: 'Accounting Masters', subCategory: 'Ledger', prompt: 'Show bank balance across all accounts', expectedBehavior: 'Displays balance for each bank account' },
  { id: 112, category: 'Accounting Masters', subCategory: 'Chart of Accounts', prompt: 'Show inactive accounts', expectedBehavior: 'Lists accounts marked as inactive/disabled' },
  { id: 113, category: 'Accounting Masters', subCategory: 'Journal', prompt: 'Show recurring journal entry templates', expectedBehavior: 'Lists predefined recurring JV templates' },
  { id: 114, category: 'Accounting Masters', subCategory: 'Ledger', prompt: 'Show party-wise outstanding balance', expectedBehavior: 'Customer and vendor outstanding balances summary' },

  // ── Eway Bills (10 cases) ──
  { id: 115, category: 'Eway Bills', subCategory: 'Generation', prompt: 'Generate eway bill for invoice INV-001', expectedBehavior: 'Creates eway bill for the specified invoice' },
  { id: 116, category: 'Eway Bills', subCategory: 'Pending', prompt: 'Show invoices without eway bills', expectedBehavior: 'Lists invoices requiring eway bills that are not yet generated' },
  { id: 117, category: 'Eway Bills', subCategory: 'Expiring', prompt: 'Show eway bills expiring today', expectedBehavior: 'Lists eway bills with validity ending today' },
  { id: 118, category: 'Eway Bills', subCategory: 'Summary', prompt: 'Show eway bill summary for this month', expectedBehavior: 'Monthly summary of generated, cancelled, extended eway bills' },
  { id: 119, category: 'Eway Bills', subCategory: 'Generation', prompt: 'How many eway bills were generated this week?', expectedBehavior: 'Count of eway bills created in current week' },
  { id: 120, category: 'Eway Bills', subCategory: 'Cancelled', prompt: 'Show cancelled eway bills this month', expectedBehavior: 'Lists eway bills that were cancelled with reasons' },
  { id: 121, category: 'Eway Bills', subCategory: 'Pending', prompt: 'List shipments pending eway bill generation', expectedBehavior: 'Shows dispatches awaiting eway bill creation' },
  { id: 122, category: 'Eway Bills', subCategory: 'Expiring', prompt: 'Show eway bills expiring in next 2 days', expectedBehavior: 'Lists eway bills nearing expiry for extension' },
  { id: 123, category: 'Eway Bills', subCategory: 'Summary', prompt: 'Show state-wise eway bill summary', expectedBehavior: 'Eway bills grouped by destination state' },
  { id: 124, category: 'Eway Bills', subCategory: 'Generation', prompt: 'Show eway bill details for EWB-12345', expectedBehavior: 'Displays full details of specific eway bill' },

  // ── Drive (10 cases) ──
  { id: 125, category: 'Drive', subCategory: 'Files', prompt: 'Show all files uploaded today', expectedBehavior: 'Lists documents uploaded on current date' },
  { id: 126, category: 'Drive', subCategory: 'Storage', prompt: 'How much storage have we used?', expectedBehavior: 'Shows total storage consumption and available space' },
  { id: 127, category: 'Drive', subCategory: 'Files', prompt: 'Find invoices uploaded last month', expectedBehavior: 'Searches for invoice-related files from previous month' },
  { id: 128, category: 'Drive', subCategory: 'Shared', prompt: 'Show files shared with me', expectedBehavior: 'Lists documents shared by other users' },
  { id: 129, category: 'Drive', subCategory: 'Files', prompt: 'Show recently accessed documents', expectedBehavior: 'Lists files by last access time' },
  { id: 130, category: 'Drive', subCategory: 'Storage', prompt: 'Show storage usage by file type', expectedBehavior: 'Storage breakdown by document type (PDF, Excel, etc.)' },
  { id: 131, category: 'Drive', subCategory: 'Files', prompt: 'Search for documents related to vendor ABC', expectedBehavior: 'Finds files associated with specified vendor' },
  { id: 132, category: 'Drive', subCategory: 'Shared', prompt: 'Who has access to financial reports folder?', expectedBehavior: 'Shows permissions for the specified folder' },
  { id: 133, category: 'Drive', subCategory: 'Files', prompt: 'Show duplicate files in drive', expectedBehavior: 'Identifies duplicate documents by name or hash' },
  { id: 134, category: 'Drive', subCategory: 'Storage', prompt: 'Show files larger than 10MB', expectedBehavior: 'Lists large files consuming significant storage' },

  // ── Comments (8 cases) ──
  { id: 135, category: 'Comments', subCategory: 'Recent', prompt: 'Show all comments on my invoices', expectedBehavior: 'Lists comments/notes attached to user invoices' },
  { id: 136, category: 'Comments', subCategory: 'Mentions', prompt: 'Show comments where I am mentioned', expectedBehavior: 'Filters comments with @mentions of current user' },
  { id: 137, category: 'Comments', subCategory: 'Recent', prompt: 'Show unread comments', expectedBehavior: 'Lists comments not yet viewed by current user' },
  { id: 138, category: 'Comments', subCategory: 'Activity', prompt: 'Show comment activity for this week', expectedBehavior: 'Summary of comments added across all documents this week' },
  { id: 139, category: 'Comments', subCategory: 'Mentions', prompt: 'Show comments I need to respond to', expectedBehavior: 'Lists comments requiring user action/response' },
  { id: 140, category: 'Comments', subCategory: 'Recent', prompt: 'Show comments on purchase orders', expectedBehavior: 'Lists all comments attached to PO documents' },
  { id: 141, category: 'Comments', subCategory: 'Activity', prompt: 'Who commented the most this month?', expectedBehavior: 'Ranks users by comment count for current month' },
  { id: 142, category: 'Comments', subCategory: 'Recent', prompt: 'Show resolved comments this week', expectedBehavior: 'Lists comments marked as resolved in current week' },

  // ── Task Management (12 cases) ──
  { id: 143, category: 'Task Management', subCategory: 'My Tasks', prompt: 'Show my pending tasks', expectedBehavior: 'Lists all tasks assigned to current user that are incomplete' },
  { id: 144, category: 'Task Management', subCategory: 'Overdue', prompt: 'How many overdue tasks do I have?', expectedBehavior: 'Counts tasks past their due date' },
  { id: 145, category: 'Task Management', subCategory: 'Team', prompt: 'Show team task summary', expectedBehavior: 'Overview of task status across all team members' },
  { id: 146, category: 'Task Management', subCategory: 'My Tasks', prompt: 'What tasks are due this week?', expectedBehavior: 'Lists tasks with due dates in current week' },
  { id: 147, category: 'Task Management', subCategory: 'Completed', prompt: 'Show tasks I completed this month', expectedBehavior: 'Lists tasks marked done in current month by user' },
  { id: 148, category: 'Task Management', subCategory: 'Team', prompt: 'Who has the most open tasks?', expectedBehavior: 'Ranks team members by number of pending tasks' },
  { id: 149, category: 'Task Management', subCategory: 'Overdue', prompt: 'Show high priority overdue tasks', expectedBehavior: 'Filters overdue tasks that are marked high priority' },
  { id: 150, category: 'Task Management', subCategory: 'My Tasks', prompt: 'Show tasks linked to sales invoices', expectedBehavior: 'Lists tasks associated with sales invoice documents' },
  { id: 151, category: 'Task Management', subCategory: 'Team', prompt: 'Show task completion rate this month', expectedBehavior: 'Percentage of tasks completed vs total assigned' },
  { id: 152, category: 'Task Management', subCategory: 'My Tasks', prompt: 'Create a task to follow up on invoice INV-042', expectedBehavior: 'Creates a new follow-up task linked to the invoice' },
  { id: 153, category: 'Task Management', subCategory: 'Completed', prompt: 'Show task activity log for today', expectedBehavior: 'Lists all task updates and status changes today' },
  { id: 154, category: 'Task Management', subCategory: 'Overdue', prompt: 'Show tasks pending for more than 7 days', expectedBehavior: 'Lists tasks open longer than a week' },

  // ── Your Workspace (12 cases) ──
  { id: 155, category: 'Your Workspace', subCategory: 'Dashboard', prompt: 'Show my dashboard summary', expectedBehavior: 'Displays personalized dashboard with key metrics' },
  { id: 156, category: 'Your Workspace', subCategory: 'Notifications', prompt: 'Show my unread notifications', expectedBehavior: 'Lists all unread notifications for current user' },
  { id: 157, category: 'Your Workspace', subCategory: 'Activity', prompt: 'Show my recent activity', expectedBehavior: 'Displays user activity log with recent actions' },
  { id: 158, category: 'Your Workspace', subCategory: 'Favorites', prompt: 'Show my bookmarked reports', expectedBehavior: 'Lists reports saved as favorites by user' },
  { id: 159, category: 'Your Workspace', subCategory: 'Dashboard', prompt: 'Show pending items requiring my action', expectedBehavior: 'Aggregates all items needing user attention' },
  { id: 160, category: 'Your Workspace', subCategory: 'Settings', prompt: 'Show my notification preferences', expectedBehavior: 'Displays current notification configuration' },
  { id: 161, category: 'Your Workspace', subCategory: 'Activity', prompt: 'Show documents I modified this week', expectedBehavior: 'Lists documents edited by user in current week' },
  { id: 162, category: 'Your Workspace', subCategory: 'Dashboard', prompt: 'What are my KPIs for this month?', expectedBehavior: 'Shows key performance indicators assigned to user' },
  { id: 163, category: 'Your Workspace', subCategory: 'Favorites', prompt: 'Show my saved searches', expectedBehavior: 'Lists previously saved search queries' },
  { id: 164, category: 'Your Workspace', subCategory: 'Settings', prompt: 'Show my role and permissions', expectedBehavior: 'Displays current user role and access permissions' },
  { id: 165, category: 'Your Workspace', subCategory: 'Activity', prompt: 'Show login history for my account', expectedBehavior: 'Displays recent login timestamps and devices' },
  { id: 166, category: 'Your Workspace', subCategory: 'Dashboard', prompt: 'Show quick summary of today', expectedBehavior: 'Today overview: invoices, payments, tasks, notifications' },

  // ══════════════════════════════════════════════════════════════════════
  // ADDITIONAL 150 TEST CASES (IDs 167–316)
  // ══════════════════════════════════════════════════════════════════════

  // ── Sales (12 more) ──
  { id: 167, category: 'Sales', subCategory: 'Discounts', prompt: 'Show total discounts given this month', expectedBehavior: 'Sums all discount amounts applied on sales invoices this month' },
  { id: 168, category: 'Sales', subCategory: 'Customers', prompt: 'Which customer has the highest outstanding balance?', expectedBehavior: 'Identifies customer with largest unpaid receivable' },
  { id: 169, category: 'Sales', subCategory: 'Revenue', prompt: 'Show region-wise sales breakdown', expectedBehavior: 'Displays sales grouped by geographic region' },
  { id: 170, category: 'Sales', subCategory: 'Invoices', prompt: 'Show recurring invoices due this week', expectedBehavior: 'Lists auto-generated recurring invoices scheduled this week' },
  { id: 171, category: 'Sales', subCategory: 'Payments', prompt: 'Show customers with bounced cheques', expectedBehavior: 'Lists customers whose payment cheques were dishonoured' },
  { id: 172, category: 'Sales', subCategory: 'Revenue', prompt: 'What is revenue per salesperson this quarter?', expectedBehavior: 'Revenue attributed to each sales representative' },
  { id: 173, category: 'Sales', subCategory: 'Orders', prompt: 'Show cancelled sales orders this month', expectedBehavior: 'Lists sales orders that were cancelled with reasons' },
  { id: 174, category: 'Sales', subCategory: 'Customers', prompt: 'Show customer acquisition trend last 6 months', expectedBehavior: 'Month-by-month count of new customers added' },
  { id: 175, category: 'Sales', subCategory: 'Returns', prompt: 'What is the return rate by product?', expectedBehavior: 'Percentage of sales returned per product/item' },
  { id: 176, category: 'Sales', subCategory: 'Revenue', prompt: 'Show weekday vs weekend sales comparison', expectedBehavior: 'Compares average sales on weekdays versus weekends' },
  { id: 177, category: 'Sales', subCategory: 'Invoices', prompt: 'Show invoices with partial payments', expectedBehavior: 'Lists invoices where only a portion has been paid' },
  { id: 178, category: 'Sales', subCategory: 'Payments', prompt: 'Show payment mode breakdown this month', expectedBehavior: 'Payments grouped by mode: cash, bank, UPI, card, etc.' },

  // ── Purchases (11 more) ──
  { id: 179, category: 'Purchases', subCategory: 'Vendors', prompt: 'Show vendors with expiring contracts', expectedBehavior: 'Lists vendor contracts expiring within next 30 days' },
  { id: 180, category: 'Purchases', subCategory: 'Bills', prompt: 'Show duplicate bills detected this month', expectedBehavior: 'Flags potential duplicate vendor bills by amount/date' },
  { id: 181, category: 'Purchases', subCategory: 'Orders', prompt: 'Show GRN pending for purchase orders', expectedBehavior: 'Lists POs where goods received note is not yet created' },
  { id: 182, category: 'Purchases', subCategory: 'Vendors', prompt: 'Show vendor rating based on delivery timeliness', expectedBehavior: 'Ranks vendors by on-time delivery percentage' },
  { id: 183, category: 'Purchases', subCategory: 'Bills', prompt: 'What is the highest single vendor bill this quarter?', expectedBehavior: 'Identifies the largest individual vendor bill amount' },
  { id: 184, category: 'Purchases', subCategory: 'Orders', prompt: 'Show purchase orders with price variance', expectedBehavior: 'Lists POs where billed price differs from PO price' },
  { id: 185, category: 'Purchases', subCategory: 'Vendors', prompt: 'How many new vendors were added this year?', expectedBehavior: 'Count of vendors onboarded in current financial year' },
  { id: 186, category: 'Purchases', subCategory: 'Bills', prompt: 'Show vendor bills with TDS deduction', expectedBehavior: 'Lists bills where TDS was applied with section details' },
  { id: 187, category: 'Purchases', subCategory: 'Orders', prompt: 'Show blanket purchase orders and utilization', expectedBehavior: 'Displays blanket POs with consumed vs remaining amounts' },
  { id: 188, category: 'Purchases', subCategory: 'Returns', prompt: 'What is the purchase return rate this quarter?', expectedBehavior: 'Percentage of purchases returned vs total purchased' },
  { id: 189, category: 'Purchases', subCategory: 'Bills', prompt: 'Show bills pending three-way matching', expectedBehavior: 'Lists bills not yet matched with PO and GRN' },

  // ── Inventory (11 more) ──
  { id: 190, category: 'Inventory', subCategory: 'Valuation', prompt: 'Compare FIFO vs weighted average valuation', expectedBehavior: 'Shows inventory value under both costing methods' },
  { id: 191, category: 'Inventory', subCategory: 'Stock Levels', prompt: 'Show items with negative stock', expectedBehavior: 'Lists items where system stock is below zero' },
  { id: 192, category: 'Inventory', subCategory: 'Movement', prompt: 'Show material issue against production orders', expectedBehavior: 'Lists raw material issued for manufacturing' },
  { id: 193, category: 'Inventory', subCategory: 'Aging', prompt: 'Show items nearing expiry date', expectedBehavior: 'Lists perishable items expiring within 30 days' },
  { id: 194, category: 'Inventory', subCategory: 'Reorder', prompt: 'What is the economic order quantity for item X?', expectedBehavior: 'Calculates EOQ based on demand and ordering costs' },
  { id: 195, category: 'Inventory', subCategory: 'Stock Levels', prompt: 'Show batch-wise stock details', expectedBehavior: 'Displays stock quantities grouped by batch/lot number' },
  { id: 196, category: 'Inventory', subCategory: 'Movement', prompt: 'Show stock adjustment entries this month', expectedBehavior: 'Lists manual stock adjustments with reasons' },
  { id: 197, category: 'Inventory', subCategory: 'Valuation', prompt: 'What is the landed cost of item Y?', expectedBehavior: 'Calculates total cost including freight, duty, handling' },
  { id: 198, category: 'Inventory', subCategory: 'Reorder', prompt: 'Show safety stock levels for critical items', expectedBehavior: 'Displays configured safety stock vs current stock for key items' },
  { id: 199, category: 'Inventory', subCategory: 'Movement', prompt: 'Show bin-wise stock location report', expectedBehavior: 'Displays item quantities by shelf/bin location in warehouse' },
  { id: 200, category: 'Inventory', subCategory: 'Stock Levels', prompt: 'Show items with stock exceeding max level', expectedBehavior: 'Lists overstocked items above maximum threshold' },

  // ── GST (11 more) ──
  { id: 201, category: 'GST', subCategory: 'GSTR-1', prompt: 'Show CDN (credit/debit notes) for GSTR-1', expectedBehavior: 'Lists credit and debit notes formatted for GSTR-1 filing' },
  { id: 202, category: 'GST', subCategory: 'Input Credit', prompt: 'Show ITC reversal entries this quarter', expectedBehavior: 'Lists input tax credit reversed with reasons' },
  { id: 203, category: 'GST', subCategory: 'Reconciliation', prompt: 'Show GSTR-2B vs purchase register comparison', expectedBehavior: 'Reconciles auto-drafted GSTR-2B with purchase books' },
  { id: 204, category: 'GST', subCategory: 'HSN', prompt: 'Show HSN-wise purchase summary', expectedBehavior: 'Purchase data grouped by HSN codes for GSTR-9' },
  { id: 205, category: 'GST', subCategory: 'Compliance', prompt: 'Show GSTR-9 annual return data preview', expectedBehavior: 'Generates GSTR-9 annual return summary for review' },
  { id: 206, category: 'GST', subCategory: 'GSTR-1', prompt: 'Show nil-rated and exempt sales for GSTR-1', expectedBehavior: 'Lists sales with nil-rated or exempt GST classification' },
  { id: 207, category: 'GST', subCategory: 'Input Credit', prompt: 'Show eligible vs ineligible ITC breakdown', expectedBehavior: 'Categorizes ITC into eligible and ineligible portions' },
  { id: 208, category: 'GST', subCategory: 'Reconciliation', prompt: 'Show vendors not filing GST returns', expectedBehavior: 'Identifies vendors whose returns are not reflected in GSTR-2A' },
  { id: 209, category: 'GST', subCategory: 'Compliance', prompt: 'Show late fee and interest on delayed GST filing', expectedBehavior: 'Calculates penalties for late GST return filing' },
  { id: 210, category: 'GST', subCategory: 'GSTR-1', prompt: 'Show amendments to previously filed GSTR-1', expectedBehavior: 'Lists invoice amendments for GSTR-1 filing' },
  { id: 211, category: 'GST', subCategory: 'HSN', prompt: 'Validate HSN codes for all items', expectedBehavior: 'Checks if all items have valid HSN/SAC codes assigned' },

  // ── Taxes (10 more) ──
  { id: 212, category: 'Taxes', subCategory: 'TDS', prompt: 'Show TDS default entries not deposited on time', expectedBehavior: 'Lists TDS deductions where deposit was late per due dates' },
  { id: 213, category: 'Taxes', subCategory: 'TCS', prompt: 'Show TCS liability by buyer category', expectedBehavior: 'TCS amounts grouped by type of buyer/transaction' },
  { id: 214, category: 'Taxes', subCategory: 'Income Tax', prompt: 'Show MAT (Minimum Alternate Tax) computation', expectedBehavior: 'Calculates MAT liability under Section 115JB' },
  { id: 215, category: 'Taxes', subCategory: 'TDS', prompt: 'Show lower deduction certificate status', expectedBehavior: 'Lists vendors with valid lower TDS deduction certificates' },
  { id: 216, category: 'Taxes', subCategory: 'Compliance', prompt: 'Show pending Form 26AS reconciliation', expectedBehavior: 'Compares TDS credits in Form 26AS with books' },
  { id: 217, category: 'Taxes', subCategory: 'Professional Tax', prompt: 'Show state-wise professional tax summary', expectedBehavior: 'Professional tax liability broken down by state' },
  { id: 218, category: 'Taxes', subCategory: 'TDS', prompt: 'Show non-resident TDS deductions', expectedBehavior: 'Lists TDS deducted on payments to non-residents under Sec 195' },
  { id: 219, category: 'Taxes', subCategory: 'Income Tax', prompt: 'Show deferred tax asset/liability', expectedBehavior: 'Calculates deferred tax based on timing differences' },
  { id: 220, category: 'Taxes', subCategory: 'TDS', prompt: 'Prepare Form 24Q data for salary TDS', expectedBehavior: 'Generates quarterly salary TDS return data' },
  { id: 221, category: 'Taxes', subCategory: 'Compliance', prompt: 'Show withholding tax comparison across quarters', expectedBehavior: 'Quarter-over-quarter comparison of TDS/TCS amounts' },

  // ── Fixed Assets (10 more) ──
  { id: 222, category: 'Fixed Assets', subCategory: 'Depreciation', prompt: 'Show accumulated depreciation by asset class', expectedBehavior: 'Total depreciation charged grouped by asset category' },
  { id: 223, category: 'Fixed Assets', subCategory: 'Register', prompt: 'Show assets under lease agreements', expectedBehavior: 'Lists assets acquired under finance or operating lease' },
  { id: 224, category: 'Fixed Assets', subCategory: 'Additions', prompt: 'Show asset capitalization pending approval', expectedBehavior: 'Lists assets in draft/pending capitalization status' },
  { id: 225, category: 'Fixed Assets', subCategory: 'Disposal', prompt: 'Calculate gain/loss on asset disposal for item FA-101', expectedBehavior: 'Computes profit or loss on specific asset disposal' },
  { id: 226, category: 'Fixed Assets', subCategory: 'Register', prompt: 'Show assets with insurance expiring soon', expectedBehavior: 'Lists assets whose insurance coverage expires within 60 days' },
  { id: 227, category: 'Fixed Assets', subCategory: 'Depreciation', prompt: 'Show depreciation variance vs budget', expectedBehavior: 'Compares actual depreciation with budgeted amounts' },
  { id: 228, category: 'Fixed Assets', subCategory: 'Register', prompt: 'Show location-wise asset register', expectedBehavior: 'Assets grouped by physical location/branch' },
  { id: 229, category: 'Fixed Assets', subCategory: 'Additions', prompt: 'Show asset tagging status', expectedBehavior: 'Lists assets with their physical verification/tag status' },
  { id: 230, category: 'Fixed Assets', subCategory: 'Disposal', prompt: 'Show assets eligible for retirement', expectedBehavior: 'Lists assets past useful life ready for disposal' },
  { id: 231, category: 'Fixed Assets', subCategory: 'Depreciation', prompt: 'Show impairment losses recorded this year', expectedBehavior: 'Lists assets where impairment adjustments were made' },

  // ── Expense Claims (10 more) ──
  { id: 232, category: 'Expense Claims', subCategory: 'Summary', prompt: 'Show department-wise expense claims summary', expectedBehavior: 'Expense claims grouped by department with totals' },
  { id: 233, category: 'Expense Claims', subCategory: 'Policy', prompt: 'Show claims without proper receipts attached', expectedBehavior: 'Lists expense claims missing receipt/proof attachments' },
  { id: 234, category: 'Expense Claims', subCategory: 'Category', prompt: 'Show travel expense trend over 6 months', expectedBehavior: 'Monthly trend of travel-related expense claims' },
  { id: 235, category: 'Expense Claims', subCategory: 'Approval', prompt: 'Show average approval turnaround time', expectedBehavior: 'Calculates mean days from claim submission to approval' },
  { id: 236, category: 'Expense Claims', subCategory: 'Reimbursement', prompt: 'Show reimbursements processed today', expectedBehavior: 'Lists expense reimbursement payments made today' },
  { id: 237, category: 'Expense Claims', subCategory: 'Policy', prompt: 'Show per diem utilization by employee', expectedBehavior: 'Displays daily allowance usage per employee for trips' },
  { id: 238, category: 'Expense Claims', subCategory: 'Category', prompt: 'What is the total fuel expense this quarter?', expectedBehavior: 'Sums fuel/mileage claims for current quarter' },
  { id: 239, category: 'Expense Claims', subCategory: 'Pending', prompt: 'Show expense claims older than 30 days pending', expectedBehavior: 'Lists claims stuck in pending state for over a month' },
  { id: 240, category: 'Expense Claims', subCategory: 'Summary', prompt: 'Show top 10 expense claimers this year', expectedBehavior: 'Ranks employees by total claim amount in current year' },
  { id: 241, category: 'Expense Claims', subCategory: 'Category', prompt: 'Show client entertainment expenses this quarter', expectedBehavior: 'Filters claims tagged as client entertainment/hospitality' },

  // ── Reports (12 more) ──
  { id: 242, category: 'Reports', subCategory: 'P&L', prompt: 'Show segment-wise profit and loss', expectedBehavior: 'P&L broken down by business segment/division' },
  { id: 243, category: 'Reports', subCategory: 'Balance Sheet', prompt: 'Show comparative balance sheet year-over-year', expectedBehavior: 'Balance sheet comparison between current and previous year' },
  { id: 244, category: 'Reports', subCategory: 'Cash Flow', prompt: 'Show free cash flow calculation', expectedBehavior: 'Calculates FCF: operating cash flow minus capex' },
  { id: 245, category: 'Reports', subCategory: 'Ratios', prompt: 'Show working capital trend for last 12 months', expectedBehavior: 'Monthly working capital (current assets minus current liabilities)' },
  { id: 246, category: 'Reports', subCategory: 'Budget', prompt: 'Show department-wise budget utilization', expectedBehavior: 'Budget consumed vs allocated per department' },
  { id: 247, category: 'Reports', subCategory: 'P&L', prompt: 'Show contribution margin by product line', expectedBehavior: 'Revenue minus variable costs per product category' },
  { id: 248, category: 'Reports', subCategory: 'Receivables', prompt: 'Show collection efficiency ratio', expectedBehavior: 'Calculates percentage of receivables collected on time' },
  { id: 249, category: 'Reports', subCategory: 'Payables', prompt: 'Show DPO (Days Payable Outstanding) trend', expectedBehavior: 'Monthly trend of average days to pay suppliers' },
  { id: 250, category: 'Reports', subCategory: 'Ratios', prompt: 'Show return on equity for this year', expectedBehavior: 'Calculates ROE based on net income and shareholder equity' },
  { id: 251, category: 'Reports', subCategory: 'Cash Flow', prompt: 'Show monthly cash burn rate', expectedBehavior: 'Calculates net monthly cash outflow rate' },
  { id: 252, category: 'Reports', subCategory: 'Custom', prompt: 'Show cost of goods sold breakdown', expectedBehavior: 'Detailed COGS components: materials, labor, overhead' },
  { id: 253, category: 'Reports', subCategory: 'Budget', prompt: 'Show capex vs opex breakdown this year', expectedBehavior: 'Categorizes spend into capital and operational expenditure' },

  // ── Accounting Masters (10 more) ──
  { id: 254, category: 'Accounting Masters', subCategory: 'Ledger', prompt: 'Show suspense account entries', expectedBehavior: 'Lists transactions parked in suspense/clearing accounts' },
  { id: 255, category: 'Accounting Masters', subCategory: 'Journal', prompt: 'Show inter-company journal entries', expectedBehavior: 'Lists JVs between group entities for elimination' },
  { id: 256, category: 'Accounting Masters', subCategory: 'Chart of Accounts', prompt: 'Show accounts with zero balance', expectedBehavior: 'Lists accounts with no outstanding balance' },
  { id: 257, category: 'Accounting Masters', subCategory: 'Ledger', prompt: 'Show foreign currency ledger balances', expectedBehavior: 'Displays ledger balances in foreign currencies with INR equivalent' },
  { id: 258, category: 'Accounting Masters', subCategory: 'Journal', prompt: 'Show year-end closing entries', expectedBehavior: 'Lists closing journal entries for financial year-end' },
  { id: 259, category: 'Accounting Masters', subCategory: 'Cost Center', prompt: 'Show project-wise cost center allocation', expectedBehavior: 'Expenses allocated across projects/cost centers' },
  { id: 260, category: 'Accounting Masters', subCategory: 'Ledger', prompt: 'Show intercompany balances for consolidation', expectedBehavior: 'Outstanding balances between group companies' },
  { id: 261, category: 'Accounting Masters', subCategory: 'Chart of Accounts', prompt: 'Show newly created accounts this quarter', expectedBehavior: 'Lists accounts added to chart of accounts in current quarter' },
  { id: 262, category: 'Accounting Masters', subCategory: 'Journal', prompt: 'Show provision entries booked this month', expectedBehavior: 'Lists accrual/provision journal entries for current month' },
  { id: 263, category: 'Accounting Masters', subCategory: 'Ledger', prompt: 'Show accounts with unusual balances', expectedBehavior: 'Flags accounts with debit/credit balances contrary to nature' },

  // ── Eway Bills (10 more) ──
  { id: 264, category: 'Eway Bills', subCategory: 'Generation', prompt: 'Show consolidated eway bills generated', expectedBehavior: 'Lists consolidated eway bills combining multiple invoices' },
  { id: 265, category: 'Eway Bills', subCategory: 'Pending', prompt: 'Show invoices above ₹50,000 without eway bill', expectedBehavior: 'Lists high-value invoices missing mandatory eway bills' },
  { id: 266, category: 'Eway Bills', subCategory: 'Expiring', prompt: 'Show eway bills extended this month', expectedBehavior: 'Lists eway bills where validity was extended' },
  { id: 267, category: 'Eway Bills', subCategory: 'Summary', prompt: 'Show transporter-wise eway bill count', expectedBehavior: 'Eway bills grouped by transport provider' },
  { id: 268, category: 'Eway Bills', subCategory: 'Generation', prompt: 'Show eway bill generation errors today', expectedBehavior: 'Lists failed eway bill creation attempts with error details' },
  { id: 269, category: 'Eway Bills', subCategory: 'Cancelled', prompt: 'Show eway bills cancelled within 24 hours', expectedBehavior: 'Lists eway bills cancelled shortly after generation' },
  { id: 270, category: 'Eway Bills', subCategory: 'Summary', prompt: 'Show distance-wise eway bill distribution', expectedBehavior: 'Eway bills grouped by distance slabs' },
  { id: 271, category: 'Eway Bills', subCategory: 'Pending', prompt: 'Show multi-vehicle eway bill requests pending', expectedBehavior: 'Lists eway bills requiring vehicle change not yet updated' },
  { id: 272, category: 'Eway Bills', subCategory: 'Generation', prompt: 'Show eway bills for inter-state vs intra-state', expectedBehavior: 'Compares eway bills by inter-state and intra-state movement' },
  { id: 273, category: 'Eway Bills', subCategory: 'Summary', prompt: 'Show eway bill compliance rate this quarter', expectedBehavior: 'Percentage of eligible invoices with eway bills generated' },

  // ── Drive (10 more) ──
  { id: 274, category: 'Drive', subCategory: 'Files', prompt: 'Show files pending review or approval', expectedBehavior: 'Lists documents in review/approval workflow' },
  { id: 275, category: 'Drive', subCategory: 'Storage', prompt: 'Show storage growth trend last 6 months', expectedBehavior: 'Monthly storage consumption trend' },
  { id: 276, category: 'Drive', subCategory: 'Shared', prompt: 'Show files shared externally', expectedBehavior: 'Lists documents shared with external/guest users' },
  { id: 277, category: 'Drive', subCategory: 'Files', prompt: 'Show auto-generated financial statements', expectedBehavior: 'Lists system-generated reports and statements' },
  { id: 278, category: 'Drive', subCategory: 'Storage', prompt: 'Show deleted files in recycle bin', expectedBehavior: 'Lists recently deleted files available for restoration' },
  { id: 279, category: 'Drive', subCategory: 'Files', prompt: 'Show version history for file budget-2025.xlsx', expectedBehavior: 'Displays all versions of specified file with timestamps' },
  { id: 280, category: 'Drive', subCategory: 'Shared', prompt: 'Show files with public link access', expectedBehavior: 'Lists documents accessible via public/anonymous links' },
  { id: 281, category: 'Drive', subCategory: 'Files', prompt: 'Show documents tagged as confidential', expectedBehavior: 'Lists files with confidential/restricted classification' },
  { id: 282, category: 'Drive', subCategory: 'Storage', prompt: 'Show storage quota utilization by user', expectedBehavior: 'Storage consumption broken down per user' },
  { id: 283, category: 'Drive', subCategory: 'Files', prompt: 'Show files not accessed in last 90 days', expectedBehavior: 'Lists dormant files for archival consideration' },

  // ── Comments (8 more) ──
  { id: 284, category: 'Comments', subCategory: 'Recent', prompt: 'Show comments on expense claims', expectedBehavior: 'Lists all comments attached to expense claim entries' },
  { id: 285, category: 'Comments', subCategory: 'Mentions', prompt: 'Show unresolved comments mentioning finance team', expectedBehavior: 'Filters open comments tagging finance team members' },
  { id: 286, category: 'Comments', subCategory: 'Activity', prompt: 'Show comment threads with more than 5 replies', expectedBehavior: 'Lists active discussion threads by reply count' },
  { id: 287, category: 'Comments', subCategory: 'Recent', prompt: 'Show comments added on journal entries', expectedBehavior: 'Lists comments attached to journal voucher documents' },
  { id: 288, category: 'Comments', subCategory: 'Mentions', prompt: 'Show action items from comments this week', expectedBehavior: 'Extracts actionable items from comment threads' },
  { id: 289, category: 'Comments', subCategory: 'Activity', prompt: 'Show comment summary by document type', expectedBehavior: 'Comment counts grouped by document category' },
  { id: 290, category: 'Comments', subCategory: 'Recent', prompt: 'Show comments with file attachments', expectedBehavior: 'Lists comments that include attached files/images' },
  { id: 291, category: 'Comments', subCategory: 'Activity', prompt: 'Show comment response time by team member', expectedBehavior: 'Average time to respond to comments per user' },

  // ── Task Management (12 more) ──
  { id: 292, category: 'Task Management', subCategory: 'My Tasks', prompt: 'Show tasks by priority breakdown', expectedBehavior: 'Task count grouped by priority: high, medium, low' },
  { id: 293, category: 'Task Management', subCategory: 'Team', prompt: 'Show unassigned tasks in backlog', expectedBehavior: 'Lists tasks without an assigned owner' },
  { id: 294, category: 'Task Management', subCategory: 'Overdue', prompt: 'Show escalated tasks this week', expectedBehavior: 'Lists tasks that were escalated due to missed deadlines' },
  { id: 295, category: 'Task Management', subCategory: 'My Tasks', prompt: 'Show tasks blocked by dependencies', expectedBehavior: 'Lists tasks waiting on prerequisite tasks to complete' },
  { id: 296, category: 'Task Management', subCategory: 'Completed', prompt: 'Show average task completion time by category', expectedBehavior: 'Mean days to complete tasks grouped by task type' },
  { id: 297, category: 'Task Management', subCategory: 'Team', prompt: 'Show team workload distribution', expectedBehavior: 'Task count and estimated hours per team member' },
  { id: 298, category: 'Task Management', subCategory: 'My Tasks', prompt: 'Show tasks related to month-end closing', expectedBehavior: 'Lists all tasks tagged with month-end/closing activities' },
  { id: 299, category: 'Task Management', subCategory: 'Overdue', prompt: 'Show recurring tasks that were missed', expectedBehavior: 'Lists recurring tasks where scheduled occurrence was not completed' },
  { id: 300, category: 'Task Management', subCategory: 'Team', prompt: 'Show tasks created by me and assigned to others', expectedBehavior: 'Lists tasks user delegated to team members' },
  { id: 301, category: 'Task Management', subCategory: 'Completed', prompt: 'Show tasks completed ahead of deadline', expectedBehavior: 'Lists tasks finished before their due date' },
  { id: 302, category: 'Task Management', subCategory: 'My Tasks', prompt: 'Show tasks tagged as audit-related', expectedBehavior: 'Lists tasks associated with audit preparation or response' },
  { id: 303, category: 'Task Management', subCategory: 'Team', prompt: 'Show task SLA compliance rate', expectedBehavior: 'Percentage of tasks completed within defined SLA' },

  // ── Your Workspace (12 more) ──
  { id: 304, category: 'Your Workspace', subCategory: 'Dashboard', prompt: 'Show cash position snapshot', expectedBehavior: 'Current cash and bank balances across all accounts' },
  { id: 305, category: 'Your Workspace', subCategory: 'Notifications', prompt: 'Show critical alerts and warnings', expectedBehavior: 'Filters high-priority notifications requiring immediate action' },
  { id: 306, category: 'Your Workspace', subCategory: 'Activity', prompt: 'Show approvals pending from me', expectedBehavior: 'Lists all documents/claims/POs awaiting user approval' },
  { id: 307, category: 'Your Workspace', subCategory: 'Favorites', prompt: 'Show my pinned dashboards', expectedBehavior: 'Lists custom dashboards saved by the user' },
  { id: 308, category: 'Your Workspace', subCategory: 'Settings', prompt: 'Show my default company and branch', expectedBehavior: 'Displays currently selected company and branch settings' },
  { id: 309, category: 'Your Workspace', subCategory: 'Dashboard', prompt: 'Show weekly financial health scorecard', expectedBehavior: 'Key financial metrics with health indicators for the week' },
  { id: 310, category: 'Your Workspace', subCategory: 'Activity', prompt: 'Show audit trail for my recent changes', expectedBehavior: 'Lists all document modifications made by user with timestamps' },
  { id: 311, category: 'Your Workspace', subCategory: 'Notifications', prompt: 'Show deadline reminders for this week', expectedBehavior: 'Lists upcoming deadlines from tasks, filings, and payments' },
  { id: 312, category: 'Your Workspace', subCategory: 'Favorites', prompt: 'Show my frequently used reports', expectedBehavior: 'Lists reports accessed most often by the user' },
  { id: 313, category: 'Your Workspace', subCategory: 'Dashboard', prompt: 'Show month-end checklist progress', expectedBehavior: 'Displays checklist items for month-end close with completion status' },
  { id: 314, category: 'Your Workspace', subCategory: 'Settings', prompt: 'Show API integrations connected to my workspace', expectedBehavior: 'Lists active third-party API connections and their status' },
  { id: 315, category: 'Your Workspace', subCategory: 'Activity', prompt: 'Show data export history', expectedBehavior: 'Lists recent data exports with file type and download links' },

  // ── Cross-Module / General (11 more) ──
  { id: 316, category: 'Reports', subCategory: 'Custom', prompt: 'Show vendor vs customer ledger reconciliation', expectedBehavior: 'Matches vendor bills with customer invoices for clearing' },

  // ══════════════════════════════════════════════════════════════════════════
  // Batch 3 — 200 additional unique cases (317 – 516)
  // ══════════════════════════════════════════════════════════════════════════

  // ── Sales – Advanced (20 cases) ──
  { id: 317, category: 'Sales', subCategory: 'Discounts', prompt: 'Show discount approval override history', expectedBehavior: 'Lists instances where standard discount limits were overridden with approver details' },
  { id: 318, category: 'Sales', subCategory: 'Discounts', prompt: 'Which customers received the highest discounts?', expectedBehavior: 'Ranks customers by total discount value received' },
  { id: 319, category: 'Sales', subCategory: 'Payments', prompt: 'Show payment collection efficiency ratio', expectedBehavior: 'Calculates percentage of billed amount collected within terms' },
  { id: 320, category: 'Sales', subCategory: 'Revenue', prompt: 'Show revenue by sales channel', expectedBehavior: 'Breaks down revenue by online, retail, wholesale, and other channels' },
  { id: 321, category: 'Sales', subCategory: 'Customers', prompt: 'List new customers acquired this month', expectedBehavior: 'Shows customers with their first transaction in the current month' },
  { id: 322, category: 'Sales', subCategory: 'Revenue', prompt: 'Show recurring revenue vs one-time revenue split', expectedBehavior: 'Separates subscription/recurring invoices from one-time sales' },
  { id: 323, category: 'Sales', subCategory: 'Orders', prompt: 'Show average order fulfilment time', expectedBehavior: 'Calculates mean days from sales order to delivery' },
  { id: 324, category: 'Sales', subCategory: 'Invoices', prompt: 'Show invoice aging by customer segment', expectedBehavior: 'Groups outstanding invoices by customer tier with aging buckets' },
  { id: 325, category: 'Sales', subCategory: 'Revenue', prompt: 'What is revenue per employee this year?', expectedBehavior: 'Divides total revenue by headcount for productivity metric' },
  { id: 326, category: 'Sales', subCategory: 'Customers', prompt: 'Show customer churn rate for last 6 months', expectedBehavior: 'Calculates percentage of customers who stopped ordering' },
  { id: 327, category: 'Sales', subCategory: 'Revenue', prompt: 'Show revenue waterfall from last year to this year', expectedBehavior: 'Breaks down revenue change into new, expansion, contraction, and churned' },
  { id: 328, category: 'Sales', subCategory: 'Invoices', prompt: 'Show invoices disputed by customers', expectedBehavior: 'Lists invoices flagged or marked as disputed with reasons' },
  { id: 329, category: 'Sales', subCategory: 'Payments', prompt: 'Show payment gateway success vs failure rate', expectedBehavior: 'Displays online payment transaction success percentage by gateway' },
  { id: 330, category: 'Sales', subCategory: 'Revenue', prompt: 'Show gross margin by product line', expectedBehavior: 'Calculates revenue minus COGS per product category' },
  { id: 331, category: 'Sales', subCategory: 'Customers', prompt: 'Show customer lifetime value for top 20 accounts', expectedBehavior: 'Calculates total historical revenue per customer for top accounts' },
  { id: 332, category: 'Sales', subCategory: 'Orders', prompt: 'Show back orders pending fulfilment', expectedBehavior: 'Lists sales orders with items not yet available in stock' },
  { id: 333, category: 'Sales', subCategory: 'Revenue', prompt: 'Show territory-wise sales breakdown', expectedBehavior: 'Groups sales by geographic territory or region' },
  { id: 334, category: 'Sales', subCategory: 'Invoices', prompt: 'Show invoices nearing statute of limitations', expectedBehavior: 'Lists very old unpaid invoices approaching legal recovery deadline' },
  { id: 335, category: 'Sales', subCategory: 'Revenue', prompt: 'Show price variance analysis for key products', expectedBehavior: 'Compares actual selling prices vs standard prices for top items' },
  { id: 336, category: 'Sales', subCategory: 'Payments', prompt: 'Show advance payments received but not adjusted', expectedBehavior: 'Lists customer advances not yet applied to invoices' },

  // ── Purchases – Advanced (18 cases) ──
  { id: 337, category: 'Purchases', subCategory: 'Vendors', prompt: 'Show vendor payment terms compliance', expectedBehavior: 'Analyses how often payments are made within agreed terms' },
  { id: 338, category: 'Purchases', subCategory: 'Bills', prompt: 'Show purchase bills with withholding tax breakdown by section', expectedBehavior: 'Detailed section-wise (194C, 194J, etc.) withholding tax on vendor bills' },
  { id: 339, category: 'Purchases', subCategory: 'Orders', prompt: 'Show purchase order lead time analysis by vendor', expectedBehavior: 'Calculates average days from PO creation to goods receipt per vendor' },
  { id: 340, category: 'Purchases', subCategory: 'Vendors', prompt: 'Show vendor spend concentration risk analysis', expectedBehavior: 'Identifies if too much spend is concentrated with few vendors' },
  { id: 341, category: 'Purchases', subCategory: 'Bills', prompt: 'Show bills with quantity variance from GRN', expectedBehavior: 'Lists bills where billed quantity differs from goods received quantity' },
  { id: 342, category: 'Purchases', subCategory: 'Orders', prompt: 'Show three-way match exceptions', expectedBehavior: 'Lists PO-GRN-Bill mismatches requiring manual review' },
  { id: 343, category: 'Purchases', subCategory: 'Vendors', prompt: 'Show vendor rating or scorecard summary', expectedBehavior: 'Displays vendor performance scores based on delivery and quality' },
  { id: 344, category: 'Purchases', subCategory: 'Bills', prompt: 'Show bills eligible for early payment discount', expectedBehavior: 'Lists bills where paying early would earn a cash discount' },
  { id: 345, category: 'Purchases', subCategory: 'Orders', prompt: 'Show purchase order amendments and revision history', expectedBehavior: 'Lists POs that were modified after approval with change details' },
  { id: 346, category: 'Purchases', subCategory: 'Vendors', prompt: 'Show sole-source vendor dependencies', expectedBehavior: 'Lists items or categories sourced from only one vendor' },
  { id: 347, category: 'Purchases', subCategory: 'Bills', prompt: 'Show purchase bill aging summary', expectedBehavior: 'Groups outstanding bills by age brackets (30/60/90/120+ days)' },
  { id: 348, category: 'Purchases', subCategory: 'Returns', prompt: 'Show goods returned to vendor pending credit', expectedBehavior: 'Lists returned goods where debit note is not yet received' },
  { id: 349, category: 'Purchases', subCategory: 'Bills', prompt: 'Show month-wise purchase trend by category', expectedBehavior: 'Displays monthly purchase spend grouped by item category' },
  { id: 350, category: 'Purchases', subCategory: 'Vendors', prompt: 'Show vendor-wise GST registration status', expectedBehavior: 'Lists vendors with their GST number validity and type' },
  { id: 351, category: 'Purchases', subCategory: 'Orders', prompt: 'Show purchase orders auto-created from reorder alerts', expectedBehavior: 'Lists POs generated automatically from low-stock triggers' },
  { id: 352, category: 'Purchases', subCategory: 'Bills', prompt: 'Show forex impact on import purchase bills', expectedBehavior: 'Calculates exchange rate gain/loss on foreign currency bills' },
  { id: 353, category: 'Purchases', subCategory: 'Vendors', prompt: 'Which vendor invoices had the longest approval cycle?', expectedBehavior: 'Ranks vendor bills by days taken for internal approval' },
  { id: 354, category: 'Purchases', subCategory: 'Bills', prompt: 'Show capex vs opex purchase classification', expectedBehavior: 'Categorizes purchases into capital and operational expenditure' },

  // ── Inventory – Advanced (16 cases) ──
  { id: 355, category: 'Inventory', subCategory: 'Valuation', prompt: 'Show inventory valuation by FIFO method', expectedBehavior: 'Calculates stock value using First-In-First-Out costing' },
  { id: 356, category: 'Inventory', subCategory: 'Valuation', prompt: 'Show inventory holding cost analysis', expectedBehavior: 'Calculates storage, insurance, and opportunity cost of holding inventory' },
  { id: 357, category: 'Inventory', subCategory: 'Movement', prompt: 'Show consumption pattern forecast for next quarter', expectedBehavior: 'Projects item consumption based on historical trends and seasonality' },
  { id: 358, category: 'Inventory', subCategory: 'Movement', prompt: 'Show material requisition vs actual issue variance', expectedBehavior: 'Compares requested quantities with actual quantities issued from stock' },
  { id: 359, category: 'Inventory', subCategory: 'Stock Levels', prompt: 'Show phantom stock or ghost inventory items', expectedBehavior: 'Lists items showing system balance but likely not physically present' },
  { id: 360, category: 'Inventory', subCategory: 'Reorder', prompt: 'Show vendor lead time reliability for reorder planning', expectedBehavior: 'Analyses actual vs promised delivery times to adjust reorder points' },
  { id: 361, category: 'Inventory', subCategory: 'Valuation', prompt: 'Show inventory write-off history', expectedBehavior: 'Lists items written off with dates, quantities, and values' },
  { id: 362, category: 'Inventory', subCategory: 'Movement', prompt: 'Show batch-wise stock expiry report', expectedBehavior: 'Lists inventory batches nearing or past expiry date' },
  { id: 363, category: 'Inventory', subCategory: 'Stock Levels', prompt: 'Show stock levels by warehouse location', expectedBehavior: 'Breaks down quantity on hand per warehouse or bin location' },
  { id: 364, category: 'Inventory', subCategory: 'Movement', prompt: 'Show scrap and wastage report by production batch', expectedBehavior: 'Lists material wastage during manufacturing with scrap percentages' },
  { id: 365, category: 'Inventory', subCategory: 'Valuation', prompt: 'Show standard cost vs actual cost variance by item', expectedBehavior: 'Compares predefined standard costs with actual purchase/production costs' },
  { id: 366, category: 'Inventory', subCategory: 'Reorder', prompt: 'Show demand variability index for top SKUs', expectedBehavior: 'Calculates coefficient of variation in demand for high-volume items' },
  { id: 367, category: 'Inventory', subCategory: 'Movement', prompt: 'Show inventory turnover ratio by category', expectedBehavior: 'Calculates how many times stock is sold and replaced per period' },
  { id: 368, category: 'Inventory', subCategory: 'Stock Levels', prompt: 'Show dead stock with no movement in 365 days', expectedBehavior: 'Lists items completely stationary for over a year' },
  { id: 369, category: 'Inventory', subCategory: 'Valuation', prompt: 'Show inventory provision for obsolescence', expectedBehavior: 'Displays write-down provisions for aging or obsolete stock' },
  { id: 370, category: 'Inventory', subCategory: 'Movement', prompt: 'Show goods in transit not yet received', expectedBehavior: 'Lists shipped items pending warehouse receipt confirmation' },

  // ── GST – Advanced (16 cases) ──
  { id: 371, category: 'GST', subCategory: 'Filing', prompt: 'Show GSTR-3B vs books liability mismatch', expectedBehavior: 'Compares tax liability in GSTR-3B with accounting records' },
  { id: 372, category: 'GST', subCategory: 'ITC', prompt: 'Show ITC blocked under Section 17(5)', expectedBehavior: 'Lists expenses where input tax credit is not allowed by law' },
  { id: 373, category: 'GST', subCategory: 'Returns', prompt: 'Show GSTR-1 filing status for last 6 months', expectedBehavior: 'Displays month-wise filing dates and status of GSTR-1' },
  { id: 374, category: 'GST', subCategory: 'ITC', prompt: 'Show ITC reversal entries for the year', expectedBehavior: 'Lists all input tax credit reversals with reasons and amounts' },
  { id: 375, category: 'GST', subCategory: 'Filing', prompt: 'Show GST filing timeline adherence over 12 months', expectedBehavior: 'Charts monthly filing dates vs due dates showing compliance pattern' },
  { id: 376, category: 'GST', subCategory: 'Returns', prompt: 'Show GSTR-9 annual return readiness', expectedBehavior: 'Checks completeness of data required for annual GST return' },
  { id: 377, category: 'GST', subCategory: 'ITC', prompt: 'Show ITC on capital goods claimed this year', expectedBehavior: 'Lists capital asset purchases with ITC claimed amounts' },
  { id: 378, category: 'GST', subCategory: 'Compliance', prompt: 'Show GST notices received and their status', expectedBehavior: 'Lists government GST notices with response status' },
  { id: 379, category: 'GST', subCategory: 'Filing', prompt: 'Show HSN-wise summary for GSTR-1', expectedBehavior: 'Groups outward supplies by HSN code for return filing' },
  { id: 380, category: 'GST', subCategory: 'ITC', prompt: 'Show auto-populated vs claimed ITC differences', expectedBehavior: 'Compares GSTR-2A/2B auto-populated ITC with claimed amounts' },
  { id: 381, category: 'GST', subCategory: 'Returns', prompt: 'Show nil return periods in GST filing history', expectedBehavior: 'Lists months where nil returns were filed or should have been' },
  { id: 382, category: 'GST', subCategory: 'Compliance', prompt: 'Show reverse charge mechanism transactions', expectedBehavior: 'Lists purchases where GST is payable under reverse charge' },
  { id: 383, category: 'GST', subCategory: 'ITC', prompt: 'Show ITC utilization order compliance check', expectedBehavior: 'Verifies ITC used in correct order: IGST → CGST → SGST' },
  { id: 384, category: 'GST', subCategory: 'Filing', prompt: 'Show place of supply errors in invoices', expectedBehavior: 'Flags invoices with incorrect IGST/CGST+SGST application' },
  { id: 385, category: 'GST', subCategory: 'Returns', prompt: 'Show GSTR-2B download and match status', expectedBehavior: 'Displays latest GSTR-2B download date and matching percentage' },
  { id: 386, category: 'GST', subCategory: 'Compliance', prompt: 'Show GST registration details for all branches', expectedBehavior: 'Lists GSTIN, state, and registration type for each branch' },

  // ── Reports – Advanced (16 cases) ──
  { id: 387, category: 'Reports', subCategory: 'Financial', prompt: 'Show comparative balance sheet for 3 years', expectedBehavior: 'Displays balance sheet side-by-side for three financial years' },
  { id: 388, category: 'Reports', subCategory: 'Financial', prompt: 'Show common-size income statement', expectedBehavior: 'Expresses each line item as percentage of total revenue' },
  { id: 389, category: 'Reports', subCategory: 'Ratio', prompt: 'Show DuPont analysis breakdown', expectedBehavior: 'Decomposes ROE into margin, turnover, and leverage components' },
  { id: 390, category: 'Reports', subCategory: 'Financial', prompt: 'Show fund flow statement for this year', expectedBehavior: 'Displays sources and uses of funds during the period' },
  { id: 391, category: 'Reports', subCategory: 'Ratio', prompt: 'Show interest coverage ratio trend', expectedBehavior: 'Charts EBIT divided by interest expense over time' },
  { id: 392, category: 'Reports', subCategory: 'Financial', prompt: 'Show break-even analysis by product line', expectedBehavior: 'Calculates break-even point in units and revenue per product category' },
  { id: 393, category: 'Reports', subCategory: 'Custom', prompt: 'Show board-ready financial summary deck', expectedBehavior: 'Generates executive summary with key financial highlights' },
  { id: 394, category: 'Reports', subCategory: 'Financial', prompt: 'Show variance analysis: budget vs actual', expectedBehavior: 'Compares budgeted figures with actuals showing favorable/adverse variances' },
  { id: 395, category: 'Reports', subCategory: 'Ratio', prompt: 'Show Altman Z-score for financial health', expectedBehavior: 'Calculates bankruptcy prediction score using financial ratios' },
  { id: 396, category: 'Reports', subCategory: 'Financial', prompt: 'Show cost centre-wise expense report', expectedBehavior: 'Groups expenses by cost centre with budget utilization' },
  { id: 397, category: 'Reports', subCategory: 'Custom', prompt: 'Show bank reconciliation summary', expectedBehavior: 'Displays unreconciled items between bank statement and books' },
  { id: 398, category: 'Reports', subCategory: 'Ratio', prompt: 'Show operating leverage degree', expectedBehavior: 'Calculates sensitivity of operating income to revenue changes' },
  { id: 399, category: 'Reports', subCategory: 'Financial', prompt: 'Show quarter-over-quarter EBITDA trend', expectedBehavior: 'Charts EBITDA movement across quarters with growth rates' },
  { id: 400, category: 'Reports', subCategory: 'Custom', prompt: 'Show consolidated vs standalone financials comparison', expectedBehavior: 'Side-by-side view of group vs entity-level financials' },
  { id: 401, category: 'Reports', subCategory: 'Financial', prompt: 'Show revenue recognition schedule', expectedBehavior: 'Displays deferred revenue and recognition timeline' },
  { id: 402, category: 'Reports', subCategory: 'Ratio', prompt: 'Show cash conversion cycle analysis', expectedBehavior: 'Calculates DIO + DSO − DPO with trend over time' },

  // ── Fixed Assets – Advanced (14 cases) ──
  { id: 403, category: 'Fixed Assets', subCategory: 'Depreciation', prompt: 'Show depreciation schedule for next fiscal year', expectedBehavior: 'Projects depreciation charges month-by-month for upcoming year' },
  { id: 404, category: 'Fixed Assets', subCategory: 'Register', prompt: 'Show assets due for physical verification', expectedBehavior: 'Lists assets not physically verified in last 12 months' },
  { id: 405, category: 'Fixed Assets', subCategory: 'Depreciation', prompt: 'Compare SLM vs WDV depreciation impact', expectedBehavior: 'Shows depreciation under straight-line and written-down-value methods' },
  { id: 406, category: 'Fixed Assets', subCategory: 'Disposal', prompt: 'Show profit or loss on asset disposals this year', expectedBehavior: 'Calculates gain/loss on each asset sold or scrapped' },
  { id: 407, category: 'Fixed Assets', subCategory: 'Register', prompt: 'Show assets transferred between locations', expectedBehavior: 'Lists asset transfer history between branches or departments' },
  { id: 408, category: 'Fixed Assets', subCategory: 'Depreciation', prompt: 'Show assets fully depreciated but still in use', expectedBehavior: 'Lists assets with zero book value still shown in register' },
  { id: 409, category: 'Fixed Assets', subCategory: 'Register', prompt: 'Show asset insurance coverage status', expectedBehavior: 'Lists assets with insurance policy details and gaps' },
  { id: 410, category: 'Fixed Assets', subCategory: 'CWIP', prompt: 'Show capital work in progress aging', expectedBehavior: 'Lists CWIP items with time since capitalization started' },
  { id: 411, category: 'Fixed Assets', subCategory: 'Depreciation', prompt: 'Show revaluation surplus on fixed assets', expectedBehavior: 'Lists assets revalued upward with surplus amounts and dates' },
  { id: 412, category: 'Fixed Assets', subCategory: 'Register', prompt: 'Show asset tag assignment gaps', expectedBehavior: 'Identifies assets missing physical tag numbers' },
  { id: 413, category: 'Fixed Assets', subCategory: 'Disposal', prompt: 'Show assets approaching end of useful life', expectedBehavior: 'Lists assets within 12 months of fully depreciated status' },
  { id: 414, category: 'Fixed Assets', subCategory: 'Register', prompt: 'Show asset-wise maintenance cost summary', expectedBehavior: 'Aggregates repair and maintenance spend per asset' },
  { id: 415, category: 'Fixed Assets', subCategory: 'Depreciation', prompt: 'Show component-wise depreciation for composite assets', expectedBehavior: 'Breaks down depreciation by component for bundled assets' },
  { id: 416, category: 'Fixed Assets', subCategory: 'CWIP', prompt: 'Show borrowing costs capitalized to CWIP', expectedBehavior: 'Lists interest costs added to assets under construction' },

  // ── Expense Claim – Advanced (14 cases) ──
  { id: 417, category: 'Expense Claim', subCategory: 'Approval', prompt: 'Show expense claims pending manager approval', expectedBehavior: 'Lists claims awaiting approval with employee and amount' },
  { id: 418, category: 'Expense Claim', subCategory: 'Policy', prompt: 'Show claims exceeding per-diem limits', expectedBehavior: 'Flags claims where daily expense exceeds policy limit' },
  { id: 419, category: 'Expense Claim', subCategory: 'Reimbursement', prompt: 'Show average reimbursement processing time', expectedBehavior: 'Calculates mean days from claim submission to payment' },
  { id: 420, category: 'Expense Claim', subCategory: 'Approval', prompt: 'Show rejected claims with rejection reasons', expectedBehavior: 'Lists claims sent back with manager comments' },
  { id: 421, category: 'Expense Claim', subCategory: 'Travel', prompt: 'Show travel expense vs budget by department', expectedBehavior: 'Compares travel spend against department budget allocation' },
  { id: 422, category: 'Expense Claim', subCategory: 'Policy', prompt: 'Show expense claims violating weekend or holiday submission rules', expectedBehavior: 'Flags claims submitted for non-working day expenses against policy' },
  { id: 423, category: 'Expense Claim', subCategory: 'Reimbursement', prompt: 'Show unreimbursed employee expenses over 30 days', expectedBehavior: 'Lists approved claims not yet paid out after 30 days' },
  { id: 424, category: 'Expense Claim', subCategory: 'Travel', prompt: 'Show international travel expenses by trip', expectedBehavior: 'Groups foreign travel costs per trip with forex conversion' },
  { id: 425, category: 'Expense Claim', subCategory: 'Policy', prompt: 'Show expense category-wise spend trend', expectedBehavior: 'Charts monthly spend across expense categories like meals, transport, etc.' },
  { id: 426, category: 'Expense Claim', subCategory: 'Approval', prompt: 'Show claims auto-approved by policy rules', expectedBehavior: 'Lists claims that bypassed manual approval due to policy thresholds' },
  { id: 427, category: 'Expense Claim', subCategory: 'Reimbursement', prompt: 'Show employee-wise total claims this year', expectedBehavior: 'Ranks employees by total claimed amount for the year' },
  { id: 428, category: 'Expense Claim', subCategory: 'Travel', prompt: 'Show mileage claims and verification status', expectedBehavior: 'Lists mileage-based claims with distance and rate validation' },
  { id: 429, category: 'Expense Claim', subCategory: 'Policy', prompt: 'Show claims with duplicate expense entries', expectedBehavior: 'Flags potential duplicate submissions by amount and date' },
  { id: 430, category: 'Expense Claim', subCategory: 'Reimbursement', prompt: 'Show petty cash reconciliation status', expectedBehavior: 'Shows petty cash balance vs recorded expenses with variance' },

  // ── Accounting – Advanced (16 cases) ──
  { id: 431, category: 'Accounting', subCategory: 'Journal', prompt: 'Show manual journal entries posted this month', expectedBehavior: 'Lists all non-system-generated journal entries for the month' },
  { id: 432, category: 'Accounting', subCategory: 'Ledger', prompt: 'Show ledger entries with missing narration or description', expectedBehavior: 'Lists journal/ledger entries without proper narration for audit trail' },
  { id: 433, category: 'Accounting', subCategory: 'Reconciliation', prompt: 'Show inter-company reconciliation status', expectedBehavior: 'Displays matched and unmatched entries between group entities' },
  { id: 434, category: 'Accounting', subCategory: 'Journal', prompt: 'Show recurring journal entries schedule', expectedBehavior: 'Lists auto-posted journals with frequency and next run date' },
  { id: 435, category: 'Accounting', subCategory: 'Ledger', prompt: 'Show chart of accounts with hierarchy', expectedBehavior: 'Displays full account tree grouped by type and sub-type' },
  { id: 436, category: 'Accounting', subCategory: 'Reconciliation', prompt: 'Show credit card reconciliation summary', expectedBehavior: 'Matches credit card statement with booked transactions' },
  { id: 437, category: 'Accounting', subCategory: 'Journal', prompt: 'Show accrual entries pending reversal', expectedBehavior: 'Lists accrued liabilities/assets not yet reversed' },
  { id: 438, category: 'Accounting', subCategory: 'Ledger', prompt: 'Show dormant ledger accounts with no activity', expectedBehavior: 'Lists GL accounts with no transactions in 12+ months' },
  { id: 439, category: 'Accounting', subCategory: 'Period End', prompt: 'Show unclosed accounting periods and their impact', expectedBehavior: 'Lists periods not yet finalized with pending entries affecting balances' },
  { id: 440, category: 'Accounting', subCategory: 'Journal', prompt: 'Show adjusting entries for year-end close', expectedBehavior: 'Lists proposed adjustments for accruals, provisions, and deferrals' },
  { id: 441, category: 'Accounting', subCategory: 'Ledger', prompt: 'Show high-value transactions exceeding approval threshold', expectedBehavior: 'Lists ledger entries above defined monetary limit for review' },
  { id: 442, category: 'Accounting', subCategory: 'Reconciliation', prompt: 'Show loan account reconciliation with bank', expectedBehavior: 'Compares loan ledger balance with bank outstanding certificate' },
  { id: 443, category: 'Accounting', subCategory: 'Period End', prompt: 'Show provision for doubtful debts calculation', expectedBehavior: 'Calculates required provision based on aging and policy' },
  { id: 444, category: 'Accounting', subCategory: 'Journal', prompt: 'Show foreign currency revaluation entries', expectedBehavior: 'Lists forex gain/loss entries from period-end revaluation' },
  { id: 445, category: 'Accounting', subCategory: 'Ledger', prompt: 'Show control account vs subsidiary ledger match', expectedBehavior: 'Compares AR/AP control totals with individual sub-ledger balances' },
  { id: 446, category: 'Accounting', subCategory: 'Period End', prompt: 'Show pre-paid expense amortization schedule', expectedBehavior: 'Displays monthly amortization of prepaid assets' },

  // ── Eway Bills – Advanced (12 cases) ──
  { id: 447, category: 'Eway Bills', subCategory: 'Generation', prompt: 'Show eway bills expiring in next 24 hours', expectedBehavior: 'Lists active eway bills nearing validity expiration' },
  { id: 448, category: 'Eway Bills', subCategory: 'Compliance', prompt: 'Show eway bills generated vs required ratio', expectedBehavior: 'Compares number of qualifying invoices with eway bills generated' },
  { id: 449, category: 'Eway Bills', subCategory: 'Generation', prompt: 'Show consolidated eway bills created this month', expectedBehavior: 'Lists bulk/consolidated eway bills with linked individual bills' },
  { id: 450, category: 'Eway Bills', subCategory: 'Compliance', prompt: 'Show eway bill cancellation history', expectedBehavior: 'Lists cancelled eway bills with reasons and timeframes' },
  { id: 451, category: 'Eway Bills', subCategory: 'Generation', prompt: 'Show multi-vehicle eway bill updates', expectedBehavior: 'Lists eway bills where vehicle details were changed mid-transit' },
  { id: 452, category: 'Eway Bills', subCategory: 'Compliance', prompt: 'Show invoices above threshold without eway bills', expectedBehavior: 'Flags shipments exceeding ₹50,000 missing eway bill generation' },
  { id: 453, category: 'Eway Bills', subCategory: 'Generation', prompt: 'Show eway bill generation errors and retries', expectedBehavior: 'Lists failed eway bill API calls with error messages' },
  { id: 454, category: 'Eway Bills', subCategory: 'Transit', prompt: 'Show in-transit goods with eway bill tracking', expectedBehavior: 'Displays shipments currently moving with eway bill status' },
  { id: 455, category: 'Eway Bills', subCategory: 'Compliance', prompt: 'Show eway bill extensions requested', expectedBehavior: 'Lists bills where validity was extended with reasons' },
  { id: 456, category: 'Eway Bills', subCategory: 'Transit', prompt: 'Show delivery confirmation vs eway bill closure', expectedBehavior: 'Matches delivery receipts with eway bill completion status' },
  { id: 457, category: 'Eway Bills', subCategory: 'Generation', prompt: 'Show eway bills by transporter summary', expectedBehavior: 'Groups eway bills by transport company with counts and values' },
  { id: 458, category: 'Eway Bills', subCategory: 'Compliance', prompt: 'Show eway bill Part-B update compliance', expectedBehavior: 'Checks if vehicle details are updated before goods movement' },

  // ── Drive / Documents – Advanced (12 cases) ──
  { id: 459, category: 'Drive', subCategory: 'Storage', prompt: 'Show total storage usage by file type', expectedBehavior: 'Breaks down storage consumed by PDFs, images, spreadsheets, etc.' },
  { id: 460, category: 'Drive', subCategory: 'Access', prompt: 'Show document download history by user for sensitive files', expectedBehavior: 'Tracks who downloaded confidential or sensitive documents' },
  { id: 461, category: 'Drive', subCategory: 'Storage', prompt: 'Show orphaned files not linked to any transaction', expectedBehavior: 'Lists uploaded files without association to invoices, bills, or records' },
  { id: 462, category: 'Drive', subCategory: 'Access', prompt: 'Show document access audit log for last 7 days', expectedBehavior: 'Lists who accessed which files with timestamps' },
  { id: 463, category: 'Drive', subCategory: 'Storage', prompt: 'Show file upload activity trend by month', expectedBehavior: 'Charts monthly document upload volume and storage growth rate' },
  { id: 464, category: 'Drive', subCategory: 'Organization', prompt: 'Show files missing tags or categorization', expectedBehavior: 'Lists documents without proper metadata or labels' },
  { id: 465, category: 'Drive', subCategory: 'Storage', prompt: 'Show storage quota utilization by department', expectedBehavior: 'Breaks down drive usage by team or department' },
  { id: 466, category: 'Drive', subCategory: 'Access', prompt: 'Show document retention policy compliance status', expectedBehavior: 'Checks if files are retained or purged per regulatory retention rules' },
  { id: 467, category: 'Drive', subCategory: 'Organization', prompt: 'Show recent document version history changes', expectedBehavior: 'Lists documents with multiple versions updated recently' },
  { id: 468, category: 'Drive', subCategory: 'Storage', prompt: 'Show archived documents eligible for deletion', expectedBehavior: 'Lists archived files past retention period' },
  { id: 469, category: 'Drive', subCategory: 'Access', prompt: 'Show documents with restricted access permissions', expectedBehavior: 'Lists confidential files with limited user access' },
  { id: 470, category: 'Drive', subCategory: 'Organization', prompt: 'Show auto-attached documents on invoices and bills', expectedBehavior: 'Lists files automatically linked to financial transactions' },

  // ── Comments / Collaboration – Advanced (10 cases) ──
  { id: 471, category: 'Comments', subCategory: 'Threads', prompt: 'Show unresolved comment threads on financial documents', expectedBehavior: 'Lists open discussion threads on invoices, bills, and reports' },
  { id: 472, category: 'Comments', subCategory: 'Mentions', prompt: 'Show comments where CFO or finance head is tagged', expectedBehavior: 'Lists comments escalated to senior finance leadership via @mention' },
  { id: 473, category: 'Comments', subCategory: 'Threads', prompt: 'Show comments on transactions flagged for review', expectedBehavior: 'Lists discussion threads on items marked for audit or review' },
  { id: 474, category: 'Comments', subCategory: 'Activity', prompt: 'Show most discussed transactions this month', expectedBehavior: 'Ranks transactions by number of comments attached' },
  { id: 475, category: 'Comments', subCategory: 'Mentions', prompt: 'Show action items assigned to me via comments', expectedBehavior: 'Lists TODO or action items tagged to user in comment threads' },
  { id: 476, category: 'Comments', subCategory: 'Threads', prompt: 'Show comments on rejected expense claims', expectedBehavior: 'Lists discussion context on claims that were rejected' },
  { id: 477, category: 'Comments', subCategory: 'Activity', prompt: 'Show comment activity trend for the team', expectedBehavior: 'Charts daily/weekly comment volume across the team' },
  { id: 478, category: 'Comments', subCategory: 'Mentions', prompt: 'Show escalation comments from approvers', expectedBehavior: 'Lists comments where approvers raised concerns or escalated' },
  { id: 479, category: 'Comments', subCategory: 'Threads', prompt: 'Show resolved comment threads this week', expectedBehavior: 'Lists discussion threads closed or marked resolved recently' },
  { id: 480, category: 'Comments', subCategory: 'Activity', prompt: 'Show comments on year-end closing entries', expectedBehavior: 'Lists discussion threads attached to adjusting journal entries' },

  // ── Tasks – Advanced (12 cases) ──
  { id: 481, category: 'Tasks', subCategory: 'Assignment', prompt: 'Show overdue tasks assigned to my team', expectedBehavior: 'Lists tasks past due date for team members with assignee details' },
  { id: 482, category: 'Tasks', subCategory: 'Progress', prompt: 'Show task completion rate by department', expectedBehavior: 'Calculates percentage of tasks completed vs assigned per department' },
  { id: 483, category: 'Tasks', subCategory: 'Assignment', prompt: 'Show unassigned financial tasks', expectedBehavior: 'Lists tasks without an assigned owner needing attention' },
  { id: 484, category: 'Tasks', subCategory: 'Deadlines', prompt: 'Show tasks due in the next 3 business days', expectedBehavior: 'Lists upcoming task deadlines excluding weekends/holidays' },
  { id: 485, category: 'Tasks', subCategory: 'Progress', prompt: 'Show recurring task compliance status', expectedBehavior: 'Displays completion consistency of repeating tasks like month-end steps' },
  { id: 486, category: 'Tasks', subCategory: 'Assignment', prompt: 'Show task workload distribution across team', expectedBehavior: 'Charts number of active tasks per team member' },
  { id: 487, category: 'Tasks', subCategory: 'Deadlines', prompt: 'Show tasks blocked or stuck for over a week', expectedBehavior: 'Lists tasks with no progress updates in 7+ days' },
  { id: 488, category: 'Tasks', subCategory: 'Progress', prompt: 'Show audit preparation tasks and their status', expectedBehavior: 'Lists checklist items for upcoming audit with completion status' },
  { id: 489, category: 'Tasks', subCategory: 'Assignment', prompt: 'Show tasks created from comment action items', expectedBehavior: 'Lists tasks auto-generated from comment mentions and TODOs' },
  { id: 490, category: 'Tasks', subCategory: 'Deadlines', prompt: 'Show tasks with missed SLA deadlines', expectedBehavior: 'Lists tasks that breached service level agreement timelines' },
  { id: 491, category: 'Tasks', subCategory: 'Progress', prompt: 'Show task aging report for open items', expectedBehavior: 'Groups open tasks by how long they have been open' },
  { id: 492, category: 'Tasks', subCategory: 'Assignment', prompt: 'Show task handover history for an employee', expectedBehavior: 'Lists tasks reassigned from or to a specific employee' },

  // ── Taxes – Advanced (14 cases) ──
  { id: 493, category: 'Taxes', subCategory: 'TDS', prompt: 'Show TDS return filing status for all quarters', expectedBehavior: 'Displays quarter-wise TDS return filing dates and status' },
  { id: 494, category: 'Taxes', subCategory: 'TDS', prompt: 'Show TDS challan payment reconciliation with OLTAS', expectedBehavior: 'Matches deposited TDS challans with OLTAS (online tax) records' },
  { id: 495, category: 'Taxes', subCategory: 'Income Tax', prompt: 'Show advance tax installment schedule and payments', expectedBehavior: 'Displays quarterly advance tax due dates with amounts paid' },
  { id: 496, category: 'Taxes', subCategory: 'TDS', prompt: 'Show TDS demand notices and rectification status', expectedBehavior: 'Lists demand notices received from IT department with response tracking' },
  { id: 497, category: 'Taxes', subCategory: 'Income Tax', prompt: 'Show transfer pricing adjustment impact on taxable income', expectedBehavior: 'Displays TP adjustments made to inter-company transactions affecting tax' },
  { id: 498, category: 'Taxes', subCategory: 'TDS', prompt: 'Show TDS default and short deduction report', expectedBehavior: 'Identifies transactions where TDS was not deducted or was insufficient' },
  { id: 499, category: 'Taxes', subCategory: 'Income Tax', prompt: 'Show tax provision vs actual tax paid reconciliation', expectedBehavior: 'Compares tax provisioned in books with actual tax deposited' },
  { id: 500, category: 'Taxes', subCategory: 'TDS', prompt: 'Show TDS on salary (Section 192) summary', expectedBehavior: 'Summarizes tax deducted on employee salaries by month' },
  { id: 501, category: 'Taxes', subCategory: 'Income Tax', prompt: 'Show tax audit applicability check', expectedBehavior: 'Checks if turnover exceeds threshold requiring tax audit' },
  { id: 502, category: 'Taxes', subCategory: 'TDS', prompt: 'Show Form 15G/15H declarations received from payees', expectedBehavior: 'Lists self-declaration forms received for nil or lower TDS deduction' },
  { id: 503, category: 'Taxes', subCategory: 'Income Tax', prompt: 'Show brought forward losses eligible for set-off', expectedBehavior: 'Lists prior year losses available for current year offset' },
  { id: 504, category: 'Taxes', subCategory: 'TDS', prompt: 'Show TCS (Tax Collected at Source) collection report', expectedBehavior: 'Lists transactions where TCS was collected with rates and amounts' },
  { id: 505, category: 'Taxes', subCategory: 'Income Tax', prompt: 'Show effective tax rate trend over 3 years', expectedBehavior: 'Charts actual tax paid as percentage of profit before tax' },
  { id: 506, category: 'Taxes', subCategory: 'TDS', prompt: 'Show PAN verification status for vendors', expectedBehavior: 'Lists vendors with PAN validation status for TDS compliance' },

  // ── Your Workspace – Advanced (10 cases) ──
  { id: 507, category: 'Your Workspace', subCategory: 'Dashboard', prompt: 'Show real-time cash position across all bank accounts', expectedBehavior: 'Displays live balances from all linked bank accounts' },
  { id: 508, category: 'Your Workspace', subCategory: 'Alerts', prompt: 'Show anomaly alerts detected by AI this week', expectedBehavior: 'Lists unusual transactions or patterns flagged by AI engine' },
  { id: 509, category: 'Your Workspace', subCategory: 'Dashboard', prompt: 'Show financial KPI dashboard for CEO review', expectedBehavior: 'Displays top-level metrics: revenue, EBITDA, cash, receivables, payables' },
  { id: 510, category: 'Your Workspace', subCategory: 'Settings', prompt: 'Show user access permissions and role assignments', expectedBehavior: 'Lists all users with their roles and module access levels' },
  { id: 511, category: 'Your Workspace', subCategory: 'Alerts', prompt: 'Show compliance calendar for upcoming deadlines', expectedBehavior: 'Displays regulatory filing deadlines for next 30 days' },
  { id: 512, category: 'Your Workspace', subCategory: 'Dashboard', prompt: 'Show working capital requirement forecast', expectedBehavior: 'Projects working capital needs based on receivable and payable trends' },
  { id: 513, category: 'Your Workspace', subCategory: 'Settings', prompt: 'Show data backup and recovery status', expectedBehavior: 'Displays last backup timestamp and recovery point status' },
  { id: 514, category: 'Your Workspace', subCategory: 'Alerts', prompt: 'Show budget overrun alerts by cost centre', expectedBehavior: 'Flags cost centres exceeding budget allocation with amounts' },
  { id: 515, category: 'Your Workspace', subCategory: 'Dashboard', prompt: 'Show multi-currency exposure summary', expectedBehavior: 'Displays open positions in foreign currencies with hedge status' },
  { id: 516, category: 'Your Workspace', subCategory: 'Activity', prompt: 'Show bulk operation history performed by my account', expectedBehavior: 'Lists mass updates, bulk imports, and batch operations done by user' },
];

// Get unique categories
export const TEST_CASE_CATEGORIES = [...new Set(TEST_CASES.map(tc => tc.category))];

// ── Download Helpers ──

export const generateMarkdown = (cases: TestCase[]): string => {
  const grouped: Record<string, TestCase[]> = {};
  cases.forEach(tc => {
    if (!grouped[tc.category]) grouped[tc.category] = [];
    grouped[tc.category].push(tc);
  });

  let md = `# CFO Agent - Test Cases Library\n\n`;
  md += `> Total Cases: ${cases.length}\n\n`;

  Object.entries(grouped).forEach(([cat, items]) => {
    md += `## ${cat} (${items.length})\n\n`;
    md += `| # | Sub-Category | Test Prompt | Expected Behavior |\n`;
    md += `|---|---|---|---|\n`;
    items.forEach(tc => {
      md += `| ${tc.id} | ${tc.subCategory} | ${tc.prompt} | ${tc.expectedBehavior} |\n`;
    });
    md += `\n`;
  });

  return md;
};

export const generateCSV = (cases: TestCase[]): string => {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const headers = ['ID', 'Category', 'Sub-Category', 'Test Prompt', 'Expected Behavior'];
  const rows = cases.map(tc =>
    [tc.id, escape(tc.category), escape(tc.subCategory), escape(tc.prompt), escape(tc.expectedBehavior)].join(',')
  );
  return [headers.join(','), ...rows].join('\n');
};

export const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
