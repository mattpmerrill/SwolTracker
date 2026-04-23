-- Migration 031: create_user_gym RPC
--
-- Defines the atomic gym-creation RPC that db.createGym() in
-- src/lib/repositories/gyms.js (and mobile) has been calling since
-- commit d50859b (Jan 2026). The SQL function itself was never shipped,
-- so prod returned 404 on the first step of agent-native onboarding.
--
-- Inserts a gym + owner membership atomically. SECURITY DEFINER bypasses
-- RLS; _require_self (migration 027) re-asserts caller identity to block
-- IDOR.

CREATE OR REPLACE FUNCTION create_user_gym(user_id UUID, gym_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym_id UUID;
BEGIN
  PERFORM _require_self(user_id);

  INSERT INTO gyms (name, created_by)
  VALUES (gym_name, user_id)
  RETURNING id INTO v_gym_id;

  INSERT INTO gym_members (gym_id, user_id, role)
  VALUES (v_gym_id, user_id, 'owner');

  RETURN v_gym_id;
END;
$$;

REVOKE ALL ON FUNCTION create_user_gym(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_user_gym(UUID, TEXT) TO authenticated;
