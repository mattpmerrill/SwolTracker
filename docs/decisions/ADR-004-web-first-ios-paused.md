# ADR-004: Web first, the iOS app is paused

Status: accepted (recorded 2026-09-30 from earlier work)

## Context

SwolTracker started as a web app with an iOS App Store plan (`iOS-MIGRATION-PLAN.md`). An Expo
React Native app was added in February 2026 and lives in `mobile/`. In practice the product is
used on the web, and the July 2026 architecture review recorded that decision: do not invest in
`mobile/` unless the App Store path is reopened.

## Decision

- The web app is the product. It is an installable PWA (manifest, app-shell service worker,
  safe-area handling), keeps set logging working offline through a write queue, and sends opt-in
  web push.
- `mobile/` stays in the repo, unmaintained. It is excluded from lint (`eslint.config.js`), tests
  (`vitest.config.js`) and deploys (`.vercelignore`), and no new feature work targets it.
- The backend (Supabase schema, RPCs, MCP tools) stays platform-neutral, so a native client could
  return without a backend rewrite.

## Consequences

- Effort goes to one client. Web-only agents and contributors can ignore `mobile/`, which is large
  on disk.
- iOS users get the PWA, which needs iOS 16.4 or later for push and an install to Home Screen.
- The schema and RPCs must not quietly assume the web client, since `mobile/` may come back.
- If the App Store path is reopened, treat `mobile/` as a starting point to revisit, not a working
  app.
