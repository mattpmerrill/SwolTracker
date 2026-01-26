-- ============================================
-- ADD PROGRAM START DATE TO PROFILES
-- ============================================
-- This allows users to select when their program starts during onboarding
-- Week calculation is based on this date

-- Add program_start_date column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS program_start_date DATE;

-- ============================================
-- UPDATE COMPLETE_ONBOARDING FUNCTION
-- ============================================
-- Add program_start_date parameter

DROP FUNCTION IF EXISTS complete_onboarding(UUID, TEXT, TEXT, INTEGER, NUMERIC, TEXT[], TEXT[], TEXT, TEXT, TEXT[]);

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
  -- Update profile with onboarding data
  UPDATE profiles SET
    display_name = p_display_name,
    gender = p_gender,
    age = p_age,
    weight_lbs = p_weight_lbs,
    fitness_goals = p_fitness_goals,
    workout_days = p_workout_days,
    workout_duration = p_workout_duration,
    workout_location = p_workout_location,
    program_start_date = p_program_start_date,
    onboarding_completed = TRUE,
    onboarding_completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Get user's gym
  SELECT gym_id INTO gym_id_var
  FROM gym_members
  WHERE user_id = p_user_id
  LIMIT 1;

  -- Update gym equipment if gym exists
  IF gym_id_var IS NOT NULL THEN
    -- Clear existing equipment
    DELETE FROM gym_equipment WHERE gym_id = gym_id_var;

    -- Insert new equipment
    INSERT INTO gym_equipment (gym_id, name)
    SELECT gym_id_var, unnest(p_equipment);
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION complete_onboarding TO authenticated;

-- ============================================
-- FUNCTION TO GET CURRENT WEEK NUMBER
-- ============================================
-- Calculates which week the user is on based on their program start date

CREATE OR REPLACE FUNCTION get_current_week(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date DATE;
  v_weeks_elapsed INTEGER;
BEGIN
  SELECT program_start_date INTO v_start_date
  FROM profiles
  WHERE id = p_user_id;

  IF v_start_date IS NULL THEN
    RETURN 1;
  END IF;

  -- Calculate weeks elapsed (0-indexed, then add 1)
  v_weeks_elapsed := FLOOR((CURRENT_DATE - v_start_date) / 7);

  -- Return at least 1, and the current week
  RETURN GREATEST(1, v_weeks_elapsed + 1);
END;
$$;

GRANT EXECUTE ON FUNCTION get_current_week TO authenticated;
