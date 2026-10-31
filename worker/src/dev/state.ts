// Prints the workflow's status and its getState Query.
//   npm run dev:state -- <userId>

import { QUERY_GET_STATE, type WorkflowState } from "../../../shared/checkin-contract.js";
import { handleFor, runScript, usageAndExit } from "./client.js";

const userId = process.argv[2];
if (!userId) usageAndExit("npm run dev:state -- <userId>");

await runScript(async (client) => {
  const handle = handleFor(client, userId!);
  const description = await handle.describe();
  console.log(`status=${description.status.name} run=${description.runId} history events=${description.historyLength}`);
  if (description.status.name === "RUNNING") {
    console.log(JSON.stringify(await handle.query<WorkflowState>(QUERY_GET_STATE), null, 2));
  }
});
