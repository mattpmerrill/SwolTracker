// Sends the dayMissed Signal, like marking a day missed in the app does.
//   npm run dev:send-missed -- <userId> <week> <Monday..Sunday>

import { PROGRAM_DAYS, SIGNAL_DAY_MISSED, type DayMissedSignal, type DayName } from "../../../shared/checkin-contract.js";
import { handleFor, runScript, usageAndExit } from "./client.js";

const USAGE = "npm run dev:send-missed -- <userId> <week> <Monday|Tuesday|...|Sunday>";
const [userId, weekArg, dayArg] = process.argv.slice(2);
const week = Number(weekArg);
if (!userId || !Number.isInteger(week) || week < 1 || !PROGRAM_DAYS.includes(dayArg as DayName)) usageAndExit(USAGE);

await runScript(async (client) => {
  const signal: DayMissedSignal = { week, day: dayArg as DayName };
  await handleFor(client, userId!).signal(SIGNAL_DAY_MISSED, signal);
  console.log(`Sent dayMissed week ${week} ${dayArg}.`);
});
