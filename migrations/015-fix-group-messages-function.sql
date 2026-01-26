-- ============================================
-- MIGRATION 015: Fix Group Messages Function
-- ============================================
-- Updates the get_group_messages function to resolve ambiguous column reference.
-- Replaces usage of created_at with message_created_at in output.

DROP FUNCTION IF EXISTS get_group_messages(UUID, INT, UUID);

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
  message_created_at TIMESTAMPTZ
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
    gm.created_at as message_created_at
  FROM group_messages gm
  JOIN profiles p ON p.id = gm.sender_id
  WHERE gm.leader_id = v_leader_id
    AND (p_before_id IS NULL OR gm.created_at < (SELECT gm2.created_at FROM group_messages gm2 WHERE gm2.id = p_before_id))
  ORDER BY gm.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_group_messages TO authenticated;
