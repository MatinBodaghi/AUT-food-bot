# 🍱 AUT-food-bot

[![CI](https://github.com/MatinBodaghi/AUT-food-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/MatinBodaghi/AUT-food-bot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![Status: WIP](https://img.shields.io/badge/status-work%20in%20progress-orange.svg)](#project-status)

An open-source, self-hosted Telegram bot for the food reservation system of **Amirkabir University of Technology (AUT)** — [`food.aut.ac.ir`](https://food.aut.ac.ir) (Samad).

**English** | [فارسی](#فارسی)

> **Status: early development (`v0.1.0`).** The AUT client, Telegram API wrapper, Persian formatting helpers, and crypto utilities are implemented. The menu parser, bot router, scheduler, and automatic reservation are still in progress. See [Project status](#project-status).

## Why?

AUT students must reserve meals before a deadline (currently around 48 hours before the meal). Missing the deadline means losing the meal credit. This bot aims to make that process safer and less stressful:

- See the weekly menu and your current reservations in Telegram.
- Get reminders before the reservation deadline.
- Automatically reserve meals based on your weekly preferences.
- Keep an eye on your balance and get warned when it is low.

## Features

| Feature | Status |
| --- | --- |
| CAS single sign-on (`accounts.aut.ac.ir`) + cookie session | ✅ Implemented |
| Fetch authorized restaurants and weekly reserve pages | ✅ Implemented |
| Telegram Bot API client (send, edit, callback, delete) | ✅ Implemented |
| Persian digits, HTML escaping, Jalali date formatting | ✅ Implemented |
| AES-GCM encryption for secrets at rest | ✅ Implemented |
| Local network inspector (Playwright) | ✅ Implemented |
| HTML menu parser | 🚧 Planned |
| Telegram bot router and conversation handlers | 🚧 Planned |
| Cloudflare Worker entry point + webhook | 🚧 Planned |
| Balance and transaction history | 🚧 Planned |
| Scheduled deadline reminders (Cron Triggers) | 🚧 Planned |
| Automatic reservation / cancellation | 🚧 Planned |

## Project status

This repository is in **early development**. The current code is a working foundation and a research toolkit for the AUT food system, not yet a finished bot. Interfaces and data models may change before `v1.0.0`.

## Architecture

```text
src/
  food/          AUT client: CAS login, cookie jar, restaurant and reserve-page requests
  telegram/      Telegram Bot API wrapper and Persian UI formatting
  bot/           Bot router and handlers (planned)
  crypto.ts      AES-GCM encryption, SHA-256 hashing, timing-safe comparison
tools/           Local network inspector and CAS login smoke test
test/            Unit tests (Vitest)
docs/            Architecture and reverse-engineered API notes
data/captured/   Local-only network captures (gitignored, may contain secrets)
```

Planned request flow:

```text
Telegram update
      │
      ▼
Worker webhook ──► bot router ──► AUT client ──► food.aut.ac.ir
      │                              │
      ▼                              ▼
  D1 / KV storage ◄──────── session cookies, preferences, reservations
      │
      ▼
Cron Trigger ──► deadline reminders and automatic reservations
```

More details: [`docs/architecture.md`](docs/architecture.md) and [`docs/aut-food-api.md`](docs/aut-food-api.md).

## Tech stack

- **TypeScript** (strict mode) on **Cloudflare Workers**
- **Wrangler** for local development and deployment
- **Vitest** for unit tests
- **Playwright** for local network inspection of the AUT system
- No bot framework: a small typed client for the Telegram Bot API

## Getting started

### Prerequisites

- Node.js **20 or newer**
- npm
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- A Cloudflare account (only for deployment)
- Google Chrome (only for the network inspector)
- A valid AUT account for the food system

### Install

```bash
git clone https://github.com/MatinBodaghi/AUT-food-bot.git
cd AUT-food-bot
npm install
cp .dev.vars.example .dev.vars
```

Fill in `.dev.vars` with your own values. **Never commit this file.** It is already ignored by git.

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `AUT_USERNAME` | Yes (for smoke test) | AUT student ID used by `npm run smoke:login` |
| `AUT_PASSWORD` | Yes (for smoke test) | AUT CAS password |
| `TELEGRAM_BOT_TOKEN` | Yes (bot) | Token from [@BotFather](https://t.me/BotFather) |
| `TOKEN_KEY` | Yes (bot) | Base64-encoded 32-byte key for AES-GCM encryption |
| `WEBHOOK_SECRET` | Planned | Secret token used to authenticate Telegram webhook requests |
| `ALLOWED_TELEGRAM_IDS` | Planned | Comma-separated Telegram user IDs allowed to use the bot |

Generate a `TOKEN_KEY`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

For production, store secrets with `wrangler secret put <NAME>` instead of committing them.

### Useful commands

| Command | Description |
| --- | --- |
| `npm run check` | Type-check the project and run unit tests |
| `npm test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm run smoke:login` | Log in to AUT CAS with `.dev.vars` and fetch the first reserve page |
| `npm run inspect` | Open Chrome and capture AUT network requests into `data/captured/` |
| `npm run dev` | Start the Worker locally (available after the Worker entry point lands) |
| `npm run deploy` | Deploy to Cloudflare Workers (after configuration) |
| `npm run logs` | Tail production logs |

### How the AUT login works

The client follows the university's CAS flow:

1. Open `accounts.aut.ac.ir/cas/login` and extract the `execution` token.
2. Submit the student ID and password to CAS.
3. Follow the service ticket redirect to `food.aut.ac.ir/Account/CasLogin?ticket=...`.
4. Keep the resulting `.AspNet.ApplicationCookie` in an in-memory cookie jar.
5. Call the internal `Reserves/*` endpoints to read menus and reservations.

The internal endpoints were discovered with `npm run inspect`; they are documented in [`docs/aut-food-api.md`](docs/aut-food-api.md).

## Roadmap

- [x] CAS login and cookie session
- [x] Restaurant and reserve-page fetching
- [x] Telegram API client and Persian formatting
- [x] Secret encryption helpers
- [x] Network inspector and login smoke test
- [x] Type-checking and unit-test CI
- [ ] HTML menu parser (`DayMenu` / `Meal`)
- [ ] Bot router with commands and inline keyboards
- [ ] Cloudflare Worker entry point and webhook authentication
- [ ] Persistent storage for users, preferences, and sessions
- [ ] Balance and transaction history
- [ ] Cron-based deadline reminders
- [ ] Automatic reservation and cancellation
- [ ] End-to-end tests with recorded fixtures

## Contributing

Contributions are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) before opening an issue or pull request.

- Use [GitHub Issues](https://github.com/MatinBodaghi/AUT-food-bot/issues) for bug reports and feature requests.
- Keep pull requests focused and include tests when possible.
- Never include real credentials, cookies, or captured network traffic in a commit.
- See [`CHANGELOG.md`](CHANGELOG.md) for release history.

## Security

Please do **not** open a public issue for security problems. See [`SECURITY.md`](SECURITY.md) for the private reporting process.

Important: network captures under `data/captured/` may contain your username, password, session cookies, and service tickets. Keep that directory local and rotate your password if it was ever committed or shared.

## Disclaimer

This is an independent, personal student project. It is **not affiliated with, endorsed by, or supported by Amirkabir University of Technology**. Use it at your own risk and follow the university's rules and the terms of the food system. The authors are not responsible for lost credits, blocked accounts, or any other consequences of using this software.

## License

Released under the [MIT License](LICENSE). © 2026 Matin Bodaghi.

---

## فارسی

**AUT-food-bot** یک ربات تلگرام متن‌باز و self-hosted برای سامانه تغذیه دانشگاه صنعتی امیرکبیر ([`food.aut.ac.ir`](https://food.aut.ac.ir)) است.

> **وضعیت: توسعهٔ اولیه (`v0.1.0`).** کلاینت سامانه، پوشش Telegram API، قالب‌بندی فارسی و ابزارهای رمزنگاری پیاده‌سازی شده‌اند. پارسر منو، روتر ربات، زمان‌بندی یادآوری و رزرو خودکار هنوز در حال توسعه هستند.

### چه کاری انجام می‌دهد؟

- نمایش منوی هفتگی و رزروهای فعلی در تلگرام
- یادآوری مهلت رزرو (حدود ۴۸ ساعت قبل از وعده)
- رزرو خودکار وعده‌ها بر اساس ترجیحات هفتگی
- نمایش موجودی حساب و هشدار کمبود شارژ

### وضعیت فعلی

| بخش | وضعیت |
| --- | --- |
| ورود CAS و نگه‌داری کوکی | ✅ پیاده‌سازی شده |
| دریافت لیست سلف‌ها و صفحهٔ رزرو | ✅ پیاده‌سازی شده |
| کلاینت Telegram API | ✅ پیاده‌سازی شده |
| قالب‌بندی فارسی و تاریخ شمسی | ✅ پیاده‌سازی شده |
| رمزنگاری AES-GCM | ✅ پیاده‌سازی شده |
| ابزار کپچر شبکه | ✅ پیاده‌سازی شده |
| پارسر HTML منو | 🚧 در برنامه |
| روتر و هندلرهای ربات | 🚧 در برنامه |
| ورودی Worker و وب‌هوک | 🚧 در برنامه |
| موجودی و گردش حساب | 🚧 در برنامه |
| یادآوری با Cron | 🚧 در برنامه |
| رزرو/لغو خودکار | 🚧 در برنامه |

### شروع سریع

```bash
git clone https://github.com/MatinBodaghi/AUT-food-bot.git
cd AUT-food-bot
npm install
cp .dev.vars.example .dev.vars
npm run check
```

مقادیر `AUT_USERNAME`، `AUT_PASSWORD`، `TELEGRAM_BOT_TOKEN` و `TOKEN_KEY` را در `.dev.vars` قرار بده. این فایل در `.gitignore` است و هرگز نباید کامیت شود.

برای تست ورود واقعی:

```bash
npm run smoke:login
```

برای مشاهدهٔ درخواست‌های شبکهٔ سامانه:

```bash
npm run inspect
```

پوشهٔ `data/captured/` ممکن است شامل نام کاربری، رمز عبور، کوکی و تیکت باشد؛ آن را محلی نگه دار و هرگز منتشر نکن.

### مشارکت و امنیت

- راهنمای مشارکت: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- آیین‌نامهٔ رفتار: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- گزارش امنیتی: [`SECURITY.md`](SECURITY.md)

### سلب مسئولیت

این پروژه شخصی و مستقل است و هیچ وابستگی رسمی به دانشگاه صنعتی امیرکبیر ندارد. استفاده از آن با مسئولیت خودت است؛ قوانین دانشگاه و شرایط سامانهٔ تغذیه را رعایت کن.

### مجوز

[MIT](LICENSE) © ۲۰۲۶ متین بداغی
