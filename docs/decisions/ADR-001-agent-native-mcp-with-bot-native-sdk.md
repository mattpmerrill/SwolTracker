# ADR-001: Agent-native through MCP, built on a vendored bot-native-sdk

Status: accepted (recorded 2026-09-30 from earlier work)

## Context

The product bet, written down in `docs/WEB-ARCHITECTURE-AND-GAME-PLAN.md`, is that the app is the
data store and the visual surface, and the user's own AI agent is the main source of coaching. That
needs a stable, authenticated way for an agent to read training state and write logs, programs and
coach notes. The hand-rolled MCP endpoint that came first had no scopes, no shared error shape and
no generated catalog, and its plumbing was the kind of thing a second app would need to copy.

## Decision

- Expose SwolTracker as an MCP server over Streamable HTTP at `/api/mcp`, authenticated with
  `swol_` bearer keys that are hashed at rest, scoped (`read`, `write:logs`, `write:program`,
  `coach`), rate limited and audited per tool call.
- Build the server on `@bot-native/sdk`, a separate reusable library (source in
  `~/Work/bot-native-sdk`). It owns protocol dispatch, scope enforcement, typed tool errors, the
  skill loader, the context-bundle builder and the OpenAPI export. SwolTracker keeps its tool bodies
  in `mcp/src/tools/*` and wraps them as SDK tools in `mcp/src/sdk-adapter.ts`.
- Vendor the SDK's built `dist/` into `vendor/bot-native-sdk/` and commit it. The Vercel build
  installs from this repo alone, so a local `file:` dependency outside it would not resolve.
- Publish `SKILL.md` (agent instructions), `/api/mcp/context` (one-call state bundle) and
  `/api/mcp/openapi` (tool catalog) so an agent can connect without reading the source.

## Consequences

- Agents work with any MCP client. Nothing in the web app has to change to support a new agent.
- The service role bypasses RLS on this path, so every tool must scope by the authenticated user
  id itself. Tests (`idor-guards`, `scope-enforcement`, per-family contract tests) pin this.
- SDK changes are a two-repo job: edit and build in the SDK repo, then re-vendor. Hand-editing the
  vendored `dist` is not allowed.
- The SDK and `@modelcontextprotocol/sdk` pin Zod 3, so `mcp/` stays on Zod 3 while the web app
  uses Zod 4. Sharing one schema between web writes and MCP tools is blocked until that moves.
- `SKILL.md` has to be bundled into every function that builds the app (`includeFiles` in
  `vercel.json`), or production returns 405.
