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
- [ ] Emit events from SwolTracker tools: `workout.completed`, `workout.missed`, `max.updated`, `program.saved`, `milestone.hit`, `week.rolled_over`. **Effort: M**
- [ ] Expose subscription via SDK's event store (agents long-poll `claimPending`). **Effort: S**
- [ ] Kill the onboarding polling loop in `Onboarding.jsx` — replace with an event subscription. **Effort: M**
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

#### 3.5.3 — Simplified no-agent fallback
- [ ] Collapse the 11 form steps to 4 grouped screens: basics (name/gender/age/weight), training (goals/days/duration), equipment (location/gear), dates. **Effort: M**

#### 3.5.4 — Feature-flag rollout
- [ ] Wrap new flow behind env-var flag so old 13-step path is reachable for rollback. **Effort: S**
  - **Done when:** Agent-connected user completes onboarding in <3 minutes end-to-end.

### Phase 3 retro
*(fill in when phase completes)*

---

## Phase 4 — bot-native-sdk Platform Work (parallel track, Week 2–8)

Goal: turn the SDK from internal library into something a third party could adopt. Most items here land in `/Users/Joi/Work/bot-native-sdk`.

### 4.1 `create-bot-native-app` CLI
- [ ] New package `packages/create-app` with prompts (name, transports, auth strategy). Scaffolds a working app copying the counter reference. **Effort: L**
  - **Done when:** `npx create-bot-native-app my-app` produces a runnable stdio MCP app with one tool, one event, one context module, and passing tests.

### 4.2 Structured SKILL.md schema + validator
- [ ] Define frontmatter schema: `name`, `version`, `capabilities[]`, `limitations[]`, `tone`, `events[]`, `context_keys[]`. **Effort: S**
- [ ] Zod schema + `validateSkill()` helper in SDK. **Effort: S**
- [ ] Counter app's SKILL.md conforms. **Effort: S**
  - **Done when:** SDK rejects manifest at boot if SKILL.md fails validation.

### 4.3 Capability/scope model
- [ ] Apps declare scopes in manifest: `{tool_name, scopes: ["write:program"]}`. **Effort: M**
- [ ] API keys carry granted scopes; tool calls enforce. **Effort: M**
- [ ] User-facing consent UI surface (in SwolTracker: "Your agent requested write:program access"). **Effort: M**
  - **Done when:** An agent without `write:program` scope gets a `forbidden` error when calling `save_workout_program`.

### 4.4 OpenAPI export
- [ ] SDK generates an OpenAPI 3.1 document from registered tools. Exposed at `/api/mcp/openapi.json`. **Effort: M**
  - **Done when:** The doc validates against an OpenAPI linter; Stoplight/Swagger UI renders it readably.

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
