# Status and handoff

Where the project stands and how to pick it up. Update this at the end of each working session.

**As of 2026-09-30.** The app is live at https://swol-tracker.vercel.app and deploys from `main`
on every push. The Test and Knip workflows passed on the last `main` push (after merged PRs #3 to
#7: Knip added and dead code removed, a lint fix, a Vite chunking cleanup, and a fix for the web
app showing one program week ahead west of UTC, with a Denver-time regression test). Locally, `npm test`
runs 304 tests in 52 files and `npm run lint` reports 0 errors and 17 warnings.

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
- The MCP server: 44 tools, four scopes, `SKILL.md`, a context bundle endpoint and a public OpenAPI
  document. See the README section "Bring your own AI agent".
- Offline set logging through a write queue, an installable PWA, and opt-in push reminders sent by a
  daily cron.
- Buddies and workout groups (leader shares a program, members follow it).
- An admin panel: usage stats, LLM provider selection, prompt templates, error logs.
- Env-gated Sentry on web and functions (inert until a DSN is set).

Migrations `001` to `038` are in `migrations/`. They are applied to production by hand, and the
Supabase CLI history is incomplete, so check the live database rather than assuming a given
migration is applied.

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

Everything here was checked against the code on 2026-09-30. None of it is broken in production;
it is where the code falls short of AGENTS.md.

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
- `mcp/src/register-tools.ts` registers the same 44 tools a second time for the local stdio server,
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
- Reminders use one fixed time zone (`America/Denver` in `api/_reminders.js`) and run once a day,
  and the push preference switches exist in the API and database but have no UI. The VAPID public
  key is duplicated in `src/lib/push.js` and `api/_push.js`.
- `SKILL.md` says "Forty tools" and does not list `get_missed_days`; 44 tools are registered.
  The root `app.json` names `mcp/dist/server.js` as the entrypoint, but the build writes
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
