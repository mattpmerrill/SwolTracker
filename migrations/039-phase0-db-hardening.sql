-- 039: Phase 0 hardening (applied to production by hand on 2026-10-01).
-- Context: ~/Work/snappy-coach/docs/plan/01-data-forensics.md (F4, F6).

-- Plaintext provider keys: the LLM proxy reads env vars only, so the DB copies are cleared.
UPDATE app_settings SET value = 'null'::jsonb
WHERE key IN ('llm_api_key','llm_api_key_claude','llm_api_key_openai','llm_api_key_openrouter','llm_api_key_gemini');

-- Debug function left in prod: SECURITY DEFINER, anon-executable, returned member emails.
DROP FUNCTION IF EXISTS public._test_group_members_bug(uuid);

-- get_all_users trusted the caller-supplied id to decide admin; bind it to the session.
CREATE OR REPLACE FUNCTION public.get_all_users(p_user_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, avatar text, avatar_url text, onboarding_completed boolean, created_at timestamp with time zone, last_active timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE v_admin_email text; v_user_email text; BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'Access denied: Admin only'; END IF;
  PERFORM _require_self(p_user_id);
  SELECT value INTO v_admin_email FROM app_settings WHERE key = 'admin_email';
  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;
  IF v_user_email IS NULL OR lower(v_user_email) != lower(v_admin_email) THEN RAISE EXCEPTION USING MESSAGE = 'Access denied: Admin only'; END IF;
  RETURN QUERY SELECT p.id AS user_id, COALESCE(p.display_name, '(no name)') AS display_name, p.avatar, p.avatar_url, p.onboarding_completed, p.created_at, p.updated_at AS last_active FROM profiles p ORDER BY p.created_at DESC;
END; $function$;

-- Unguarded SECURITY DEFINER functions: no anonymous caller needs any of them.
REVOKE EXECUTE ON FUNCTION public.get_all_users(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_be_leader(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_be_member(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_current_week(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_all_prompt_templates() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_prompt_template(text) FROM anon, public;
-- Server-side only (service role): api/llm.js and api/_mcp-shared.js.
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) FROM anon, authenticated, public;
-- handle_new_user() is left as is: trigger functions cannot be called directly, and signup could not be
-- re-verified from the SQL connection, so its grant was restored after a brief revoke.
-- Revoking from PUBLIC can drop inherited grants, so re-grant the intended callers explicitly.
GRANT EXECUTE ON FUNCTION public.get_all_users(uuid), public.can_be_leader(uuid), public.can_be_member(uuid),
  public.get_current_week(uuid), public.get_all_prompt_templates(), public.get_prompt_template(text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) TO service_role;
