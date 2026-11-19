import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { db } from "@/db";
import { contacts, telegramUpdates } from "@/db/schema";
import { handleIncoming } from "@/server/engine";
import { recordIncoming } from "@/server/messaging";
import { secretMatches } from "@/server/telegram";
import { and, eq } from "drizzle-orm";

const update = z.object({
  update_id: z.number().int(),
  message: z
    .object({
      chat: z.object({ id: z.number(), type: z.string() }),
      from: z
        .object({
          first_name: z.string().default(""),
          last_name: z.string().optional(),
          username: z.string().optional(),
        })
        .optional(),
      text: z.string().optional(),
    })
    .optional(),
});

// Telegram's webhook: public (everyapp.config.ts), so it checks the secret
// header Telegram sends with every update, and answers with no data.
export const Route = createFileRoute("/hooks/telegram")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        if (
          !secretMatches(request.headers.get("x-telegram-bot-api-secret-token"))
        ) {
          return new Response(null, { status: 401 });
        }
        const parsed = update.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response(null, { status: 200 });
        const { update_id, message } = parsed.data;
        if (!message?.text || message.chat.type !== "private") {
          return new Response(null, { status: 200 });
        }
        const fresh = await db
          .insert(telegramUpdates)
          .values({ updateId: update_id, receivedAt: Date.now() })
          .onConflictDoNothing()
          .returning();
        if (!fresh.length) return new Response(null, { status: 200 });

        const chatId = String(message.chat.id);
        const at = Date.now();
        const profile = {
          firstName: message.from?.first_name ?? "",
          lastName: message.from?.last_name ?? "",
          username: message.from?.username ?? null,
        };
        const created = await db
          .insert(contacts)
          .values({
            id: crypto.randomUUID(),
            channel: "telegram",
            chatId,
            ...profile,
            firstSeenAt: at,
            lastInteractionAt: at,
          })
          .onConflictDoNothing()
          .returning({ id: contacts.id });
        if (!created.length) {
          await db
            .update(contacts)
            .set(profile)
            .where(
              and(
                eq(contacts.channel, "telegram"),
                eq(contacts.chatId, chatId),
              ),
            );
        }
        const [contact] = await db
          .select()
          .from(contacts)
          .where(
            and(eq(contacts.channel, "telegram"), eq(contacts.chatId, chatId)),
          );
        await recordIncoming(contact!, message.text);
        await handleIncoming(contact!, message.text, created.length > 0);
        return new Response(null, { status: 200 });
      },
    },
  },
});
