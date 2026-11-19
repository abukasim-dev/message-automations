import { and, asc, desc, eq, isNotNull, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contacts, messages, users } from "@/db/schema";
import { displayName, findContact } from "./contacts";
import { deliver } from "./messaging";
import { botToken } from "./telegram";
import type { Me } from "./users";

/** How long a manual reply keeps automations quiet for that contact. */
const PAUSE_MS = 30 * 60_000;

export const listInput = z.object({
  filter: z.enum(["open", "done", "starred", "mine", "all"]).default("open"),
});

export async function listConversations(
  viewer: Me,
  { filter }: z.infer<typeof listInput>,
) {
  const where: SQL[] = [
    eq(contacts.channel, "telegram"),
    isNotNull(contacts.lastMessageAt),
  ];
  if (filter === "open" || filter === "done")
    where.push(eq(contacts.status, filter));
  if (filter === "starred") where.push(eq(contacts.starred, true));
  if (filter === "mine") where.push(eq(contacts.assigneeId, viewer.id));
  const rows = await db
    .select({ c: contacts, assignee: users.email })
    .from(contacts)
    .leftJoin(users, eq(users.id, contacts.assigneeId))
    .where(and(...where))
    .orderBy(desc(contacts.lastMessageAt))
    .limit(200);
  return rows.map(({ c, assignee }) => ({
    id: c.id,
    name: displayName(c),
    lastMessageText: c.lastMessageText ?? "",
    lastMessageAt: c.lastMessageAt!,
    status: c.status,
    starred: c.starred,
    assignee,
    subscribed: c.subscribed,
  }));
}

export async function listThread(contactId: string) {
  return db
    .select({
      id: messages.id,
      kind: messages.kind,
      text: messages.text,
      buttons: messages.buttons,
      status: messages.status,
      error: messages.error,
      createdAt: messages.createdAt,
      author: users.email,
    })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.authorId))
    .where(eq(messages.contactId, contactId))
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .limit(500);
}

export async function getConversation(viewer: Me, id: string) {
  const contact = await findContact(viewer, id);
  if (!contact || contact.channel !== "telegram") return null;
  const [thread, members] = await Promise.all([
    listThread(id),
    db
      .select({ id: users.id, email: users.email })
      .from(users)
      .orderBy(asc(users.email)),
  ]);
  return {
    contact: {
      id: contact.id,
      name: displayName(contact),
      username: contact.username,
      subscribed: contact.subscribed,
      status: contact.status,
      starred: contact.starred,
      assigneeId: contact.assigneeId,
      pausedUntil:
        contact.pausedUntil && contact.pausedUntil > Date.now()
          ? contact.pausedUntil
          : null,
    },
    messages: thread,
    members,
    channelConnected: Boolean(botToken()),
  };
}

async function conversation(viewer: Me, id: string) {
  const contact = await findContact(viewer, id);
  if (!contact || contact.channel !== "telegram")
    throw new Error("Conversation not found");
  return contact;
}

export const replyInput = z.object({
  contactId: z.string(),
  text: z.string().trim().min(1, "Write a message").max(4000),
});

/** A member's reply. Automations for the contact pause for a while. */
export async function reply(
  viewer: Me,
  { contactId, text }: z.infer<typeof replyInput>,
) {
  const contact = await conversation(viewer, contactId);
  if (!botToken()) throw new Error("Connect Telegram to send replies.");
  if (!contact.subscribed) throw new Error("This contact unsubscribed.");
  await db
    .update(contacts)
    .set({ pausedUntil: Date.now() + PAUSE_MS })
    .where(eq(contacts.id, contactId));
  return deliver(contact, text, [], "manual", viewer.id);
}

export const updateInput = z.object({
  contactId: z.string(),
  starred: z.boolean().optional(),
  status: z.enum(["open", "done"]).optional(),
  assigneeId: z.string().nullable().optional(),
  resume: z.literal(true).optional(),
});

export async function updateConversation(
  viewer: Me,
  input: z.infer<typeof updateInput>,
) {
  await conversation(viewer, input.contactId);
  const change: Partial<typeof contacts.$inferInsert> = {};
  if (input.starred !== undefined) change.starred = input.starred;
  if (input.status) change.status = input.status;
  if (input.resume) change.pausedUntil = null;
  if (input.assigneeId !== undefined) {
    if (input.assigneeId) {
      const [member] = await db
        .select()
        .from(users)
        .where(eq(users.id, input.assigneeId));
      if (!member) throw new Error("Member not found");
    }
    change.assigneeId = input.assigneeId;
  }
  if (Object.keys(change).length) {
    await db
      .update(contacts)
      .set(change)
      .where(eq(contacts.id, input.contactId));
  }
}
