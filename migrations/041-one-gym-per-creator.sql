-- 041: a user creates at most one gym, and create_user_gym is idempotent.
-- Applied to production on 2026-10-01 (Phase 0.5). Context: ~/Work/snappy-coach/docs/plan/ (Phase 0.5, one gym per creator).
--
-- Why: onboarding re-runs created duplicate personal gyms (finding F2 in the data forensics). App code
-- now reuses an existing gym; this is the database-level guard behind it. In this app a group "shares"
-- the leader's own gym (members join it), so the invariant is simply "one gym per created_by".
--
-- Before applying: confirm no user owns two gyms, or the index build fails. On 2026-10-01 production had
-- no created_by with more than one gym and no gym with a NULL created_by:
--   SELECT created_by, count(*) FROM gyms GROUP BY created_by HAVING count(*) > 1;
--
-- create_user_gym is redefined from migrations/031-create-user-gym-rpc.sql. The live definition (read
-- with pg_get_functiondef on 2026-10-01) is identical to 031, so there is no drift to carry over.
-- CREATE OR REPLACE with an unchanged signature keeps the existing GRANTs.

-- 1. The guard. Partial, so gyms whose creator was deleted (created_by is SET NULL on profile delete)
--    do not collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS gyms_one_per_creator
  ON gyms (created_by)
  WHERE created_by IS NOT NULL;

-- 2. create_user_gym returns the caller's existing gym instead of making a second one.
--    INSERT ... ON CONFLICT DO NOTHING means the AFTER INSERT trigger on_gym_created
--    (add_default_equipment) only fires for a row that was really inserted, so a repeat call never
--    re-seeds equipment. If two calls race, the loser waits for the winner to commit, inserts nothing,
--    and re-selects the winner's gym (READ COMMITTED: the new statement sees the committed row).
--    The membership row is created only by the call that created the gym.
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
  ON CONFLICT (created_by) WHERE created_by IS NOT NULL DO NOTHING
  RETURNING id INTO v_gym_id;

  IF v_gym_id IS NULL THEN
    -- The caller already has a gym (earlier call, or a concurrent call that won the race).
    SELECT g.id INTO v_gym_id
    FROM gyms g
    WHERE g.created_by = user_id;

    RETURN v_gym_id;
  END IF;

  INSERT INTO gym_members (gym_id, user_id, role)
  VALUES (v_gym_id, user_id, 'owner');

  RETURN v_gym_id;
END;
$$;

REVOKE ALL ON FUNCTION create_user_gym(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_user_gym(UUID, TEXT) TO authenticated;
