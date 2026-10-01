-- 040: program_start_date is write-once, and "first gym" lookups are deterministic.
-- NOT YET APPLIED to any database. Context: ~/Work/snappy-coach/docs/plan/ (Phase 0.3).
--
-- Both functions are redefined from their last definition in migrations/027-rpc-idor-fixes.sql.
-- Before applying, diff against the live definitions (pg_get_functiondef) in case production drifted.
-- CREATE OR REPLACE with an unchanged signature keeps the existing GRANTs.

-- 1. complete_onboarding:
--    - program_start_date is only set while the profile has none (COALESCE keeps an existing value),
--      so re-running onboarding or a caller-supplied date can no longer re-date the program.
--    - the gym that receives the equipment is chosen deterministically (oldest membership first,
--      gym_id as the tie-breaker) instead of whichever row the heap returns first.
CREATE OR REPLACE FUNCTION complete_onboarding(
  p_user_id UUID,
  p_display_name TEXT,
  p_gender TEXT,
  p_age INTEGER,
  p_weight_lbs NUMERIC,
  p_fitness_goals TEXT[],
  p_workout_days TEXT[],
  p_workout_duration TEXT,
  p_workout_location TEXT,
  p_equipment TEXT[],
  p_program_start_date DATE DEFAULT CURRENT_DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gym_id_var UUID;
BEGIN
  PERFORM _require_self(p_user_id);

  UPDATE profiles SET
    display_name = p_display_name,
    gender = p_gender,
    age = p_age,
    weight_lbs = p_weight_lbs,
    fitness_goals = p_fitness_goals,
    workout_days = p_workout_days,
    workout_duration = p_workout_duration,
    workout_location = p_workout_location,
    program_start_date = COALESCE(program_start_date, p_program_start_date),
    onboarding_completed = TRUE,
    onboarding_completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_user_id;

  SELECT gm.gym_id INTO gym_id_var
  FROM gym_members gm
  WHERE gm.user_id = p_user_id
  ORDER BY gm.joined_at ASC, gm.gym_id ASC
  LIMIT 1;

  IF gym_id_var IS NOT NULL THEN
    DELETE FROM gym_equipment WHERE gym_id = gym_id_var;
    INSERT INTO gym_equipment (gym_id, name)
    SELECT gym_id_var, unnest(p_equipment);
  END IF;

  RETURN TRUE;
END;
$$;

-- 2. get_leader_gym_id: same body as 027, but the leader's owned gym is picked deterministically
--    when the leader owns more than one. (Also used by the programs RLS policy from migration 002.)
CREATE OR REPLACE FUNCTION get_leader_gym_id(p_member_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _require_self(p_member_id);
  RETURN (
    SELECT gm.gym_id
    FROM buddy_requests br
    JOIN gym_members gm ON gm.user_id = br.leader_id AND gm.role = 'owner'
    WHERE br.member_id = p_member_id AND br.status = 'accepted'
    ORDER BY gm.joined_at ASC, gm.gym_id ASC
    LIMIT 1
  );
END;
$$;
