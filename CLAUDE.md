Read [AGENTS.md](AGENTS.md) first. It is the contract for this repo. Then
[docs/architecture.md](docs/architecture.md) for how the parts connect, and
[docs/status.md](docs/status.md) for current state and known gaps.

Claude-specific notes:

- Verify before you say done: run `npm run lint`, `npm test`, `npm run build`,
  `cd mcp && npm run build` and `npm run knip`, and say which you ran. If a UI change was not
  viewed in a browser, say so.
- `main` deploys to production on push. Work on a branch and open a pull request. Stage specific
  files, never `git add -A`.
- Never print or commit `.env.local`, `.env.production` or `mcp/.env`. Keep keys in shell variables
  and write variable names, not values, in docs.
- Do not touch `mobile/` (paused). Do not hand-edit `vendor/bot-native-sdk/dist`; change
  `~/Work/bot-native-sdk` and re-vendor.
- After changing an MCP tool, rebuild `mcp/` (the functions import `mcp/dist`) and update
  `SKILL.md`. Any new `api/mcp*` function needs `includeFiles: "SKILL.md"` in `vercel.json`.
- Do not start a refactor inside an unrelated change. Note gaps in `docs/status.md` instead.
