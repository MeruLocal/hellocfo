-- Update modules table to align with backend TOOL_CATEGORIES from _shared/tool-groups.ts

-- First, deactivate all existing modules (soft delete)
UPDATE modules SET is_active = false, updated_at = now();

-- Upsert all tool categories as modules
INSERT INTO modules (id, name, icon, color, sort_order, is_active, sub_modules) VALUES
  ('invoices', 'Invoices & Sales', '🧾', 'green', 1, true, 
    '[{"id":"sales_lifecycle","name":"Sales Lifecycle"},{"id":"customers","name":"Customers"},{"id":"quotes","name":"Quotes"},{"id":"sales_orders","name":"Sales Orders"},{"id":"invoices","name":"Invoices"},{"id":"customer_advance","name":"Customer Advance"},{"id":"invoice_credit_notes","name":"Invoice Credit Notes"}]'::jsonb),
  
  ('bills', 'Bills & Purchases', '🛒', 'orange', 2, true,
    '[{"id":"purchase_lifecycle","name":"Purchase Lifecycle"},{"id":"vendors","name":"Vendors"},{"id":"procurement","name":"Procurement"},{"id":"purchase_orders","name":"Purchase Orders"},{"id":"bills","name":"Bills"},{"id":"bill_credit_notes","name":"Bill Credit Notes"},{"id":"prepayments","name":"Prepayments"},{"id":"goods_receipt","name":"Goods Receipt"}]'::jsonb),
  
  ('payments', 'Payments', '💳', 'blue', 3, true,
    '[{"id":"payments_received","name":"Payments Received"},{"id":"payments_made","name":"Payments Made"},{"id":"collections","name":"Collections"}]'::jsonb),
  
  ('customers', 'Customers', '👥', 'indigo', 4, true,
    '[{"id":"customer_management","name":"Customer Management"},{"id":"customer_analytics","name":"Customer Analytics"}]'::jsonb),
  
  ('vendors', 'Vendors', '🏢', 'amber', 5, true,
    '[{"id":"vendor_management","name":"Vendor Management"},{"id":"vendor_analytics","name":"Vendor Analytics"}]'::jsonb),
  
  ('credit_notes', 'Credit Notes', '📝', 'rose', 6, true,
    '[{"id":"sales_credit_notes","name":"Sales Credit Notes"},{"id":"purchase_credit_notes","name":"Purchase Credit Notes"}]'::jsonb),
  
  ('accounts', 'Chart of Accounts & Assets', '📊', 'purple', 7, true,
    '[{"id":"chart_of_accounts","name":"Chart of Accounts"},{"id":"fixed_assets","name":"Fixed Assets"},{"id":"cost_centers","name":"Cost Centers"}]'::jsonb),
  
  ('transactions', 'Transactions & Banking', '🏦', 'cyan', 8, true,
    '[{"id":"bank_transactions","name":"Bank Transactions"},{"id":"reconciliation","name":"Reconciliation"},{"id":"categorization","name":"Categorization"}]'::jsonb),
  
  ('aging_reports', 'Aging Reports', '⏳', 'red', 9, true,
    '[{"id":"aged_receivables","name":"Aged Receivables"},{"id":"aged_payables","name":"Aged Payables"}]'::jsonb),
  
  ('delivery_challans', 'Delivery Challans', '🚛', 'teal', 10, true,
    '[{"id":"challans","name":"Delivery Challans"}]'::jsonb),
  
  ('eway_bills', 'E-Way Bills', '🚚', 'lime', 11, true,
    '[{"id":"eway_generation","name":"E-Way Bill Generation"},{"id":"eway_tracking","name":"Tracking & Compliance"}]'::jsonb),
  
  ('expenses', 'Expenses & Claims', '💸', 'pink', 12, true,
    '[{"id":"expense_management","name":"Expense Management"},{"id":"expense_claims","name":"Expense Claims"},{"id":"categories","name":"Categories"}]'::jsonb),
  
  ('inventory', 'Inventory', '📦', 'emerald', 13, true,
    '[{"id":"products","name":"Products & Items"},{"id":"stock_management","name":"Stock Management"},{"id":"warehouses","name":"Warehouses"}]'::jsonb),
  
  ('journal', 'Journal Entries', '📒', 'slate', 14, true,
    '[{"id":"journal_entries","name":"Journal Entries"},{"id":"recurring_entries","name":"Recurring Entries"},{"id":"provisions","name":"Provisions & Accruals"}]'::jsonb),
  
  ('gst_actions', 'GST & Tax Compliance', '🏛️', 'yellow', 15, true,
    '[{"id":"gst_filing","name":"GST Filing"},{"id":"einvoice","name":"E-Invoice"},{"id":"itc_reconciliation","name":"ITC Reconciliation"},{"id":"tds_tcs","name":"TDS/TCS"}]'::jsonb),
  
  ('reports_financial', 'Financial Reports', '📈', 'violet', 16, true,
    '[{"id":"profit_loss","name":"Profit & Loss"},{"id":"balance_sheet","name":"Balance Sheet"},{"id":"cash_flow","name":"Cash Flow"},{"id":"payables_reports","name":"Payables Reports"},{"id":"gst_reports","name":"GST Reports"}]'::jsonb),
  
  ('kpi_dashboard', 'KPI Dashboard', '🎯', 'sky', 17, true,
    '[{"id":"financial_ratios","name":"Financial Ratios"},{"id":"health_snapshot","name":"Health Snapshot"},{"id":"performance_kpis","name":"Performance KPIs"}]'::jsonb),
  
  ('trends_analysis', 'Trends & Analysis', '🔮', 'fuchsia', 18, true,
    '[{"id":"period_comparison","name":"Period Comparison"},{"id":"forecasting","name":"Forecasting"},{"id":"anomaly_detection","name":"Anomaly Detection"},{"id":"budget_vs_actual","name":"Budget vs Actual"}]'::jsonb)

ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  sub_modules = EXCLUDED.sub_modules,
  updated_at = now();