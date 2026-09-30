# AGENTS.md

The contract for anyone (person or coding agent) changing this repo. It is self-contained. When a
rule here conflicts with a habit, the rule wins. Vocabulary: **MUST** / **MUST NOT** are
non-negotiable; **SHOULD** needs a written reason to skip.

**An honest note on the code.** SwolTracker grew quickly, and some of it predates these rules. The
web app is JavaScript, a few components and hooks are large, and a few callers break the
data-access rule. The known gaps are listed in [docs/status.md](docs/status.md), and a refactor is
planned as its own project. Until then the rules apply to **all new and changed code**: do not copy
an old pattern just because it is nearby, and do not start a drive-by refactor inside an unrelated
change.

## Before you write code

- Read [docs/architecture.md](docs/architecture.md), the [ADRs](docs/decisions/) and
  [docs/status.md](docs/status.md).
- Match the surrounding code. Put new code where it belongs; do not restructure to make a change
  fit.
- Do not change the framework, package manager, test framework or validation library as a side
  effect. That needs an ADR.
- Do not convert web files from JavaScript to TypeScript as part of another change. New pure logic
  that both the web app and the MCP server need goes in `shared/` (TypeScript).
- Read the real code before you trust a doc. Older plan docs in the repo root and in `docs/` are
  history, and parts of them are stale.

## Non-negotiables

- **Data access.** On the web side, the database is reached only through `src/lib/repositories/*`
  (composed into `db` in `src/lib/supabase.js`). Components, screens and hooks call `db.*`; they
  never build a query, call `.from()` or `.rpc()`, or open a Realtime channel directly. A new table
  or RPC gets a repository function and a test.
- **No business logic in UI.** Not in components or screens. Pure logic (week math, PR detection,
  write outcomes, summaries) lives in `src/lib`, `src/utils` or `shared/`, has no React imports,
  and has unit tests. A hook may orchestrate state and call those functions; it should not contain
  the rules.
- **One owner per concept.** One module owns a concept's type, values and rules; everything else
  imports it. Week math, exercise aliases and estimated 1RM live in `shared/`. Do not re-declare a
  copy in `src/` or `mcp/src/`. Scopes are declared in `mcp/src/sdk-adapter.ts` and nowhere else.
- **Zod at every trust boundary.** Forms, API request bodies, MCP tool inputs, LLM output and
  environment variables are validated at runtime with a schema. A type or a hand-rolled `if` is not
  validation. Web schemas live in `src/lib/validation.js`; MCP tool inputs are Zod schemas on the
  tool definition.
- **RLS is authoritative.** Every table has RLS and policies. Functions that take a user id use an
  identity guard (`_require_self` or a forced `auth.uid()`). An access change ships a test that pins
  it (see `mcp/src/__tests__/idor-guards.test.ts`). Test new RPCs as the `authenticated` role, not
  only in the SQL editor. In PL/pgSQL `RETURNS TABLE` functions, table-qualify every column.
- **MCP tools are the authorization layer.** The MCP endpoint uses the Supabase service role, which
  bypasses RLS. Every tool MUST take the user id from the authenticated key (never from its
  arguments), scope every query by it, check gym membership before touching a gym, and declare its
  scope (`read`, `write:logs`, `write:program` or `coach`) in `sdk-adapter.ts`. A tool that writes a
  shared program MUST also pass the gym write check (`isGymWriter` in `mcp/src/tools/queries.ts`),
  so members can log sets but never overwrite the leader's program. A tool that changes the tool list
  or its inputs also updates `SKILL.md`.
- **Secrets stay server-side.** LLM provider keys, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`
  and `CRON_SECRET` are read only in `api/` and `mcp/`, never imported into `src/`. `VITE_` means
  public and ships to every browser. LLM calls from the browser go through `/api/llm`. Never commit
  `.env*` or `.claude/settings.local.json`, never put a credential in tracked tool config
  (`.mcp.json`, `.claude/`), and never log a key, a token or a user's personal data. Write only the
  names of variables in docs, never values.
- **Errors are handled, not swallowed.** Use the existing framework: `src/lib/errorService.js`
  (`logError`, `reportWriteFailure`, the `ErrorCategory` and `ErrorSeverity` constants) and toasts
  from `useToast()`. Every user-facing write path reports failure and rolls back its optimistic
  update. Never show users a stack trace, SQL or a raw provider message. Do not add an empty
  `catch`.
- **Operational rule for MCP functions.** Every function under `api/mcp*` that builds the app MUST
  have `"includeFiles": "SKILL.md"` in `vercel.json`. `buildApp()` loads `SKILL.md` at boot; without
  the file the function throws on import and Vercel answers 405. This caused a production outage
  from 2026-04-22 to 2026-04-24.
- **Vendored SDK.** `vendor/bot-native-sdk/dist` is a build artifact. Change the source repo
  (`~/Work/bot-native-sdk`), rebuild, and re-vendor. Never hand-edit the vendored files.
- **Migrations.** New SQL goes in `migrations/0NN-name.sql` using the next number. `migrations/` is
  the source of truth; do not use `supabase/migrations/` or the root `*.sql` dumps. Apply to
  production deliberately and say so in the PR.
- **Styling.** Tailwind utility classes on the existing palette (zinc surfaces, orange and red
  accent, cyan and teal for the AI agent). A color, radius or shadow that repeats belongs in an
  `@theme` token in `src/index.css`, not as an arbitrary hex value in a component.
- **Accessibility and states.** Semantic HTML, keyboard reachable controls, visible focus,
  labels on icon-only buttons, honor `prefers-reduced-motion`. Every screen handles loading, empty
  and error.
- **External calls.** Timeout every one, retry only idempotent transient operations with bounded
  backoff, make writes idempotent.
- **Git.** `main` deploys to production on push. Work on a branch, open a pull request, and merge
  only when the Test and Knip workflows are green.

## Project: SwolTracker

**Purpose.** A workout tracker for lifters that generates multi-week programs, bases weights on
your 1RMs with progressive overload, and lets you bring your own AI agent over MCP to log sets,
write programs and leave coaching notes. Live at https://swol-tracker.vercel.app. It doubles as a
public portfolio project, so structure, tests and docs should be clear.

**Stack.** React 18 and Vite (JavaScript, JSX), Tailwind CSS v4, `react-router-dom`, Supabase
(Postgres, Auth, RLS, Realtime), Vercel serverless functions in `api/`, a TypeScript MCP package in
`mcp/`, pure TypeScript in `shared/`, the vendored `@bot-native/sdk`, Zod, Vitest, ESLint, Knip,
GitHub Actions, npm. `mobile/` (Expo) is paused and out of scope.

**File map**

| Path | What it holds |
| ---- | ------------- |
| `src/` | The web app: `screens/`, `components/`, `hooks/`, `contexts/`, `lib/`, `utils/`, `constants/` |
| `src/lib/repositories/` | The only place web queries are built; composed into `db` by `src/lib/supabase.js` |
| `src/lib/errorService.js` | Error categories, logging, `reportWriteFailure` |
| `src/lib/validation.js` | Zod schemas for web forms |
| `src/lib/llm.js` | Browser client for `/api/llm` |
| `src/lib/offlineQueue.js`, `offlineWrites.js` | Offline write queue |
| `src/utils/` | Pure helpers; `date.js` and `e1rm.js` re-export `shared/` |
| `api/` | Vercel functions: `llm.js`, `mcp.js`, `mcp/*`, `push.js`, `cron/reminders.js`; `_*.js` are helpers |
| `mcp/src/tools/` | MCP tool bodies by family: queries, actions, context, generation, coaching, natural-language, onboarding |
| `mcp/src/sdk-adapter.ts` | Registers the 44 tools with names, schemas, categories and scopes |
| `mcp/src/__tests__/` | MCP contract, scope, IDOR, OpenAPI and skill tests |
| `shared/` | Pure logic used by web and MCP: week math, exercises, estimated 1RM |
| `vendor/bot-native-sdk/` | Vendored SDK build; see the rule above |
| `migrations/` | Numbered SQL, source of truth for the schema |
| `public/` | PWA manifest, icons, service worker |
| `SKILL.md` | The contract an AI agent reads first; served at `/api/mcp/skill` |
| `docs/` | Architecture, decision records, status, screenshots |
| `mobile/` | Paused Expo app; do not touch |

**Vocabulary.** Use these words in code, UI and docs.

- **Gym**: a training space that owns equipment and programs. Every user has a personal one;
  a workout group shares its leader's.
- **Program**: a week-by-week plan stored per gym as JSON keyed by day name.
- **Program week**: the 1-based week counted from `program_start_date`, Monday-aligned, no wrap.
- **Max (1RM)**: a recorded one-rep max for a lift. **Estimated 1RM** is the Epley estimate from a
  logged set. An **estimated PR** is one that clears the recorded max by the margin in `shared/e1rm.ts`.
- **Set log**: one performed set with actual weight and reps.
- **Completion**: a day marked done, `full` or `partial`. A **missed day** is skipped on purpose.
- **Overload recommendation**: a progression flag for a lift (ready to increase, deload, stale).
- **Coach Board**: the asynchronous note thread between the user and their agent.
- **Agent**: the user's own AI, connected with an API key.
- **API key**: a `swol_` bearer key, hashed at rest, carrying scopes. **Scope**: one permission on
  a key.
- **Leader / member**: roles in a workout group. A member logs sets against the leader's program
  and cannot overwrite it.

**Commands** (run with npm from the repo root)

| Command | What it does |
| ------- | ------------ |
| `npm run dev` | Vite dev server (http://localhost:5173) |
| `npm run build` | Production web build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Vitest, all suites (web, `api/`, `mcp/src`, `shared/`) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint` | ESLint on `src` and `api` (0 errors required; 17 known warnings) |
| `npm run knip` | Unused files, exports and dependencies |
| `cd mcp && npm run build` | Compile `mcp/` and `shared/` to `mcp/dist/` (functions import this) |
| `cd mcp && npm run dev` | `tsc --watch` |
| `cd mcp && npm start` | Local stdio MCP server (needs `mcp/.env`; no auth or scopes, dev only) |
| `npm run screenshots` | Regenerate `docs/screenshots/` from the demo account (see README) |
| `npm run demo:seed` | Seed the demo account with fake data (see README; needs `--yes`) |

The Vercel build runs `cd mcp && npm install && npm run build && cd .. && npm test && npm run build`,
so a failing test blocks a deploy.

**Testing philosophy.** Test what can break in ways that matter: pure logic (week math, e1RM,
write-queue decisions, reminder decisions, summaries), repositories against a mock client, MCP tools
(contract tests per family, scope enforcement, IDOR guards), and anything that pins an access rule.
Tests run in Node without a DOM renderer, so keep decisions in plain modules and keep components
thin. Do not write trivial tests that restate the code. A bug fix ships a regression test that
failed before the fix.

**Comment philosophy.** Explain why, not what. If a comment restates the next line, delete it.
Name the constraint, the trade-off or the surprise (the calendar-date comment in
`shared/week-math.ts` is the model).

**Definition of Done.** All of these pass after your last edit: `npm run lint` (0 errors, and no
new warnings), `npm test`, `npm run build`, `cd mcp && npm run build`, and `npm run knip`. Required
tests exist, no secret is exposed, and docs are updated when behavior, tools or env vars changed.
Say what you ran and what you could not run, and say when a UI change was not looked at in a
browser.
