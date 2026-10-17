# Status and handoff

Where the project stands and how to pick it up. Update this at the end of each working session.

**Coach's notes and scored blocks (2026-10-17, branch feat/coach-notes-blocks, not yet merged).**
Plan: `docs/plans/2026-10-17-coach-notes-and-blocks.md`. Why: Week 38 Saturday's Forge AMRAP showed
four movements and no time cap or scoring, and the AMRAP logged as four sets with no reps.
- Program days may carry `coach_notes` (≤ 1500) and `blocks` (`amrap` / `for_time`, `time_cap_min`,
  `exercise_indexes`, optional `rounds`, `benchmark`, `notes`). Exercise `note` max is 500 (the agent
  used `notes`, which Zod stripped). `ExerciseSchema` now keeps `weight_lbs` (it was stripped on save).
- `shared/workout-blocks.ts` owns block parsing, day sections, AMRAP rep totals, score format,
  compare and best previous.
- `migrations/043-workout-block-scores.sql` is written, NOT applied. Re-runnable. Opus ran it twice
  on a scratch Postgres 17: RLS and CHECKs behave (see its header). Apply before merging the code.
- MCP: 44 tools. New `log_block_score` (`write:logs`) writes the score row and the set-0 log per
  block movement. `get_todays_workout` returns `coach_notes` and `blocks[]` with `score` and
  `best_previous`. `get_weekly_workout` and the history summary include blocks.
- Web: `CoachNotesCard`, `WorkoutBlockCard` (cap badge, timestamp-based countdown timer, score entry,
  number to beat, new best), `ClampedNote` (Show more on exercise notes), `useBlockScores`,
  `db.blockScores` repository. `logSet` accepts `completed: true` so a score re-save never un-logs.
- Tests 359 → 471. Lint 0 errors / 17 warnings, both builds, knip clean. The UI has not been
  viewed in a browser yet; there are no render tests (no DOM in vitest).
- After merge: backfill Week 38 Saturday (coach_notes + `forge` block, score 5 rounds + 10 reps),
  and update the Joi skill and morning brief to read `coach_notes` and blocks.

**Aleesha feedback (2026-10-09, branch feat/aleesha-feedback, not yet merged).**
Not on `main` yet.
- `shared/set-outcome.ts` is the one owner for set outcomes (`hit`, `missed`, `done_unmeasured`,
  `not_logged`). Timed or unmeasured sets (`actual_reps` null, or a time prescription such as
  `20s`) are no longer missed reps in MCP overload, training history, the context bundle deload,
  web insights, and the AI generator modal.
- Time zone: `shared/week-math.ts` adds `DEFAULT_TIME_ZONE` (`America/Denver`), `todayInZone`,
  `isValidTimeZone`, `formatCalendarDate`, and optional `{ now, timeZone }` on
  `calculateCurrentWeek` and `getTodayDayName`. MCP uses `resolveUserClock` in
  `mcp/src/user-clock.ts` (profile time zone, otherwise Denver) for every day and week decision
  instead of the UTC server clock. `get_streak` no longer always counts from week 1. Web
  `ProgramContext` uses `profile.timezone` when it is valid. The reminder cron uses the user's
  zone for the week too.
- MCP responses: `get_todays_workout`, `get_weekly_workout`, `get_program_overview`,
  `get_workout_logs` and the context bundle `current_program` add `week_number`, `week_start`,
  `week_end`, `today` and `time_zone`. The text shows, for example, `Week 19 (Mon Oct 5 – Sun Oct 11)`.
  The context bundle also adds `gym_id` and `gym_name`. `list_gyms` marks one gym `primary: true`
  and says to use that gym for everything. `SKILL.md` already has the matching rules.
- `migrations/042-authoritative-week.sql` is written and not applied. It makes `get_current_week`
  Monday-aligned and time-zone-aware, adds trigger `profiles_start_date_write_once` (raises
  `23514` once history exists; SQL escape hatch `SET LOCAL swoltracker.allow_redate = 'on'`), and
  adds service-role-only `admin_set_program_start_date`, which `scripts/demo-seed.mjs` uses to
  re-date the demo user. Demo seed re-dating fails until 042 is applied. Before applying, diff
  the live `get_current_week` against the rollback body in that file (read 2026-10-09). If the
  live function differs, the rollback is stale.

**As of 2026-09-30.** The app is live at https://swol-tracker.vercel.app and deploys from `main`
on every push. The Test and Knip workflows passed on the last `main` push (after merged PRs #3 to
#7: Knip added and dead code removed, a lint fix, a Vite chunking cleanup, and a fix for the web
app showing one program week ahead west of UTC, with a Denver-time regression test). Locally, `npm test`
runs 359 tests in 59 files and `npm run lint` reports 0 errors and 17 warnings (2026-10-09, branch
`feat/aleesha-feedback`, not yet merged; 316 tests in 54 files on 2026-09-30).

**Phase 0.3 hotfix (2026-10-01, on `fix/phase0-db-hardening`, uncommitted at the time of writing).**
Done while Snappy Coach is built, so the old app cannot undo a data repair:
- The `shift_program` MCP tool is removed; the server now has 43 tools in three categories.
- `profiles.program_start_date` is write-once in app code. MCP `update_profile` rejects it with a
  clear message (declared in the tool schema as always-invalid, because the SDK strips unknown
  keys), MCP `complete_onboarding` keeps an existing date, and the web Profile screen shows it
  read-only. `scripts/demo-seed.mjs` is the one sanctioned re-dating path (demo user only).
- Every "first gym" lookup is ordered by `joined_at, gym_id`. Onboarding reuses an existing gym
  (preferring one the user owns) instead of creating a duplicate personal gym.
- `migrations/040-start-date-write-once.sql` (the `complete_onboarding` RPC keeps an existing
  start date, and two functions pick a gym deterministically) was applied to production on
  2026-10-01 after PR #9 deployed. `migrations/039` was applied by hand earlier the same day.
- `migrations/041-one-gym-per-creator.sql` (unique index `gyms_one_per_creator` on `gyms(created_by)`, and
  `create_user_gym` made idempotent so a repeat or racing call returns the existing gym) was tested on a scratch
  Postgres (including 160 concurrent calls) and applied to production on 2026-10-01; a repeat call
  as the demo user returned the existing gym and created nothing.
- A database-level guard for the start date is addressed by `migrations/042-authoritative-week.sql`
  once applied (trigger `profiles_start_date_write_once`). Until then, RLS still lets a signed-in
  user update their own `program_start_date` directly.

The code is feature-complete for its current scope and is resting while a refactor is planned as a
separate project. This docs pass (README, AGENTS.md, architecture, ADRs, this file, screenshots)
was written on the branch `docs/readme-and-agents` and changes no app code.

## What is live

- Sign in with Google (Supabase Auth). Onboarding is agent-first (connect an MCP agent, which
  interviews the user), with "No agent? Set up manually" as the fallback.
- A Today-first workout screen: set logging with actual weight and reps, one session rest timer
  (vibrate and beep at zero), partial completion, skip-a-day with a reason, a week and day picker,
  estimated-1RM PR moments with a one-tap "save as new max", and a squad strip for group members.
- Maxes with history, a percent-of-max quick reference, and strength levels. Progress with totals,
  strength levels and per-lift estimated-1RM trends.
- In-app AI generation (first program, weekly programs, exercise swaps) through `/api/llm`, and a
  week-end review card that pre-fills the next week's generation from skips, notes and overload.
- Coach Board with Realtime updates, weekly reviews and program updates from the user's agent,
  post-workout notes, and an agent activity log in Settings.
- The MCP server: 43 tools, four scopes, `SKILL.md`, a context bundle endpoint and a public OpenAPI
  document. See the README section "Bring your own AI agent".
- Offline set logging through a write queue, an installable PWA, and opt-in push reminders sent by a
  daily cron.
- Buddies and workout groups (leader shares a program, members follow it).
- An admin panel: usage stats, LLM provider selection, prompt templates, error logs.
- Env-gated Sentry on web and functions (inert until a DSN is set).

Migrations `001` to `040` are in `migrations/` (`040` is written but not yet applied). They are applied to production by hand, and the
Supabase CLI history is incomplete, so check the live database rather than assuming a given
migration is applied. `migrations/042-authoritative-week.sql` is written and not applied (see the
Aleesha feedback section).

## Demo account

A demo user exists for screenshots: email `demo@example.com`, password stored in the macOS keychain
item `swoltracker-demo` (read it with `security find-generic-password -s swoltracker-demo -w`; it is
never written in this repo). It holds fake data only. `npm run demo:seed` and `npm run screenshots`
use it (see the README). Do not put real people's data in it.

## How work is done here

- Branch, open a pull request, merge when Test and Knip are green. `main` goes straight to
  production.
- The rules are in [AGENTS.md](../AGENTS.md); the layout is in [architecture.md](architecture.md).
- Older plan docs stay as history and are partly stale: `docs/WEB-ARCHITECTURE-AND-GAME-PLAN.md`
  (the July to September 2026 review, slice log and changelog; the most useful one),
  `AGENT-NATIVE-PLAN.md`, `NEXT-LEVEL-ROADMAP.md`, `SECURITY-REVIEW-2026-04.md` and
  `iOS-MIGRATION-PLAN.md`.

## Running it locally

Node 20 or later (CI uses 20).

```sh
npm install
cd mcp && npm install && npm run build && cd ..   # api/ imports mcp/dist
# create .env.local with the variables in the README env table
npm run dev
```

The app talks to a hosted Supabase project named in `.env.local`; there is no local Supabase setup
in the repo. Google sign-in redirects back to the page origin, so the local origin
(`http://localhost:5173`) must be in that project's redirect URL allow list. `npm run dev` serves
only the web app, so anything that calls `/api/*` (AI generation, push) needs a Vercel preview
deploy; there is no documented local setup for the functions. Never point local work at production
data you care about, and never paste a key into a tracked file.

## Operations

- **Deploy.** Push to `main`; the GitHub integration builds on Vercel (project `swol-tracker`).
  The build command also runs the tests.
- **Server env vars** are set in Vercel: the four LLM provider keys (at least one),
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` (falls back to `VITE_SUPABASE_URL`),
  `VAPID_PRIVATE_KEY`, `CRON_SECRET`, optional `SENTRY_DSN`, `VITE_SENTRY_DSN` and
  `ALLOWED_ORIGINS`. `VITE_*` values are read at build time, so changing one needs a rebuild.
- **Cron.** `vercel.json` schedules `/api/cron/reminders` daily at 22:00 UTC.
- **Adding a function under `api/mcp*`** that builds the app: add `includeFiles: "SKILL.md"` for it
  in `vercel.json` (see AGENTS.md).
- **Changing the SDK:** edit `~/Work/bot-native-sdk`, rebuild, copy the new `dist/` into
  `vendor/bot-native-sdk/`.
- **Changing tools:** edit `mcp/src/tools/*` and `mcp/src/sdk-adapter.ts`, update `SKILL.md`, run
  `cd mcp && npm run build` and `npm test`.

## Known gaps, for the planned refactor

Everything here was checked against the code on 2026-09-30, except the reminder time zone line
below (updated 2026-10-09). None of it is broken in production; it is where the code falls short
of AGENTS.md.

**Structure**

- The web app is JavaScript. Program, log-key and max shapes are untyped, while `shared/` and `mcp/`
  are TypeScript. The plan is typed domain modules, not a rewrite of the UI.
- Large files that mix concerns: `src/components/AuthenticatedShell.jsx` (453 lines, about 23
  `useState` calls, estimated-PR detection and confetti inside `handleLogSet`, plus social and
  profile state), `src/hooks/useWorkoutLogger.js` (520 lines), `src/components/Modals/SettingsModal.jsx`
  (640 lines, API-key management, audit log and prompt text), and `src/screens/WorkoutScreen.jsx`
  (409 lines, fetches overload data in an effect and builds the week-end summary).
- Props are passed down in large bundles instead of screens reading the contexts directly.
- `shared/` is re-exported through thin shims (`mcp/src/week-calc.ts`,
  `mcp/src/exercise-normalizer.ts`, `src/utils/date.js`, `src/utils/e1rm.js`). They work, but the
  names differ from the originals, so the indirection is easy to trip over.
- `mcp/src/register-tools.ts` registers the same 43 tools a second time for the local stdio server,
  without scopes. The production path is `sdk-adapter.ts` only.

**Data access and validation**

- Three callers use the raw Supabase client instead of a repository: API-key listing, creation and
  revoke in `SettingsModal.jsx`, key creation in `useAgentOnboarding.js`, and the Realtime channels
  in `useAgentChat.js` and `useAgentOnboarding.js`. The client is also passed down as a `supabase`
  prop.
- Repositories log to the console and return `[]`, `null` or `false` on error, so callers cannot
  tell "empty" from "failed".
- Zod is used for forms and MCP tool inputs, but not everywhere: `api/llm.js` and `api/push.js`
  validate by hand, AI responses are parsed with `JSON.parse` and no schema
  (`useAiGenerator.js`, `useExerciseSwap.js`, `useOnboardingActions.js`), and environment variables
  are not validated. Web writes do not share the MCP schemas; that is blocked while `mcp/` is on
  Zod 3 and the web app is on Zod 4 (the vendored SDK pins Zod 3).
- `isGymWriter` in `mcp/src/tools/queries.ts` accepts the role `leader`, but the `gym_members.role`
  check only allows `owner`, `admin` and `member`. Today the writer role is effectively `owner`.
- MCP inputs looser than the database: `complete_onboarding` accepts any string for
  `workout_location`, but `profiles` only allows `home` or `gym`, so a bad value surfaces as a raw
  check-constraint error. `mcp/src/types.ts` declares an exercise's `muscleGroups` as `string[]`,
  while the program validator in `mcp/src/tools/actions.ts` requires a string. Both found while
  seeding the demo account on 2026-09-30.

**UI polish (seen in the screenshots)**

- Desktop layouts stretch to the full window width; there is no max-width container.
- On the 1RM screen at phone width, long lift names run into the weight ("Barbell Bench Press185").
- The header's settings and profile buttons are icon-only with no `aria-label` (the Coach Board
  button has one).

**Lint and dependencies**

- `npm run lint` has 17 warnings: 13 `react-hooks/exhaustive-deps` and 4
  `react-refresh/only-export-components`. Several react-hooks v7 compiler rules are switched off in
  `eslint.config.js` because they were too noisy. There is no boundary lint rule for the layers.
- The two packages use different Zod majors and have separate lockfiles (`package-lock.json`,
  `mcp/package-lock.json`).

**Behavior and config**

- The browser LLM client aborts at 65 seconds (`src/lib/llm.js`, comment says 60), while the proxy
  allows 270 seconds. Long multi-week generations can time out on the client first.
- The admin API-settings screen still saves provider keys into `app_settings`, but the proxy reads
  environment variables only, so those fields have no effect.
- Reminders compute today and the program week in the user's time zone, or `America/Denver` when
  the profile zone is missing or invalid. They still run once a day, and the push preference
  switches exist in the API and database but have no UI. The VAPID public key is duplicated in
  `src/lib/push.js` and `api/_push.js`.
- The root `app.json` names `mcp/dist/server.js` as the entrypoint, but the build writes
  `mcp/dist/mcp/src/server.js`.
- The `api/` functions import compiled output from `mcp/dist/`, so a fresh clone needs
  `cd mcp && npm run build` before they can run (the Vercel build does this first).

**Stray files**

- `files/` (an old setup guide from February 2026 with a wrong URL, plus a stray `package.json`),
  `make_gif.py`, the root SQL dumps (`swoltracker-schema.sql`, `onboarding-schema.sql`,
  `buddy-system-schema.sql`), the stale `supabase/migrations/` subset, and `migrations/archive/`.
- Root-level plan docs (`AGENT-NATIVE-PLAN.md`, `NEXT-LEVEL-ROADMAP.md`, `SECURITY-REVIEW-2026-04.md`,
  `iOS-MIGRATION-PLAN.md`, `SKILL.md`) crowd the root. `SKILL.md` must stay where it is unless
  `vercel.json` and the skill loader change with it.

**Paused**

- `mobile/` (Expo iOS app) is paused, excluded from lint, tests and deploys. See
  [ADR-004](decisions/ADR-004-web-first-ios-paused.md).
