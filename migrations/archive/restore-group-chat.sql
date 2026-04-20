-- ============================================
-- ROLLBACK: Restore Group Chat
-- ============================================
-- Reverses migrations/026-remove-group-chat.sql.
-- Recreates group_messages, chat_read_status, and the 5 RPCs.
-- Schemas match 013-group-chat.sql + 014-chat-read-status.sql + 015-fix-group-messages-function.sql
-- plus the rate-limited send_group_message override from 019-admin-rpc-and-rate-limiting.sql.

-- Tables
CREATE TABLE IF NOT EXISTS group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_leader ON group_messages(leader_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_created ON group_messages(leader_id, created_at DESC);

ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View group messages" ON group_messages
  FOR SELECT USING (
    leader_id = auth.uid()
    OR sender_id = auth.uid()
    OR leader_id = (
      SELECT br.leader_id FROM buddy_requests br
      WHERE br.member_id = auth.uid() AND br.status = 'accepted'
      LIMIT 1
    )
  );

CREATE POLICY "Send group messages" ON group_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND (
      leader_id = auth.uid()
      OR leader_id = (
        SELECT br.leader_id FROM buddy_requests br
        WHERE br.member_id = auth.uid() AND br.status = 'accepted'
        LIMIT 1
      )
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE group_messages;

CREATE TABLE IF NOT EXISTS chat_read_status (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  leader_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_read_status_leader ON chat_read_status(leader_id);

ALTER TABLE chat_read_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own read status" ON chat_read_status
  FOR ALL USING (user_id = auth.uid());

-- Functions

CREATE OR REPLACE FUNCTION get_user_group_leader_id(p_user_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT br.leader_id FROM buddy_requests br
     WHERE br.member_id = p_user_id AND br.status = 'accepted' LIMIT 1),
    p_user_id
  );
$$;
GRANT EXECUTE ON FUNCTION get_user_group_leader_id TO authenticated;

CREATE OR REPLACE FUNCTION get_group_messages(
  p_user_id UUID,
  p_limit INT DEFAULT 50,
  p_before_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  sender_id UUID,
  sender_name TEXT,
  sender_avatar TEXT,
  sender_avatar_url TEXT,
  content TEXT,
  message_created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leader_id UUID;
BEGIN
  SELECT COALESCE(
    (SELECT br.leader_id FROM buddy_requests br
     WHERE br.member_id = p_user_id AND br.status = 'accepted' LIMIT 1),
    p_user_id
  ) INTO v_leader_id;

  RETURN QUERY
  SELECT gm.id, gm.sender_id, p.name, p.avatar, p.avatar_url,
         gm.content, gm.created_at
  FROM group_messages gm
  JOIN profiles p ON p.id = gm.sender_id
  WHERE gm.leader_id = v_leader_id
    AND (p_before_id IS NULL OR gm.created_at < (SELECT gm2.created_at FROM group_messages gm2 WHERE gm2.id = p_before_id))
  ORDER BY gm.created_at DESC
  LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION get_group_messages TO authenticated;

CREATE OR REPLACE FUNCTION send_group_message(p_user_id UUID, p_content TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leader_id UUID;
  v_message_id UUID;
BEGIN
  IF p_content IS NULL OR char_length(trim(p_content)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message cannot be empty');
  END IF;
  IF char_length(p_content) > 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message too long (max 500 characters)');
  END IF;

  SELECT COALESCE(
    (SELECT br.leader_id FROM buddy_requests br
     WHERE br.member_id = p_user_id AND br.status = 'accepted' LIMIT 1),
    p_user_id
  ) INTO v_leader_id;

  IF NOT EXISTS (
    SELECT 1 FROM buddy_requests br2
    WHERE (br2.leader_id = p_user_id OR br2.member_id = p_user_id) AND br2.status = 'accepted'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be in a group to send messages');
  END IF;

  INSERT INTO group_messages (leader_id, sender_id, content)
  VALUES (v_leader_id, p_user_id, trim(p_content))
  RETURNING id INTO v_message_id;

  RETURN jsonb_build_object('success', true, 'message_id', v_message_id);
END;
$$;
GRANT EXECUTE ON FUNCTION send_group_message TO authenticated;

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
  SELECT COALESCE(
    (SELECT br.leader_id FROM buddy_requests br
     WHERE br.member_id = p_user_id AND br.status = 'accepted' LIMIT 1),
    p_user_id
  ) INTO v_leader_id;

  IF NOT EXISTS (
    SELECT 1 FROM buddy_requests
    WHERE (leader_id = p_user_id OR member_id = p_user_id) AND status = 'accepted'
  ) THEN
    RETURN false;
  END IF;

  SELECT last_read_at INTO v_last_read FROM chat_read_status WHERE user_id = p_user_id;

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

CREATE OR REPLACE FUNCTION mark_messages_read(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leader_id UUID;
BEGIN
  SELECT COALESCE(
    (SELECT br.leader_id FROM buddy_requests br
     WHERE br.member_id = p_user_id AND br.status = 'accepted' LIMIT 1),
    p_user_id
  ) INTO v_leader_id;

  INSERT INTO chat_read_status (user_id, leader_id, last_read_at)
  VALUES (p_user_id, v_leader_id, NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET last_read_at = NOW(), leader_id = EXCLUDED.leader_id;
END;
$$;
GRANT EXECUTE ON FUNCTION mark_messages_read TO authenticated;
