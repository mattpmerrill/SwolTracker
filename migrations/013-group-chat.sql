-- ============================================
-- MIGRATION 013: Group Chat System
-- ============================================
-- Adds real-time group chat functionality for workout groups.

-- Create group_messages table
CREATE TABLE group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_group_messages_leader ON group_messages(leader_id);
CREATE INDEX idx_group_messages_created ON group_messages(leader_id, created_at DESC);

-- Enable RLS
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view messages in their group
CREATE POLICY "View group messages" ON group_messages
  FOR SELECT USING (
    leader_id = auth.uid()  -- Leader sees their group's messages
    OR sender_id = auth.uid()  -- Sender always sees their own messages
    OR leader_id = (  -- Members see their leader's group messages
      SELECT br.leader_id FROM buddy_requests br
      WHERE br.member_id = auth.uid() AND br.status = 'accepted'
      LIMIT 1
    )
  );

-- Policy: Users can send messages to their group
CREATE POLICY "Send group messages" ON group_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND (
      leader_id = auth.uid()  -- Leader posting to their own group
      OR leader_id = (  -- Member posting to their leader's group
        SELECT br.leader_id FROM buddy_requests br
        WHERE br.member_id = auth.uid() AND br.status = 'accepted'
        LIMIT 1
      )
    )
  );

-- Enable Supabase Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE group_messages;

-- ============================================
-- RPC FUNCTIONS
-- ============================================

-- Get group messages with sender profile info
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
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leader_id UUID;
BEGIN
  -- Determine the group leader (user's leader if member, or user themselves if leader/independent)
  SELECT COALESCE(
    (SELECT br.leader_id FROM buddy_requests br
     WHERE br.member_id = p_user_id AND br.status = 'accepted' LIMIT 1),
    p_user_id
  ) INTO v_leader_id;

  RETURN QUERY
  SELECT
    gm.id,
    gm.sender_id,
    p.name as sender_name,
    p.avatar as sender_avatar,
    p.avatar_url as sender_avatar_url,
    gm.content,
    gm.created_at
  FROM group_messages gm
  JOIN profiles p ON p.id = gm.sender_id
  WHERE gm.leader_id = v_leader_id
    AND (p_before_id IS NULL OR gm.created_at < (SELECT created_at FROM group_messages WHERE id = p_before_id))
  ORDER BY gm.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_group_messages TO authenticated;

-- Send a group message
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
  -- Validate content
  IF p_content IS NULL OR char_length(trim(p_content)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message cannot be empty');
  END IF;

  IF char_length(p_content) > 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message too long (max 500 characters)');
  END IF;

  -- Determine the group leader
  SELECT COALESCE(
    (SELECT br.leader_id FROM buddy_requests br
     WHERE br.member_id = p_user_id AND br.status = 'accepted' LIMIT 1),
    p_user_id
  ) INTO v_leader_id;

  -- Check if user is actually in a group (either as leader or member)
  IF NOT EXISTS (
    SELECT 1 FROM buddy_requests
    WHERE (leader_id = p_user_id OR member_id = p_user_id) AND status = 'accepted'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be in a group to send messages');
  END IF;

  -- Insert the message
  INSERT INTO group_messages (leader_id, sender_id, content)
  VALUES (v_leader_id, p_user_id, trim(p_content))
  RETURNING id INTO v_message_id;

  RETURN jsonb_build_object('success', true, 'message_id', v_message_id);
END;
$$;

GRANT EXECUTE ON FUNCTION send_group_message TO authenticated;

-- Get the leader ID for a user (helper for real-time subscription filter)
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
