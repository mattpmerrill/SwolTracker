-- ============================================
-- RESET PROFILES (continuation of reset)
-- ============================================
-- The previous migration truncated tables, this resets profiles

-- Clear remaining tables that might not have been truncated
TRUNCATE TABLE workout_programs CASCADE;
TRUNCATE TABLE buddy_requests CASCADE;
TRUNCATE TABLE api_usage_logs CASCADE;

-- Reset all profiles to require onboarding again
UPDATE profiles SET
  onboarding_completed = false,
  onboarding_completed_at = NULL,
  gender = NULL,
  age = NULL,
  weight_lbs = NULL,
  fitness_goals = NULL,
  workout_days = NULL,
  workout_duration = NULL,
  workout_location = NULL,
  updated_at = NOW();
