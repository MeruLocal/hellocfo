
CREATE INDEX IF NOT EXISTS idx_unified_conversations_user_entity 
  ON unified_conversations(user_id, entity_id, updated_at DESC);

CREATE POLICY "Allow public update on feedback_log"
  ON feedback_log FOR UPDATE USING (true);
