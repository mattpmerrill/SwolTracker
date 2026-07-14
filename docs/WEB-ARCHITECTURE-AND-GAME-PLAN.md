---
title: SwolTracker Web Architecture Review & Game Plan
status: active
created: 2026-07-13
updated: 2026-07-13
author: Beck
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
| MCP surface | Strong | Scopes, audit, contract tests |
| Web state architecture | Weak | God-component + prop drilling |
| Onboarding | Weak | Three parallel flows |
| Schema / migrations ops | Risky | Dual tracks (`migrations/` vs `supabase/migrations/`) |
| Web routing | Missing | Tab switch only — no URLs |
| Tests | Good base | 165+ unit/contract tests; thin on hooks/UI |

Overall: **real product with solid perimeter; interior needs structure and a few correctness fixes.** Not a rewrite candidate.

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

#### B. Three onboarding systems

| Flow | Path |
|------|------|
| Legacy 13-step | `Onboarding/` + `useOnboarding` |
| Agent-native | `AgentOnboarding/` |
| Simple fallback | `SimpleOnboarding/` |

Flag: `VITE_NEW_ONBOARDING_FLOW` (default **false** → legacy).

**Decision needed:** enable new flow in prod; archive legacy after a completion metric window.

#### C. No real web routing

`ScreenRouter` is a tab switch. No deep links for workout week/day, settings, admin, coach board. Refresh loses tab; browser back is useless.

**Add:** lightweight `react-router` (or hash routes) for `/`, `/workout`, `/maxes`, `/progress`, `/buddies`, `/settings`, `/admin`, `/onboarding`.

#### D. Bootstrap loads all workout logs

`getAllWorkoutLogs(gymId)` on every cold start. Fine early; will hurt at 6–12 months of daily logging.

**Fix:** load current + recent N weeks first; lazy-load history for Progress.

#### E. Dual migration tracks

- `migrations/` — sequential 001–032 (canonical intent)
- `supabase/migrations/` — stale subset
- Root `*.sql` dumps

**Ops risk:** “works in one environment, 404 in another.” Migration 031 comment documents a real prod gap (`create_user_gym` missing).

**Action:** pick **one** source of truth; verify 027–032 applied on live Supabase.

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
| F-001 `resolveGymId` membership check | Fixed in `mcp/src/tools/queries.ts` | Confirm deploy |
| F-002–F-009 RPC IDOR | Migration `027-rpc-idor-fixes.sql` | Confirm applied |
| LLM auth fail-closed | Present in `api/llm.js` | OK |
| API keys hashed | Migration 021 | OK |

**Phase 0 non-negotiable for multi-user:** re-run short IDOR checklist against live project after confirming migrations.

---

## Phased game plan

### Phase 0 — Correctness & safety (this week)

| # | Item | Owner | Status |
|---|------|-------|--------|
| 0.1 | Equipment persistence | Beck | **Done 2026-07-13** |
| 0.2 | Log/complete rollback on DB failure | Beck | **Done 2026-07-13** |
| 0.3 | Onboarding re-bootstrap (no reload) | Beck | **Done 2026-07-13** |
| 0.4 | Verify migrations 027–032 on prod Supabase | Matt / Beck | Open |
| 0.5 | Collapse dual migration story (document or sync folders) | Beck | Open |
| 0.6 | Quick IDOR re-check on agent RPCs + gym write tools | Beck | Open |

### Phase 1 — Web structure (3–5 days)

| # | Item | Notes |
|---|------|-------|
| 1.1 | Domain contexts; thin `swoltracker.jsx` shell | No UI redesign |
| 1.2 | URL routing for tabs + admin + settings | Deep links |
| 1.3 | Onboarding: one path | Flip `VITE_NEW_ONBOARDING_FLOW=true` when ready; archive legacy |
| 1.4 | Bounded bootstrap log load | Recent weeks first |
| 1.5 | User-visible errors on all write paths | toast + `errorService` consistently |

### Phase 2 — Efficiency & quality (ongoing)

| # | Item |
|---|------|
| 2.1 | Select columns, not `*`, on hot paths |
| 2.2 | Parallelize remaining bootstrap waterfalls |
| 2.3 | Shared week/date helpers between web + MCP (already fixed calendar-date bugs twice) |
| 2.4 | ESLint + `mcp` `tsc` as CI / Vercel gates |
| 2.5 | Stop dual-path feature work on mobile unless re-scoped |

### Phase 3 — Agent-native product

| # | Item |
|---|------|
| 3.1 | Align web writes with MCP tools (or shared core) where it reduces dual paths |
| 3.2 | Realtime coach notes / program updates (`app_events` migrations exist) |
| 3.3 | Surface overload recs on ExerciseCard (data already used in AI gen) |
| 3.4 | Missed-day UX next to complete (MCP/DB support exists) |
| 3.5 | Coach Board as primary surface, not FAB-only |
| 3.6 | Post-workout “note to agent” CTA |
| 3.7 | Week-end Review → Generate next week flow (roadmap 1A) |
| 3.8 | PWA / add-to-homescreen if web-only for 6+ months |

**Do not do:** Next.js rewrite “because serverless,” Redux for everything, full TypeScript UI migration in one PR.

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
src/swoltracker.jsx          # App shell / state wiring
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
2. **Pull `main`** before work.  
3. **Prefer small PRs** mapped to phase table rows (e.g. “Phase 1.2 URL routing”).  
4. **Update the changelog** below when you land a row.  
5. **Ignore `mobile/`** unless Matt explicitly re-scopes.  
6. **Do not invent a second architecture doc** — edit this one.  
7. Security-sensitive SQL: land in `migrations/` with the next number; note prod apply in changelog.

### Suggested next pick-ups for Joi

1. **Phase 1.1** — extract `ProgramContext` / `WorkoutLogContext` (product-safe, no UX change)  
2. **Phase 1.2** — tab routing (enables shareable links later for coach notes)  
3. **Phase 3.3** — overload recommendation badges on `ExerciseCard` (visible product win using existing data)  
4. **Phase 0.4** with Matt — confirm prod migrations  

### Suggested next pick-ups for Beck

1. Phase 0.4–0.6 (prod migrations + IDOR re-check)  
2. Phase 1.4 bootstrap log bounds  
3. Shared date/week module between web + MCP  

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-07-13 | Beck | Initial architecture review; Phase 0.1–0.3 implemented (equipment persist, log rollback, onboarding re-bootstrap); this doc created |

---

## Related chat / decision

- Architecture review session with Matt (2026-07-13): web-only focus; implement three correctness fixes; keep durable game plan **in-repo on GitHub** so Joi can follow without vault archaeology.
)
