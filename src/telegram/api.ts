// Minimal Telegram Bot API client.
import type { InlineKeyboardMarkup, Message } from "@grammyjs/types";

export class TelegramError extends Error {
  constructor(readonly method: string, readonly code: number, readonly description: string) {
    super(`${method}: ${code} ${description}`);
  }
}

export interface SendOptions {
  reply_markup?: InlineKeyboardMarkup;
}

export class Telegram {
  private readonly base: string;

  constructor(token: string) {
    this.base = `https://api.telegram.org/bot${token}`;
  }

  async call<T>(method: string, params: object = {}): Promise<T> {
    const init: RequestInit = {
      method: "POST",
      body: JSON.stringify(params),
      headers: { "content-type": "application/json" },
    };
    const resp = await fetch(`${this.base}/${method}`, init);
    const data = (await resp.json()) as { ok: boolean; result: T; error_code: number; description: string };
    if (!data.ok) throw new TelegramError(method, data.error_code, data.description);
    return data.result;
  }

  sendMessage(chatId: number, text: string, opts: SendOptions = {}): Promise<Message.TextMessage> {
    return this.call("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...opts,
    });
  }

  async editOrSend(chatId: number, messageId: number, text: string, opts: SendOptions = {}): Promise<void> {
    try {
      await this.call("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        ...opts,
      });
    } catch (err) {
      if (err instanceof TelegramError && err.description.includes("message is not modified")) return;
      await this.sendMessage(chatId, text, opts);
    }
  }

  answerCallback(id: string, text?: string, alert = false): Promise<true> {
    return this.call("answerCallbackQuery", { callback_query_id: id, text, show_alert: alert });
  }

  deleteMessage(chatId: number, messageId: number): Promise<true> {
    return this.call("deleteMessage", { chat_id: chatId, message_id: messageId });
  }
}
