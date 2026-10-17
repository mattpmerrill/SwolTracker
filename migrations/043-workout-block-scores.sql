-- 043: workout_block_scores, one score per user per scored block (AMRAP / For Time).
--
-- NOT APPLIED. This file is the source of truth only. Do not run it against a
-- shared, remote, or production database from an agent session; applying it to
-- production needs Matt's OK and must happen BEFORE the code that writes to it
-- is deployed (the log_block_score tool and the web score entry both fail on a
-- missing table).
--
-- Why: docs/plans/2026-10-17-coach-notes-and-blocks.md. Week 38 Saturday's
-- "Forge Baseline AMRAP" was logged as four separate set rows, three with
-- actual_reps NULL, so there was no score ("5 rounds + 22 reps") to beat next
-- time. A block's score belongs to the block, not to any one movement.
-- workout_logs keeps getting one set-0 row per block movement so completion
-- and streaks still count the work; this table holds the score itself.
--
-- Shape: the program JSON (workout_programs.program_data) names the block
-- (day.blocks[].id) and its optional benchmark slug. block_id is therefore a
-- program-JSON key, not a foreign key. benchmark is copied onto the score at
-- save time so "the number to beat" survives a later program edit.
--
-- Score validity (mirrors shared/workout-blocks.ts isValidBlockScore):
--   amrap     rounds required; reps defaults to 0; no time_seconds; capped false
--   for_time  time_seconds > 0 and capped false (finished), or
--             capped true with rounds and/or reps done and no time_seconds
-- The CHECK is the last line of defence; the app validates before it writes.
--
-- RLS: a user selects, inserts, updates and deletes only their own rows. Insert
-- and update also require membership of gym_id in gym_members, so a user cannot
-- attach a score to a stranger's gym. Group members log against the leader's
-- program but under their own gym_id, which is a gym they belong to. The MCP
-- endpoint uses the service role (bypasses RLS) and enforces the same two rules
-- itself: user id from the key, gym via the membership resolver.
--
-- Preconditions this file does not create:
--   * public.profiles(id), public.gyms(id), public.gym_members(gym_id, user_id)
--   * gen_random_uuid() (pg_catalog on PG13+, as used by earlier migrations)
--
-- How to verify (SQL editor, after applying):
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.workout_block_scores'::regclass;  -- t
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'workout_block_scores';          -- 4 rows
--   -- as the authenticated role, with request.jwt.claim.sub set to a real user:
--   --   an INSERT with another user's user_id fails; with a gym the user is not in, fails;
--   --   an amrap row with rounds NULL fails the CHECK; a for_time row with time_seconds 0 fails.
--
/*
ROLLBACK — do not execute as part of applying this file. Deletes every stored
block score; the set-0 workout_logs rows written alongside are untouched.

DROP TABLE IF EXISTS public.workout_block_scores;
*/

CREATE TABLE IF NOT EXISTS public.workout_block_scores (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gym_id       UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  week_number  INT  NOT NULL CHECK (week_number >= 1),
  day_name     TEXT NOT NULL CHECK (day_name IN
                 ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  block_id     TEXT NOT NULL CHECK (block_id ~ '^[a-z0-9-]{1,32}$'),
  benchmark    TEXT NULL CHECK (benchmark IS NULL OR benchmark ~ '^[a-z0-9-]{1,32}$'),
  score_type   TEXT NOT NULL CHECK (score_type IN ('amrap', 'for_time')),
  rounds       INT  NULL CHECK (rounds >= 0),
  reps         INT  NULL CHECK (reps >= 0),
  time_seconds INT  NULL CHECK (time_seconds > 0),
  capped       BOOLEAN NOT NULL DEFAULT false,
  note         TEXT NULL CHECK (char_length(note) <= 280),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workout_block_scores_unique_block
    UNIQUE (user_id, gym_id, week_number, day_name, block_id),
  CONSTRAINT workout_block_scores_shape CHECK (
    (score_type = 'amrap'
       AND rounds IS NOT NULL AND time_seconds IS NULL AND capped = false)
    OR
    (score_type = 'for_time' AND capped = false
       AND time_seconds IS NOT NULL)
    OR
    (score_type = 'for_time' AND capped = true
       AND time_seconds IS NULL AND (rounds IS NOT NULL OR reps IS NOT NULL))
  )
);

-- "Number to beat": all of a user's scores for one benchmark, across weeks.
CREATE INDEX IF NOT EXISTS idx_workout_block_scores_user_benchmark
  ON public.workout_block_scores (user_id, benchmark);

ALTER TABLE public.workout_block_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own block scores" ON public.workout_block_scores
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users insert own block scores" ON public.workout_block_scores
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND gym_id IN (SELECT gm.gym_id FROM public.gym_members AS gm WHERE gm.user_id = auth.uid())
  );

CREATE POLICY "Users update own block scores" ON public.workout_block_scores
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND gym_id IN (SELECT gm.gym_id FROM public.gym_members AS gm WHERE gm.user_id = auth.uid())
  );

CREATE POLICY "Users delete own block scores" ON public.workout_block_scores
  FOR DELETE USING (user_id = auth.uid());
