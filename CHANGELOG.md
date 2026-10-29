# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial project structure for a Telegram bot targeting the AUT food system.
- AUT CAS login flow with an in-memory cookie jar.
- Restaurant list and weekly reserve-page requests.
- Minimal Telegram Bot API client with HTML message support.
- Persian formatting helpers: digits, HTML escaping, Jalali dates, keyboards.
- AES-GCM encryption, SHA-256 hashing, and timing-safe comparison helpers.
- Playwright-based network inspector and CAS login smoke test.
- Unit tests for the formatting helpers.
- MIT license, bilingual README, contribution guide, code of conduct, security
  policy, issue and pull request templates, and CI workflow.
- Cloudflare Worker entry point with a secret-token-authenticated Telegram webhook.
- D1 storage (`migrations/0001_init.sql`) for the owner, encrypted AUT password,
  encrypted session cookie, and login conversation state.
- `FoodClient.getPersonGroupId()` and the correct restaurant endpoint
  (`/Reserves/GetRestaurantByPersonGroup`) instead of the credit-transfer list.
- HTML parser for the reserve page: credit, days, meals, food options, prices,
  and reservation state, with a redacted fixture and tests.
- Bot commands `/start`, `/help`, `/login`, `/logout`, and `/menu`, plus the
  `tools/set-webhook.mjs` helper.

### Changed

- Type-checking now uses the Cloudflare Workers type definitions.
- The login smoke test runs TypeScript directly through `tsx`; the duplicated
  `src/food/client.js` file was removed.
- Package metadata now includes repository, license, and author information.

### Security

- Documented the risk of credentials and session tickets in `data/captured/`.

## [0.1.0] - Unreleased

Initial development version. Not yet published.

[Unreleased]: https://github.com/MatinBodaghi/AUT-food-bot/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/MatinBodaghi/AUT-food-bot/releases/tag/v0.1.0
