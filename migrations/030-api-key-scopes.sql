-- Migration 030: API key scopes (Phase 4.3, capability/scope model)
--
-- Adds a `scopes` column to `api_keys` so each key carries the set of
-- permission scopes granted to the agent. Tool calls enforce scopes in the
-- MCP pipeline (see api/_mcp-shared.js + @bot-native/sdk).
--
-- Scope taxonomy (v1):
--   read              — all query tools (get_profile, get_todays_workout, ...)
--   write:logs        — log sets, update maxes, mark workouts complete
--   write:program     — save / generate workout programs
--   coach             — send coach messages, generate weekly summaries
--
-- Existing keys are backfilled with the full default set so current agents
-- keep working after deploy. New keys pass scopes explicitly.

-- ============================================
-- 1. Add scopes column
-- ============================================

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT '{}';

-- Backfill existing keys with the default full scope set
UPDATE api_keys
SET scopes = ARRAY['read', 'write:logs', 'write:program', 'coach']::text[]
WHERE scopes = '{}'::text[];

-- ============================================
-- 2. Replace create_api_key RPC to accept scopes
-- ============================================

-- Drop the 1-arg version so PostgREST doesn't see overload ambiguity
-- (new 2-arg signature has defaults, so it covers existing callers).
DROP FUNCTION IF EXISTS create_api_key(text);

CREATE OR REPLACE FUNCTION create_api_key(
  p_name text DEFAULT 'My Agent',
  p_scopes text[] DEFAULT ARRAY['read', 'write:logs', 'write:program', 'coach']::text[]
)
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
  v_scopes text[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
  END IF;

  -- Normalise scopes: default to full set on NULL / empty input, dedupe
  IF p_scopes IS NULL OR cardinality(p_scopes) = 0 THEN
    v_scopes := ARRAY['read', 'write:logs', 'write:program', 'coach']::text[];
  ELSE
    SELECT array_agg(DISTINCT s) INTO v_scopes
    FROM unnest(p_scopes) AS s
    WHERE s IS NOT NULL AND length(trim(s)) > 0;
  END IF;

  -- Enforce max 5 active keys per user
  SELECT count(*) INTO v_active_count
  FROM api_keys
  WHERE user_id = v_user_id AND revoked_at IS NULL;

  IF v_active_count >= 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Maximum 5 active API keys. Revoke one first.');
  END IF;

  v_raw_key := 'swol_' || encode(gen_random_bytes(24), 'hex');
  v_hash := encode(sha256(convert_to(v_raw_key, 'UTF8')), 'hex');
  v_prefix := substring(v_raw_key from 1 for 12);

  INSERT INTO api_keys (user_id, key_hash, key_prefix, name, scopes)
  VALUES (v_user_id, v_hash, v_prefix, coalesce(nullif(trim(p_name), ''), 'My Agent'), v_scopes)
  RETURNING id INTO v_key_id;

  RETURN jsonb_build_object(
    'success', true,
    'key', v_raw_key,
    'key_id', v_key_id,
    'key_prefix', v_prefix,
    'scopes', v_scopes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_api_key(text, text[]) TO authenticated;
