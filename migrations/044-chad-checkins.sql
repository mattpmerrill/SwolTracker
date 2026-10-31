-- 044: Chad weekly check-in storage and metering (ADR-006).
--
-- NOT APPLIED. This file is the source of truth only. Do not run it against a shared, remote or
-- production database from an agent session. Matt applies it by hand in the Supabase SQL editor,
-- and it must be applied BEFORE the code that writes to these tables ships: the check-in endpoints
-- fail on a missing table. /api/chad writes chad_events best-effort, so chat keeps working if 044
-- is applied late.
--
-- What it creates:
--   chad_coach_settings  per-user switch for the weekly check-in (one row per user)
--   chad_checkins        one proposed week of changes per user and target week: recap, changes,
--                        result, timers and status
--   chad_missed_offers   one offer to move an unlogged workout to a later rest day
--   chad_events          metering log: one row per step, with tokens, cost, attempt, duration
--   get_chad_usage(int)  admin-only usage report for the admin Chad tab
--
-- Who writes what:
--   The Temporal worker never touches the database. Its activities call /api/checkin-worker,
--   which writes every table here with the Supabase service role (bypasses RLS). The browser only
--   reads, through RLS. So there are no client INSERT/UPDATE/DELETE policies, and the client roles
--   also lose the table privileges as a second layer. Rows carry no updated_at trigger: this repo
--   has no such trigger pattern (writers set updated_at themselves), so the endpoint does the same.
--
-- Independent of 042 and 043: neither is applied in production. Preconditions this file does not
-- create (all exist since migrations 001/019 and the gym schema):
--   * auth.users, auth.uid(), public.gyms(id), public.is_admin(uuid)
--   * roles anon, authenticated, service_role (Supabase provides them)
--   * gen_random_uuid() (pg_catalog on PG13+)
--
-- Re-runnable: tables and indexes use IF NOT EXISTS, functions use CREATE OR REPLACE, policies are
-- dropped and recreated, GRANT/REVOKE are idempotent. If a table already exists with an older
-- shape, IF NOT EXISTS leaves it alone; there is no older shape yet.
--
-- How runs are counted in get_chad_usage: a run is one instigated unit of work (a weekly check-in,
-- a missed-day check, a user chat message) and has exactly ONE `run.started` event. runs is
-- count(event = 'run.started'). Not distinct Temporal run ids: those change on every
-- continue-as-new and are NULL for chat messages. Not distinct check-in ids: missed-day checks
-- have none. Writers MUST emit one run.started per run, or the counts drift.
--
-- Who can see whom: get_chad_usage returns each top user's email, read from auth.users. That is
-- the same exposure as get_all_users (023) and get_admin_user_details, and it sits behind the same
-- is_admin() check.
--
-- Tested by the builder (2026-10-31) on a scratch Postgres 17 with stubbed auth.users, auth.uid()
-- and is_admin: the file ran twice without error; a non-admin got 42501 from get_chad_usage and
-- anon got no access; a user saw only their own check-ins; client INSERT/UPDATE/DELETE and any
-- read of chad_events were refused (and the RLS policies alone still refuse a client insert if the
-- table grants were widened); the CHECKs and UNIQUE keys refused bad enums, a same-day offer and
-- a duplicate (user, target_week); deleting a user cascaded.
--
-- How to verify (SQL editor, after applying):
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE oid IN ('public.chad_coach_settings'::regclass, 'public.chad_checkins'::regclass,
--                  'public.chad_missed_offers'::regclass, 'public.chad_events'::regclass);  -- all t
--   SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename LIKE 'chad_%';       -- 3 rows, SELECT
--   -- as the authenticated role with request.jwt.claim.sub set to a non-admin user:
--   --   SELECT get_chad_usage(7);  fails with 42501
--   -- as the admin user it returns the JSON report (all zeros on an empty table).
--
/*
ROLLBACK: do not execute as part of applying this file. Deletes every check-in, offer and metering
row. Program edits that check-ins already applied stay (they live in workout_programs).

DROP FUNCTION IF EXISTS public.get_chad_usage(int);
DROP TABLE IF EXISTS public.chad_events;
DROP TABLE IF EXISTS public.chad_missed_offers;
DROP TABLE IF EXISTS public.chad_checkins;
DROP TABLE IF EXISTS public.chad_coach_settings;
*/

-- ============================================
-- 1. chad_coach_settings
-- ============================================

CREATE TABLE IF NOT EXISTS public.chad_coach_settings (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  weekly_checkin  BOOLEAN NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.chad_coach_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chad_coach_settings_select_own" ON public.chad_coach_settings;
CREATE POLICY "chad_coach_settings_select_own" ON public.chad_coach_settings
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- ============================================
-- 2. chad_checkins
-- ============================================

CREATE TABLE IF NOT EXISTS public.chad_checkins (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gym_id       UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  review_week  INT  NOT NULL CHECK (review_week >= 1),
  target_week  INT  NOT NULL,
  status       TEXT NOT NULL DEFAULT 'drafting'
                 CHECK (status IN ('drafting', 'pending', 'applied', 'partial', 'declined', 'expired', 'failed')),
  recap        JSONB NOT NULL DEFAULT '{}'::jsonb,
  changes      JSONB NOT NULL DEFAULT '[]'::jsonb,
  result       JSONB NULL,
  reminder_at  TIMESTAMPTZ NULL,
  expires_at   TIMESTAMPTZ NULL,
  notified_at  TIMESTAMPTZ NULL,
  reminded_at  TIMESTAMPTZ NULL,
  decided_at   TIMESTAMPTZ NULL,
  workflow_id  TEXT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chad_checkins_target_after_review CHECK (target_week > review_week),
  -- The draft operation upserts on this key, so a retried activity returns the same row.
  CONSTRAINT chad_checkins_user_target_unique UNIQUE (user_id, target_week)
);

CREATE INDEX IF NOT EXISTS idx_chad_checkins_user_created
  ON public.chad_checkins (user_id, created_at DESC);
-- The expiry sweep only ever touches open rows.
CREATE INDEX IF NOT EXISTS idx_chad_checkins_open
  ON public.chad_checkins (status, expires_at) WHERE status IN ('drafting', 'pending');

ALTER TABLE public.chad_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chad_checkins_select_own" ON public.chad_checkins;
CREATE POLICY "chad_checkins_select_own" ON public.chad_checkins
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- ============================================
-- 3. chad_missed_offers
-- ============================================
-- from_day is the unlogged workout, to_day the rest day it would move to. notified_at and
-- updated_at are additions to the plan's column list: the push is deduped on the offer row.

CREATE TABLE IF NOT EXISTS public.chad_missed_offers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week         INT  NOT NULL CHECK (week >= 1),
  from_day     TEXT NOT NULL CHECK (from_day IN
                 ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  to_day       TEXT NOT NULL CHECK (to_day IN
                 ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  expires_at   TIMESTAMPTZ NULL,
  notified_at  TIMESTAMPTZ NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chad_missed_offers_days_differ CHECK (from_day <> to_day),
  CONSTRAINT chad_missed_offers_unique UNIQUE (user_id, week, from_day)
);

CREATE INDEX IF NOT EXISTS idx_chad_missed_offers_user_created
  ON public.chad_missed_offers (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chad_missed_offers_open
  ON public.chad_missed_offers (status, expires_at) WHERE status = 'pending';

ALTER TABLE public.chad_missed_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chad_missed_offers_select_own" ON public.chad_missed_offers;
CREATE POLICY "chad_missed_offers_select_own" ON public.chad_missed_offers
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- ============================================
-- 4. chad_events (metering)
-- ============================================
-- workflow_id and run_id are NULL for instigation 'user_message' (a chat turn is not a workflow).
-- checkin_id is SET NULL on delete so metering outlives the check-in it described.

CREATE TABLE IF NOT EXISTS public.chad_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id        TEXT NULL,
  run_id             TEXT NULL,
  checkin_id         UUID NULL REFERENCES public.chad_checkins(id) ON DELETE SET NULL,
  instigation        TEXT NOT NULL
                       CHECK (instigation IN ('schedule', 'day_missed', 'user_action', 'user_message')),
  event              TEXT NOT NULL
                       CHECK (event IN ('run.started', 'step.completed', 'step.failed',
                                        'waiting_on_human', 'approved', 'declined', 'expired', 'completed')),
  step               TEXT NULL,
  model              TEXT NULL,
  prompt_tokens      INT  NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens  INT  NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  cost_usd           NUMERIC(10, 6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  attempt            INT  NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  duration_ms        INT  NULL CHECK (duration_ms >= 0),
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chad_events_user_created
  ON public.chad_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chad_events_created
  ON public.chad_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chad_events_checkin
  ON public.chad_events (checkin_id) WHERE checkin_id IS NOT NULL;

-- RLS on with no policy: no client role can read or write. Only the service role and the
-- SECURITY DEFINER report below touch this table.
ALTER TABLE public.chad_events ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. Table privileges (second layer under RLS)
-- ============================================
-- Supabase grants new tables to the client roles by default. Take back everything the client must
-- not have so a mistaken policy later cannot open a write path on its own.

REVOKE ALL ON public.chad_coach_settings, public.chad_checkins, public.chad_missed_offers,
              public.chad_events FROM anon;
REVOKE ALL ON public.chad_events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.chad_coach_settings, public.chad_checkins, public.chad_missed_offers FROM authenticated;
GRANT SELECT ON public.chad_coach_settings, public.chad_checkins, public.chad_missed_offers TO authenticated;
GRANT ALL ON public.chad_coach_settings, public.chad_checkins, public.chad_missed_offers,
             public.chad_events TO service_role;

-- ============================================
-- 6. get_chad_usage: admin usage report
-- ============================================
-- Window: the last p_days UTC calendar days including today (clamped to 1..366). Every section
-- uses the same window so the cards and the daily series agree. Costs are the cost_usd the writer
-- computed at event time, so a later price change does not rewrite history.

CREATE OR REPLACE FUNCTION public.get_chad_usage(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_days   int := LEAST(GREATEST(COALESCE(p_days, 30), 1), 366);
  v_since  timestamptz := (date_trunc('day', timezone('UTC', now())) - make_interval(days => v_days - 1))
                            AT TIME ZONE 'UTC';
  v_totals jsonb;
  v_by_instigation jsonb;
  v_top_users jsonb;
  v_approval jsonb;
  v_median numeric;
  v_reliability jsonb;
  v_daily jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- runs = count of run.started events (see the header). Tokens and cost sum every event.
  SELECT jsonb_build_object(
           'runs', COUNT(*) FILTER (WHERE e.event = 'run.started'),
           'tokens', COALESCE(SUM(e.prompt_tokens + e.completion_tokens), 0),
           'cost_usd', COALESCE(SUM(e.cost_usd), 0),
           'active_users', COUNT(DISTINCT e.user_id),
           'cost_per_active_user',
             ROUND(COALESCE(SUM(e.cost_usd), 0) / NULLIF(COUNT(DISTINCT e.user_id), 0), 6)
         )
    INTO v_totals
    FROM public.chad_events e
   WHERE e.created_at >= v_since;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.cost_usd DESC, t.instigation), '[]'::jsonb)
    INTO v_by_instigation
    FROM (
      SELECT e.instigation,
             COUNT(*) FILTER (WHERE e.event = 'run.started') AS runs,
             COALESCE(SUM(e.prompt_tokens + e.completion_tokens), 0) AS tokens,
             COALESCE(SUM(e.cost_usd), 0) AS cost_usd,
             COUNT(DISTINCT e.user_id) AS active_users
        FROM public.chad_events e
       WHERE e.created_at >= v_since
       GROUP BY e.instigation
    ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.cost_usd DESC, t.user_id), '[]'::jsonb)
    INTO v_top_users
    FROM (
      SELECT e.user_id,
             u.email,
             COUNT(*) FILTER (WHERE e.event = 'run.started') AS runs,
             COALESCE(SUM(e.prompt_tokens + e.completion_tokens), 0) AS tokens,
             COALESCE(SUM(e.cost_usd), 0) AS cost_usd
        FROM public.chad_events e
        LEFT JOIN auth.users u ON u.id = e.user_id
       WHERE e.created_at >= v_since
       GROUP BY e.user_id, u.email
       ORDER BY COALESCE(SUM(e.cost_usd), 0) DESC, e.user_id
       LIMIT 10
    ) t;

  -- approval_rate = (applied + partial) / (applied + partial + declined + expired), counting only
  -- check-ins that had at least one proposed change. A quiet week (no changes) is answered with
  -- "Got it", which is stored as declined; counting it would drag the rate down for a week where
  -- Chad had nothing to ask. Open (drafting, pending) and failed check-ins (never drafted, or every
  -- ticked change conflicted) are counted but are not in the rate. The per-status counts below cover
  -- every check-in.
  SELECT jsonb_build_object(
           'applied',  COUNT(*) FILTER (WHERE c.status = 'applied'),
           'partial',  COUNT(*) FILTER (WHERE c.status = 'partial'),
           'declined', COUNT(*) FILTER (WHERE c.status = 'declined'),
           'expired',  COUNT(*) FILTER (WHERE c.status = 'expired'),
           'open',     COUNT(*) FILTER (WHERE c.status IN ('drafting', 'pending')),
           'failed',   COUNT(*) FILTER (WHERE c.status = 'failed'),
           'approval_rate', ROUND(
             COUNT(*) FILTER (WHERE c.status IN ('applied', 'partial') AND jsonb_array_length(c.changes) > 0)::numeric
             / NULLIF(COUNT(*) FILTER (WHERE c.status IN ('applied', 'partial', 'declined', 'expired')
                                         AND jsonb_array_length(c.changes) > 0), 0),
             4)
         ),
         ROUND(
           (PERCENTILE_CONT(0.5) WITHIN GROUP (
              ORDER BY EXTRACT(EPOCH FROM (c.decided_at - c.created_at)) / 3600.0
            ) FILTER (WHERE c.status IN ('applied', 'partial', 'declined') AND c.decided_at IS NOT NULL
                        AND jsonb_array_length(c.changes) > 0))::numeric,
           2)
    INTO v_approval, v_median
    FROM public.chad_checkins c
   WHERE c.created_at >= v_since;

  SELECT jsonb_build_object(
           'failures', COUNT(*) FILTER (WHERE e.event = 'step.failed'),
           'retries',  COUNT(*) FILTER (WHERE e.attempt > 1)
         )
    INTO v_reliability
    FROM public.chad_events e
   WHERE e.created_at >= v_since;

  -- One row per UTC day in the window, zero-filled, so the chart has no gaps.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'day', d.day,
           'cost_usd', COALESCE(a.cost_usd, 0),
           'tokens', COALESCE(a.tokens, 0),
           'runs', COALESCE(a.runs, 0)
         ) ORDER BY d.day), '[]'::jsonb)
    INTO v_daily
    FROM generate_series(0, v_days - 1) AS g(i)
    CROSS JOIN LATERAL (SELECT timezone('UTC', v_since)::date + g.i AS day) d
    LEFT JOIN (
      SELECT timezone('UTC', e.created_at)::date AS day,
             SUM(e.cost_usd) AS cost_usd,
             SUM(e.prompt_tokens + e.completion_tokens) AS tokens,
             COUNT(*) FILTER (WHERE e.event = 'run.started') AS runs
        FROM public.chad_events e
       WHERE e.created_at >= v_since
       GROUP BY 1
    ) a ON a.day = d.day;

  RETURN jsonb_build_object(
    'days', v_days,
    'since', v_since,
    'totals', v_totals,
    'by_instigation', v_by_instigation,
    'top_users', v_top_users,
    'approval', v_approval,
    'median_hours_to_decision', v_median,
    'reliability', v_reliability,
    'daily_cost', v_daily
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_chad_usage(int) FROM PUBLIC, anon;
-- The admin check is inside the function, so every signed-in user may call it and only admins pass.
GRANT EXECUTE ON FUNCTION public.get_chad_usage(int) TO authenticated;
