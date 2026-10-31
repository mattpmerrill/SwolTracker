// Sends an Update, like tapping Apply / Skip on a card does, and prints the result.
//   npm run dev:decide -- checkin <userId> <checkinId> [c1,c3]   (no ids = skip this week)
//   npm run dev:decide -- offer <userId> <offerId> accept|decline

import {
  UPDATE_ANSWER_MISSED_DAY,
  UPDATE_DECIDE_CHECKIN,
  type DecideInput,
  type DecideResult,
  type MissedAnswer,
  type MissedResult,
} from "../../../shared/checkin-contract.js";
import { handleFor, runScript, usageAndExit } from "./client.js";

const USAGE =
  "npm run dev:decide -- checkin <userId> <checkinId> [c1,c3]\n       npm run dev:decide -- offer <userId> <offerId> accept|decline";
const [kind, userId, id, extra] = process.argv.slice(2);
if ((kind !== "checkin" && kind !== "offer") || !userId || !id) usageAndExit(USAGE);

await runScript(async (client) => {
  const handle = handleFor(client, userId!);
  if (kind === "checkin") {
    const input: DecideInput = { checkinId: id!, acceptIds: extra ? extra.split(",").filter(Boolean) : [] };
    const result = await handle.executeUpdate<DecideResult, [DecideInput]>(UPDATE_DECIDE_CHECKIN, { args: [input] });
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (extra !== "accept" && extra !== "decline") usageAndExit(USAGE);
    const input: MissedAnswer = { offerId: id!, accept: extra === "accept" };
    const result = await handle.executeUpdate<MissedResult, [MissedAnswer]>(UPDATE_ANSWER_MISSED_DAY, { args: [input] });
    console.log(JSON.stringify(result, null, 2));
  }
});
