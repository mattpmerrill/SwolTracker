import { ApplicationFailure } from "@temporalio/activity";
import { MockActivityEnvironment } from "@temporalio/testing";
import { describe, expect, it } from "vitest";
import { createActivities, failureForResponse } from "../src/activities.js";

const SECRET = "test-secret-value";
const URL_BASE = "https://example.test";

function stubFetch(status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    seen.url = String(url);
    seen.init = init;
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
}

/** Runs one activity inside a fake activity context (attempt 3 of a workflow run). */
function inActivity<T>(fn: () => Promise<T>): Promise<T> {
  const env = new MockActivityEnvironment({ attempt: 3, workflowExecution: { workflowId: "coach-u1", runId: "run-9" } });
  return env.run(fn);
}

describe("callWorkerApi", () => {
  it("posts the envelope, the op fields and the bearer secret", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const activities = createActivities({
      apiUrl: `${URL_BASE}/`,
      secret: SECRET,
      fetch: stubFetch(200, { stop: false, timeZone: "UTC", nextCheckinAt: "a", nextDailyAt: "b" }, seen),
    });
    const result = await inActivity(() => activities.schedule({ userId: "u1", instigation: "schedule" }));

    expect(result).toMatchObject({ stop: false });
    expect(seen.url).toBe(`${URL_BASE}/api/checkin-worker`);
    const headers = seen.init!.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(JSON.parse(seen.init!.body as string)).toEqual({
      op: "schedule",
      userId: "u1",
      instigation: "schedule",
      workflowId: "coach-u1",
      runId: "run-9",
      attempt: 3,
    });
  });

  it("maps op names (missedCheck -> missed_check) and passes the op's own fields", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const activities = createActivities({ apiUrl: URL_BASE, secret: SECRET, fetch: stubFetch(200, { offer: null, created: false }, seen) });
    await inActivity(() => activities.missedCheck({ userId: "u1", instigation: "day_missed", week: 2, day: "Friday" }));
    expect(JSON.parse(seen.init!.body as string)).toMatchObject({ op: "missed_check", week: 2, day: "Friday", instigation: "day_missed" });
  });

  it.each([
    [400, "BadRequest"],
    [403, "NotEligible"],
    [404, "NotFound"],
    [409, "Conflict"],
  ])("HTTP %i is a non-retryable %s with the server's text", async (status, type) => {
    const activities = createActivities({ apiUrl: URL_BASE, secret: SECRET, fetch: stubFetch(status, { error: "Nope, because." }) });
    const error = await inActivity(() => activities.apply({ userId: "u1", instigation: "user_action", checkinId: "c", acceptIds: [] })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApplicationFailure);
    expect(error).toMatchObject({ type, nonRetryable: true, message: "Nope, because." });
  });

  it("a bare 404 (no JSON error) is a Misconfigured route, not NotFound", () => {
    expect(failureForResponse(404, null, "apply")).toMatchObject({ type: "Misconfigured", nonRetryable: true });
    expect(failureForResponse(404, "<html>404</html>", "apply")).toMatchObject({ type: "Misconfigured" });
    expect(failureForResponse(404, { error: "No such check-in." }, "apply")).toMatchObject({ type: "NotFound", message: "No such check-in." });
  });

  it("401 and a JSON 500 (our own configuration error) are permanent too", () => {
    expect(failureForResponse(401, { error: "Unauthorized." }, "apply")).toMatchObject({ type: "Unauthorized", nonRetryable: true });
    expect(failureForResponse(500, { error: "CHECKIN_WORKER_SECRET not configured." }, "apply")).toMatchObject({
      type: "Misconfigured",
      nonRetryable: true,
    });
  });

  it.each([
    [503, { error: "Upstream failure. Try again." }],
    [429, null],
    [502, "<html>Bad gateway</html>"],
    [500, "<html>FUNCTION_INVOCATION_FAILED</html>"],
  ])("HTTP %i is retryable (a plain Error)", async (status, body) => {
    const activities = createActivities({ apiUrl: URL_BASE, secret: SECRET, fetch: stubFetch(status, body ?? "") });
    const error = await inActivity(() => activities.expire({ userId: "u1", instigation: "schedule", checkinId: "c" })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ApplicationFailure);
    expect((error as Error).message).toContain(String(status));
  });

  it("a network error is retryable and leaks neither the URL nor the secret", async () => {
    const failing = (async () => {
      throw new TypeError(`fetch failed ${URL_BASE} Bearer ${SECRET}`);
    }) as typeof fetch;
    const activities = createActivities({ apiUrl: URL_BASE, secret: SECRET, fetch: failing });
    const error = (await inActivity(() => activities.notify({ userId: "u1", instigation: "schedule", kind: "ready", checkinId: "c" })).catch((e: unknown) => e)) as Error;
    expect(error).not.toBeInstanceOf(ApplicationFailure);
    expect(error.message).not.toContain(SECRET);
    expect(error.message).not.toContain(URL_BASE);
  });

  it("a 200 with a body that is not the contract's shape is a non-retryable BadResponse that does not echo the body", async () => {
    const wrong = createActivities({ apiUrl: URL_BASE, secret: SECRET, fetch: stubFetch(200, { stop: "maybe", secretish: "user-data-123" }) });
    const error = await inActivity(() => wrong.schedule({ userId: "u1", instigation: "schedule" })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApplicationFailure);
    expect(error).toMatchObject({ type: "BadResponse", nonRetryable: true });
    expect((error as Error).message).not.toContain("user-data-123");

    const notJson = createActivities({ apiUrl: URL_BASE, secret: SECRET, fetch: stubFetch(200, "<html>ok</html>") });
    await expect(inActivity(() => notJson.schedule({ userId: "u1", instigation: "schedule" }))).rejects.toMatchObject({ type: "BadResponse" });
  });

  it("accepts a valid body for every op shape it is asked for", async () => {
    const draft = createActivities({
      apiUrl: URL_BASE,
      secret: SECRET,
      fetch: stubFetch(200, { reused: false, checkin: { id: "c", status: "pending", reminderAt: "2026-11-02T14:00:00.000Z", expiresAt: null, changeCount: 2 }, extra: 1 }),
    });
    const result = await inActivity(() =>
      draft.draft({ userId: "u1", instigation: "schedule", reviewWeek: 1, targetWeek: 2, anchor: "2026-11-01T01:00:00.000Z", review: {
        reviewWeek: 1, scheduledDays: [], completedDays: [], missedDays: [], sessions: [], notes: [], recommendations: [] } }),
    );
    expect(result.checkin).toMatchObject({ id: "c", status: "pending", changeCount: 2 });
  });

  it("devFastForwardAllowed is off in production and against Temporal Cloud", async () => {
    const activities = createActivities({ apiUrl: URL_BASE, secret: SECRET });
    const saved = { env: process.env.NODE_ENV, key: process.env.TEMPORAL_API_KEY };
    try {
      delete process.env.TEMPORAL_API_KEY;
      process.env.NODE_ENV = "production";
      expect(await activities.devFastForwardAllowed()).toBe(false);
      process.env.NODE_ENV = "development";
      expect(await activities.devFastForwardAllowed()).toBe(true);
      process.env.TEMPORAL_API_KEY = "cloud-key";
      expect(await activities.devFastForwardAllowed()).toBe(false);
    } finally {
      process.env.NODE_ENV = saved.env;
      if (saved.key === undefined) delete process.env.TEMPORAL_API_KEY;
      else process.env.TEMPORAL_API_KEY = saved.key;
    }
  });
});
