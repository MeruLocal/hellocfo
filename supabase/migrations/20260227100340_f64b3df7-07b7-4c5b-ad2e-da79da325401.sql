-- Migrate existing intents from old module IDs to new ones
UPDATE intents SET module_id = 'invoices' WHERE module_id = 'sales';
UPDATE intents SET module_id = 'bills' WHERE module_id = 'purchases';
UPDATE intents SET module_id = 'reports_financial' WHERE module_id = 'reports';