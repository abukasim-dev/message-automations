/// <reference types="vite/client" />

// The bindings come from `cf workers types` (.cloudflare/types). The app's
// own secrets and settings (everyapp.config.ts), optional until set:
declare namespace Cloudflare {
  interface Env {
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_WEBHOOK_SECRET?: string;
    TELEGRAM_API_URL?: string;
  }
}
