/**
 * The contract for Chad's weekly check-in (ADR-006). One owner for every name and shape that the
 * three sides share, so none of them re-declares a copy:
 *
 *   - the Temporal worker (`worker/`, TypeScript) imports this file directly,
 *   - the Vercel functions (`api/checkin.js`, `api/checkin-worker.js`, plain JS) import the compiled
 *     copy from `mcp/dist/shared/checkin-contract.js` (same route as week-math),
 *   - the web app reads the same shapes from `chad_checkins` / `chad_missed_offers` and calls
 *     `/api/checkin`.
 *
 * No runtime dependencies. Everything here is a constant, a type or a tiny pure function.
 *
 * ---------------------------------------------------------------------------------------------
 * /api/checkin  (browser -> Vercel, `Authorization: Bearer <Supabase JWT>`, POST, JSON)
 * ---------------------------------------------------------------------------------------------
 * Gate order: CORS, method, body shape (400), Temporal configured (503 "Check-ins are off right
 * now."), JWT (401), daily limit (429, 30/day, every action except `status`). The user id is always
 * the verified JWT id, never a body field.
 *
 *   { action: "status" }
 *     -> 200 { eligible: boolean, reason?: IneligibleReason, enabled: boolean, configured: true }
 *        `configured` is always true on a 200 (a missing Temporal setup answers 503 before this).
 *
 *   { action: "settings", enabled: boolean }
 *     -> 200 { enabled: boolean }
 *        Writes chad_coach_settings. Turning it on needs eligibility (403 { error, reason } if
 *        not) and signal-with-starts the workflow `coach-<userId>` with setEnabled(true); turning
 *        it off signals setEnabled(false). Works while the worker is offline: the Signal queues.
 *
 *   { action: "decide", checkinId: uuid, acceptIds: string[] }
 *     -> 200 DecideResult
 *        404 unknown check-in (or not the caller's), 409 the workflow rejected it (stale id, already
 *        decided, closed), 503 { error: "Chad's offline right now. Try again in a bit." } when no
 *        worker answers within ~15 s. An empty acceptIds list is a "skip this week".
 *
 *   { action: "missed", offerId: uuid, accept: boolean }
 *     -> 200 MissedResult   (same 404 / 409 / 503 mapping as `decide`)
 *
 *   { action: "event", type: "day_missed", week: number, day: DayName }
 *     -> 202 { queued: boolean }   fire and forget; queued is false when the user has no workflow
 *
 * ---------------------------------------------------------------------------------------------
 * /api/checkin-worker  (Temporal worker activities -> Vercel, POST, JSON)
 * ---------------------------------------------------------------------------------------------
 * Auth: `Authorization: Bearer ${CHECKIN_WORKER_SECRET}`, compared in constant time. 500 when the
 * secret is unset on the server, 401 on a wrong or missing token. Body: WorkerEnvelope plus the
 * op's own fields. Every op is idempotent per check-in / offer, so an activity retry is safe.
 *
 * Status codes (the worker maps 4xx to non-retryable, 5xx and network errors to retryable):
 *   200 ok, 400 invalid input, 403 not eligible, 404 unknown check-in or offer, 409 conflict
 *   (stale or already closed), 503 upstream failure (model, database, push). Error body is
 *   WorkerErrorBody.
 *
 *   schedule      {}                                  -> ScheduleResult
 *   review        { scheduledFor: ISO }               -> ReviewResult
 *   draft         { reviewWeek, targetWeek, anchor, review } -> DraftResult
 *   notify        { kind, checkinId? | offerId? }     -> NotifyResult
 *   apply         { checkinId, acceptIds }            -> ApplyResult
 *   expire        { checkinId? | offerId? }           -> ExpireResult
 *   missed_check  { week?, day? }                     -> MissedCheckResult
 *   missed_apply  { offerId, accept }                 -> MissedApplyResult
 *
 * Rules the workflow (Task 3) MUST follow:
 *   - It tracks a check-in (reminder, expiry, waiting for a decision) and notifies about it only when
 *     the check-in returned by `draft` has status === "pending". A reused check-in that is already
 *     applied, declined, expired or failed is finished: no notify, no timers.
 *   - A check-in with changeCount === 0 (a quiet week, or the serious "red flag" recap) still gets
 *     the "ready" push, but never the Monday reminder (`notify` answers skipped: "no_changes"). The
 *     card offers "Got it", which sends `decide` with acceptIds [] and is stored as declined.
 *   - `review` and `missed_check` may skip (`no_next_week`, `window_closed`, `no_program`): then
 *     there is nothing to draft or notify.
 *   - Permanent failures (HTTP 400, 403, 404, 409 from the worker API) are non-retryable activity
 *     failures, and a decideCheckin / answerMissedDay handler MUST rethrow them as
 *     `ApplicationFailure.nonRetryable(message, type)` with the matching FAILURE_TYPES value
 *     (BadRequest, NotEligible, NotFound, Conflict). /api/checkin walks the failure cause chain and
 *     answers 409 (403 for NotEligible). Any other failure type is shown as a temporary 503.
 *   - Update validators reject by throwing an ApplicationFailure (any type) the same way; that is a 409.
 *   - On the worker, set the failure converter to `new DefaultFailureConverter({ encodeCommonAttributes:
 *     true })` through `DataConverter.failureConverterPath` (a module exporting `failureConverter`), so
 *     failure messages are encrypted by the codec too. The API client does not need it to decode.
 *
 * Deep links used in pushes and the app: checkinLink(id) = /workout?checkin=<id>,
 * offerLink(id) = /workout?offer=<id>.
 *
 * Push quiet hours: check-in pushes intentionally do NOT honor the user's push quiet hours (a product
 * decision: the Monday 07:00 reminder falls inside the default 22:00 to 08:00 window). Do not "fix" it.
 *
 * An Update that times out (503 "Chad's offline") may still have run: the browser must re-read
 * chad_checkins / chad_missed_offers after any 503 and show the truth, not assume nothing happened.
 *
 * ---------------------------------------------------------------------------------------------
 * Rows the web reads through RLS (select only; the worker API is the only writer)
 * ---------------------------------------------------------------------------------------------
 *   chad_coach_settings  user_id, weekly_checkin (bool), updated_at
 *   chad_checkins        id, user_id, gym_id, review_week, target_week,
 *                        status (drafting | pending | applied | partial | declined | expired | failed),
 *                        recap (CheckinRecap), changes (CheckinChange[]), result ({ applied, skipped }
 *                        as in DecideResult, null until decided), reminder_at, expires_at (ISO),
 *                        notified_at, reminded_at, decided_at, workflow_id, created_at, updated_at
 *   chad_missed_offers   id, user_id, week, from_day, to_day, status (pending | accepted | declined |
 *                        expired), expires_at, notified_at, created_at, updated_at
 * The card shows the newest row with status "pending". A check-in with status "failed" and a result
 * means every ticked change hit a conflict (nothing was saved); without a result it never drafted.
 * The admin approval rate counts only check-ins that had at least one change.
 *
 * Which op emits which chad_events row (so metering counts stay honest):
 *   schedule                          nothing
 *   review                            run.started (once per week, deduped on retry), step.completed
 *   draft                             step.completed | step.failed (tokens, cost, model, attempt)
 *   notify (ready)                    waiting_on_human (once per check-in)
 *   notify (reminder, missed)         step.completed
 *   apply                             approved (metadata applied: 0 when every ticked change
 *                                     conflicted, status failed) | declined, then completed
 *   expire                            expired, then completed
 *   missed_check                      run.started + step.completed only when an offer is created,
 *                                     or run.started + completed when instigation is day_missed
 *                                     and no offer results; a no-op daily check emits nothing
 *   missed_apply                      approved | declined, then completed; a permanent conflict closes
 *                                     the offer as expired (expired, then completed) and answers 409
 */

export const TASK_QUEUE = "chad-checkin";
/** The workflow is started by type name from the API, so api/ never imports worker code. */
export const WORKFLOW_TYPE = "coachLoopWorkflow";

/** One long-lived workflow per user. */
export function workflowIdFor(userId: string): string {
  return `coach-${userId}`;
}

export const SIGNAL_SET_ENABLED = "setEnabled";
export const SIGNAL_DAY_MISSED = "dayMissed";
export const UPDATE_DECIDE_CHECKIN = "decideCheckin";
export const UPDATE_ANSWER_MISSED_DAY = "answerMissedDay";
export const QUERY_GET_STATE = "getState";

/** Argument of the `setEnabled` signal. */
export type SetEnabledSignal = boolean;
/** Argument of the `dayMissed` signal. */
export interface DayMissedSignal {
  week: number;
  day: DayName;
}

/** The draft activity gives up (check-in row -> failed) on this attempt. Matches the retry policy. */
export const DRAFT_MAX_ATTEMPTS = 3;

/**
 * The `type` of the ApplicationFailure for a permanent failure, by the worker API status that caused
 * it: 400 BadRequest, 403 NotEligible, 404 NotFound, 409 Conflict. Activities fail non-retryable with
 * these; Update handlers rethrow them (see the rules above) so /api/checkin can tell a permanent
 * refusal from a temporary outage.
 */
export const FAILURE_TYPES = {
  badRequest: "BadRequest",
  notEligible: "NotEligible",
  notFound: "NotFound",
  conflict: "Conflict",
} as const;

/** Deep links carried by pushes and understood by the workout screen. */
export const checkinLink = (checkinId: string): string => `/workout?checkin=${checkinId}`;
export const offerLink = (offerId: string): string => `/workout?offer=${offerId}`;

export const WORKER_OPS = [
  "schedule",
  "review",
  "draft",
  "notify",
  "apply",
  "expire",
  "missed_check",
  "missed_apply",
] as const;
export type WorkerOp = (typeof WORKER_OPS)[number];

/** Monday first, like a program week. */
export const PROGRAM_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
export type DayName = (typeof PROGRAM_DAYS)[number];

/** What set the work going; stored on every chad_events row. */
export type Instigation = "schedule" | "day_missed" | "user_action" | "user_message";

/** Why a user cannot use check-ins (status and schedule). */
export type IneligibleReason =
  /** The switch in chad_coach_settings is off. */
  | "disabled"
  /** app_settings chad_checkin_rollout is "admin" and the user is not the admin. */
  | "rollout"
  /** The user follows a group leader's program, which they cannot edit. */
  | "group_member"
  /** The user owns no gym with a program. */
  | "no_gym";

/** A stored program day (the JSON the app keeps per day). */
export type ProgramDay = Record<string, unknown>;

// ---------------------------------------------------------------------------------------------
// Check-in content (stored in chad_checkins.recap / .changes, read by the card through RLS)
// ---------------------------------------------------------------------------------------------

export interface CheckinChange {
  /** "c1".."c4", stable for the life of the check-in. The card and acceptIds use it. */
  id: string;
  day: DayName;
  /** One line for the card, at most 120 characters. */
  summary: string;
  /** Why, at most 160 characters. */
  reason: string;
  /** The stored day at draft time. Always read from the database, never from the model. */
  before: ProgramDay | null;
  /** The full replacement day. */
  after: ProgramDay;
}

export interface CheckinRecap {
  /** At most 80 characters. */
  headline: string;
  wins: string[];
  watch: string[];
  /** "serious" drops the gym-bro act (a red flag in the week's notes). */
  tone: "normal" | "serious";
  /** Facts from the logs, computed on the server, not by the model. */
  stats?: { scheduled: number; completed: number; missed: number };
}

export type CheckinStatus =
  | "drafting"
  | "pending"
  | "applied"
  | "partial"
  | "declined"
  | "expired"
  | "failed";

export type OfferStatus = "pending" | "accepted" | "declined" | "expired";

/**
 * What `draft` returns to the workflow. Deliberately small: the proposed days stay out of workflow
 * history. The card reads the full row through RLS.
 */
export interface CheckinHandle {
  id: string;
  status: CheckinStatus;
  /** ISO UTC. Monday 07:00 in the user's zone. */
  reminderAt: string | null;
  /** ISO UTC. Monday 23:59:59 in the user's zone. */
  expiresAt: string | null;
  /** 0 for a quiet week or a serious recap: no reminder, "Got it" instead of Apply. */
  changeCount: number;
}

export interface MissedOffer {
  id: string;
  week: number;
  fromDay: DayName;
  toDay: DayName;
  status: OfferStatus;
  /** ISO UTC. The end of the local day the offer was made. */
  expiresAt: string | null;
}

// ---------------------------------------------------------------------------------------------
// Decisions (Updates) and their results
// ---------------------------------------------------------------------------------------------

export interface DecideInput {
  checkinId: string;
  /** Change ids the user ticked. Empty means "skip this week". */
  acceptIds: string[];
}

export type SkipReason = "changed_since_draft" | "already_logged";

export interface DecideResult {
  /**
   * applied: every proposed change was saved. declined: the user skipped (or tapped "Got it" on a
   * check-in with nothing to decide). partial: anything in between. failed: the user ticked one or
   * more changes but every one hit a conflict, so nothing was saved (`skipped` says why).
   */
  status: "applied" | "partial" | "declined" | "failed";
  applied: Array<{ id: string; day: DayName }>;
  /** Ticked changes that were not saved because the day moved on. Unticked ones are not listed. */
  skipped: Array<{ id: string; day: DayName; reason: SkipReason }>;
}

export interface MissedAnswer {
  offerId: string;
  accept: boolean;
}

export interface MissedResult {
  status: "accepted" | "declined";
  fromDay: DayName;
  toDay: DayName;
}

// ---------------------------------------------------------------------------------------------
// Worker ops
// ---------------------------------------------------------------------------------------------

export interface WorkerEnvelope {
  userId: string;
  instigation: Instigation;
  workflowId: string;
  runId: string;
  /** Temporal activity attempt, 1-based. Stored on chad_events for retry counts. */
  attempt: number;
}

export interface WorkerErrorBody {
  error: string;
}

/** `schedule`: eligibility plus the next wake-up times, all ISO UTC and computed in the user's zone. */
export type ScheduleResult =
  | { stop: true; reason: IneligibleReason }
  | {
      stop: false;
      timeZone: string;
      /** Next Sunday 18:00 local, strictly after now. */
      nextCheckinAt: string;
      /** Next 09:00 local, strictly after now. */
      nextDailyAt: string;
    };

export interface ReviewSession {
  day: string;
  exercise: string;
  sets: number;
  avgWeight: number;
  avgReps: number;
  prescribedReps: number | null;
  /** hit | missed | mixed ... whatever the kit's set-outcome classifier says. */
  outcome: string;
}

export interface ReviewRecommendation {
  exercise: string;
  type: "increase" | "deload" | "stale";
  message: string;
  increment?: number;
}

/** The compact review of the week that ended. This is all the model sees about the user's logs. */
export interface WeekReview {
  reviewWeek: number;
  scheduledDays: string[];
  completedDays: string[];
  missedDays: Array<{ day: string; reason: string | null }>;
  sessions: ReviewSession[];
  notes: Array<{ day: string; label: string | null; text: string }>;
  recommendations: ReviewRecommendation[];
}

/**
 * `review`. The week is the one containing `scheduledFor` (the Sunday 18:00 the workflow slept
 * until), so a late wake-up on Monday still reviews the week that ended.
 */
export type ReviewResult =
  | {
      skip: true;
      /**
       * no_next_week: the user has no program for the week after. window_closed: the Monday
       * deadline already passed (the worker was off for more than a day), so a proposal would be
       * born expired. no_program: the user has no program start date, so there is no week to review.
       */
      reason: "no_next_week" | "window_closed" | "no_program";
    }
  | {
      skip: false;
      reviewWeek: number;
      /** Always reviewWeek + 1. */
      targetWeek: number;
      /** ISO. Pass it back to `draft`; the Monday reminder and expiry hang off it. */
      anchor: string;
      review: WeekReview;
    };

export interface DraftResult {
  checkin: CheckinHandle;
  /** True when a check-in for this target week already existed and no model call was made. */
  reused: boolean;
}

export type NotifyKind = "ready" | "reminder" | "missed";

export interface NotifyResult {
  sent: number;
  skipped?:
    | "already_notified"
    | "no_subscriptions"
    | "not_open"
    /** A reminder for a check-in with no changes. */
    | "no_changes"
    | "push_not_configured"
    | "delivery_failed";
}

export interface ApplyResult extends DecideResult {
  /** True when the check-in was already decided and this is the stored result. */
  alreadyDecided: boolean;
}

export interface ExpireResult {
  status: CheckinStatus | OfferStatus;
  /** False when it was already closed. */
  expired: boolean;
}

export type MissedSkipReason =
  | "rest_day"
  | "completed"
  | "already_logged"
  | "injury_or_illness"
  | "no_rest_day"
  | "week_boundary"
  | "not_current_week"
  | "already_handled"
  | "no_program";

export interface MissedCheckResult {
  offer: MissedOffer | null;
  /** True when this call created the offer (so a retry returns false and the push is deduped). */
  created: boolean;
  reason?: MissedSkipReason;
}

export interface MissedApplyResult extends MissedResult {
  alreadyDecided: boolean;
}

export interface ScheduleRequest extends WorkerEnvelope {
  op: "schedule";
}
export interface ReviewRequest extends WorkerEnvelope {
  op: "review";
  /** The Sunday 18:00 (ISO) the workflow slept until. Required: it decides which week is reviewed. */
  scheduledFor: string;
}
export interface DraftRequest extends WorkerEnvelope {
  op: "draft";
  reviewWeek: number;
  targetWeek: number;
  anchor: string;
  review: WeekReview;
}
export interface NotifyRequest extends WorkerEnvelope {
  op: "notify";
  kind: NotifyKind;
  /** For ready and reminder. */
  checkinId?: string;
  /** For missed. */
  offerId?: string;
}
export interface ApplyRequest extends WorkerEnvelope {
  op: "apply";
  checkinId: string;
  acceptIds: string[];
}
export interface ExpireRequest extends WorkerEnvelope {
  op: "expire";
  /** Exactly one of the two. */
  checkinId?: string;
  offerId?: string;
}
export interface MissedCheckRequest extends WorkerEnvelope {
  op: "missed_check";
  /** Both or neither. Given: the day the user marked missed. Absent: yesterday, in the user's zone. */
  week?: number;
  day?: DayName;
}
export interface MissedApplyRequest extends WorkerEnvelope {
  op: "missed_apply";
  offerId: string;
  accept: boolean;
}

export type WorkerRequest =
  | ScheduleRequest
  | ReviewRequest
  | DraftRequest
  | NotifyRequest
  | ApplyRequest
  | ExpireRequest
  | MissedCheckRequest
  | MissedApplyRequest;

export interface WorkerResponseMap {
  schedule: ScheduleResult;
  review: ReviewResult;
  draft: DraftResult;
  notify: NotifyResult;
  apply: ApplyResult;
  expire: ExpireResult;
  missed_check: MissedCheckResult;
  missed_apply: MissedApplyResult;
}

// ---------------------------------------------------------------------------------------------
// Workflow state (the getState query)
// ---------------------------------------------------------------------------------------------

export interface WorkflowState {
  enabled: boolean;
  checkin: { id: string; expiresAt: string; reminderAt: string; reminded: boolean } | null;
  offer: { id: string; expiresAt: string } | null;
  /** dayMissed signals waiting to be handled. */
  queuedMissed: number;
  /** True while an apply is in flight; a second decision is rejected. */
  applying: boolean;
  nextCheckinAt: string | null;
  nextDailyAt: string | null;
}
