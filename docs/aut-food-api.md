# AUT Food System — Reverse-Engineered API Reference

> **Unofficial.** This document describes the private HTTP interface behind the
> Amirkabir University of Technology food system ([`food.aut.ac.ir`](https://food.aut.ac.ir)).
> It is not published by the university, can change without notice, and is
> documented here only so that students can build their own tools.
>
> **Verified against network captures:** 2026-10-23 · **Last updated:** 2026-10-30
> **Status:** read endpoints fully mapped; write endpoints partially mapped
> (see [`DataId`](#the-dataid-payload), the main open question).

This is the canonical API reference for the project. If you only need the
architecture and bot flow, read [`architecture.md`](architecture.md) instead.

> ⚠️ **Never commit real captures.** Files under `data/captured/` can contain your
> username, password, session cookie, and CAS service ticket. Rotate your password
> if a capture with credentials was ever shared.

---

## Contents

- [At a glance](#at-a-glance)
- [Legal and ethical notes](#legal-and-ethical-notes)
- [Base URLs](#base-urls)
- [Authentication (CAS)](#authentication-cas)
- [Common request headers](#common-request-headers)
- [Endpoints](#endpoints)
  - [Read endpoints](#read-endpoints)
  - [Write endpoints](#write-endpoints)
  - [Credit and transfer pages](#credit-and-transfer-pages)
- [Discovering `personGroupId`](#discovering-persongroupid)
- [Reserve page anatomy](#reserve-page-anatomy)
- [The `DataId` payload](#the-dataid-payload)
- [Recommended integration flow](#recommended-integration-flow)
- [Error handling](#error-handling)
- [Rate limits and politeness](#rate-limits-and-politeness)
- [Encoding](#encoding)
- [Capturing new endpoints](#capturing-new-endpoints)
- [Contributing](#contributing)
- [Document changelog](#document-changelog)

---

## At a glance

The site is a **server-rendered ASP.NET MVC application**. There is no public
REST API: the browser receives HTML pages and fragments, and small AJAX calls
return HTML or JSON. Authentication is **CAS single sign-on**; the session lives
in the `.AspNet.ApplicationCookie`.

| What you want | How to get it | Status |
| --- | --- | --- |
| Log in | CAS flow → `.AspNet.ApplicationCookie` | ✅ verified |
| Your restaurant list | `POST /Reserves/GetRestaurantByPersonGroup` | ✅ verified |
| Weekly menu + credit | `POST /Reserves/GetReservePage` (HTML) | ✅ verified |
| Next/previous week | `POST /Reserves/GetNextReservePage`, `GetPreReservePage` | ✅ verified |
| Reserve or cancel a meal | `POST /Reserves/Index` with `DataId[]` | ⚠️ shape known, encoding partial |
| Transaction history | `POST /UserHome/SearchTransactions` (HTML) | ✅ verified (table) |
| Increase credit | `GET /Eshop/IncreaseCredit` | ✅ page, payment is external |
| Transfer credit | `GET /Eshop/TransferCredit` | ✅ page |
| Transfer a reservation | `GET /ReserveTransfer` | ⚠️ page only, mutation unknown |

---

## Legal and ethical notes

- This is an unofficial integration. Use it **only with your own account**.
- Do not scrape other students' data.
- Do not automate high-frequency requests; the university may rate-limit or lock accounts.
- Respect the university's terms and the rules of the food system.
- Repeated failed logins can lock the account. Stop after a few attempts.

---

## Base URLs

| Service | URL |
| --- | --- |
| Food system | `https://food.aut.ac.ir` |
| CAS | `https://accounts.aut.ac.ir` |
| CAS login | `https://accounts.aut.ac.ir/cas/login` |
| CAS callback used by the food system | `https://food.aut.ac.ir/Account/CasLogin` |

---

## Authentication (CAS)

```text
GET  accounts.aut.ac.ir/cas/login?service=...        → execution token + CAS cookie
POST accounts.aut.ac.ir/cas/login                    → 302 Location: /Account/CasLogin?ticket=ST-...
GET  food.aut.ac.ir/Account/CasLogin?ticket=ST-...   → Set-Cookie: .AspNet.ApplicationCookie
GET  food.aut.ac.ir/UserHome/Index2?bypass=True      → authenticated HTML
```

### 1. Start the login and read the `execution` token

```http
GET https://accounts.aut.ac.ir/cas/login?service=https%3A%2F%2Ffood.aut.ac.ir%2FAccount%2FCasLogin
```

The HTML form contains a hidden field:

```html
<input type="hidden" name="execution" value="..."/>
```

The token is **single-use** and tied to the CAS session cookie that this response
sets (`accounts.aut.ac.ir`). Keep cookies per host: CAS and the food system have
separate cookie stores.

### 2. Submit the credentials

```http
POST https://accounts.aut.ac.ir/cas/login
Content-Type: application/x-www-form-urlencoded

username=<student-id>&password=<password>&execution=<token>&_eventId=submit&geolocation=
```

On success CAS responds `302` with:

```text
Location: https://food.aut.ac.ir/Account/CasLogin?ticket=ST-...
```

On failure it returns `200` with a Persian error page (for example
«اطلاعات ورود نامعتبر است»).

### 3. Exchange the service ticket

```http
GET https://food.aut.ac.ir/Account/CasLogin?ticket=ST-...
```

The food system validates the ticket (single-use, short-lived) and sets
`.AspNet.ApplicationCookie`, then redirects to `/Home/index` and `/UserHome`.

### 4. Open the user area

```http
GET https://food.aut.ac.ir/UserHome/Index2?bypass=True
```

The session is now usable for the `Reserves/*` endpoints.

### Pitfalls

- The CAS page did **not** show a CAPTCHA in the captured sessions. If one
  appears, fail gracefully instead of retrying.
- Do not retry wrong credentials: a few failures may lock the account. Surface the
  error to the user and stop.
- A `302` to `/Account/Login` (or a `200` HTML page that is the login form) means
  the session expired; re-authenticate once.
- The service ticket must be sent exactly as returned; do not URL-decode or
  re-encode it.

### Minimal login example (JavaScript)

```js
const CAS = "https://accounts.aut.ac.ir";
const FOOD = "https://food.aut.ac.ir";
const service = `${FOOD}/Account/CasLogin`;
const cookies = new Map();

const cookieHeader = () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
const remember = (response) => {
  for (const raw of response.headers.getSetCookie()) {
    const [pair] = raw.split(";");
    const index = pair.indexOf("=");
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
};

const page = await fetch(`${CAS}/cas/login?service=${encodeURIComponent(service)}`);
remember(page);
const execution = /name="execution"\s+value="([^"]+)"/.exec(await page.text())[1];

const login = await fetch(`${CAS}/cas/login`, {
  method: "POST",
  redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookieHeader() },
  body: new URLSearchParams({ username, password, execution, _eventId: "submit", geolocation: "" }),
});
remember(login);

const ticketUrl = login.headers.get("location");
const callback = await fetch(ticketUrl, { redirect: "manual", headers: { cookie: cookieHeader() } });
remember(callback);

// .AspNet.ApplicationCookie is now in the jar.
```

---

## Common request headers

Most `Reserves/*` calls are XHR requests and expect:

```http
X-Requested-With: XMLHttpRequest
Accept: */*
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
Referer: https://food.aut.ac.ir/Reserves
User-Agent: <a normal browser user agent>
Cookie: <session cookies>
```

---

## Endpoints

### Read endpoints

#### `POST /Reserves/GetRestaurantByPersonGroup`

The restaurants the user may reserve at. **Use this one for the menu.**

```http
POST /Reserves/GetRestaurantByPersonGroup
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest

personGroupId=27
```

```json
[
  { "id": 1,  "value": "سلف برادران دانشگاه (وعده ناهار: سلف ترنج  وعده شام: سلف مشاهیر)", "value2": null, "HasError": false },
  { "id": 18, "value": "سلف بیرون بر برادران (ضلع غربی دانشکده نساجی)", "value2": null, "HasError": false }
]
```

- `personGroupId` is **user-specific**. Captures used `27` and `46`.
- `restId` values observed for group 27: `1`, `18`, `19`, `5`, `15`, `22`;
  for group 46: `21`, `14`, `2`.
- Never hard-code these IDs. Fetch them per user and cache.

#### `POST /Reserves/GetReservePage`

Returns the HTML fragment for the current week (see
[Reserve page anatomy](#reserve-page-anatomy)).

```http
POST /Reserves/GetReservePage
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
Referer: https://food.aut.ac.ir/Reserves

personGroupId=27&restId=1&isKiosk=false
```

- `isKiosk=false` in all observed requests.
- The fragment contains a `.PhoneView` **and** a `.DesktopView`; parse only one of
  them or every meal appears twice.
- `GetNextReservePage` and `GetPreReservePage` take the same body and return the
  next and previous week.

#### `GET /UserHome/Index2`

The authenticated dashboard (HTML). Useful as a cheap "is the session alive?"
check.

#### `GET /UserHome/ShowTransactions`

The transaction page shell (HTML).

#### `POST /UserHome/SearchTransactions`

Returns an HTML table of transactions.

```http
POST /UserHome/SearchTransactions
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest

pageSize=10&pageNo=1&orderingCode=3&descending=true&fromDate=&toDate=&eWalletId=-1&transactionTypeCode=0
```

> The table's cell layout has not been normalized into a typed model yet; parse it
> defensively.

### Write endpoints

#### `POST /Reserves/Index` — reserve or cancel

There is **no** `SaveReserve` endpoint. Both actions are a form post to
`/Reserves/Index` with a `DataId[]` value derived from the checkbox `id`:

```http
POST /Reserves/Index
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest

DataId[]=rr...rest1ffco1pco1options||diet:0&type=Index&personGroupId=27&restId=1&firstEWalletId=1
```

The response is an HTML fragment with the updated page/notification. Always
re-read `GetReservePage` afterwards to verify the new state.

> ⚠️ The `DataId` construction is only **partially** understood — see
> [The `DataId` payload](#the-dataid-payload).

### Credit and transfer pages

| Method | Path | Purpose | Notes |
| --- | --- | --- | --- |
| `GET` | `/Eshop/IncreaseCredit` | Top-up page | Payment happens on an external gateway; a bot can only link to it |
| `GET` | `/Eshop/TransferCredit` | Transfer credit to another account | Has its own form and confirmation flow |
| `GET` | `/ReserveTransfer` | Transfer a reservation | The mutation endpoint is **not yet captured** |
| `POST` | `/ReserveTransfer/GetRestaurantByPersonId` | Restaurants for the transfer page | ⚠️ **Not** the reservation list — returns a broader set |
| `GET` | `/UserHome/Links` | Dashboard links | Observed only |

> `/ReserveTransfer/GetRestaurantByPersonId` returns the union of several groups'
> restaurants (both `27` and `46` were seen in one response). Do not use it to
> build the reservation menu.

---

## Discovering `personGroupId`

Every `Reserves/*` call needs it, but it is not a constant:

- observed values: `27`, `46`;
- it is not a query parameter the user chooses;
- the source is **not confirmed** yet.

Working hypothesis (implemented in `src/food/client.ts`): the `/Reserves` page
embeds it in an inline script or data attribute, so scraping
`/Reserves` for `personGroupId\s*[:=]\s*"?(\d+)` may find it. If that fails,
check `/UserHome/Index2` and the JS bundles loaded by `/Reserves`.

If you confirm the real source, please update this section — it is the most
useful missing piece for new implementations.

---

## Reserve page anatomy

The response of `GetReservePage` is an HTML fragment with inline `<style>` and
`<script>` blocks. Useful selectors:

### Credit

```html
<span id="reserveCredit" class="name">1,000,000-</span> ریال
```

The value is a display string. A **trailing minus means debt** (`1,000,000-` is
-1,000,000 rials). Strip separators and handle Persian digits.

### Day headers (desktop grid)

```html
<div class="backWeek1" style='color:white;...'>
  شنبه
  <br />
  1405/08/02
</div>
```

Dates are **Jalali** (`YYYY/MM/DD`). The text color encodes availability
(`white` for selectable days, `#810205` for closed ones), but the meaning has not
been fully verified — prefer the checkbox state.

### Mobile view (easiest to parse)

```html
<div class="PhoneView">
  <div class="dayContainer">
    <span class="day">شنبه</span>
    <span class="date">1405/08/02</span>
  </div>
  <div style="display:flex;...">
    <div class="reserveFoodMeal"><span class="TimeMeal">ناهار</span>…</div>
    <div id="MealDiv" class="WeekMeal">
      <div class="foodMainCnt">…one food option…</div>
      <div class="foodMainCnt">…another option…</div>
    </div>
  </div>
</div>
```

Each day is a `.dayContainer` followed by a flex container whose meal columns
have a `.TimeMeal` label and a `.WeekMeal` with `.foodMainCnt` children.

### Food option block

```html
<div class="foodMainCnt">
  <input type="checkbox"
         id="rr...rest1---<uuid>"
         class="reserveFoodCheckBox"
         data-prechecked="True"
         data-diet-food="dietfood---<uuid>"
         data-food-options=""
         checked="checked"
         disabled="disabled" />
  <label class="reserveFoodCheckBox" for="rr...rest1">
    چلوخورش قیمه سیب زمینی +ماست
    <span class="reserveFoodType">350,000</span>
  </label>
</div>
```

| Attribute / element | Meaning |
| --- | --- |
| `id` | Encoded reservation identifier; the basis of the `DataId` payload |
| `data-prechecked` | `"True"` if already reserved before this page load |
| `data-diet-food` | Diet/food identifier (`dietfood---<uuid>`) |
| `data-food-options` | Optional food options (empty in captures) |
| `checked` / `disabled` | The option is selected and locked (e.g. past days) |
| label text | Food name |
| `.reserveFoodType` | Price in rials |
| `onmouseover` tooltip | HTML details: ingredients, unit prices, reservation status, counts |

The `id` is an internal encoding and is **brittle**. Keep it verbatim for
submission; prefer the visible label and data attributes for display.

### Summary table

`.summeryTable.reserveFoodMeal` has one row per meal and one column per day.
Cells carry `background-blue`, `background-orange`, `background-green`, and
`background-red` classes plus a tooltip (`فرستاده نشده`, `خالی`, …). The exact
mapping of each color to a state is **not confirmed**; do not rely on colors.

### Rules shown in the info modal

The captured page displayed (account- or restaurant-specific):

- reservation deadline `23:59:00`;
- reservation window `2` days;
- minimum balance `-1000000.00` rials;
- cancellation allowed until a certain time;
- missing a reserved meal may incur a "forgetfulness token" penalty.

Read these from the page instead of hard-coding them.

---

## The `DataId` payload

This is the only blocking unknown for automatic reservation.

### Observed examples

Reserve (from a real capture):

```text
DataId[]=rr1516575fp1dd2026_10_28ppp00-00dt2026_10_28ppp00-00me5dm5fo199ftf2026_09_23ppp10-00ftt2026_09_23ppp14-59gff2026_10_28ppp10-00gft2026_10_28ppp14-59rest1ffco1pco1options||diet:0
&type=Index&personGroupId=27&restId=1&firstEWalletId=1
```

Cancel (same account, same meal):

```text
DataId[]=rr0fp1dd2026_10_28ppp00-00dt2026_10_28ppp00-00me5dm5fo199ftf2026_09_23ppp10-00ftt2026_09_23ppp14-59gff2026_09_23ppp10-00gft2026_09_23ppp14-59rest1tfco1pco0options||diet:0
&type=Index&personGroupId=27&restId=1&firstEWalletId=1
```

### What is known

- The value is derived from the checkbox `id`, which ends with `rest<id>---<uuid>`.
- The submitted value **drops the `---<uuid>` suffix** and replaces it with a
  state suffix such as `ffco1pco1` or `tfco1pco0`.
- Segments look like `dd<date>`, `dt<date>`, `me<meal-id>`, `ftf<date>`,
  `ftt<date>`, `gff<date>`, `gft<date>`, `rest<id>` — i.e. dates, times, and IDs
  packed with separators (`ppp`, `pco`, …).
- `options||diet:0` closes the value; food options would presumably appear before
  `||`.
- `firstEWalletId=1` is sent as a separate form field, always `1` in captures.

### What is not known

- The meaning of `ffco1pco1` vs `tfco1pco0` (checked/unchecked? reserve/cancel?).
- Why the cancel example starts with `rr0f…` while the reserve one has
  `rr1516575f…`.
- How the payload changes with food options or diet meals.
- Whether the server validates `DataId` against the session or treats it as opaque.
- Whether `firstEWalletId` depends on the user.

### How to finish this (recommended)

1. **Read the site's own JavaScript.** The value is assembled client-side before
   the AJAX call. On `/Reserves`, find the function that serializes
   `.reserveFoodCheckBox` (search the bundles for `pco`, `options||diet`, or
   `DataId`). This is far faster than guessing.
2. **Capture variants.** Reserve and cancel the same meal, with/without options,
   one and several selections, different days, and diff the values.
3. **Replay in a test account** and verify the result by re-reading
   `GetReservePage`; never assume success from the mutation response alone.
4. Update this section (and preferably add a redacted example per case).

---

## Recommended integration flow

```text
login (CAS)
  └─ GET /UserHome/Index2                      # session check
       └─ discover personGroupId               # /Reserves or /UserHome
            └─ POST /Reserves/GetRestaurantByPersonGroup
                 └─ for each restId:
                      POST /Reserves/GetReservePage   (HTML)
                        └─ parse days/meals/options
                             └─ user picks an option
                                  └─ POST /Reserves/Index  (DataId[])
                                       └─ re-read GetReservePage to verify
```

Cache the restaurant list and parsed menus for a short time (for example 5–15
minutes). Never poll in a tight loop.

---

## Error handling

| Observation | Meaning | Reaction |
| --- | --- | --- |
| `302` to `/Account/Login` or CAS | Session expired | Re-authenticate once |
| `200` but HTML is the login page | Session invalid | Re-authenticate once |
| Invalid credentials page (Persian text) | Wrong username/password | Stop; do not retry blindly |
| `5xx` / network error | Service hiccup | Retry reads with backoff; never retry writes blindly |
| `429` | Rate limited | Back off with jitter |

Detecting a login page: the expected fragment contains `reserveCredit` or
`foodMainCnt`; if neither is present, treat the session as expired.

---

## Rate limits and politeness

- One menu refresh costs one request per restaurant (about 6–8 requests).
- Cache aggressively; menus change at most daily.
- Add delays between restaurants and never run parallel bursts on the same account.
- For a personal bot, a 5–15 minute cache is plenty.

---

## Encoding

- Responses are **UTF-8**; Persian text is stored correctly.
- Windows terminals may display it as mojibake (`O3U,U?`) because of the console
  code page — read files programmatically as UTF-8.
- Numbers in the HTML often use Persian digits and `,`/`٬` separators; normalize
  them before parsing.

---

## Capturing new endpoints

The project ships a Playwright-based inspector:

```bash
npm run inspect          # or tools/inspect.cmd on Windows
```

It opens Chrome, records XHR/fetch/document requests into `data/captured/`, and
writes a `summary.json`. Then:

1. Log in manually in the opened browser.
2. Perform the action you want to document (reserve, cancel, transfer, top-up).
3. Close the browser.
4. Read the captures and update this document.
5. **Redact credentials, cookies, and tickets before sharing anything.**

---

## Contributing

- Add a section per endpoint: method, path, body, response example, notes, and
  whether it is verified.
- Mark hypotheses explicitly; do not present guesses as facts.
- Keep real data out of the repository: redact IDs when they identify a person.
- Update the changelog below and the verification date at the top.

---

## Document changelog

| Date | Change |
| --- | --- |
| 2026-10-23 | Initial notes from browser captures: CAS flow, restaurant list, reserve page, `Reserves/Index`, transactions |
| 2026-10-30 | Restructured into a reference; added endpoint status table, phone/desktop view parsing notes, `DataId` analysis, error handling, and contribution guidance |
