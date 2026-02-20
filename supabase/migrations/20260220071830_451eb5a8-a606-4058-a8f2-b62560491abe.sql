
-- 1. Add columns to unified_conversations for Munimji Chat UI
ALTER TABLE public.unified_conversations ADD COLUMN IF NOT EXISTS chat_number INTEGER;
ALTER TABLE public.unified_conversations ADD COLUMN IF NOT EXISTS chat_display_id TEXT;
ALTER TABLE public.unified_conversations ADD COLUMN IF NOT EXISTS chat_name TEXT;
ALTER TABLE public.unified_conversations ADD COLUMN IF NOT EXISTS auto_generated_name TEXT;
ALTER TABLE public.unified_conversations ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'general';
ALTER TABLE public.unified_conversations ADD COLUMN IF NOT EXISTS last_message_preview TEXT;
ALTER TABLE public.unified_conversations ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

-- 2. Indexes for fast history queries
CREATE INDEX IF NOT EXISTS idx_uc_entity_updated 
  ON public.unified_conversations(entity_id, updated_at DESC) 
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_uc_chat_number 
  ON public.unified_conversations(entity_id, chat_number);

CREATE INDEX IF NOT EXISTS idx_uc_search 
  ON public.unified_conversations 
  USING gin(to_tsvector('english', COALESCE(chat_name, '') || ' ' || COALESCE(auto_generated_name, '') || ' ' || COALESCE(summary, '')));

-- 3. Create entities table
CREATE TABLE IF NOT EXISTS public.entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id text UNIQUE NOT NULL,
  org_id text,
  name text NOT NULL,
  gstin text,
  currency text DEFAULT 'INR',
  is_default boolean DEFAULT false,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on entities" ON public.entities FOR SELECT USING (true);
CREATE POLICY "Allow public insert on entities" ON public.entities FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on entities" ON public.entities FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on entities" ON public.entities FOR DELETE USING (true);

-- 4. Create quick_suggestions table
CREATE TABLE IF NOT EXISTS public.quick_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id text,
  label text NOT NULL,
  message text NOT NULL,
  icon text DEFAULT '💡',
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quick_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on quick_suggestions" ON public.quick_suggestions FOR SELECT USING (true);
CREATE POLICY "Allow public insert on quick_suggestions" ON public.quick_suggestions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on quick_suggestions" ON public.quick_suggestions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on quick_suggestions" ON public.quick_suggestions FOR DELETE USING (true);

-- 5. Create attachments storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  false,
  20971520,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','text/plain']
) ON CONFLICT (id) DO NOTHING;

-- 6. Storage RLS for chat-attachments
CREATE POLICY "Allow public upload to chat-attachments" 
  ON storage.objects FOR INSERT 
  WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY "Allow public read from chat-attachments" 
  ON storage.objects FOR SELECT 
  USING (bucket_id = 'chat-attachments');

CREATE POLICY "Allow public delete from chat-attachments" 
  ON storage.objects FOR DELETE 
  USING (bucket_id = 'chat-attachments');

-- 7. Seed default quick suggestions (global, no entity_id)
INSERT INTO public.quick_suggestions (label, message, icon, sort_order) VALUES
  ('Outstanding Invoices', 'Show me all outstanding invoices', '📄', 1),
  ('Cash Flow', 'What is my cash flow this month?', '💰', 2),
  ('Overdue Payments', 'List all overdue customer payments', '⚠️', 3),
  ('P&L Summary', 'Show profit and loss summary for this month', '📊', 4)
ON CONFLICT DO NOTHING;
