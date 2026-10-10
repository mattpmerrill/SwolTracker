-- 042: Monday-aligned, time-zone-aware get_current_week, and a write-once guard
-- on profiles.program_start_date.
--
-- NOT APPLIED. This file is the source of truth only. Do not run it against
-- a shared, remote, or production database from an agent session.
--
-- Why: docs/plans/2026-10-09-aleesha-feedback.md (Evidence B3, B5, B6 and Task 4).
-- The live get_current_week is FLOOR((CURRENT_DATE - program_start_date) / 7) + 1.
-- That is not Monday-aligned, and CURRENT_DATE follows the database TimeZone
-- (UTC on Supabase), so after 18:00 in America/Denver the RPC is already on
-- tomorrow — and on Sunday evening it is next week's Monday. shared/week-math.ts
-- calculateCurrentWeek Monday-aligns the start date and, on the web, uses the
-- browser's calendar date. This function must return that same week for the
-- same calendar date. Evidence B5: RLS still lets a signed-in user change
-- program_start_date after training history exists (docs/status.md, "Not done").
-- Evidence B6: profiles.timezone is NULL for most users; the app default zone
-- is America/Denver.
--
-- _require_self, from migrations/027-rpc-idor-fixes.sql:
--   IF auth.role() = 'service_role' THEN RETURN; END IF;
--   IF p_user_id IS DISTINCT FROM auth.uid() THEN RAISE 'forbidden' (42501); END IF;
-- Service-role callers still work when auth.uid() IS NULL, because the bypass
-- is the role claim, not a non-null uid. That is the MCP path (service-role key).
-- No-auth callers do not: ad-hoc SQL with no JWT has auth.role() and auth.uid()
-- both null, so a uuid is distinct from auth.uid() and the helper raises 42501.
-- Service-role callers keep working, so get_current_week calls
-- PERFORM _require_self(p_user_id). A SQL-editor check of the RPC has to set
-- the session role claim first (example below); the pure helpers do not.
--
-- Preconditions this file does not create:
--   * public.profiles(id uuid, program_start_date date, timezone text).
--     timezone is live in production; no numbered migration in this repo adds it.
--   * public.workout_logs(user_id uuid), public.workout_completions(user_id uuid)
--   * public._require_self(uuid) from migration 027
--   * roles anon, authenticated, service_role (the REVOKE/GRANT below)
--   * pg_catalog.pg_timezone_names contains America/Denver (stock tzdata)
--
-- Escape hatch for demo-seed and repairs.
-- The trigger allows a change only when the GUC is exactly 'on' (case-sensitive),
-- in the same transaction as the UPDATE. PostgREST and the Supabase client cannot
-- set a custom GUC, so a user-session API update still raises once workout_logs
-- or workout_completions exist. The exception text does not mention the hatch.
--
-- SQL editor / repair, same transaction as the UPDATE:
--   SET LOCAL swoltracker.allow_redate = 'on';
--
-- Service role (the path scripts/demo-seed.mjs uses). Not granted to PUBLIC,
-- anon, or authenticated. The function sets the GUC for its UPDATE only and
-- clears it before returning, so a later statement in the same transaction
-- cannot re-date. is_local true also drops the setting at transaction end.
--   SELECT public.admin_set_program_start_date('<user uuid>', DATE '2026-06-01');
--
-- How to verify (owner / SQL editor; the helpers are not granted to API roles):
--   SELECT public.swol_week_number('2026-06-01', '2026-10-09');  -- 19
--   SELECT public.swol_week_number('2026-06-03', '2026-10-09');  -- 19, Wed aligns to Mon Jun 1
--   SELECT public.swol_week_number('2026-05-31', '2026-06-01');  -- 2, Sun aligns to Mon May 25
--   SELECT public.swol_week_number(NULL, '2026-10-09');           -- 1
--   SELECT public.swol_resolve_zone(NULL);                        -- America/Denver
--   SELECT public.swol_resolve_zone('Not/AZone');                 -- America/Denver
--   SELECT public.swol_resolve_zone('America/Denver');            -- America/Denver
--   SELECT set_config('request.jwt.claim.role', 'service_role', true);
--   SELECT public.get_current_week('<user uuid>');
--   BEGIN;
--   SET LOCAL swoltracker.allow_redate = 'on';
--   UPDATE public.profiles
--      SET program_start_date = DATE '2026-06-01'
--    WHERE id = '<user uuid>';
--   COMMIT;
--   -- service_role only:
--   SELECT public.admin_set_program_start_date('<user uuid>', DATE '2026-06-01');
--
/*
ROLLBACK — do not execute as part of applying this file. Restores the live
get_current_week body (read 2026-10-09) and drops the objects this file adds.
CREATE OR REPLACE keeps the 039 grants; they are re-stated anyway.

DROP TRIGGER IF EXISTS profiles_start_date_write_once ON public.profiles;
DROP FUNCTION IF EXISTS public.profiles_start_date_write_once();
DROP FUNCTION IF EXISTS public.admin_set_program_start_date(uuid, date);
CREATE OR REPLACE FUNCTION public.get_current_week(p_user_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_start_date DATE; v_weeks_elapsed INTEGER;
BEGIN
  SELECT program_start_date INTO v_start_date FROM profiles WHERE id = p_user_id;
  IF v_start_date IS NULL THEN RETURN 1; END IF;
  v_weeks_elapsed := FLOOR((CURRENT_DATE - v_start_date) / 7);
  RETURN GREATEST(1, v_weeks_elapsed + 1);
END; $function$;
REVOKE EXECUTE ON FUNCTION public.get_current_week(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_current_week(uuid) TO authenticated, service_role;
DROP FUNCTION IF EXISTS public.swol_week_number(date, date);
DROP FUNCTION IF EXISTS public.swol_resolve_zone(text);
*/


-- Stock Postgres has this zone. Fail closed if a minimal build does not.
DO $pre$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_timezone_names AS n
    WHERE n.name = 'America/Denver'
  ) THEN
    RAISE EXCEPTION 'migration 042 requires time zone America/Denver'
      USING ERRCODE = '55000';
  END IF;
END;
$pre$;

-- Calendar week for a start date and a today, both calendar dates.
-- Monday-align: ISODOW is Monday=1 .. Sunday=7, so subtracting (isodow - 1)
-- lands on Monday. That is the same shift as shared/week-math.ts
-- (Sunday getDay() 0 → 6 days back).
-- date - date is an integer day count. Integer division truncates toward zero,
-- which matches Math.floor for non-negative counts. GREATEST(1, ...) makes a
-- today before the aligned Monday return 1, matching Math.max(1, floor+1)
-- when the day count is negative. NULL start → 1, same as the JS function.
CREATE OR REPLACE FUNCTION public.swol_week_number(p_start date, p_today date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_start IS NULL OR p_today IS NULL THEN 1
    ELSE GREATEST(
      1,
      (
        (
          p_today - (p_start - (EXTRACT(ISODOW FROM p_start)::integer - 1))
        ) / 7
      ) + 1
    )
  END;
$$;

-- Profile zone if pg_timezone_names has that exact name, otherwise the app default.
-- NULL, empty, and unknown strings fall back. A name the catalog accepts is used
-- as-is (on Postgres 14, some abbreviations such as MST are catalog names).
-- STABLE, not IMMUTABLE: the zone catalog is not a pure function of the argument.
CREATE OR REPLACE FUNCTION public.swol_resolve_zone(p_tz text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_tz IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_catalog.pg_timezone_names AS n
       WHERE n.name = p_tz
     )
    THEN p_tz
    ELSE 'America/Denver'
  END;
$$;

-- Not part of the HTTP API. Owner (migration role) can still execute them,
-- and get_current_week is SECURITY DEFINER so it can call them as owner.
-- Supabase default privileges grant EXECUTE to anon/authenticated/service_role
-- on CREATE, so revoke those explicitly. PUBLIC is the same pseudo-role 039 uses.
REVOKE ALL ON FUNCTION public.swol_week_number(date, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.swol_resolve_zone(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_current_week(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date date;
  v_tz text;
  v_today date;
BEGIN
  -- See header: service_role returns immediately even when auth.uid() is null.
  PERFORM _require_self(p_user_id);

  SELECT p.program_start_date, p.timezone
    INTO v_start_date, v_tz
  FROM public.profiles AS p
  WHERE p.id = p_user_id;

  IF v_start_date IS NULL THEN
    RETURN 1;
  END IF;

  -- now() is timestamptz. AT TIME ZONE yields that instant's wall time in the
  -- user's zone; ::date is their calendar date. The database session date is
  -- UTC on Supabase and is not used here.
  v_today := (now() AT TIME ZONE public.swol_resolve_zone(v_tz))::date;
  RETURN public.swol_week_number(v_start_date, v_today);
END;
$$;

-- Same signature as migration 006 / the live function, so CREATE OR REPLACE
-- keeps existing grants. Re-state 039 anyway: anon and PUBLIC cannot execute;
-- authenticated and service_role can.
REVOKE EXECUTE ON FUNCTION public.get_current_week(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_current_week(uuid) TO authenticated, service_role;

-- Write-once after history exists. SECURITY INVOKER (the default): the updating
-- role must be able to see the history rows. A signed-in user can see their own
-- logs (RLS). service_role and the table owner bypass RLS and see every row.
-- SET search_path so the existence checks cannot be redirected.
CREATE OR REPLACE FUNCTION public.profiles_start_date_write_once()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.program_start_date IS NOT NULL
     AND NEW.program_start_date IS DISTINCT FROM OLD.program_start_date
     AND current_setting('swoltracker.allow_redate', true) IS DISTINCT FROM 'on'
     AND (
       EXISTS (
         SELECT 1
         FROM public.workout_logs AS wl
         WHERE wl.user_id = NEW.id
       )
       OR EXISTS (
         SELECT 1
         FROM public.workout_completions AS wc
         WHERE wc.user_id = NEW.id
       )
     )
  THEN
    RAISE EXCEPTION 'program_start_date is write-once after training history exists'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_start_date_write_once() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS profiles_start_date_write_once ON public.profiles;
CREATE TRIGGER profiles_start_date_write_once
  BEFORE UPDATE OF program_start_date
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_start_date_write_once();

-- Service-role re-date. PostgREST cannot SET a custom GUC, so demo-seed calls
-- this instead of updating profiles as the user. SECURITY DEFINER: the UPDATE
-- and the invoker trigger run as the owner, who can see history rows.
-- The hatch is opened only for this UPDATE. set_config cannot take NULL, so an
-- unset previous value is restored as '' — the trigger accepts only exact 'on'.
CREATE OR REPLACE FUNCTION public.admin_set_program_start_date(p_user_id uuid, p_start date)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev text;
  v_start date;
BEGIN
  v_prev := current_setting('swoltracker.allow_redate', true);
  PERFORM set_config('swoltracker.allow_redate', 'on', true);
  UPDATE public.profiles
     SET program_start_date = p_start
   WHERE public.profiles.id = p_user_id
   RETURNING public.profiles.program_start_date INTO v_start;
  PERFORM set_config('swoltracker.allow_redate', COALESCE(v_prev, ''), true);
  RETURN v_start;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_program_start_date(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_program_start_date(uuid, date) TO service_role;
