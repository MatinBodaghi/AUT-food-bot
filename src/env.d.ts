interface Env {
  /** D1 database binding (schema: migrations/). */
  DB: D1Database;
  /** Telegram bot token from @BotFather. */
  BOT_TOKEN: string;
  /** Random value Telegram echoes in X-Telegram-Bot-Api-Secret-Token. */
  WEBHOOK_SECRET: string;
  /** Base64 of 32 random bytes; encrypts the AUT password and session cookie. */
  TOKEN_KEY: string;
}
