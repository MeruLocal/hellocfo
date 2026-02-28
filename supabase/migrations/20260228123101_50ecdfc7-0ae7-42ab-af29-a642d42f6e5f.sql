WITH additions(module_id, sub_module_id, sub_module_name) AS (
  VALUES
    ('reports_financial','aged_payables','Aged Payables'),
    ('reports_financial','financial_statements','Financial Statements'),
    ('reports_financial','profit_and_loss','Profit and Loss'),
    ('reports_financial','aged_receivables','Aged Receivables'),
    ('reports_financial','budget_vs_actual','Budget vs Actual'),
    ('reports_financial','day_book','Day Book'),
    ('reports_financial','general_ledger','General Ledger'),
    ('reports_financial','trial_balance','Trial Balance'),

    ('gst','gst_returns','GST Returns'),
    ('gst','gstr1','GSTR-1'),
    ('gst','input_tax_credit','Input Tax Credit'),
    ('gst','e_invoicing','E-Invoicing'),
    ('gst','eway_bills','E-Way Bills'),
    ('gst','gst_liability','GST Liability'),
    ('gst','gstr2a_2b','GSTR-2A / 2B'),
    ('gst','gstr3b','GSTR-3B'),
    ('gst','hsn_summary','HSN Summary'),
    ('gst','reverse_charge','Reverse Charge'),

    ('inventory','stock_items','Stock Items'),
    ('inventory','stock_movements','Stock Movements'),
    ('inventory','batch_tracking','Batch Tracking'),
    ('inventory','stock_valuation','Stock Valuation'),

    ('payments','advance_payments','Advance Payments'),

    ('sales','quotations','Quotations'),

    ('system','greetings','Greetings'),
    ('system','currency','Currency'),
    ('system','data_export','Data Export'),
    ('system','entity_management','Entity Management'),
    ('system','preferences','Preferences'),

    ('tds_tcs','tds_deduction','TDS Deduction'),
    ('tds_tcs','tcs_collection','TCS Collection'),
    ('tds_tcs','tds_returns','TDS Returns'),

    ('bills','vendor_credit_notes','Vendor Credit Notes'),

    ('invoices','credit_notes','Credit Notes'),
    ('invoices','proforma_invoices','Proforma Invoices'),
    ('invoices','recurring_invoices','Recurring Invoices'),
    ('invoices','debit_notes','Debit Notes'),

    ('expenses','expense_categories','Expense Categories'),
    ('expenses','salary_expenses','Salary Expenses'),

    ('fixed_assets','asset_disposal','Asset Disposal'),
    ('fixed_assets','asset_register','Asset Register'),
    ('fixed_assets','depreciation','Depreciation'),

    ('journal_entries','intercompany','Intercompany')
),
missing AS (
  SELECT a.*
  FROM additions a
  JOIN modules m ON m.id = a.module_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(m.sub_modules, '[]'::jsonb)) sm
    WHERE sm->>'id' = a.sub_module_id
  )
),
agg AS (
  SELECT
    module_id,
    jsonb_agg(jsonb_build_object('id', sub_module_id, 'name', sub_module_name)) AS extra_sub_modules
  FROM missing
  GROUP BY module_id
)
UPDATE modules m
SET sub_modules = COALESCE(m.sub_modules, '[]'::jsonb) || a.extra_sub_modules,
    updated_at = now()
FROM agg a
WHERE m.id = a.module_id;