-- ============================================
-- ADMIN LIST USERS (Migration 023)
-- ============================================
-- Returns all users with their profiles and email for the admin dashboard

CREATE OR REPLACE FUNCTION get_all_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  avatar text,
  avatar_url text,
  onboarding_completed boolean,
  created_at timestamptz,
  last_active timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Admin only';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    u.email,
    COALESCE(p.display_name, u.email) AS display_name,
    p.avatar,
    p.avatar_url,
    p.onboarding_completed,
    p.created_at,
    p.updated_at AS last_active
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  ORDER BY p.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_users TO authenticated;
