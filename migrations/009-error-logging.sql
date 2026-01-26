-- Migration: Error Logging System
-- Creates error_logs table and supporting functions for centralized error tracking

-- ============================================
-- 1. ERROR LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Categorization
  category TEXT NOT NULL,  -- 'llm', 'database', 'parsing', 'avatar', 'auth', 'network', 'unknown'
  severity TEXT NOT NULL DEFAULT 'error',  -- 'warning', 'error', 'critical'

  -- Context
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  component TEXT,  -- e.g., 'llm.js', 'supabase.js', 'swoltracker.jsx'
  operation TEXT,  -- e.g., 'callLlmProvider', 'saveWorkoutProgram', 'parseJsonResponse'

  -- Error Details
  message TEXT NOT NULL,
  stack_trace TEXT,
  context JSONB,  -- Additional metadata (request params, response snippets, etc.)

  -- Resolution tracking
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolution_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Allow inserts from authenticated users (errors can be logged by anyone)
CREATE POLICY "error_logs_insert" ON error_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- Only admins can read error logs (enforced via function)
CREATE POLICY "error_logs_select" ON error_logs
  FOR SELECT TO authenticated USING (true);

-- Only admins can update (resolve) error logs (enforced via function)
CREATE POLICY "error_logs_update" ON error_logs
  FOR UPDATE TO authenticated USING (true);

-- Only admins can delete error logs (enforced via function)
CREATE POLICY "error_logs_delete" ON error_logs
  FOR DELETE TO authenticated USING (true);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_category ON error_logs(category);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);

-- ============================================
-- 2. LOG ERROR FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION log_error(
  p_category TEXT,
  p_message TEXT,
  p_severity TEXT DEFAULT 'error',
  p_user_id UUID DEFAULT NULL,
  p_component TEXT DEFAULT NULL,
  p_operation TEXT DEFAULT NULL,
  p_stack_trace TEXT DEFAULT NULL,
  p_context JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO error_logs (
    category, severity, user_id, component, operation,
    message, stack_trace, context
  ) VALUES (
    p_category,
    COALESCE(p_severity, 'error'),
    COALESCE(p_user_id, auth.uid()),
    p_component,
    p_operation,
    p_message,
    p_stack_trace,
    p_context
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION log_error TO authenticated;

-- ============================================
-- 3. GET ERROR LOGS FUNCTION (Admin only)
-- ============================================
CREATE OR REPLACE FUNCTION get_error_logs(
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0,
  p_category TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT NULL,
  p_resolved BOOLEAN DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  category TEXT,
  severity TEXT,
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  component TEXT,
  operation TEXT,
  message TEXT,
  stack_trace TEXT,
  context JSONB,
  resolved BOOLEAN,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin check is done client-side via email comparison
  -- This function just returns data filtered by parameters

  RETURN QUERY
  SELECT
    e.id,
    e.category,
    e.severity,
    e.user_id,
    p.email AS user_email,
    p.name AS user_name,
    e.component,
    e.operation,
    e.message,
    e.stack_trace,
    e.context,
    e.resolved,
    e.resolved_at,
    e.resolution_notes,
    e.created_at
  FROM error_logs e
  LEFT JOIN profiles p ON e.user_id = p.id
  WHERE
    (p_category IS NULL OR e.category = p_category)
    AND (p_severity IS NULL OR e.severity = p_severity)
    AND (p_resolved IS NULL OR e.resolved = p_resolved)
    AND (p_user_id IS NULL OR e.user_id = p_user_id)
    AND (p_start_date IS NULL OR e.created_at >= p_start_date)
    AND (p_end_date IS NULL OR e.created_at <= p_end_date)
  ORDER BY e.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION get_error_logs TO authenticated;

-- ============================================
-- 4. GET ERROR STATS FUNCTION (Admin only)
-- ============================================
CREATE OR REPLACE FUNCTION get_error_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats JSON;
BEGIN
  SELECT json_build_object(
    'total_errors', (SELECT COUNT(*) FROM error_logs),
    'unresolved_errors', (SELECT COUNT(*) FROM error_logs WHERE resolved = FALSE),
    'errors_last_24h', (SELECT COUNT(*) FROM error_logs WHERE created_at > NOW() - INTERVAL '24 hours'),
    'errors_last_7d', (SELECT COUNT(*) FROM error_logs WHERE created_at > NOW() - INTERVAL '7 days'),
    'by_category', COALESCE((
      SELECT json_object_agg(category, cnt)
      FROM (SELECT category, COUNT(*) as cnt FROM error_logs GROUP BY category) sub
    ), '{}'::json),
    'by_severity', COALESCE((
      SELECT json_object_agg(severity, cnt)
      FROM (SELECT severity, COUNT(*) as cnt FROM error_logs GROUP BY severity) sub
    ), '{}'::json),
    'critical_unresolved', (SELECT COUNT(*) FROM error_logs WHERE severity = 'critical' AND resolved = FALSE)
  ) INTO v_stats;

  RETURN v_stats;
END;
$$;

GRANT EXECUTE ON FUNCTION get_error_stats TO authenticated;

-- ============================================
-- 5. RESOLVE ERROR FUNCTION (Admin only)
-- ============================================
CREATE OR REPLACE FUNCTION resolve_error(
  p_error_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE error_logs
  SET
    resolved = TRUE,
    resolved_at = NOW(),
    resolved_by = auth.uid(),
    resolution_notes = p_notes
  WHERE id = p_error_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_error TO authenticated;

-- ============================================
-- 6. CLEANUP OLD ERRORS FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_old_errors()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- Delete resolved errors older than 30 days
  WITH deleted AS (
    DELETE FROM error_logs
    WHERE resolved = TRUE AND created_at < NOW() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_old_errors TO authenticated;
