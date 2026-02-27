
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Gap 10: intent_embeddings — for BGE-M3 vector search (Phase 1)
CREATE TABLE IF NOT EXISTS public.intent_embeddings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  intent_id TEXT NOT NULL,
  intent_name TEXT NOT NULL,
  phrase TEXT NOT NULL,
  embedding extensions.vector(1024),
  model TEXT NOT NULL DEFAULT 'bge-m3',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.intent_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public insert on intent_embeddings" ON public.intent_embeddings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read on intent_embeddings" ON public.intent_embeddings FOR SELECT USING (true);
CREATE POLICY "Allow public update on intent_embeddings" ON public.intent_embeddings FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on intent_embeddings" ON public.intent_embeddings FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_intent_embeddings_intent_id ON public.intent_embeddings (intent_id);

-- Gap 10: embedding_jobs — queue for auto-embedding on intent change
CREATE TABLE IF NOT EXISTS public.embedding_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  intent_id TEXT NOT NULL,
  intent_name TEXT NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'full_reindex',
  status TEXT NOT NULL DEFAULT 'pending',
  phrases_count INTEGER DEFAULT 0,
  processed_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.embedding_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public insert on embedding_jobs" ON public.embedding_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read on embedding_jobs" ON public.embedding_jobs FOR SELECT USING (true);
CREATE POLICY "Allow public update on embedding_jobs" ON public.embedding_jobs FOR UPDATE USING (true);
