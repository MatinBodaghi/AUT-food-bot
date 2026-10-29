# AUT food system — reverse-engineered API notes

This document records what the project has learned about the internal HTTP API of
`food.aut.ac.ir` and its CAS login at `accounts.aut.ac.ir`. The API is private,
undocumented, and may change without notice. These notes are based on captures
made on **2026-10-23** and should be re-verified before relying on them.

> **Never commit real captures.** Files under `data/captured/` can contain your
> username, password, session cookies, and CAS service tickets.

## Base URLs

| Service | URL |
| --- | --- |
| Food system | `https://food.aut.ac.ir` |
| CAS | `https://accounts.aut.ac.ir` |
| CAS login | `https://accounts.aut.ac.ir/cas/login` |

## Authentication flow

1. **Start the CAS login**

   ```http
   GET https://accounts.aut.ac.ir/cas/login?service=https%3A%2F%2Ffood.aut.ac.ir%2FAccount%2FCasLogin
   ```

   The response is an HTML form containing a hidden `execution` field:

   ```html
   <input type="hidden" name="execution" value="..."/>
   ```

2. **Submit credentials**

   ```http
   POST https://accounts.aut.ac.ir/cas/login
   Content-Type: application/x-www-form-urlencoded

   username=<student-id>&password=<password>&execution=<token>&_eventId=submit&geolocation=
   ```

   On success, CAS responds with `302` and a `Location` containing a service
   ticket:

   ```text
   https://food.aut.ac.ir/Account/CasLogin?ticket=ST-...
   ```

   On failure, the response is an HTML page containing a Persian error message.

3. **Exchange the ticket**

   ```http
   GET https://food.aut.ac.ir/Account/CasLogin?ticket=ST-...
   ```

   The food system validates the ticket, sets the `.AspNet.ApplicationCookie`,
   and redirects (usually to `/Home/index`, then `/UserHome`).

4. **Open the user area**

   ```http
   GET https://food.aut.ac.ir/UserHome/Index2?bypass=True
   ```

   The session is now usable for the `Reserves/*` endpoints.

Notes:

- The CAS page did **not** require a CAPTCHA in the captured session. This may
  change; the login code must fail gracefully if a CAPTCHA appears.
- The `execution` token is single-use and tied to the CAS session cookie.
- The service ticket is short-lived and single-use.
- Cookies are host-scoped: `accounts.aut.ac.ir` and `food.aut.ac.ir` have
  separate cookie stores.

## Common request headers

Most `Reserves/*` calls are XHR requests:

```http
X-Requested-With: XMLHttpRequest
Accept: */*
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
Referer: https://food.aut.ac.ir/Reserves
User-Agent: <a normal browser user agent>
Cookie: <session cookies>
```

## Endpoints observed

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `POST` | `/Reserves/GetRestaurantByPersonGroup` | `personGroupId=<id>` | JSON array of restaurants |
| `POST` | `/Reserves/GetReservePage` | `personGroupId=<id>&restId=<id>&isKiosk=false` | HTML fragment for the current week |
| `POST` | `/Reserves/GetNextReservePage` | same | HTML fragment for next week |
| `POST` | `/Reserves/GetPreReservePage` | same | HTML fragment for the previous week |
| `POST` | `/Reserves/Index` | `DataId[]=...&type=Index&personGroupId=<id>&restId=<id>&firstEWalletId=<id>` | HTML fragment (reserve/cancel result) |
| `POST` | `/ReserveTransfer/GetRestaurantByPersonId` | empty | JSON array of restaurants the user can transfer credit to |
| `GET` | `/UserHome/Index2` | — | HTML dashboard |
| `GET` | `/UserHome/ShowTransactions` | — | HTML transaction page |
| `POST` | `/UserHome/SearchTransactions` | `pageSize=10&pageNo=1&orderingCode=3&descending=true&fromDate=&toDate=&eWalletId=-1&transactionTypeCode=0` | HTML transaction table |
| `GET` | `/Eshop/IncreaseCredit` | — | HTML credit increase page |
| `GET` | `/Eshop/TransferCredit` | — | HTML credit transfer page |
| `GET` | `/ReserveTransfer` | — | HTML transfer page |

### Restaurant list

```http
POST /Reserves/GetRestaurantByPersonGroup
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest

personGroupId=27
```

Response:

```json
[
  { "id": 1, "value": "سلف مرکزی ...", "value2": null, "HasError": false },
  { "id": 18, "value": "سلف ...", "value2": null, "HasError": false }
]
```

- `personGroupId` is user-specific. Captures used `27` and `46`.
- `restId` values seen in the captures: `1`, `18`, `19`, `5`, `15`, `22` for
  group `27`, and `21`, `14`, `2` for group `46`.
- Do not hard-code these IDs. Fetch them per user and cache the result.

`/ReserveTransfer/GetRestaurantByPersonId` returns a different, broader list
used by the credit-transfer page. It is **not** the same as the reservation
restaurant list.

## Reserve page HTML

The reserve page is a server-rendered HTML fragment. It contains a weekly grid,
a summary table, the current credit, and one block per available meal.

### Credit

```html
<span id="reserveCredit" ...>1,000,000-</span> ریال
```

The value may be negative. Treat it as a display string and parse the numeric
part carefully.

### Week headers

```html
<div class="backWeek1" ...>
  شنبه
  <br />
  1405/08/09
</div>
```

Dates are Jalali (`YYYY/MM/DD`). The client should convert them to Gregorian
dates for scheduling and comparisons.

### Meal blocks

Each meal option is a `.foodMainCnt` block containing:

```html
<input
  type="checkbox"
  class="reserveFoodCheckBox"
  id="rr...rest1---<uuid>"
  data-prechecked="True"
  data-diet-food="dietfood---<uuid>"
  data-food-options=""
  checked="checked"
  disabled="disabled"
/>
<label class="reserveFoodCheckBox" for="rr...rest1">
  چلوخورش قیمه سیب زمینی +ماست
  <span class="reserveFoodType">350,000</span>
</label>
```

Useful attributes:

| Attribute | Meaning |
| --- | --- |
| `id` | Encoded reservation identifier; contains date, meal, food, and restaurant IDs |
| `data-prechecked` | `"True"` if the meal was already reserved before this page load |
| `data-diet-food` | Diet/food identifier (`dietfood---<uuid>`) |
| `data-food-options` | Optional food options |
| `checked` / `disabled` | The option is selected and locked |
| label text | Food name |
| `.reserveFoodType` | Price in rials |
| `onmouseover` tooltip | HTML details: ingredients, prices, reservation status |

The `id` is an internal encoding and is **brittle**. Prefer parsing visible
labels and data attributes where possible, and keep the raw `id` for submission.

### Summary table

The page contains `.summeryTable.reserveFoodMeal` with one row per meal and one
column per day. Cells use `background-red`, `background-orange`,
`background-green`, and `background-blue` to indicate reservation states. The
exact meaning of each color has not been confirmed yet.

### Rules shown in the info modal

The captured page displayed rules such as:

- Reservation deadline: `23:59:00`
- Reservation window: `2` days
- Minimum balance: `-1000000.00` rials
- Cancellation is allowed until a certain time
- Missing a reserved meal may incur a "forgetfulness token" penalty

These values are account- or restaurant-specific. Read them from the page
instead of hard-coding them.

## Reserve and cancel request

The actual mutation is a `POST` to `/Reserves/Index`, not a dedicated
`SaveReserve` endpoint. The captured request was:

```http
POST /Reserves/Index
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest

DataId[]=rr1516575fp1dd2026_10_28ppp00-00dt2026_10_28ppp00-00me5dm5fo199ftf2026_09_23ppp10-00ftt2026_09_23ppp14-59gff2026_10_28ppp10-00gft2026_10_28ppp14-59rest1ffco1pco1options||diet:0&type=Index&personGroupId=27&restId=1&firstEWalletId=1
```

The `DataId` value is derived from the checkbox `id` plus additional state:

- Checkbox `id`: `rr...rest1---<uuid>`
- Submitted `DataId`: `rr...rest1ffco1pco1options||diet:0`

The suffix encodes whether the item is checked and whether it has options. The
exact construction rules are **not fully understood** and must be verified with
more captures before implementing automatic reservation. In particular:

- What do `ffco`, `pco`, `options`, and `diet:0` mean?
- How does the payload change for cancellation?
- Is `firstEWalletId` always `1`, or does it depend on the user?
- Does the server validate the `DataId` against the session, or is it opaque?

### How to capture the missing details

1. Run `npm run inspect`.
2. Log in manually in the opened Chrome window.
3. Open **Reserves**, choose a restaurant, and select a meal.
4. Click the save/reserve button.
5. Also perform a cancellation.
6. Close the browser.
7. Inspect `data/captured/summary.json` and the `resp_*.json` files.
8. Redact or delete the captures before sharing.

## Error handling

- A `302` redirect to `/Account/Login` or the CAS page usually means the session
  expired. Re-authenticate once.
- A `200` response containing a login page instead of the expected fragment also
  means the session is invalid.
- Repeated failed logins may lock the account. Do not retry credentials blindly;
  stop after a small number of attempts and notify the user.
- The service may rate-limit requests. Add delays and backoff.

## Encoding

The captured HTML is UTF-8. Persian text is stored correctly in the files; some
Windows terminals display it as mojibake (`O3U,U?`) because of the console code
page. When reading the files programmatically, use UTF-8.

## Legal and ethical notes

- This is an unofficial integration. Use it only with your own account.
- Do not scrape other users' data.
- Do not automate high-frequency requests.
- Respect the university's terms and any applicable rules.
