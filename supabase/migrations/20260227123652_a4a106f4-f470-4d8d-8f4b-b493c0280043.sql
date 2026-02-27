
-- Master plan metadata table
CREATE TABLE public.master_plan (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size integer NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  uploaded_by uuid REFERENCES auth.users,
  description text,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.master_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on master_plan" ON public.master_plan
  FOR SELECT USING (true);

CREATE POLICY "Allow authenticated insert on master_plan" ON public.master_plan
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated update on master_plan" ON public.master_plan
  FOR UPDATE USING (true);

CREATE POLICY "Allow authenticated delete on master_plan" ON public.master_plan
  FOR DELETE USING (true);

-- Storage bucket for master plan files
INSERT INTO storage.buckets (id, name, public)
VALUES ('master-plan', 'master-plan', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Allow public read on master-plan" ON storage.objects
  FOR SELECT USING (bucket_id = 'master-plan');

CREATE POLICY "Allow authenticated upload to master-plan" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'master-plan');

CREATE POLICY "Allow authenticated update on master-plan" ON storage.objects
  FOR UPDATE USING (bucket_id = 'master-plan');

CREATE POLICY "Allow authenticated delete on master-plan" ON storage.objects
  FOR DELETE USING (bucket_id = 'master-plan');
