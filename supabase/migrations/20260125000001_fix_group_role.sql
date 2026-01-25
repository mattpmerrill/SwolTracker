-- Fix ambiguous column reference in get_group_role function
-- The RETURNS TABLE column 'leader_id' conflicts with buddy_requests.leader_id

DROP FUNCTION IF EXISTS get_group_role(UUID);

CREATE OR REPLACE FUNCTION get_group_role(p_user_id UUID)
RETURNS TABLE (
  role TEXT,
  leader_id UUID,
  leader_name TEXT,
  leader_avatar TEXT,
  member_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_leader_id UUID;
  v_leader_name TEXT;
  v_leader_avatar TEXT;
  v_member_count INT;
BEGIN
  -- Check if user is a member (following someone)
  SELECT br.leader_id, p.name, p.avatar
  INTO v_leader_id, v_leader_name, v_leader_avatar
  FROM buddy_requests br
  JOIN profiles p ON p.id = br.leader_id
  WHERE br.member_id = p_user_id AND br.status = 'accepted'
  LIMIT 1;

  IF v_leader_id IS NOT NULL THEN
    v_role := 'member';
    v_member_count := 0;
  ELSE
    -- Check if user is a leader (has followers) - use table alias to avoid ambiguity
    SELECT COUNT(*)::INT INTO v_member_count
    FROM buddy_requests br2
    WHERE br2.leader_id = p_user_id AND br2.status = 'accepted';

    IF v_member_count > 0 THEN
      v_role := 'leader';
    ELSE
      v_role := 'independent';
    END IF;
  END IF;

  RETURN QUERY SELECT v_role, v_leader_id, v_leader_name, v_leader_avatar, v_member_count;
END;
$$;

GRANT EXECUTE ON FUNCTION get_group_role TO authenticated;
