// Worker entry point: Telegram webhook plus a tiny health page.
// The webhook is registered with `npm run webhook` (tools/set-webhook.mjs).

import type { Update } from "@grammyjs/types";

import { handleUpdate } from "./bot/router";
import { safeEqual } from "./crypto";

const WEBHOOK_PATH = "/telegram";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response("AUT-food-bot is running.\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (request.method !== "POST" || url.pathname !== WEBHOOK_PATH) {
      return new Response("Not found", { status: 404 });
    }

    // Telegram echoes the secret passed to setWebhook; anything else is not Telegram.
    const provided = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
    if (!safeEqual(provided, env.WEBHOOK_SECRET)) {
      return new Response("Forbidden", { status: 403 });
    }

    const update = (await request.json()) as Update;
    try {
      await handleUpdate(env, update);
    } catch (error) {
      console.error("update failed", update.update_id, error);
    }
    // Always 200: a non-2xx response makes Telegram retry the same update forever.
    return new Response("ok");
  },
} satisfies ExportedHandler<Env>;
