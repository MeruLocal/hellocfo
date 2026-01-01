-- Make sub_module_id nullable in intents table
ALTER TABLE public.intents ALTER COLUMN sub_module_id DROP NOT NULL;

-- Set default to empty string for existing constraint compatibility
ALTER TABLE public.intents ALTER COLUMN sub_module_id SET DEFAULT '';