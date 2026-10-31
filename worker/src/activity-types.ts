// The activity interface, as the workflow sees it. Types only (no runtime imports), so the workflow
// bundle never pulls Node code in. The implementation is src/activities.ts.

import type {
  ApplyResult,
  DraftResult,
  ExpireResult,
  MissedApplyResult,
  MissedCheckResult,
  NotifyResult,
  ReviewResult,
  ScheduleResult,
  WorkerEnvelope,
  WorkerOp,
  WorkerRequest,
} from "../../shared/checkin-contract.js";

/**
 * What the workflow passes for an op: the contract's request without `op` and without the three
 * envelope fields the activity fills in itself from Context.current().info (workflowId, runId,
 * attempt). `userId` and `instigation` stay, because only the workflow knows why it is calling.
 */
export type OpInput<O extends WorkerOp> = Omit<Extract<WorkerRequest, { op: O }>, "op" | keyof Pick<WorkerEnvelope, "workflowId" | "runId" | "attempt">>;

export interface CheckinActivities {
  schedule(input: OpInput<"schedule">): Promise<ScheduleResult>;
  review(input: OpInput<"review">): Promise<ReviewResult>;
  draft(input: OpInput<"draft">): Promise<DraftResult>;
  notify(input: OpInput<"notify">): Promise<NotifyResult>;
  apply(input: OpInput<"apply">): Promise<ApplyResult>;
  expire(input: OpInput<"expire">): Promise<ExpireResult>;
  missedCheck(input: OpInput<"missed_check">): Promise<MissedCheckResult>;
  missedApply(input: OpInput<"missed_apply">): Promise<MissedApplyResult>;
  /**
   * Local, no HTTP. False when the worker runs with NODE_ENV=production or a TEMPORAL_API_KEY; the workflow ignores its
   * `devFastForward` input in that case. A workflow cannot read process.env, so it has to ask.
   */
  devFastForwardAllowed(): Promise<boolean>;
}
