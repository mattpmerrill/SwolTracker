# Chad's check-in worker (Temporal)

This package is the Temporal **worker** for Chad's weekly check-in. Design and reasoning are in
[ADR-006](../docs/decisions/ADR-006-temporal-chad-checkins.md); the names and shapes shared with the API
are in [`shared/checkin-contract.ts`](../shared/checkin-contract.ts). Read the contract header first.

What it does: one long-lived workflow per user (`coach-<userId>`) sleeps until Sunday 18:00 in the
user's time zone, reviews the week, drafts changes, pushes a notification, waits for the user to
approve, reminds on Monday 07:00 and expires the proposal on Monday 23:59. Every morning at 09:00 it
also checks for yesterday's unlogged workout and offers to move it.

The worker **only orchestrates**. It holds no database, model or push credentials: every side effect is
an HTTP call to `/api/checkin-worker` on the Vercel app, authenticated by a shared secret.

## Where each Temporal idea lives

| Concept | File | What to look at |
| --- | --- | --- |
| Workflow (deterministic, replayed) | `src/workflows/coachLoop.ts` | The `for (;;)` loop is the whole schedule |
| Durable timers | `coachLoop.ts` | `condition(fn, ms)`: sleep until the earliest of five deadlines, or until a signal or update wakes it |
| Signals | `coachLoop.ts` | `setEnabled`, `dayMissed`: fire and forget, queued while the worker is off |
| Updates + validators | `coachLoop.ts` | `decideCheckin`, `answerMissedDay`: the validator rejects a stale id or a double tap before it enters history; the handler runs an activity and returns its result |
| Query | `coachLoop.ts` | `getState`: read-only peek (used by `npm run dev:state`) |
| Activities | `src/activities.ts` | One generic `callWorkerApi`; every op is a typed wrapper |
| Retry policy | `coachLoop.ts` (`RETRY`, `decisionAct`, `draftAct`) | 2 s, x2, capped at 1 min, 5 attempts. The model call gets 3 attempts; apply and skip get 1 s, x2, 3 attempts so they finish inside the API's ~15 s Update wait |
| Retryable vs permanent failures | `activities.ts` (`failureForResponse`) | 400/403/404/409 are `ApplicationFailure.nonRetryable` with a contract type; 401, a bare 404 and a JSON 500 are non-retryable configuration failures (`Unauthorized`, `Misconfigured`); 5xx and network errors are plain `Error` |
| Trust boundary | `src/schemas.ts` | Zod checks every 200 body against the contract (`BadResponse` if not) and the environment |
| Failure handling in an Update | `coachLoop.ts` (`rethrowForUpdate`) | Permanent answers are rethrown typed, temporary ones unwrapped, so the API can tell a refusal (409) from an outage (503) |
| Continue-as-new | `coachLoop.ts` (end of the loop) | New history after each resolved check-in, carrying the open state |
| Data converter + payload codec | `src/config.ts`, `../shared/temporal-codec.ts` | AES-GCM encryption of every payload, on only when `CHECKIN_CODEC_KEY` is set |
| Failure converter | `src/failure-converter.cjs` | Encrypts failure messages too (`encodeCommonAttributes`) |
| Worker, connection, shutdown | `src/worker.ts` | Local vs Cloud connection, graceful shutdown on SIGINT/SIGTERM |
| Locks, one per open item | `coachLoop.ts` (`checkinLock`, `offerLock`) | A decision in flight blocks a second one and the loop's own expiry; the loop ignores that item's deadlines meanwhile (otherwise it spins) |
| Time-skipping tests | `test/coachLoop.test.ts` | A whole week in seconds, with mocked activities |
| Replay test (determinism guard) | `test/replay.test.ts`, `test/fixtures/` | Recorded histories must still replay against the current code |
| Activity tests | `test/activities.test.ts` | `MockActivityEnvironment`: status mapping, envelope, no secret leaks |

What the loop does when something fails: the data answers (`BadRequest`, `NotEligible`, `NotFound`,
`Conflict`) are final, so the loop moves on. Everything else (an outage, a wrong secret, a missing
route, a malformed 200) leaves the open item in place and tries again after a 5 minute cooldown.

Rules for workflow code (it runs in a sandbox and is replayed): no `Date` beyond `Date.now()`, no
`Intl`, no randomness, no Node APIs, no network. All wall-clock math ("next Sunday 18:00 in this user's
zone") happens in the `schedule` activity and comes back as ISO timestamps. If you change the workflow
in a way that is incompatible with running workflows, the replay test fails; fix it with `patched()`
or Worker Versioning, not by re-recording the fixture.

## Run it locally

You need three things running, plus a user who is eligible (rollout `admin`, you are the admin, you
own a program).

```bash
# 1. Temporal dev server (UI at http://localhost:8233)
temporal server start-dev

# 2. The app with the worker API (from the repo root). Needs CHECKIN_WORKER_SECRET in its env.
cd mcp && npm run build && cd ..      # api/ imports mcp/dist
vercel dev

# 3. The worker (this folder)
cd worker
cp .env.example .env                  # fill SWOLTRACKER_API_URL and CHECKIN_WORKER_SECRET
npm install
npm run dev
```

Requires Node 22.9 or newer (`engines` in `package.json`; `--env-file-if-exists` needs it).

Leave `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_API_KEY` and `CHECKIN_CODEC_KEY` empty for
local development: the worker connects to `localhost:7233` in namespace `default`, and payloads stay
readable in the Temporal UI. For the API (`vercel dev`) set `TEMPORAL_ADDRESS=localhost:7233` and
`TEMPORAL_NAMESPACE=default` so the toggle appears.

Turn the toggle on in Settings, or start a workflow from the terminal with the dev scripts below.

## Dev scripts

All take the user id (a Supabase auth user id) and read `worker/.env`. `dev:start-loop` prints a link to the Temporal UI; set `TEMPORAL_UI_URL` if it is not `http://localhost:8233`.

| Command | What it does |
| --- | --- |
| `npm run dev:start-loop -- <userId>` | signal-with-start, exactly what the toggle does |
| `npm run dev:start-loop -- <userId> --fast checkin=10s,reminder=30s,expire=60s,daily=20s` | **Dev only.** Runs a whole cycle in about a minute (see below) |
| `npm run dev:state -- <userId>` | Workflow status, run id, and the `getState` Query |
| `npm run dev:send-missed -- <userId> <week> <Day>` | The `dayMissed` Signal, like marking a day missed |
| `npm run dev:decide -- checkin <userId> <checkinId> [c1,c3]` | The `decideCheckin` Update. No ids means skip the week |
| `npm run dev:decide -- offer <userId> <offerId> accept\|decline` | The `answerMissedDay` Update |
| `npm run dev:stop -- <userId> [--terminate]` | `setEnabled(false)`: expires anything open and completes. `--terminate` kills it |

### Forcing a check-in now (`--fast`)

`--fast` puts a `devFastForward` object in the workflow input. `checkin=` runs the Sunday check-in
that long after the workflow starts (once); `daily=` does the same for the 09:00 missed-day sweep;
`reminder=` and `expire=` replace the Monday 07:00 and 23:59 times of the check-in it creates.

It cannot affect production, in three layers: the API starts workflows with `{ userId }` only; the
workflow asks the `devFastForwardAllowed` activity whether it may honour the flag, and that activity
answers no when the worker runs with `NODE_ENV=production` **or** has a `TEMPORAL_API_KEY` set (the
workflow then ignores the input and logs a warning); and `dev:start-loop` refuses `--fast` when
`TEMPORAL_API_KEY` is set. Run the worker for Cloud with `npm start`, which sets `NODE_ENV=production`.
A worker started with `npm run dev` against the local dev server honours the flag; that is its purpose.

Things to know:

- It only applies when the call **starts** the workflow. If one is already running, run
  `npm run dev:stop -- <userId>` first.
- The server allows one check-in per target week, so a second forced run in the same week reuses the
  first row. Delete the `chad_checkins` row to start over.
- The real server times still land in the database row (`reminder_at`, `expires_at`); the fast
  values only drive the workflow's timers. The server's `expire` op closes the row whenever the
  workflow asks.

## Run it against Temporal Cloud

Set these in `worker/.env` (and the first four on Vercel too; the codec key and worker secret must
match on both sides):

```
TEMPORAL_ADDRESS=<namespace>.<account>.tmprl.cloud:7233
TEMPORAL_NAMESPACE=<namespace>.<account>
TEMPORAL_API_KEY=...
CHECKIN_CODEC_KEY=...        # openssl rand -base64 32
CHECKIN_WORKER_SECRET=...
SWOLTRACKER_API_URL=https://swol-tracker.vercel.app
```

Start it with `npm start` (not `npm run dev`). `npm start` sets `NODE_ENV=production`, which also
switches the dev fast-forward off; the same happens whenever `TEMPORAL_API_KEY` is set.

With `TEMPORAL_API_KEY` set the worker turns TLS on and **refuses to start without
`CHECKIN_CODEC_KEY`**, like the API client does. Payloads and failure messages then reach Temporal as
ciphertext. In the Cloud UI they show as encrypted until a codec server is added (a follow-up in the ADR).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Run the worker from source with tsx (loads `.env` if present; dev fast-forward allowed) |
| `npm start` | The same with `NODE_ENV=production` (dev fast-forward off). Use this for Cloud |
| `npm run typecheck` | `tsc --noEmit` over `src`, `test` and `../shared` |
| `npm test` | Vitest: time-skipping workflow tests, activity tests, replay. The first run downloads Temporal's test server |
| `npm run build` | Compile to `dist/` (not needed to run; handy for a future hosted worker) |
| `UPDATE_FIXTURES=1 npm test` | Re-record the replay histories (only after a compatible change) |

## Why vitest and tsx

Evidence from this package: `TestWorkflowEnvironment.createTimeSkipping` and `Worker` run fine under
vitest, because the workflow code is bundled by Temporal's own webpack step and never goes through
vite. tsx runs the worker and the dev scripts straight from TypeScript. The failure converter is a
tiny `.cjs` file because the worker `require()`s it by path on the main thread and also bundles it into
the workflow sandbox, and `require()` of a `.ts` file does not work under vitest.
