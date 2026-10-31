// Determinism guard. test/fixtures/*.json are histories recorded from real test runs of
// coachLoopWorkflow (see test/coachLoop.test.ts). Replaying them against the current workflow code
// fails with a DeterminismViolationError if a change to the workflow would break running workflows.
//
// If you changed the workflow ON PURPOSE in a way that is incompatible with live histories, you need
// a patch (`patched()`) or Worker Versioning, not a new fixture. To re-record after a compatible
// change (e.g. new log lines): UPDATE_FIXTURES=1 npm test
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "@temporalio/worker";
import { describe, expect, it } from "vitest";
import { WORKFLOWS_PATH } from "../src/config.js";

const dir = fileURLToPath(new URL("./fixtures/", import.meta.url));
const fixtures = readdirSync(dir).filter((name) => name.endsWith(".json"));

describe("replay", () => {
  it("has recorded histories", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const name of fixtures) {
    it(`replays ${name} without a determinism violation`, async () => {
      const history = JSON.parse(readFileSync(`${dir}${name}`, "utf8"));
      await Worker.runReplayHistory({ workflowsPath: WORKFLOWS_PATH }, history);
    });
  }
});
