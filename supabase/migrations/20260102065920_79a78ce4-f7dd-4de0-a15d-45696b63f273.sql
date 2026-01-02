-- Add name column to business_contexts table
ALTER TABLE public.business_contexts ADD COLUMN IF NOT EXISTS name TEXT;