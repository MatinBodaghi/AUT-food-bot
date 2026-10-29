// JSON API for the Telegram Mini App. Authentication is Telegram WebApp initData:
// the page cannot be opened by anyone else, and the bot is single-owner anyway.

import { FoodClient } from "./food/client";
import { parseReservePage } from "./food/parse";
import { buildDataId, type ReserveAction } from "./food/reserve";
import type { ReservePage } from "./food/types";
import { Store } from "./store";
import { todayJalali } from "./telegram/format";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

type Week = "pre" | "cur" | "next";

interface WebAppUser {
  id: number;
  first_name?: string;
  username?: string;
}

class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) {
    super(message);
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

/** Constant-time hex comparison (no Workers-only APIs, so it also runs in tests). */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256(keyBytes: Uint8Array, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

const toHex = (bytes: Uint8Array) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

/**
 * Validate Telegram WebApp initData.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export async function verifyInitData(initData: string, botToken: string): Promise<WebAppUser> {
  if (!initData) throw new ApiError(401, "initData missing", "init_data_missing");

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new ApiError(401, "initData has no hash", "init_data_invalid");

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken);
  const computed = toHex(await hmacSha256(secret, dataCheckString));
  if (!timingSafeEqualHex(computed, hash)) {
    throw new ApiError(401, "initData signature mismatch", "init_data_invalid");
  }

  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Math.abs(Date.now() / 1000 - authDate) > 86_400) {
    throw new ApiError(401, "initData has expired", "init_data_expired");
  }

  const rawUser = params.get("user");
  if (!rawUser) throw new ApiError(401, "initData has no user", "init_data_invalid");

  const user = JSON.parse(rawUser) as WebAppUser;
  if (!user?.id) throw new ApiError(401, "initData has no user id", "init_data_invalid");
  return user;
}

interface Session {
  store: Store;
  client: FoodClient;
  personGroupId: number;
}

async function authenticate(request: Request, env: Env): Promise<{ store: Store; user: WebAppUser }> {
  const initData = request.headers.get("X-Telegram-Init-Data") ?? "";
  const user = await verifyInitData(initData, env.BOT_TOKEN);

  const store = new Store(env.DB, env.TOKEN_KEY);
  const owner = await store.get("owner_id");
  if (owner === null) {
    await store.set("owner_id", user.id);
  } else if (owner !== user.id) {
    throw new ApiError(403, "this bot is private", "not_owner");
  }
  return { store, user };
}

/** Restore the AUT session; throws 401 when the user has to log in again. */
async function withSession(store: Store): Promise<Session> {
  const serialized = await store.getSession();
  if (!serialized) throw new ApiError(401, "login required", "login_required");

  const client = new FoodClient();
  client.jar.deserialize(serialized);

  let personGroupId = await store.get("person_group_id");
  if (!personGroupId) {
    personGroupId = await client.getPersonGroupId();
    await store.set("person_group_id", personGroupId);
  }
  return { store, client, personGroupId };
}

function weekOf(value: string | null): Week {
  return value === "pre" || value === "next" ? value : "cur";
}

/**
 * Collect the three weekly fragments and dedupe them.
 *
 * The site's endpoint names are unreliable: in late 2026 `GetReservePage` (current)
 * returned the same range as `GetPreReservePage`, while `GetNextReservePage` held
 * the week containing today. So we sort by the actual dates and locate "today"
 * instead of trusting the endpoint labels.
 */
async function collectWeekPages(
  client: FoodClient,
  personGroupId: number,
  restId: number,
): Promise<ReservePage[]> {
  const loaders = [
    () => client.getPreReservePage(personGroupId, restId),
    () => client.getReservePage(personGroupId, restId),
    () => client.getNextReservePage(personGroupId, restId),
  ];

  const byRange = new Map<string, ReservePage>();
  // Sequential on purpose: these requests share one ASP.NET session cookie, and
  // concurrent calls can trip the site's session handling.
  for (const load of loaders) {
    try {
      const page = parseReservePage(await load());
      if (page.days.length === 0) continue;
      const key = `${page.days[0]!.date}|${lastDate(page)}`;
      if (!byRange.has(key)) byRange.set(key, page);
    } catch {
      // One missing week must not hide the others.
    }
  }

  return [...byRange.values()].sort((a, b) => a.days[0]!.date.localeCompare(b.days[0]!.date));
}

const lastDate = (page: ReservePage) => page.days[page.days.length - 1]!.date;

/** Pick the page that contains today, falling back to the latest available one. */
function currentIndex(pages: ReservePage[], today: string): number {
  const index = pages.findIndex(
    (page) => page.days[0]!.date <= today && today <= lastDate(page),
  );
  return index === -1 ? pages.length - 1 : index;
}

function serializePage(page: ReservePage) {
  return {
    restaurant: page.restaurant,
    credit: page.credit,
    days: page.days.map((day) => ({
      dayName: day.dayName,
      date: day.date,
      meals: day.meals.map((meal) => ({
        type: meal.type,
        options: meal.options.map((option) => ({
          baseId: option.dataId.split("---")[0],
          name: option.name,
          price: option.price,
          reserved: option.reserved,
          selectable: option.selectable,
        })),
      })),
    })),
  };
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const path = url.pathname;

    const { store, user } = await authenticate(request, env);

    if (request.method === "GET" && path === "/api/me") {
      const session = await store.getSession().catch(() => null);
      return json({
        user: { id: user.id, name: user.first_name, username: user.username },
        loggedIn: Boolean(session),
        personGroupId: (await store.get("person_group_id")) ?? null,
      });
    }

    if (request.method === "POST" && path === "/api/login") {
      const body = (await request.json()) as { username?: string; password?: string };
      const username = body.username?.trim();
      const password = body.password ?? "";
      if (!username || !password) throw new ApiError(400, "نام کاربری و رمز لازم است");

      const client = new FoodClient();
      try {
        await client.login(username, password);
      } catch (error) {
        throw new ApiError(400, error instanceof Error ? error.message : "ورود ناموفق");
      }

      const personGroupId = await client.getPersonGroupId();
      await store.setCredentials({ username, password });
      await store.setSession(client.jar.serialize());
      await store.set("person_group_id", personGroupId);
      return json({ ok: true, personGroupId });
    }

    if (request.method === "POST" && path === "/api/logout") {
      await store.delete("aut_credentials", "aut_session", "person_group_id");
      return json({ ok: true });
    }

    // Everything below needs a valid AUT session.
    const { client, personGroupId } = await withSession(store);

    if (request.method === "GET" && path === "/api/restaurants") {
      const restaurants = await client.getRestaurants(personGroupId);
      await store.setSession(client.jar.serialize());
      return json({ restaurants, personGroupId });
    }

    if (request.method === "GET" && path === "/api/menu") {
      const restId = Number(url.searchParams.get("restId") ?? 0);
      if (!Number.isInteger(restId) || restId <= 0) throw new ApiError(400, "restId لازم است");

      const week = weekOf(url.searchParams.get("week"));
      const pages = await collectWeekPages(client, personGroupId, restId);
      if (pages.length === 0) throw new ApiError(502, "صفحهٔ رزرو از سامانه دریافت نشد");

      const baseIndex = currentIndex(pages, todayJalali());
      const offset = week === "pre" ? -1 : week === "next" ? 1 : 0;
      const index = baseIndex + offset;
      const page = pages[Math.min(Math.max(index, 0), pages.length - 1)]!;

      await store.setSession(client.jar.serialize());
      return json({
        week,
        available: index >= 0 && index < pages.length,
        range: { start: page.days[0]!.date, end: lastDate(page) },
        ...serializePage(page),
      });
    }

    if (request.method === "POST" && path === "/api/reserve") {
      const body = (await request.json()) as {
        restId?: number;
        week?: string;
        date?: string;
        baseId?: string;
        action?: ReserveAction;
      };
      const restId = Number(body.restId);
      const action = body.action === "cancel" ? "cancel" : "reserve";
      if (!Number.isInteger(restId) || !body.baseId || !body.date) {
        throw new ApiError(400, "درخواست ناقص است");
      }

      // Re-read the pages: the uuid inside DataId changes on every render, so the
      // payload must be built from fresh HTML, never from the client's copy.
      const pages = await collectWeekPages(client, personGroupId, restId);
      const page = pages.find((candidate) =>
        candidate.days.some((day) => day.date === body.date),
      );
      const day = page?.days.find((candidate) => candidate.date === body.date);
      const option = day?.meals
        .flatMap((meal) => meal.options)
        .find((candidate) => candidate.dataId.split("---")[0] === body.baseId);

      if (!option) throw new ApiError(409, "این وعده دیگر در دسترس نیست");
      if (!option.selectable) throw new ApiError(409, "این وعده قابل تغییر نیست");

      const dataId = buildDataId(option, action);
      await client.submitReserve(personGroupId, restId, [dataId]);

      const afterPages = await collectWeekPages(client, personGroupId, restId);
      const afterPage = afterPages.find((candidate) =>
        candidate.days.some((candidateDay) => candidateDay.date === body.date),
      );
      const afterDay = afterPage?.days.find((candidate) => candidate.date === body.date);
      const afterOption = afterDay?.meals
        .flatMap((meal) => meal.options)
        .find((candidate) => candidate.dataId.split("---")[0] === body.baseId);

      await store.setSession(client.jar.serialize());
      const expected = action === "reserve";
      return json({
        ok: true,
        verified: afterOption ? afterOption.reserved === expected : false,
        credit: afterPage?.credit ?? page?.credit ?? null,
      });
    }

    throw new ApiError(404, "not found");
  } catch (error) {
    if (error instanceof ApiError) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    console.error("api failed", error);
    return json({ error: "internal error" }, 500);
  }
}
