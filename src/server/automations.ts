import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { automationRuns, automations, users } from "@/db/schema";
import { parseSteps } from "./engine";
import { stepSchema } from "./steps";
import { Forbidden, type Me } from "./users";

type Automation = typeof automations.$inferSelect;

function canEdit(viewer: Me, a: Automation) {
  return viewer.admin || a.ownerId === viewer.id;
}

export async function listAutomations(viewer: Me) {
  const rows = await db
    .select({ a: automations, ownerEmail: users.email })
    .from(automations)
    .leftJoin(users, eq(users.id, automations.ownerId))
    .orderBy(desc(automations.status), asc(automations.createdAt));
  return rows.map(({ a, ownerEmail }) => ({
    id: a.id,
    name: a.name,
    trigger: a.trigger,
    keywords: JSON.parse(a.keywords) as string[],
    status: a.status,
    runCount: a.runCount,
    lastRunAt: a.lastRunAt,
    stepCount: parseSteps(a.steps).length,
    ownerEmail,
    canEdit: canEdit(viewer, a),
  }));
}

export async function getAutomation(viewer: Me, id: string) {
  const [row] = await db
    .select({ a: automations, ownerEmail: users.email })
    .from(automations)
    .leftJoin(users, eq(users.id, automations.ownerId))
    .where(eq(automations.id, id));
  if (!row) return null;
  const { a, ownerEmail } = row;
  return {
    id: a.id,
    name: a.name,
    trigger: a.trigger,
    keywords: JSON.parse(a.keywords) as string[],
    match: a.match,
    status: a.status,
    steps: parseSteps(a.steps),
    runCount: a.runCount,
    lastRunAt: a.lastRunAt,
    ownerEmail,
    canEdit: canEdit(viewer, a),
  };
}

export const createAutomationInput = z.object({
  name: z.string().trim().min(1, "Enter a name").max(100),
  trigger: z.enum(["welcome", "keyword", "default"]),
});

export async function createAutomation(
  viewer: Me,
  input: z.infer<typeof createAutomationInput>,
) {
  const id = crypto.randomUUID();
  const at = Date.now();
  await db
    .insert(automations)
    .values({ id, ownerId: viewer.id, ...input, createdAt: at, updatedAt: at });
  return { id };
}

export const saveAutomationInput = z
  .object({
    id: z.string(),
    name: z.string().trim().min(1, "Enter a name").max(100),
    trigger: z.enum(["welcome", "keyword", "default"]),
    keywords: z.array(z.string().trim().min(1).max(100)).max(50),
    match: z.enum(["exact", "contains"]),
    steps: z.array(stepSchema).max(30),
  })
  .refine((a) => a.trigger !== "keyword" || a.keywords.length > 0, {
    message: "Add at least one keyword",
    path: ["keywords"],
  });

async function editable(viewer: Me, id: string) {
  const [a] = await db.select().from(automations).where(eq(automations.id, id));
  if (!a) throw new Error("Automation not found");
  if (!canEdit(viewer, a))
    throw new Forbidden(
      "Only its creator or an admin can change this automation.",
    );
  return a;
}

export async function saveAutomation(
  viewer: Me,
  input: z.infer<typeof saveAutomationInput>,
) {
  await editable(viewer, input.id);
  const { id, keywords, steps, ...rest } = input;
  await db
    .update(automations)
    .set({
      ...rest,
      keywords: JSON.stringify(keywords),
      steps: JSON.stringify(steps),
      updatedAt: Date.now(),
    })
    .where(eq(automations.id, id));
}

export const setStatusInput = z.object({
  id: z.string(),
  status: z.enum(["draft", "active"]),
});

export async function setStatus(
  viewer: Me,
  { id, status }: z.infer<typeof setStatusInput>,
) {
  const a = await editable(viewer, id);
  if (status === "active" && parseSteps(a.steps).length === 0) {
    throw new Error("Add a step and save before turning this on.");
  }
  await db
    .update(automations)
    .set({ status, updatedAt: Date.now() })
    .where(eq(automations.id, id));
}

export const idInput = z.object({ id: z.string() });

export async function deleteAutomation(
  viewer: Me,
  { id }: z.infer<typeof idInput>,
) {
  await editable(viewer, id);
  await db.batch([
    db.delete(automationRuns).where(eq(automationRuns.automationId, id)),
    db.delete(automations).where(eq(automations.id, id)),
  ]);
}
