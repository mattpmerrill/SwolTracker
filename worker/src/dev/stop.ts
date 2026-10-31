// Ends a user's coach loop the polite way (setEnabled(false): it expires anything open and
// completes), or with --terminate immediately. Use it before restarting with --fast.
//   npm run dev:stop -- <userId> [--terminate]

import { SIGNAL_SET_ENABLED } from "../../../shared/checkin-contract.js";
import { handleFor, runScript, usageAndExit } from "./client.js";

const [userId, flag] = process.argv.slice(2);
if (!userId) usageAndExit("npm run dev:stop -- <userId> [--terminate]");

await runScript(async (client) => {
  const handle = handleFor(client, userId!);
  if (flag === "--terminate") {
    await handle.terminate("dev:stop --terminate");
    console.log("Terminated.");
  } else {
    await handle.signal(SIGNAL_SET_ENABLED, false);
    console.log("Sent setEnabled(false). The workflow expires anything open and completes.");
  }
});
