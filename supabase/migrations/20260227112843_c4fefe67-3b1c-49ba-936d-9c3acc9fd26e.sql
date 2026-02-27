
-- Create mcq_pending_states table (Gap 3/4/5/6)
CREATE TABLE IF NOT EXISTS public.mcq_pending_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT 'unknown',
  mcq_type TEXT NOT NULL DEFAULT 'disambiguation',
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_option JSONB,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  pending_tool TEXT,
  pending_args JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '10 minutes'),
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create query_routing_logs table (Gap 9)
CREATE TABLE IF NOT EXISTS public.query_routing_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id TEXT NOT NULL,
  conversation_id TEXT,
  entity_id TEXT NOT NULL,
  user_id TEXT,
  query TEXT NOT NULL,
  route_path TEXT NOT NULL,
  category TEXT,
  intent_matched TEXT,
  intent_confidence REAL,
  tools_loaded TEXT[] DEFAULT '{}',
  tools_used TEXT[] DEFAULT '{}',
  tools_failed TEXT[] DEFAULT '{}',
  tool_selection_strategy TEXT,
  model_used TEXT,
  model_tier TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  response_time_ms INTEGER,
  is_write_operation BOOLEAN DEFAULT false,
  write_tool_results JSONB DEFAULT '[]'::jsonb,
  cache_hit BOOLEAN DEFAULT false,
  enrichments_applied TEXT[] DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for mcq_pending_states
CREATE INDEX IF NOT EXISTS idx_mcq_conversation_status ON public.mcq_pending_states (conversation_id, status);

-- Indexes for query_routing_logs
CREATE INDEX IF NOT EXISTS idx_routing_logs_entity ON public.query_routing_logs (entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routing_logs_route ON public.query_routing_logs (route_path, created_at DESC);

-- RLS for mcq_pending_states
ALTER TABLE public.mcq_pending_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on mcq_pending_states" ON public.mcq_pending_states FOR SELECT USING (true);
CREATE POLICY "Allow public insert on mcq_pending_states" ON public.mcq_pending_states FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on mcq_pending_states" ON public.mcq_pending_states FOR UPDATE USING (true);

-- RLS for query_routing_logs
ALTER TABLE public.query_routing_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on query_routing_logs" ON public.query_routing_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert on query_routing_logs" ON public.query_routing_logs FOR INSERT WITH CHECK (true);
