ALTER TABLE query_routing_logs ADD COLUMN IF NOT EXISTS step_timings JSONB DEFAULT '{}';
ALTER TABLE query_routing_logs ADD COLUMN IF NOT EXISTS step_results JSONB DEFAULT '{}';
ALTER TABLE query_routing_logs ADD COLUMN IF NOT EXISTS mcq_shown BOOLEAN DEFAULT false;
ALTER TABLE query_routing_logs ADD COLUMN IF NOT EXISTS mcq_type TEXT;
ALTER TABLE query_routing_logs ADD COLUMN IF NOT EXISTS mcq_resolved BOOLEAN;
ALTER TABLE query_routing_logs ADD COLUMN IF NOT EXISTS guardrails_triggered TEXT[] DEFAULT '{}';
ALTER TABLE query_routing_logs ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(10,6);