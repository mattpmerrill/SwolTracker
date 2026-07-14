-- ============================================
-- MIGRATION 033: Fix get_group_members empty list for leaders
-- ============================================
-- Root cause (prod): migration 027 rewrote get_group_members as PL/pgSQL with
-- RETURNS TABLE (... member_id ...). The IDOR guard used unqualified column
-- names inside NOT EXISTS:
--
--   WHERE leader_id = p_leader_id AND member_id = auth.uid()
--
-- In PL/pgSQL those names resolve to the NULL OUT parameters, not buddy_requests
-- columns → ERROR 42702 "column reference member_id is ambiguous" for every
-- authenticated caller. The web client swallows the error and returns [], so
-- leaders see "0 members" even when buddy_requests has accepted rows.
--
-- When auth.role() is null (e.g. ad-hoc SQL), the IF is skipped and the function
-- appeared to work — which is why direct SQL checks looked fine.

CREATE OR REPLACE FUNCTION get_group_members(p_leader_id UUID)
RETURNS TABLE (
  member_id UUID,
  member_name TEXT,
  member_avatar TEXT,
  member_avatar_url TEXT,
  member_email TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Leader may list their own members; accepted members may list their group.
  IF auth.role() <> 'service_role' THEN
    IF p_leader_id IS DISTINCT FROM auth.uid()
       AND NOT EXISTS (
         SELECT 1
         FROM buddy_requests br_auth
         WHERE br_auth.leader_id = p_leader_id
           AND br_auth.member_id = auth.uid()
           AND br_auth.status = 'accepted'
       ) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    br.member_id,
    p.name,
    p.avatar,
    p.avatar_url,
    p.email,
    br.updated_at
  FROM buddy_requests br
  JOIN profiles p ON p.id = br.member_id
  WHERE br.leader_id = p_leader_id
    AND br.status = 'accepted'
  ORDER BY br.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION get_group_members(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_group_members(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_group_members(UUID) TO service_role;
