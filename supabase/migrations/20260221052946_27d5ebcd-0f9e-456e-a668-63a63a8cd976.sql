
-- 1. intent_routing_stats: Success/failure counts per intent per confidence level
CREATE TABLE public.intent_routing_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  intent_id TEXT NOT NULL,
  intent_name TEXT NOT NULL,
  confidence_bucket NUMERIC NOT NULL,
  total_attempts INTEGER NOT NULL DEFAULT 0,
  successful_attempts INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  avg_response_time_ms INTEGER,
  avg_feedback_score REAL,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(intent_id, confidence_bucket)
);

ALTER TABLE public.intent_routing_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on intent_routing_stats" ON public.intent_routing_stats FOR SELECT USING (true);
CREATE POLICY "Allow public insert on intent_routing_stats" ON public.intent_routing_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on intent_routing_stats" ON public.intent_routing_stats FOR UPDATE USING (true);

CREATE TRIGGER update_intent_routing_stats_updated_at
  BEFORE UPDATE ON public.intent_routing_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. llm_path_patterns: Queries that went to LLM path (for discovering new intents)
CREATE TABLE public.llm_path_patterns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  query_text TEXT NOT NULL,
  query_hash TEXT NOT NULL,
  entity_id TEXT,
  tools_used TEXT[] DEFAULT '{}',
  tool_selection_strategy TEXT,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  avg_feedback_score REAL,
  avg_response_time_ms INTEGER,
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  suggested_intent_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_llm_path_patterns_hash ON public.llm_path_patterns(query_hash);
CREATE INDEX idx_llm_path_patterns_occurrence ON public.llm_path_patterns(occurrence_count DESC);

ALTER TABLE public.llm_path_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on llm_path_patterns" ON public.llm_path_patterns FOR SELECT USING (true);
CREATE POLICY "Allow public insert on llm_path_patterns" ON public.llm_path_patterns FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on llm_path_patterns" ON public.llm_path_patterns FOR UPDATE USING (true);

CREATE TRIGGER update_llm_path_patterns_updated_at
  BEFORE UPDATE ON public.llm_path_patterns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. suggested_intents: Auto-discovered intents pending approval
CREATE TABLE public.suggested_intents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_pattern_id UUID REFERENCES public.llm_path_patterns(id),
  suggested_name TEXT NOT NULL,
  suggested_module TEXT,
  suggested_training_phrases JSONB NOT NULL DEFAULT '[]',
  suggested_pipeline JSONB,
  suggested_tools TEXT[] DEFAULT '{}',
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  avg_feedback_score REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_suggested_intents_status ON public.suggested_intents(status);

ALTER TABLE public.suggested_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on suggested_intents" ON public.suggested_intents FOR SELECT USING (true);
CREATE POLICY "Allow public insert on suggested_intents" ON public.suggested_intents FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on suggested_intents" ON public.suggested_intents FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on suggested_intents" ON public.suggested_intents FOR DELETE USING (true);

CREATE TRIGGER update_suggested_intents_updated_at
  BEFORE UPDATE ON public.suggested_intents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
