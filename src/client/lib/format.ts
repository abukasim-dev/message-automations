import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

export function errorMessage(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : "That didn't work. Try again.";
}

/** Runs a change, reloads the route's data, and toasts a failure. */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function run<T>(
    work: () => Promise<T>,
    done?: string,
  ): Promise<T | undefined> {
    setPending(true);
    try {
      const result = await work();
      await router.invalidate();
      if (done) toast.success(done);
      return result;
    } catch (cause) {
      toast.error(errorMessage(cause));
      return undefined;
    } finally {
      setPending(false);
    }
  }
  return { run, pending };
}

const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

export function formatDateTime(ms: number | null | undefined): string {
  return ms ? dateTime.format(new Date(ms)) : "";
}

/** Today's times as a time, older ones with the date. */
export function formatWhen(ms: number): string {
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString()
    ? time.format(d)
    : dateTime.format(d);
}

/** A timestamp as the value of a datetime-local input, in local time. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
