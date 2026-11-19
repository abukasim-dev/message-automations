import { and, desc, eq, inArray, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  broadcasts,
  contactTags,
  contacts,
  deliveries,
  users,
} from "@/db/schema";
import { deliver } from "./messaging";
import { buttonSchema } from "./steps";
import { Forbidden, type Me } from "./users";

type Broadcast = typeof broadcasts.$inferSelect;
type Audience = { audience: "everyone" | "any" | "all"; tagIds: string[] };

function canEdit(viewer: Me, b: Broadcast) {
  return (
    (viewer.admin || b.ownerId === viewer.id) &&
    (b.status === "draft" || b.status === "scheduled")
  );
}

function view(viewer: Me, b: Broadcast, ownerEmail: string | null) {
  return {
    id: b.id,
    text: b.text,
    buttonLabel: b.buttonLabel ?? "",
    buttonUrl: b.buttonUrl ?? "",
    audience: b.audience,
    tagIds: JSON.parse(b.tagIds) as string[],
    status: b.status,
    sendAt: b.sendAt,
    sentAt: b.sentAt,
    sentCount: b.sentCount,
    failedCount: b.failedCount,
    createdAt: b.createdAt,
    ownerEmail,
    canEdit: canEdit(viewer, b),
  };
}

export async function listBroadcasts(viewer: Me) {
  const rows = await db
    .select({ b: broadcasts, ownerEmail: users.email })
    .from(broadcasts)
    .leftJoin(users, eq(users.id, broadcasts.ownerId))
    .orderBy(desc(broadcasts.createdAt))
    .limit(200);
  return rows.map(({ b, ownerEmail }) => view(viewer, b, ownerEmail));
}

export async function getBroadcast(viewer: Me, id: string) {
  const [row] = await db
    .select({ b: broadcasts, ownerEmail: users.email })
    .from(broadcasts)
    .leftJoin(users, eq(users.id, broadcasts.ownerId))
    .where(eq(broadcasts.id, id));
  return row ? view(viewer, row.b, row.ownerEmail) : null;
}

export async function createBroadcast(viewer: Me) {
  const id = crypto.randomUUID();
  await db
    .insert(broadcasts)
    .values({ id, ownerId: viewer.id, createdAt: Date.now() });
  return { id };
}

function audienceWhere({ audience, tagIds }: Audience): SQL {
  const base = and(
    eq(contacts.channel, "telegram"),
    eq(contacts.subscribed, true),
  )!;
  if (audience === "everyone") return base;
  if (!tagIds.length) return sql`0`;
  const tagged = db
    .select({ id: contactTags.contactId })
    .from(contactTags)
    .where(inArray(contactTags.tagId, tagIds))
    .groupBy(contactTags.contactId);
  return and(
    base,
    inArray(
      contacts.id,
      audience === "all"
        ? tagged.having(
            sql`count(distinct ${contactTags.tagId}) = ${tagIds.length}`,
          )
        : tagged,
    ),
  )!;
}

export const audienceInput = z.object({
  audience: z.enum(["everyone", "any", "all"]),
  tagIds: z.array(z.string()).max(50),
});

export async function countAudience(input: Audience) {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(contacts)
    .where(audienceWhere(input));
  return row?.n ?? 0;
}

export const saveBroadcastInput = audienceInput.extend({
  id: z.string(),
  text: z.string().trim().max(4000),
  buttonLabel: z.string().trim().max(64),
  buttonUrl: z.string().trim().max(2000),
  action: z.enum(["save", "schedule", "send"]),
  sendAt: z.number().int().nullable(),
});

export async function saveBroadcast(
  viewer: Me,
  input: z.infer<typeof saveBroadcastInput>,
) {
  const [b] = await db
    .select()
    .from(broadcasts)
    .where(eq(broadcasts.id, input.id));
  if (!b) throw new Error("Broadcast not found");
  if (!(viewer.admin || b.ownerId === viewer.id)) {
    throw new Forbidden(
      "Only its creator or an admin can change this broadcast.",
    );
  }
  if (b.status !== "draft" && b.status !== "scheduled")
    throw new Error("This broadcast can no longer be changed.");
  const hasButton = input.buttonLabel || input.buttonUrl;
  if (hasButton) {
    const parsed = buttonSchema.safeParse({
      label: input.buttonLabel,
      url: input.buttonUrl,
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
  }
  if (input.action !== "save") {
    if (!input.text) throw new Error("Write the message first.");
    if (input.audience !== "everyone" && !input.tagIds.length)
      throw new Error("Choose at least one tag.");
  }
  if (
    input.action === "schedule" &&
    (!input.sendAt || input.sendAt <= Date.now())
  ) {
    throw new Error("Pick a time in the future.");
  }
  const status =
    input.action === "schedule"
      ? "scheduled"
      : input.action === "send"
        ? "sending"
        : b.status;
  const [saved] = await db
    .update(broadcasts)
    .set({
      text: input.text,
      buttonLabel: hasButton ? input.buttonLabel : null,
      buttonUrl: hasButton ? input.buttonUrl : null,
      audience: input.audience,
      tagIds: JSON.stringify(input.tagIds),
      status,
      sendAt:
        input.action === "send"
          ? Date.now()
          : input.action === "schedule"
            ? input.sendAt
            : b.sendAt,
    })
    // Only while it hasn't started: the cron may have just claimed it.
    .where(
      and(
        eq(broadcasts.id, input.id),
        inArray(broadcasts.status, ["draft", "scheduled"]),
      ),
    )
    .returning();
  if (!saved) throw new Error("This broadcast has already started.");
  return saved;
}

export const idInput = z.object({ id: z.string() });

export async function cancelBroadcast(
  viewer: Me,
  { id }: z.infer<typeof idInput>,
) {
  const [b] = await db.select().from(broadcasts).where(eq(broadcasts.id, id));
  if (!b) throw new Error("Broadcast not found");
  if (!(viewer.admin || b.ownerId === viewer.id)) {
    throw new Forbidden(
      "Only its creator or an admin can cancel this broadcast.",
    );
  }
  const [canceled] = await db
    .update(broadcasts)
    .set({ status: "canceled" })
    .where(and(eq(broadcasts.id, id), eq(broadcasts.status, "scheduled")))
    .returning();
  if (!canceled) throw new Error("Only a scheduled broadcast can be canceled.");
}

/**
 * Sends a broadcast that is in `sending` to its audience. Each contact gets
 * a delivery row before the send, so a second pass never sends again.
 */
export async function deliverBroadcast(b: Broadcast) {
  const audience = await db
    .select()
    .from(contacts)
    .where(
      audienceWhere({
        audience: b.audience,
        tagIds: JSON.parse(b.tagIds) as string[],
      }),
    );
  const buttons =
    b.buttonLabel && b.buttonUrl
      ? [{ label: b.buttonLabel, url: b.buttonUrl }]
      : [];
  for (const contact of audience) {
    const claimed = await db
      .insert(deliveries)
      .values({ broadcastId: b.id, contactId: contact.id, status: "pending" })
      .onConflictDoNothing()
      .returning();
    if (!claimed.length) continue;
    const result = await deliver(contact, b.text, buttons, "broadcast");
    await db
      .update(deliveries)
      .set({
        status: result.ok ? "sent" : "failed",
        error: result.error ?? null,
      })
      .where(
        and(
          eq(deliveries.broadcastId, b.id),
          eq(deliveries.contactId, contact.id),
        ),
      );
  }
  const counts = await db
    .select({ status: deliveries.status, n: sql<number>`count(*)` })
    .from(deliveries)
    .where(eq(deliveries.broadcastId, b.id))
    .groupBy(deliveries.status);
  await db
    .update(broadcasts)
    .set({
      status: "sent",
      sentAt: Date.now(),
      sentCount: counts.find((c) => c.status === "sent")?.n ?? 0,
      failedCount: counts.find((c) => c.status === "failed")?.n ?? 0,
    })
    .where(eq(broadcasts.id, b.id));
}

/** Starts scheduled broadcasts that are due, and finishes interrupted ones. */
export async function sendDueBroadcasts() {
  const at = Date.now();
  const due = await db
    .update(broadcasts)
    .set({ status: "sending" })
    .where(and(eq(broadcasts.status, "scheduled"), lte(broadcasts.sendAt, at)))
    .returning();
  const stalled = await db
    .select()
    .from(broadcasts)
    .where(
      and(
        eq(broadcasts.status, "sending"),
        lte(broadcasts.sendAt, at - 5 * 60_000),
      ),
    );
  for (const b of [
    ...due,
    ...stalled.filter((s) => !due.some((d) => d.id === s.id)),
  ]) {
    await deliverBroadcast(b);
  }
}
