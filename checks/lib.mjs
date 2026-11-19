// Shared setup for the release checks: a local stand-in for the Telegram Bot
// API (the app's TELEGRAM_API_URL setting points at it) and the runtime.
import http from "node:http";
import {
  startRuntime,
  expect,
} from "/home/user/oss-new/control/runtime/index.mjs";

export { expect };

export const WEBHOOK_SECRET = "local-webhook-secret";
export const BOT_TOKEN = "123456:local-test-token";
/** Chats the fake refuses, as Telegram does when a person blocked the bot. */
export const BLOCKED_CHAT = 999;

export async function startFakeTelegram() {
  const calls = [];
  let webhook = { url: "" };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const match = /^\/bot([^/]+)\/(\w+)$/.exec(req.url ?? "");
      const send = (status, json) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(json));
      };
      if (!match || match[1] !== BOT_TOKEN)
        return send(401, { ok: false, description: "Unauthorized" });
      const method = match[2];
      const params = body ? JSON.parse(body) : {};
      calls.push({ method, params });
      if (method === "getMe")
        return send(200, {
          ok: true,
          result: {
            id: 1,
            is_bot: true,
            first_name: "Northwind Help",
            username: "northwind_help_bot",
          },
        });
      if (method === "setWebhook") {
        webhook = { url: params.url };
        return send(200, { ok: true, result: true });
      }
      if (method === "getWebhookInfo")
        return send(200, {
          ok: true,
          result: { url: webhook.url, pending_update_count: 0 },
        });
      if (method === "sendMessage") {
        if (Number(params.chat_id) === BLOCKED_CHAT)
          return send(403, {
            ok: false,
            error_code: 403,
            description: "Forbidden: bot was blocked by the user",
          });
        return send(200, {
          ok: true,
          result: {
            message_id: calls.length,
            chat: { id: params.chat_id },
            text: params.text,
          },
        });
      }
      send(404, { ok: false, description: "Not Found" });
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    sent: (chatId) =>
      calls.filter(
        (c) =>
          c.method === "sendMessage" &&
          String(c.params.chat_id) === String(chatId),
      ),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export async function start() {
  const telegram = await startFakeTelegram();
  const runtime = await startRuntime({
    bindings: {
      TELEGRAM_BOT_TOKEN: { type: "text", value: BOT_TOKEN },
      TELEGRAM_WEBHOOK_SECRET: { type: "text", value: WEBHOOK_SECRET },
      TELEGRAM_API_URL: { type: "text", value: telegram.url },
    },
  });
  return { runtime, telegram };
}

let updateId = 1000;
/** Posts a Telegram text message update to the public webhook. */
export async function incoming(
  runtime,
  from,
  text,
  { secret = WEBHOOK_SECRET, id } = {},
) {
  const update = {
    update_id: id ?? ++updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: from.id, type: "private" },
      from: {
        id: from.id,
        is_bot: false,
        first_name: from.first_name,
        last_name: from.last_name,
        username: from.username,
      },
      text,
    },
  };
  const headers = { "content-type": "application/json" };
  if (secret) headers["x-telegram-bot-api-secret-token"] = secret;
  return runtime.fetch("/hooks/telegram", {
    method: "POST",
    headers,
    body: JSON.stringify(update),
  });
}

export async function rows(runtime, sql, ...params) {
  const db = await runtime.database();
  const { results } = await db
    .prepare(sql)
    .bind(...params)
    .all();
  return results;
}

/** Polls until fn returns a truthy value. */
export async function until(fn, what, timeout = 10000) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

/**
 * Captures the server-function request a click would make, without letting
 * it run, so another role can replay the very same call.
 */
export async function captureServerCall(page, click) {
  let captured;
  const handler = async (route) => {
    const req = route.request();
    if (req.method() !== "POST" || captured) return route.continue();
    const headers = { ...req.headers() };
    for (const h of [
      "host",
      "cookie",
      "content-length",
      "connection",
      "referer",
    ])
      delete headers[h];
    captured = {
      path: new URL(req.url()).pathname + new URL(req.url()).search,
      headers,
      body: req.postData(),
    };
    await route.abort();
  };
  await page.route("**/_serverFn/**", handler);
  await click();
  await until(() => captured, "the server call");
  await page.unroute("**/_serverFn/**", handler);
  return captured;
}

export function replay(runtime, call, role) {
  return runtime.fetch(call.path, {
    role,
    method: "POST",
    headers: call.headers,
    body: call.body,
  });
}
