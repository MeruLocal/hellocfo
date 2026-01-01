-- Create a table for tracking LLM API usage
CREATE TABLE public.llm_usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  llm_config_id UUID REFERENCES public.llm_configs(id) ON DELETE SET NULL,
  intent_id TEXT REFERENCES public.intents(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  section TEXT NOT NULL, -- 'training', 'entities', 'pipeline', 'enrichments', 'response', 'all'
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER, -- response time in milliseconds
  status TEXT NOT NULL DEFAULT 'success', -- 'success', 'error'
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add usage tracking columns to intents table
ALTER TABLE public.intents 
ADD COLUMN IF NOT EXISTS total_tokens_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS generation_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_generation_tokens INTEGER DEFAULT 0;

-- Add usage tracking columns to llm_configs table
ALTER TABLE public.llm_configs 
ADD COLUMN IF NOT EXISTS total_tokens_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_requests INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_input_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_output_tokens INTEGER DEFAULT 0;

-- Enable RLS on llm_usage_logs
ALTER TABLE public.llm_usage_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for reading usage logs (public read for now)
CREATE POLICY "Allow public read access to llm_usage_logs"
ON public.llm_usage_logs FOR SELECT
USING (true);

-- Create policy for inserting usage logs (allow from edge functions)
CREATE POLICY "Allow public insert to llm_usage_logs"
ON public.llm_usage_logs FOR INSERT
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_llm_usage_logs_intent_id ON public.llm_usage_logs(intent_id);
CREATE INDEX idx_llm_usage_logs_llm_config_id ON public.llm_usage_logs(llm_config_id);
CREATE INDEX idx_llm_usage_logs_created_at ON public.llm_usage_logs(created_at DESC);