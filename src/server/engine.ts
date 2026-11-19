import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  automationRuns,
  automations,
  contactTags,
  contacts,
  customFields,
  fieldValues,
  tags,
} from "@/db/schema";
import { deliver, note, type Contact } from "./messaging";
import {
  DEFAULT_RETRY,
  delayLabel,
  delayMs,
  matchesKeywords,
  normalize,
  stepSchema,
  validateValue,
  type Step,
} from "./steps";

type Automation = typeof automations.$inferSelect;
type Run = typeof automationRuns.$inferSelect;

export function parseSteps(json: string): Step[] {
  try {
    const raw = JSON.parse(json) as unknown[];
    return raw.flatMap((item) => {
      const parsed = stepSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  } catch {
    return [];
  }
}

function parseList(json: string): string[] {
  try {
    const list = JSON.parse(json) as unknown;
    return Array.isArray(list) ? list.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
}

async function loadContact(id: string): Promise<Contact | null> {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
  return contact ?? null;
}

function isPaused(contact: Contact, at = Date.now()) {
  return contact.pausedUntil != null && contact.pausedUntil > at;
}

/**
 * What happens when a contact writes: stop and start commands, an answer to
 * a pending question, then at most one automation (welcome, else keyword,
 * else default reply). `isNew` is true on the contact's first message.
 */
export async function handleIncoming(
  contact: Contact,
  text: string,
  isNew: boolean,
) {
  const command = normalize(text);
  if (command === "stop" || command === "/stop") {
    await db.batch([
      db
        .update(contacts)
        .set({ subscribed: false })
        .where(eq(contacts.id, contact.id)),
      db
        .update(automationRuns)
        .set({ status: "stopped", updatedAt: Date.now() })
        .where(
          and(
            eq(automationRuns.contactId, contact.id),
            inArray(automationRuns.status, ["asking", "waiting", "running"]),
          ),
        ),
    ]);
    return;
  }
  if (!contact.subscribed) {
    if (command === "start" || command === "/start") {
      await db
        .update(contacts)
        .set({ subscribed: true })
        .where(eq(contacts.id, contact.id));
    }
    return;
  }
  if (isPaused(contact)) return;

  const [asking] = await db
    .select()
    .from(automationRuns)
    .where(
      and(
        eq(automationRuns.contactId, contact.id),
        eq(automationRuns.status, "asking"),
      ),
    )
    .orderBy(desc(automationRuns.updatedAt))
    .limit(1);
  if (asking && (await answer(asking, contact, text))) return;

  const active = await db
    .select()
    .from(automations)
    .where(eq(automations.status, "active"))
    .orderBy(asc(automations.createdAt), asc(automations.id));
  const isStart = command === "/start" || command.startsWith("/start ");
  const chosen =
    ((isNew || isStart) && active.find((a) => a.trigger === "welcome")) ||
    active.find(
      (a) =>
        a.trigger === "keyword" &&
        matchesKeywords(text, parseList(a.keywords), a.match),
    ) ||
    active.find((a) => a.trigger === "default");
  if (chosen) await startRun(chosen, contact);
}

/** Handles an answer to a pending question. False when the run is gone. */
async function answer(
  run: Run,
  contact: Contact,
  text: string,
): Promise<boolean> {
  const [automation] = await db
    .select()
    .from(automations)
    .where(eq(automations.id, run.automationId));
  const step = automation
    ? parseSteps(automation.steps)[run.stepIndex]
    : undefined;
  if (!automation || step?.type !== "question") {
    await db
      .update(automationRuns)
      .set({ status: "stopped" })
      .where(eq(automationRuns.id, run.id));
    return false;
  }
  let type: "email" | "phone" | "text" | "number" = "text";
  let field: string | null = null;
  if (step.target === "email" || step.target === "phone") type = step.target;
  else if (step.target.startsWith("field:")) {
    const [def] = await db
      .select()
      .from(customFields)
      .where(eq(customFields.id, step.target.slice(6)));
    if (def) {
      type = def.type;
      field = def.id;
    }
  }
  const value = validateValue(type, text);
  if (value === null) {
    await deliver(contact, step.retryText || DEFAULT_RETRY, [], "automated");
    return true;
  }
  if (field) {
    await db
      .insert(fieldValues)
      .values({ contactId: contact.id, fieldId: field, value })
      .onConflictDoUpdate({
        target: [fieldValues.contactId, fieldValues.fieldId],
        set: { value },
      });
  } else if (step.target === "email") {
    await db
      .update(contacts)
      .set({ email: value })
      .where(eq(contacts.id, contact.id));
  } else if (step.target === "phone") {
    await db
      .update(contacts)
      .set({ phone: value })
      .where(eq(contacts.id, contact.id));
  }
  const next = {
    ...run,
    status: "running" as const,
    stepIndex: run.stepIndex + 1,
  };
  await db
    .update(automationRuns)
    .set({
      status: "running",
      stepIndex: next.stepIndex,
      updatedAt: Date.now(),
    })
    .where(eq(automationRuns.id, run.id));
  await runSteps(next, automation, contact);
  return true;
}

async function startRun(automation: Automation, contact: Contact) {
  const at = Date.now();
  const run: Run = {
    id: crypto.randomUUID(),
    automationId: automation.id,
    contactId: contact.id,
    status: "running",
    stepIndex: 0,
    resumeAt: null,
    createdAt: at,
    updatedAt: at,
  };
  await db.batch([
    db.insert(automationRuns).values(run),
    db
      .update(automations)
      .set({ runCount: sql`${automations.runCount} + 1`, lastRunAt: at })
      .where(eq(automations.id, automation.id)),
  ]);
  await runSteps(run, automation, contact);
}

async function runSteps(run: Run, automation: Automation, contact: Contact) {
  const steps = parseSteps(automation.steps);
  for (let i = run.stepIndex; i < steps.length; i++) {
    const step = steps[i]!;
    switch (step.type) {
      case "text":
        await deliver(contact, step.text, [], "automated");
        break;
      case "buttons":
        await deliver(contact, step.text, step.buttons, "automated");
        break;
      case "question":
        await deliver(contact, step.text, [], "automated");
        await setRun(run.id, { status: "asking", stepIndex: i });
        return;
      case "delay":
        await setRun(run.id, {
          status: "waiting",
          stepIndex: i + 1,
          resumeAt: Date.now() + delayMs(step),
        });
        if (contact.channel === "preview")
          await note(contact, `Waiting ${delayLabel(step)}`);
        return;
      case "add_tag": {
        const [tag] = await db
          .select({ id: tags.id })
          .from(tags)
          .where(eq(tags.id, step.tagId));
        if (tag) {
          await db
            .insert(contactTags)
            .values({ contactId: contact.id, tagId: tag.id })
            .onConflictDoNothing();
        }
        break;
      }
      case "remove_tag":
        await db
          .delete(contactTags)
          .where(
            and(
              eq(contactTags.contactId, contact.id),
              eq(contactTags.tagId, step.tagId),
            ),
          );
        break;
    }
  }
  await setRun(run.id, { status: "done", stepIndex: steps.length });
}

function setRun(id: string, change: Partial<Run>) {
  return db
    .update(automationRuns)
    .set({ ...change, updatedAt: Date.now() })
    .where(eq(automationRuns.id, id));
}

/** Continues runs whose wait is over. Called by the minute cron. */
export async function resumeDueRuns(limit = 50) {
  const due = await db
    .select()
    .from(automationRuns)
    .where(
      and(
        eq(automationRuns.status, "waiting"),
        lte(automationRuns.resumeAt, Date.now()),
      ),
    )
    .limit(limit);
  for (const candidate of due) {
    // Claim it, so overlapping crons never run a step twice.
    const [run] = await db
      .update(automationRuns)
      .set({ status: "running", updatedAt: Date.now() })
      .where(
        and(
          eq(automationRuns.id, candidate.id),
          eq(automationRuns.status, "waiting"),
        ),
      )
      .returning();
    if (!run) continue;
    const contact = await loadContact(run.contactId);
    const [automation] = await db
      .select()
      .from(automations)
      .where(eq(automations.id, run.automationId));
    if (!contact || !automation || !contact.subscribed) {
      await setRun(run.id, { status: "stopped" });
      continue;
    }
    if (isPaused(contact)) {
      await setRun(run.id, {
        status: "waiting",
        resumeAt: contact.pausedUntil,
      });
      continue;
    }
    await runSteps(run, automation, contact);
  }
}
