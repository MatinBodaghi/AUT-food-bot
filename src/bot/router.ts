// Telegram update router. Single-owner bot: the first chat that talks to the bot
// becomes its owner (the installer/OWNER_ID path can be added later).

import type { CallbackQuery, Update } from "@grammyjs/types";

import { FoodClient } from "../food/client";
import { parseReservePage } from "../food/parse";
import type { MealType } from "../food/types";
import { Store } from "../store";
import { Telegram } from "../telegram/api";
import { btn, esc, fmtPrice, kb, todayJalali, truncate } from "../telegram/format";

const WELCOME =
  "🍱 <b>ربات تغذیهٔ امیرکبیر</b>\n\n" +
  "با این ربات منوی سلف‌ها را می‌بینی و بعداً می‌توانی رزرو کنی.\n\n" +
  "اول با /login وارد شو، بعد /menu را بزن.";

const MEAL_LABELS: Record<MealType, string> = {
  lunch: "ناهار",
  dinner: "شام",
  breakfast: "صبحانه",
};

const mainMenu = () =>
  kb([[btn("🍱 منوی امروز", "menu"), btn("🔑 ورود", "login")]]);

export async function handleUpdate(env: Env, update: Update): Promise<void> {
  const message = update.message ?? update.edited_message;
  const callback = update.callback_query;
  const chatId = message?.chat.id ?? callback?.message?.chat.id;
  if (chatId === undefined) return;

  const store = new Store(env.DB, env.TOKEN_KEY);
  const tg = new Telegram(env.BOT_TOKEN);

  const owner = await store.get("owner_id");
  if (owner === null) {
    await store.set("owner_id", chatId);
  } else if (owner !== chatId) {
    await tg.sendMessage(chatId, "این ربات خصوصی است.");
    return;
  }

  if (callback) {
    await tg.answerCallback(callback.id).catch(() => {});
    await onCallback(env, store, tg, chatId, callback);
    return;
  }

  const text = message?.text?.trim();
  if (!message || !text) return;

  if (text.startsWith("/")) {
    await onCommand(store, tg, chatId, text);
    return;
  }
  await onText(store, tg, chatId, message.message_id, text);
}

async function onCommand(
  store: Store,
  tg: Telegram,
  chatId: number,
  raw: string,
): Promise<void> {
  const command = raw.split(/\s+/)[0]!.replace(/@\w+$/, "").toLowerCase();

  switch (command) {
    case "/start":
    case "/help":
      await tg.sendMessage(chatId, WELCOME, { reply_markup: mainMenu() });
      return;

    case "/login":
      await askUsername(store, tg, chatId);
      return;

    case "/logout":
      await store.delete("aut_credentials", "aut_session", "person_group_id", "login_step", "login_username");
      await tg.sendMessage(chatId, "از حساب خارج شدی و اطلاعات ذخیره‌شده پاک شد.");
      return;

    case "/menu":
      await showMenu(store, tg, chatId);
      return;

    default:
      await tg.sendMessage(chatId, "دستور ناشناخته. /help را بزن.");
  }
}

async function onCallback(
  _env: Env,
  store: Store,
  tg: Telegram,
  chatId: number,
  callback: CallbackQuery,
): Promise<void> {
  const data = callback.data;
  if (data === "login") {
    await askUsername(store, tg, chatId);
  } else if (data === "menu") {
    await showMenu(store, tg, chatId);
  } else {
    await tg.answerCallback(callback.id, "این دکمه دیگر فعال نیست.", true).catch(() => {});
  }
}

async function askUsername(store: Store, tg: Telegram, chatId: number): Promise<void> {
  await store.set("login_step", "username");
  await store.delete("login_username");
  await tg.sendMessage(
    chatId,
    "شمارهٔ دانشجویی (نام کاربری سامانه) را بفرست:\n" +
      "<i>برای انصراف /cancel را بزن. پیام‌های این مرحله بعد از خواندن پاک می‌شوند.</i>",
  );
}

async function onText(
  store: Store,
  tg: Telegram,
  chatId: number,
  messageId: number,
  text: string,
): Promise<void> {
  if (text === "/cancel") {
    await store.delete("login_step", "login_username");
    await tg.sendMessage(chatId, "لغو شد.");
    return;
  }

  const step = await store.get("login_step");
  if (step === "username") {
    await deleteQuiet(tg, chatId, messageId);
    await store.set("login_username", text);
    await store.set("login_step", "password");
    await tg.sendMessage(chatId, "رمز عبور را بفرست. پیام بلافاصله پاک می‌شود.");
    return;
  }

  if (step === "password") {
    await deleteQuiet(tg, chatId, messageId);
    const username = (await store.get("login_username")) ?? "";
    await store.delete("login_step", "login_username");
    await login(store, tg, chatId, username, text);
    return;
  }

  await tg.sendMessage(chatId, "برای دیدن منو /menu را بزن.", { reply_markup: mainMenu() });
}

async function login(
  store: Store,
  tg: Telegram,
  chatId: number,
  username: string,
  password: string,
): Promise<void> {
  const client = new FoodClient();
  try {
    await client.login(username, password);
    const personGroupId = await client.getPersonGroupId();

    await store.setCredentials({ username, password });
    await store.setSession(client.jar.serialize());
    await store.set("person_group_id", personGroupId);

    await tg.sendMessage(chatId, "✅ ورود موفق بود. حالا /menu را بزن.", {
      reply_markup: mainMenu(),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await tg.sendMessage(chatId, `❌ ورود ناموفق: ${esc(reason)}`);
  }
}

async function showMenu(store: Store, tg: Telegram, chatId: number): Promise<void> {
  const serialized = await store.getSession();
  if (!serialized) {
    await tg.sendMessage(chatId, "اول باید وارد شوی. /login را بزن.");
    return;
  }

  const client = new FoodClient();
  client.jar.deserialize(serialized);

  try {
    let personGroupId = await store.get("person_group_id");
    if (!personGroupId) {
      personGroupId = await client.getPersonGroupId();
      await store.set("person_group_id", personGroupId);
    }

    const restaurants = await client.getRestaurants(personGroupId);
    const today = todayJalali();
    const lines: string[] = [];
    let found = 0;

    for (const restaurant of restaurants) {
      const html = await client.getReservePage(personGroupId, restaurant.id);
      const page = parseReservePage(html);
      const day = page.days.find((candidate) => candidate.date === today);
      if (!day || day.meals.length === 0) continue;

      found++;
      lines.push(`\n🍽 <b>${esc(restaurant.name)}</b>`);
      for (const meal of day.meals) {
        lines.push(`<i>${MEAL_LABELS[meal.type] ?? meal.type}</i>`);
        for (const option of meal.options) {
          const mark = option.reserved ? "✅" : "•";
          const price = option.price !== null ? ` — ${fmtPrice(option.price)}` : "";
          lines.push(`${mark} ${esc(option.name)}${price}`);
        }
      }
    }

    if (found === 0) {
      await tg.sendMessage(
        chatId,
        `برای امروز (${esc(today)}) غذایی در سلف‌ها پیدا نشد.`,
        { reply_markup: mainMenu() },
      );
      return;
    }

    const text = `🗓 منوی امروز — ${esc(today)}\n${lines.join("\n")}`;
    await tg.sendMessage(chatId, truncate(text), { reply_markup: mainMenu() });
    await store.setSession(client.jar.serialize());
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await tg.sendMessage(
      chatId,
      `❌ خواندن منو ناموفق بود: ${esc(reason)}\n` +
        "اگر نشست منقضی شده، دوباره /login را بزن.",
    );
  }
}

async function deleteQuiet(tg: Telegram, chatId: number, messageId: number): Promise<void> {
  await tg.deleteMessage(chatId, messageId).catch(() => {});
}
