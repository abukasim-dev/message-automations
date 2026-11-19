import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contacts, messages } from "@/db/schema";
import { removeContactData } from "./contacts";
import { handleIncoming } from "./engine";
import { recordIncoming } from "./messaging";
import { listThread } from "./inbox";
import type { Me } from "./users";

async function previewContact(viewer: Me) {
  const where = and(
    eq(contacts.channel, "preview"),
    eq(contacts.chatId, viewer.id),
  );
  const [existing] = await db.select().from(contacts).where(where);
  if (existing) return existing;
  const at = Date.now();
  await db
    .insert(contacts)
    .values({
      id: crypto.randomUUID(),
      channel: "preview",
      chatId: viewer.id,
      previewOwnerId: viewer.id,
      firstName: "You",
      lastName: "(preview)",
      firstSeenAt: at,
      lastInteractionAt: at,
    })
    .onConflictDoNothing();
  const [created] = await db.select().from(contacts).where(where);
  return created!;
}

export async function getPreview(viewer: Me) {
  const contact = await previewContact(viewer);
  return {
    messages: await listThread(contact.id),
    subscribed: contact.subscribed,
  };
}

export const previewInput = z.object({
  text: z.string().trim().min(1).max(4000),
});

export async function sendPreview(
  viewer: Me,
  { text }: z.infer<typeof previewInput>,
) {
  const contact = await previewContact(viewer);
  const [earlier] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(eq(messages.contactId, contact.id), eq(messages.kind, "incoming")),
    )
    .limit(1);
  await recordIncoming(contact, text);
  await handleIncoming(contact, text, !earlier);
}

/** Starts the member's preview over as a brand-new contact. */
export async function resetPreview(viewer: Me) {
  const contact = await previewContact(viewer);
  await removeContactData(contact.id);
}
