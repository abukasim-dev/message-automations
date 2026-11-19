import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "message-automations",
  name: "Message Automations",
  description:
    "Automatic replies, a shared inbox and broadcasts for your Telegram bot.",
  icon: "/icon.svg",
  access: "everyone",
  resources: {
    d1: ["DB"],
  },
  public: [{ path: "/hooks/telegram", methods: ["POST"] }],
  secrets: [
    {
      name: "TELEGRAM_WEBHOOK_SECRET",
      generate: true,
      why: "Proves that messages arriving at the webhook come from Telegram.",
    },
  ],
  settings: [
    {
      name: "TELEGRAM_API_URL",
      type: "url",
      default: "https://api.telegram.org",
      why: "The Bot API server the bot talks to: Telegram's, or one you run.",
      docs: "https://core.telegram.org/bots/api#using-a-local-bot-api-server",
    },
  ],
  features: {
    telegram: {
      name: "Telegram bot",
      why: "Receives messages sent to your bot and sends replies, automations and broadcasts through it.",
      steps: [
        "In Telegram, message @BotFather, send /newbot and follow the prompts.",
        "Copy the token it gives you into TELEGRAM_BOT_TOKEN.",
        "Open the app's Settings and press Register webhook.",
      ],
      secrets: [
        {
          name: "TELEGRAM_BOT_TOKEN",
          how: "The token @BotFather gave your bot.",
        },
      ],
    },
  },
});
