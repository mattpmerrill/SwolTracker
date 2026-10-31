// The activities: one generic HTTP call into /api/checkin-worker, wrapped once per op so the
// workflow gets typed methods. The worker holds no database, model or push credentials; every
// side effect happens behind that endpoint, authenticated by CHECKIN_WORKER_SECRET (ADR-006).
//
// Temporal lesson: an activity is where retries live. Whether a failure is worth retrying is decided
// here, by how we throw:
//   - plain Error                         -> retried with the workflow's retry policy
//   - ApplicationFailure.nonRetryable     -> never retried, the workflow sees it at once
// The mapping from HTTP status to one or the other is `failureForResponse`.

import { ApplicationFailure, activityInfo, cancellationSignal } from "@temporalio/activity";
import {
  FAILURE_TYPES,
  type WorkerOp,
  type WorkerRequest,
  type WorkerResponseMap,
} from "../../shared/checkin-contract.js";
import type { CheckinActivities, OpInput } from "./activity-types.js";
import { devFastForwardAllowed } from "./config.js";
import { responseSchemas } from "./schemas.js";

export interface ActivityConfig {
  /** Origin of the SwolTracker deployment, e.g. https://swol-tracker.vercel.app or http://localhost:3000. */
  apiUrl: string;
  /** The bearer secret CHECKIN_WORKER_SECRET. Never logged, never put in an error message. */
  secret: string;
  /** Injectable for tests. */
  fetch?: typeof fetch;
}

/** The type of the failure for a worker API status that is not worth retrying. */
export const MISCONFIGURED = "Misconfigured";
export const UNAUTHORIZED = "Unauthorized";
/** A 200 whose body does not match the contract. Not retried, and not a permanent answer either. */
export const BAD_RESPONSE = "BadResponse";

// Slightly under each activity's start-to-close timeout (30 s, 120 s for draft), so a hung request
// fails as a retryable network error instead of timing the whole activity out.
const REQUEST_TIMEOUT_MS = 28_000;
const DRAFT_REQUEST_TIMEOUT_MS = 110_000;
// apply and missedApply run with a 10 s start-to-close (decisionAct in the workflow), so a hung
// request must end before that as a retryable network error.
const DECISION_REQUEST_TIMEOUT_MS = 8_000;

function serverMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  return fallback;
}

/**
 * Sorts an error response into a retryable or a permanent failure. Exported for tests.
 *
 *   400 BadRequest, 403 NotEligible, 404 NotFound, 409 Conflict
 *       The server understood and refused. Retrying the same request gets the same answer, so these
 *       are non-retryable, typed with FAILURE_TYPES so an Update handler can hand them to the API.
 *   401 Unauthorized
 *       The secret on this machine does not match Vercel's. Retrying cannot fix a typo.
 *   500 with a JSON `{ error }` body
 *       Our own handler answered 500 only for missing configuration (CHECKIN_WORKER_SECRET or the
 *       Supabase variables unset on the server). Also permanent until someone sets it. A 500 that is
 *       not our JSON (a platform crash, an HTML error page) falls through and is retried.
 *   404 without our JSON `{ error }` body
 *       Our handler always explains a 404 ("No such check-in."). A bare 404 means the route is not
 *       deployed (an old deployment, a wrong SWOLTRACKER_API_URL), so it is a configuration failure
 *       (Misconfigured), not NotFound: the workflow must not treat it as "that row does not exist".
 *   anything else (503 upstream, 429, 502, 504, ...)
 *       Temporary. A plain Error, so the retry policy applies.
 */
export function failureForResponse(status: number, body: unknown, op: WorkerOp): Error {
  const detail = serverMessage(body, "");
  const permanent = (type: string, fallback: string) => ApplicationFailure.nonRetryable(detail || fallback, type);
  if (status === 400) return permanent(FAILURE_TYPES.badRequest, "The worker API rejected the request.");
  if (status === 403) return permanent(FAILURE_TYPES.notEligible, "Not eligible.");
  if (status === 404) {
    return detail
      ? permanent(FAILURE_TYPES.notFound, "Not found.")
      : permanent(MISCONFIGURED, "The worker API route was not found. Check SWOLTRACKER_API_URL and the deployment.");
  }
  if (status === 409) return permanent(FAILURE_TYPES.conflict, "Conflict.");
  if (status === 401) return permanent(UNAUTHORIZED, "The worker API refused CHECKIN_WORKER_SECRET.");
  if (status === 500 && detail) return permanent(MISCONFIGURED, "The worker API is misconfigured.");
  return new Error(`Worker API ${op} answered HTTP ${status}${detail ? `: ${detail}` : ""}`);
}

function requestTimeoutFor(op: WorkerOp): number {
  if (op === "draft") return DRAFT_REQUEST_TIMEOUT_MS;
  if (op === "apply" || op === "missed_apply") return DECISION_REQUEST_TIMEOUT_MS;
  return REQUEST_TIMEOUT_MS;
}

export function createCallWorkerApi(config: ActivityConfig) {
  const doFetch = config.fetch ?? fetch;
  const endpoint = `${config.apiUrl.replace(/\/+$/, "")}/api/checkin-worker`;

  return async function callWorkerApi<O extends WorkerOp>(op: O, input: OpInput<O>): Promise<WorkerResponseMap[O]> {
    const info = activityInfo();
    const request = {
      ...input,
      op,
      // From the activity, never the workflow: the server stores these on chad_events to count retries.
      workflowId: info.workflowExecution?.workflowId ?? "",
      runId: info.workflowExecution?.runId ?? "",
      attempt: info.attempt,
    } as WorkerRequest;

    let response: Response;
    try {
      response = await doFetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.secret}` },
        body: JSON.stringify(request),
        signal: AbortSignal.any([
          cancellationSignal(),
          AbortSignal.timeout(requestTimeoutFor(op)),
        ]),
      });
    } catch (error) {
      // Network failure or timeout: temporary. The cause is dropped on purpose, so a URL or header
      // can never end up in workflow history.
      const reason = error instanceof Error ? error.name : "error";
      throw new Error(`Worker API ${op} could not be reached (${reason}).`);
    }

    // A non-JSON body (an HTML error page) is treated as "no message".
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw failureForResponse(response.status, body, op);
    // Trust boundary: a 200 is only believed when it has the contract's shape. The message names
    // the op but never echoes the body, which can hold user data.
    const checked = responseSchemas[op].safeParse(body);
    if (!checked.success) {
      throw ApplicationFailure.nonRetryable(`The worker API answered ${op} with an unexpected body.`, BAD_RESPONSE);
    }
    return checked.data as WorkerResponseMap[O];
  };
}

export function createActivities(config: ActivityConfig): CheckinActivities {
  const call = createCallWorkerApi(config);
  return {
    schedule: (input) => call("schedule", input),
    review: (input) => call("review", input),
    draft: (input) => call("draft", input),
    notify: (input) => call("notify", input),
    apply: (input) => call("apply", input),
    expire: (input) => call("expire", input),
    missedCheck: (input) => call("missed_check", input),
    missedApply: (input) => call("missed_apply", input),
    devFastForwardAllowed: async () => devFastForwardAllowed(),
  };
}
