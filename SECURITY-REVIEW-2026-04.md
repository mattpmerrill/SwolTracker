# SwolTracker Security Review — April 2026

**Scope:** Web app (`src/`), Vercel serverless API (`api/`), MCP server (`mcp/`), SQL migrations (`migrations/` + base schemas). The `mobile/` directory is explicitly excluded.
**Reviewer:** Senior app-sec review, whole-codebase static audit.
**Date:** 2026-04-19
**Plan mapping target:** `AGENT-NATIVE-PLAN.md` task 0.1.

---

## Executive Summary

- **Overall posture grade: D.** The perimeter (auth, API-key hashing, JWT gating on sensitive entry-points) is built correctly. The interior is not. A large class of `SECURITY DEFINER` RPCs across migrations 002, 009, 011, 013, 014, and 024, plus the MCP server's `resolveGymId` helper, accept a user/gym identifier as a *parameter* and never cross-check it against `auth.uid()` or membership. Because `SECURITY DEFINER` bypasses RLS and the MCP server uses the service-role key (which also bypasses RLS), these become cross-tenant read/write primitives usable by any authenticated user or any valid API key.
- **Critical blast radius.** A single authenticated user can (a) read any other user's agent chat history and coach notes, (b) impersonate any user when sending group chat messages or buddy invites, (c) remove members from groups they don't lead, (d) read all error logs (stack traces + emails + context JSONB) app-wide, and (e) overwrite any user's onboarding profile. None of these require admin status. All require only a signed-in anon-key session.
- **The MCP `resolveGymId(gymId?)` pattern is the single highest-leverage bug.** Almost every write tool (`save_workout_program`, `log_set`, `log_many_sets`, `mark_workout_complete`, `log_missed_day`, `delete_set`, `correct_set`, etc.) funnels through it. When the caller supplies any `gym_id`, the helper returns it verbatim with no membership check, and the service-role Supabase client then writes as that gym. One valid `swol_…` API key + a leaked gym UUID = full write access to another user's training data.
- **Two migrations were partial fixes.** Migration 025 hardened `send_agent_message` but left the five sibling agent-message RPCs (read/mark-read/latest-note) unfixed. Migration 018 tightened RLS on `profiles` / `app_settings` / `error_logs`, but every `SECURITY DEFINER` RPC in migration 009 still bypasses it and performs no admin check in its body (a comment literally reads `-- Admin check is done client-side`).
- **Bright spots.** `api_keys` + `create_api_key` / `revoke_api_key` (migration 021) are correctly implemented: SHA-256 hashing, `auth.uid()` used internally (not a parameter), max 5 active keys, plaintext returned only on create. `get_all_users` (migration 023) correctly calls `is_admin(auth.uid())`. `.env.local` is gitignored and confirmed never committed. `send_agent_message` in migration 025 is now correct. The `swol_<48 hex>` key format gives ~192 bits of entropy. Zod validation + the MCP shim exist but need expansion.

### Severity counts

| Severity | Count |
|----------|-------|
| Critical | 4 |
| High     | 6 |
| Medium   | 5 |
| Low      | 3 |
| Info     | 2 |

### Recommended phase mapping

- **Phase 0 (ship before GA, non-negotiable):** F-001, F-002, F-003, F-004, F-005, F-006, F-008, F-009, F-010.
- **Phase 1 (hardening, within 2 weeks):** F-007, F-011, F-012, F-013, F-014.
- **Phase 2 (defense-in-depth / polish):** F-015, F-016, F-017, F-018.

---

## Critical Findings

### F-001 — Critical — MCP `resolveGymId` cross-gym authorization bypass

- **File:** `mcp/src/tools/queries.ts:34-38`
- **Category:** authorization bypass (IDOR) via service-role client
- **Description:** The helper that every write-path MCP tool uses to resolve a target gym trusts the caller-supplied id:

  ```ts
  async function resolveGymId(gymId?: string): Promise<string | null> {
    if (gymId) return gymId;            // ← no ownership check
    const gyms = await getMyGyms();
    return gyms[0]?.id ?? null;
  }
  ```

  `api/mcp.js` (lines 19–24, 92–101) constructs the Supabase client with `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS. Zod schemas in `register-tools.ts` validate that `gym_id` is a UUID, but do not verify membership.
- **Impact:** Any holder of a valid `swol_…` API key who knows any other user's `gym_id` (easily observed inside any shared gym, leaked via realtime, or simply enumerable in small deployments) can:
  - Write workout programs into that gym (`save_workout_program` → `actions.ts:~412`),
  - Log/correct/delete sets against it (`log_set`, `log_many_sets`, `correct_set`, `delete_set`),
  - Mark workouts complete or mark days missed on another user's behalf (`mark_workout_complete`, `log_missed_day`),
  - Read training context via the read-path query tools that also accept `gym_id`.

  The `created_by` / `user_id` columns will be attributed to the attacker, but the *target gym's* state is mutated. In a leader/member gym this corrupts the entire group's program.
- **Recommendation:** In `resolveGymId`, require that the supplied `gymId` exists in `gym_members` for the current `userId`:

  ```ts
  async function resolveGymId(gymId?: string): Promise<string | null> {
    const gyms = await getMyGyms();
    if (!gymId) return gyms[0]?.id ?? null;
    return gyms.find(g => g.id === gymId)?.id ?? null;
  }
  ```

  For write tools that require the caller to be the gym's *leader* (e.g., `save_workout_program`), also check `role === 'leader'` before proceeding. Consider returning a typed error (`{ ok: false, error: 'not_a_member' }`) rather than silently null-ing.
- **Phase:** Phase 0.

---

### F-002 — Critical — Agent-message RPCs accept arbitrary `p_user_id`

- **File:** `migrations/024-agent-messages.sql:98-132` (`get_agent_messages`), `137-172` (`get_unread_user_messages`), `175-200` (`has_unread_agent_messages`), `203-217` (`mark_agent_messages_read`), `220-248` (`get_latest_coach_note`).
- **Category:** authorization bypass (IDOR) in `SECURITY DEFINER` function
- **Description:** All five are `SECURITY DEFINER` + `GRANT EXECUTE … TO authenticated`, take a `p_user_id UUID` parameter, and never compare it to `auth.uid()`. The table's RLS SELECT policy is correct, but `SECURITY DEFINER` bypasses RLS.
- **Impact:** Any signed-in user can:
  - Read the entire Coach Board history of any other user (`get_agent_messages`) — includes personal training context, goals, agent prompts, markdown content.
  - Poll any user's unread user-authored messages (`get_unread_user_messages`) — discloses what they've typed since the last agent reply.
  - Read the latest coach note of any user (`get_latest_coach_note`) — discloses weekly-review content, potentially PII-adjacent fitness/health context.
  - Flip any user's read-cursor (`mark_agent_messages_read`) to hide unread badges on their device.
  - Probe unread state for any user (`has_unread_agent_messages`) as a user-existence oracle.
- **Recommendation:** In each of the five functions, enforce:

  ```sql
  IF p_user_id IS DISTINCT FROM auth.uid() AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  ```

  The `auth.role() = 'service_role'` escape preserves the MCP server's ability to read on behalf of the user (as done already for `send_agent_message` in migration 025). Ship as migration 026.
- **Phase:** Phase 0.

---

### F-003 — Critical — Error-log RPCs have no admin check (comment says "client-side")

- **File:** `migrations/009-error-logging.sql:104-168` (`get_error_logs`), subsequent functions `get_error_stats`, `resolve_error`, `cleanup_old_errors` in the same file.
- **Category:** broken access control / sensitive data exposure in `SECURITY DEFINER` function
- **Description:** `get_error_logs` is `SECURITY DEFINER`, granted to `authenticated`, and contains a literal comment at line 136: `-- Admin check is done client-side via email comparison`. No check is performed in the function body. The function joins `error_logs` against `profiles` and returns `user_email`, `user_name`, `stack_trace`, and arbitrary `context JSONB` fields. Migration 018 tightened the RLS on the `error_logs` table, but `SECURITY DEFINER` bypasses RLS.
- **Impact:** Any signed-in user can:
  - Pull the full app-wide error log including stack traces (which frequently contain file paths, internal state, partial SQL, and sometimes request payloads),
  - Enumerate all user emails and display names,
  - Correlate failures to specific users,
  - Mark errors as resolved (`resolve_error`) to hide evidence,
  - Purge old errors (`cleanup_old_errors`).
- **Recommendation:** Add `IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;` at the top of `get_error_logs`, `get_error_stats`, `resolve_error`, and `cleanup_old_errors`. Remove the misleading comment. Keep the function `SECURITY DEFINER` so admins still get through RLS on the joined `profiles` row.
- **Phase:** Phase 0.

---

### F-004 — Critical — Buddy/group RPCs trust `p_user_id` parameter

- **File:** `migrations/002-buddy-groups.sql` — affected functions include:
  - `remove_group_member(p_leader_id, p_member_id)` (~line 257)
  - `leave_workout_group(p_member_id)` (~line 240)
  - `accept_group_invite(p_request_id, p_user_id)`
  - `accept_buddy_request(p_request_id, p_user_id)`
  - `get_buddies(p_user_id)` (~line 284)
  - `get_received_requests(p_user_id)` / `get_sent_requests(p_user_id)`
  - `get_group_members(p_leader_id)` (~line 146)
  - `get_leader_gym_id(p_member_id)`
  - `get_group_role(p_user_id)`
- **Category:** authorization bypass (IDOR) in `SECURITY DEFINER` functions
- **Description:** All are `SECURITY DEFINER` + granted to `authenticated` and use the `p_user_id`/`p_leader_id`/`p_member_id` parameter as the authoritative identity without comparing to `auth.uid()`. Some have weak structural checks (e.g., `accept_group_invite` verifies the invite is *addressed* to `p_user_id`), but none actually bind the action to the caller.
- **Impact:**
  - Read: any user's buddy list, their pending/received/sent requests, any group's full member list including emails, any user's group role, any member's leader's gym id.
  - Write: force any member to leave any group (`leave_workout_group`); remove any member from any group without being the leader (`remove_group_member`); auto-accept a buddy request or group invite on the victim's behalf when a pending one exists.
- **Recommendation:** In each function, add `IF p_user_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;` (or, for leader-only operations, a lookup: `IF NOT EXISTS (SELECT 1 FROM gym_members WHERE user_id = auth.uid() AND gym_id = v_gym AND role = 'leader')…`). Ship as migration 026 alongside F-002/F-003.
- **Phase:** Phase 0.

---

## High Findings

### F-005 — High — `send_member_invite` allows spoofed invites

- **File:** `migrations/011-member-invites.sql` (original) and `migrations/019-admin-rpc-and-rate-limiting.sql` (re-defined with rate limit)
- **Category:** identity spoofing in `SECURITY DEFINER` function
- **Description:** `send_member_invite(p_inviter_id, p_target_id, …)` stores a pending invite keyed on `p_inviter_id` and — in the 019 re-definition — rate-limits against that parameter. `auth.uid()` is not checked.
- **Impact:** Any authenticated user can insert invites that appear to the target as coming from an arbitrary user. Social-engineering vector: attacker makes the invite look like it came from a trusted buddy. Also bypasses the per-user invite rate limit by rotating `p_inviter_id`.
- **Recommendation:** Force `p_inviter_id = auth.uid()` or drop the parameter entirely and read from `auth.uid()`.
- **Phase:** Phase 0.

---

### F-006 — High — Group chat RPCs trust `p_user_id`

- **File:** `migrations/013-group-chat.sql` (original), `migrations/015` (if present) and `migrations/019-admin-rpc-and-rate-limiting.sql` (re-definition)
- **Functions:** `send_group_message(p_user_id, p_content, …)`, `get_group_messages(p_user_id, …)`, `get_user_group_leader_id(p_user_id)`
- **Category:** identity spoofing / cross-tenant read in `SECURITY DEFINER` functions
- **Description:** `SECURITY DEFINER`, granted to `authenticated`, `p_user_id` never compared to `auth.uid()`. `send_group_message` inserts rows with `sender_id = p_user_id` and resolves the target group from that user's membership. `get_group_messages` returns the messages of the group *that the `p_user_id` caller belongs to*, not the authenticated caller's group.
- **Impact:**
  - Write: send group chat messages as any target user, posted into that user's group. In a leader/member gym this can masquerade as the leader.
  - Read: dump the full chat history of any other user's group by calling `get_group_messages` with their user id.
- **Recommendation:** Replace the `p_user_id` parameter with `auth.uid()` or enforce equality at the top of the function.
- **Phase:** Phase 0.

---

### F-007 — High — `api/llm.js` auth + rate limit are optional

- **File:** `api/llm.js:224-260`
- **Category:** missing authentication on sensitive proxy
- **Description:**

  ```js
  if (supabaseUrl && supabaseServiceKey && authHeader) {
    // …auth + rate limit happens here…
  }
  // Otherwise: proceed to call the LLM with the server's API key
  ```

  If any of the three is falsy — for example, the request omits the `Authorization` header — the function skips `supabase.auth.getUser(token)` **and** the `check_rate_limit` RPC, and still proxies the request to OpenAI/Claude/Gemini/OpenRouter using the server-side API key. CORS is `*` (line 199).
- **Impact:** An unauthenticated attacker can burn the project's LLM quota by sending `POST /api/llm` with a crafted body — no rate limit, no identity, no cost attribution. In a deployed environment this is dollar-cost-exploitable and noticeable quickly, but the primary security concern is that auth is *optional by construction* rather than enforced.
  (Per the review's exclusions, pure resource-exhaustion is out of scope; this finding is about missing authentication, not DoS.)
- **Recommendation:** Make `authHeader` + a successful `getUser(token)` mandatory. Return `401` when missing. Drop the implicit "anonymous if env is unset" path — fail closed. Also scope CORS to the app's own origin(s).
- **Phase:** Phase 1 (bump to Phase 0 if the endpoint is publicly reachable today).

---

### F-008 — High — `complete_onboarding` trusts `p_user_id`

- **File:** `onboarding-schema.sql` (function `complete_onboarding(p_user_id UUID, …)`, ~line 175)
- **Category:** authorization bypass in `SECURITY DEFINER` function
- **Description:** `SECURITY DEFINER`, granted to `authenticated`. Parameter `p_user_id` is used to `UPDATE profiles SET … WHERE id = p_user_id`. No `auth.uid()` check.
- **Impact:** Any authenticated user can overwrite the onboarding state (goals, age, equipment flags, program start date) of any other user. Also discards the legitimate user's progress by replaying their own onboarding.
- **Recommendation:** Enforce `p_user_id = auth.uid()` (or drop the parameter). Since onboarding writes touch `profiles`, `gyms`, `gym_members`, and `gym_equipment`, the whole block needs the check once at the top.
- **Phase:** Phase 0.

---

### F-009 — High — `log_api_usage` accepts arbitrary `p_user_id`

- **File:** `migrations/001-admin-area.sql` (`log_api_usage(p_user_id UUID, …)`)
- **Category:** data integrity / identity spoofing
- **Description:** `SECURITY DEFINER`, granted to `authenticated`. Inserts into `api_usage_logs` with `user_id = p_user_id`. No `auth.uid()` check.
- **Impact:** Attacker can pollute another user's token-usage attribution, inflate their visible cost, or frame them in admin dashboards. Also lets the attacker pad a victim's usage to fake quota exhaustion on the admin side.
- **Recommendation:** Force `p_user_id = auth.uid()` or drop the parameter.
- **Phase:** Phase 0.

---

### F-010 — High — `has_unread_messages` / `mark_messages_read` trust `p_user_id`

- **File:** `migrations/014-chat-read-status.sql`
- **Category:** authorization bypass in `SECURITY DEFINER` function
- **Description:** Both functions accept `p_user_id` and never check `auth.uid()`. `has_unread_messages` returns a boolean for any user (oracle); `mark_messages_read` flips another user's read cursor, which hides legitimately unread messages from the victim.
- **Impact:** Targeted denial-of-visibility against any user's group-chat unread badge, plus user-existence probing.
- **Recommendation:** Enforce `p_user_id = auth.uid()` in both functions.
- **Phase:** Phase 0.

---

## Medium Findings

### F-011 — Medium — `search_users` rate limit is bypassable

- **File:** `migrations/019-admin-rpc-and-rate-limiting.sql` (`search_users(search_term, current_user_id)`)
- **Category:** authorization / rate-limit bypass
- **Description:** The function's `check_rate_limit` call is keyed on the `current_user_id` parameter, not on `auth.uid()`. The caller's identity is also not verified against `current_user_id`.
- **Impact:** An attacker can rotate `current_user_id` through random UUIDs to defeat per-user rate limiting on the search endpoint, enabling broad email-based user enumeration. (Even without rotation, there is no `auth.uid()` check, which is an authorization concern separate from the rate-limit one — but enumeration is the primary impact given the function returns filtered rows regardless.)
- **Recommendation:** Replace the parameter with `auth.uid()` both for rate-limit keying and for any "exclude self" logic. Validate `search_term` length (`LENGTH(search_term) BETWEEN 2 AND 50`).
- **Phase:** Phase 1.

---

### F-012 — Medium — `log_error` accepts arbitrary `p_user_id`

- **File:** `migrations/009-error-logging.sql` (`log_error(p_user_id UUID, …)`)
- **Category:** data integrity / identity spoofing
- **Description:** `SECURITY DEFINER`, granted to `authenticated`, no `auth.uid()` check.
- **Impact:** An attacker can attribute fake/malicious errors to any user, poisoning the admin Error Logs viewer and potentially hiding their own failures behind another user's id. Combined with F-003, this lets an attacker both write and read arbitrary error entries.
- **Recommendation:** `p_user_id := auth.uid()` or drop parameter. Consider also validating `p_category` and `p_severity` against enum lists.
- **Phase:** Phase 1.

---

### F-013 — Medium — `PROVIDER_CONFIGS` is mutated at module scope on each request

- **File:** `api/llm.js:249-258`
- **Category:** concurrency / logic correctness with security implication
- **Description:** When an authenticated user triggers a per-provider model override (`get_app_setting` returns a non-empty string), the handler writes `config.models[requestType] = modelOverride.trim()` and `config.defaultModel = modelOverride.trim()` into the module-level `PROVIDER_CONFIGS` object. Vercel serverless instances are reused across requests, so one user's admin-side override silently sticks for all subsequent requests that hit the same warm instance — and can race with a concurrent request that sets a different override.
- **Impact:** Cross-request config bleed. Practical fallout in the admin-only path is limited, but it is a poisoning primitive: one admin with a compromised session or a bug elsewhere could set `llm_model_openai` to an unexpected value (e.g., a deprecated model that leaks longer responses) and have it apply to all subsequent users until the lambda recycles. More importantly, concurrency-wise the override isn't request-scoped, which violates the principle that per-request state should never mutate shared module state.
- **Recommendation:** Do not mutate `PROVIDER_CONFIGS`. Compute `const effectiveModel = modelOverride?.trim() || config.models[requestType] || config.defaultModel;` in a local variable and thread it into the provider call.
- **Phase:** Phase 1.

---

### F-014 — Medium — Wildcard CORS on `/api/llm` and `/api/mcp`

- **File:** `api/llm.js:199`, `api/mcp.js:37`
- **Category:** CORS misconfiguration
- **Description:** Both handlers set `Access-Control-Allow-Origin: *` and allow `Authorization` as a request header.
- **Impact:** Any origin can initiate requests to the endpoints with the user's bearer token *if* that token is reachable from that origin. For `/api/mcp` this is low-risk because `swol_…` keys live in the user's agent config (not in a browser cookie) and aren't CSRF-attackable. For `/api/llm` the JWT comes from Supabase's browser storage; with wildcard CORS and the credential in a header (not a cookie), classical CORS credential-mode attacks don't apply directly, but there is no business reason to expose the endpoint to arbitrary origins.
- **Recommendation:** Restrict `Access-Control-Allow-Origin` to the app's production origin(s) (plus localhost during dev). Use an env var like `ALLOWED_ORIGINS=https://swoltracker.app,https://…`.
- **Phase:** Phase 1.

---

### F-015 — Medium — No per-tool-category rate limits in MCP

- **File:** `api/mcp.js:80-88` (single 500/hr bucket for all operations)
- **Category:** defense-in-depth (noting per scope; DoS is excluded but abuse-case isolation isn't)
- **Description:** All MCP tool invocations share one `mcp_request` bucket. A buggy agent loop hitting `log_set` burns the same budget as read-only `get_context_bundle`.
- **Impact:** Combined with F-001, an attacker can hammer `save_workout_program` at full rate. Even absent F-001, there is no separation between write-heavy and read-only paths.
- **Recommendation:** Introduce per-category buckets (`mcp_write`, `mcp_ai_generation`, `mcp_read`) with distinct limits. Document limits in the MCP tool registration metadata.
- **Phase:** Phase 2. (Already called out in `AGENT-NATIVE-PLAN.md` Phase 0.5 — consider promoting.)

---

## Low Findings

### F-016 — Low — `accept_group_invite` / `accept_buddy_request` accept `p_user_id` even though invite is addressed to it

- **File:** `migrations/002-buddy-groups.sql`
- **Category:** IDOR (narrow scope)
- **Description:** These functions only succeed when the pending invite/request targets `p_user_id`. So the attacker can't accept an invite that wasn't addressed to the victim. However, they *can* auto-accept an invite on the victim's behalf if one happens to be outstanding — removing the victim's choice to decline.
- **Impact:** A user can be force-enrolled in a group or as a buddy without their consent, as long as an invite is already pending. Narrow, but real.
- **Recommendation:** Enforce `p_user_id = auth.uid()`. Covered by the F-004 remediation — listed separately here to note the "narrow" variant.
- **Phase:** Phase 0 (bundled with F-004).

---

### F-017 — Low — Reliance on Zod-at-schema-time for MCP tool inputs without runtime server-side cross-checks

- **File:** `mcp/src/register-tools.ts`, `mcp/src/tools/*.ts`
- **Category:** defense-in-depth
- **Description:** All MCP tools declare Zod schemas on inputs (UUIDs, enums, length limits) which the MCP SDK enforces at the transport layer. This is good. However, authorization is not done in the same declarative layer — it's scattered in the tool implementations and, as F-001 shows, frequently omitted.
- **Impact:** Silent authorization gaps when new tools are added that follow the existing pattern.
- **Recommendation:** Introduce a per-tool wrapper that accepts a required `authorize: (input, ctx) => Promise<boolean>` callback and makes it impossible to register a tool without one. Default-deny. Also add a `gymMembership(gymId)` helper that every gym-scoped tool uses.
- **Phase:** Phase 2.

---

### F-018 — Low — Client calls RPCs with `p_user_id = currentUser` in good faith

- **File:** `src/lib/repositories/agent-chat.js` (`getAgentMessages`, `sendUserMessage`, `hasUnreadAgentMessages`, `markAgentMessagesRead`, `getLatestCoachNote`), various other repos
- **Category:** defense-in-depth / API shape
- **Description:** The browser client always passes the signed-in user's id as `p_user_id`. This is fine; the bug is that the server accepts the parameter at all (F-002, F-004, etc.). Calling these RPCs is supposed to be a read of "my own" data, so the parameter is redundant and only exists as a hazard.
- **Impact:** None directly — flagged because when F-002/F-004 are fixed server-side, the parameter becomes vestigial. Removing it (or ignoring it server-side with `p_user_id := auth.uid()`) simplifies the surface.
- **Recommendation:** After fixing the underlying RPCs, update these repos to stop passing `p_user_id` (or change the RPC signature to drop it).
- **Phase:** Phase 2.

---

## Info Findings (observed, not vulnerabilities)

### F-Info-A — `gym_equipment` RLS is `FOR ALL USING (gym_id IN user's gyms)`

- **File:** `swoltracker-schema.sql` (base) and later RLS migrations
- **Observation:** Any member of a gym can insert/update/delete any equipment row for that gym. In a leader/member gym this means members can wipe the leader's equipment list. This appears to be by design for the current 2–5 person gym model.
- **Recommendation (optional):** If you ever open gyms to larger groups, gate writes to leaders via `role = 'leader'` in the RLS policy.

### F-Info-B — Profile emails visible to gym members

- **File:** RLS policies on `profiles` (migration 018)
- **Observation:** `profiles` SELECT policy permits gym-member visibility of other members' emails (used by the admin viewer and by `get_group_members`). This is by design. Worth noting for GDPR/PII accounting when mobile launches.

---

## Positive Findings

These are intentionally called out because they offset the findings above and shouldn't be regressed.

1. **`api_keys` lifecycle is done right.** `migrations/021-api-keys.sql`'s `create_api_key` and `revoke_api_key` read identity from `auth.uid()` internally — no `p_user_id` parameter. SHA-256 hashing; plaintext returned once; max 5 active keys enforced via `COUNT(*) < 5` check.
2. **`swol_<48-hex>` = ~192 bits of entropy.** SHA-256 preimage of a 192-bit secret is not a practical attack vector. API-key hashing in `api/mcp.js:26-33` uses Web Crypto's `crypto.subtle.digest`.
3. **`send_agent_message` was correctly hardened in migration 025.** Checks `auth.role() = 'service_role'` or (`p_user_id = auth.uid()` **and** `p_role != 'agent'`). Good template for fixing F-002 siblings.
4. **DELETE policy on `agent_messages`** added in migration 025 matches production and is correctly scoped to `user_id = auth.uid() AND role = 'user'`.
5. **`get_all_users`** (migration 023) correctly calls `is_admin(auth.uid())`. `save_app_setting` and `get_all_app_settings` (migration 001) also gate on `is_admin`.
6. **`is_admin(auth.uid())`** is a proper server-side admin check (migration 019) — reads `auth.users.email` against `app_settings.admin_email`.
7. **Zod schemas** in `src/lib/validation.js` cover the main forms (profile update, max weight, equipment, chat, search, onboarding, agent chat, AI notes, week count). MCP tool inputs have Zod schemas at registration.
8. **RLS is enabled** on all user-data tables. Where `SECURITY DEFINER` functions bypass it, that's the bug, not an RLS hole per se.
9. **`.env.local` is gitignored** (line 5 of `.gitignore`) and `git log --all -- .env.local` confirms it was never committed.
10. **Rate limiting infrastructure exists** via the `check_rate_limit(p_user_id, p_operation, p_max_requests, p_window_minutes)` RPC. It's used by `/api/llm`, `/api/mcp`, search, and invites. Coverage gaps are called out in F-007 and F-011.
11. **MCP server is stateless per request.** `api/mcp.js` spins up a fresh `McpServer` + transport per request and tears it down in `finally`-ish flow, so there's no cross-request tool-context leakage at the MCP layer.
12. **`api_keys.last_used_at` is fire-and-forget updated** (`api/mcp.js:73-77`), enabling audit/review of dormant keys.

---

## Remediation Roadmap (suggested migration 026)

A single migration can close most of Phase 0. Sketch:

```sql
-- 026: Cross-user authorization hardening

-- helper
CREATE OR REPLACE FUNCTION _require_self(p_user_id UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.role() <> 'service_role' AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END; $$;

-- Fix F-002 (5 functions in migration 024)
-- Fix F-004 (buddy/group RPCs in migration 002)
-- Fix F-005 (send_member_invite in 011/019)
-- Fix F-006 (send_group_message, get_group_messages in 013/019)
-- Fix F-008 (complete_onboarding in onboarding-schema)
-- Fix F-009 (log_api_usage in 001)
-- Fix F-010 (has_unread_messages, mark_messages_read in 014)

-- Fix F-003 (error log RPCs in 009): require is_admin(auth.uid())
```

For F-001 (MCP `resolveGymId`), ship a TypeScript patch in `mcp/src/tools/queries.ts` and republish the MCP build. No migration needed.

For F-007 (optional auth in `/api/llm`), a one-line change makes auth mandatory.

---

## Notes on methodology

- Every `SECURITY DEFINER` function in the migrations was inspected for `auth.uid()` / `is_admin()` usage.
- Every MCP tool in `mcp/src/tools/*.ts` was traced through `resolveGymId` / `userId` scoping.
- Serverless handlers (`api/*.js`) were read end-to-end; no abbreviations.
- Base schemas `swoltracker-schema.sql` and `onboarding-schema.sql` were read in full.
- `.gitignore` + `git log --all -- .env.local` confirmed no secret leakage in git history.
- Rate-limit paths were traced from `check_rate_limit` call sites back to their bucket keys.
- Out-of-scope per review instructions: pure DoS, resource exhaustion, secrets-at-rest, documentation issues, and React/Angular XSS assumptions. These are flagged only when they intersect with an authorization or authentication concern.
