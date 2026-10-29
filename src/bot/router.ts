// Telegram update router. Single-owner bot: the first chat that talks to the bot
// becomes its owner (the installer/OWNER_ID path can be added later).

import type { CallbackQuery, Update } from "@grammyjs/types";

import { FoodClient } from "../food/client";
import { parseReservePage } from "../food/parse";
import { buildDataId } from "../food/reserve";
import type { MealType } from "../food/types";
import { Store, type PendingAction, type PendingOption } from "../store";
import { Telegram } from "../telegram/api";
import { btn, esc, fmtPrice, kb, todayJalali, truncate } from "../telegram/format";

const WELCOME =
  "🍱 <b>ربات تغذیهٔ امیرکبیر</b>\n\n" +
  "/menu — منوی سلف‌ها\n" +
  "/reserve — رزرو یا لغو یک وعده\n" +
  "/login — ورود به حساب\n\n" +
  "برای شروع با /login وارد شو.";

const MEAL_LABELS: Record<MealType, string> = {
  lunch: "ناهار",
  dinner: "شام",
  breakfast: "صبحانه",
};

const mainMenu = () =>
  kb([
    [btn("🍱 منو", "menu"), btn("📝 رزرو", "reserve")],
    [btn("🔑 ورود", "login")],
  ]);

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
    await onCallback(store, tg, chatId, callback);
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
      await store.delete(
        "aut_credentials",
        "aut_session",
        "person_group_id",
        "login_step",
        "login_username",
        "pending_options",
        "pending_action",
      );
      await tg.sendMessage(chatId, "از حساب خارج شدی و اطلاعات ذخیره‌شده پاک شد.");
      return;

    case "/menu":
      await showMenu(store, tg, chatId);
      return;

    case "/reserve":
      await showRestaurants(store, tg, chatId);
      return;

    default:
      await tg.sendMessage(chatId, "دستور ناشناخته. /help را بزن.");
  }
}

async function onCallback(
  store: Store,
  tg: Telegram,
  chatId: number,
  callback: CallbackQuery,
): Promise<void> {
  const data = callback.data ?? "";

  if (data === "login") return askUsername(store, tg, chatId);
  if (data === "menu") return showMenu(store, tg, chatId);
  if (data === "reserve") return showRestaurants(store, tg, chatId);
  if (data === "x") {
    await store.delete("pending_action");
    await tg.sendMessage(chatId, "لغو شد.");
    return;
  }
  if (data === "c") return confirmAction(store, tg, chatId);
  if (data.startsWith("r:")) return showRestaurantOptions(store, tg, chatId, Number(data.slice(2)));
  if (data.startsWith("o:")) return chooseOption(store, tg, chatId, Number(data.slice(2)));

  await tg.answerCallback(callback.id, "این دکمه دیگر فعال نیست.", true).catch(() => {});
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

/** Rebuild a client from the stored cookie and make sure personGroupId is known. */
async function openClient(
  store: Store,
): Promise<{ client: FoodClient; personGroupId: number } | null> {
  const serialized = await store.getSession();
  if (!serialized) return null;

  const client = new FoodClient();
  client.jar.deserialize(serialized);

  let personGroupId = await store.get("person_group_id");
  if (!personGroupId) {
    personGroupId = await client.getPersonGroupId();
    await store.set("person_group_id", personGroupId);
  }

  return { client, personGroupId };
}

async function showMenu(store: Store, tg: Telegram, chatId: number): Promise<void> {
  const opened = await openClient(store);
  if (!opened) {
    await tg.sendMessage(chatId, "اول باید وارد شوی. /login را بزن.");
    return;
  }
  const { client, personGroupId } = opened;

  try {
    const restaurants = await client.getRestaurants(personGroupId);
    const today = todayJalali();
    const pages: { name: string; page: ReturnType<typeof parseReservePage> }[] = [];

    for (const restaurant of restaurants) {
      const html = await client.getReservePage(personGroupId, restaurant.id);
      pages.push({ name: restaurant.name, page: parseReservePage(html) });
    }

    const dates = [
      ...new Set(
        pages.flatMap(({ page }) =>
          page.days.filter((day) => day.meals.length > 0).map((day) => day.date),
        ),
      ),
    ].sort();

    // On weekends (or after the last reservable day) today has no food, so show the
    // nearest day that does instead of an empty message.
    const target = dates.includes(today)
      ? today
      : (dates.find((date) => date > today) ?? dates[dates.length - 1]);

    if (!target) {
      await tg.sendMessage(chatId, `برای این هفته (${esc(today)}) غذایی در سلف‌ها پیدا نشد.`, {
        reply_markup: mainMenu(),
      });
      return;
    }

    const credit = pages[0]?.page.credit ?? null;
    const lines: string[] = [];
    let found = 0;

    for (const { name, page } of pages) {
      const day = page.days.find((candidate) => candidate.date === target);
      if (!day || day.meals.length === 0) continue;

      found++;
      lines.push(`\n🍽 <b>${esc(name)}</b>`);
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
      await tg.sendMessage(chatId, `برای ${esc(target)} غذایی پیدا نشد.`, {
        reply_markup: mainMenu(),
      });
      return;
    }

    const heading = target === today ? "منوی امروز" : "نزدیک‌ترین روز با غذا";
    const creditLine = credit !== null ? `\n💳 اعتبار: ${fmtPrice(credit)}` : "";
    const text = `🗓 ${heading} — ${esc(target)}${creditLine}\n${lines.join("\n")}`;
    await tg.sendMessage(chatId, truncate(text), { reply_markup: mainMenu() });
    await store.setSession(client.jar.serialize());
  } catch (error) {
    await reportError(tg, chatId, "خواندن منو", error);
  }
}

async function showRestaurants(store: Store, tg: Telegram, chatId: number): Promise<void> {
  const opened = await openClient(store);
  if (!opened) {
    await tg.sendMessage(chatId, "اول باید وارد شوی. /login را بزن.");
    return;
  }

  try {
    const restaurants = await opened.client.getRestaurants(opened.personGroupId);
    const rows = restaurants.map((restaurant) => [btn(restaurant.name, `r:${restaurant.id}`)]);
    await tg.sendMessage(chatId, "کدام سلف را می‌خواهی؟", { reply_markup: kb(rows) });
  } catch (error) {
    await reportError(tg, chatId, "دریافت سلف‌ها", error);
  }
}

async function showRestaurantOptions(
  store: Store,
  tg: Telegram,
  chatId: number,
  restId: number,
): Promise<void> {
  const opened = await openClient(store);
  if (!opened) {
    await tg.sendMessage(chatId, "اول باید وارد شوی. /login را بزن.");
    return;
  }

  try {
    const html = await opened.client.getReservePage(opened.personGroupId, restId);
    const page = parseReservePage(html);
    const today = todayJalali();

    // Only days that actually have something clickable.
    const days = page.days.filter((day) =>
      day.meals.some((meal) => meal.options.some((option) => option.selectable)),
    );
    const day = days.find((candidate) => candidate.date === today) ??
      days.find((candidate) => candidate.date > today) ??
      days[0];

    if (!day) {
      await tg.sendMessage(
        chatId,
        "برای این سلف هیچ وعدهٔ قابل تغییر (رزرو/لغو) باز نیست.\n" +
          "احتمالاً مهلت‌ها گذشته‌اند یا هفتهٔ دیگری باید انتخاب شود.",
      );
      return;
    }

    const options: PendingOption[] = [];
    for (const meal of day.meals) {
      for (const option of meal.options) {
        if (!option.selectable) continue;
        const action = option.reserved ? "cancel" : "reserve";
        options.push({
          dataId: buildDataId(option, action),
          name: option.name,
          price: option.price,
          action,
        });
      }
    }

    if (options.length === 0) {
      await tg.sendMessage(chatId, "وعدهٔ قابل تغییری در این روز پیدا نشد.");
      return;
    }

    await store.set("pending_options", {
      restId,
      restaurantName: page.restaurant ?? "",
      date: day.date,
      options,
    });
    await store.delete("pending_action");
    await store.setSession(opened.client.jar.serialize());

    const rows = options.map((option, index) => [
      btn(`${option.action === "cancel" ? "لغو" : "رزرو"}: ${option.name}`, `o:${index}`),
    ]);
    await tg.sendMessage(
      chatId,
      `📅 <b>${esc(page.restaurant ?? "")}</b> — ${esc(day.date)}\nیکی را انتخاب کن:`,
      { reply_markup: kb(rows) },
    );
  } catch (error) {
    await reportError(tg, chatId, "دریافت صفحهٔ رزرو", error);
  }
}

async function chooseOption(
  store: Store,
  tg: Telegram,
  chatId: number,
  index: number,
): Promise<void> {
  const pending = await store.get("pending_options");
  const option = pending?.options[index];
  if (!pending || !option || !Number.isInteger(index)) {
    await tg.sendMessage(chatId, "این انتخاب منقضی شده. دوباره /reserve را بزن.");
    return;
  }

  const action: PendingAction = {
    restId: pending.restId,
    date: pending.date,
    name: option.name,
    action: option.action,
    dataId: option.dataId,
  };
  await store.set("pending_action", action);

  const verb = option.action === "cancel" ? "لغو رزرو" : "رزرو";
  await tg.sendMessage(
    chatId,
    `⚠️ ${verb} «${esc(option.name)}» برای ${esc(pending.date)} در «${esc(pending.restaurantName)}»؟` +
      (option.price !== null ? `\n💰 ${fmtPrice(option.price)}` : ""),
    { reply_markup: kb([[btn("✅ تأیید", "c")], [btn("❌ انصراف", "x")]]) },
  );
}

async function confirmAction(store: Store, tg: Telegram, chatId: number): Promise<void> {
  const action = await store.get("pending_action");
  if (!action) {
    await tg.sendMessage(chatId, "چیزی برای تأیید پیدا نشد.");
    return;
  }

  const opened = await openClient(store);
  if (!opened) {
    await tg.sendMessage(chatId, "نشست منقضی شده. /login را بزن.");
    return;
  }

  try {
    await opened.client.submitReserve(opened.personGroupId, action.restId, [action.dataId]);

    // Verify by re-reading the page: a 200 response alone does not prove anything.
    const html = await opened.client.getReservePage(opened.personGroupId, action.restId);
    const page = parseReservePage(html);
    const day = page.days.find((candidate) => candidate.date === action.date);
    const after = day?.meals
      .flatMap((meal) => meal.options)
      .find((option) => option.name === action.name);

    const verb = action.action === "cancel" ? "لغو" : "رزرو";
    if (after && after.reserved !== (action.action === "reserve")) {
      await tg.sendMessage(
        chatId,
        `⚠️ درخواست ${verb} ارسال شد، ولی تغییر روی صفحه تأیید نشد. ` +
          "لطفاً چند دقیقهٔ دیگر دوباره /reserve را بزن.",
      );
    } else {
      await tg.sendMessage(
        chatId,
        `✅ ${verb} «${esc(action.name)}» برای ${esc(action.date)} ثبت شد.` +
          `\n💳 اعتبار: ${fmtPrice(page.credit)}`,
        { reply_markup: mainMenu() },
      );
    }

    await store.setSession(opened.client.jar.serialize());
  } catch (error) {
    await reportError(tg, chatId, "ثبت درخواست", error);
  } finally {
    await store.delete("pending_action", "pending_options");
  }
}

async function reportError(
  tg: Telegram,
  chatId: number,
  what: string,
  error: unknown,
): Promise<void> {
  const reason = error instanceof Error ? error.message : String(error);
  await tg.sendMessage(
    chatId,
    `❌ ${what} ناموفق بود: ${esc(reason)}\n` +
      "اگر نشست منقضی شده، دوباره /login را بزن.",
  );
}

async function deleteQuiet(tg: Telegram, chatId: number, messageId: number): Promise<void> {
  await tg.deleteMessage(chatId, messageId).catch(() => {});
}
