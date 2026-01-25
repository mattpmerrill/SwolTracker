-- ============================================
-- ADMIN AREA MIGRATION
-- ============================================
-- This migration:
-- 1. Creates app_settings table for global configuration
-- 2. Creates api_usage_logs table for tracking API calls
-- 3. Adds new admin functions
-- 4. Updates prompt_templates policies for admin access
-- 5. Removes user-level LLM API key storage

-- ============================================
-- 1. APP SETTINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read settings (needed for API key retrieval)
CREATE POLICY "app_settings_select" ON app_settings
  FOR SELECT TO authenticated USING (true);

-- Insert default settings
INSERT INTO app_settings (key, value, description) VALUES
  ('llm_provider', 'openai', 'Active LLM provider: openai, claude, or gemini'),
  ('llm_api_key_openai', NULL, 'OpenAI API key'),
  ('llm_api_key_claude', NULL, 'Anthropic Claude API key'),
  ('llm_api_key_gemini', NULL, 'Google Gemini API key'),
  ('llm_model_onboarding', 'gpt-4o-mini', 'Model for onboarding workout generation'),
  ('llm_model_weekly', 'gpt-4o', 'Model for weekly workout generation'),
  ('admin_email', NULL, 'Email address of the admin user')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- 2. API USAGE LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL,  -- 'onboarding_generation', 'weekly_generation'
  model TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  estimated_cost_usd NUMERIC(10, 6),
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;

-- Only allow inserts via function (SECURITY DEFINER)
-- Reads will be done via admin function
CREATE POLICY "api_usage_logs_insert" ON api_usage_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_request_type ON api_usage_logs(request_type);

-- ============================================
-- 3. ADMIN HELPER FUNCTION
-- ============================================
-- Check if a user is admin by comparing email to admin_email setting
CREATE OR REPLACE FUNCTION is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email TEXT;
  v_admin_email TEXT;
BEGIN
  -- Get user's email
  SELECT email INTO v_user_email FROM profiles WHERE id = p_user_id;

  -- Get admin email from settings
  SELECT value INTO v_admin_email FROM app_settings WHERE key = 'admin_email';

  -- Compare (case-insensitive)
  RETURN LOWER(v_user_email) = LOWER(v_admin_email);
END;
$$;

GRANT EXECUTE ON FUNCTION is_admin TO authenticated;

-- ============================================
-- 4. GLOBAL API KEY FUNCTIONS
-- ============================================
-- Get the active LLM provider
CREATE OR REPLACE FUNCTION get_llm_provider()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(value, 'openai') FROM app_settings WHERE key = 'llm_provider';
$$;

GRANT EXECUTE ON FUNCTION get_llm_provider TO authenticated;

-- Get the global LLM API key for the active provider (any authenticated user can call this)
CREATE OR REPLACE FUNCTION get_global_llm_api_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider TEXT;
  v_key TEXT;
BEGIN
  SELECT COALESCE(value, 'openai') INTO v_provider FROM app_settings WHERE key = 'llm_provider';

  SELECT value INTO v_key FROM app_settings WHERE key = 'llm_api_key_' || v_provider;

  RETURN v_key;
END;
$$;

GRANT EXECUTE ON FUNCTION get_global_llm_api_key TO authenticated;

-- Get API key for a specific provider
CREATE OR REPLACE FUNCTION get_llm_api_key_for_provider(p_provider TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM app_settings WHERE key = 'llm_api_key_' || p_provider;
$$;

GRANT EXECUTE ON FUNCTION get_llm_api_key_for_provider TO authenticated;

-- ============================================
-- 5. APP SETTINGS FUNCTIONS
-- ============================================
-- Get a single app setting
CREATE OR REPLACE FUNCTION get_app_setting(p_key TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM app_settings WHERE key = p_key;
$$;

GRANT EXECUTE ON FUNCTION get_app_setting TO authenticated;

-- Save an app setting (admin only)
CREATE OR REPLACE FUNCTION save_app_setting(p_key TEXT, p_value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  INSERT INTO app_settings (key, value, updated_at)
  VALUES (p_key, p_value, NOW())
  ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = NOW();

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION save_app_setting TO authenticated;

-- Get all app settings (admin only)
CREATE OR REPLACE FUNCTION get_all_app_settings()
RETURNS TABLE (key TEXT, value TEXT, description TEXT, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY SELECT s.key, s.value, s.description, s.updated_at
    FROM app_settings s
    ORDER BY s.key;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_app_settings TO authenticated;

-- ============================================
-- 6. API USAGE LOGGING FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION log_api_usage(
  p_user_id UUID,
  p_request_type TEXT,
  p_model TEXT,
  p_prompt_tokens INTEGER DEFAULT NULL,
  p_completion_tokens INTEGER DEFAULT NULL,
  p_success BOOLEAN DEFAULT TRUE,
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_tokens INTEGER;
  v_cost NUMERIC(10, 6);
  v_log_id UUID;
BEGIN
  v_total_tokens := COALESCE(p_prompt_tokens, 0) + COALESCE(p_completion_tokens, 0);

  -- Estimate cost based on model (prices as of 2024-2025)
  -- OpenAI: GPT-4o: $5/1M input, $15/1M output; GPT-4o-mini: $0.15/1M input, $0.60/1M output
  -- Claude: claude-3-5-sonnet: $3/1M input, $15/1M output; claude-3-haiku: $0.25/1M input, $1.25/1M output
  -- Gemini: gemini-1.5-pro: $3.50/1M input, $10.50/1M output; gemini-1.5-flash: $0.075/1M input, $0.30/1M output
  v_cost := CASE
    -- OpenAI models
    WHEN p_model LIKE 'gpt-4o-mini%' THEN
      (COALESCE(p_prompt_tokens, 0) * 0.00000015 + COALESCE(p_completion_tokens, 0) * 0.0000006)
    WHEN p_model LIKE 'gpt-4o%' THEN
      (COALESCE(p_prompt_tokens, 0) * 0.000005 + COALESCE(p_completion_tokens, 0) * 0.000015)
    WHEN p_model LIKE 'gpt-4%' THEN
      (COALESCE(p_prompt_tokens, 0) * 0.00003 + COALESCE(p_completion_tokens, 0) * 0.00006)
    WHEN p_model LIKE 'gpt-3.5%' THEN
      (COALESCE(p_prompt_tokens, 0) * 0.0000005 + COALESCE(p_completion_tokens, 0) * 0.0000015)
    -- Claude models
    WHEN p_model LIKE 'claude-3-5-sonnet%' OR p_model LIKE 'claude-3-sonnet%' THEN
      (COALESCE(p_prompt_tokens, 0) * 0.000003 + COALESCE(p_completion_tokens, 0) * 0.000015)
    WHEN p_model LIKE 'claude-3-haiku%' THEN
      (COALESCE(p_prompt_tokens, 0) * 0.00000025 + COALESCE(p_completion_tokens, 0) * 0.00000125)
    WHEN p_model LIKE 'claude-3-opus%' THEN
      (COALESCE(p_prompt_tokens, 0) * 0.000015 + COALESCE(p_completion_tokens, 0) * 0.000075)
    -- Gemini models
    WHEN p_model LIKE 'gemini-1.5-pro%' OR p_model LIKE 'gemini-pro%' THEN
      (COALESCE(p_prompt_tokens, 0) * 0.0000035 + COALESCE(p_completion_tokens, 0) * 0.0000105)
    WHEN p_model LIKE 'gemini-1.5-flash%' OR p_model LIKE 'gemini-flash%' THEN
      (COALESCE(p_prompt_tokens, 0) * 0.000000075 + COALESCE(p_completion_tokens, 0) * 0.0000003)
    ELSE 0
  END;

  INSERT INTO api_usage_logs (
    user_id, request_type, model, prompt_tokens, completion_tokens,
    total_tokens, estimated_cost_usd, success, error_message
  ) VALUES (
    p_user_id, p_request_type, p_model, p_prompt_tokens, p_completion_tokens,
    v_total_tokens, v_cost, p_success, p_error_message
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION log_api_usage TO authenticated;

-- ============================================
-- 7. ADMIN DASHBOARD STATS FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION get_admin_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats JSON;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM profiles),
    'users_last_7_days', (SELECT COUNT(*) FROM profiles WHERE created_at > NOW() - INTERVAL '7 days'),
    'users_last_30_days', (SELECT COUNT(*) FROM profiles WHERE created_at > NOW() - INTERVAL '30 days'),
    'total_ai_workouts', (SELECT COUNT(*) FROM workout_programs WHERE ai_generated = true),
    'ai_workouts_last_7_days', (SELECT COUNT(*) FROM workout_programs WHERE ai_generated = true AND created_at > NOW() - INTERVAL '7 days'),
    'ai_workouts_last_30_days', (SELECT COUNT(*) FROM workout_programs WHERE ai_generated = true AND created_at > NOW() - INTERVAL '30 days'),
    'api_calls_total', (SELECT COUNT(*) FROM api_usage_logs),
    'api_calls_last_7_days', (SELECT COUNT(*) FROM api_usage_logs WHERE created_at > NOW() - INTERVAL '7 days'),
    'api_calls_last_30_days', (SELECT COUNT(*) FROM api_usage_logs WHERE created_at > NOW() - INTERVAL '30 days'),
    'total_tokens_used', (SELECT COALESCE(SUM(total_tokens), 0) FROM api_usage_logs),
    'tokens_last_7_days', (SELECT COALESCE(SUM(total_tokens), 0) FROM api_usage_logs WHERE created_at > NOW() - INTERVAL '7 days'),
    'tokens_last_30_days', (SELECT COALESCE(SUM(total_tokens), 0) FROM api_usage_logs WHERE created_at > NOW() - INTERVAL '30 days'),
    'estimated_cost_total', (SELECT COALESCE(SUM(estimated_cost_usd), 0)::NUMERIC(10,4) FROM api_usage_logs),
    'estimated_cost_last_7_days', (SELECT COALESCE(SUM(estimated_cost_usd), 0)::NUMERIC(10,4) FROM api_usage_logs WHERE created_at > NOW() - INTERVAL '7 days'),
    'estimated_cost_last_30_days', (SELECT COALESCE(SUM(estimated_cost_usd), 0)::NUMERIC(10,4) FROM api_usage_logs WHERE created_at > NOW() - INTERVAL '30 days'),
    'api_success_rate', (SELECT COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE success) / NULLIF(COUNT(*), 0), 2), 100) FROM api_usage_logs),
    'onboarding_completed_count', (SELECT COUNT(*) FROM profiles WHERE onboarding_completed = true)
  ) INTO v_stats;

  RETURN v_stats;
END;
$$;

GRANT EXECUTE ON FUNCTION get_admin_dashboard_stats TO authenticated;

-- ============================================
-- 8. PROMPT TEMPLATE CRUD FUNCTIONS (Admin Only)
-- ============================================
-- Get all prompt templates
CREATE OR REPLACE FUNCTION get_all_prompt_templates()
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  template TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Anyone authenticated can view templates
  RETURN QUERY SELECT pt.id, pt.name, pt.description, pt.template, pt.created_at, pt.updated_at
    FROM prompt_templates pt
    ORDER BY pt.name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_prompt_templates TO authenticated;

-- Create a new prompt template (admin only)
CREATE OR REPLACE FUNCTION create_prompt_template(
  p_name TEXT,
  p_description TEXT,
  p_template TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  INSERT INTO prompt_templates (name, description, template)
  VALUES (p_name, p_description, p_template)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_prompt_template TO authenticated;

-- Update an existing prompt template (admin only)
CREATE OR REPLACE FUNCTION update_prompt_template(
  p_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_template TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  UPDATE prompt_templates
  SET name = p_name,
      description = p_description,
      template = p_template,
      updated_at = NOW()
  WHERE id = p_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION update_prompt_template TO authenticated;

-- Delete a prompt template (admin only)
CREATE OR REPLACE FUNCTION delete_prompt_template(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  DELETE FROM prompt_templates WHERE id = p_id;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_prompt_template TO authenticated;

-- ============================================
-- 9. CLEANUP: REMOVE USER-LEVEL LLM API KEY
-- ============================================
-- Drop old functions
DROP FUNCTION IF EXISTS save_llm_api_key(UUID, TEXT);
DROP FUNCTION IF EXISTS get_llm_api_key(UUID);

-- Drop the column from profiles
-- Note: Run this after confirming frontend is updated
ALTER TABLE profiles DROP COLUMN IF EXISTS llm_api_key;
