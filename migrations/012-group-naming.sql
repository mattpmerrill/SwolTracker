-- ============================================
-- MIGRATION 012: Group naming for leaders
-- ============================================
-- Allows leaders to give their workout group a custom name.

-- Add group_name column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS group_name TEXT DEFAULT NULL;

-- Must drop first because return type is changing
DROP FUNCTION IF EXISTS get_group_role(UUID);

-- Recreate get_group_role with group_name and avatar_url
CREATE OR REPLACE FUNCTION get_group_role(p_user_id UUID)
RETURNS TABLE (
  role TEXT,
  leader_id UUID,
  leader_name TEXT,
  leader_avatar TEXT,
  leader_avatar_url TEXT,
  member_count INT,
  group_name TEXT
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
  v_leader_avatar_url TEXT;
  v_member_count INT;
  v_group_name TEXT;
BEGIN
  -- Check if user is a member (following someone)
  SELECT br.leader_id, p.name, p.avatar, p.avatar_url, p.group_name
  INTO v_leader_id, v_leader_name, v_leader_avatar, v_leader_avatar_url, v_group_name
  FROM buddy_requests br
  JOIN profiles p ON p.id = br.leader_id
  WHERE br.member_id = p_user_id AND br.status = 'accepted'
  LIMIT 1;

  IF v_leader_id IS NOT NULL THEN
    v_role := 'member';
    v_member_count := 0;
  ELSE
    -- Check if user is a leader (has followers)
    SELECT COUNT(*)::INT INTO v_member_count
    FROM buddy_requests br2
    WHERE br2.leader_id = p_user_id AND br2.status = 'accepted';

    IF v_member_count > 0 THEN
      v_role := 'leader';
      -- Get the user's own group_name
      SELECT p.group_name INTO v_group_name
      FROM profiles p WHERE p.id = p_user_id;
    ELSE
      v_role := 'independent';
      -- Get the user's own group_name (for when they become a leader)
      SELECT p.group_name INTO v_group_name
      FROM profiles p WHERE p.id = p_user_id;
    END IF;
  END IF;

  RETURN QUERY SELECT v_role, v_leader_id, v_leader_name, v_leader_avatar, v_leader_avatar_url, v_member_count, v_group_name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_group_role TO authenticated;
