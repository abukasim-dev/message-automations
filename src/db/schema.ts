import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(cast(unixepoch('subsec') * 1000 as integer))`;

/** People who opened the app, keyed by the Gateway's user id. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: integer("created_at").notNull().default(now),
});

/** Small app-wide values, such as the webhook URL last registered. */
export const appState = sqliteTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/**
 * A person writing to the bot (channel `telegram`), or a member's own test
 * contact (channel `preview`, chat id = the member's user id). The
 * conversation's inbox state lives on the contact: one thread each.
 */
export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    channel: text("channel", { enum: ["telegram", "preview"] }).notNull(),
    chatId: text("chat_id").notNull(),
    previewOwnerId: text("preview_owner_id"),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    username: text("username"),
    email: text("email"),
    phone: text("phone"),
    subscribed: integer("subscribed", { mode: "boolean" })
      .notNull()
      .default(true),
    firstSeenAt: integer("first_seen_at").notNull().default(now),
    lastInteractionAt: integer("last_interaction_at").notNull().default(now),
    lastMessageAt: integer("last_message_at"),
    lastMessageText: text("last_message_text"),
    status: text("status", { enum: ["open", "done"] })
      .notNull()
      .default("open"),
    starred: integer("starred", { mode: "boolean" }).notNull().default(false),
    assigneeId: text("assignee_id"),
    pausedUntil: integer("paused_until"),
  },
  (t) => [
    uniqueIndex("contacts_channel_chat").on(t.channel, t.chatId),
    index("contacts_last_message").on(t.lastMessageAt),
  ],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id").notNull(),
    kind: text("kind", {
      enum: ["incoming", "manual", "automated", "broadcast", "system"],
    }).notNull(),
    text: text("text").notNull(),
    /** JSON: [{ label, url }] */
    buttons: text("buttons"),
    status: text("status", {
      enum: ["received", "sent", "failed", "shown"],
    }).notNull(),
    error: text("error"),
    authorId: text("author_id"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("messages_contact").on(t.contactId, t.createdAt)],
);

/** Telegram update ids already handled, so a redelivery runs nothing twice. */
export const telegramUpdates = sqliteTable("telegram_updates", {
  updateId: integer("update_id").primaryKey(),
  receivedAt: integer("received_at").notNull().default(now),
});

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: integer("created_at").notNull().default(now),
});

export const contactTags = sqliteTable(
  "contact_tags",
  {
    contactId: text("contact_id").notNull(),
    tagId: text("tag_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.contactId, t.tagId] }),
    index("contact_tags_tag").on(t.tagId),
  ],
);

export const customFields = sqliteTable("custom_fields", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  type: text("type", { enum: ["text", "number", "email", "phone"] }).notNull(),
  createdAt: integer("created_at").notNull().default(now),
});

export const fieldValues = sqliteTable(
  "field_values",
  {
    contactId: text("contact_id").notNull(),
    fieldId: text("field_id").notNull(),
    value: text("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.fieldId] })],
);

export const automations = sqliteTable("automations", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  trigger: text("trigger", {
    enum: ["welcome", "keyword", "default"],
  }).notNull(),
  /** JSON: string[] */
  keywords: text("keywords").notNull().default("[]"),
  match: text("match", { enum: ["exact", "contains"] })
    .notNull()
    .default("exact"),
  /** JSON: Step[] (src/server/steps.ts) */
  steps: text("steps").notNull().default("[]"),
  status: text("status", { enum: ["draft", "active"] })
    .notNull()
    .default("draft"),
  runCount: integer("run_count").notNull().default(0),
  lastRunAt: integer("last_run_at"),
  createdAt: integer("created_at").notNull().default(now),
  updatedAt: integer("updated_at").notNull().default(now),
});

export const automationRuns = sqliteTable(
  "automation_runs",
  {
    id: text("id").primaryKey(),
    automationId: text("automation_id").notNull(),
    contactId: text("contact_id").notNull(),
    status: text("status", {
      enum: ["running", "asking", "waiting", "done", "stopped"],
    }).notNull(),
    stepIndex: integer("step_index").notNull().default(0),
    resumeAt: integer("resume_at"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [
    index("runs_contact").on(t.contactId, t.status),
    index("runs_resume").on(t.status, t.resumeAt),
  ],
);

export const broadcasts = sqliteTable("broadcasts", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  text: text("text").notNull().default(""),
  buttonLabel: text("button_label"),
  buttonUrl: text("button_url"),
  audience: text("audience", { enum: ["everyone", "any", "all"] })
    .notNull()
    .default("everyone"),
  /** JSON: string[] */
  tagIds: text("tag_ids").notNull().default("[]"),
  status: text("status", {
    enum: ["draft", "scheduled", "sending", "sent", "canceled"],
  })
    .notNull()
    .default("draft"),
  sendAt: integer("send_at"),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  sentAt: integer("sent_at"),
  createdAt: integer("created_at").notNull().default(now),
});

/** One row per broadcast and contact: a contact gets a broadcast at most once. */
export const deliveries = sqliteTable(
  "deliveries",
  {
    broadcastId: text("broadcast_id").notNull(),
    contactId: text("contact_id").notNull(),
    status: text("status", { enum: ["pending", "sent", "failed"] }).notNull(),
    error: text("error"),
  },
  (t) => [primaryKey({ columns: [t.broadcastId, t.contactId] })],
);
