

# Cases Library - Pre-built Test Cases with Download Support

## Overview
Add a new "Cases Library" tab in the left sidebar containing 150+ pre-built CFO user prompts organized by module categories. Users can browse, search, and download all test cases as Markdown (.md) or Excel (.xlsx) files.

## What Will Be Built

### 1. New Sidebar Menu Item
- Add "Cases Library" entry to the sidebar navigation between "Test Console" and "API Console"
- Icon: TestTube or ListOrdered from lucide-react
- Show total case count badge (e.g., "156")

### 2. Cases Library View
A new component/section inside `CFOQueryResolutionEngine.tsx` that displays:
- **Header** with title, total count, and two download buttons (Markdown / Excel)
- **Search bar** to filter cases by text
- **Category filter** dropdown to filter by module
- **Table view** with columns: #, Category, Sub-Category, Test Prompt, Expected Behavior
- Cases organized across all 14 modules: Sales, Purchases, Inventory, GST, Taxes, Fixed Assets, Expense Claim, Reports, Accounting Masters, Eway Bills, Drive, Comment, Task Management, Your Workspace

### 3. 150+ Pre-built Test Cases
Hardcoded test case data covering realistic CFO/accounting user prompts such as:
- Sales: "Show me top 10 customers by revenue this quarter", "What are my pending sales invoices?"
- Purchases: "List overdue vendor payments", "Show purchase order summary for last month"
- GST: "Calculate my GSTR-1 liability for this month", "Show GST input credit summary"
- Inventory: "What is the current stock level for all items?", "Show items below reorder level"
- Reports: "Generate profit and loss statement for Q3", "Show cash flow summary"
- And 130+ more across all modules

### 4. Download Functionality
- **Markdown download**: Generates a formatted .md file with all cases grouped by category with tables
- **Excel download**: Generates a .csv file (compatible with Excel) with all columns, since we don't have an xlsx library installed -- CSV is universally supported

## Technical Details

### Files Modified
1. **`src/components/CFOQueryResolutionEngine.tsx`**:
   - Add test cases data constant (array of ~156 objects with fields: id, category, subCategory, prompt, expectedBehavior)
   - Add `CasesLibraryView` component with search, filter, table display
   - Add download helpers for Markdown and CSV generation
   - Add "cases" entry to `sidebarTabs` array
   - Add `activeTab === 'cases'` rendering block

### Data Structure
Each test case will have:
- `id`: number
- `category`: string (module name like "Sales", "Purchases")
- `subCategory`: string (sub-module area)
- `prompt`: string (the user query)
- `expectedBehavior`: string (what should happen)

### No Database Changes
All 150+ cases are hardcoded in the frontend -- no database tables needed. This keeps it simple and instantly available.

### No New Dependencies
- CSV generation uses plain string manipulation (already done for intent export)
- Markdown generation uses plain string building
- No xlsx library needed -- CSV works in Excel
