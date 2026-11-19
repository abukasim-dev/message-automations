import { sendDueBroadcasts } from "./broadcasts";
import { resumeDueRuns } from "./engine";

/** The minute cron: waits that are over, then broadcasts that are due. */
export async function runCron() {
  await resumeDueRuns();
  await sendDueBroadcasts();
}
