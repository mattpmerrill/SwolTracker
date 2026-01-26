-- ============================================
-- MIGRATION 010: Add avatar_url to group member queries
-- ============================================
-- Updates get_group_members RPC to return avatar_url field
-- so group member lists can display uploaded profile images.

-- Must drop first because return type is changing
DROP FUNCTION IF EXISTS get_group_members(UUID);

-- Recreate get_group_members with avatar_url
CREATE OR REPLACE FUNCTION get_group_members(p_leader_id UUID)
RETURNS TABLE (
  member_id UUID,
  member_name TEXT,
  member_avatar TEXT,
  member_avatar_url TEXT,
  member_email TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    br.member_id,
    p.name as member_name,
    p.avatar as member_avatar,
    p.avatar_url as member_avatar_url,
    p.email as member_email,
    br.updated_at as joined_at
  FROM buddy_requests br
  JOIN profiles p ON p.id = br.member_id
  WHERE br.leader_id = p_leader_id AND br.status = 'accepted'
  ORDER BY br.updated_at;
$$;

GRANT EXECUTE ON FUNCTION get_group_members TO authenticated;
