# @bot-native/sdk (vendored)

This is a vendored build of `@bot-native/sdk` from
`github.com/get-latest/bot-native-sdk`, pinned to commit `c78dc01`
(Phase 2.2 structured error envelopes: `AppError` throwable + typed
`AppToolError` envelope).

**Source of truth:** `~/Work/bot-native-sdk/packages/sdk`

**Refresh procedure** (when SDK updates land):

```bash
cd ~/Work/bot-native-sdk && npm run build:sdk
rm -rf /Users/Joi/Work/SwolTracker/vendor/bot-native-sdk/dist
cp -R packages/sdk/dist /Users/Joi/Work/SwolTracker/vendor/bot-native-sdk/
```

Update `version` in the vendored `package.json` to match the new SDK
commit, then run `npm install` in SwolTracker to refresh the lockfile.

**Why vendored?** The SDK is a private workspace package not yet on
npm. `file:` deps don't survive Vercel deploys. Vendoring the built
artifact keeps imports honest (`from '@bot-native/sdk'`) while the
publishing story is figured out. Swap this for a published package
once the SDK ships.
