// Chad's coach loop: ONE long-lived workflow per user (workflow id `coach-<userId>`), ADR-006.
//
// Temporal ideas on show, in the order they appear below:
//   - Signals    setEnabled, dayMissed: fire and forget, accepted even while the worker is offline.
//   - Updates    decideCheckin, answerMissedDay: a validator rejects a bad request before it reaches
//                history, the handler runs an activity and returns its result to the caller.
//   - Query      getState: read-only peek for debugging and the Temporal UI.
//   - Timers     condition(fn, ms) is "sleep until something changes OR this long passes". The whole
//                loop is one durable wait on the earliest of five deadlines.
//   - Activities every side effect is an HTTP call into /api/checkin-worker (src/activities.ts).
//   - Retries    proxyActivities carries the retry policy; the workflow only decides what a final
//                failure means.
//   - Continue-as-new  the history is reset after each resolved check-in, carrying the open state.
//
// Determinism: this file runs in a sandbox and is replayed from history, so it uses no wall clock
// beyond Date.now() (which Temporal controls), no Intl, no Node APIs and no randomness. Every
// wall-clock decision ("next Sunday 18:00 in this user's zone") is made in the `schedule` activity.

import {
  ActivityFailure,
  ApplicationFailure,
  allHandlersFinished,
  condition,
  continueAsNew,
  defineQuery,
  defineSignal,
  defineUpdate,
  isCancellation,
  log,
  proxyActivities,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";
import type { RetryPolicy } from "@temporalio/common";
import {
  DRAFT_MAX_ATTEMPTS,
  FAILURE_TYPES,
  QUERY_GET_STATE,
  SIGNAL_DAY_MISSED,
  SIGNAL_SET_ENABLED,
  UPDATE_ANSWER_MISSED_DAY,
  UPDATE_DECIDE_CHECKIN,
  type CheckinHandle,
  type DayMissedSignal,
  type DecideInput,
  type DecideResult,
  type IneligibleReason,
  type Instigation,
  type MissedAnswer,
  type MissedCheckResult,
  type MissedResult,
  type SetEnabledSignal,
  type WorkflowState,
} from "../../../shared/checkin-contract.js";
import type { CheckinActivities } from "../activity-types.js";

// ---------------------------------------------------------------------------------------------
// Input, output and the state that survives continue-as-new
// ---------------------------------------------------------------------------------------------

/**
 * DEV ONLY. Shortens the real timers so a developer can watch a whole cycle in a minute. Honoured
 * only when the `devFastForwardAllowed` activity says yes, which it does only on a worker that is
 * not running with NODE_ENV=production or a TEMPORAL_API_KEY (Cloud). The API never sets it (api/checkin.js starts the workflow
 * with { userId } alone), so production cannot reach it from the browser. All values are in ms from
 * workflow start (checkin, daily) or from the moment a check-in is created (reminder, expire).
 */
export interface DevFastForward {
  /** Run the Sunday check-in this long after the workflow starts, once. */
  checkinAfterMs?: number;
  /** Run the daily missed-day check this long after the workflow starts, once. */
  dailyAfterMs?: number;
  /** Send the reminder this long after a check-in is created, whatever the server computed. */
  reminderAfterMs?: number;
  /** Expire a check-in (and offer) this long after it is created, whatever the server computed. */
  expireAfterMs?: number;
}

interface OpenCheckin {
  id: string;
  expiresAt: string;
  reminderAt: string;
  reminded: boolean;
  /** Not part of the public state: a check-in with no changes never gets the Monday reminder. */
  changeCount: number;
}

interface OpenOffer {
  id: string;
  expiresAt: string;
}

/** Everything a new run needs to carry on where the old one stopped. Small and JSON. */
export interface CarriedState {
  enabled: boolean;
  checkin: OpenCheckin | null;
  offer: OpenOffer | null;
  queuedMissed: DayMissedSignal[];
  /** A Sunday that fired but could not be processed yet (the API was down); the ISO it fired for. */
  pendingSunday: string | null;
  pendingDaily: boolean;
  /** The last Sunday / daily time that fired (ms), so a stale `schedule` answer cannot fire it twice. */
  lastSundayAt: number;
  lastDailyAt: number;
  /** Dev fast-forward targets not yet used (ISO). */
  devCheckinAt: string | null;
  devDailyAt: string | null;
}

export interface CoachLoopInput {
  userId: string;
  carried?: CarriedState;
  /** Dev only, see {@link DevFastForward}. */
  devFastForward?: DevFastForward;
}

export type CoachLoopResult =
  /** The user (or a script) switched Chad off. */
  | { ended: "disabled" }
  /** `schedule` said the user is no longer eligible (setting off in the database, rollout, ...). */
  | { ended: "ineligible"; reason: IneligibleReason };

// ---------------------------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------------------------

const setEnabledSignal = defineSignal<[SetEnabledSignal]>(SIGNAL_SET_ENABLED);
const dayMissedSignal = defineSignal<[DayMissedSignal]>(SIGNAL_DAY_MISSED);
const decideCheckinUpdate = defineUpdate<DecideResult, [DecideInput]>(UPDATE_DECIDE_CHECKIN);
const answerMissedDayUpdate = defineUpdate<MissedResult, [MissedAnswer]>(UPDATE_ANSWER_MISSED_DAY);
const getStateQuery = defineQuery<WorkflowState>(QUERY_GET_STATE);

// ---------------------------------------------------------------------------------------------
// Activities and their retry policy
// ---------------------------------------------------------------------------------------------

const FAILURE_TYPE_VALUES: readonly string[] = Object.values(FAILURE_TYPES);

const RETRY: RetryPolicy = {
  initialInterval: "2 seconds",
  backoffCoefficient: 2,
  maximumInterval: "1 minute",
  maximumAttempts: 5,
  // A 4xx from the worker API is a permanent answer; never retried (see src/activities.ts).
  nonRetryableErrorTypes: [...FAILURE_TYPE_VALUES],
};

const act = proxyActivities<CheckinActivities>({
  startToCloseTimeout: "30 seconds",
  retry: RETRY,
});

// Apply and skip run inside an Update the API waits ~15 s for. 1 s, 2 s, then give up (3 attempts, 10 s
// each at most) so a temporary outage comes back as a 503 the user can retry, instead of a spinner
// that outlives the request. The server ops are idempotent, so a tap after the 503 is safe.
const decisionAct = proxyActivities<Pick<CheckinActivities, "apply" | "missedApply">>({
  startToCloseTimeout: "10 seconds",
  retry: { ...RETRY, initialInterval: "1 second", maximumAttempts: 3 },
});

// The model call is slower and costs money: a longer timeout and fewer attempts. The server marks
// the check-in failed on its last attempt (DRAFT_MAX_ATTEMPTS in the contract).
const draftAct = proxyActivities<Pick<CheckinActivities, "draft">>({
  startToCloseTimeout: "120 seconds",
  retry: { ...RETRY, maximumAttempts: DRAFT_MAX_ATTEMPTS },
});

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
/** After an activity gives up on a temporary failure, wait this long before trying that work again. */
const COOLDOWN_MS = 5 * MINUTE_MS;
/** Only used if the server returns a pending check-in without its times, which it should not. */
const FALLBACK_REMINDER_AFTER_SUNDAY_MS = 13 * HOUR_MS;
const FALLBACK_EXPIRY_AFTER_SUNDAY_MS = 30 * HOUR_MS;
const FALLBACK_OFFER_EXPIRY_MS = 24 * HOUR_MS;

const iso = (ms: number): string => new Date(ms).toISOString();

// ---------------------------------------------------------------------------------------------
// Failure helpers
// ---------------------------------------------------------------------------------------------

/** The permanent answer behind an activity failure, if it is one the API understands. */
function permanentRefusal(error: unknown): { message: string; type: string } | null {
  if (!(error instanceof ActivityFailure) || !(error.cause instanceof ApplicationFailure)) return null;
  const { type, message } = error.cause;
  if (type && FAILURE_TYPE_VALUES.includes(type)) return { message, type };
  return null;
}

/**
 * True only for the server's permanent answers about the data (BadRequest, NotEligible, NotFound,
 * Conflict): retrying gives the same answer, so the loop moves on. Configuration failures
 * (Unauthorized, Misconfigured) and BadResponse are also non-retryable at the activity level, but
 * they say nothing about the row, so they are NOT permanent here: the work stays open and is tried
 * again after the cooldown, once someone fixes the secret, the URL or the deployment.
 */
function isPermanent(error: unknown): boolean {
  return permanentRefusal(error) !== null;
}

type Attempt<T> = { ok: true; value: T } | { ok: false; permanent: boolean };

/**
 * Runs one activity whose final failure must not kill the loop. Cancellation and programming errors
 * (anything that is not an ActivityFailure) still propagate.
 */
async function attempt<T>(label: string, fn: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    if (isCancellation(error) || !(error instanceof ActivityFailure)) throw error;
    const permanent = isPermanent(error);
    log.warn(`${label} failed`, { permanent, cause: error.cause?.message ?? error.message });
    return { ok: false, permanent };
  }
}

// ---------------------------------------------------------------------------------------------
// The workflow
// ---------------------------------------------------------------------------------------------

export async function coachLoopWorkflow(input: CoachLoopInput): Promise<CoachLoopResult> {
  const { userId } = input;
  const carried = input.carried;

  // Workflow state: plain variables. Temporal rebuilds them by replaying history, which is why the
  // code that mutates them must be deterministic.
  let enabled = carried?.enabled ?? true;
  let checkin: OpenCheckin | null = carried?.checkin ?? null;
  let offer: OpenOffer | null = carried?.offer ?? null;
  const queue: DayMissedSignal[] = [...(carried?.queuedMissed ?? [])];
  let pendingSunday: string | null = carried?.pendingSunday ?? null;
  let pendingDaily = carried?.pendingDaily ?? false;
  let lastSundayAt = carried?.lastSundayAt ?? 0;
  let lastDailyAt = carried?.lastDailyAt ?? 0;
  let devCheckinAt: string | null = carried?.devCheckinAt ?? null;
  let devDailyAt: string | null = carried?.devDailyAt ?? null;

  /**
   * Locks, one per kind of open item, held while a decision (or the loop's own expiry) is being
   * written for it. A second decision on the same item is rejected, and the loop does not wait on
   * its deadlines (an overdue deadline of a locked item would make it spin). Each function clears
   * only the lock it set.
   */
  let checkinLock = false;
  let offerLock = false;
  /** Set by handlers so the sleeping loop wakes up and re-plans. */
  let changed = false;
  /** A check-in left the open state this run: time to start a fresh history. */
  let checkinResolved = false;
  /** Until this time, work that just failed is not retried. */
  let cooldownUntil = 0;
  /** The next scheduled times from the last `schedule` call (ms), consumed as they fire. */
  let nextCheckinAt: number | null = null;
  let nextDailyAt: number | null = null;

  // ---- handlers -------------------------------------------------------------------------------
  // Registered before the first await (the dev fast-forward check below), so signals and Updates sent
  // with the start (signal-with-start) are delivered into them.

  setHandler(setEnabledSignal, (value) => {
    enabled = value;
    changed = true;
  });

  setHandler(dayMissedSignal, (event) => {
    queue.push(event);
  });

  setHandler(getStateQuery, (): WorkflowState => ({
    enabled,
    checkin: checkin
      ? { id: checkin.id, expiresAt: checkin.expiresAt, reminderAt: checkin.reminderAt, reminded: checkin.reminded }
      : null,
    offer,
    queuedMissed: queue.length,
    applying: checkinLock || offerLock,
    nextCheckinAt: nextCheckinAt == null ? null : iso(nextCheckinAt),
    nextDailyAt: nextDailyAt == null ? null : iso(nextDailyAt),
  }));

  /**
   * Hands a failed activity to the Update's caller. The API tells a permanent refusal (409/403)
   * from an outage (503) by the failure on the way out, so:
   *   - a permanent answer from the worker API is rethrown as a fresh non-retryable
   *     ApplicationFailure with the same type;
   *   - anything else is rethrown UNWRAPPED. Wrapping a temporary failure in an ApplicationFailure
   *     would make the API read it as a refusal.
   */
  const rethrowForUpdate = (error: unknown): never => {
    const refusal = permanentRefusal(error);
    if (refusal) throw ApplicationFailure.nonRetryable(refusal.message, refusal.type);
    throw error;
  };

  // The check-in decision.
  setHandler(
    decideCheckinUpdate,
    async (request) => {
      // The validator already checked this, but two Updates can arrive in one workflow task and
      // validators must not mutate state, so the handler re-checks and takes the lock atomically.
      if (checkinLock || !checkin || checkin.id !== request.checkinId) {
        throw ApplicationFailure.nonRetryable("That check-in is not open.", FAILURE_TYPES.conflict);
      }
      checkinLock = true;
      try {
        const result = await decisionAct.apply({
          userId,
          instigation: "user_action",
          checkinId: request.checkinId,
          acceptIds: request.acceptIds,
        });
        // Whatever the outcome (applied, partial, declined, failed), the check-in is decided.
        checkin = null;
        checkinResolved = true;
        return { status: result.status, applied: result.applied, skipped: result.skipped };
      } catch (error) {
        // A conflict means the server already closed it (expired, decided elsewhere): stop tracking.
        if (permanentRefusal(error)?.type === FAILURE_TYPES.conflict) {
          checkin = null;
          checkinResolved = true;
        }
        return rethrowForUpdate(error);
      } finally {
        checkinLock = false;
        changed = true; // the loop ignored this check-in's deadlines while it was locked
      }
    },
    {
      validator: (request) => {
        if (!enabled) throw ApplicationFailure.nonRetryable("Chad is switched off.", FAILURE_TYPES.conflict);
        if (!checkin || checkin.id !== request.checkinId) {
          throw ApplicationFailure.nonRetryable("That check-in is not open.", FAILURE_TYPES.conflict);
        }
        if (checkinLock) throw ApplicationFailure.nonRetryable("That check-in is being decided.", FAILURE_TYPES.conflict);
        if (!Array.isArray(request.acceptIds) || request.acceptIds.length > checkin.changeCount) {
          throw ApplicationFailure.nonRetryable("More changes were ticked than the check-in has.", FAILURE_TYPES.badRequest);
        }
        if (new Set(request.acceptIds).size !== request.acceptIds.length) {
          throw ApplicationFailure.nonRetryable("A change was ticked twice.", FAILURE_TYPES.badRequest);
        }
      },
    },
  );

  // The missed-workout answer.
  setHandler(
    answerMissedDayUpdate,
    async (request) => {
      if (offerLock || !offer || offer.id !== request.offerId) {
        throw ApplicationFailure.nonRetryable("That offer is not open.", FAILURE_TYPES.conflict);
      }
      offerLock = true;
      try {
        const result = await decisionAct.missedApply({
          userId,
          instigation: "user_action",
          offerId: request.offerId,
          accept: request.accept,
        });
        offer = null;
        return { status: result.status, fromDay: result.fromDay, toDay: result.toDay };
      } catch (error) {
        // On a permanent conflict the server has already closed the offer as expired.
        if (permanentRefusal(error)?.type === FAILURE_TYPES.conflict) offer = null;
        return rethrowForUpdate(error);
      } finally {
        offerLock = false;
        changed = true;
      }
    },
    {
      validator: (request) => {
        if (!enabled) throw ApplicationFailure.nonRetryable("Chad is switched off.", FAILURE_TYPES.conflict);
        if (!offer || offer.id !== request.offerId) {
          throw ApplicationFailure.nonRetryable("That offer is not open.", FAILURE_TYPES.conflict);
        }
        if (offerLock) throw ApplicationFailure.nonRetryable("That offer is being answered.", FAILURE_TYPES.conflict);
      },
    },
  );

  // Dev fast-forward: ask the worker whether it is allowed (it cannot be in production or on Cloud).
  let dev: DevFastForward | undefined;
  if (input.devFastForward) {
    if (await act.devFastForwardAllowed()) {
      dev = input.devFastForward;
      if (!carried) {
        if (dev.checkinAfterMs != null) devCheckinAt = iso(Date.now() + dev.checkinAfterMs);
        if (dev.dailyAfterMs != null) devDailyAt = iso(Date.now() + dev.dailyAfterMs);
      }
      log.warn("Dev fast-forward is ON for this workflow.", { ...dev });
    } else {
      log.warn("Ignoring devFastForward: this worker runs in production or against Temporal Cloud.");
    }
  }

  // ---- steps ----------------------------------------------------------------------------------

  /** Tells the user. A push that fails must never stop the loop, so failures are logged and dropped. */
  const notify = async (
    instigation: Instigation,
    target: { kind: "ready" | "reminder"; checkinId: string } | { kind: "missed"; offerId: string },
  ): Promise<void> => {
    await attempt(`notify ${target.kind}`, () => act.notify({ userId, instigation, ...target }));
  };

  /** Expires the open check-in on the server, then forgets it. A permanent answer also counts. */
  const expireCheckin = async (instigation: Instigation): Promise<void> => {
    if (!checkin || checkinLock) return; // nothing open, or a decision is being written
    checkinLock = true;
    try {
      const result = await attempt("expire check-in", () => act.expire({ userId, instigation, checkinId: checkin!.id }));
      if (result.ok || result.permanent) {
        checkin = null;
        checkinResolved = true;
      } else {
        cooldownUntil = Date.now() + COOLDOWN_MS;
      }
    } finally {
      checkinLock = false;
    }
  };

  const expireOffer = async (instigation: Instigation): Promise<void> => {
    if (!offer || offerLock) return;
    offerLock = true;
    try {
      const result = await attempt("expire offer", () => act.expire({ userId, instigation, offerId: offer!.id }));
      if (result.ok || result.permanent) offer = null;
      else cooldownUntil = Date.now() + COOLDOWN_MS;
    } finally {
      offerLock = false;
    }
  };

  /** Starts tracking a pending check-in: the loop will now remind about it and expire it. */
  const trackCheckin = (handle: CheckinHandle, scheduledFor: string): void => {
    const now = Date.now();
    const sunday = Date.parse(scheduledFor);
    const reminderAt =
      dev?.reminderAfterMs != null
        ? iso(now + dev.reminderAfterMs)
        : (handle.reminderAt ?? iso(sunday + FALLBACK_REMINDER_AFTER_SUNDAY_MS));
    const expiresAt =
      dev?.expireAfterMs != null
        ? iso(now + dev.expireAfterMs)
        : (handle.expiresAt ?? iso(sunday + FALLBACK_EXPIRY_AFTER_SUNDAY_MS));
    checkin = { id: handle.id, expiresAt, reminderAt, reminded: false, changeCount: handle.changeCount };
  };

  /** Starts tracking a pending offer and tells the user. Returns without notifying if it is already tracked. */
  const trackOffer = async (result: MissedCheckResult, instigation: Instigation): Promise<void> => {
    const found = result.offer;
    if (!found || found.status !== "pending") return;
    if (offer?.id === found.id) return;
    // One open offer at a time (the contract's state has room for one). A newer offer replaces an
    // older one, which is closed on the server first so no card is left that cannot be answered.
    if (offer) {
      await expireOffer(instigation);
      // Still there: the old one is being answered, or closing it failed. Never overwrite an offer
      // that may still be live. The daily sweep finds the new one again.
      if (offer) return;
    }
    const now = Date.now();
    offer = {
      id: found.id,
      expiresAt:
        dev?.expireAfterMs != null ? iso(now + dev.expireAfterMs) : (found.expiresAt ?? iso(now + FALLBACK_OFFER_EXPIRY_MS)),
    };
    // The server dedupes the push (notified_at), so notifying a re-found offer is safe.
    await notify(instigation, { kind: "missed", offerId: found.id });
  };

  /** The Sunday check-in: review -> draft -> track -> notify. Returns false when it should be tried again. */
  const runSundayCheckin = async (scheduledFor: string): Promise<boolean> => {
    const reviewed = await attempt("review", () => act.review({ userId, instigation: "schedule", scheduledFor }));
    if (!reviewed.ok) return reviewed.permanent;
    const review = reviewed.value;
    if (review.skip) {
      log.info("Check-in skipped", { reason: review.reason });
      return true;
    }

    const drafted = await attempt("draft", () =>
      draftAct.draft({
        userId,
        instigation: "schedule",
        reviewWeek: review.reviewWeek,
        targetWeek: review.targetWeek,
        anchor: review.anchor,
        review: review.review,
      }),
    );
    if (!drafted.ok) return drafted.permanent;

    const handle = drafted.value.checkin;
    // A reused check-in that is already applied, declined, expired or failed is finished.
    if (handle.status !== "pending") return true;

    if (checkin?.id === handle.id) return true; // already tracking this one
    if (checkin) {
      await expireCheckin("schedule");
      // Still there: a decision is being written for it, or closing it failed. Do not overwrite it
      // (it would be orphaned, open on the server and untracked); try the whole step again later.
      if (checkin) return false;
    }
    trackCheckin(handle, scheduledFor);
    await notify("schedule", { kind: "ready", checkinId: handle.id });
    return true;
  };

  /** One missed-day check, for a signal (`day`) or the daily 9 AM sweep. Returns false to retry later. */
  const runMissedCheck = async (instigation: Instigation, event?: DayMissedSignal): Promise<boolean> => {
    const checked = await attempt("missed check", () =>
      act.missedCheck({ userId, instigation, ...(event ? { week: event.week, day: event.day } : {}) }),
    );
    if (!checked.ok) return checked.permanent;
    await trackOffer(checked.value, instigation);
    return true;
  };

  /** Ends the workflow: closes anything still open, then waits for in-flight Updates. */
  const shutdown = async (result: CoachLoopResult): Promise<CoachLoopResult> => {
    enabled = false; // validators now reject new decisions
    await condition(allHandlersFinished);
    await expireCheckin("user_action");
    await expireOffer("user_action");
    await condition(allHandlersFinished);
    return result;
  };

  const carryOver = (): CarriedState => ({
    enabled,
    checkin,
    offer,
    queuedMissed: [...queue],
    pendingSunday,
    pendingDaily,
    lastSundayAt,
    lastDailyAt,
    devCheckinAt,
    devDailyAt,
  });

  /**
   * Turns a scheduled time that has arrived into pending work, and remembers it fired. Runs before
   * every `schedule` call as well as after every wake: that call overwrites the times, and one that
   * lands after a Sunday 18:00 the loop woke up just before (a signal, a slow API) would otherwise
   * silently skip that Sunday.
   */
  const markDue = (): void => {
    const now = Date.now();
    if (nextCheckinAt != null && nextCheckinAt <= now) {
      pendingSunday ??= iso(nextCheckinAt);
      lastSundayAt = nextCheckinAt;
      nextCheckinAt = null;
      devCheckinAt = null;
    }
    if (nextDailyAt != null && nextDailyAt <= now) {
      pendingDaily = true;
      lastDailyAt = nextDailyAt;
      nextDailyAt = null;
      devDailyAt = null;
    }
  };

  // ---- the loop -------------------------------------------------------------------------------

  for (;;) {
    if (!enabled) return shutdown({ ended: "disabled" });

    markDue();

    // 1. Ask the server for the next times (it does the time zone math). Also re-checks eligibility.
    const scheduled = await attempt("schedule", () => act.schedule({ userId, instigation: "schedule" }));
    // The call itself can take long enough for a time to arrive meanwhile; mark it before the
    // answer overwrites the times.
    markDue();
    let scheduleRetryAt = 0;
    if (scheduled.ok) {
      if (scheduled.value.stop) return shutdown({ ended: "ineligible", reason: scheduled.value.reason });
      nextCheckinAt = Date.parse(scheduled.value.nextCheckinAt);
      nextDailyAt = Date.parse(scheduled.value.nextDailyAt);
      // The contract says "strictly after now". If the API's clock runs a little behind Temporal's
      // it can hand back the time that just fired; running it twice would repeat the work, so ask
      // again in a minute instead.
      if (nextCheckinAt <= lastSundayAt) {
        log.warn("schedule returned a check-in time that already fired; asking again shortly");
        nextCheckinAt = null;
        scheduleRetryAt = Date.now() + MINUTE_MS;
      }
      if (nextDailyAt <= lastDailyAt) {
        log.warn("schedule returned a daily time that already fired; asking again shortly");
        nextDailyAt = null;
        scheduleRetryAt = Date.now() + MINUTE_MS;
      }
      if (nextCheckinAt != null && devCheckinAt != null) nextCheckinAt = Math.min(nextCheckinAt, Date.parse(devCheckinAt));
      if (nextDailyAt != null && devDailyAt != null) nextDailyAt = Math.min(nextDailyAt, Date.parse(devDailyAt));
    } else {
      cooldownUntil = Date.now() + COOLDOWN_MS;
      scheduleRetryAt = cooldownUntil;
    }

    // 2. Pick the earliest deadline.
    const deadlines: number[] = [];
    if (nextCheckinAt != null) deadlines.push(nextCheckinAt);
    if (nextDailyAt != null) deadlines.push(nextDailyAt);
    // A locked item is being written right now; its handler wakes the loop when it finishes.
    if (checkin && !checkinLock) {
      deadlines.push(Date.parse(checkin.expiresAt));
      // No reminder for a check-in with nothing to decide, or one already reminded.
      if (!checkin.reminded && checkin.changeCount > 0) deadlines.push(Date.parse(checkin.reminderAt));
    }
    if (offer && !offerLock) deadlines.push(Date.parse(offer.expiresAt));
    // Work that fired but failed, and a failed schedule call, come back after the cooldown.
    if (pendingSunday != null || pendingDaily) deadlines.push(cooldownUntil);
    if (scheduleRetryAt > 0) deadlines.push(scheduleRetryAt);

    let wakeAt = deadlines.length > 0 ? Math.min(...deadlines) : Number.POSITIVE_INFINITY;
    // Something is due but just failed: wait out the cooldown instead of spinning.
    if (wakeAt <= Date.now()) wakeAt = Math.max(wakeAt, Math.min(cooldownUntil, Date.now() + COOLDOWN_MS));

    // 3. Sleep until the deadline, or until a signal or an Update changes the picture.
    changed = false;
    const waitMs = wakeAt - Date.now();
    if (waitMs > 0) {
      const wake = () => !enabled || queue.length > 0 || changed;
      await (Number.isFinite(waitMs) ? condition(wake, Math.ceil(waitMs)) : condition(wake));
    }
    if (!enabled) continue;

    // 4. Work out what is due now.
    const now = Date.now();
    markDue();

    // 5. Handle it, in this order. Each step is safe to skip when nothing is due.
    //    a) expiries (expireCheckin / expireOffer do nothing while a decision is being written)
    if (checkin && Date.parse(checkin.expiresAt) <= now) await expireCheckin("schedule");
    if (offer && Date.parse(offer.expiresAt) <= now) await expireOffer("schedule");

    //    b) the Monday reminder
    if (checkin && !checkinLock && !checkin.reminded && checkin.changeCount > 0 && Date.parse(checkin.reminderAt) <= now) {
      const due = checkin;
      due.reminded = true; // one reminder, even if the push fails
      await notify("schedule", { kind: "reminder", checkinId: due.id });
    }

    //    c) missed days: user-marked first, then the daily sweep
    while (queue.length > 0 && enabled) {
      const event = queue.shift()!;
      // A failed check is dropped: the next 9 AM sweep looks at yesterday anyway.
      await runMissedCheck("day_missed", event);
    }
    if (pendingDaily && enabled) {
      const done = await runMissedCheck("schedule");
      if (done) pendingDaily = false;
      else cooldownUntil = Date.now() + COOLDOWN_MS;
    }

    //    d) the Sunday check-in
    if (pendingSunday != null && enabled) {
      const done = await runSundayCheckin(pendingSunday);
      if (done) pendingSunday = null;
      else cooldownUntil = Date.now() + COOLDOWN_MS;
    }

    // 6. A new history after each resolved check-in, or when Temporal says the history is big.
    if (checkinResolved || workflowInfo().continueAsNewSuggested) {
      await condition(allHandlersFinished);
      return continueAsNew<typeof coachLoopWorkflow>({
        userId,
        carried: carryOver(),
        ...(input.devFastForward ? { devFastForward: input.devFastForward } : {}),
      });
    }
  }
}
