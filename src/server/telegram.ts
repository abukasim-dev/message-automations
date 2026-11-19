import { env } from "cloudflare:workers";
import type { Button } from "./steps";

const DEFAULT_API = "https://api.telegram.org";

export function botToken(): string | null {
  return env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

export function webhookSecret(): string | null {
  return env.TELEGRAM_WEBHOOK_SECRET?.trim() || null;
}

type TelegramResult<T> = { ok: true; result: T } | { ok: false; error: string };

/** Calls a Bot API method. Never throws: a failure is a result. */
export async function callTelegram<T>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<TelegramResult<T>> {
  const token = botToken();
  if (!token) return { ok: false, error: "Telegram isn't connected" };
  const base = (env.TELEGRAM_API_URL?.trim() || DEFAULT_API).replace(
    /\/+$/,
    "",
  );
  try {
    const response = await fetch(`${base}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      result?: T;
      description?: string;
    } | null;
    if (body?.ok) return { ok: true, result: body.result as T };
    return {
      ok: false,
      error: (
        body?.description ?? `Telegram answered ${response.status}`
      ).slice(0, 300),
    };
  } catch {
    return { ok: false, error: "Couldn't reach Telegram" };
  }
}

export function sendTelegramMessage(
  chatId: string,
  text: string,
  buttons: Button[],
) {
  return callTelegram<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    ...(buttons.length
      ? {
          reply_markup: {
            inline_keyboard: buttons.map((b) => [
              { text: b.label, url: b.url },
            ]),
          },
        }
      : {}),
  });
}

/** Constant-time comparison of the webhook's secret header. */
export function secretMatches(given: string | null): boolean {
  const expected = webhookSecret();
  if (!expected || !given) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
