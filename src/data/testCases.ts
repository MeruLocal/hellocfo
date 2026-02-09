// ============================================================================
// CFO Agent - Pre-built Test Cases Library (156 cases)
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
