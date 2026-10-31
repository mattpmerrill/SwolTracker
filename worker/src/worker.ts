// The worker process: connects to Temporal, polls the `chad-checkin` task queue, runs the
// coachLoopWorkflow code (in a sandbox) and the activities (plain Node, calling /api/checkin-worker).
//
//   npm run dev      tsx, env from worker/.env if it exists (dev fast-forward allowed)
//   npm start        the same with NODE_ENV=production (dev fast-forward off): use it for Cloud
//
// Environment (names only, see .env.example): SWOLTRACKER_API_URL, CHECKIN_WORKER_SECRET (both
// required); TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE, TEMPORAL_API_KEY, CHECKIN_CODEC_KEY (optional
// locally; the API key needs the codec key). SIGINT/SIGTERM shut the worker down gracefully.

import { NativeConnection, Worker } from "@temporalio/worker";
import { TASK_QUEUE } from "../../shared/checkin-contract.js";
import { createActivities } from "./activities.js";
import {
  WORKFLOWS_PATH,
  connectionOptions,
  dataConverterFor,
  devFastForwardAllowed,
  readTemporalConfig,
  readWorkerEnv,
} from "./config.js";

async function main(): Promise<void> {
  // Fail fast with a clear message, before any connection is opened.
  const { apiUrl, secret } = readWorkerEnv();
  const config = readTemporalConfig();

  const connection = await NativeConnection.connect(connectionOptions(config));
  const worker = await Worker.create({
    connection,
    namespace: config.namespace,
    taskQueue: TASK_QUEUE,
    workflowsPath: WORKFLOWS_PATH,
    activities: createActivities({ apiUrl, secret }),
    dataConverter: dataConverterFor(config),
    // Time to let a running activity finish after a shutdown signal before it is cancelled.
    shutdownGraceTime: "15 seconds",
  });

  // Names and modes only: never the secret, the API key or the codec key.
  console.log(
    `Chad worker ready. task queue=${TASK_QUEUE} namespace=${config.namespace} address=${config.address} ` +
      `cloud=${Boolean(config.apiKey)} encryption=${Boolean(config.codecKey)} api=${new URL(apiUrl).origin} ` +
      `dev-fast-forward=${devFastForwardAllowed() ? "allowed" : "off"}`,
  );
  await worker.run();
  await connection.close();
  console.log("Chad worker stopped.");
}

main().catch((error) => {
  console.error("Chad worker failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
