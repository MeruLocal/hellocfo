-- ============================================================================
-- CFO AI Engine - Dynamic Database Schema
-- ============================================================================

-- Modules table
CREATE TABLE public.modules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📁',
  color TEXT NOT NULL DEFAULT 'blue',
  sub_modules JSONB NOT NULL DEFAULT '[]',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Country configurations table
CREATE TABLE public.country_configs (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  flag TEXT NOT NULL,
  currency TEXT NOT NULL,
  currency_symbol TEXT NOT NULL,
  size_thresholds JSONB NOT NULL,
  display_thresholds JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Entity types table
CREATE TABLE public.entity_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enrichment types table
CREATE TABLE public.enrichment_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '⚡',
  description TEXT,
  config_fields JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LLM providers table
CREATE TABLE public.llm_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🤖',
  models JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Response types table
CREATE TABLE public.response_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Intents table (main entity)
CREATE TABLE public.intents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  module_id TEXT NOT NULL,
  sub_module_id TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  training_phrases JSONB NOT NULL DEFAULT '[]',
  entities JSONB NOT NULL DEFAULT '[]',
  resolution_flow JSONB,
  generated_by TEXT NOT NULL DEFAULT 'manual' CHECK (generated_by IN ('ai', 'manual', 'pending')),
  ai_confidence NUMERIC(3,2),
  last_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Business context table (single row per user/session)
CREATE TABLE public.business_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country TEXT NOT NULL DEFAULT 'IN',
  industry TEXT NOT NULL DEFAULT 'manufacturing',
  sub_industry TEXT,
  entity_size TEXT NOT NULL DEFAULT 'medium',
  annual_revenue NUMERIC,
  employee_count INT,
  fiscal_year_end TEXT NOT NULL DEFAULT 'March',
  currency TEXT NOT NULL DEFAULT 'INR',
  compliance_frameworks JSONB NOT NULL DEFAULT '[]',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LLM config table
CREATE TABLE public.llm_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'openai',
  model TEXT NOT NULL DEFAULT 'gpt-4-turbo',
  api_key TEXT,
  endpoint TEXT,
  temperature NUMERIC(2,1) NOT NULL DEFAULT 0.3,
  max_tokens INT NOT NULL DEFAULT 4096,
  system_prompt_override TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for all tables
CREATE TRIGGER update_modules_updated_at BEFORE UPDATE ON public.modules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_country_configs_updated_at BEFORE UPDATE ON public.country_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_entity_types_updated_at BEFORE UPDATE ON public.entity_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_enrichment_types_updated_at BEFORE UPDATE ON public.enrichment_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_llm_providers_updated_at BEFORE UPDATE ON public.llm_providers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_response_types_updated_at BEFORE UPDATE ON public.response_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_intents_updated_at BEFORE UPDATE ON public.intents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_business_contexts_updated_at BEFORE UPDATE ON public.business_contexts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_llm_configs_updated_at BEFORE UPDATE ON public.llm_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on all tables (public read, authenticated write)
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.response_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_configs ENABLE ROW LEVEL SECURITY;

-- Public read policies for configuration tables
CREATE POLICY "Allow public read on modules" ON public.modules FOR SELECT USING (true);
CREATE POLICY "Allow public read on country_configs" ON public.country_configs FOR SELECT USING (true);
CREATE POLICY "Allow public read on entity_types" ON public.entity_types FOR SELECT USING (true);
CREATE POLICY "Allow public read on enrichment_types" ON public.enrichment_types FOR SELECT USING (true);
CREATE POLICY "Allow public read on llm_providers" ON public.llm_providers FOR SELECT USING (true);
CREATE POLICY "Allow public read on response_types" ON public.response_types FOR SELECT USING (true);
CREATE POLICY "Allow public read on intents" ON public.intents FOR SELECT USING (true);
CREATE POLICY "Allow public read on business_contexts" ON public.business_contexts FOR SELECT USING (true);
CREATE POLICY "Allow public read on llm_configs" ON public.llm_configs FOR SELECT USING (true);

-- Public write policies (for now, can be restricted later with auth)
CREATE POLICY "Allow public insert on modules" ON public.modules FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on modules" ON public.modules FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on modules" ON public.modules FOR DELETE USING (true);

CREATE POLICY "Allow public insert on country_configs" ON public.country_configs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on country_configs" ON public.country_configs FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on country_configs" ON public.country_configs FOR DELETE USING (true);

CREATE POLICY "Allow public insert on entity_types" ON public.entity_types FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on entity_types" ON public.entity_types FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on entity_types" ON public.entity_types FOR DELETE USING (true);

CREATE POLICY "Allow public insert on enrichment_types" ON public.enrichment_types FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on enrichment_types" ON public.enrichment_types FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on enrichment_types" ON public.enrichment_types FOR DELETE USING (true);

CREATE POLICY "Allow public insert on llm_providers" ON public.llm_providers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on llm_providers" ON public.llm_providers FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on llm_providers" ON public.llm_providers FOR DELETE USING (true);

CREATE POLICY "Allow public insert on response_types" ON public.response_types FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on response_types" ON public.response_types FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on response_types" ON public.response_types FOR DELETE USING (true);

CREATE POLICY "Allow public insert on intents" ON public.intents FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on intents" ON public.intents FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on intents" ON public.intents FOR DELETE USING (true);

CREATE POLICY "Allow public insert on business_contexts" ON public.business_contexts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on business_contexts" ON public.business_contexts FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on business_contexts" ON public.business_contexts FOR DELETE USING (true);

CREATE POLICY "Allow public insert on llm_configs" ON public.llm_configs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on llm_configs" ON public.llm_configs FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on llm_configs" ON public.llm_configs FOR DELETE USING (true);