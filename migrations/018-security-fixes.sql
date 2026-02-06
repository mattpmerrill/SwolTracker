-- ============================================
-- SECURITY FIXES MIGRATION
-- ============================================
-- Fixes overly permissive RLS policies flagged by Supabase Security Advisor
--
-- Issues addressed:
-- 1. profiles: SELECT USING (true) - too permissive
-- 2. app_settings: Any authenticated user can read API keys
-- 3. error_logs: Any authenticated user can read/update/delete all logs

-- ============================================
-- 1. FIX PROFILES POLICIES
-- ============================================
-- Current: Anyone can read all profiles
-- Fix: Users can only see profiles of their gym members/buddies, or their own

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;

-- Users can always see their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (id = auth.uid());

-- Users can see profiles of people in their gyms
CREATE POLICY "Users can view gym member profiles" ON profiles
  FOR SELECT USING (
    id IN (
      SELECT gm2.user_id 
      FROM gym_members gm1
      JOIN gym_members gm2 ON gm1.gym_id = gm2.gym_id
      WHERE gm1.user_id = auth.uid()
    )
  );

-- Users can see profiles of their buddies (leader/member relationships)
CREATE POLICY "Users can view buddy profiles" ON profiles
  FOR SELECT USING (
    id IN (
      SELECT CASE 
        WHEN leader_id = auth.uid() THEN member_id 
        ELSE leader_id 
      END
      FROM buddy_requests
      WHERE (leader_id = auth.uid() OR member_id = auth.uid())
        AND status = 'accepted'
    )
  );

-- ============================================
-- 2. FIX APP_SETTINGS POLICIES
-- ============================================
-- Current: Any authenticated user can read all settings (including API keys!)
-- Fix: Only admins can read settings; use SECURITY DEFINER functions for API key access

DROP POLICY IF EXISTS "app_settings_select" ON app_settings;

-- Only admins can directly query app_settings
CREATE POLICY "app_settings_admin_only" ON app_settings
  FOR SELECT TO authenticated 
  USING (is_admin(auth.uid()));

-- Note: Regular users access API keys via get_global_llm_api_key() which is SECURITY DEFINER
-- This is secure because the function only returns the key value, not the full row

-- ============================================
-- 3. FIX ERROR_LOGS POLICIES  
-- ============================================
-- Current: Any authenticated user can read/update/delete all error logs
-- Fix: Only admins can read/update/delete; any user can insert their own errors

DROP POLICY IF EXISTS "error_logs_select" ON error_logs;
DROP POLICY IF EXISTS "error_logs_update" ON error_logs;
DROP POLICY IF EXISTS "error_logs_delete" ON error_logs;

-- Users can only see their own errors OR admins can see all
CREATE POLICY "error_logs_select" ON error_logs
  FOR SELECT TO authenticated 
  USING (
    user_id = auth.uid() 
    OR is_admin(auth.uid())
  );

-- Only admins can update error logs (to mark as resolved)
CREATE POLICY "error_logs_update" ON error_logs
  FOR UPDATE TO authenticated 
  USING (is_admin(auth.uid()));

-- Only admins can delete error logs
CREATE POLICY "error_logs_delete" ON error_logs
  FOR DELETE TO authenticated 
  USING (is_admin(auth.uid()));

-- ============================================
-- 4. VERIFICATION QUERIES (run these to confirm fixes)
-- ============================================
-- After running this migration, test with:
--
-- As non-admin user:
--   SELECT * FROM profiles;  -- Should only see own + gym members + buddies
--   SELECT * FROM app_settings;  -- Should return empty (blocked)
--   SELECT * FROM error_logs;  -- Should only see own errors
--
-- As admin user:
--   SELECT * FROM app_settings;  -- Should see all settings
--   SELECT * FROM error_logs;  -- Should see all errors
