-- ============================================
-- RESET ALL USERS
-- ============================================
-- WARNING: This clears all user data and requires everyone to re-onboard
-- Run this only if you want a fresh start for all users

-- Clear all workout logs
TRUNCATE TABLE workout_logs CASCADE;

-- Clear all workout programs
TRUNCATE TABLE workout_programs CASCADE;

-- Clear all buddy requests
TRUNCATE TABLE buddy_requests CASCADE;

-- Clear API usage logs (optional - comment out if you want to keep these)
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

-- Note: We keep user accounts (auth.users) and basic profile info (name, email, avatar)
-- Users just need to go through the onboarding flow again
