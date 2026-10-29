# Architecture

This document describes the intended architecture of `AUT-food-bot` and the
reasoning behind the main design decisions.

## Goals

- Let an AUT student view the weekly menu and current reservations in Telegram.
- Remind the user before the reservation deadline.
- Reserve meals automatically based on weekly preferences.
- Show the account balance and warn when it is low.
- Run cheaply and reliably on Cloudflare Workers.
- Keep credentials and session data encrypted at rest.

## Non-goals

- Supporting other universities. The project is intentionally AUT-specific.
- Replacing the official food system or scraping it at high frequency.
- Storing plaintext passwords.
- Bypassing university access controls or rate limits.

## Components

```text
┌────────────────────┐
│  Telegram client   │
└─────────┬──────────┘
          │ HTTPS webhook
          ▼
┌─────────────────────────────────────────────┐
│ Cloudflare Worker                            │
│                                             │
│  ┌──────────────┐      ┌─────────────────┐  │
│  │  Bot router  │─────▶│  AUT food client │  │
│  │  (src/bot)   │      │  (src/food)      │  │
│  └──────┬───────┘      └────────┬────────┘  │
│         │                       │           │
│         ▼                       ▼           │
│  ┌──────────────┐      ┌─────────────────┐  │
│  │ Storage      │      │ CAS + cookies    │  │
│  │ (D1 / KV)    │      │ (per user)       │  │
│  └──────────────┘      └─────────────────┘  │
│         ▲                                   │
│         │                                   │
│  ┌──────┴───────┐                           │
│  │ Cron Trigger │                           │
│  └──────────────┘                           │
└─────────────────────────────────────────────┘
```

### `src/food/`

The AUT-specific integration layer:

- `CookieJar` keeps host-scoped cookies in memory and can serialize them for
  encrypted storage.
- `FoodClient` performs the CAS login flow and calls the internal endpoints.
- `types.ts` defines the domain model (`Meal`, `DayMenu`, `UserBalance`).

This layer should not know anything about Telegram.

### `src/telegram/`

- `api.ts` is a small typed wrapper around the Telegram Bot API.
- `format.ts` contains Persian UI helpers: digits, HTML escaping, Jalali dates,
  message truncation, and keyboard builders.

This layer should not know anything about AUT.

### `src/bot/` (planned)

The router maps Telegram updates to handlers:

- `/start`, `/help`
- `/menu` — this week's menu
- `/reservations` — current reservations
- `/balance` — account balance
- `/settings` — weekly preferences and reminder times
- Inline callbacks for selecting meals and confirming a reservation

Handlers depend on the AUT client and storage through small interfaces so they
can be tested with fakes.

### `src/crypto.ts`

- AES-GCM encryption for secrets at rest (AUT password or session cookie,
  depending on the final storage design).
- SHA-256 for stable identifiers and integrity checks.
- Timing-safe comparison for webhook secrets and tokens.

`TOKEN_KEY` must be a base64-encoded 32-byte key. It lives in Cloudflare secrets
and is never committed.

## Key flows

### Login

1. The bot needs an AUT session for a user.
2. If an encrypted session cookie exists and is still valid, reuse it.
3. Otherwise, decrypt the stored credentials, perform the CAS flow, and store the
   new cookie encrypted.
4. If CAS rejects the credentials, mark the user as needing to re-authenticate
   and notify them in Telegram.

### Read the menu

1. Fetch the restaurant list for the user's `personGroupId`.
2. Fetch the current and next reserve pages.
3. Parse the HTML into `DayMenu[]`.
4. Cache the parsed result for a short time to avoid unnecessary requests.

### Reserve

1. Build a plan from the user's weekly preferences.
2. Check the deadline and the available credit.
3. Submit the reservation request (endpoint to be captured; see
   [`aut-food-api.md`](aut-food-api.md)).
4. Verify the result by re-reading the reserve page.
5. Record the outcome and notify the user.

### Reminders

A Cron Trigger runs periodically (for example, every 30 minutes). For each user
with reminders enabled:

1. Determine the next deadline.
2. If the deadline is within the configured window, send a Telegram message.
3. Record that the reminder was sent to avoid duplicates.

## Storage (planned)

A relational store (Cloudflare D1) fits the data better than KV:

| Table | Purpose |
| --- | --- |
| `users` | Telegram user ID, AUT username, encrypted secret, `personGroupId`, settings |
| `sessions` | Encrypted AUT cookie, expiry, last validated time |
| `preferences` | Weekly meal preferences per user and weekday |
| `reservations` | Planned and confirmed reservations, status, timestamps |
| `reminders` | Sent reminders and deduplication keys |

KV can be used for short-lived caches such as parsed menus.

## Security boundaries

- Telegram user ID is the primary identity. An allowlist limits who can use the
  bot.
- Webhook requests are authenticated with `X-Telegram-Bot-Api-Secret-Token`.
- AUT credentials and session cookies are encrypted with AES-GCM before storage.
- Logs must never contain passwords, cookies, service tickets, or full request
  bodies.
- The bot must not expose one user's data to another; every storage query is
  scoped by Telegram user ID.

## Failure modes

| Failure | Expected behavior |
| --- | --- |
| CAS session expired | Re-login once, then ask the user to re-authenticate if it still fails |
| Invalid AUT credentials | Stop retrying, notify the user, do not lock the account with repeated attempts |
| AUT HTML changed | Fail closed, log a redacted parser error, notify the maintainer |
| Rate limited | Back off with jitter; never hammer the service |
| Deadline passed | Do not attempt a reservation; explain why |
| Insufficient credit | Do not reserve; warn the user |
| Telegram API error | Retry only idempotent calls; surface persistent errors |

## Testing strategy

- Unit tests for pure functions: formatting, parsing, planning, and validation.
- Fixture-based tests for the HTML parser using redacted captures.
- Fake AUT client and fake storage for bot handler tests.
- No real network calls in CI.
- A manual smoke test (`npm run smoke:login`) for the real CAS flow.

## Deployment

The target runtime is Cloudflare Workers:

- A Worker handles the Telegram webhook.
- A Cron Trigger runs reminders.
- Secrets are stored with `wrangler secret put`.
- D1/KV bindings are configured in `wrangler.toml` (to be added).

The exact deployment configuration will be documented once the Worker entry
point is implemented.

## Open questions

- Should the bot store the AUT password or only the session cookie? Storing only
  the cookie is safer but requires the user to re-authenticate more often.
- How long can a CAS session be reused before it expires?
- Which endpoint performs the final reservation and cancellation?
- Does the reserve page expose enough information to verify a reservation
  reliably?
- What are the exact deadline rules for each meal and restaurant?
