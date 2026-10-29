# Contributing to AUT-food-bot

Thanks for your interest in improving the project! This document explains how to set up the repository, what to expect from the review process, and the conventions we follow.

By participating, you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- Report a bug or request a feature using [GitHub Issues](https://github.com/MatinBodaghi/AUT-food-bot/issues).
- Improve documentation or add tests.
- Implement an item from the [roadmap](README.md#roadmap).
- Review pull requests and share feedback.

Please search existing issues before opening a new one. For security problems, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Development setup

Requirements:

- Node.js 20 or newer
- npm
- Google Chrome (only for the network inspector)

```bash
git clone https://github.com/MatinBodaghi/AUT-food-bot.git
cd AUT-food-bot
npm install
cp .dev.vars.example .dev.vars
npm run check
```

`npm run check` must pass before you open a pull request. It runs the strict TypeScript compiler and the Vitest suite.

## Project layout

```text
src/food/       AUT CAS client, cookie jar, reserve-page requests
src/telegram/   Telegram Bot API wrapper and Persian formatting
src/bot/        Bot router and handlers (planned)
src/crypto.ts   AES-GCM, SHA-256, timing-safe comparison
tools/          Local network inspector and login smoke test
test/           Unit tests
docs/           Architecture and API notes
```

## Coding guidelines

- Use TypeScript in strict mode. Avoid `any`; prefer precise types or `unknown` with validation.
- Keep the AUT-specific code inside `src/food/`. The project is intentionally AUT-specific, but the boundary should stay clear.
- Keep Telegram transport in `src/telegram/` and bot logic in `src/bot/`.
- All user-facing bot text is Persian. Use the helpers in `src/telegram/format.ts` for digits, escaping, and dates.
- Escape user-controlled text before sending HTML to Telegram (`esc`).
- Do not log credentials, cookies, service tickets, or full request bodies.
- Prefer small, focused functions and add a short comment only when the reason is not obvious.
- Do not add a dependency if the platform already provides the functionality.

## Tests

- Add a unit test for every bug fix and every new pure function.
- Put tests in `test/` and name them `*.test.ts`.
- Use recorded fixtures instead of calling the real AUT service in tests.
- Never put real credentials in a fixture.

```bash
npm test
npm run test:watch
npm run typecheck
```

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add weekly menu parser
fix: handle expired CAS session
docs: document reserve endpoints
test: cover Persian date formatting
chore: update dependencies
```

Keep the subject line short and imperative. Use the body to explain *why*, not *what*.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Make your change, add tests, and update the documentation if behavior changes.
3. Run `npm run check`.
4. Open a pull request and fill in the template.
5. Link the related issue, if any.

A pull request is ready when:

- CI is green.
- The change is focused and does not include unrelated formatting churn.
- New behavior is tested.
- No secrets, cookies, `.dev.vars` contents, or `data/captured/` files are included.
- The public behavior is documented in the README or `docs/`.

Maintainers may ask for changes or close stale pull requests. Please be patient; this is a volunteer project.

## Reporting bugs

A good bug report includes:

- What you expected to happen.
- What actually happened.
- Steps to reproduce.
- The Node.js version and operating system.
- Relevant logs with **secrets redacted**.

Do not paste your AUT password, Telegram bot token, `TOKEN_KEY`, cookies, or service tickets into an issue.

## Security

If you believe you found a vulnerability, read [SECURITY.md](SECURITY.md) and report it privately. Do not disclose it in a public issue or pull request.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
