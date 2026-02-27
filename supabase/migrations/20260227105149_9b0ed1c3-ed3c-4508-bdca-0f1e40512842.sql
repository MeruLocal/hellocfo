
-- MCP Tools Master Registry (shared across all entities)
CREATE TABLE IF NOT EXISTS public.mcp_tools_master (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tool_name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  method text NOT NULL DEFAULT 'POST',
  endpoint text,
  input_schema jsonb DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  total_calls integer NOT NULL DEFAULT 0,
  avg_response_time_ms integer,
  last_called_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Chat usage logs with token tracking per entity
CREATE TABLE IF NOT EXISTS public.chat_usage_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id text NOT NULL,
  entity_id text NOT NULL,
  org_id text,
  user_id text NOT NULL,
  message_count integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  provider text NOT NULL DEFAULT 'azure-openai',
  model text NOT NULL DEFAULT 'gpt-4o',
  estimated_cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  tools_used text[] DEFAULT '{}'::text[],
  tools_called_count integer NOT NULL DEFAULT 0,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mcp_tools_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_usage_logs ENABLE ROW LEVEL SECURITY;

-- Public access policies for mcp_tools_master
CREATE POLICY "Allow public read on mcp_tools_master" ON public.mcp_tools_master FOR SELECT USING (true);
CREATE POLICY "Allow public insert on mcp_tools_master" ON public.mcp_tools_master FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on mcp_tools_master" ON public.mcp_tools_master FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on mcp_tools_master" ON public.mcp_tools_master FOR DELETE USING (true);

-- Public access policies for chat_usage_logs
CREATE POLICY "Allow public read on chat_usage_logs" ON public.chat_usage_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert on chat_usage_logs" ON public.chat_usage_logs FOR INSERT WITH CHECK (true);

-- Index for fast entity-level queries
CREATE INDEX idx_chat_usage_logs_entity ON public.chat_usage_logs(entity_id);
CREATE INDEX idx_chat_usage_logs_created ON public.chat_usage_logs(created_at);
CREATE INDEX idx_chat_usage_logs_conversation ON public.chat_usage_logs(conversation_id);
