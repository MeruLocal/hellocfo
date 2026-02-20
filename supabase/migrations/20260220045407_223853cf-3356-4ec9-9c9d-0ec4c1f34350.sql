-- Create WhatsApp templates table
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  template_key text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'accounting',
  description text,
  message_body text NOT NULL DEFAULT '',
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_template boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  whatsapp_category text NOT NULL DEFAULT 'UTILITY',
  country_codes text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 100,
  twilio_sid text,
  meta_template_id text,
  meta_status text,
  meta_quality_score text,
  meta_rejection_reason text,
  meta_submitted_at timestamp with time zone,
  meta_reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on whatsapp_templates"
  ON public.whatsapp_templates FOR SELECT USING (true);
CREATE POLICY "Allow public insert on whatsapp_templates"
  ON public.whatsapp_templates FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on whatsapp_templates"
  ON public.whatsapp_templates FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on whatsapp_templates"
  ON public.whatsapp_templates FOR DELETE USING (true);

-- Create template_notifications table
CREATE TABLE IF NOT EXISTS public.template_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id uuid NOT NULL,
  template_name text NOT NULL,
  notification_type text NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  rejection_reason text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.template_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on template_notifications"
  ON public.template_notifications FOR SELECT USING (true);
CREATE POLICY "Allow public insert on template_notifications"
  ON public.template_notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on template_notifications"
  ON public.template_notifications FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on template_notifications"
  ON public.template_notifications FOR DELETE USING (true);

-- Create meta_blocked_content table
CREATE TABLE IF NOT EXISTS public.meta_blocked_content (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern text NOT NULL,
  pattern_type text NOT NULL DEFAULT 'keyword',
  category text NOT NULL DEFAULT 'general',
  severity text NOT NULL DEFAULT 'warn',
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_blocked_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on meta_blocked_content"
  ON public.meta_blocked_content FOR SELECT USING (true);
CREATE POLICY "Allow public insert on meta_blocked_content"
  ON public.meta_blocked_content FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on meta_blocked_content"
  ON public.meta_blocked_content FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on meta_blocked_content"
  ON public.meta_blocked_content FOR DELETE USING (true);

-- Create meta_rate_limits table
CREATE TABLE IF NOT EXISTS public.meta_rate_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_type text NOT NULL,
  window_start timestamp with time zone NOT NULL DEFAULT now(),
  window_end timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on meta_rate_limits"
  ON public.meta_rate_limits FOR SELECT USING (true);
CREATE POLICY "Allow public insert on meta_rate_limits"
  ON public.meta_rate_limits FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete on meta_rate_limits"
  ON public.meta_rate_limits FOR DELETE USING (true);

-- Create meta_messaging_consent table
CREATE TABLE IF NOT EXISTS public.meta_messaging_consent (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_e164 text NOT NULL UNIQUE,
  consent_type text NOT NULL DEFAULT 'explicit',
  consent_source text NOT NULL,
  consented_at timestamp with time zone NOT NULL DEFAULT now(),
  opted_out_at timestamp with time zone,
  is_active boolean NOT NULL DEFAULT true,
  entity_id text,
  org_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_messaging_consent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on meta_messaging_consent"
  ON public.meta_messaging_consent FOR SELECT USING (true);
CREATE POLICY "Allow public insert on meta_messaging_consent"
  ON public.meta_messaging_consent FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on meta_messaging_consent"
  ON public.meta_messaging_consent FOR UPDATE USING (true);

-- Create meta_template_audit table
CREATE TABLE IF NOT EXISTS public.meta_template_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_name text NOT NULL,
  action text NOT NULL,
  validation_result jsonb,
  meta_response jsonb,
  submitted_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_template_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on meta_template_audit"
  ON public.meta_template_audit FOR SELECT USING (true);
CREATE POLICY "Allow public insert on meta_template_audit"
  ON public.meta_template_audit FOR INSERT WITH CHECK (true);

-- Create meta_account_health table
CREATE TABLE IF NOT EXISTS public.meta_account_health (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quality_rating text NOT NULL DEFAULT 'GREEN',
  messaging_limit text NOT NULL DEFAULT 'TIER_1K',
  current_quality_score numeric NOT NULL DEFAULT 1.0,
  account_status text NOT NULL DEFAULT 'ACTIVE',
  templates_submitted_today integer NOT NULL DEFAULT 0,
  messages_sent_today integer NOT NULL DEFAULT 0,
  templates_approved_30d integer NOT NULL DEFAULT 0,
  templates_rejected_30d integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_account_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on meta_account_health"
  ON public.meta_account_health FOR SELECT USING (true);
CREATE POLICY "Allow public insert on meta_account_health"
  ON public.meta_account_health FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on meta_account_health"
  ON public.meta_account_health FOR UPDATE USING (true);

-- Insert default account health row
INSERT INTO public.meta_account_health (quality_rating, messaging_limit, current_quality_score, account_status)
VALUES ('GREEN', 'TIER_1K', 1.0, 'ACTIVE')
ON CONFLICT DO NOTHING;

-- Add updated_at trigger for whatsapp_templates
CREATE OR REPLACE FUNCTION public.update_whatsapp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_whatsapp_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_whatsapp_updated_at();