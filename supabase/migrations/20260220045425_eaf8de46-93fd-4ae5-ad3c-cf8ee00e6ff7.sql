-- Create whatsapp_messages table for analytics
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_e164 text NOT NULL,
  direction text NOT NULL DEFAULT 'outbound',
  message_type text NOT NULL DEFAULT 'template',
  processing_status text NOT NULL DEFAULT 'sent',
  media_content_type text,
  media_url text,
  body text,
  template_key text,
  entity_id text,
  org_id text,
  twilio_sid text,
  error_code text,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on whatsapp_messages"
  ON public.whatsapp_messages FOR SELECT USING (true);
CREATE POLICY "Allow public insert on whatsapp_messages"
  ON public.whatsapp_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on whatsapp_messages"
  ON public.whatsapp_messages FOR UPDATE USING (true);