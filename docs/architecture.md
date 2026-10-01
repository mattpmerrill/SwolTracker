# Architecture

SwolTracker is one repo with four deployable or shared pieces, all backed by one Supabase project
(Postgres, Auth, RLS, Realtime). Vercel builds and serves the web app and the serverless functions
from `main`. This file describes how the code is wired today, not how it should be. Where the code
falls short of the rules in [AGENTS.md](../AGENTS.md), [status.md](status.md) lists the gap.

## The parts

| Part | Path | What it is |
| ---- | ---- | ---------- |
| Web app | `src/` | React 18 + Vite single-page app in JavaScript, Tailwind v4, installable as a PWA (`public/sw.js`, `public/manifest.webmanifest`). Talks to Supabase with the public anon key and the signed-in user's JWT, so RLS applies. |
| Functions | `api/` | Vercel serverless functions in JavaScript: the LLM proxy (`llm.js`), the MCP endpoint and its siblings (`mcp.js`, `mcp/context.js`, `mcp/skill.js`, `mcp/openapi.js`), web push (`push.js`) and the reminder cron (`cron/reminders.js`). Files starting with `_` are shared helpers, not routes. |
| MCP package | `mcp/` | TypeScript package with the agent tool kit: 43 tools in `mcp/src/tools/*`, wrapped as SDK tools in `mcp/src/sdk-adapter.ts`, plus context modules. Compiled to `mcp/dist/`, which the functions import. Also has a local stdio server (`mcp/src/server.ts`) for development. |
| Shared core | `shared/` | Pure TypeScript with no I/O: week math, exercise aliases and name normalizer, estimated 1RM. Imported by the web app (through `src/utils/*` re-exports) and by `mcp/` (through thin re-export shims). `mcp`'s `tsc` compiles it to `mcp/dist/shared/`. |
| Vendored SDK | `vendor/bot-native-sdk/` | Built `dist/` of `@bot-native/sdk`, committed on purpose. It owns MCP protocol dispatch, scope checks, the skill loader, the OpenAPI export and the context-bundle builder. |
| Database | `migrations/` | Numbered SQL files, `001` to `040`. This folder is the source of truth for schema intent. `supabase/migrations/` is a stale 7-file CLI subset; do not `supabase db push` from it. The root `*.sql` files are historical dumps. |

`mobile/` (an Expo iOS app) is paused and out of scope. See [ADR-004](decisions/ADR-004-web-first-ios-paused.md).

## Web code layers

Dependencies point down. Nothing enforces this yet (there is no boundary lint rule); it is how
the code is arranged and how new code should be placed.

```
  App.jsx -> swoltracker.jsx (auth and onboarding gate) -> AuthenticatedShell -> ScreenRouter
                                         |
        screens/  components/            |   presentational: props in, markup out
            \         /                  |
             hooks/   contexts/          |   feature state and actions, optimistic writes
                  \   /
        lib/ (supabase.js db facade, repositories/*, offlineQueue, errorService, llm, push)
                    |
                 Supabase (RLS)

  utils/ and shared/   pure helpers, importable from any layer above
```

- **`src/lib/supabase.js`** builds the Supabase client and composes every repository into one
  `db` object. Callers do `db.getUserMaxes(userId)` and never write a query.
- **Repositories** (`src/lib/repositories/*`) are factories that take the client and return
  functions. Each owns a slice of tables or RPCs:

  | Repository | Owns |
  | ---------- | ---- |
  | `profiles` | profile reads and writes, onboarding fields |
  | `programs` | weekly programs (save, load, all weeks for a gym) |
  | `maxes` | 1RM records and overload recommendations |
  | `logs` | set logs, completions, missed days, training history |
  | `insights` + `insightsBuilders` | progress insights and summaries |
  | `gyms` | gym and group membership, equipment |
  | `social` | buddies, buddy requests, groups, user search |
  | `agent-chat` | Coach Board messages, read status, latest coach note, tool-call audit, `hasAgentKey` |
  | `sessionNotes` | post-workout and week session notes |
  | `adminAuth`, `appSettings`, `prompts`, `errors` | admin gate, app settings, prompt templates, error log |
  | `onboarding` | onboarding state |

- **Contexts** (`src/contexts/`) hold domain state. `SessionContext` is the auth session.
  `ProgramContext` is gym, equipment, program, start date and the week and day cursor.
  `WorkoutLogContext` is set logs, completions and missed days. `ProgramProvider` and
  `WorkoutLogProvider` mount only after the bootstrap bundle has loaded, so consumers always see
  hydrated data. Some shell state (social, maxes editing, modals) still lives in
  `AuthenticatedShell.jsx`.
- **Hooks** (`src/hooks/`) own feature behavior: `useAppBootstrap` (initial load), `useSession`,
  `useAppNavigation`, `useWorkoutLogger` (set logging, completion, missed days, offline queueing),
  `useAiGenerator` and `useExerciseSwap` (LLM flows), `useMaxesActions`, `useProfileActions`,
  `useBuddyActions`, `useAgentChat` (Coach Board), `useAgentOnboarding`, `useSimpleOnboarding`,
  `useOnboardingActions`, `useOfflineSync` and `useAdmin`.
- **Routing** uses `react-router-dom`. Tabs are `/workout`, `/maxes`, `/progress`, `/buddies`.
  Overlays are `/settings` and `/admin`. `/onboarding` is the gate. Paths live in
  `src/lib/routes.js` and `useAppNavigation` maps URL to tab. The week and day cursor and the
  Coach Board panel are React state, not URLs. The PWA `start_url` is `/workout`.
- **Styling** is Tailwind utility classes on a dark zinc palette (`bg-zinc-900` and `bg-zinc-800`
  cards, `rounded-xl` to `rounded-3xl` corners, `text-orange-500` and orange-to-red gradients as the brand accent, cyan and teal for
  anything that belongs to the AI agent). There are no custom theme tokens yet; `src/index.css`
  only imports Tailwind and adds safe-area helpers for iPhone standalone mode.

The admin panel (`/admin`, gated by the `is_admin` RPC) has four tabs: dashboard stats, API and
provider settings, prompt-template editor and error logs. Icons come from `lucide-react` and the
PR confetti from `canvas-confetti`.

## Request flow: browser user

```
Google sign-in (Supabase Auth) -> SessionContext
  -> useAppBootstrap: wave 1 (profile, buddies, maxes, gyms, unread coach notes, agent key)
                      wave 2 (equipment, programs, last 8 weeks of set logs, completions, missed days)
  -> ProgramProvider / WorkoutLogProvider hydrate from the bundle
user action (tap a set) -> hook updates UI optimistically
  -> db.logSet -> repository -> supabase-js (anon key + user JWT) -> Postgres, RLS decides
  -> on failure: roll the UI back, reportWriteFailure (error_logs row + toast)
  -> on a network failure: the write goes to the offline queue instead (see below)
```

Bootstrap loads set logs for the most recent 8 calendar weeks only. Completions and missed days
load in full because the rows are small and Progress totals need them. Moving the week cursor
outside the loaded window fetches that range on demand (`WorkoutLogContext`, `src/lib/bootstrapLogs.js`).
Screens and modals are lazy-loaded on first open, and `vite.config.js` splits React and
Supabase/Zod into stable vendor chunks.

## Request flow: external AI agent over MCP

```
agent (Claude Desktop, Hermes, OpenClaw, any MCP client)
  POST /api/mcp   Authorization: Bearer swol_<key>
    -> api/mcp.js
       1. authenticateMcpRequest: SHA-256 the key, look up api_keys (key_hash), reject missing
          or revoked keys, read the key's scopes, stamp last_used_at
       2. overall limit: 500 requests per hour per user (check_rate_limit RPC)
       3. tools/call only: per-tool limit, then per-category limit (query and meta 500/h,
          action and edit 100/h; save_workout_program and generate_workout_program 20/h,
          rebuild_week_for_constraints 10/h, bulk_log_workout 30/h, send_coach_message 50/h,
          complete_onboarding 5/h, update_profile 60/h)
       4. buildApp(serviceRoleClient, { callLlm }) from mcp/dist/mcp/src/sdk-adapter.js
       5. SDK executeToolWithGuards: the tool's required scopes must all be on the key
          (a missing scope returns a forbidden error; no scopes means deny)
       6. the tool runs with the authenticated user id bound into its closures
       7. finally: a tool_call_audit row (tool name, SHA-256 of the args, ok, error text)
    -> Supabase, service role, every query filtered by that user id
```

The endpoint is stateless: each request builds a fresh MCP server and transport. Because the
service role bypasses RLS, **the tools are the authorization layer**. Every tool takes the user id
from the key, never from its arguments, and gym writes go through `resolveGymId` (membership
check) or `resolveWritableGymId` (membership plus an `owner` or `leader` role in
`gym_members`, so a group member cannot overwrite the shared program). Tests in `mcp/src/__tests__` pin this (`idor-guards`,
`scope-enforcement`, contract tests per tool family).

Scopes are `read`, `write:logs`, `write:program` and `coach`, declared per tool in
`sdk-adapter.ts`. Of the 43 tools, 24 need `read`, 12 need `write:logs`, 4 need `write:program`,
1 needs `coach` (`send_coach_message`), and 2 meta tools (`normalize_exercise_name`,
`list_canonical_exercises`) need none. Keys are created by the `create_api_key` RPC: the raw key
is shown once, only its hash is stored, a user can hold at most 5 active keys, and new keys carry
all four scopes unless the caller asks for fewer.

Sibling endpoints:

| Endpoint | Auth | Purpose |
| -------- | ---- | ------- |
| `POST /api/mcp` | bearer `swol_` key | The MCP server (Streamable HTTP). |
| `GET/POST /api/mcp/context` | bearer key with `read` | One-call context bundle, 2000-token budget, seven priority-ranked modules (`current_program`, `recent_logs`, `maxes`, `streak`, `unread_coach_notes`, `gym_equipment`, `upcoming_deload`). |
| `GET /api/mcp/skill` | none | `SKILL.md` as markdown, or JSON with parsed frontmatter when `Accept: application/json`. |
| `GET /api/mcp/openapi` | none | OpenAPI 3.1 document generated from the registered tools' Zod schemas and scopes. The tool shapes are not sensitive; calls still need a key. |

`SKILL.md` is the contract an agent reads first. The SDK loads it when `buildApp()` runs, which
is why every function that builds the app must bundle it (see "Operational rules" below).

Events (`workout.completed`, `workout.missed`, `workout.reminder`, `max.updated`,
`milestone.hit`, `program.saved`) are rows in `app_events`. Agents pull them with
`get_pending_events`, which marks them consumed. `app_events` and `agent_messages` are in the
`supabase_realtime` publication.

## LLM flow

The browser never holds a provider key. In-app generation (first program, weekly program, exercise
swap) goes through `src/lib/llm.js` to `POST /api/llm`:

```
browser -> generateWithLlm (65 s client timeout, friendly error mapping, logs to error_logs)
  -> POST /api/llm  Authorization: Bearer <user JWT>
     1. body check (provider, systemPrompt, userPrompt); 413 if a prompt is over 80,000 bytes
        or the pair is over 120,000 bytes (api/_llm-guard.js)
     2. provider config and key from env; if the chosen provider has no key, fall back in the
        order openai, claude, gemini, openrouter; if none, 500
     3. auth is mandatory: the JWT is verified with Supabase, no anonymous path
     4. 20 generations per user per day (check_rate_limit, 'ai_generation')
     5. model by request type (onboarding, weekly, swap) from api/_llm-core.js, optionally
        overridden by the app_settings row llm_model_<provider>
     6. call the provider: 270 s timeout, up to 2 retries with exponential backoff, no retry on
        auth errors or timeouts; max_tokens 8000 for weekly, 4000 otherwise
     7. log_api_usage on success and on failure (server-side, so usage is recorded even if the tab closes)
  -> { content, usage, model, provider } back to the browser, raw provider errors never returned
```

The active provider is the `llm_provider` row in `app_settings`, changed by an admin in the admin
panel. Prompt templates live in `prompt_templates` and are edited in the same panel. The MCP
endpoint reuses the same dispatch (`callLlmInternal` in `api/_llm-core.js`) so tools such as
`rebuild_week_for_constraints` and `bulk_log_workout` can call a model server-side. Provider
configs, including model names, are in `api/_llm-core.js`; treat that file as the source. As of
2026-09-30 it maps request types to these models (the `llm_model_<provider>` setting overrides
them):

| Provider | `onboarding` | `weekly` | `swap` |
| -------- | ------------ | -------- | ------ |
| openai | `gpt-4o-mini` | `gpt-4o` | `gpt-4o-mini` |
| claude | `claude-3-haiku-20240307` | `claude-3-5-sonnet-latest` | `claude-3-haiku-20240307` |
| gemini | `gemini-1.5-flash` | `gemini-1.5-pro` | `gemini-1.5-flash` |
| openrouter | `openrouter/auto` | `openrouter/auto` | `openrouter/auto` |

The MCP path defaults to `claude` when no provider is set. Typical call from web code:
`generateWithLlm(provider, systemPrompt, userPrompt, 'weekly', db, currentUser)`; passing `db` and
the user id turns on automatic error logging.
See [ADR-002](decisions/ADR-002-llm-calls-through-api-llm.md).

## Push and reminders

Opt-in web push. The service worker (`public/sw.js`) handles `push` events. The app offers the
opt-in prompt once, after the user's second completed workout, and Settings has a single "Workout
reminders" toggle. `src/lib/push.js` talks to `POST /api/push` (`subscribe`, `unsubscribe`, `test`),
which authenticates with the user JWT and writes `push_subscriptions`. The endpoint also accepts
`update-prefs`, but no UI calls it yet, so every user has the column defaults. The
VAPID private key is only in the `VAPID_PRIVATE_KEY` environment variable; the public key is in
the client. Dead subscriptions (HTTP 404 or 410) are deleted on send.

A Vercel cron (`vercel.json`, `0 22 * * *`, so 22:00 UTC) calls `GET /api/cron/reminders`, guarded
by `Authorization: Bearer $CRON_SECRET`. For each subscribed user it computes the current week from
`program_start_date`, reads today's planned day, and the pure `reminderDecision`
(`api/_reminders.js`, unit-tested) skips opted-out users, rest days, completed or already-logged
days, days marked missed, users already reminded today, and quiet hours (default 22 to 8). One
reminder per user per day is enforced by `push_subscriptions.last_reminded_on`.

## Offline queue

Set logs, workout completions, unmarks and missed-day writes can be queued when the network is
down (`src/lib/offlineQueue.js`, executed by `src/lib/offlineWrites.js`, driven by
`src/hooks/useOfflineSync.js`). The queue is in `localStorage` under `swoltracker-offline-queue`.
Each write has an idempotency key (for a set: user, gym, week, day, exercise index, set index), and
the last write per key wins. `decideWriteOutcome` returns `ack`, `queue` or `fail`: network errors
and an offline browser queue the write, a hard database error fails it so it cannot block later
sets. The queue flushes on the `online` event, when the tab becomes visible, and on mount, and a
banner shows the pending count.

## Error handling

- **`src/lib/errorService.js`** defines `ErrorCategory` (`llm`, `database`, `parsing`, `avatar`,
  `auth`, `network`, `unknown`), `ErrorSeverity` (`warning`, `error`, `critical`), the
  user-facing message table, `logError(db, {...})` (console plus an `error_logs` row through
  `db.logError`, never throws) and `reportWriteFailure({...})`, which logs and shows a toast in one
  call. Use `reportWriteFailure` on every user-facing write path.
- **Toasts** come from `ToastProvider` and `useToast()` in `src/components/Toast.jsx`:
  `toast.success`, `.error`, `.warning`, `.info`.
- **Shape of a call:**

  ```javascript
  await logError(db, {
    category: ErrorCategory.DATABASE,   // llm, database, parsing, avatar, auth, network, unknown
    severity: ErrorSeverity.ERROR,      // warning, error, critical
    message: 'Human-readable description',
    userId, component: 'useWorkoutLogger.js', operation: 'logSet',
    originalError: error, context: { week, day },
  });
  // or, on a write path, log and toast in one call:
  await reportWriteFailure({ db, toast, userId, component, operation, message });
  ```

- **Database helpers** behind the admin viewer: `db.logError`, `db.getErrorLogs({ limit, offset,
  category, severity, resolved })`, `db.getErrorStats`, `db.resolveError(id, notes)`,
  `db.cleanupOldErrors`.
- **Optimistic writes roll back.** Hooks snapshot state, update the UI, and restore the snapshot
  if the repository returns a failure value (`null` or `false`) or throws.
- **Admin visibility.** The admin panel's error-log tab filters by category, severity and resolved
  state, shows stack traces and context, resolves entries, and cleans up resolved entries older
  than 30 days.
- **Server side.** `api/_sentry.js` and `src/lib/sentry.js` are no-ops unless `SENTRY_DSN` or
  `VITE_SENTRY_DSN` is set. Authorization and cookie headers are stripped before send. The LLM
  proxy maps provider failures to fixed public messages (`publicLlmError`) and never returns the
  raw provider text.
- Log the top failure points (LLM failures, AI JSON parse failures, critical writes, avatar
  upload, auth). Do not wrap everything in try/catch.

## Current-week math

`shared/week-math.ts` is the only implementation. The current program week is **Monday-aligned
and counts up without wrapping**: take `profiles.program_start_date`, move it back to that week's
Monday, count whole weeks to today's local midnight, add one, floor at 1. Week 5 is week 5, not
week 1 of a repeating cycle. `parseCalendarDate` builds bare `YYYY-MM-DD` strings in local time,
because `new Date("2026-03-30")` is a UTC instant and lands on the previous day in US time zones;
that bug was fixed twice before the math was moved here. Web (`src/utils/date.js`) and MCP
(`mcp/src/week-calc.ts`) re-export it, and `shared/__tests__/parity.test.ts` runs the same fixtures
through both paths. The reminder cron imports the compiled copy from `mcp/dist/shared/`.

## Coach Board

Asynchronous notes between the user and their AI agent, stored in `agent_messages`
(`role` is `user` or `agent`; `message_type` is `chat`, `weekly_review`, `program_update` or
`milestone`; content is capped at 5000 characters; optional `week_number` and JSONB `metadata`).
`agent_read_status` tracks when the user last read.

- **Entry points:** the Bot button in the header (with an unread badge) and the always-on
  `CoachBoardEntry` on the workout screen open the slide-up `AgentChatPanel`. `CoachNoteCard` shows
  the latest weekly review or program update on the workout screen.
- **Writes:** the agent posts with `send_coach_message` (scope `coach`). The user posts through
  `db.sendUserMessage`. Both go through the `send_agent_message` RPC, which validates length and
  type.
- **Live updates:** `useAgentChat.js` subscribes to Realtime INSERTs on `agent_messages` filtered
  to the user, so agent notes appear without a refresh.
- **Rendering:** `FormattedText` in `AgentChatPanel.jsx` turns literal `\n` into line breaks and
  `**bold**` into bold. Weekly reviews render as green-accented cards, program updates as
  orange-accented cards.
- **Helpers:** `db.getAgentMessages(userId, limit, beforeId)`, `db.sendUserMessage`,
  `db.deleteAgentMessage` (user messages only), `db.hasUnreadAgentMessages`,
  `db.markAgentMessagesRead`, `db.getLatestCoachNote` (latest `weekly_review` or
  `program_update`) and `db.hasAgentKey` (the user has an active API key).
- **Post-workout prompt:** `PostWorkoutCoachPrompt` offers quick chips and free text after a
  workout, sent to the agent, and session notes persist in `session_notes` so the agent can read
  them through `get_training_history_summary` and the context bundle.
- **Weekly review loop:** Settings has a copy-paste prompt ("Weekly Review Cron") for the user's
  own agent: call `get_training_history_summary`, `get_overload_recommendations`,
  `generate_weekly_summary` and `get_streak`, post a `weekly_review` note, and if the program
  needs changes, `save_workout_program` plus a `program_update` note.

## Agent onboarding

Onboarding is agent-first. The Connect screen calls `create_api_key` with all four scopes, shows
the key and an MCP config snippet once, and the Confirm screen polls the profile and equipment
while the user's agent interviews them and calls `update_profile` and `complete_onboarding`. When
`onboarding_completed` flips, the app re-runs bootstrap (no page reload). "No agent? Set up
manually" switches to `SimpleOnboarding`: grouped forms, then a first program from the built-in
LLM path.

## Data model

All tables have RLS on. Schema history is in `migrations/`; the tables the app uses today:

| Table | Holds |
| ----- | ----- |
| `profiles` | one row per `auth.users` user; onboarding fields, `program_start_date`, display name, avatar |
| `gyms`, `gym_members`, `gym_equipment` | a gym is a personal training space or a workout group; `gym_members.role` is constrained to `owner`, `admin`, `member`; the app's `leader`, `member` and `independent` group roles are derived by the `get_group_role` RPC; equipment per gym |
| `user_maxes` (view `current_user_maxes`) | 1RM records with history; the view returns the current value per lift |
| `workout_programs` | one row per `(gym_id, week_number)`, the week's program as JSONB keyed by day name |
| `workout_logs` | one row per set, unique on `(user_id, gym_id, week_number, day_name, exercise_index, set_index)` |
| `workout_completions` | a day marked done, with `completion_type` (`full` or `partial`) and logged and planned set counts |
| `missed_days` | days skipped on purpose, with a reason |
| `session_notes` | post-workout and week notes, unique per user, week and day |
| `buddy_requests` | buddy and group-invite relationships |
| `agent_messages`, `agent_read_status` | Coach Board |
| `api_keys` | hashed `swol_` keys with `key_prefix`, name, `scopes`, `last_used_at`, `revoked_at` |
| `tool_call_audit` | one row per MCP tool call (args are hashed, never stored) |
| `app_events` | event stream for agents |
| `push_subscriptions` | web push endpoints, preferences and `last_reminded_on` |
| `error_logs`, `api_usage_logs` | client error reports and LLM usage |
| `app_settings`, `prompt_templates`, `rate_limits` | admin settings, editable prompt templates, rate-limit counters |

Reads that would leak across users are RPCs with an identity guard (`_require_self`, or forced
`auth.uid()`), not open table access. When you write a PL/pgSQL `RETURNS TABLE` function,
table-qualify every column in the body (`br.member_id`, not `member_id`), or the output parameter
names make it ambiguous; migration 033 fixed exactly that. Test new RPCs as the `authenticated`
role, not only in the SQL editor, because a null `auth.role()` there skips some guards.

## Operational rules

- **`SKILL.md` must be bundled into every `/api/mcp*` function.** `buildApp()` loads it at boot,
  so a function that builds the app without the file throws on import. On Vercel that shows up as
  production POSTs returning 405, not a clear error. `vercel.json` must list
  `"includeFiles": "SKILL.md"` on `api/mcp.js`, `api/mcp/skill.js`, `api/mcp/openapi.js` and on any
  new function that imports the app factory. This broke production from 2026-04-22 to 2026-04-24.
- **Build order matters.** Functions import compiled output from `mcp/dist/`. The Vercel build
  command is `cd mcp && npm install && npm run build && cd .. && npm test && npm run build`, so a
  failing test blocks a deploy.
- **`main` auto-deploys** to the Vercel project `swol-tracker` through the GitHub integration.
  There is no deploy step.
- **Vendored SDK:** edit the source repo (`~/Work/bot-native-sdk`), rebuild, and re-vendor into
  `vendor/bot-native-sdk/dist/`. Never hand-edit the vendored `dist`.
- **Zod versions differ on purpose.** The web app uses Zod 4. `mcp/` uses Zod 3 because the
  vendored SDK and `@modelcontextprotocol/sdk` pin Zod 3 and validate tool schemas at the
  transport layer.
- **CORS** allows only the production origins and local Vite ports unless `ALLOWED_ORIGINS`
  (comma-separated) overrides them. Never `*`.
- **New SQL** goes in `migrations/0NN-name.sql` with the next number, is applied to production
  deliberately, and is noted in the PR.

## Testing

Vitest, Node environment, no DOM renderer. Tests sit next to their source (`*.test.js`),
in `mcp/src/__tests__` (contract tests per tool family, scope enforcement, IDOR guards, OpenAPI and
skill endpoints) and in `shared/__tests__` (web and MCP parity). Hooks and components are kept
testable by moving decisions into plain modules (`src/lib/*`, `src/utils/*`) that have no React
imports. CI runs lint, tests and build, plus Knip (unused files, exports and dependencies).
