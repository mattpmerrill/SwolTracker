-- ============================================
-- MIGRATION 026: Remove Group Chat
-- ============================================
-- Retires the group_messages feature end-to-end.
-- Context: AGENT-NATIVE-PLAN.md task 0.3. Group chat duplicates what
-- iMessage/WhatsApp/Discord do better and adds surface area (RLS,
-- realtime, moderation) with no user differentiation. Keeping the
-- buddy/gym concept; removing only the chat.
--
-- Rollback: see migrations/archive/restore-group-chat.sql
-- Verify before running in prod: SELECT count(*), max(created_at) FROM group_messages;

-- Drop from realtime publication first (safe if not present)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE group_messages;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Drop RPCs (depend on the tables)
DROP FUNCTION IF EXISTS get_group_messages(UUID, INT, UUID);
DROP FUNCTION IF EXISTS send_group_message(UUID, TEXT);
DROP FUNCTION IF EXISTS get_user_group_leader_id(UUID);
DROP FUNCTION IF EXISTS has_unread_messages(UUID);
DROP FUNCTION IF EXISTS mark_messages_read(UUID);

-- Drop tables (RLS policies and indexes go with them)
DROP TABLE IF EXISTS chat_read_status;
DROP TABLE IF EXISTS group_messages;
