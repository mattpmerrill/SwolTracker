# @bot-native/sdk (vendored)

This is a vendored build of `@bot-native/sdk` from
`github.com/get-latest/bot-native-sdk`, pinned to commit `1de4759`
(Phase 4.4 OpenAPI export: `buildOpenApiDocument()` +
`zod-to-json-schema` inlining + per-tool scopes on `security[]`
and `x-required-scopes`).

**Source of truth:** `~/Work/bot-native-sdk/packages/sdk`

**Refresh procedure** (when SDK updates land):

```bash
cd ~/Work/bot-native-sdk && npm run build:sdk
rm -rf /Users/Joi/Work/SwolTracker/vendor/bot-native-sdk/dist
cp -R packages/sdk/dist /Users/Joi/Work/SwolTracker/vendor/bot-native-sdk/
find /Users/Joi/Work/SwolTracker/vendor/bot-native-sdk/dist -name "*.map" -delete
find /Users/Joi/Work/SwolTracker/vendor/bot-native-sdk/dist -name "*.js" \
  -exec sed -i '' -e '/^\/\/# sourceMappingURL=/d' {} \;
```

Sourcemaps are stripped and the `//# sourceMappingURL=` references are
removed from the emitted `.js` files — both point at source paths under
`~/Work/bot-native-sdk/` that don't exist in this repo, and Vitest
warns about them otherwise. Agents debugging SDK internals should
reach for the source repo directly.

Update `version` in the vendored `package.json` to match the new SDK
commit, then run `npm install` in SwolTracker to refresh the lockfile.

**Why vendored?** The SDK is a private workspace package not yet on
npm. `file:` deps don't survive Vercel deploys. Vendoring the built
artifact keeps imports honest (`from '@bot-native/sdk'`) while the
publishing story is figured out. Swap this for a published package
once the SDK ships.
