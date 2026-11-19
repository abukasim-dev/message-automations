import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  appState,
  contactTags,
  customFields,
  fieldValues,
  tags,
} from "@/db/schema";
import { botToken, callTelegram, webhookSecret } from "./telegram";
import { requireAdmin, type Me } from "./users";

function webhookUrl(requestUrl: string) {
  return `https://${new URL(requestUrl).host}/hooks/telegram`;
}

export async function channelStatus(requestUrl: string) {
  if (!botToken()) return { connected: false as const };
  const [me, info] = await Promise.all([
    callTelegram<{ username: string; first_name: string }>("getMe"),
    callTelegram<{ url: string; last_error_message?: string }>(
      "getWebhookInfo",
    ),
  ]);
  if (!me.ok) return { connected: false as const, error: me.error };
  return {
    connected: true as const,
    username: me.result.username,
    webhookRegistered: info.ok && info.result.url === webhookUrl(requestUrl),
    webhookError: info.ok
      ? (info.result.last_error_message ?? null)
      : info.error,
  };
}

export async function registerWebhook(viewer: Me, requestUrl: string) {
  requireAdmin(viewer);
  const secret = webhookSecret();
  if (!botToken()) throw new Error("Set TELEGRAM_BOT_TOKEN first.");
  if (!secret)
    throw new Error(
      "TELEGRAM_WEBHOOK_SECRET isn't set. Deploy the app again to create it.",
    );
  const url = webhookUrl(requestUrl);
  const result = await callTelegram("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message"],
  });
  if (!result.ok) throw new Error(result.error);
  await db
    .insert(appState)
    .values({ key: "webhook_url", value: url })
    .onConflictDoUpdate({ target: appState.key, set: { value: url } });
}

export function listTags() {
  return db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .orderBy(asc(tags.name));
}

export function listFields() {
  return db
    .select({
      id: customFields.id,
      name: customFields.name,
      type: customFields.type,
    })
    .from(customFields)
    .orderBy(asc(customFields.name));
}

export const nameInput = z.object({
  name: z.string().trim().min(1, "Enter a name").max(60),
});

export async function createTag({ name }: z.infer<typeof nameInput>) {
  const [existing] = await db.select().from(tags).where(eq(tags.name, name));
  if (existing) throw new Error(`There's already a tag called ${name}`);
  await db
    .insert(tags)
    .values({ id: crypto.randomUUID(), name, createdAt: Date.now() });
}

export const fieldInput = nameInput.extend({
  type: z.enum(["text", "number", "email", "phone"]),
});

export async function createField({ name, type }: z.infer<typeof fieldInput>) {
  const [existing] = await db
    .select()
    .from(customFields)
    .where(eq(customFields.name, name));
  if (existing) throw new Error(`There's already a field called ${name}`);
  await db
    .insert(customFields)
    .values({ id: crypto.randomUUID(), name, type, createdAt: Date.now() });
}

export const idInput = z.object({ id: z.string() });

/** Removes a tag from every contact, then the tag. Admins only. */
export async function deleteTag(viewer: Me, { id }: z.infer<typeof idInput>) {
  requireAdmin(viewer);
  await db.batch([
    db.delete(contactTags).where(eq(contactTags.tagId, id)),
    db.delete(tags).where(eq(tags.id, id)),
  ]);
}

export async function deleteField(viewer: Me, { id }: z.infer<typeof idInput>) {
  requireAdmin(viewer);
  await db.batch([
    db.delete(fieldValues).where(eq(fieldValues.fieldId, id)),
    db.delete(customFields).where(eq(customFields.id, id)),
  ]);
}
