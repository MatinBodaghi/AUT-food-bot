// Client for food.aut.ac.ir with CAS Single Sign-On (accounts.aut.ac.ir)

import { parse } from "node-html-parser";

import type { Restaurant } from "./types";

export type { Restaurant };

const BASE = "https://food.aut.ac.ir";
const TIMEOUT_MS = 25_000;

export class CookieJar {
  private cookies = new Map<string, Map<string, string>>();

  private getDomain(url: string): string {
    return new URL(url).hostname;
  }

  setCookies(url: string, setCookieHeaders: string[]) {
    const domain = this.getDomain(url);
    if (!this.cookies.has(domain)) {
      this.cookies.set(domain, new Map());
    }
    const store = this.cookies.get(domain)!;

    for (const raw of setCookieHeaders) {
      const parts = raw.split(";")[0]?.trim();
      if (!parts) continue;
      const eqIdx = parts.indexOf("=");
      if (eqIdx > 0) {
        const name = parts.slice(0, eqIdx).trim();
        const value = parts.slice(eqIdx + 1).trim();
        store.set(name, value);
      }
    }
  }

  getCookieHeader(url: string): string {
    const domain = this.getDomain(url);
    const store = this.cookies.get(domain);
    if (!store || store.size === 0) return "";
    return Array.from(store.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  serialize(): string {
    const obj: Record<string, Record<string, string>> = {};
    for (const [dom, store] of this.cookies.entries()) {
      obj[dom] = Object.fromEntries(store.entries());
    }
    return JSON.stringify(obj);
  }

  deserialize(jsonStr: string) {
    try {
      const obj = JSON.parse(jsonStr) as Record<string, Record<string, string>>;
      this.cookies.clear();
      for (const [dom, store] of Object.entries(obj)) {
        this.cookies.set(dom, new Map(Object.entries(store)));
      }
    } catch {
      // ignore
    }
  }
}

export class FoodClient {
  readonly jar: CookieJar;
  private readonly userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

  constructor(cookieJar?: CookieJar) {
    this.jar = cookieJar ?? new CookieJar();
  }

  private async fetchWithCookies(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (!headers.has("User-Agent")) {
      headers.set("User-Agent", this.userAgent);
    }

    const cookieHeader = this.jar.getCookieHeader(url);
    if (cookieHeader && !headers.has("Cookie")) {
      headers.set("Cookie", cookieHeader);
    }

    const resp = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });

    // Extract Set-Cookie headers
    let setCookies: string[] = [];
    if (typeof (resp.headers as any).getSetCookie === "function") {
      setCookies = (resp.headers as any).getSetCookie();
    } else {
      const raw = resp.headers.get("set-cookie");
      if (raw) {
        setCookies = raw.split(/,(?=[^;]+?=)/);
      }
    }

    if (setCookies.length > 0) {
      this.jar.setCookies(url, setCookies);
    }

    return resp;
  }

  /**
   * Log into AUT CAS and food.aut.ac.ir
   */
  async login(username: string, pass: string): Promise<boolean> {
    const casServiceUrl = "https://food.aut.ac.ir/Account/CasLogin";
    const casLoginUrl = `https://accounts.aut.ac.ir/cas/login?service=${encodeURIComponent(casServiceUrl)}`;

    // 1. Get CAS login page and extract execution token
    const step1 = await this.fetchWithCookies(casLoginUrl, { method: "GET" });
    const html1 = await step1.text();

    const executionMatch = /name="execution"\s+value="([^"]+)"/i.exec(html1);
    if (!executionMatch || !executionMatch[1]) {
      throw new Error("Could not extract CAS execution token from login page");
    }
    const execution = executionMatch[1];

    // 2. Submit credentials to CAS
    const postBody = new URLSearchParams({
      username,
      password: pass,
      execution,
      _eventId: "submit",
      geolocation: "",
    });

    const step2 = await this.fetchWithCookies("https://accounts.aut.ac.ir/cas/login", {
      method: "POST",
      body: postBody.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://accounts.aut.ac.ir",
        Referer: casLoginUrl,
      },
      redirect: "manual",
    });

    // Expecting 302 redirect with service ticket (ST-...)
    const location = step2.headers.get("location");
    if (!location || !location.includes("ticket=")) {
      // Check if login failed (e.g., bad credentials or message in page)
      const errText = await step2.text().catch(() => "");
      if (errText.includes("اطلاعات ورود نامعتبر است") || errText.includes("اشتباه")) {
        throw new Error("نام کاربری یا رمز عبور اشتباه است.");
      }
      throw new Error(`CAS login failed (HTTP ${step2.status}, location: ${location || "none"})`);
    }

    // 3. Follow redirect to food.aut.ac.ir/Account/CasLogin?ticket=ST-...
    const step3 = await this.fetchWithCookies(location, {
      method: "GET",
      headers: {
        Referer: "https://accounts.aut.ac.ir/",
      },
      redirect: "manual",
    });

    // Step 3 will set the .AspNet.ApplicationCookie and redirect to /Home/index or /UserHome
    const finalLocation = step3.headers.get("location") || "https://food.aut.ac.ir/UserHome/Index2";
    const targetUrl = new URL(finalLocation, "https://food.aut.ac.ir").toString();

    await this.fetchWithCookies(targetUrl, { method: "GET" });
    return true;
  }

  /**
   * Find the user's `personGroupId`.
   *
   * The `/Reserves` page renders a <select id="PersonGroup"> with every group the
   * user belongs to (seen: 27 "دانشجویان روزانه", 46 "غذای مکمل"). The server
   * marks the active one with `selected`; when it does not, the browser picks the
   * first option, so we do the same.
   */
  async getPersonGroupId(): Promise<number> {
    const html = await this.getPage("/Reserves");
    const select = parse(html).querySelector("#PersonGroup");
    const options = select?.querySelectorAll("option") ?? [];
    const chosen = options.find((option) => option.hasAttribute("selected")) ?? options[0];
    const value = chosen?.getAttribute("value");

    if (!value) {
      throw new Error("Could not determine personGroupId from the PersonGroup select");
    }
    return Number(value);
  }

  /** Fetch an authenticated HTML page (used for pages without a JSON endpoint). */
  async getPage(path: string): Promise<string> {
    const resp = await this.fetchWithCookies(`${BASE}${path}`, {
      method: "GET",
      headers: { Referer: `${BASE}/UserHome/Index2` },
    });
    if (!resp.ok) {
      throw new Error(`Failed to open ${path} (HTTP ${resp.status})`);
    }
    return resp.text();
  }

  /**
   * Get the restaurants the user is allowed to reserve at.
   * This is `/Reserves/GetRestaurantByPersonGroup`, not the credit-transfer list.
   */
  async getRestaurants(personGroupId: number): Promise<Restaurant[]> {
    const body = new URLSearchParams({ personGroupId: String(personGroupId) });

    const resp = await this.fetchWithCookies(`${BASE}/Reserves/GetRestaurantByPersonGroup`, {
      method: "POST",
      body: body.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json, text/javascript, */*; q=0.01",
        Referer: `${BASE}/Reserves`,
      },
    });

    if (!resp.ok) {
      throw new Error(`Failed to get restaurants (HTTP ${resp.status})`);
    }

    const data = (await resp.json()) as { id: number; value: string }[];
    return data.map((item) => ({ id: item.id, name: item.value }));
  }

  /** POST to one of the Reserves/* page endpoints with the shared XHR headers. */
  private postReservePage(
    path: string,
    personGroupId: number,
    restId: number,
  ): Promise<Response> {
    const body = new URLSearchParams({
      personGroupId: String(personGroupId),
      restId: String(restId),
      isKiosk: "false",
    });

    return this.fetchWithCookies(`${BASE}${path}`, {
      method: "POST",
      body: body.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${BASE}/Reserves`,
      },
    });
  }

  /**
   * Get raw HTML of the weekly reservation page for a restaurant.
   *
   * `GetReservePage` is the endpoint used by the initial page load, but it started
   * answering 500 in late 2026; the tab switcher on /Reserves uses
   * `GetCurrentReservePage`, so fall back to that one.
   */
  async getReservePage(personGroupId: number, restId: number): Promise<string> {
    let resp = await this.postReservePage("/Reserves/GetReservePage", personGroupId, restId);
    if (!resp.ok) {
      resp = await this.postReservePage("/Reserves/GetCurrentReservePage", personGroupId, restId);
    }

    if (!resp.ok) {
      throw new Error(`Failed to get reserve page (HTTP ${resp.status})`);
    }

    return resp.text();
  }

  /**
   * Get next week's reserve page HTML
   */
  async getNextReservePage(personGroupId: number, restId: number): Promise<string> {
    const resp = await this.postReservePage(
      "/Reserves/GetNextReservePage",
      personGroupId,
      restId,
    );

    if (!resp.ok) {
      throw new Error(`Failed to get next reserve page (HTTP ${resp.status})`);
    }

    return resp.text();
  }

  /**
   * Get previous week's reserve page HTML
   */
  async getPreReservePage(personGroupId: number, restId: number): Promise<string> {
    const resp = await this.postReservePage(
      "/Reserves/GetPreReservePage",
      personGroupId,
      restId,
    );

    if (!resp.ok) {
      throw new Error(`Failed to get previous reserve page (HTTP ${resp.status})`);
    }

    return resp.text();
  }

  /**
   * Submit one or more `DataId` changes to /Reserves/Index.
   * Callers must re-read the reserve page afterwards to verify the outcome.
   */
  async submitReserve(
    personGroupId: number,
    restId: number,
    dataIds: string[],
    firstEWalletId = 1,
  ): Promise<string> {
    const body = new URLSearchParams({
      type: "Index",
      personGroupId: String(personGroupId),
      restId: String(restId),
      firstEWalletId: String(firstEWalletId),
    });
    for (const dataId of dataIds) body.append("DataId[]", dataId);

    const resp = await this.fetchWithCookies(`${BASE}/Reserves/Index`, {
      method: "POST",
      body: body.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${BASE}/Reserves`,
      },
    });

    if (!resp.ok) {
      throw new Error(`Reserve request failed (HTTP ${resp.status})`);
    }
    return resp.text();
  }
}
