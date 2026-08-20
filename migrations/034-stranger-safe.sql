-- Migration 034: Stranger-safe RPCs (slice 2)
--
-- Closes remaining holes from SECURITY-REVIEW-2026-04.md:
--   F-011 search_users rate-limit + identity keyed on a caller-supplied UUID
--   Settings-key RPCs readable by any authenticated user (get_app_setting,
--   get_global_llm_api_key, get_llm_api_key_for_provider)
--
-- Apply to prod deliberately. migrations/ is source of truth.

-- ============================================
-- 2.1 search_users — identity from auth.uid(), no spoofable user id
-- ============================================

DROP FUNCTION IF EXISTS search_users(text, uuid);
DROP FUNCTION IF EXISTS search_users(text);

CREATE OR REPLACE FUNCTION search_users(search_term text)
RETURNS TABLE(user_id uuid, name text, email text, avatar text, avatar_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_allowed boolean;
  v_term text;
  v_is_admin boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_term := trim(search_term);
  IF v_term IS NULL OR length(v_term) < 2 OR length(v_term) > 50 THEN
    RAISE EXCEPTION 'Search term must be between 2 and 50 characters.';
  END IF;

  SELECT check_rate_limit(v_uid, 'user_search', 50, 60) INTO v_allowed;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Too many search requests. Please try again later.';
  END IF;

  v_is_admin := is_admin(v_uid);

  RETURN QUERY
  SELECT
    p.id AS user_id,
    COALESCE(p.display_name, p.name) AS name,
    CASE WHEN v_is_admin THEN u.email ELSE NULL END AS email,
    p.avatar,
    p.avatar_url
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id IS DISTINCT FROM v_uid
    AND (
      COALESCE(p.display_name, '') ILIKE '%' || v_term || '%'
      OR COALESCE(p.name, '') ILIKE '%' || v_term || '%'
      OR u.email ILIKE '%' || v_term || '%'
    )
  LIMIT 20;
END;
$$;

REVOKE ALL ON FUNCTION search_users(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_users(text) TO authenticated;

-- ============================================
-- 2.2 Settings / LLM key RPCs — admin or service_role only
-- ============================================

CREATE OR REPLACE FUNCTION get_app_setting(p_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT value FROM app_settings WHERE key = p_key);
END;
$$;

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
  IF auth.role() <> 'service_role' AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(value, 'openai') INTO v_provider FROM app_settings WHERE key = 'llm_provider';
  SELECT value INTO v_key FROM app_settings WHERE key = 'llm_api_key_' || v_provider;
  RETURN v_key;
END;
$$;

CREATE OR REPLACE FUNCTION get_llm_api_key_for_provider(p_provider TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT value FROM app_settings WHERE key = 'llm_api_key_' || p_provider);
END;
$$;
