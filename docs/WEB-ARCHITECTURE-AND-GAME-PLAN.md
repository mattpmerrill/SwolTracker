---
title: SwolTracker Web Architecture Review & Game Plan
status: active
created: 2026-07-13
updated: 2026-09-12
author: Beck (+ Joi changelog)
handoff: joi
audience: Matt, Joi, Ada, future agents
scope: Web app only (src/, api/, mcp/, migrations/) — mobile/ is out of scope
---

# SwolTracker Web Architecture Review & Game Plan

> **Handoff for Joi / team:** This is the durable home for the July 2026 architecture review and the follow-up plan. Prefer working from this file (it lives in GitHub) over chat transcripts. Update the changelog at the bottom when you complete a phase item.

## Product context

- SwolTracker started as **web + iOS**. In practice Matt is **web-only**.
- Product bet: **agent-native gym OS** — the app is the data store + visualization surface; an external AI agent (via MCP) is the primary intelligence layer.
- Stack: React 18 + Vite, Tailwind 4, Supabase (auth + Postgres), Vercel serverless (`/api/llm`, `/api/mcp`), TypeScript MCP package under `mcp/`.

**Do not invest in `mobile/` for the next cycles** unless Matt re-opens the App Store path. Ignore iOS when reviewing or refactoring.

---

## Executive snapshot

| Area | Grade | Notes |
|------|-------|-------|
| Data access (`db` repos) | Strong | Domain composition is the right long-term shape |
| LLM proxy | Strong | Keys server-side, JWT auth, rate limits |
| MCP surface | Strong | Scopes, audit, contract tests; `resolveGymId` membership check in |
| Web state architecture | Fair | Contexts exist; `AuthenticatedShell` still owns social/profile + fat prop bags |
| Onboarding | Fair | Agent-native default + Simple fallback; legacy 13-step gone |
| Schema / migrations ops | Risky | Dual tracks (`migrations/` is SoT; `supabase/migrations/` is stale) |
| Web routing | Fair | Tab + settings/admin URLs; week/day/coach still React state |
| Tests | Good base | ~203 unit/contract tests; thin on hooks/UI/e2e/IDOR runtime |
| Daily product | Weak | Workout is a week planner, not a Today session |

Overall: **real product with solid perimeter; a handful of live correctness/security bugs, then two product slices.** Not a rewrite candidate. Work queue is **Current work queue — production slices (2026-08-20)** below. Do slices one at a time.

---

## What shipped 2026-07-13 (Phase 0 partial)

Beck implemented three correctness fixes on web:

### 1. Equipment persistence

**Bug:** Settings UI only mutated React state. `db.addEquipment` / `db.removeEquipment` existed but were never called → equipment vanished on reload and misled AI gen/swap.

**Fix:** Optimistic update + DB write; rollback + toast on failure. Repo now surfaces errors (`null` / `false`).

**Files:** `src/swoltracker.jsx`, `src/lib/repositories/gyms.js`, `gyms.test.js`

### 2. Set log / workout complete rollback

**Bug:** `useWorkoutLogger` optimistically marked sets/workouts complete with no rollback if Supabase failed → UI lied about saved training data.

**Fix:** Snapshot previous state; on failed `logSet` / `markWorkoutComplete` / `unmarkWorkoutComplete` (or thrown error), restore UI and toast.

**Files:** `src/hooks/useWorkoutLogger.js` (accepts `toast`)

### 3. Post-onboarding re-bootstrap (no full reload)

**Bug:** `handleOnboardingComplete` called `window.location.reload()`.

**Fix:** `useAppBootstrap` exposes `reload()` (reload token). Onboarding complete clears local onboarding flags and re-runs the bundle load; ready bundle hydrates app state.

**Files:** `src/hooks/useAppBootstrap.js`, `src/swoltracker.jsx`

---

## Architecture findings (still open)

### Strengths — keep

1. Repository composition in `src/lib/supabase.js` + `src/lib/repositories/*`
2. Feature hooks (`useAiGenerator`, `useWorkoutLogger`, `useAgentChat`, …)
3. MCP as a first-class product surface (`mcp/src/tools/*`)
4. Fail-closed LLM proxy (`api/llm.js`)
5. MCP contract tests under `mcp/src/__tests__/`
6. Security review + migrations 027+ for RPC IDOR hardening (verify applied on **prod**)

### Structural problems

#### A. `swoltracker.jsx` is still the god object

~30 `useState`s, prop bags into screens/modals. Hooks reduced line count but ownership stayed centralized.

**Target shape (no Redux):**

```
SessionProvider → AppDataProvider → feature hooks own their slice
```

Suggested first contexts:

1. `SessionContext` (auth)
2. `ProgramContext` (program, week, day, gymId, equipment)
3. `WorkoutLogContext` (exerciseLog, completions)

#### B. Onboarding — **one product path (Phase 1.3 + hard-delete 2026-07-14)**

| Flow | Path | Status |
|------|------|--------|
| Agent-native | `AgentOnboarding/` | **Default** product path |
| Simple fallback | `SimpleOnboarding/` | "No agent? Set up manually" |

Legacy 13-step (`Onboarding/` + `useOnboarding` + `VITE_NEW_ONBOARDING_FLOW` kill switch) **removed**. Router is Agent → optional Simple only.

#### C. No real web routing

`ScreenRouter` is a tab switch. No deep links for workout week/day, settings, admin, coach board. Refresh loses tab; browser back is useless.

**Add:** lightweight `react-router` (or hash routes) for `/`, `/workout`, `/maxes`, `/progress`, `/buddies`, `/settings`, `/admin`, `/onboarding`.

#### D. Bootstrap log load — **bounded (Phase 1.4)**

Cold start loads set logs for the last **8** calendar weeks (`getWorkoutLogsInWeekRange`). Completions + missed days stay full history (small rows; Progress totals stay correct). Navigating to an older week lazy-fetches that range into `exerciseLog`.

#### E. Dual migration tracks — **policy set 2026-07-14**

| Track | Role |
|-------|------|
| **`migrations/`** (001–032) | **Canonical source of truth** for schema intent and hand-applied SQL |
| `supabase/migrations/` | Stale CLI subset (7 files, last = `missed_days` / 2026-03-11). Supabase Management API history matches only this subset |
| Root `*.sql` dumps | Historical; not a migration path |

**Prod verify (2026-07-14):** live DB has `_require_self`, hardened `create_user_gym` / `complete_onboarding` / `send_member_invite`, `log_error` + `log_api_usage` force `auth.uid()` for non-service callers, tables `tool_call_audit` / `app_events` / `agent_messages` / `missed_days`, `api_keys.scopes`, and `multi_week_workout_generator` prompt includes the 032 percentage rules. CLI “applied migrations” list is **not** trustworthy as full history — objects were applied outside that track.

**Going forward:** land new SQL in `migrations/0NN-….sql` next number; apply to prod deliberately; note apply in this changelog. Optionally mirror into `supabase/migrations/` only if you also repair CLI history (do not half-sync).

#### F. Frontend JS vs MCP TS

MCP is typed; web domain models (program shape, log keys, maxes) are not. Prefer typed **domain** modules over a full UI TS rewrite.

#### G. Package hygiene

- Root package vs `mcp/` package; Zod major mismatch (v4 root vs v3 mcp)
- `mobile/` is huge on disk (~2.7GB with ios/node_modules) — web-only agents should not pay that cost long-term

---

## Security posture

Full write-up: `SECURITY-REVIEW-2026-04.md`.

| Item | Status in code | Prod verification |
|------|----------------|-------------------|
| F-001 `resolveGymId` membership check | Fixed in `mcp/src/tools/queries.ts` | Confirm deploy still has check |
| F-002–F-009 RPC IDOR | Migration `027-rpc-idor-fixes.sql` | **Prod defs match 027 pattern** (2026-07-14) |
| LLM auth fail-closed | Present in `api/llm.js` | OK |
| API keys hashed | Migration 021 | OK (`key_hash` column present) |

**Phase 0.6 remaining:** authenticated-session IDOR probes (call RPCs with another user’s UUID and expect `forbidden`) — not automated yet.

---

## Phased game plan

### Phase 0 — Correctness & safety (this week)

| # | Item | Owner | Status |
|---|------|-------|--------|
| 0.1 | Equipment persistence | Beck | **Done 2026-07-13** |
| 0.2 | Log/complete rollback on DB failure | Beck | **Done 2026-07-13** |
| 0.3 | Onboarding re-bootstrap (no reload) | Beck | **Done 2026-07-13** |
| 0.4 | Verify migrations 027–032 on prod Supabase | Matt / Beck | **Verified 2026-07-14** (objects present; CLI history lag — see 0.5) |
| 0.5 | Collapse dual migration story (document or sync folders) | Beck | **Documented 2026-07-14** — `migrations/` is SoT; do not treat `supabase/migrations/` as complete |
| 0.6 | Quick IDOR re-check on agent RPCs + gym write tools | Beck | **Partial 2026-07-14** — prod defs force self/service_role on key RPCs; full runtime IDOR suite still open |

### Phase 1 — Web structure (3–5 days)

| # | Item | Notes | Status |
|---|------|-------|--------|
| 1.1 | Domain contexts; thin `swoltracker.jsx` shell | `SessionContext`, `ProgramContext`, `WorkoutLogContext`; shell in `AuthenticatedShell.jsx` | **Done 2026-07-13** |
| 1.2 | URL routing for tabs + admin + settings | `react-router-dom`; `/workout` `/maxes` `/progress` `/buddies` `/settings` `/admin` `/onboarding` | **Done 2026-07-13** |
| 1.3 | Onboarding: one path | Agent-native default + Simple fallback; **legacy hard-deleted 2026-07-14** | **Done** |
| 1.4 | Bounded bootstrap log load | Recent weeks first; lazy older weeks | **Done 2026-07-14** |
| 1.5 | User-visible errors on all write paths | toast + `errorService` consistently | **Done 2026-07-13** |

### Phase 2 — Efficiency & quality (ongoing)

| # | Item |
|---|------|
| 2.1 | Select columns, not `*`, on hot paths |
| 2.2 | Parallelize remaining bootstrap waterfalls |
| 2.3 | Shared week/date helpers between web + MCP (already fixed calendar-date bugs twice) |
| 2.4 | ESLint + `mcp` `tsc` as CI / Vercel gates |
| 2.5 | Stop dual-path feature work on mobile unless re-scoped |

### Phase 3 — Agent-native product

| # | Item | Status |
|---|------|--------|
| 3.1 | Align web writes with MCP tools (or shared core) where it reduces dual paths | Open |
| 3.2 | Realtime coach notes / program updates (`app_events` migrations exist) | Open |
| 3.3 | Surface overload recs on ExerciseCard (data already used in AI gen) | Largely shipped |
| 3.4 | Missed-day UX next to complete (MCP/DB support exists) | **Done 2026-07-13** |
| 3.5 | Coach Board as primary surface, not FAB-only | **Done 2026-07-14** (FAB unmounted 2026-07-22 — header + strip only) |
| 3.6 | Post-workout “note to agent” CTA | **Done 2026-07-14** |
| 3.7 | Week-end Review → Generate next week flow (roadmap 1A) | **Done 2026-07-14** |
| 3.8 | PWA / add-to-homescreen + offline set queue | **Done 2026-08-12** (installable PWA + write queue; no Today Home) |

**Do not do:** Next.js rewrite “because serverless,” Redux for everything, full TypeScript UI migration in one PR.

---

## Current work queue — production slices (2026-08-20)

Matt’s instruction (2026-08-20): **one slice at a time.** Beck executes; Joi picks up the next unstarted / unowned ticket after pulling `main`. Update this table + changelog when a ticket lands. Do not start slice N+1 until slice N is **Done** on `main`.

**Do not:** Next.js, Redux, full UI TypeScript, `mobile/` work, a second architecture doc.

| Slice | Theme | Why | Owner | Status |
|-------|-------|-----|-------|--------|
| **1** | App currently lies | Invite / profile / bootstrap can show success or spin forever when the write failed | Beck | **Done 2026-08-20** |
| **2** | Stranger-safe | Remaining IDOR / key-RPC / CORS holes before inviting anyone new | Beck | **Done 2026-08-20** |
| **3** | Today session | Daily gym-floor UX: open PWA → today’s workout, not a week planner | Beck | **Done 2026-08-20** |
| **4** | One weekly loop + squad on Today | Close week-end generate; show gym completions that are already loaded | Beck | **Done 2026-08-20** |
| **5** | Operable | Sentry, server LLM usage, eslint in CI, migration 034 hygiene | Beck | **Done 2026-08-20** |
| **6** | Instant cold open | Bootstrap is a ~10-call serial waterfall; 672KB single bundle; 36 `select('*')` | Joi | **Done 2026-09-23** — 6.1/6.3/6.4 shipped; 6.2 skipped |
| **7** | PR moments (e1RM) | PRs only exist when a 1RM is typed by hand; no estimated-max math anywhere | Joi | **7.1/7.2 done 2026-09-23**; 7.3/7.4 next |
| **8** | Shared domain core | Week math, exercise aliases, and program/log Zod duplicated across web JS + MCP TS (Zod v4 vs v3) | Joi | **Proposed 2026-09-23** |
| **9** | Coach that remembers + nudges | Session notes are localStorage-only (agent can't see them); reminders never reach the user | Joi | **Proposed 2026-09-23** |

---

### Slice 1 — App currently lies (P0 correctness)

The UI currently reports success (or hangs) when the data layer failed. Fix before any product work.

| # | Ticket | Files | Done when | Status |
|---|--------|-------|-----------|--------|
| 1.1 | **Invite accept is truthy on `{ success: false }`.** `acceptGroupInvite` returns JSONB `{ success, error }`. `useBuddyActions.acceptBuddyRequest` treats any object as success → confetti + “You joined the group!” on a failed RPC. | `src/hooks/useBuddyActions.js`, helper `src/lib/groupJoin.js` | Failed invite shows toast, does **not** flip local group role / confetti. Unit test covers `{ success: false }` and `{ success: true }`. | **Done 2026-08-20** |
| 1.2 | **Member never hydrates leader program after join.** `getAllWorkoutPrograms` returns `{ [week]: program_data }`. Accept path does `if (programs.length > 0)` (always undefined) then `.find`. Bootstrap already uses `Object.keys(programs)`. | `src/hooks/useBuddyActions.js`, `src/lib/groupJoin.js` | After a successful accept, `setWorkoutProgram` is called with the week-keyed map. Test documents object shape (already in `programs.test.js`) and the helper. | **Done 2026-08-20** |
| 1.3 | **Profile fitness fields cannot save.** `profileUpdateSchema` is `.strict()` and only allows name/avatar/group_name/`datetime` start date. Profile UI writes `display_name`, `age`, `weight_lbs`, `gender`, `fitness_goals`, `workout_days`, `workout_duration`, `workout_location`, and `YYYY-MM-DD` start dates. Group name save in the shell is fire-and-forget (`db.updateProfile` without await/toast). | `src/lib/validation.js`, `src/hooks/useProfileActions.js`, `src/components/AuthenticatedShell.jsx` | Profile fitness + start-date + group name persist; failed save keeps the editor open and toasts. Schema tests cover the ProfileArea payloads. | **Done 2026-08-20** |
| 1.4 | **Bootstrap failure is an infinite spinner.** `loadUserBundle` catch only `console.error`; `bundle` stays null → `swoltracker.jsx` `if (!bundle)` spinner forever. | `src/hooks/useAppBootstrap.js`, `src/swoltracker.jsx` | Failed load shows “Couldn’t load your training data” + **Try again** (`reload()`). Retry clears the error and re-runs the bundle. | **Done 2026-08-20** |

**Out of slice 1:** creating a gym as a login side-effect (`createGym('Personal Gym')` in bootstrap) — slice 5 / later. Dual-write MCP vs web — slice 2/5, not here.

---

### Slice 2 — Stranger-safe (P0 security)

April review criticals were mostly closed (027 + `resolveGymId`). These remain. New SQL is `migrations/034-….sql`; apply to prod deliberately; changelog here.

| # | Ticket | Files | Done when | Status |
|---|--------|-------|-----------|--------|
| 2.1 | **`search_users` (F-011).** Rate limit keyed on `current_user_id` param, not `auth.uid()`. Returns emails. No `_require_self`. | `migrations/034-stranger-safe.sql`, `src/lib/repositories/social.js` | Function forces `auth.uid()`, length-checks term (2–50), does not return email to non-admins. Client stops passing a spoofable user id. | **Done 2026-08-20** (034 applied on prod) |
| 2.2 | **Settings-key RPCs.** `get_app_setting` / `get_global_llm_api_key` / `get_llm_api_key_for_provider` are `SECURITY DEFINER` + `GRANT … TO authenticated` and return any `app_settings` value, including `llm_api_key_*` if ever stored there. | `migrations/034-stranger-safe.sql` | Non-admin callers cannot read API keys or arbitrary settings. Prefer Vercel env for provider keys; drop or admin-gate the key RPCs. | **Done 2026-08-20** (034 applied on prod; service_role still allowed for `/api/llm`) |
| 2.3 | **CORS `*`** on `/api/llm` and `/api/mcp` (F-014). | `api/llm.js`, `api/_mcp-shared.js` | `ALLOWED_ORIGINS` env (prod origin + localhost). No wildcard. | **Done 2026-08-20** — defaults to `https://swol-tracker.vercel.app` + localhost Vite; override with `ALLOWED_ORIGINS` |
| 2.4 | **Any gym member can overwrite the shared JSONB program via MCP.** `resolveGymId` checks membership, not leader. | `mcp/src/tools/actions.ts` (`save_workout_program`) | Non-leader `save_workout_program` fails closed. Contract test: member key cannot write. | **Done 2026-08-20** — `resolveWritableGymId` requires `owner`/`leader`; members get `forbidden` |
| 2.5 | **Authenticated IDOR smoke** (Phase 0.6 remainder). 027 looks right; unproven at runtime. | `mcp/src/__tests__/` + a small SQL/RPC probe script or vitest against mocked forbidden | Calling RPCs with another user’s UUID returns `forbidden`. At least `accept_group_invite`, `get_agent_messages`, `get_error_logs`. | **Done 2026-08-20** — `idor-guards.test.ts` asserts 027/034 function bodies; `resolveGymId` foreign-gym test |

---

### Slice 3 — Today session (product)

The daily loop already exists (today cursor, Today FAB, focus ring, set log, rest timer, skip, complete). Priority is wrong: open app → week picker.

| # | Ticket | Files | Done when | Status |
|---|--------|-------|-----------|--------|
| 3.1 | **`/workout` is Today.** Week/day picker behind a “This week” disclosure. `WorkoutFocus` labeled Today when `isViewingToday`. | `src/screens/WorkoutScreen.jsx`, `WeekSelector.jsx`, `DaySelector.jsx`, `WorkoutFocus.jsx` | Cold open (PWA `start_url` `/workout`) shows today’s focus + first unlogged set without scrolling past a week chrome. Week picker still reachable. | **Done 2026-08-20** — session first; week/day behind “This week”; focus labeled Today · {day} |
| 3.2 | **One rest timer for the session** (not per `ExerciseCard`) + haptic or beep at 0. Silent-in-pocket is the current gap. | `src/components/Workout/RestTimer.jsx`, `ExerciseCard.jsx` | One timer; completion is perceptible with the phone in a pocket (vibrate or short tone). | **Done 2026-08-20** — one `sessionRest` on WorkoutScreen; vibrate + 880Hz beep at 0 |
| 3.3 | **Weight/rep overrides keyed by week+day+exercise.** Today they are `localStorage` keyed only by exercise name → last Thursday’s bench leaks into this week. | `src/utils/weightOverrides.js`, `SetRow.jsx` | Overrides do not cross week/day. Existing tests extended. | **Done 2026-08-20** — `overrideStorageKey(kind, week, day, name)` |

---

### Slice 4 — One weekly coaching loop + squad on Today (product)

Phase 1A/1B/1C shipped. The loop still doesn’t close; in-app ChatGPT and the MCP agent both write programs; gym completions are loaded and never shown.

| # | Ticket | Files | Done when | Status |
|---|--------|-------|-----------|--------|
| 4.1 | **Week-end IS generate for one week.** Modal currently highlights 2/4/6 so `weekCount: 1` has no selected chip. Prefill `aiNotes` from this week’s skip reasons, post-workout chips, overload count. If `hasAgentKey`, primary CTA is “ask your coach” (same prefill into Coach Board); do not show two competing generate buttons. | `src/components/Modals/AiGeneratorModal.jsx`, `useAiGenerator.js`, `WeekEndReviewCard.jsx`, `programContinuity.js` | Week-end path generates **one** week with notes prefilled. Agent users are not offered a second brain on that card. | **Done 2026-08-20** — 1-week chip; notes prefilled; agent CTA is Coach Board only |
| 4.2 | **Squad strip on Today.** Bootstrap already hydrates gym-wide `completedWorkouts` / `missedWorkouts`. Render who trained / skipped / still due. Buddies tab recedes to invites. | `src/screens/WorkoutScreen.jsx`, `AuthenticatedShell.jsx` (groupMembers already in shell) | Today shows a one-line group status when `groupMembers.length > 0` or role is member. No new tables. | **Done 2026-08-20** — `SquadStrip` from existing complete/miss maps |

---

### Slice 5 — Operable (P1 ops)

| # | Ticket | Files | Done when | Status |
|---|--------|-------|-----------|--------|
| 5.1 | Sentry (or equivalent) on web + `/api/llm` + `/api/mcp`. `error_logs` is browser-only today. | `src/main.jsx`, `api/llm.js`, `api/mcp.js` | Uncaught errors and 5xx on those functions show up in one dashboard. No secrets in breadcrumbs. | **Done 2026-08-20** — env-gated. Set `SENTRY_DSN` (Vercel functions) and `VITE_SENTRY_DSN` (web build). No-op until set. Auth headers stripped. |
| 5.2 | Log LLM usage **on the server** (`log_api_usage` from `api/llm.js`), not only after the client succeeds. Cap `systemPrompt`/`userPrompt` byte size; do not return raw provider `error.message`. | `api/llm.js` | Admin usage reflects proxy calls even if the tab dies. Oversize body → 413. | **Done 2026-08-20** |
| 5.3 | ESLint in CI. Config exists; `package.json` has no `lint` script; `.github/workflows/test.yml` does not run it. | `package.json`, `.github/workflows/test.yml` | `npm run lint` is a required CI step. | **Done 2026-08-20** — `npm run lint` in GitHub Actions; 0 errors |
| 5.4 | Migration hygiene. Next SQL is `035`. Do not `supabase db push` from `supabase/migrations/` (7-file stale subset). Optional: stop auto-`createGym` on login (explicit in onboarding). | `migrations/`, bootstrap if touching gym create | 034 already applied on prod. CLI folder still not treated as live history. | **Done 2026-08-20** — bootstrap no longer creates a gym; onboarding still does |

### Slices 6–9 — Proposed 2026-09-23 (Joi code review; Matt locks order)

Recommended order: **6 → 7 → 8 → 9**. 6 + 7 are ~1 day each and are the highest felt-value (instant + rewarding). 8 is the maintenance payoff and de-risks 9. Same rules: one slice at a time, small PRs, no new architecture doc.

#### Slice 6 — Instant cold open (P1 perf)

| # | Ticket | Files | Done when | Status |
|---|--------|-------|-----------|--------|
| 6.1 | **Parallelize bootstrap.** `loadUserBundle` awaits profile → social → maxes → gyms → equipment → programs → logs → completions → missed → agent in series. Only the gymId-dependent reads need to wait. Wave 1: profile, social, maxes, gyms, agent. Wave 2 (needs gymId + currentWeek): equipment, programs, logs, completions, missed. | `src/hooks/useAppBootstrap.js` | **Done.** Two waves (11 userId-keyed reads in parallel, then 5 gym-scoped reads). `getGroupMembers`/`getLeaderGymId` now run for every user (self-scoped RPCs). 260 tests green. |
| 6.2 | **Optional: `get_bootstrap()` RPC.** One `SECURITY DEFINER` fn on `auth.uid()` returning the wave-2 bundle as JSON. Only if 6.1 still measures slow on LTE. | `migrations/035-…sql`, `src/lib/repositories/` | **Skipped.** 6.1 already collapsed the waterfall to 2 waves; revisit only if LTE profiling shows a residual gap. |
| 6.3 | **Route-level code splitting.** Only Admin is `lazy()`. Lazy-load Progress, Maxes, Buddies, Settings, AiGeneratorModal, ProfileArea. Today stays in the entry chunk. | `src/components/ScreenRouter.jsx`, `AppModals.jsx`, `vite.config.js` | **Done.** Screens + all modals lazy (mount-on-open; all render null when closed). `manualChunks` splits react + supabase/zod into cache-stable vendor chunks. App chunk 672KB → 209KB (61KB gzip); vendor 160KB + 237KB cached across deploys. |
| 6.4 | **Select columns on hot paths.** 36 `select('*')` / bare `.select()` in `src/lib` + `mcp/src`. Start with bootstrap reads + `workout_logs`. | `src/lib/repositories/logs.js` | **Done (bootstrap reads).** `getWorkoutLogsInWeekRange` → 7 columns, `getWorkoutCompletions` → 3, `getMissedDays` → 4. Remaining `select('*')` (non-bootstrap repos + `mcp/src`) left for follow-up when touching those paths. |

Measure before/after: cold open to first unlogged set on throttled "Fast 4G" in Chrome devtools; record numbers in the changelog.

#### Slice 7 — PR moments from every set (product)

| # | Ticket | Files | Done when | Status |
|---|--------|-------|-----------|--------|
| 7.1 | **e1RM helper.** Epley `w × (1 + reps/30)`, only for loaded sets with 1–10 reps (skip bodyweight, AMRAP > 10, KB display quirks). Shared-ready (moves into slice 8 core). | `src/utils/e1rm.js` + `e1rm.test.js` | **Done.** `epelyE1RM`, `roundToNearestFive`, `resolveCurrentMax`; 13 tests cover single→weight, bodyweight/AMRAP/range→null, >10→null, fuzzy max lookup. |
| 7.2 | **Live PR moment.** On set log, compare set e1RM vs best known (current 1RM + best e1RM in loaded logs). New best → toast "New estimated max: Bench 243 🔥" + small `canvas-confetti` burst. Never auto-overwrite `user_maxes`; offer "Save as new max" action. | `AuthenticatedShell.jsx`, `EstimatedPrBanner.jsx` | **Done.** Wrapped `logSet` in the shell (single place with live maxes + toast + confetti + `maxesActions`): fire confetti + `EstimatedPrBanner` on a new estimated max, one-tap "Save as new max" (calls `updateMax`), dismiss. Baseline = recorded 1RM + per-session ceiling (simplification: not "best e1RM in loaded logs", which isn't indexed by name in the client). |
| 7.3 | **Strength trend on Progress.** Per-lift best-e1RM-per-week line from loaded logs (8-week window; lazy-fetch older). | `ProgressScreen.jsx`, `insightsBuilders.js` | Top lifts show a trend + "+N lb this block". No new tables. | Proposed — next in slice 7 |
| 7.4 | **MCP parity.** `generate_weekly_summary` + context bundle include e1RM PRs so the coach celebrates the same moments. | `mcp/src/tools/queries.ts`, contract tests | Weekly recap lists e1RM PRs; contract test covers it. | Proposed — next in slice 7 |

#### Slice 8 — Shared domain core (P1 maintainability)

Folds in the "Related later" items below (shared week/date module, dual-write validator).

| # | Ticket | Files | Done when | Status |
|---|--------|-------|-----------|--------|
| 8.1 | **`shared/` typed package** (TS, built for both Vite and MCP): week/date math (`parseCalendarDate`, `calculateCurrentWeek`), exercise normalizer + alias map, program/log/max Zod schemas, e1RM. | new `shared/`, `vite.config.js`, `mcp/tsconfig.json` | Web and MCP import the same functions; one alias map (retire `src/utils/workout.js` alias list or have it re-export). | Proposed |
| 8.2 | **One Zod major.** Bump `mcp/` to Zod v4 to match root (or pin shared schemas to one). | `mcp/package.json`, `mcp/src/**` | `tsc` + contract tests green; single Zod major in lockfiles. | Proposed |
| 8.3 | **Dual-write validator.** Web `logSet` / `saveWorkoutProgram` validate with the same shared schema MCP uses. | `src/lib/repositories/logs.js`, `programs.js`, `validation.js` | A payload MCP rejects is rejected on web too; tests. | Proposed |
| 8.4 | **Parity tests.** Same fixtures run through web + MCP week math and normalizer. | `shared/__tests__/` | Guards the "fixed calendar-date bugs twice" class for good. | Proposed |

#### Slice 9 — Coach that remembers + nudges (product / stickiness)

| # | Ticket | Files | Done when | Status |
|---|--------|-------|-----------|--------|
| 9.1 | **Persist session notes.** Post-workout chips/free text + week session notes move from localStorage (`sessionNotes.js`) to a `session_notes` table (user_id, gym_id, week, day, label, text) next to `missed_days`. Keep localStorage as offline-queue fallback. | `migrations/035|036-…sql`, `src/lib/sessionNotes.js`, `PostWorkoutCoachPrompt.jsx`, `WeekEndReviewCard.jsx` | Notes survive device switch; RLS self-only; week-end prefill reads DB. | Proposed |
| 9.2 | **MCP reads notes.** `get_training_history_summary` + context bundle include session notes ("left knee off Tue"). | `mcp/src/tools/queries.ts`, contract tests | Agent program gen sees notes without the user repeating them. | Proposed |
| 9.3 | **Opt-in web push.** VAPID keys; `push_subscriptions` table; SW `push` handler; opt-in after the 2nd completed workout (not at first open). iOS requires installed PWA (16.4+). | `public/sw.js`, `src/main.jsx`, Settings toggle, `api/push.js` | User can enable/disable; test push delivers on installed iPhone PWA. | Proposed |
| 9.4 | **Three nudges only.** (a) Scheduled-day reminder from `check_workout_reminder` logic ("Leg day's waiting — 4 exercises, ~50 min"), (b) squad: "Wren just finished — you're up" (max 1/day), (c) Sunday "Week N review ready". Quiet hours + per-type toggles. | Vercel cron or Supabase scheduled fn, `api/push.js` | Each nudge deep-links to the right route; no nudge on rest/skipped/completed days. | Proposed |

**Housekeeping — done 2026-09-23 (Matt OK'd):** stale-data cleanup ran on prod; backups in `~/work/SwolTracker-backups/cleanup-2026-09-23/` (outside repo). The `Exercise ${i+1}` fallbacks in `src/utils/workout.js` + `useWorkoutLogger.js` only fire when a program exercise has no name — post-cleanup no such programs exist, so left as defensive-only (reviewed in slice 7, no code change needed).

---

**Related later (not a slice):** shared week/date module web↔MCP; dual-write validator so web `logSet`/`saveWorkoutProgram` match MCP Zod; screens reading contexts directly (kill prop bags) — do that when touching slice 3, not as its own project.

---

## Product suggestions (web-only framing)

Market/design as: **“training log + AI coach (MCP)”**, not “iOS + web gym social app.”

- **Overload badges** on exercise cards — data already computed for AI generation  
- **Skip day** control — backend/MCP ready  
- **Coach Board prominence** — matches agent-native thesis  
- **Social de-emphasis** if Matt is primary user — Buddies is optional weight in nav  
- **Program continuity** — force a clear path when a week ends  

Related product docs already in repo:

- `NEXT-LEVEL-ROADMAP.md` — agent-native phases  
- `AGENT-NATIVE-PLAN.md` — implementation plan  
- `CLAUDE.md` — engineer map (prefer this over the Vite-template README)  
- `SECURITY-REVIEW-2026-04.md` — security findings  

---

## Key files map (web)

```
src/App.jsx                  # BrowserRouter + SessionProvider + Toast
src/swoltracker.jsx          # Auth / onboarding gate; mounts domain providers
src/components/AuthenticatedShell.jsx  # Tabs, modals, social/profile shell state
src/contexts/                # Session, Program, WorkoutLog
src/hooks/useAppNavigation.js # URL ↔ tab / settings / admin
src/lib/routes.js            # Path constants
src/hooks/useAppBootstrap.js # Cold load + reload()
src/hooks/useWorkoutLogger.js
src/lib/supabase.js         # db composition
src/lib/repositories/*      # domain data access
api/llm.js                   # LLM proxy
api/mcp.js                   # MCP HTTP endpoint
mcp/src/tools/*              # Agent tools
migrations/                  # Prefer this as SQL history
```

---

## How Joi (and others) should continue

1. **Read this file first**, then `CLAUDE.md` for file map.  
2. **Work from “Current work queue — production slices (2026-08-20)”.** One slice at a time. Do not start a slice marked In progress by someone else.  
3. **Pull `main`** before work.  
4. **Prefer small PRs** mapped to a slice ticket id (e.g. “Slice 2.1 search_users”).  
5. **Update the changelog** below when you land a row; flip the ticket Status.  
6. **Ignore `mobile/`** unless Matt explicitly re-scopes.  
7. **Do not invent a second architecture doc** — edit this one.  
8. Security-sensitive SQL: land in `migrations/0NN-….sql` next number (**035**); **apply to prod deliberately**; note apply in changelog.  
9. **`migrations/` is schema SoT** — do not trust `supabase/migrations/` CLI history as “what’s live.”

---

## Handoff to Joi — 2026-07-14 (Beck)

**Branch:** `main` is clean and deployed. **Pull before anything.**

### Shipped this session (Beck, newest first)

| Commit | What |
|--------|------|
| `a8a05b3` | **Buddies fix** — leaders see group members again; migration **033** applied on prod |
| `c9e28ed` | **Legacy onboarding hard-delete** — Agent + Simple only; no kill switch |
| `65f2f5e` | **Phase 3.7** — Week-end Review + Generate next week card |
| `18de7dd` | **Phase 1.4** — bounded bootstrap set logs (8 weeks + lazy older weeks) |

Prior Joi work on `main` still stands: 1.3 / 1.5 / 3.4 / 3.5 / 3.6.

### Critical gotcha for Joi (read this)

**Bug Matt hit:** Swol Patrol leader UI showed **0 members** while Wren still saw the shared program.

- **Data was fine** — `buddy_requests` had Wren + Chase as `accepted`.
- **Broken RPC:** `get_group_members` after migration 027 used unqualified `member_id` / `leader_id` inside PL/pgSQL `RETURNS TABLE` OUT params → authenticated callers got **ambiguous column**; web client returned `[]`.
- **Fix:** migration **033** (live on prod). Client also always loads members for leaders + buddy fallback.
- **When writing PL/pgSQL `RETURNS TABLE` functions:** always table-qualify columns in SQL bodies (`br.member_id`, not `member_id`). Re-test as **authenticated** role, not only as superuser/SQL editor (null `auth.role()` skips some guards and can hide the bug).

### Product paths (current truth)

| Area | State |
|------|--------|
| Onboarding | **AgentOnboarding** default → **SimpleOnboarding** fallback only. Legacy 13-step **gone**. `VITE_NEW_ONBOARDING_FLOW` unused — safe to delete from Vercel. |
| Buddies / groups | Leader list fixed. Swol Patrol: Matt Merrill leader; Wren + Chase members. |
| Week-end continuity | `WeekEndReviewCard` when next week unprogrammed + late week / all days accounted. |
| Cold start | Set logs last 8 weeks; completions/missed full history; lazy older weeks on navigate. |

### Suggested next pick-ups for Joi

Current queue (2026-08-20) supersedes the July 14 list. **Slices 1–5 are Done.** Remaining ops: create a Sentry project and set `SENTRY_DSN` + `VITE_SENTRY_DSN` on Vercel (rebuild after `VITE_*`). Next SQL is **035**.

July leftovers that still matter, now mapped:

- Phase 2 efficiency (select columns / bootstrap parallel) → after slice 5, or opportunistic inside slice 1.4 only if you touch bootstrap
- Phase 0.6 IDOR smoke → slice **2.5**
- Phase 3.8 PWA → **Done 2026-08-12** (no Today Home — that’s slice 3)
- Shared date/week module → later, not a slice
- Drop `VITE_NEW_ONBOARDING_FLOW` from Vercel → hygiene, anytime

### Suggested next pick-ups for Beck

Slices 1–5 done. Production-readiness queue is complete. Product follow-ups are outside this queue.  

### Ops reminders

- Deploy = push `main` → Vercel project `swol-tracker`  
- New SQL: `migrations/035-….sql` next; apply prod; changelog here  
- Web-only: ignore `mobile/` unless Matt re-opens iOS  
- Vault: [[SwolTracker]] in SharedVault + Coordination-Log; durable plan stays **in this file**

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-09-23 | Joi | **Slice 7 (7.1 + 7.2).** `src/utils/e1rm.js` (Epley 1–10 reps, round-to-5, max lookup) + 13 tests. `AuthenticatedShell` now wraps `logSet` to detect a new estimated max vs the recorded 1RM + a per-session ceiling; fires confetti + `EstimatedPrBanner` with one-tap "Save as new max" (never auto-saves). Bodyweight/AMRAP/range sets are excluded. 273 tests green. 7.3 (Progress trend) + 7.4 (MCP parity) remain. |
| 2026-09-23 | Joi | **Slice 6 done.** Bootstrap parallelized to 2 waves (11 serial awaits → 3 round trips); `getGroupMembers`/`getLeaderGymId` now fire for every user (self-scoped RPCs). Screens + all modals lazy-loaded on first open; `manualChunks` splits react + supabase/zod into cache-stable vendor chunks (app chunk 672KB→209KB, 61KB gzip). Narrowed `getWorkoutLogsInWeekRange`/`getWorkoutCompletions`/`getMissedDays` to explicit columns. 260 tests green, lint clean. 6.2 (`get_bootstrap` RPC) skipped — 6.1 already collapsed the waterfall. |
| 2026-09-23 | Joi | **Prod data cleanup.** 418 placeholder `Exercise N` logs: 214 renamed to real names from their week's program, 204 with no program deleted. `Back Squat` → `Barbell Back Squat` across maxes/logs/9 programs (Matt + Wren had split 1RMs). Deleted 2 junk Wren programs (wk17 placeholder, wk20 `{}`) + 8 empty duplicate `Personal Gym`s (each user keeps ≥1). Marked 311 unprocessed >30d `app_events` processed. Backups: `~/work/SwolTracker-backups/cleanup-2026-09-23/`. |
| 2026-09-23 | Joi | **Proposed slices 6–9** from code review: 6 instant cold open (parallel bootstrap, code split, column selects), 7 PR moments (e1RM from every set), 8 shared domain core (web↔MCP week math/normalizer/Zod), 9 coach memory + opt-in web push. Recommended order 6→7→8→9; awaiting Matt lock. |
| 2026-09-12 | Joi | **Bodyweight set rows:** dropped `+ Weight` and `Bodyweight / As prescribed` so the row is a log tap. Vacated space shows last-session reps, AMRAP “Max effort”, or rest. Overload copy for unloaded work is +2 reps, not +5 lbs. |
| 2026-08-20 | Beck | **Slice 5 done.** Sentry wired env-gated (`SENTRY_DSN` / `VITE_SENTRY_DSN`, no-op until set). `/api/llm` logs usage server-side, 413 on oversized prompts, no raw provider errors. `npm run lint` is a CI gate. Bootstrap no longer auto-creates a gym. |
| 2026-08-20 | Beck | **Slice 4 done.** Week-end card: 1-week generate with skip/overload/session notes prefilled; agent users get “Ask your coach” only (no second generate button). Squad strip on Today from existing completions/misses. |
| 2026-08-20 | Beck | **Slice 3 done.** Workout tab is a Today session: focus + sets first, week/day picker behind “This week.” One rest timer for the session (vibrate + beep at 0). Weight/rep overrides keyed by week+day+exercise. |
| 2026-08-20 | Beck | **Slice 2 done.** Migration **034** applied on prod: `search_users(search_term)` uses `auth.uid()`, 2–50 chars, email only for admins; `get_app_setting` / LLM key RPCs admin-or-service_role. CORS no longer `*` (`ALLOWED_ORIGINS` or built-in prod+localhost list). MCP `save_workout_program` requires gym `owner`/`leader`. Tests: `idor-guards`, `resolveGymId` foreign gym, member save forbidden, CORS allow list. |
| 2026-08-20 | Beck | **Slice 1 done.** Invite accept checks `success === true` (no more confetti on `{ success: false }`). Join hydrates the week-keyed program map. Profile Zod accepts fitness/start-date/group name; group name save awaits + toasts; failed save keeps the editor open. Bootstrap failure shows retry instead of an infinite spinner. Helpers/tests: `src/lib/groupJoin.js`, `validation.test.js`, `useAppBootstrap.test.js`. |
| 2026-08-20 | Beck | **Production slices queued.** Fresh web-only diagnosis: app is not a rewrite; P0 is “UI lies” then remaining IDOR/CORS, then Today + closed weekly loop. New section **Current work queue — production slices (2026-08-20)** with tickets 1.1–5.4. Joi: next unowned slice is **2** after slice 1 is on `main`. |
| 2026-08-12 | Joi | **PWA safe areas:** header/tab bar respect iPhone notch + home indicator (`env(safe-area-inset-*)`) so Settings/Profile are no longer under the status bar. |
| 2026-08-12 | Joi | **Phase 3.8:** Installable PWA (manifest, apple-touch-icon, SW app-shell cache) + offline write queue for set log / complete / skip. Last write per set wins; flush on reconnect. Banner shows pending count. |
| 2026-08-12 | Joi | **Week math + actual reps:** Insights `getCurrentWeekFromStartDate` now uses Monday-aligned `calculateCurrentWeek` (same as workout + MCP) instead of elapsed-ms. SetRow can edit actual reps; cascade + localStorage match weight overrides; `actual_reps` persists on log. |
| 2026-07-14 | Beck | **Buddies: leaders saw 0 members** — `get_group_members` (migration 027) used unqualified `member_id`/`leader_id` inside a PL/pgSQL `RETURNS TABLE` function, so authenticated calls raised ambiguous-column and the client returned `[]`. Migration **033** qualifies the IDOR guard; bootstrap always loads members for leaders + buddy fallback. Applied on prod. |
| 2026-07-14 | Beck | **Legacy onboarding hard-delete:** Removed `src/components/Onboarding/`, `useOnboarding.js`, `OnboardingRouter.flag*`, and `handlePrepareForAgent` kill-switch path. `OnboardingRouter` is Agent-native → Simple fallback only. Drop `VITE_NEW_ONBOARDING_FLOW` from env/Vercel (unused). |
| 2026-07-14 | Beck | **Phase 3.7:** Week-end Review → Generate next week. Proactive `WeekEndReviewCard` when next calendar week has no program and current week is late/all-accounted; opens AI generator with history/overload already loaded, default `weekCount: 1`. Settings + empty state copy → “Review + Generate”. Helpers/tests in `src/lib/programContinuity.js`. |
| 2026-07-14 | Beck | **Phase 0.4–0.5 + partial 0.6:** Prod SQL verify for 027–032 markers (functions/tables/prompt). Dual-migration policy: `migrations/` is SoT; `supabase/migrations/` CLI history is incomplete and must not be used as “what’s applied.” Key RPCs use `_require_self` or force `auth.uid()`; full interactive IDOR suite still open. |
| 2026-07-14 | Beck | **Phase 1.4:** Bounded bootstrap set-log load — last 8 calendar weeks via `getWorkoutLogsInWeekRange`; completions + missed days remain full history (tiny). Lazy-fetch older weeks when the week cursor moves outside the window (`WorkoutLogContext`). Helpers in `src/lib/bootstrapLogs.js`. |
| 2026-07-22 | Joi | **Coach Board FAB removed from shell** — only Header Bot + workout `CoachBoardEntry` remain (was 3 entry points). `AgentChatFAB.jsx` kept but unmounted. Jump-to-Today lowered to `bottom-24`. |
| 2026-07-14 | Joi | **Phase 3.5 + 3.6:** Coach Board primary surfaces — header Bot button (unread), always-on workout `CoachBoardEntry`, keep FAB as secondary. Post-workout “How was training?” CTA with quick chips + free text → `sendUserMessage`; per week/day dismiss. `useAgentChat.send(override)` + reportWriteFailure + sending state. |
| 2026-07-13 | Joi | **Phase 1.5 + 3.4:** `reportWriteFailure` helper; toast+errorService on workout log/complete, maxes, profile, buddies, equipment, swap, AI confirm; web `logMissedDay`/`clearMissedDay`/`getMissedDays`; Skip day UI on WorkoutFocus with reason chips; DaySelector amber missed dots; bootstrap hydrates missed days. |
| 2026-07-13 | Joi | **Phase 1.3:** agent-native onboarding is the default path; SimpleOnboarding remains "No agent?" fallback; legacy 13-step wizard only via kill switch `VITE_NEW_ONBOARDING_FLOW=false`. Shared option lists → `src/constants/onboardingOptions.js`. Soft-archive deprecation on `Onboarding/` + `useOnboarding.js`. Flag defaults **true** when unset. Set `VITE_NEW_ONBOARDING_FLOW=true` in local/prod env files; **also set on Vercel** if cloud build does not load `.env.production`. |
| 2026-07-13 | Beck | Phase 1.1–1.2: Session/Program/WorkoutLog contexts; AuthenticatedShell; react-router URL tabs + `/settings` `/admin` `/onboarding` |
| 2026-07-13 | Beck | Initial architecture review; Phase 0.1–0.3 implemented (equipment persist, log rollback, onboarding re-bootstrap); this doc created |

---

## Related chat / decision

- Architecture review session with Matt (2026-07-13): web-only focus; implement three correctness fixes; keep durable game plan **in-repo on GitHub** so Joi can follow without vault archaeology.
)
