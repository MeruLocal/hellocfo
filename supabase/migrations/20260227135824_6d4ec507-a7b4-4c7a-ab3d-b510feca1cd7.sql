
-- Test cases table: stores expected outcomes per intent at each test level
CREATE TABLE public.intent_test_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id TEXT,
  intent_name TEXT NOT NULL,
  test_level INTEGER NOT NULL CHECK (test_level IN (1, 2, 3)),
  test_phrase TEXT NOT NULL,
  
  -- Level 1: Embedding expectations
  expected_similarity_min NUMERIC(4,3) DEFAULT 0.850,
  
  -- Level 2: Tool selection expectations
  expected_tools TEXT[] DEFAULT '{}',
  unexpected_tools TEXT[] DEFAULT '{}',
  expected_tool_source TEXT,
  
  -- Level 3: Full pipeline expectations
  expected_write_validation JSONB,
  expected_prereq_chain TEXT[] DEFAULT '{}',
  expected_prereq_outcome TEXT,
  expected_enrichments TEXT[] DEFAULT '{}',
  expected_mcq_type TEXT,
  expected_response_contains TEXT[] DEFAULT '{}',
  expected_response_not_contains TEXT[] DEFAULT '{}',
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_run_result TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Test runs table: stores results of each regression run
CREATE TABLE public.intent_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_level INTEGER NOT NULL,
  total_cases INTEGER DEFAULT 0,
  passed INTEGER DEFAULT 0,
  warned INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  pass_rate NUMERIC(5,2),
  duration_ms INTEGER,
  triggered_by TEXT DEFAULT 'manual',
  results JSONB DEFAULT '[]',
  step_summary JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast querying
CREATE INDEX idx_intent_test_cases_level ON public.intent_test_cases(test_level);
CREATE INDEX idx_intent_test_cases_intent ON public.intent_test_cases(intent_name);
CREATE INDEX idx_intent_test_cases_active ON public.intent_test_cases(is_active) WHERE is_active = true;
CREATE INDEX idx_intent_test_runs_created ON public.intent_test_runs(created_at DESC);

-- RLS policies (public access like other config tables)
ALTER TABLE public.intent_test_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intent_test_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on intent_test_cases" ON public.intent_test_cases FOR SELECT USING (true);
CREATE POLICY "Allow public insert on intent_test_cases" ON public.intent_test_cases FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on intent_test_cases" ON public.intent_test_cases FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on intent_test_cases" ON public.intent_test_cases FOR DELETE USING (true);

CREATE POLICY "Allow public read on intent_test_runs" ON public.intent_test_runs FOR SELECT USING (true);
CREATE POLICY "Allow public insert on intent_test_runs" ON public.intent_test_runs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on intent_test_runs" ON public.intent_test_runs FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on intent_test_runs" ON public.intent_test_runs FOR DELETE USING (true);
