# ADR-006: Chad's weekly check-in runs on Temporal

Status: accepted (2026-10-31)

## Context

Chad (ADR-005) only acts when a user opens the chat. We want him to work on his own: every Sunday
evening he reviews the week that just ended, proposes a few changes to next week's program, sends a
push notification, and waits for the user to approve. If the user does not answer he sends a
reminder, and the proposal expires. Each morning he also checks for yesterday's unlogged workout
and offers to move it to a rest day.

That is a long-lived, per-user process that sleeps for days, waits on a human, must survive deploys
and crashes, and must not double-spend model calls when a step is retried. It is also the shape of
work a hands-on durable-execution project should teach: timers, signals, approval gates, retries and
metering.

## Decision

- Each user with the check-in enabled gets one long-lived Temporal workflow, `coach-<userId>`, on
  the task queue `chad-checkin`. It uses durable timers for Sunday, the daily check, the reminder
  and the expiry, and calls `continueAsNew` after each weekly cycle.
- The worker only orchestrates. Its activities are HTTP calls to `/api/checkin-worker`, authenticated
  with a bearer secret (`CHECKIN_WORKER_SECRET`). All database, model and push code stays in `api/`
  and reuses the MCP tool kit, the Chad runner and the push helper. The machine running the worker
  never holds the Supabase service-role key or the OpenRouter key. Every operation on the endpoint is
  idempotent per check-in, so an activity retry is safe and does not pay for the model twice.
- The browser talks to `/api/checkin` with the user's JWT. That endpoint is a Temporal client: it
  starts the workflow, sends signals and runs updates. The check-in card itself reads Supabase
  through RLS (`chad_checkins`, `chad_missed_offers`), not Temporal, so the app keeps working while
  the worker is offline. The workflow is the only writer of check-ins and missed-day offers, through activities (migration 044). `/api/checkin` writes the settings row and `/api/chad` writes its own metering events.
- Messages:
  - Signals for things that must never be lost and need no answer: `setEnabled` (the settings
    toggle) and `dayMissed` (the user marked a day missed).
  - Updates for apply and skip (`decideCheckin`, `answerMissedDay`), because the user needs the
    result back, and a validator can reject a stale check-in, an unknown change id or a double
    submit before it reaches history.
  - A query, `getState`, for debugging and the Temporal UI.
- Signals vs Updates when the worker is offline. A Signal is accepted by the Temporal server and
  waits in history until a worker returns. An Update needs a live worker to run its validator and
  handler, so the call can time out. We accept that for apply and skip: `/api/checkin` answers 503
  and the card says Chad is offline and to try again soon. A 503 after a timeout does not prove the
  Update did not run (it may be accepted and run when a worker returns), so the card re-reads
  `chad_checkins` / `chad_missed_offers` from Supabase after any 503 and shows what is true. Apply
  is idempotent per check-in, so a second tap is safe. We prefer an honest "try again" over claiming
  an apply we cannot confirm.
- Permanent failures inside an Update (a stale or already-closed check-in, not eligible) are rethrown
  as non-retryable `ApplicationFailure`s with a type from the contract, so `/api/checkin` can answer
  409 or 403 instead of a temporary 503. Temporary ones stay 503.
- Quiet hours. Check-in pushes intentionally do not honor the user's push quiet hours (a product
  decision). The Monday 07:00 reminder lands inside the default 22:00 to 08:00 window and is meant
  to. Do not add a quiet-hours check to `notify`.
- Wall-clock math (next Sunday 18:00, next 09:00, Monday reminder and expiry in the user's time
  zone) happens inside an activity and comes back as ISO timestamps. Workflow code only does
  `Date.now()` arithmetic, which Temporal keeps deterministic.
- Payload encryption. A small AES-GCM payload codec (`shared/temporal-codec.ts`, no dependencies)
  encrypts payload data and metadata. It is on only when `CHECKIN_CODEC_KEY` is set, so local
  development stays readable in the Temporal UI, and Temporal Cloud only ever sees ciphertext: the
  API client refuses to connect with `TEMPORAL_API_KEY` set unless the codec key is set too. The
  API client and the worker use the same codec.
- Mac-only worker for now. The worker runs on Matt's Mac against the local dev server first, then
  Temporal Cloud. When the Mac is asleep, timers fire late and Signals queue; the Sunday check-in
  arrives when the worker next runs. Hosting the worker is a follow-up.
- Rollout is controlled by the `app_settings` row `chad_checkin_rollout`: `admin` (default, Matt
  only) or `all`. The `schedule` operation checks it, so changing the value takes effect without a
  deploy. If the Temporal environment variables are missing, `/api/checkin` answers 503 and the
  toggle is hidden, so the code can merge before a Cloud account exists.
- Metering. Every operation writes a `chad_events` row (tokens, cost, attempt, duration). An
  admin-only RPC, `get_chad_usage`, feeds an admin tab with cost, approval rate and reliability.
  One run is one `run.started` event.
- Applying a proposal goes through a kit function, `apply_program_days`, that writes several days in
  one save. Each day carries the `before` it was drafted against. A day is skipped, not failed, when
  the stored day changed since the draft or the user already completed sets on it.

## Rejected

- **Vercel Workflow.** It is durable and fits Vercel, but it is newer, has less material to learn
  from, and ties the orchestration to one host. It is not the tool this project is meant to teach.
- **Cron plus a state table.** The existing reminder cron (`api/cron/reminders.js`) would cover
  "Sunday at 6 PM", but the approval wait, the reminder, the expiry, retries with backoff and a
  record of what happened would each be hand-built state machines. A cron tick also cannot wait for
  a human for a day and a half without polling.
- **Talking to Temporal from the browser.** The app reads Supabase and calls `/api/checkin`, so the
  Temporal credentials stay on the server.
- **Updates for the settings toggle.** The toggle must work with the worker off, so it is a Signal.

## Consequences

- A new moving part: a Temporal server (the dev server locally, Temporal Cloud later) and a worker
  process. Usage is roughly 40 actions per user per week, which is cents a month on Cloud.
- With the worker on one Mac, check-ins are only as available as that Mac. Users see a friendly 503
  on Apply, never lost data.
- Two new Vercel functions (`api/checkin.js`, `api/checkin-worker.js`), bringing the count from 8 to
  10, under the Hobby plan's limit of 12.
- New environment variables (names only): `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`,
  `TEMPORAL_API_KEY`, `CHECKIN_CODEC_KEY`, `CHECKIN_WORKER_SECRET`; the worker also needs
  `SWOLTRACKER_API_URL`.
- Workflow code is constrained by determinism. A replay test with a recorded history guards it.
- `apply_program_days` is a kit function, not an MCP tool. The tool count and `SKILL.md` do not
  change.

## Follow-ups

- Host the worker (Railway or Fly) and add a codec server so payloads can be read in the Cloud UI.
- Check-ins for group members (the leader's program); v1 is owners only.
- Chad chat on Temporal.
- Real billing on top of the metering data.
- Worker Versioning for safe workflow changes.
