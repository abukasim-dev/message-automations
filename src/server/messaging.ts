import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, messages } from "@/db/schema";
import type { Button } from "./steps";
import { sendTelegramMessage } from "./telegram";

export type Contact = typeof contacts.$inferSelect;
type OutgoingKind = "manual" | "automated" | "broadcast";

/**
 * Sends a message to a contact and records it with its delivery result. A
 * preview contact's messages are only shown in the app.
 */
export async function deliver(
  contact: Contact,
  text: string,
  buttons: Button[],
  kind: OutgoingKind,
  authorId: string | null = null,
): Promise<{ ok: boolean; error?: string }> {
  let status: "sent" | "failed" | "shown" = "shown";
  let error: string | null = null;
  if (contact.channel === "telegram") {
    const result = await sendTelegramMessage(contact.chatId, text, buttons);
    status = result.ok ? "sent" : "failed";
    error = result.ok ? null : result.error;
  }
  const at = Date.now();
  await db.batch([
    db.insert(messages).values({
      id: crypto.randomUUID(),
      contactId: contact.id,
      kind,
      text,
      buttons: buttons.length ? JSON.stringify(buttons) : null,
      status,
      error,
      authorId,
      createdAt: at,
    }),
    db
      .update(contacts)
      .set({ lastMessageAt: at, lastMessageText: text.slice(0, 200) })
      .where(eq(contacts.id, contact.id)),
  ]);
  return error ? { ok: false, error } : { ok: true };
}

/** A note in a preview conversation, such as a wait. */
export async function note(contact: Contact, text: string) {
  await db.insert(messages).values({
    id: crypto.randomUUID(),
    contactId: contact.id,
    kind: "system",
    text,
    status: "shown",
    createdAt: Date.now(),
  });
}

export async function recordIncoming(contact: Contact, text: string) {
  const at = Date.now();
  await db.batch([
    db.insert(messages).values({
      id: crypto.randomUUID(),
      contactId: contact.id,
      kind: "incoming",
      text,
      status: "received",
      createdAt: at,
    }),
    db
      .update(contacts)
      .set({
        lastMessageAt: at,
        lastMessageText: text.slice(0, 200),
        lastInteractionAt: at,
        // A new message reopens a conversation marked done.
        status: "open",
      })
      .where(eq(contacts.id, contact.id)),
  ]);
}
