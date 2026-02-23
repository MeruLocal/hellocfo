-- Add org_id column to unified_conversations for org-level conversation filtering
ALTER TABLE public.unified_conversations ADD COLUMN IF NOT EXISTS org_id TEXT;

-- Index for efficient org+entity+user queries
CREATE INDEX IF NOT EXISTS idx_uc_org_entity_user
  ON public.unified_conversations(org_id, entity_id, user_id, updated_at DESC)
  WHERE is_deleted = false;
