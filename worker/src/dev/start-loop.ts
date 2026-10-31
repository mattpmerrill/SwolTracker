// Starts (or attaches to) a user's coach loop, the same way the API does on "turn on":
// signal-with-start. Optionally fast-forwards the timers so a whole cycle takes a minute.
//
//   npm run dev:start-loop -- <userId>
//   npm run dev:start-loop -- <userId> --fast checkin=10s,reminder=30s,expire=60s,daily=20s
//
// --fast is DEV ONLY: refused here when TEMPORAL_API_KEY is set, and ignored by a worker running
// with NODE_ENV=production or a TEMPORAL_API_KEY. It only applies
// when this call STARTS the workflow; an already running one keeps its own timers, so run
// `npm run dev:stop -- <userId>` first. Forcing a check-in reviews the week that contains "now";
// the server allows one check-in per target week, so a second forced run in the same week reuses
// the first row (delete it in the database to start over).

import { WORKFLOW_TYPE, SIGNAL_SET_ENABLED, TASK_QUEUE, workflowIdFor } from "../../../shared/checkin-contract.js";
import type { CoachLoopInput, DevFastForward } from "../workflows/coachLoop.js";
import { devFastForwardAllowed } from "../config.js";
import { runScript, usageAndExit } from "./client.js";

const USAGE = "npm run dev:start-loop -- <userId> [--fast checkin=10s,daily=20s,reminder=30s,expire=60s]";

function seconds(value: string): number {
  const match = /^(\d+)(s|m)?$/.exec(value);
  if (!match) usageAndExit(`${USAGE}\n  bad duration "${value}" (use 10s or 2m)`);
  return Number(match![1]) * (match![2] === "m" ? 60_000 : 1_000);
}

function parseFast(spec: string): DevFastForward {
  const fast: DevFastForward = {};
  for (const part of spec.split(",")) {
    const [key, value] = part.split("=");
    if (!value) usageAndExit(`${USAGE}\n  bad --fast entry "${part}"`);
    if (key === "checkin") fast.checkinAfterMs = seconds(value);
    else if (key === "daily") fast.dailyAfterMs = seconds(value);
    else if (key === "reminder") fast.reminderAfterMs = seconds(value);
    else if (key === "expire") fast.expireAfterMs = seconds(value);
    else usageAndExit(`${USAGE}\n  unknown --fast key "${key}"`);
  }
  return fast;
}

const args = process.argv.slice(2);
const userId = args[0];
if (!userId) usageAndExit(USAGE);
const fastAt = args.indexOf("--fast");
const devFastForward = fastAt >= 0 ? parseFast(args[fastAt + 1] ?? "") : undefined;
if (devFastForward && !devFastForwardAllowed()) {
  // Same rule the worker applies (src/config.ts): never against Temporal Cloud or in production.
  console.error("Refusing --fast: TEMPORAL_API_KEY is set (Temporal Cloud) or NODE_ENV=production. Fast-forward is for the local dev server only.");
  process.exit(2);
}

await runScript(async (client) => {
  const input: CoachLoopInput = { userId, ...(devFastForward ? { devFastForward } : {}) };
  const handle = await client.workflow.signalWithStart(WORKFLOW_TYPE, {
    workflowId: workflowIdFor(userId),
    taskQueue: TASK_QUEUE,
    args: [input],
    signal: SIGNAL_SET_ENABLED,
    signalArgs: [true],
    workflowIdConflictPolicy: "USE_EXISTING",
  });
  console.log(`Workflow ${handle.workflowId} is running (run ${handle.signaledRunId}).`);
  if (devFastForward) console.log("Fast-forward requested:", JSON.stringify(devFastForward));
  console.log(`Temporal UI: ${process.env.TEMPORAL_UI_URL || "http://localhost:8233"}`);
});
