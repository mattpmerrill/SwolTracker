import { writeFileSync } from "node:fs";
import { setTimeout as realSleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { ActivityFailure, ApplicationFailure, WorkflowUpdateFailedError, WorkflowUpdateStage } from "@temporalio/client";
import { historyToJSON } from "@temporalio/common/lib/proto-utils";
import { describe, expect, it } from "vitest";
import {
  SIGNAL_DAY_MISSED,
  SIGNAL_SET_ENABLED,
  UPDATE_ANSWER_MISSED_DAY,
  UPDATE_DECIDE_CHECKIN,
  type DecideInput,
  type DecideResult,
  type MissedAnswer,
  type MissedResult,
} from "../../shared/checkin-contract.js";
import type { CoachLoopResult } from "../src/workflows/coachLoop.js";
import { DAY, HOUR, MINUTE, withWorld, type Running } from "./harness.js";

// A fresh time-skipping test server per test. Sharing one across tests made a later test's
// clock stop advancing after an earlier test ended with a terminated workflow (verified: same
// two tests pass in either order with separate servers, and hang with one shared server).
const run = (options: Parameters<typeof withWorld>[0], body: (r: Running) => Promise<void>) => withWorld(options, body);

// No daily missed-day check unless the test asks for one.
const NO_DAILY = { dailyAfterMs: 10_000 * DAY };

const decide = (r: Running, checkinId: string, acceptIds: string[]) =>
  r.latest().executeUpdate<DecideResult, [DecideInput]>(UPDATE_DECIDE_CHECKIN, { args: [{ checkinId, acceptIds }] });
const answer = (r: Running, offerId: string, accept: boolean) =>
  r.latest().executeUpdate<MissedResult, [MissedAnswer]>(UPDATE_ANSWER_MISSED_DAY, { args: [{ offerId, accept }] });

/** Sleeps past the first Sunday and waits for the "ready" push, i.e. a tracked pending check-in. */
async function reachFirstCheckin(r: Running) {
  await r.start();
  await r.skip(6 * DAY + MINUTE);
  await r.eventually(() => r.world.notifies("ready").length === 1, "the ready push");
  return (await r.state()).checkin!;
}

const runIdOf = async (r: Running) => (await r.latest().describe()).runId;

function rejection(error: unknown): ApplicationFailure {
  expect(error).toBeInstanceOf(WorkflowUpdateFailedError);
  const cause = (error as WorkflowUpdateFailedError).cause;
  expect(cause).toBeInstanceOf(ApplicationFailure);
  return cause as ApplicationFailure;
}

describe("coachLoopWorkflow", () => {
  it("runs the week: Sunday review, draft, push, a partial decision, then continues as new", async () => {
    await run(NO_DAILY, async (r) => {
      const first = await r.start();
      const firstRun = first.firstExecutionRunId;
      await r.skip(6 * DAY + MINUTE);
      await r.eventually(() => r.world.notifies("ready").length === 1, "the ready push");

      expect(r.world.sequence().filter((n) => n !== "schedule")).toEqual(["review", "draft", "notify:ready"]);
      const review = r.world.named("review")[0]!;
      // The review is told the Sunday it slept until, not "now".
      expect(Date.parse(review.input.scheduledFor as string)).toBe(r.world.origin + 6 * DAY);
      expect(r.world.named("draft")[0]!.input).toMatchObject({ reviewWeek: 1, targetWeek: 2 });

      const state = await r.state();
      expect(state.checkin).toMatchObject({ id: "checkin-1", reminded: false });
      expect(state.enabled).toBe(true);

      const result = await decide(r, "checkin-1", ["c1"]);
      // The API gets the contract's DecideResult, without the server's alreadyDecided flag.
      expect(result).toEqual({
        status: "partial",
        applied: [{ id: "c1", day: "Monday" }],
        skipped: [{ id: "c2", day: "Tuesday", reason: "changed_since_draft" }],
      });
      expect(r.world.named("apply")[0]!.input).toMatchObject({ checkinId: "checkin-1", acceptIds: ["c1"], instigation: "user_action" });

      // A resolved check-in starts a new run (fresh history) in the same workflow id.
      const secondRun = await r.eventually(async () => {
        const id = await runIdOf(r);
        return id !== firstRun ? id : null;
      }, "continue-as-new");
      expect((await r.state()).checkin).toBeNull();

      // No reminder or expiry for a decided check-in, even after its deadlines pass.
      await r.skip(2 * DAY);
      expect(r.world.notifies("reminder")).toHaveLength(0);
      expect(r.world.named("expire")).toHaveLength(0);

      await r.latest().signal(SIGNAL_SET_ENABLED, false);
      expect(await r.latest().result()).toEqual({ ended: "disabled" } satisfies CoachLoopResult);

      if (process.env.UPDATE_FIXTURES) {
        // Both runs: the first holds the timers, the Update and continue-as-new; the second starts
        // from carried input.
        const record = async (runId: string, name: string) =>
          writeFileSync(fixturePath(name), historyToJSON(await r.client.workflow.getHandle(r.workflowId, runId).fetchHistory()));
        await record(firstRun, "happy-path.json");
        await record(secondRun, "after-continue-as-new.json");
      }
    });
  });

  it("sends one Monday reminder, then expires a check-in nobody answered", async () => {
    await run(NO_DAILY, async (r) => {
      const first = await r.start();
      await r.skip(6 * DAY + MINUTE);
      await r.eventually(() => r.world.notifies("ready").length === 1, "the ready push");
      const firstRun = first.firstExecutionRunId;

      await r.skip(13 * HOUR); // Monday 07:00
      await r.eventually(() => r.world.notifies("reminder").length === 1, "the reminder");
      expect(r.world.notifies("reminder")[0]!.input).toMatchObject({ checkinId: "checkin-1" });
      expect((await r.state()).checkin?.reminded).toBe(true);

      await r.skip(17 * HOUR + 5 * MINUTE); // past Monday 23:59
      await r.eventually(() => r.world.named("expire").length === 1, "the expiry");
      expect(r.world.named("expire")[0]!.input).toMatchObject({ checkinId: "checkin-1", instigation: "schedule" });
      expect(r.world.notifies("reminder")).toHaveLength(1);
      await r.eventually(async () => (await runIdOf(r)) !== firstRun, "continue-as-new after expiry");
      expect((await r.state()).checkin).toBeNull();

      if (process.env.UPDATE_FIXTURES) {
        writeFileSync(fixturePath("expiry.json"), historyToJSON(await r.client.workflow.getHandle(r.workflowId, firstRun).fetchHistory()));
      }
    });
  });

  it("never reminds about a check-in with no changes, but still expires it", async () => {
    await run({ ...NO_DAILY, changeCount: 0 }, async (r) => {
      await reachFirstCheckin(r);
      await r.skip(14 * HOUR); // well past the reminder time
      expect(r.world.notifies("reminder")).toHaveLength(0);
      await r.skip(17 * HOUR);
      await r.eventually(() => r.world.named("expire").length === 1, "the expiry");
      expect(r.world.notifies("reminder")).toHaveLength(0);
    });
  });

  it("declines when the user skips the week", async () => {
    await run(
      {
        ...NO_DAILY,
        overrides: {
          apply: async () => ({ status: "declined", applied: [], skipped: [], alreadyDecided: false }),
        },
      },
      async (r) => {
        const checkin = await reachFirstCheckin(r);
        const result = await decide(r, checkin.id, []);
        expect(result).toEqual({ status: "declined", applied: [], skipped: [] });
        expect(r.world.named("apply")[0]!.input.acceptIds).toEqual([]);
        await r.eventually(async () => (await r.state()).checkin === null, "the check-in to close");
      },
    );
  });

  it("does nothing more when the review says the window closed", async () => {
    await run(
      { ...NO_DAILY, overrides: { review: async () => ({ skip: true, reason: "window_closed" }) } },
      async (r) => {
        await r.start();
        await r.skip(6 * DAY + MINUTE);
        await r.eventually(() => r.world.named("review").length === 1, "the review");
        // Let the loop settle: it re-plans (schedule) but never drafts or notifies.
        await r.eventually(async () => (await r.state()).nextCheckinAt !== null, "the loop to re-plan");
        expect(r.world.named("draft")).toHaveLength(0);
        expect(r.world.named("notify")).toHaveLength(0);
        expect((await r.state()).checkin).toBeNull();
        // The next Sunday is a week later, so it is not retried in the meantime.
        expect(r.world.named("review")).toHaveLength(1);
      },
    );
  });

  it("does not run a Sunday twice when schedule hands back the time that just fired", async () => {
    await run(
      {
        ...NO_DAILY,
        overrides: (world) => ({
          // An API whose clock lags Temporal's: the "next" Sunday never moves on.
          schedule: async () => ({
            stop: false,
            timeZone: "UTC",
            nextCheckinAt: new Date(world.origin + 6 * DAY).toISOString(),
            nextDailyAt: new Date(world.origin + 10_000 * DAY).toISOString(),
          }),
        }),
      },
      async (r) => {
        await r.start();
        await r.skip(6 * DAY + 10 * MINUTE);
        await r.eventually(() => r.world.notifies("ready").length === 1, "the ready push");
        await r.skip(30 * MINUTE);
        expect(r.world.named("review")).toHaveLength(1);
        expect(r.world.named("draft")).toHaveLength(1);
        // It keeps asking (about once a minute) instead of spinning.
        expect(r.world.named("schedule").length).toBeGreaterThan(2);
        expect(r.world.named("schedule").length).toBeLessThan(60);
      },
    );
  });

  it("does not track or notify about a reused check-in that is already finished", async () => {
    await run(
      {
        ...NO_DAILY,
        overrides: {
          draft: async () => ({
            reused: true,
            checkin: { id: "old", status: "applied", reminderAt: null, expiresAt: null, changeCount: 2 },
          }),
        },
      },
      async (r) => {
        await r.start();
        await r.skip(6 * DAY + MINUTE);
        await r.eventually(() => r.world.named("draft").length === 1, "the draft");
        await r.eventually(async () => (await r.state()).nextCheckinAt !== null, "the loop to re-plan");
        expect(r.world.named("notify")).toHaveLength(0);
        expect((await r.state()).checkin).toBeNull();
      },
    );
  });

  describe("update validators", () => {
    it("rejects a stale id without running an activity", async () => {
      await run(NO_DAILY, async (r) => {
        await reachFirstCheckin(r);
        const error = await decide(r, "some-old-checkin", ["c1"]).catch((e: unknown) => e);
        expect(rejection(error).message).toMatch(/not open/);
        expect(r.world.named("apply")).toHaveLength(0);
        // The real check-in is untouched.
        expect((await r.state()).checkin?.id).toBe("checkin-1");
      });
    });

    it("rejects more ticks than the check-in has changes, and the same change twice", async () => {
      await run({ ...NO_DAILY, changeCount: 2 }, async (r) => {
        await reachFirstCheckin(r);
        const tooMany = await decide(r, "checkin-1", ["c1", "c2", "c3"]).catch((e: unknown) => e);
        expect(rejection(tooMany).type).toBe("BadRequest");
        const twice = await decide(r, "checkin-1", ["c1", "c1"]).catch((e: unknown) => e);
        expect(rejection(twice).type).toBe("BadRequest");
        expect(r.world.named("apply")).toHaveLength(0);
      });
    });

    it("rejects a second decision while the first is being applied, and after it is done", async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      await run(
        {
          ...NO_DAILY,
          overrides: {
            apply: async () => {
              await gate;
              return { status: "applied", applied: [{ id: "c1", day: "Monday" }], skipped: [], alreadyDecided: false };
            },
          },
        },
        async (r) => {
          await reachFirstCheckin(r);
          const first = await r.latest().startUpdate<DecideResult, [DecideInput]>(UPDATE_DECIDE_CHECKIN, {
            args: [{ checkinId: "checkin-1", acceptIds: ["c1"] }],
            waitForStage: WorkflowUpdateStage.ACCEPTED,
          });
          await r.eventually(async () => (await r.state()).applying, "the apply to be in flight");

          const second = await decide(r, "checkin-1", ["c1"]).catch((e: unknown) => e);
          expect(rejection(second).message).toMatch(/being decided/);

          release();
          expect(await first.result()).toMatchObject({ status: "applied" });
          expect(r.world.named("apply")).toHaveLength(1);

          const third = await decide(r, "checkin-1", ["c1"]).catch((e: unknown) => e);
          expect(rejection(third).message).toMatch(/not open/);
          expect(r.world.named("apply")).toHaveLength(1);
        },
      );
    });
  });

  // These two use the dev fast-forward on real time (a few seconds), because the test server cannot
  // skip time while an activity is held open, and the point is a deadline passing mid-decision.
  describe("a decision in flight when its deadlines pass", () => {
    // Generous (a loaded CI machine can stall a second or two between steps), still only seconds.
    const FAST = { checkinAfterMs: 500, reminderAfterMs: 3_000, expireAfterMs: 6_000 };

    it("does not spin: the overdue reminder and expiry wait for the decision to finish", async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      await run(
        {
          ...NO_DAILY,
          overrides: {
            apply: async () => {
              await gate;
              return { status: "applied", applied: [{ id: "c1", day: "Monday" }], skipped: [], alreadyDecided: false };
            },
          },
        },
        async (r) => {
          await r.start({ devFastForward: FAST });
          await r.eventually(async () => (await r.state()).checkin, "the forced check-in");
          const update = await r.latest().startUpdate<DecideResult, [DecideInput]>(UPDATE_DECIDE_CHECKIN, {
            args: [{ checkinId: "checkin-1", acceptIds: ["c1"] }],
            waitForStage: WorkflowUpdateStage.ACCEPTED,
          });
          await r.eventually(async () => (await r.state()).applying, "the apply to be in flight");
          const schedulesBefore = r.world.named("schedule").length;

          await realSleep(7_000); // past the reminder (3 s) and the expiry (6 s)
          release();
          expect(await update.result()).toMatchObject({ status: "applied" });

          // A spinning loop made hundreds of schedule calls in this window. Allow a few passes.
          expect(r.world.named("schedule").length - schedulesBefore).toBeLessThanOrEqual(3);
          // The decided check-in is never expired or reminded about afterwards.
          expect(r.world.named("expire")).toHaveLength(0);
          expect(r.world.notifies("reminder")).toHaveLength(0);
        },
      );
    });

    it("an offer expiring mid-decision does not release the check-in's lock", async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      await run(
        {
          ...NO_DAILY,
          overrides: {
            apply: async () => {
              await gate;
              return { status: "applied", applied: [{ id: "c1", day: "Monday" }], skipped: [], alreadyDecided: false };
            },
            missedCheck: async () => ({
              offer: { id: "offer-lock", week: 1, fromDay: "Tuesday" as const, toDay: "Thursday" as const, status: "pending" as const, expiresAt: null },
              created: true,
            }),
          },
        },
        async (r) => {
          await r.start({ devFastForward: FAST });
          await r.eventually(async () => (await r.state()).checkin, "the forced check-in");
          const update = await r.latest().startUpdate<DecideResult, [DecideInput]>(UPDATE_DECIDE_CHECKIN, {
            args: [{ checkinId: "checkin-1", acceptIds: ["c1"] }],
            waitForStage: WorkflowUpdateStage.ACCEPTED,
          });
          await r.eventually(async () => (await r.state()).applying, "the apply to be in flight");

          // An offer appears (it expires 6 s after it is made, like the check-in) while the decision is open.
          await r.latest().signal(SIGNAL_DAY_MISSED, { week: 1, day: "Tuesday" });
          await r.eventually(async () => (await r.state()).offer?.id === "offer-lock", "the offer");
          await r.eventually(() => r.world.named("expire").some((c) => c.input.offerId === "offer-lock"), "the offer expiry", 15_000);
          await r.eventually(async () => (await r.state()).offer === null, "the offer to clear");

          // The offer's expiry is over, the check-in decision is not: still locked, still not expired.
          expect((await r.state()).applying).toBe(true);
          const second = await decide(r, "checkin-1", ["c1"]).catch((e: unknown) => e);
          expect(rejection(second).message).toMatch(/being decided/);
          expect(r.world.named("apply")).toHaveLength(1);
          release();
          expect(await update.result()).toMatchObject({ status: "applied" });
          expect(r.world.named("expire").some((c) => c.input.checkinId === "checkin-1")).toBe(false);
        },
      );
    });
  });

  describe("configuration failures do not drop open work", () => {
    const unauthorized = () => ApplicationFailure.nonRetryable("The worker API refused CHECKIN_WORKER_SECRET.", "Unauthorized");

    it("an Unauthorized expiry keeps the check-in and tries again after the cooldown", async () => {
      let failures = 0;
      await run(
        {
          ...NO_DAILY,
          overrides: {
            expire: async () => {
              if (failures < 1) {
                failures += 1;
                throw unauthorized();
              }
              return { status: "expired" as const, expired: true };
            },
          },
        },
        async (r) => {
          await reachFirstCheckin(r);
          await r.skip(30 * HOUR); // past the expiry
          await r.eventually(() => r.world.named("expire").length === 1, "the first expiry attempt");
          // One 401 must not make the loop forget a check-in that is still pending in the database.
          await r.eventually(async () => (await r.state()).checkin?.id === "checkin-1", "the check-in to stay tracked");
          await r.skip(6 * MINUTE);
          await r.eventually(() => r.world.named("expire").length === 2, "the retry after the cooldown");
          await r.eventually(async () => (await r.state()).checkin === null, "the check-in to close");
        },
      );
    });

    it("a draft that fails with BadResponse is tried again, not dropped for the week", async () => {
      let calls = 0;
      await run(
        {
          ...NO_DAILY,
          overrides: {
            draft: async (input) => {
              calls += 1;
              if (calls === 1) throw ApplicationFailure.nonRetryable("unexpected body", "BadResponse");
              return {
                reused: false,
                checkin: { id: `checkin-${input.reviewWeek}`, status: "pending" as const, reminderAt: null, expiresAt: null, changeCount: 1 },
              };
            },
          },
        },
        async (r) => {
          await r.start();
          await r.skip(6 * DAY + MINUTE);
          await r.eventually(() => r.world.named("draft").length === 1, "the failing draft");
          expect((await r.state()).checkin).toBeNull();
          await r.skip(6 * MINUTE);
          await r.eventually(() => r.world.notifies("ready").length === 1, "the retry to succeed");
          expect((await r.state()).checkin?.id).toBe("checkin-1");
        },
      );
    });

    it("a permanent Conflict on expiry does close the check-in (the server already did)", async () => {
      await run(
        {
          ...NO_DAILY,
          overrides: {
            expire: async () => {
              throw ApplicationFailure.nonRetryable("That check-in is already decided.", "Conflict");
            },
          },
        },
        async (r) => {
          await reachFirstCheckin(r);
          await r.skip(30 * HOUR);
          await r.eventually(async () => (await r.state()).checkin === null, "the check-in to be forgotten");
          expect(r.world.named("expire")).toHaveLength(1);
        },
      );
    });
  });

  describe("Sunday and daily times", () => {
    it("a Sunday that arrives while the loop is busy is not lost when schedule answers late", async () => {
      await run(
        {
          dailyAfterMs: 10_000 * DAY,
          sundayAfterMs: 1_500, // real time: 1.5 s after the test starts
          overrides: {
            // A slow missed-day check keeps the loop busy past the Sunday that was due at 1.5 s.
            missedCheck: async () => {
              await realSleep(2_200);
              return { offer: null, created: false, reason: "rest_day" as const };
            },
          },
        },
        async (r) => {
          await r.start();
          await r.eventually(async () => (await r.state()).nextCheckinAt, "the first schedule");
          await r.latest().signal(SIGNAL_DAY_MISSED, { week: 1, day: "Tuesday" }); // wakes the loop at ~0.3 s
          // The next schedule answer is next week's Sunday (the 1.5 s one is already behind it).
          // Before the fix the loop overwrote the due time with it and skipped the check-in.
          await r.eventually(() => r.world.notifies("ready").length === 1, "the Sunday check-in", 10_000);
          expect(r.world.named("review")).toHaveLength(1);
        },
      );
    });

    it("a Sunday that arrives during the schedule call itself is not lost", async () => {
      let scheduleCalls = 0;
      await run(
        {
          dailyAfterMs: 10_000 * DAY,
          sundayAfterMs: 1_500,
          overrides: (world) => ({
            schedule: async () => {
              scheduleCalls += 1;
              // The second call (after the early signal) is slow, so the Sunday at 1.5 s passes while it runs.
              if (scheduleCalls === 2) await realSleep(2_200);
              const now = await world.now();
              return {
                stop: false as const,
                timeZone: "UTC",
                nextCheckinAt: new Date(world.sundayAfter(now)).toISOString(),
                nextDailyAt: new Date(world.dailyAfter(now)).toISOString(),
              };
            },
          }),
        },
        async (r) => {
          await r.start();
          await r.eventually(() => scheduleCalls >= 1, "the first schedule");
          await r.latest().signal(SIGNAL_DAY_MISSED, { week: 1, day: "Tuesday" });
          await r.eventually(() => r.world.notifies("ready").length === 1, "the Sunday check-in", 10_000);
          expect(r.world.named("review")).toHaveLength(1);
        },
      );
    });

    it("does not overwrite a tracked check-in whose expiry failed", async () => {
      let failExpire = true;
      await run(
        {
          dailyAfterMs: 10_000 * DAY,
          sundayAfterMs: HOUR,
          sundayEveryMs: 2 * HOUR,
          overrides: {
            expire: async () => {
              if (failExpire) throw ApplicationFailure.nonRetryable("The worker API refused CHECKIN_WORKER_SECRET.", "Unauthorized");
              return { status: "expired" as const, expired: true };
            },
          },
        },
        async (r) => {
          await r.start();
          await r.skip(HOUR + MINUTE);
          await r.eventually(() => r.world.notifies("ready").length === 1, "the first check-in");
          await r.skip(2 * HOUR); // the second Sunday arrives while the first is still open
          await r.eventually(() => r.world.named("expire").some((c) => c.input.checkinId === "checkin-1"), "the expiry attempt");
          // Closing the first failed, so the second is not tracked over it (that would orphan it).
          expect((await r.state()).checkin?.id).toBe("checkin-1");
          expect(r.world.notifies("ready")).toHaveLength(1);

          failExpire = false;
          await r.skip(10 * MINUTE);
          await r.eventually(async () => (await r.state()).checkin?.id === "checkin-2", "the second check-in to take over");
        },
      );
    });
  });

  describe("update failures", () => {
    it("surfaces a permanent Conflict as a non-retryable ApplicationFailure of that type, and forgets the check-in", async () => {
      await run(
        {
          ...NO_DAILY,
          overrides: {
            apply: async () => {
              throw ApplicationFailure.nonRetryable("This check-in has expired.", "Conflict");
            },
          },
        },
        async (r) => {
          await reachFirstCheckin(r);
          const error = await decide(r, "checkin-1", ["c1"]).catch((e: unknown) => e);
          const failure = rejection(error);
          expect(failure.type).toBe("Conflict");
          expect(failure.nonRetryable).toBe(true);
          expect(failure.message).toBe("This check-in has expired.");
          // Permanent means no retries.
          expect(r.world.named("apply")).toHaveLength(1);
          expect((await r.state()).checkin).toBeNull();
        },
      );
    });

    it("keeps the check-in open after a NotEligible refusal", async () => {
      await run(
        {
          ...NO_DAILY,
          overrides: {
            apply: async () => {
              throw ApplicationFailure.nonRetryable("Not eligible.", "NotEligible");
            },
          },
        },
        async (r) => {
          await reachFirstCheckin(r);
          const failure = rejection(await decide(r, "checkin-1", ["c1"]).catch((e: unknown) => e));
          expect(failure.type).toBe("NotEligible");
          expect((await r.state()).checkin?.id).toBe("checkin-1");
        },
      );
    });

    it("lets a transient failure through unwrapped, after retrying it", async () => {
      await run(
        {
          ...NO_DAILY,
          overrides: {
            apply: async () => {
              throw new Error("Worker API apply answered HTTP 503");
            },
          },
        },
        async (r) => {
          await reachFirstCheckin(r);
          const error = await decide(r, "checkin-1", ["c1"]).catch((e: unknown) => e);

          expect(error).toBeInstanceOf(WorkflowUpdateFailedError);
          const cause = (error as WorkflowUpdateFailedError).cause;
          // Not an ApplicationFailure at the top: that is how the API tells "refused" from "outage".
          expect(cause).toBeInstanceOf(ActivityFailure);
          expect(cause).not.toBeInstanceOf(ApplicationFailure);
          expect((cause as ActivityFailure).cause).toBeInstanceOf(ApplicationFailure);
          expect(((cause as ActivityFailure).cause as ApplicationFailure).type).not.toMatch(/^(BadRequest|NotEligible|NotFound|Conflict)$/);
          // Decisions retry briefly (3 attempts) so they finish inside the API's ~15 s Update wait.
          expect(r.world.named("apply").map((c) => c.attempt)).toEqual([1, 2, 3]);
          // The check-in is still open; the user can tap Apply again once the API is back.
          expect((await r.state()).checkin?.id).toBe("checkin-1");
        },
      );
    });
  });

  describe("missed workouts", () => {
    const offer = (id: string, expiresInMs: number, now: number) => ({
      offer: {
        id,
        week: 1,
        fromDay: "Tuesday" as const,
        toDay: "Thursday" as const,
        status: "pending" as const,
        expiresAt: new Date(now + expiresInMs).toISOString(),
      },
      created: true,
    });

    it("the daily check creates an offer, pushes it, and an accept moves the workout", async () => {
      await run(
        {
          dailyAfterMs: 9 * HOUR,
          overrides: (world) => ({
            missedCheck: async () => offer("offer-1", 14 * HOUR, world.origin + 9 * HOUR),
          }),
        },
        async (r) => {
          await r.start();
          await r.skip(9 * HOUR + MINUTE);
          await r.eventually(() => r.world.notifies("missed").length === 1, "the missed-day push");
          expect(r.world.named("missedCheck")[0]!.input).toMatchObject({ instigation: "schedule" });
          expect(r.world.named("missedCheck")[0]!.input).not.toHaveProperty("week");
          expect(r.world.notifies("missed")[0]!.input).toMatchObject({ offerId: "offer-1" });
          expect((await r.state()).offer?.id).toBe("offer-1");

          expect(await answer(r, "offer-1", true)).toEqual({ status: "accepted", fromDay: "Tuesday", toDay: "Thursday" });
          expect(r.world.named("missedApply")[0]!.input).toMatchObject({ offerId: "offer-1", accept: true });
          expect((await r.state()).offer).toBeNull();
        },
      );
    });

    it("the dayMissed signal makes an offer straight away", async () => {
      await run(
        {
          ...NO_DAILY,
          overrides: (world) => ({ missedCheck: async () => offer("offer-2", 10 * HOUR, world.origin) }),
        },
        async (r) => {
          await r.start();
          await r.latest().signal(SIGNAL_DAY_MISSED, { week: 3, day: "Tuesday" });
          await r.eventually(() => r.world.notifies("missed").length === 1, "the missed-day push");
          expect(r.world.named("missedCheck")[0]!.input).toMatchObject({ week: 3, day: "Tuesday", instigation: "day_missed" });
          expect((await r.state()).offer?.id).toBe("offer-2");
        },
      );
    });

    it("does not push the same offer twice when the daily check finds it again", async () => {
      await run(
        {
          dailyAfterMs: 9 * HOUR,
          overrides: (world) => ({ missedCheck: async () => offer("offer-3", 30 * HOUR, world.origin) }),
        },
        async (r) => {
          await r.start();
          await r.latest().signal(SIGNAL_DAY_MISSED, { week: 1, day: "Tuesday" });
          await r.eventually(() => r.world.notifies("missed").length === 1, "the first push");
          await r.skip(9 * HOUR + MINUTE);
          await r.eventually(() => r.world.named("missedCheck").length >= 2, "the daily check");
          expect(r.world.notifies("missed")).toHaveLength(1);
        },
      );
    });

    it("expires an offer at the end of its day", async () => {
      await run(
        {
          dailyAfterMs: 9 * HOUR,
          overrides: (world) => ({
            missedCheck: async () => offer("offer-4", 14 * HOUR, world.origin + 9 * HOUR),
          }),
        },
        async (r) => {
          await r.start();
          await r.skip(9 * HOUR + MINUTE);
          await r.eventually(() => r.world.notifies("missed").length === 1, "the push");
          await r.skip(15 * HOUR);
          await r.eventually(() => r.world.named("expire").some((c) => c.input.offerId === "offer-4"), "the offer expiry");
        },
      );
    });

    it("drops the offer when the server closes it with a permanent Conflict", async () => {
      await run(
        {
          ...NO_DAILY,
          overrides: (world) => ({
            missedCheck: async () => offer("offer-5", 10 * HOUR, world.origin),
            missedApply: async () => {
              throw ApplicationFailure.nonRetryable("Tuesday changed, so nothing was moved.", "Conflict");
            },
          }),
        },
        async (r) => {
          await r.start();
          await r.latest().signal(SIGNAL_DAY_MISSED, { week: 1, day: "Tuesday" });
          await r.eventually(async () => (await r.state()).offer?.id === "offer-5", "the offer");
          const failure = rejection(await answer(r, "offer-5", true).catch((e: unknown) => e));
          expect(failure.type).toBe("Conflict");
          expect((await r.state()).offer).toBeNull();
        },
      );
    });
  });

  describe("turning Chad off", () => {
    it("expires what is open and completes", async () => {
      await run(NO_DAILY, async (r) => {
        const first = await r.start();
        await r.skip(6 * DAY + MINUTE);
        await r.eventually(() => r.world.notifies("ready").length === 1, "the ready push");
        await first.signal(SIGNAL_SET_ENABLED, false);
        expect(await first.result()).toEqual({ ended: "disabled" } satisfies CoachLoopResult);
        expect(r.world.named("expire").map((c) => c.input.checkinId)).toEqual(["checkin-1"]);
        // Nothing may be decided after it is off.
        expect((await first.describe()).status.name).toBe("COMPLETED");
      });
    });

    it("ends when the server says the user is no longer eligible", async () => {
      await run(
        { overrides: { schedule: async () => ({ stop: true, reason: "rollout" }) } },
        async (r) => {
          const handle = await r.start();
          expect(await handle.result()).toEqual({ ended: "ineligible", reason: "rollout" } satisfies CoachLoopResult);
        },
      );
    });
  });

  describe("retries and failures that do not kill the loop", () => {
    it("retries an activity that fails twice, then carries on", async () => {
      let failures = 0;
      await run(
        {
          overrides: (world) => ({
            schedule: async () => {
              if (failures < 2) {
                failures += 1;
                throw new Error("Worker API schedule answered HTTP 503");
              }
              const now = await world.now();
              return {
                stop: false,
                timeZone: "UTC",
                nextCheckinAt: new Date(world.sundayAfter(now)).toISOString(),
                nextDailyAt: new Date(world.dailyAfter(now)).toISOString(),
              };
            },
          }),
          dailyAfterMs: 10_000 * DAY,
        },
        async (r) => {
          await r.start();
          const state = await r.eventually(async () => {
            const s = await r.state();
            return s.nextCheckinAt ? s : null;
          }, "the schedule to succeed after two failures", 30_000);
          expect(state.nextCheckinAt).not.toBeNull();
          expect(r.world.named("schedule").map((c) => c.attempt)).toEqual([1, 2, 3]);
        },
      );
    });

    it("a push that fails for good does not stop the check-in", async () => {
      await run(
        {
          ...NO_DAILY,
          overrides: {
            notify: async () => {
              throw ApplicationFailure.nonRetryable("push is down", "NotFound");
            },
          },
        },
        async (r) => {
          await r.start();
          await r.skip(6 * DAY + MINUTE);
          const checkin = await r.eventually(async () => (await r.state()).checkin, "the tracked check-in");
          expect(checkin.id).toBe("checkin-1");
          expect(await decide(r, "checkin-1", ["c1"])).toMatchObject({ status: "partial" });
        },
      );
    });

    it("a draft that gives up leaves no open check-in and tries again next week, not in a loop", async () => {
      await run(
        {
          ...NO_DAILY,
          overrides: {
            draft: async () => {
              throw ApplicationFailure.nonRetryable("The model step failed.", "BadRequest");
            },
          },
        },
        async (r) => {
          await r.start();
          await r.skip(6 * DAY + MINUTE);
          await r.eventually(() => r.world.named("draft").length === 1, "the draft attempt");
          await r.eventually(async () => (await r.state()).nextCheckinAt !== null, "the loop to re-plan");
          expect(r.world.named("notify")).toHaveLength(0);
          expect((await r.state()).checkin).toBeNull();
          await r.skip(HOUR);
          expect(r.world.named("draft")).toHaveLength(1);
        },
      );
    });
  });

  describe("dev fast-forward", () => {
    it("runs the whole cycle in seconds when the worker allows it", async () => {
      await run(
        { ...NO_DAILY },
        async (r) => {
          await r.start({ devFastForward: { checkinAfterMs: 10_000, reminderAfterMs: 20_000, expireAfterMs: 40_000 } });
          await r.skip(11_000);
          await r.eventually(() => r.world.notifies("ready").length === 1, "the forced check-in");
          await r.skip(10_000);
          await r.eventually(() => r.world.notifies("reminder").length === 1, "the fast reminder");
          await r.skip(25_000);
          await r.eventually(() => r.world.named("expire").length === 1, "the fast expiry");
        },
      );
    });

    it("is ignored when the worker does not allow it (production)", async () => {
      await run(
        { ...NO_DAILY, overrides: { devFastForwardAllowed: async () => false } },
        async (r) => {
          await r.start({ devFastForward: { checkinAfterMs: 10_000 } });
          await r.skip(HOUR);
          expect(r.world.named("review")).toHaveLength(0);
          expect((await r.state()).nextCheckinAt).not.toBeNull();
        },
      );
    });
  });
});

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}
