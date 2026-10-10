# Aleesha feedback: authoritative dates, one gym, "not logged" vs "missed"

> **For Hermes:** Opus 5.5 plans and reviews. Each task is executed by a fresh Grok 4.7 (xhigh) subagent on its own
> branch. Opus reviews against this plan, merges into the integration branch, or dispatches a fix worker.

**Goal:** the web app, the MCP tools and the database agree on today, the current week and the gym, and coaching never
treats an unmeasured or unlogged item as a failed rep.

**Branching:** integration branch `feat/aleesha-feedback` off `main` (`96ff83e`). Each task: branch
`feat/aleesha-feedback-tN` off the current integration branch, in a worktree at
`~/Work/SwolTracker-wt/tN`. Opus merges each task into the integration branch after review. One PR
`feat/aleesha-feedback` -> `main` at the end. **Merging to `main` deploys production: only after Matt's OK.**

**Rules for every worker:** read `AGENTS.md` first and follow it (one owner per concept in `shared/`, no logic in UI,
Zod at boundaries, a bug fix ships a regression test that failed before the fix). Definition of Done after the last
edit: `npm run lint` (0 errors, no new warnings beyond 17), `npm test`, `npm run build`, `cd mcp && npm run build`,
`npm run knip`. Never touch production data, never apply a migration, never push to `main`, never print secrets.
Commit on your task branch only. Report: commits, files changed, test counts before/after, anything you could not do.

---

## Evidence (Opus, read-only, 2026-10-09)

Baseline on `main` `96ff83e`: 316 tests in 54 files pass, lint 0 errors / 17 warnings, MCP build OK.

### A. Duplicate gym — already repaired on 2026-10-01
- Aleesha has ONE auth user, ONE profile, ONE gym membership (`2b364d88…`, owner). Shadow gym `7ed03c6d…` no longer
  exists. `gyms_one_per_creator` unique index is live (migration 041). Backups exist in `forensics_bak.*_20261001`
  (11 tables, incl. the repair report). Her start date is `2026-06-01`; 586/589 logs match their timestamp week.
- Her agent kept dual-writing every program to both gyms until 2026-10-01 (`app_events program.saved` pairs). Since
  2026-10-04 its saves go to one gym only. Her feedback likely predates the repair, or her agent still "remembers"
  two gyms. The code and DB now prevent a second gym; what is missing is that tools never say *which gym is
  authoritative*, so an agent that saw two gyms has nothing that tells it to stop.

### B. Dates are not authoritative (root causes in code)
1. **Server clock is UTC.** `shared/week-math.ts` `calculateCurrentWeek` and `getTodayDayName` use `new Date()` in the
   process time zone. The web app runs in her browser (Denver); the MCP server runs on Vercel (UTC). From 18:00 MDT
   (00:00 UTC) every agent tool thinks it is tomorrow; on Sunday evening it thinks it is next week's Monday. Callers:
   `mcp/src/tools/queries.ts:60-66` (`resolveCurrentWeek`, used by get_todays_workout, get_weekly_workout,
   get_program_overview, get_workout_logs, history, overload), `:222` (`getTodayName`), `mcp/src/tools/actions.ts:121,127,
   722,868,990`, `mcp/src/tools/natural-language.ts:124`, `mcp/src/context-modules.ts:48`.
2. **`get_streak` uses week 1 always.** `mcp/src/tools/context.ts:40` calls `getCurrentWeek(null)`, which returns 1, so
   the current streak only counts back from week 1.
3. **Backend `get_current_week(uuid)` RPC disagrees with `shared/`.** Live definition:
   `FLOOR((CURRENT_DATE - start)/7) + 1` — not Monday-aligned, and `CURRENT_DATE` is the DB's UTC date. Matches today
   only because her start date is a Monday.
4. **Tool responses carry a week number but no dates**, so an agent cannot check that its "Week 19" is the same
   Monday–Sunday the app shows under "This week".
5. **`program_start_date` has no DB guard** (docs/status.md "Not done"): RLS still lets a signed-in user re-date it.
6. `profiles.timezone` exists; 10 of 11 users have NULL. The app's reminder code already assumes `America/Denver`.

### C. "Not logged" counted as "missed"
- `parseReps(null)` returns 0 (`mcp/src/tools/queries.ts` ~line 940 and `src/lib/insightsHelpers.js:16`), so a set saved
  with no rep count (`actual_reps` NULL) is treated as `0 < prescribed` = missed reps.
- 322 of Aleesha's 589 logs have `actual_reps` NULL with `completed = true`: timed, per-side and mobility items
  ("20s", "5 min", "10x", "8 ea", "1–3 min"): Jaw Release, Face Yoga, Close Meditation Cue, Raven Asana Warmup, planks.
- Effects: `get_overload_recommendations` flags them "Missed prescribed reps … consider a deload"
  (`queries.ts` ~1035-1055), `get_training_history_summary` says "missed reps" (`queries.ts:855`), and the web
  insights (`src/lib/repositories/insightsBuilders.js:89-111`) repeat it. A time prescription like "20s" is parsed as
  20 reps.

---

## Task 1 — One owner for set outcomes (`shared/set-outcome.ts`)

**Objective:** classify each logged set as `hit`, `missed`, `done_unmeasured` or `not_logged`, and make every
coaching path use it.

**Files:** create `shared/set-outcome.ts`, `shared/__tests__/set-outcome.test.ts`; modify `mcp/src/tools/queries.ts`
(training history ~790-860 and overload ~930-1060), `src/lib/insightsHelpers.js`, `src/lib/repositories/insightsBuilders.js`
(+ its tests), add a thin re-export for the web side the same way `src/utils/e1rm.js` re-exports `shared/e1rm.ts`.

**Rules (write tests first):**
- `parsePrescription(reps)`: returns `{ kind: "reps", count }` for a plain rep count ("8", 8, "8-10" → 8 lower bound,
  "8 ea", "8 ea leg", "10/leg", "10x", "10 each leg" → 10); `{ kind: "time" }` for anything with s, sec, min, minute(s),
  ":"; `{ kind: "unknown" }` otherwise (AMRAP, "1+", empty, text). Do not treat a time as reps.
- `classifySet({ actual_reps, prescribed_reps, completed })`:
  - row with `completed === false` → `missed`
  - `actual_reps` null/empty → `done_unmeasured` (it was ticked off; we just have no count)
  - prescription not `reps` → `done_unmeasured`
  - numeric actual < prescribed count → `missed`, else `hit`
- `not_logged` is for a prescribed exercise with no rows at all; expose a helper but do not invent rows for it.
- Session rollup: `hit_all_reps` becomes three-valued: a session counts toward "Ready to level up" only if it has at
  least one `hit` and no `missed`; toward "Check load" only if it has at least one `missed`. A session of only
  `done_unmeasured` sets counts toward neither, and the streak loop skips it (does not break a streak, does not extend
  one).
- Training history text: per session print `hit reps`, `missed reps`, or `done (no rep count)`; never "missed" for
  unmeasured.
- Overload: never emit a deload for an exercise whose recent sessions are all `done_unmeasured`.

**Regression tests (must fail on main):** a fixture with Jaw Release "20s" (actual null, completed true) ×2 sessions and
Face Yoga "10x" null ×2 produces no "Check load" in MCP overload and in web insights; "Goblet Squat" 10 prescribed, 8
actual ×2 still produces "Check load"; 3× 10/10 still "Ready to level up". Remove the duplicated `parseReps` copies.

## Task 2 — Time-zone-aware "today" and current week

**Objective:** every surface computes today and the program week in the user's time zone.

**Files:** `shared/week-math.ts` (+ tests), `mcp/src/week-calc.ts`, all MCP callers listed in B1, `mcp/src/tools/context.ts`,
`src/utils/date.js` only if signatures change.

**Rules:**
- Add `todayInZone(timeZone, now = new Date())` returning a local calendar `Date` for the user's date in that zone
  (use `Intl.DateTimeFormat(..., { timeZone })` parts; no new dependency).
- `calculateCurrentWeek(start, opts?: { now?: Date; timeZone?: string })` and `getTodayDayName(opts?)`; default time
  zone = the runtime's (keeps the browser behavior unchanged). Add `getWeekDates` output as ISO `YYYY-MM-DD` helper
  `formatCalendarDate`.
- MCP: one helper `resolveUserClock(supabase, userId)` → `{ timeZone, today, dayName, currentWeek, weekStart, weekEnd }`
  reading `profiles.program_start_date, timezone`; `timezone ?? "America/Denver"` (`DEFAULT_TIME_ZONE` exported from
  `shared/week-math.ts`; reuse it in `api/_reminders.js` instead of its literal). Validate the zone (invalid → default).
  Every MCP caller in B1 uses it; no MCP code calls `new Date()` for day/week decisions.
- Fix `context.ts:40` to use the real current week (regression test: start 2026-06-01, now = 2026-10-09, completions
  in weeks 17,18,19 → current streak 3).
- Regression test: start `2026-06-01`, `now = 2026-10-05T04:30:00Z` (Sunday 22:30 MDT) → MCP current week 18, day
  Sunday (main says 19 / Monday).
- Web: when the profile has a timezone, `ProgramContext` uses it; otherwise unchanged.

## Task 3 — Week dates in tool responses (the shared pointer)

**Objective:** an agent can see exactly which Monday–Sunday a week number means, the same one the app shows.

**Files:** `mcp/src/tools/queries.ts`, `mcp/src/context-modules.ts`, `mcp/src/sdk-adapter.ts` (only if output schemas are
declared), `SKILL.md`, contract tests.

**Rules:** `get_todays_workout`, `get_weekly_workout`, `get_program_overview` (current week), `get_workout_logs` and the
context bundle `current_program` module add `week_start`, `week_end` (`YYYY-MM-DD`), `today`, `time_zone` to `data`, and
the text message says e.g. `Week 19 (Oct 5 – Oct 11)`. Keep existing fields (additive only). When a caller passes a
`week_number`, return that week's dates. SKILL.md: tell agents the dates are authoritative and to never compute week
numbers themselves. Contract tests pin the new fields.

## Task 4 — Database: `get_current_week` and a start-date guard (migration 042, NOT applied)

**Objective:** the SQL pointer agrees with `shared/`, and the start date cannot be re-dated once history exists.

**Files:** create `migrations/042-authoritative-week.sql`; a test that runs it on a scratch Postgres if the repo has a
pattern for that, else a SQL self-test block at the end of the file guarded by a `DO $$` with `RAISE` on mismatch.

**Rules:**
- `get_current_week(p_user_id)`: keep signature and grants (CREATE OR REPLACE), add `PERFORM _require_self(p_user_id)`
  only if service-role callers still work (service role bypasses `auth.uid()`; check `_require_self`'s definition in
  `migrations/` and say what you found). Compute today as `(now() AT TIME ZONE COALESCE(valid profile timezone,
  'America/Denver'))::date`, Monday-align the start date (`start - (extract(isodow from start)::int - 1)`), then
  `GREATEST(1, ((today - monday_start) / 7) + 1)`.
- Trigger `profiles_start_date_write_once` BEFORE UPDATE OF program_start_date: if OLD is not null, NEW differs, and
  the user has any `workout_logs` or `workout_completions`, raise a clear exception, unless
  `current_setting('swoltracker.allow_redate', true) = 'on'` (the sanctioned demo-seed / repair path; document it).
- Header comment: what, why, preconditions, how to verify, rollback SQL. Do not apply it anywhere.

## Task 5 — Make the one gym explicit to agents

**Objective:** an agent that once saw two gyms learns there is one authoritative gym and stops dual-writing.

**Files:** `mcp/src/tools/queries.ts` (`list_gyms`), context bundle module, `SKILL.md`, tests.

**Rules:** `list_gyms` marks the gym `resolveGymId()` returns with `primary: true` and its message says "Use gym <name>
(<id>) for everything; you have exactly one personal gym." The context bundle includes `gym_id`. SKILL.md: "gym_id is
optional; omit it. Never write the same program to more than one gym." Tests pin both.

## Task 6 — Docs

Update `docs/status.md` (what changed, migration 042 written not applied, tool response additions) and the relevant
SKILL.md lines. No code.

---

## Opus review checklist (per task)
- Diff matches the task's Files and Rules; nothing outside scope; additive tool changes only.
- Regression test exists and fails on the parent commit (Opus checks out the parent and runs it).
- Definition of Done commands rerun by Opus, not trusted from the report.
- Worker run verified as `grok-4.7` / `xai-oauth` with no fallback in `~/.hermes/logs/agent.log`.

## After all tasks (needs Matt)
1. PR `feat/aleesha-feedback` → `main`; CI green; Vercel preview checked against Aleesha's real data read-only.
2. **Matt OK** → merge (deploys production) → verify MCP `get_todays_workout` week/dates and the app label agree.
3. **Matt OK** → apply migration 042 to project `qbykzrpppowcjxrofoxi` (SwolTracker, 21 Stacks), verify
   `get_current_week` for every user equals `shared/` math, and that a re-date attempt on Aleesha's profile is refused.
4. Tell Aleesha's agent (Coach Board note): one gym, dates are in every response, unmeasured items are not misses.

## Status

Tasks 1-5 and 7 are done and merged into `feat/aleesha-feedback`. Task 7 is the reminder zone and
the demo re-date function, added from review. Task 6 is this docs update.

Remaining: the pull request, Matt's OK to deploy, Matt's OK to apply 042, and a Coach Board note
to Aleesha's agent.
