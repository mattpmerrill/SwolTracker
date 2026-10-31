import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { devFastForwardAllowed, readTemporalConfig, readWorkerEnv } from "../src/config.js";

const run = promisify(execFile);
const KEY = Buffer.alloc(32, 3).toString("base64");

describe("readWorkerEnv", () => {
  it("returns the two required values", () => {
    expect(readWorkerEnv({ SWOLTRACKER_API_URL: " http://localhost:3000 ", CHECKIN_WORKER_SECRET: " s " })).toEqual({
      apiUrl: "http://localhost:3000",
      secret: "s",
    });
  });

  it("names what is missing or wrong, in one error", () => {
    expect(() => readWorkerEnv({})).toThrow(/SWOLTRACKER_API_URL is missing.*CHECKIN_WORKER_SECRET is missing/);
    expect(() => readWorkerEnv({ SWOLTRACKER_API_URL: "not a url", CHECKIN_WORKER_SECRET: "s" })).toThrow(/must be a URL/);
    expect(() => readWorkerEnv({ SWOLTRACKER_API_URL: "ftp://x.test", CHECKIN_WORKER_SECRET: "s" })).toThrow(/http/);
    expect(() => readWorkerEnv({ SWOLTRACKER_API_URL: "http://x.test", CHECKIN_WORKER_SECRET: "  " })).toThrow(/empty/);
  });
});

describe("readTemporalConfig", () => {
  it("defaults to the local dev server and treats empty strings as unset", () => {
    expect(readTemporalConfig({ TEMPORAL_ADDRESS: "", TEMPORAL_NAMESPACE: "", TEMPORAL_API_KEY: "", CHECKIN_CODEC_KEY: "" })).toEqual({
      address: "localhost:7233",
      namespace: "default",
      apiKey: undefined,
      codecKey: undefined,
    });
  });

  it("needs the codec key whenever there is an API key", () => {
    expect(() => readTemporalConfig({ TEMPORAL_API_KEY: "k" })).toThrow(/CHECKIN_CODEC_KEY/);
    expect(readTemporalConfig({ TEMPORAL_API_KEY: "k", CHECKIN_CODEC_KEY: KEY, TEMPORAL_NAMESPACE: "ns.acct" }).namespace).toBe("ns.acct");
  });
});

describe("devFastForwardAllowed", () => {
  it("is on only for a local, non-production worker", () => {
    expect(devFastForwardAllowed({})).toBe(true);
    expect(devFastForwardAllowed({ NODE_ENV: "development" })).toBe(true);
    expect(devFastForwardAllowed({ NODE_ENV: "production" })).toBe(false);
    expect(devFastForwardAllowed({ TEMPORAL_API_KEY: "k" })).toBe(false);
    expect(devFastForwardAllowed({ TEMPORAL_API_KEY: "  " })).toBe(true);
  });
});

describe("dev:start-loop --fast", () => {
  it("refuses to run against Temporal Cloud (before connecting to anything)", async () => {
    const script = fileURLToPath(new URL("../src/dev/start-loop.ts", import.meta.url));
    const tsx = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
    const error = await run(tsx, [script, "00000000-0000-4000-8000-000000000000", "--fast", "checkin=5s"], {
      env: { ...process.env, TEMPORAL_API_KEY: "cloud-key", CHECKIN_CODEC_KEY: KEY },
    }).catch((e: { code?: number; stderr?: string }) => e);
    expect(error).toMatchObject({ code: 2 });
    expect((error as { stderr: string }).stderr).toMatch(/Refusing --fast/);
  });
});
