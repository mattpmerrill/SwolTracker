// Test harness: a time-skipping Temporal test server, the real workflow code (bundled once), and
// mocked activities that record every call. The workflow is exercised exactly as in production;
// only the HTTP calls behind the activities are replaced.

import { setTimeout as realSleep } from "node:timers/promises";
import { Client, type WorkflowHandle, type WorkflowHandleWithFirstExecutionRunId } from "@temporalio/client";
import { Context } from "@temporalio/activity";
import type { DataConverter } from "@temporalio/common";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker, bundleWorkflowCode, type WorkflowBundle } from "@temporalio/worker";
import {
  QUERY_GET_STATE,
  TASK_QUEUE,
  WORKFLOW_TYPE,
  workflowIdFor,
  type ApplyResult,
  type DraftResult,
  type ExpireResult,
  type MissedApplyResult,
  type MissedCheckResult,
  type NotifyResult,
  type ReviewResult,
  type ScheduleResult,
  type WorkflowState,
} from "../../shared/checkin-contract.js";
import type { CheckinActivities } from "../src/activity-types.js";
import { WORKFLOWS_PATH } from "../src/config.js";
import type { CoachLoopInput, CoachLoopResult } from "../src/workflows/coachLoop.js";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const USER_ID = "11111111-1111-4111-8111-111111111111";

let bundle: WorkflowBundle | undefined;
/** Webpack-bundles the workflow once per test file; it takes a few seconds. */
export async function workflowBundle(dataConverter?: DataConverter): Promise<WorkflowBundle> {
  bundle ??= await bundleWorkflowCode({
    workflowsPath: WORKFLOWS_PATH,
    // The bundle must include the same failure converter the worker was given.
    failureConverterPath: dataConverter?.failureConverterPath,
  });
  return bundle;
}

export interface Call {
  name: keyof CheckinActivities;
  input: Record<string, unknown>;
  attempt: number;
}

export type ActivityOverrides = { [K in keyof CheckinActivities]?: CheckinActivities[K] };

export interface WorldOptions {
  /** First fake Sunday, this long after the test starts (default 6 days). */
  sundayAfterMs?: number;
  /** Time between fake Sundays (default 7 days). */
  sundayEveryMs?: number;
  /** First daily check after this long; a huge value switches the daily check off. */
  dailyAfterMs?: number;
  changeCount?: number;
  overrides?: ActivityOverrides | ((world: World) => ActivityOverrides);
  dataConverter?: DataConverter;
}

/** The mocked server side: schedule math, ids, and a log of calls. */
export class World {
  readonly calls: Call[] = [];
  readonly origin: number;
  /** The test server's clock (it moves when a test skips time). Set by withWorld. */
  now: () => Promise<number> = async () => Date.now();

  constructor(
    origin: number,
    readonly options: WorldOptions,
  ) {
    this.origin = origin;
  }

  /** First time strictly after `now` of the series base + k * period. */
  private nextOf(base: number, period: number, now: number): number {
    if (now < base) return base;
    return base + (Math.floor((now - base) / period) + 1) * period;
  }

  sundayAfter = (now: number) => this.nextOf(this.origin + (this.options.sundayAfterMs ?? 6 * DAY), this.options.sundayEveryMs ?? 7 * DAY, now);
  dailyAfter = (now: number) => this.nextOf(this.origin + (this.options.dailyAfterMs ?? 9 * HOUR), DAY, now);

  named(name: keyof CheckinActivities): Call[] {
    return this.calls.filter((c) => c.name === name);
  }
  notifies(kind: string): Call[] {
    return this.named("notify").filter((c) => c.input.kind === kind);
  }
  /** Names in call order, for sequence assertions. `notify` is shown as `notify:<kind>`. */
  sequence(): string[] {
    return this.calls.map((c) => (c.name === "notify" ? `notify:${String(c.input.kind)}` : c.name));
  }

  /** Records the call, then defers to the handler. The workflow code's `Date.now()` is not used here. */
  private record<K extends keyof CheckinActivities>(
    name: K,
    handler: (input: Parameters<CheckinActivities[K]>[0]) => ReturnType<CheckinActivities[K]>,
  ): CheckinActivities[K] {
    return (async (input: Parameters<CheckinActivities[K]>[0]) => {
      this.calls.push({ name, input: (input ?? {}) as Record<string, unknown>, attempt: Context.current().info.attempt });
      return handler(input);
    }) as unknown as CheckinActivities[K];
  }

  activities(testEnv: TestWorkflowEnvironment): CheckinActivities {
    const o = typeof this.options.overrides === "function" ? this.options.overrides(this) : (this.options.overrides ?? {});
    const base: CheckinActivities = {
      schedule: this.record("schedule", async () => {
        const now = await this.now();
        return {
          stop: false,
          timeZone: "UTC",
          nextCheckinAt: new Date(this.sundayAfter(now)).toISOString(),
          nextDailyAt: new Date(this.dailyAfter(now)).toISOString(),
        } satisfies ScheduleResult;
      }),
      review: this.record("review", async (input): Promise<ReviewResult> => {
        // One week per fake Sunday, so a repeated step reviews the same week (like the real server).
        const week = 1 + Math.max(0, Math.round((Date.parse(input.scheduledFor) - this.origin - (this.options.sundayAfterMs ?? 6 * DAY)) / (this.options.sundayEveryMs ?? 7 * DAY)));
        return {
        skip: false,
        reviewWeek: week,
        targetWeek: week + 1,
        anchor: input.scheduledFor,
        review: { reviewWeek: week, scheduledDays: [], completedDays: [], missedDays: [], sessions: [], notes: [], recommendations: [] },
        };
      }),
      draft: this.record("draft", async (input): Promise<DraftResult> => {
        const anchor = Date.parse(input.anchor);
        return {
          reused: false,
          checkin: {
            id: `checkin-${input.reviewWeek}`, // idempotent per week, like the real draft op
            status: "pending",
            reminderAt: new Date(anchor + 13 * HOUR).toISOString(),
            expiresAt: new Date(anchor + 30 * HOUR).toISOString(),
            changeCount: this.options.changeCount ?? 3,
          },
        };
      }),
      notify: this.record("notify", async (): Promise<NotifyResult> => ({ sent: 1 })),
      apply: this.record("apply", async (): Promise<ApplyResult> => ({
        status: "partial",
        applied: [{ id: "c1", day: "Monday" }],
        skipped: [{ id: "c2", day: "Tuesday", reason: "changed_since_draft" }],
        alreadyDecided: false,
      })),
      expire: this.record("expire", async (): Promise<ExpireResult> => ({ status: "expired", expired: true })),
      missedCheck: this.record("missedCheck", async (): Promise<MissedCheckResult> => ({ offer: null, created: false, reason: "rest_day" })),
      missedApply: this.record("missedApply", async (): Promise<MissedApplyResult> => ({
        status: "accepted",
        fromDay: "Tuesday",
        toDay: "Thursday",
        alreadyDecided: false,
      })),
      devFastForwardAllowed: this.record("devFastForwardAllowed", async () => true),
    };
    // Overrides are wrapped in the same recorder, so tests can change behaviour without losing the log.
    const wrapped = { ...base };
    for (const name of Object.keys(o) as Array<keyof CheckinActivities>) {
      const fn = o[name] as (input: never) => Promise<unknown>;
      (wrapped as Record<string, unknown>)[name] = this.record(name, fn as never);
    }
    return wrapped;
  }
}

export interface Running {
  world: World;
  testEnv: TestWorkflowEnvironment;
  client: Client;
  workflowId: string;
  /** Starts the coach loop for USER_ID. */
  start(input?: Partial<CoachLoopInput>): Promise<WorkflowHandleWithFirstExecutionRunId>;
  /** The handle for the user's workflow, following continue-as-new to the newest run. */
  latest(): WorkflowHandle;
  state(): Promise<WorkflowState>;
  /** Moves the test server's clock forward; time-skipping only happens while this awaits. */
  skip(ms: number): Promise<void>;
  /** Polls (in real time) until `check` is truthy. */
  eventually<T>(check: () => T | Promise<T>, what: string, timeoutMs?: number): Promise<NonNullable<T>>;
}

export async function withWorld(
  options: WorldOptions,
  body: (running: Running) => Promise<void>,
  testEnvIn?: TestWorkflowEnvironment,
): Promise<World> {
  const testEnv =
    testEnvIn ??
    (await TestWorkflowEnvironment.createTimeSkipping({
      client: options.dataConverter ? { dataConverter: options.dataConverter } : undefined,
    }));
  const origin = await testEnv.currentTimeMs();
  const world = new World(origin, options);
  world.now = () => testEnv.currentTimeMs();
  const taskQueue = `${TASK_QUEUE}-${Math.random().toString(36).slice(2)}`;
  const worker = await Worker.create({
    connection: testEnv.nativeConnection,
    taskQueue,
    workflowBundle: await workflowBundle(options.dataConverter),
    activities: world.activities(testEnv),
    dataConverter: options.dataConverter,
  });
  const workflowId = workflowIdFor(USER_ID);
  const client = testEnv.client;

  const running: Running = {
    world,
    testEnv,
    client,
    workflowId,
    start: (input) =>
      client.workflow.start(WORKFLOW_TYPE, {
        taskQueue,
        workflowId,
        args: [{ userId: USER_ID, ...input } satisfies CoachLoopInput],
      }),
    latest: () => client.workflow.getHandle(workflowId),
    state: () => running.latest().query<WorkflowState>(QUERY_GET_STATE),
    skip: (ms) => testEnv.sleep(ms),
    async eventually(check, what, timeoutMs = 20_000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const value = await check();
        if (value) return value as NonNullable<typeof value>;
        if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${what}\ncalls: ${world.sequence().join(", ")}`);
        await realSleep(25);
      }
    },
  };

  try {
    await worker.runUntil(async () => {
      try {
        await body(running);
      } finally {
        // Leave nothing running: end the workflow if the test did not.
        try {
          const handle = running.latest();
          const { status } = await handle.describe();
          if (status.name === "RUNNING") await handle.terminate("test over");
        } catch {
          // The workflow never started, or is gone.
        }
      }
    });
  } finally {
    if (!testEnvIn) await testEnv.teardown();
  }
  return world;
}

export type { CoachLoopResult };
