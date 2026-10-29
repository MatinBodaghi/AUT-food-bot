// Registers the Telegram webhook for the deployed Worker.
// Reads BOT_TOKEN / WEBHOOK_SECRET from .dev.vars (or the environment).
// Usage: node tools/set-webhook.mjs [worker-url]

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readDevVars() {
  try {
    return Object.fromEntries(
      readFileSync(join(ROOT, ".dev.vars"), "utf8")
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

const vars = { ...readDevVars(), ...process.env };
const token = vars.BOT_TOKEN;
const secret = vars.WEBHOOK_SECRET;
const workerUrl = process.argv[2] ?? vars.WORKER_URL;

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

if (!token) fail("BOT_TOKEN پیدا نشد. آن را در .dev.vars بگذار.");
if (!secret) fail("WEBHOOK_SECRET پیدا نشد. یک رشتهٔ تصادفی در .dev.vars بگذار.");
if (!workerUrl) fail("آدرس Worker را بده: node tools/set-webhook.mjs https://<worker>.workers.dev");

const webhookUrl = `${workerUrl.replace(/\/$/, "")}/telegram`;
const api = (method, body) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((response) => response.json());

const set = await api("setWebhook", {
  url: webhookUrl,
  secret_token: secret,
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: true,
});
if (!set.ok) fail(`setWebhook ناموفق: ${set.description}`);

const commands = await api("setMyCommands", {
  commands: [
    { command: "menu", description: "منوی امروز همهٔ سلف‌ها" },
    { command: "reserve", description: "رزرو یا لغو یک وعده" },
    { command: "login", description: "ورود به حساب تغذیه" },
    { command: "logout", description: "خروج و پاک کردن اطلاعات" },
    { command: "help", description: "راهنما" },
  ],
});
if (!commands.ok) console.warn(`⚠️ setMyCommands: ${commands.description}`);

console.log(`✅ webhook روی ${webhookUrl} ثبت شد.`);
