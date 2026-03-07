-- Migration 021: API keys for remote MCP agent access
-- Part of "Connect My Snappy" feature

-- ============================================
-- 1. API Keys table
-- ============================================

CREATE TABLE api_keys (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  name text NOT NULL DEFAULT 'My Agent',
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_user ON api_keys(user_id) WHERE revoked_at IS NULL;

-- RLS: users can only see their own keys
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY api_keys_select ON api_keys
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY api_keys_delete ON api_keys
  FOR DELETE USING (user_id = auth.uid());

-- No direct INSERT/UPDATE — only through RPCs

-- ============================================
-- 2. create_api_key RPC
-- ============================================

CREATE OR REPLACE FUNCTION create_api_key(p_name text DEFAULT 'My Agent')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_active_count int;
  v_raw_key text;
  v_hash text;
  v_prefix text;
  v_key_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
  END IF;

  -- Enforce max 5 active keys per user
  SELECT count(*) INTO v_active_count
  FROM api_keys
  WHERE user_id = v_user_id AND revoked_at IS NULL;

  IF v_active_count >= 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Maximum 5 active API keys. Revoke one first.');
  END IF;

  -- Generate key: swol_ + 48 random hex chars
  v_raw_key := 'swol_' || encode(gen_random_bytes(24), 'hex');
  v_hash := encode(sha256(convert_to(v_raw_key, 'UTF8')), 'hex');
  v_prefix := substring(v_raw_key from 1 for 12);

  INSERT INTO api_keys (user_id, key_hash, key_prefix, name)
  VALUES (v_user_id, v_hash, v_prefix, coalesce(nullif(trim(p_name), ''), 'My Agent'))
  RETURNING id INTO v_key_id;

  -- Return the plaintext key ONCE — it's never stored
  RETURN jsonb_build_object(
    'success', true,
    'key', v_raw_key,
    'key_id', v_key_id,
    'key_prefix', v_prefix
  );
END;
$$;

-- ============================================
-- 3. revoke_api_key RPC
-- ============================================

CREATE OR REPLACE FUNCTION revoke_api_key(p_key_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
  END IF;

  UPDATE api_keys
  SET revoked_at = now()
  WHERE id = p_key_id
    AND user_id = v_user_id
    AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Key not found or already revoked.');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================
-- 4. Permissions
-- ============================================

GRANT EXECUTE ON FUNCTION create_api_key TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_api_key TO authenticated;
