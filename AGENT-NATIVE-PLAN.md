# Agent-Native Implementation Plan

> Written: 2026-04-19
> Status: Active — executing now
> Predecessor: [NEXT-LEVEL-ROADMAP.md](./NEXT-LEVEL-ROADMAP.md) (2026-03-11) established the agent-native thesis. This plan operationalizes the next wave: security/hygiene, structural refactor, SDK adoption, new agent-native primitives, and a customer-experience wave.

## Thesis (for fast re-orientation)

SwolTracker already has real agent infrastructure: MCP server, 33+ tools, hashed API keys, Coach Board, realtime. The gap is not "add AI" — it's **promoting the agent from assistant to driver**. The app becomes the visual anchor and data store; the agent becomes the primary interface for most non-glance actions.

Parallel track: harden `bot-native-sdk` so SwolTracker's patterns become a reusable platform instead of a one-off.

## Success metrics (how we know this worked)

- Agent can drive a full week end-to-end without the user opening the web UI (log sets, adjust program, send weekly review).
- Web UI can remove group chat and lose zero user value (measured: no complaints).
- Time-to-first-workout for a new agent-connected user drops below 3 minutes.
- `swoltracker.jsx` under 300 lines. `Onboarding.jsx` under 400 lines (extracted step components).
- At least one second app adopts `bot-native-sdk` (dogfood proof).
- Zero critical findings from a fresh `/security-review` pass.

## Working agreements

- Tasks are checkboxed: `[ ]` todo, `[~]` in progress, `[x]` done, `[-]` cancelled with note.
- Each task has a **Done when** line. If we can't write it, the task isn't scoped yet.
- **T-shirt effort**: S (<1 day), M (1–3 days), L (3–7 days), XL (>1 week — split it).
- Destructive changes (drop tables, remove features) require a rollback note.
- Cross-repo tasks name both repos explicitly.
- When a phase is complete, add a one-paragraph retro at the bottom of the phase.

---

## Phase 0 — Hygiene & Quick Wins (Week 1)

Goal: land low-risk, high-confidence changes that clear space for the larger refactor.

### 0.1 Security review pass
- [x] Ran full security audit across `migrations/`, `api/`, `mcp/src/tools/`. **Effort: S**
  - Report: [SECURITY-REVIEW-2026-04.md](./SECURITY-REVIEW-2026-04.md)
  - **Posture grade: D.** 4 Critical / 6 High / 5 Medium / 3 Low / 2 Info.
  - **Critical Phase 0 fixes queued as tasks 0.7–0.12 below.** Criticals NOT yet fixed; this task only covers the audit itself.

### 0.7 [CRITICAL] Fix MCP `resolveGymId` IDOR (F-001)
- [x] `mcp/src/tools/queries.ts:34-42` — now looks up the supplied `gymId` in `gym_members` for the authenticated `userId`; returns `null` (which write tools already treat as "no gym found") if the caller isn't a member. **Effort: S**
  - Built: `cd mcp && npm run build` clean. Compiled output in `mcp/dist/tools/queries.js`.
  - **Still to do:** add an automated test that proves a valid key cannot write to a non-member gym (deferred to Phase 1.5 testing scaffold 1.5).

### 0.8 [CRITICAL] Fix agent-message RPCs IDOR (F-002)
- [x] Five RPCs in `migrations/024-agent-messages.sql` now gated by `_require_self(p_user_id)` helper (bypassed for service-role callers, so MCP can still act on behalf of a user). Shipped in `migrations/027-rpc-idor-fixes.sql`. **Effort: S**

### 0.9 [CRITICAL] Fix error-log RPCs (F-003)
- [x] `get_error_logs`, `get_error_stats`, `resolve_error`, `cleanup_old_errors` now raise `forbidden (42501)` if `is_admin(auth.uid())` is false. Removed the misleading "Admin check is done client-side" comment from the function body. Shipped in `migrations/027-rpc-idor-fixes.sql`. **Effort: S**

### 0.10 [CRITICAL] Fix buddy/group RPCs (F-004)
- [x] `migrations/002-buddy-groups.sql` RPCs (`get_group_role`, `get_group_members`, `get_leader_gym_id`, `accept_group_invite`, `accept_buddy_request`, `leave_workout_group`, `remove_group_member`, `get_buddies`, `get_received_requests`, `get_sent_requests`) now all enforce caller identity or group membership. `get_group_members` allows any accepted member of the group to list members (needed by existing UI). Shipped in `migrations/027-rpc-idor-fixes.sql`. **Effort: M**

### 0.11 [HIGH] Close remaining IDOR patterns (F-005/F-006/F-008/F-009/F-010/F-012)
- [x] Fixed in `migrations/027-rpc-idor-fixes.sql`: **Effort: S**
  - `send_member_invite` — forces `p_inviter_id = auth.uid()` via `_require_self`.
  - `complete_onboarding` — forces `p_user_id = auth.uid()` via `_require_self`.
  - `log_api_usage` — authenticated callers can only log for themselves; service role may still attribute.
  - `log_error` (F-012 bonus) — authenticated callers always attributed to `auth.uid()`, ignoring `p_user_id`; service role may still attribute.
  - F-006 (`send_group_message` / `get_group_messages`) and F-010 (`has_unread_messages` / `mark_messages_read`) — already removed by migration 026.

### 0.12 [HIGH] `/api/llm` auth tightening (F-007) + request-scoped model (F-013)
- [x] `api/llm.js:224-262` — auth now mandatory: 401 on missing/invalid JWT, 500 on missing Supabase env. Also eliminated the module-scope mutation of `PROVIDER_CONFIGS` (F-013) — model override is now held in a request-local `effectiveModel` variable. **Effort: S**

### 0.2 Env-var hygiene
- [ ] Verify `.env.local` is gitignored and never committed historically (`git log --all -- .env.local`). **Effort: S**
- [ ] Audit Vercel env for stale keys (any provider not currently in use). **Effort: S**
  - **Done when:** Clean `.gitignore` state + documented list of active env vars in `README.md`.

### 0.3 Remove group chat
- [x] Remove `group_messages` feature end-to-end. **Effort: M**
  - Code deleted: `GroupChat.jsx`, chat functions in `social.js`, chat state + handlers + realtime subscription in `swoltracker.jsx`, chat props in `BuddiesScreen.jsx`, `hasUnreadMessages` in `BottomNav.jsx`, `chatMessageSchema` in `validation.js`.
  - Drop migration: `migrations/026-remove-group-chat.sql` (reversible via `migrations/archive/restore-group-chat.sql`).
  - **Still to do in prod:** (a) run `SELECT count(*), max(created_at) FROM group_messages` to confirm no active users before applying; (b) apply `026-remove-group-chat.sql` in Supabase.
  - Build: `npm run build` green.

### 0.4 Remove exercise-swap peer-request flow (UI only, keep data model)
- [ ] Remove `useExerciseSwap.js` UI wiring from WorkoutScreen. Keep the underlying data so agent can still do swaps server-side. **Effort: S**
  - **Done when:** No "request swap" buttons in WorkoutScreen; hook file deleted or reduced to helper functions the agent uses.

### 0.5 Tighten MCP rate limits per tool category
- [x] Per-category budgets in `api/mcp.js`: reads 500/hr, writes 100/hr, `save_workout_program` 20/hr, `generate_workout_program` 20/hr, `send_coach_message` 50/hr. **Effort: S**
  - Implemented in `api/mcp.js` via `TOOL_CATEGORY`, `CATEGORY_LIMITS`, `TOOL_LIMITS` maps + `enforceLimit` helper. Order of checks: overall `mcp_request` → per-tool (tightest) → per-category. Counter names: `mcp_tool_<name>`, `mcp_tools_<category>`.
  - **Verification pending:** live abuse test against deployed endpoint (1000 saves should 429 after 20).

### 0.6 Minimal audit log
- [x] New table `tool_call_audit(id, user_id, api_key_id, tool_name, args_hash, ok, error_message, created_at)`. Write from `api/mcp.js` on every `tools/call`. **Effort: M**
  - Migration `028-tool-call-audit.sql` applied to prod. RLS on; users see only their own rows via `get_my_tool_call_audit(p_limit)` SECURITY DEFINER RPC (capped 1–500).
  - `api/mcp.js`: after rate limits pass, captures `auditCtx` (userId, apiKeyId, toolName, SHA-256 args hash). Fire-and-forget insert in `finally` sets `ok = res.statusCode < 400` and captures `error_message` on throw. Only writes for `tools/call` — not `list`/`initialize`. Args hashed, never stored.
  - Settings → Agent Activity (`AgentActivitySection` in `SettingsModal.jsx`) shows last 50 calls via `db.getMyToolCallAudit(50)`. Hidden when user has no keys. Shows tool name, ok/error icon, relative time, error message on failure. Collapses to first 10 by default.

### Phase 0 retro
*(fill in when phase completes)*

---

## Phase 1 — Structural Refactor (Week 2–3)

Goal: the current monoliths will make every later phase slower. Fix them once.

### 1.1 Split `swoltracker.jsx` (997 lines → target <300) — ✅ DONE
- [x] Extract auth + session into `src/hooks/useSession.js`. **Effort: S**
- [x] Extract Coach Board realtime subscription into `src/hooks/useAgentMessagesRealtime.js` (now absorbed into `useAgentChat.js`). **Effort: S**
- [x] Extract app-bootstrap (initial data fetch) into `src/hooks/useAppBootstrap.js`. **Effort: S**
- [x] Move screen routing into a small `<Router>` component (`ScreenRouter.jsx`). **Effort: S**
  - **Result:** `swoltracker.jsx` = 296 lines.

### 1.2 Split `Onboarding.jsx` (1221 lines → target <400) — ✅ DONE
- [x] One component per step in `src/components/Onboarding/steps/`. **Effort: M**
- [x] Shared state in `src/hooks/useOnboarding.js`. **Effort: S**
  - **Result:** `Onboarding/index.jsx` = 105 lines, each step file < 200 lines.

### 1.3 Split `repositories/workouts.js` (779 lines) — ✅ DONE
- [x] Split into `maxes.js`, `programs.js`, `logs.js`, `insights.js`, `insightsBuilders.js`. Composition remains in `supabase.js`. **Effort: M**

### 1.4 Split `repositories/admin.js` — ✅ DONE
- [x] Split into `adminAuth.js`, `appSettings.js`, `prompts.js`, `errors.js`. **Effort: S**

### 1.5 Testing scaffold — ✅ DONE
- [x] Add Vitest + one happy-path test per repo (read + write). **Effort: M**
- [x] Add one MCP-tool contract test per category (query, action, coaching, natural-language). **Effort: M**
- [x] Wire to Vercel preview CI (`vercel.json` buildCommand runs `npm test` before build) + GitHub Actions (`.github/workflows/test.yml`). **Effort: S**
  - **Result:** `npm test` runs 38 tests across 17 files green; CI fails PR on any test failure.

### Phase 1 retro
*(fill in when phase completes)*

---

## Phase 2 — SDK Adoption (Week 3–5, parallel to late Phase 1)

Goal: SwolTracker's MCP layer becomes the first real consumer of `bot-native-sdk`. This drives SDK improvements from actual use.

### 2.1 Replace hand-rolled MCP plumbing in `api/mcp.js` with SDK
- [ ] Adopt `createBotNativeApp()` + `createHttpHandler()` from `@bot-native/sdk`. **Effort: M**
- [ ] Wrap existing tools in `defineTool()` with Zod schemas and category (query/action/edit/meta). **Effort: M**
- [ ] Port auth check to `AuthResolver` pattern (our API-key hash lookup becomes a resolver). **Effort: S**
  - **Done when:** `api/mcp.js` is under 150 lines and delegates all protocol/validation to the SDK; existing MCP clients work unchanged.

### 2.2 Structured error envelopes (cross-repo: SDK + SwolTracker)
- [ ] Add `AppToolError { code, message, retryable }` to SDK contracts (`bot-native-sdk/packages/sdk/src/contracts/types.ts`). Codes: `not_found`, `forbidden`, `rate_limited`, `invalid_args`, `conflict`, `internal`. **Effort: S**
- [ ] Update `handleToolError` to wrap thrown errors in structured form. **Effort: S**
- [ ] Update SwolTracker tools to throw typed errors. **Effort: M**
  - **Done when:** Every MCP tool in SwolTracker returns either `{ok: true, ...}` or `{ok: false, error: {code, message, retryable}}`.

### 2.3 Idempotency on action tools (cross-repo)
- [ ] Add `idempotency_key` to tool execution context in SDK. Store recent keys per-user with TTL. **Effort: M**
- [ ] SwolTracker action tools (`log_set`, `save_workout_program`, `mark_workout_complete`, `update_max`) accept and respect idempotency key. **Effort: M**
  - **Done when:** A duplicate `log_set` with the same idempotency key returns the original result without a second write.

### 2.4 Supabase event store adapter in SDK
- [ ] Land `createSupabaseEventStore(client, table)` in `bot-native-sdk/packages/sdk/src/events/`. Includes lease claim RPC migration. **Effort: M**
- [ ] SwolTracker adopts it against the existing `app_events` table. **Effort: S**
  - **Done when:** SwolTracker emits and can replay events through the SDK adapter; test coverage for lease semantics.

### Phase 2 retro
*(fill in when phase completes)*

---

## Phase 3 — Agent-Native Primitives (Week 5–7)

Goal: the things that make the agent a driver, not just an assistant.

### 3.1 First-class ContextBundle endpoint — ✅ DONE
- [x] `get_context_bundle` becomes its own HTTP endpoint under `/api/mcp/context`, returning the compressed bundle in one call. **Effort: M**
- [x] Use SDK's `ContextModule` with priorities: current program (P10), last 7 days logs (P9), maxes (P8), streak (P7), unread coach notes (P6), gym equipment (P5), upcoming deload (P4). **Effort: M**
- [x] Enforce 2000-token budget via SDK's `buildContextBundleFromModules`. **Effort: S**
  - **Result:** Both the `/api/mcp/context` HTTP endpoint and the `get_context_bundle` MCP tool share a single source of truth — `createContextModules()` in `mcp/src/context-modules.ts`. Tests cover per-module happy-path + priority trimming when budget is exceeded. Shared MCP auth/rate-limit/audit helpers extracted to `api/_mcp-shared.js`.

### 3.2 Event subscriptions replace polling
- [x] Emit events from SwolTracker tools: `workout.completed`, `workout.missed`, `max.updated`, `program.saved`, `milestone.hit`. **Effort: M**
  - **Result:** Five of the six target events already land in `app_events` from `mcp/src/tools/actions.ts` (`workout.completed` :316, `max.updated` :367, `milestone.hit` :378, `program.saved` :460 & :552, `workout.missed` :990). New in this phase: `onboarding.completed` emission from `complete_onboarding` (`mcp/src/tools/onboarding.ts`) so the onboarding UI gets a direct signal when the agent closes out the flow. `week.rolled_over` remains deferred — it needs a cron trigger that doesn't exist yet, and the skill-endpoint contract test explicitly excludes it. SKILL.md event_keys updated to include `onboarding.completed`.
- [ ] Expose subscription via SDK's event store (agents long-poll `claimPending`). **Effort: S** *(Deferred to Phase 2.4)*
  - **Note:** `get_pending_events` at `actions.ts:639` already lets agents pull unprocessed events and atomically mark them processed (the claim pattern, without lease semantics). True HTTP long-poll and lease-based claim will land with Phase 2.4's Supabase event-store adapter in the SDK — that's the right home for the abstraction, and doing it twice (here + there) would be churn.
- [x] Kill the onboarding polling loop — replace with an event subscription. **Effort: M**
  - **Result:** `src/hooks/useAgentOnboarding.js` now subscribes to Supabase realtime on `app_events` filtered by `user_id` (migration 029 already published the table). Any INSERT triggers a refetch of profile + gym equipment, so UI state reflects agent writes the moment they land instead of up to 2.5s later. Initial fetch on screen-entry catches any events that fired before subscribe. 10-min timeout kept as fallback. 2 new contract tests verify `onboarding.completed` emits on success and does not emit on RPC failure. 134/134 tests green, build clean.
  - **Done when:** Agent gets push-style notifications for the six events; onboarding live-dots driven by events not polling.

### 3.3 SKILL.md for SwolTracker — ✅ DONE
- [x] Author a structured `SKILL.md` at repo root (replace the existing one if it's just a stub). Sections: What you can do, What you can't do, Tools, Events you'll receive, Context bundle shape, Personality/tone guidance. **Effort: M**
- [x] Serve it from `/api/mcp/skill` so agents can fetch at connect time. **Effort: S**
  - **Result:** Rewritten `SKILL.md` with YAML frontmatter (name, version, tone, capabilities, limitations, event_keys, context_keys) aligning with the Phase 4.2 schema target. Tool catalog grounded in the actual 37 tools registered in `sdk-adapter.ts`, grouped by category (query / action / meta). Events list reflects only the three actually emitted today (`workout_completed`, `pr_detected`, `workout_reminder`) — the two aspirational entries (`streak_at_risk`, `weekly_summary_ready`) were removed until cron work lands. Context bundle section mirrors the 7 modules from 3.1. New `/api/mcp/skill` endpoint serves either `text/markdown` or `application/json` (with parsed frontmatter) based on Accept header; publicly cacheable for 5min. Frontmatter + content invariants covered by a new test file.

### 3.4 Agent-initiated multi-step write tools — ✅ DONE
- [x] `shift_program(weeks_forward: number)` — shifts program start date, handles week rollover. **Effort: S**
- [x] `substitute_equipment_globally(from: string, to: string, reason?: string)` — swaps across all weeks. **Effort: M**
- [x] `rebuild_week_for_constraints(week: number, constraints: string, gym_id?)` — server-side LLM call via injected `callLlm`, parses JSON response, saves via `save_workout_program`. Extracted `api/_llm-core.js` so the dispatch layer is shared with `api/llm.js`. **Effort: M**
- [x] `bulk_log_workout(description: string, ...)` — natural-language bulk entry; server-side LLM parses free-text into structured exercises, then delegates to `log_workout_summary`. **Effort: M**
  - **Result:** All four tools ship with contract tests (mocking the injected `LlmCaller` where applicable) and SKILL.md entries. Per-tool rate limits added in `api/_mcp-shared.js` (`rebuild_week_for_constraints`: 10/hr, `bulk_log_workout`: 30/hr).

### 3.5 Replace onboarding wizard with agent-driven flow

#### 3.5.1 — MCP onboarding write tools — ✅ DONE
- [x] `update_profile({display_name?, gender?, age?, weight_lbs?, fitness_goals?, workout_days?, workout_duration?, workout_location?, program_start_date?})` — partial profile writes; validates ranges + formats. **Effort: S**
- [x] `complete_onboarding({...fields, equipment?})` — merges with existing profile, validates all required fields present, writes gym_equipment, flips `onboarding_completed`. **Effort: S**
- [x] `get_onboarding_status()` — helper query so the agent can decide whether to start an interview on connect. Returns `{onboarding_completed, profile, equipment, missing_fields, ready_to_complete}`. **Effort: S**
  - **Result:** New `mcp/src/tools/onboarding.ts` module. 16 contract tests cover validation, partial merging, equipment handling, RPC error propagation. Per-tool rate limits added (`complete_onboarding`: 5/hr, `update_profile`: 60/hr). SKILL.md updated with new tools, `drive_onboarding` capability, and a "Driving onboarding" pattern section that tells agents to batch questions.

#### 3.5.2 — Agent-driven onboarding shell (3 screens) — ✅ DONE
- [x] Collapse 13-step wizard to 3 screens: welcome → agent connection → confirm. **Effort: M**
- [x] Agent drives the interview via chat; writes profile fields via the new MCP tools. Shell polls `get_onboarding_status` for live updates. **Effort: M**
  - **Result:** New `src/components/AgentOnboarding/` component set — `index.jsx` container + 3 screens (`WelcomeScreen`, `ConnectScreen`, `ConfirmScreen`). Pure-logic helpers extracted to `status.js` (REQUIRED_FIELDS, computeMissingFields, canComplete, isOnboardingDone) so the shell and the MCP `get_onboarding_status` tool stay in sync. New hook `useAgentOnboarding.js` owns the state machine: creates a gym + API key on connect, polls `db.getProfile` + `db.getGymEquipment` every 2.5s on the confirm screen, celebrates with confetti when `onboarding_completed` flips, times out after 10 min. Not yet wired into `swoltracker.jsx` — feature-flag integration is 3.5.4. 5 new status-helper tests (113 total, all green). Build clean.

#### 3.5.3 — Simplified no-agent fallback — ✅ DONE
- [x] Collapse the 11 form steps to 4 grouped screens: basics (name/gender/age/weight), training (goals/days/duration), equipment (location/gear), dates. **Effort: M**
  - **Result:** New `src/components/SimpleOnboarding/` component set — `index.jsx` container + 4 grouped form screens + a generating screen that reuses the existing LOADING_PHRASES. Pure-logic helpers in `validation.js` (canProceed, compileData, SCREEN_ORDER) keep the hook and tests aligned. New hook `useSimpleOnboarding.js` owns field state and per-screen navigation; delegates validation to the pure module. 10 new validation tests cover every screen's accept/reject cases plus compileData's field renaming. Not yet wired in — 3.5.4 will route users here based on the welcome-screen branch choice. 123/123 tests green, build clean.

#### 3.5.4 — Feature-flag rollout — ✅ DONE
- [x] Wrap new flow behind env-var flag so old 13-step path is reachable for rollback. **Effort: S**
  - **Result:** New `src/components/OnboardingRouter.jsx` replaces the direct `<Onboarding>` render in `swoltracker.jsx`. Reads `VITE_NEW_ONBOARDING_FLOW` via the pure `OnboardingRouter.flag.js` helper (accepts `true` / `"true"` / `"1"`, defaults false). When off, the legacy 13-step wizard is the only path — zero-risk rollback. When on, users start at `AgentOnboarding`'s welcome screen; clicking "No agent? Set up manually" flips router state to render `SimpleOnboarding` instead. All existing onboarding callbacks (`handleOnboardingComplete`, `handleGenerateOnboardingWorkout`, `handlePrepareForAgent`) pass through unchanged. 9 new flag tests cover truthy/falsy variants plus null-env tolerance. 132/132 tests green, build clean.
  - **Done when:** Agent-connected user completes onboarding in <3 minutes end-to-end.

### Phase 3 retro

Phase 3 moved quickly because most of the infrastructure predated it — five of six target events already emitted from `actions.ts`, the `app_events` realtime publication was live from migration 029, and Phase 1's repository splits meant the context-module work was additive rather than a refactor. The highest-leverage pattern to keep is **pure-logic extraction under hook tests**: every hook that needed coverage (`AgentOnboarding/status.js`, `SimpleOnboarding/validation.js`, `OnboardingRouter.flag.js`) moved its decisions into a no-React-imports module so Vitest could test the logic without pulling in happy-dom. Test count grew 38 → 134 over the phase with no DOM renderer added. The biggest avoided-churn call was deferring `claimPending` long-poll to Phase 2.4 where the SDK event-store adapter lives; `get_pending_events` already covered agents' immediate polling need, and duplicating the abstraction would have meant rewriting it once the SDK version landed. The one unfinished item with no fallback is `week.rolled_over`, blocked on cron infrastructure the app doesn't have. Two debts carry forward: the old `Onboarding/` tree (1221 lines) lives on as the feature-flag rollback path and needs a cleanup pass once the new flow proves out, and `VITE_NEW_ONBOARDING_FLOW=true` is now live in production with no completion-rate threshold defined — removing the legacy path should gate on an actual metric (plan target: 95% completion), which means wiring a funnel event before the flag can flip default-on everywhere.

---

## Phase 4 — bot-native-sdk Platform Work (parallel track, Week 2–8)

Goal: turn the SDK from internal library into something a third party could adopt. Most items here land in `/Users/Joi/Work/bot-native-sdk`.

### 4.1 `create-bot-native-app` CLI — ✅ DONE
- [x] New package `packages/create-app` with prompts (name, transports, auth strategy). Scaffolds a working app copying the counter reference. **Effort: L**
  - **Done when:** `npx create-bot-native-app my-app` produces a runnable stdio MCP app with one tool, one event, one context module, and passing tests.
  - **Result:** `packages/create-app` ships a CLI (`create-bot-native-app`) backed by a reusable `scaffold()` library. The starter template scaffolds a minimal in-memory "ping" app: one tool (`ping`), one event (`ping.tenth` — fires every 10 calls), one context module (`ping_count`), plus a `get_context_bundle` meta tool. `{{APP_NAME}}` and `{{DISPLAY_NAME}}` placeholders are substituted across `package.json`, `app.json`, `SKILL.md`, `README.md`, and `src/server.ts`. `_gitignore` renames to `.gitignore` on copy so npm doesn't strip it from the published package. Interactive prompts (via `prompts`) validate kebab-case and derive a sensible display-name default. 7 scaffold tests cover helpers, substitution, empty-target guard, `_gitignore` rename, and JSON validity; the scaffolded app itself has 3 vitest tests proving the tool increments per-user and emits `ping.tenth` at 10. End-to-end verified: scaffolded app installs into the monorepo, builds with `tsc`, passes tests, and boots a stdio server that stays alive. Full suite: 113/113 green.

### 4.2 Structured SKILL.md schema + validator — ✅ DONE
- [x] Define frontmatter schema: `name`, `version`, `capabilities[]`, `limitations[]`, `tone`, `event_keys[]`, `context_keys[]`. **Effort: S**
- [x] Zod schema + `validateSkill()` helper in SDK. **Effort: S**
- [x] Counter app's SKILL.md conforms. **Effort: S**
  - **Done when:** SDK rejects manifest at boot if SKILL.md fails validation.
  - **Result:** New `packages/sdk/src/contracts/skill.ts` ships a strict Zod `skillSchema`, a dep-free YAML-ish `parseFrontmatter` (supports top-level scalars + indented string lists — the only shapes we accept), and `validateSkill(content)` which throws `SkillValidationError` with a field-path prefix on schema failure. `createBotNativeApp` now reads `manifest.skillFile` from disk (resolved from `skillRoot ?? process.cwd()`) or accepts raw `skill: string`, parses/validates, and attaches the typed `Skill` to `BotNativeApp` — boot throws if the file is missing, has no frontmatter, or fails the schema. Schema field named `event_keys` (not plan's `events[]`) to match what SwolTracker's SKILL.md already ships in production. Counter's and the starter template's SKILL.md both gained conforming frontmatter; counter still builds and boots, a fresh scaffolded app installs + builds + tests + boots, and munging its SKILL.md triggers exit code 1 with `SkillValidationError: Invalid SKILL.md: missing YAML frontmatter …`. 17 new tests (130 total: 12 skill-schema, 3 new app boot-validation, 2 new file-on-disk cases; existing `app`/`server`/`tool` tests updated to pass valid skill content). Full suite green.

### 4.3 Capability/scope model
- [x] Apps declare scopes in manifest: `{tool_name, scopes: ["write:program"]}`. **Effort: M**
- [x] API keys carry granted scopes; tool calls enforce. **Effort: M**
- [x] User-facing consent UI surface (in SwolTracker: "Your agent requested write:program access"). **Effort: M**
  - **Done when:** An agent without `write:program` scope gets a `forbidden` error when calling `save_workout_program`.
  - **Result:** Two-layer enforcement. (1) SDK: `DefinedTool.scopes?: string[]` on `defineTool()`; `skillSchema.scopes` in frontmatter; new `executeToolWithGuards(tool, params, ctx)` checks `identity.scopes` against `tool.scopes` and returns `AppError.forbidden` with `{ tool, required, missing }` details before dispatch; `registerTool` delegates through it. Fail-closed — undefined `identity.scopes` denies anything requiring a scope. Counter app declares `["read"]` / `["write:count"]` per tool and its SKILL.md frontmatter. 11 runtime + 2 contract tests added (141 green total). (2) SwolTracker: migration `030-api-key-scopes.sql` adds `api_keys.scopes text[]`, backfills existing keys with the 4-scope default `['read','write:logs','write:program','coach']`, drops the 1-arg `create_api_key(text)` and replaces it with `create_api_key(text, text[])` (defaults to the full set, dedupes input). `authenticateMcpRequest` loads `scopes` and threads them into identity. All 40 MCP tools in `sdk-adapter.ts` now declare required scopes (read-only queries → `["read"]`; write ops → `["write:logs"]`; program authoring → `["write:program"]`; `send_coach_message` → `["coach"]`; 2 stateless exercise-normalizer utilities intentionally unscoped). `api/mcp.js` routes calls through `executeToolWithGuards`; `api/mcp/context.js` gates on `read`. Onboarding (`useAgentOnboarding.js`, `useOnboarding.js`) and `SettingsModal.jsx` now pass the full scope set explicitly to `create_api_key`, and the Agent Keys list renders scope pills per key. New `scope-enforcement.test.ts` (6 tests) verifies `save_workout_program` / `log_set` / `send_coach_message` / `get_profile` all return `forbidden` with correct `missing` arrays when identity lacks the required scope, and that fail-closed semantics hold for `undefined` scopes. Full SwolTracker suite (140 tests) and SDK suite (141 tests) green.

### 4.4 OpenAPI export — ✅ DONE
- [x] SDK generates an OpenAPI 3.1 document from registered tools. Exposed at `/api/mcp/openapi.json`. **Effort: M**
  - **Done when:** The doc validates against an OpenAPI linter; Stoplight/Swagger UI renders it readably.
  - **Result:** New `@bot-native/sdk` export `buildOpenApiDocument(app, { serverUrl? })` in `packages/sdk/src/contracts/openapi.ts`. Walks `app.tools[]` and emits an OpenAPI 3.1.0 document with one `POST /tools/{name}` operation per tool — chose REST-like mapping (vs. a single endpoint with `oneOf`) so Swagger UI / Redoc browse the catalog as a familiar flat list. Zod input schemas are inlined via `zod-to-json-schema` (`$refStrategy: "none"`, `$schema` stripped) into each operation's `requestBody`. Tool scopes surface twice: standards-track `security: [{ bearerAuth: [...scopes] }]` plus an `x-required-scopes` extension (scopeless tools get `security: [{ bearerAuth: [] }]`, no extension). Every operation declares 200 / 400 / 401 / 403 / 429 responses wired to shared component schemas `AppToolResult` and `AppToolError` (`code` enum matches `AppError.code`), plus a `bearerAuth` (http/bearer) security scheme. Tags are emitted only for tool categories actually used. SwolTracker: new endpoint `api/mcp/openapi.js` — public GET (no auth; knowing tool shapes isn't sensitive), resolves server URL from `x-forwarded-*`, 1h cache header. `api/_mcp-shared.js` CORS now allows GET. `zod-to-json-schema@^3.25.1` added to the app's `dependencies` so Vercel bundles it. Vendor refresh pulls the new `contracts/openapi.js` + types into `vendor/bot-native-sdk/dist/`. Tests: 11 new SDK tests in `contracts/__tests__/openapi.test.ts` (152/152 green); 6 new SwolTracker tests in `mcp/src/__tests__/openapi-endpoint.test.ts` pin the production manifest title, tool count (≥40), scope surfacing across `save_workout_program` / `send_coach_message` / `get_profile`, scopeless utilities, and Zod→JSON Schema inlining for `log_set` (146/146 green). Lint verification: Redocly CLI (`@redocly/cli lint`) reports "API description is valid 🎉" (1 advisory warning: missing `info.license`); Spectral (`spectral:oas` ruleset) 0 errors, 43 warnings — all the same `oas3-operation-security-defined` advisory that bearer-scheme scopes aren't listed under an OAuth2 `flows` block (expected; `bearerAuth` is `http/bearer`, not `oauth2`, and the semantic scope list is carried via `x-required-scopes`). Done-When satisfied.

### 4.5 Multi-app context routing (ship the spike)
- [ ] Implement Approach A from `spikes/context-routing/`: agent-decides-via-tool-use. Registry endpoint returns the list of available apps and their top-line capability. **Effort: L**
  - **Done when:** Two toy apps (counter + a second) co-exist; agent correctly loads context from the right one(s) given a user prompt.

### 4.6 Documentation for agent integration
- [ ] `docs/agent-integration.md`: how an agent's orchestration loop should consume `contextInvalidated`, subscribe to events, prioritize context modules, handle structured errors. **Effort: M**

### 4.7 Per-request tool instantiation (concurrency safety)
- [ ] Review tool singleton pattern; either document "tools must be stateless" or refactor to per-request instantiation. **Effort: M**
  - **Done when:** Decision recorded in `docs/concurrency.md` with a test proving correct behavior.

### Phase 4 retro
*(fill in when phase completes)*

---

## Phase 5 — Customer Experience Wave (Week 6–8, parallel)

Goal: the user-visible payoff of all the infrastructure work above.

### 5.1 "Describe your workout" text input
- [ ] Workout screen gains a text box. User types "benched 185x5, 185x5, 175x6" → calls `bulk_log_workout`. **Effort: M**

### 5.2 Voice log
- [ ] Tap mic → Whisper transcription → same pipeline as 5.1. **Effort: M**

### 5.3 Weekly review becomes the Monday screen
- [ ] New "Weekly Review" tab/entry surface showing agent's narrative review with one-tap action buttons (apply program changes, confirm deload, skip week). **Effort: L**

### 5.4 Program explain button
- [ ] Tap any prescribed set → modal → agent answers "why this weight, why this rep range?" using training history. **Effort: M**

### 5.5 Apple Health / Whoop read-only integration (web first via export, then mobile)
- [ ] Accept readiness/sleep/HRV metrics; surface to agent as a new context module. **Effort: L**

### 5.6 Share-a-PR card
- [ ] Auto-generated image on PR event; share sheet. **Effort: M**

### 5.7 Offline set logging on web
- [ ] Queue-and-sync pattern matching mobile's PowerSync behavior. **Effort: L**

### Phase 5 retro
*(fill in when phase completes)*

---

## Phase 6 — TypeScript Conversion (deferred from Phase 1.5)

Goal: close the JS/TS boundary that exists today between `src/` and `mcp/`.

- [ ] Introduce `tsconfig.json` at root with `allowJs`. **Effort: S**
- [ ] Convert `src/lib/*.js` first (smallest surface, highest leverage). **Effort: L**
- [ ] Convert repositories. **Effort: L**
- [ ] Convert hooks. **Effort: L**
- [ ] Convert components screen-by-screen. **Effort: XL — split as you go**
  - **Done when:** `npm run build` succeeds with `noImplicitAny`, CI type-checks on PR.

---

## Sequenced backlog (execution order)

This is the order of pickup when someone sits down to work:

1. ~~**0.1** Security review~~ — done 2026-04-19
2. ~~**0.3** Remove group chat~~ — done 2026-04-19 (migration pending apply)
3. ~~**0.5** Per-category MCP rate limits~~ — done 2026-04-19 (live verification pending)
4. **0.7** [CRITICAL] Fix `resolveGymId` IDOR — **do this next**
5. **0.8** [CRITICAL] Agent-message RPC IDOR
6. **0.9** [CRITICAL] Error-log RPC admin gate
7. **0.10** [CRITICAL] Buddy/group RPC IDOR
8. **0.11** [HIGH] Remaining IDOR patterns
9. **0.12** [HIGH] `/api/llm` mandatory auth
10. **0.6** Audit log
11. **1.1** Split `swoltracker.jsx`
12. **1.3** Split `workouts.js` repo
13. **1.5** Testing scaffold
14. **2.1** SDK adoption in `api/mcp.js`
15. **2.2** Structured errors (SDK + app)
16. **3.1** First-class ContextBundle endpoint
17. **3.3** SKILL.md for SwolTracker
18. **3.2** Event subscriptions
19. **3.4** Agent-initiated multi-step tools
20. **4.1** `create-bot-native-app` CLI (parallel)
21. **4.3** Capability/scope model
22. **5.1** Describe-your-workout input
23. **5.3** Weekly review Monday screen
24. Remaining items sequenced inside their phase.

---

## Risks & open questions

- **Removing group chat** — any active users? Check `SELECT count(*), max(created_at) FROM group_messages` before dropping the table. If active, soft-deprecate first.
- **Onboarding rewrite** — highest user-visible disruption. Ship behind feature flag; keep old flow available until new flow hits 95% completion rate.
- **Per-request tool instantiation** in SDK may be a breaking change for counter app. Version SDK to 0.x explicitly and note it.
- **TypeScript conversion** is an "eat the elephant" task. Commit to the order above; do not touch components until libs + hooks are done.
- **Multi-app context routing** assumes we build a second app on the SDK. Without a second app, this work has no validation surface. Candidate second apps: habit tracker, nutrition tracker — decide before starting 4.5.

---

## Progress log

*(Append-only. Date, phase, what shipped, what broke.)*

- 2026-04-19: Plan written.
- 2026-04-19: **Task 0.3 complete** — group chat removed end-to-end. Migration `026-remove-group-chat.sql` pending apply in prod. Build clean.
- 2026-04-19: **Task 0.5 complete** — per-category + per-tool MCP rate limits added to `api/mcp.js`. Syntax checked. Live verification pending.
- 2026-04-19: **Task 0.1 complete** — security review done. Grade D, 4 critical + 6 high findings. New Phase 0 tasks 0.7–0.12 created. Pivoting off 0.6 (audit log) to fix the criticals first.
- 2026-04-19: **Task 0.6 complete** — `tool_call_audit` table + RLS + `get_my_tool_call_audit` RPC live via migration 028. `api/mcp.js` writes one audit row per `tools/call` (args hashed). Settings → Agent Activity renders last 50 calls. Build clean.
- 2026-04-19: **Task 3.1 complete** — First-class ContextBundle endpoint shipped. New `/api/mcp/context` HTTP route returns a SDK-composed bundle with 7 priority-ordered modules (current_program P10 → upcoming_deload P4) under a 2000-token budget. `get_context_bundle` MCP tool rewritten to share the same module factory, replacing ~100 lines of ad-hoc summary code. Shared MCP auth/rate-limit/audit helpers extracted to `api/_mcp-shared.js`. 9 new tests (58 total, all green).
- 2026-04-19: **Task 3.3 complete** — SKILL.md rewritten with YAML frontmatter (forward-compat with Phase 4.2 validator) + sections for Capabilities, Limitations, Tools (37 catalogued by category), Events (grounded — 3 real, 2 aspirational removed), Context bundle shape (mirrors the 7 modules), and Personality. New `/api/mcp/skill` endpoint serves markdown or JSON (with parsed frontmatter) based on Accept header. 5 new tests pin the frontmatter shape and prevent aspirational-event drift. 63 tests green.
- 2026-04-21: **Task 4.1 complete** — `create-bot-native-app` CLI shipped in `bot-native-sdk/packages/create-app`. Ships a `bin` entry (interactive `prompts` UI) plus a programmatic `scaffold()` library. Starter template is a minimal in-memory "ping" app: one tool (`ping`), one event (`ping.tenth` at every 10th call), one context module (`ping_count`), plus the `get_context_bundle` meta tool. `{{APP_NAME}}`/`{{DISPLAY_NAME}}` substitution across 11 template files; `_gitignore` → `.gitignore` rename so npm doesn't strip it on publish. 7 scaffold tests + 3 template tests. End-to-end verified: scaffolded app installs, builds, passes tests, and the stdio server boots. Full SDK suite: 113/113 green.
- 2026-04-21: **Task 4.2 complete** — SKILL.md frontmatter schema + validator landed in `@bot-native/sdk`. New `contracts/skill.ts` exports a strict Zod `skillSchema` (fields: `name`, `version`, `tone`, `capabilities[]`, `limitations[]`, `event_keys[]`, `context_keys[]`), a zero-dep `parseFrontmatter`, and `validateSkill()` that throws `SkillValidationError` on malformed input. `createBotNativeApp` now reads SKILL.md from disk at boot (or accepts raw content) and rejects apps whose frontmatter is missing or invalid — Done-When satisfied and verified by munging the file (exit 1). Counter SKILL.md + starter template SKILL.md gained conforming frontmatter. Kept `event_keys` (not plan's `events[]`) to match SwolTracker's already-shipped SKILL.md from Task 3.3. 17 new tests (130 total), full suite green.
- 2026-04-22: **Task 4.4 complete** — OpenAPI 3.1 export shipped. SDK: new `buildOpenApiDocument(app, { serverUrl? })` export in `contracts/openapi.ts` — one `POST /tools/{name}` per registered tool (REST-like mapping so Swagger UI/Redoc browse cleanly), Zod input schemas inlined via `zod-to-json-schema` with `$refStrategy: "none"`, per-tool scopes surfaced on both standards-track `security: [{ bearerAuth: [...] }]` and the `x-required-scopes` extension, every op declares 200/400/401/403/429 wired to `AppToolResult` + `AppToolError` component schemas with the full `AppError.code` enum, `bearerAuth` http/bearer security scheme, tags only for categories actually used. `zod-to-json-schema@^3.24.5` added to SDK deps. 11 new contract tests (152 SDK tests total). SwolTracker: public GET endpoint `api/mcp/openapi.js` (no auth — shape isn't sensitive), resolves `serverUrl` from `x-forwarded-*`, 1h cache header; `_mcp-shared.js` CORS expanded to GET; `zod-to-json-schema@^3.25.1` added to app deps so Vercel bundles the runtime dep. Vendor bundle at `vendor/bot-native-sdk/dist/` refreshed to include `contracts/openapi.js` + types. 6 new endpoint tests pin manifest title, ≥40 tools, scope surfacing on `save_workout_program`/`send_coach_message`/`get_profile`, scopeless-utility fallback, and Zod→JSON Schema inlining for `log_set` (146 SwolTracker tests total). Redocly CLI reports "API description is valid 🎉" (1 advisory: missing `info.license`); Spectral `oas` ruleset 0 errors / 43 advisory warnings (`oas3-operation-security-defined` — expected for an `http/bearer` scheme, scopes flow through `x-required-scopes` by design).
- 2026-04-22: **Task 4.3 complete** — Capability/scope model shipped across SDK + SwolTracker. SDK: `DefinedTool.scopes?: string[]` on `defineTool()`, new `executeToolWithGuards()` enforces scopes against `identity.scopes` pre-dispatch and returns `AppError.forbidden` with `{ tool, required, missing }` details; `registerTool` delegates through it; `skillSchema.scopes` field added; counter app declares per-tool scopes. Fail-closed semantics (undefined scopes = deny anything requiring one). 11 runtime + 2 skill-schema tests added (141 SDK tests total). SwolTracker: taxonomy settled on 4 scopes — `read`, `write:logs`, `write:program`, `coach`. Migration `030-api-key-scopes.sql` adds `api_keys.scopes text[]`, backfills existing keys with the full set, drops `create_api_key(text)` and replaces with `create_api_key(text, text[])` (defaults to full, dedupes). `authenticateMcpRequest` loads + returns scopes; `api/mcp.js` threads them into identity and routes tool calls through `executeToolWithGuards`; `api/mcp/context.js` gates on `read`. All 40 MCP tools tagged in `sdk-adapter.ts`. Onboarding hooks + `SettingsModal.jsx` pass the full scope set on creation and the Settings key list renders scope pills per key. New `scope-enforcement.test.ts` (6 tests) proves `save_workout_program` / `log_set` / `send_coach_message` / `get_profile` all return `forbidden` with correct `missing` arrays when scopes are absent, including fail-closed on `undefined`. 140 SwolTracker tests green; `npm run build` clean. Done-When satisfied: agent without `write:program` gets `{ code: 'forbidden' }` from `save_workout_program`.
