-- ============================================
-- MIGRATION 028: MCP tool call audit log
-- ============================================
-- AGENT-NATIVE-PLAN.md task 0.6.
-- Every MCP `tools/call` writes one row here so users can see what their
-- agent has been doing (Settings → Agent Activity). Args are hashed, not
-- stored, to keep the log cheap and avoid retaining payloads.

CREATE TABLE IF NOT EXISTS tool_call_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  args_hash TEXT NOT NULL,
  ok BOOLEAN NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_call_audit_user
  ON tool_call_audit(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_call_audit_tool
  ON tool_call_audit(tool_name, created_at DESC);

ALTER TABLE tool_call_audit ENABLE ROW LEVEL SECURITY;

-- Users can read their own rows. Writes only via service role (api/mcp.js) —
-- no INSERT policy means authenticated clients cannot write directly.
CREATE POLICY "Users view own tool audit" ON tool_call_audit
  FOR SELECT USING (user_id = auth.uid());

-- Paginated accessor for the Settings → Agent Activity UI.
CREATE OR REPLACE FUNCTION get_my_tool_call_audit(
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  tool_name TEXT,
  args_hash TEXT,
  ok BOOLEAN,
  error_message TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT t.id, t.tool_name, t.args_hash, t.ok, t.error_message, t.created_at
  FROM tool_call_audit t
  WHERE t.user_id = auth.uid()
  ORDER BY t.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 500);
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_tool_call_audit(INT) TO authenticated;
