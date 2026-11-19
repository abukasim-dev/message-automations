import tanstackEntry from "@tanstack/react-start/server-entry";
import { everyApp } from "@every-app/sdk/server";
import { runCron } from "./server/cron";

// everyApp() verifies the identity the Gateway sent before any request reaches
// the app (a request from anywhere else is a 401). The minute cron resumes
// automation waits and sends scheduled broadcasts.
export default {
  ...everyApp<Env>(async (request) => tanstackEntry.fetch(request)),
  async scheduled(
    _controller: ScheduledController,
    _env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(runCron());
  },
};
