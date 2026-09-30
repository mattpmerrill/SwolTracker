# ADR-003: Repositories are the web app's data-access layer

Status: accepted (recorded 2026-09-30 from earlier work)

## Context

Early on, data access lived in two large files (`workouts.js` at about 780 lines, and an admin
file) next to a 1,000-line root component. Every change touched everything, and there was nothing
small enough to test. The 2026-04-19 structural pass split them, and the July 2026 architecture
review listed the result as a strength to keep.

## Decision

- Web code reaches Supabase only through `src/lib/repositories/*`. Each file is a factory that
  takes the client and returns plain async functions for one slice (profiles, programs, maxes,
  logs, insights, gyms, social, agent chat, session notes, admin, settings, prompts, errors,
  onboarding).
- `src/lib/supabase.js` composes every repository into one `db` object, so callers write
  `db.getUserMaxes(userId)` and import paths stay stable when a repository is split.
- Screens and components never build a query. Pure decisions (week math, PR detection, offline
  write outcomes, squad status) live in plain modules under `src/lib`, `src/utils` and `shared/`.
- Repositories return value-level failures (`null`, `false`, `[]`) after logging, and callers decide
  whether to roll back and show a toast.

## Consequences

- A repository can be tested with a mock client (`src/test/mockSupabase.js`), and a query change
  has one home.
- The rule is not fully met yet. A few callers still use the raw client: API-key management in
  `SettingsModal.jsx` and `useAgentOnboarding.js`, and the Realtime subscription in
  `useAgentChat.js`. `docs/status.md` tracks them.
- Returning `[]` or `null` on error keeps callers simple but hides the cause from them. New code
  that needs to tell "empty" from "failed" should return an explicit result.
- The MCP package has its own tool factories (`mcp/src/tools/*`) and is not part of this layer.
