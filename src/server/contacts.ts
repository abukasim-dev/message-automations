import {
  and,
  asc,
  desc,
  eq,
  inArray,
  like,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  automationRuns,
  contactTags,
  contacts,
  customFields,
  deliveries,
  fieldValues,
  messages,
  tags,
} from "@/db/schema";
import { validateValue } from "./steps";
import { requireAdmin, type Me } from "./users";

const PAGE_SIZE = 25;

export const listContactsInput = z.object({
  q: z.string().max(100).default(""),
  tag: z.string().max(64).default(""),
  subscription: z.enum(["all", "subscribed", "unsubscribed"]).default("all"),
  sort: z.enum(["recent", "first_seen", "name"]).default("recent"),
  page: z.number().int().min(1).default(1),
});

export function displayName(c: {
  firstName: string;
  lastName: string;
  username: string | null;
}) {
  return (
    [c.firstName, c.lastName].filter(Boolean).join(" ") ||
    (c.username ? `@${c.username}` : "Unnamed")
  );
}

/** Real contacts only: preview contacts belong to one member each. */
const real = eq(contacts.channel, "telegram");

export async function listContacts(input: z.infer<typeof listContactsInput>) {
  const where: SQL[] = [real];
  const q = input.q.trim();
  if (q) {
    const pattern = `%${q.replace(/[%_]/g, "")}%`;
    where.push(
      or(
        like(contacts.firstName, pattern),
        like(contacts.lastName, pattern),
        like(contacts.username, pattern),
        like(contacts.email, pattern),
        like(
          sql`${contacts.firstName} || ' ' || ${contacts.lastName}`,
          pattern,
        ),
      )!,
    );
  }
  if (input.subscription !== "all")
    where.push(eq(contacts.subscribed, input.subscription === "subscribed"));
  if (input.tag) {
    where.push(
      inArray(
        contacts.id,
        db
          .select({ id: contactTags.contactId })
          .from(contactTags)
          .where(eq(contactTags.tagId, input.tag)),
      ),
    );
  }
  const order =
    input.sort === "name"
      ? [
          asc(sql`lower(${contacts.firstName} || ' ' || ${contacts.lastName})`),
          asc(contacts.id),
        ]
      : input.sort === "first_seen"
        ? [desc(contacts.firstSeenAt), asc(contacts.id)]
        : [desc(contacts.lastInteractionAt), asc(contacts.id)];
  const [rows, [count]] = await Promise.all([
    db
      .select()
      .from(contacts)
      .where(and(...where))
      .orderBy(...order)
      .limit(PAGE_SIZE)
      .offset((input.page - 1) * PAGE_SIZE),
    db
      .select({ n: sql<number>`count(*)` })
      .from(contacts)
      .where(and(...where)),
  ]);
  const tagRows = rows.length
    ? await db
        .select({ contactId: contactTags.contactId, name: tags.name })
        .from(contactTags)
        .innerJoin(tags, eq(tags.id, contactTags.tagId))
        .where(
          inArray(
            contactTags.contactId,
            rows.map((r) => r.id),
          ),
        )
    : [];
  return {
    total: count?.n ?? 0,
    pageSize: PAGE_SIZE,
    contacts: rows.map((c) => ({
      id: c.id,
      name: displayName(c),
      username: c.username,
      subscribed: c.subscribed,
      firstSeenAt: c.firstSeenAt,
      lastInteractionAt: c.lastInteractionAt,
      tags: tagRows
        .filter((t) => t.contactId === c.id)
        .map((t) => t.name)
        .sort(),
    })),
  };
}

/**
 * A contact a viewer may open: any real contact, or their own preview one.
 */
export async function findContact(viewer: Me, id: string) {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
  if (!contact) return null;
  if (contact.channel === "preview" && contact.previewOwnerId !== viewer.id)
    return null;
  return contact;
}

export async function getContact(viewer: Me, id: string) {
  const contact = await findContact(viewer, id);
  if (!contact || contact.channel !== "telegram") return null;
  const [tagRows, fieldDefs, values] = await Promise.all([
    db
      .select({ id: tags.id, name: tags.name })
      .from(contactTags)
      .innerJoin(tags, eq(tags.id, contactTags.tagId))
      .where(eq(contactTags.contactId, id))
      .orderBy(asc(tags.name)),
    db.select().from(customFields).orderBy(asc(customFields.name)),
    db.select().from(fieldValues).where(eq(fieldValues.contactId, id)),
  ]);
  return {
    id: contact.id,
    name: displayName(contact),
    username: contact.username,
    chatId: contact.chatId,
    email: contact.email,
    phone: contact.phone,
    subscribed: contact.subscribed,
    firstSeenAt: contact.firstSeenAt,
    lastInteractionAt: contact.lastInteractionAt,
    tags: tagRows,
    fields: fieldDefs.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      value: values.find((v) => v.fieldId === f.id)?.value ?? "",
    })),
  };
}

async function realContact(viewer: Me, id: string) {
  const contact = await findContact(viewer, id);
  if (!contact || contact.channel !== "telegram")
    throw new Error("Contact not found");
  return contact;
}

export const contactTagInput = z.object({
  contactId: z.string(),
  tagId: z.string(),
});

export async function addTag(
  viewer: Me,
  { contactId, tagId }: z.infer<typeof contactTagInput>,
) {
  await realContact(viewer, contactId);
  const [tag] = await db.select().from(tags).where(eq(tags.id, tagId));
  if (!tag) throw new Error("Tag not found");
  await db
    .insert(contactTags)
    .values({ contactId, tagId })
    .onConflictDoNothing();
}

export async function removeTag(
  viewer: Me,
  { contactId, tagId }: z.infer<typeof contactTagInput>,
) {
  await realContact(viewer, contactId);
  await db
    .delete(contactTags)
    .where(
      and(eq(contactTags.contactId, contactId), eq(contactTags.tagId, tagId)),
    );
}

export const saveFieldsInput = z.object({
  contactId: z.string(),
  values: z.record(z.string(), z.string().max(1000)),
});

export async function saveFields(
  viewer: Me,
  { contactId, values }: z.infer<typeof saveFieldsInput>,
) {
  await realContact(viewer, contactId);
  const defs = await db.select().from(customFields);
  const writes = [];
  for (const def of defs) {
    if (!(def.id in values)) continue;
    const raw = values[def.id]!.trim();
    if (!raw) {
      writes.push(
        db
          .delete(fieldValues)
          .where(
            and(
              eq(fieldValues.contactId, contactId),
              eq(fieldValues.fieldId, def.id),
            ),
          ),
      );
      continue;
    }
    const value = validateValue(def.type, raw);
    if (value === null)
      throw new Error(
        `${def.name} needs a valid ${def.type === "text" ? "value" : def.type}`,
      );
    writes.push(
      db
        .insert(fieldValues)
        .values({ contactId, fieldId: def.id, value })
        .onConflictDoUpdate({
          target: [fieldValues.contactId, fieldValues.fieldId],
          set: { value },
        }),
    );
  }
  if (writes.length)
    await db.batch(writes as [(typeof writes)[number], ...typeof writes]);
}

export const setSubscribedInput = z.object({
  contactId: z.string(),
  subscribed: z.boolean(),
});

export async function setSubscribed(
  viewer: Me,
  { contactId, subscribed }: z.infer<typeof setSubscribedInput>,
) {
  await realContact(viewer, contactId);
  await db
    .update(contacts)
    .set({ subscribed })
    .where(eq(contacts.id, contactId));
}

export const contactIdInput = z.object({ contactId: z.string() });

/** Deletes a contact and everything kept about them. Admins only. */
export async function deleteContact(
  viewer: Me,
  { contactId }: z.infer<typeof contactIdInput>,
) {
  requireAdmin(viewer);
  await realContact(viewer, contactId);
  await removeContactData(contactId);
}

export async function removeContactData(contactId: string) {
  await db.batch([
    db.delete(messages).where(eq(messages.contactId, contactId)),
    db.delete(contactTags).where(eq(contactTags.contactId, contactId)),
    db.delete(fieldValues).where(eq(fieldValues.contactId, contactId)),
    db.delete(automationRuns).where(eq(automationRuns.contactId, contactId)),
    db.delete(deliveries).where(eq(deliveries.contactId, contactId)),
    db.delete(contacts).where(eq(contacts.id, contactId)),
  ]);
}
