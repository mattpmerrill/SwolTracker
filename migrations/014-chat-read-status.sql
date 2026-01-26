-- ============================================
-- MIGRATION 014: Chat Read Status for Unread Indicators
-- ============================================
-- Tracks when users last read chat messages to show unread indicators.

-- Create chat_read_status table
CREATE TABLE chat_read_status (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  leader_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for looking up read status
CREATE INDEX idx_chat_read_status_leader ON chat_read_status(leader_id);

-- Enable RLS
ALTER TABLE chat_read_status ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only manage their own read status
CREATE POLICY "Users manage own read status" ON chat_read_status
  FOR ALL USING (user_id = auth.uid());

-- ============================================
-- RPC FUNCTIONS
-- ============================================

-- Check if user has unread messages
CREATE OR REPLACE FUNCTION has_unread_messages(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leader_id UUID;
  v_last_read TIMESTAMPTZ;
  v_has_unread BOOLEAN;
BEGIN
  -- Get user's group leader (or self if leader)
  SELECT COALESCE(
    (SELECT br.leader_id FROM buddy_requests br
     WHERE br.member_id = p_user_id AND br.status = 'accepted' LIMIT 1),
    p_user_id
  ) INTO v_leader_id;

  -- Check if user is actually in a group
  IF NOT EXISTS (
    SELECT 1 FROM buddy_requests
    WHERE (leader_id = p_user_id OR member_id = p_user_id) AND status = 'accepted'
  ) THEN
    RETURN false;
  END IF;

  -- Get last read timestamp
  SELECT last_read_at INTO v_last_read
  FROM chat_read_status
  WHERE user_id = p_user_id;

  -- Check for messages newer than last read (excluding own messages)
  SELECT EXISTS (
    SELECT 1 FROM group_messages
    WHERE leader_id = v_leader_id
      AND sender_id != p_user_id
      AND created_at > COALESCE(v_last_read, '1970-01-01'::timestamptz)
  ) INTO v_has_unread;

  RETURN v_has_unread;
END;
$$;

GRANT EXECUTE ON FUNCTION has_unread_messages TO authenticated;

-- Mark messages as read (update or insert last_read_at)
CREATE OR REPLACE FUNCTION mark_messages_read(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leader_id UUID;
BEGIN
  -- Get user's group leader
  SELECT COALESCE(
    (SELECT br.leader_id FROM buddy_requests br
     WHERE br.member_id = p_user_id AND br.status = 'accepted' LIMIT 1),
    p_user_id
  ) INTO v_leader_id;

  -- Upsert read status
  INSERT INTO chat_read_status (user_id, leader_id, last_read_at)
  VALUES (p_user_id, v_leader_id, NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET last_read_at = NOW(), leader_id = EXCLUDED.leader_id;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_messages_read TO authenticated;
