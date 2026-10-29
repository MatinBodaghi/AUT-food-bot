# Security Policy

## Supported versions

This project is in early development. Security fixes are applied to the latest
release on the `main` branch.

| Version | Supported |
| --- | --- |
| `0.1.x` | ✅ |
| `< 0.1` | ❌ |

## Reporting a vulnerability

**Please do not open a public GitHub issue for a security problem.**

Use GitHub's private vulnerability reporting:

1. Go to the [Security tab](https://github.com/MatinBodaghi/AUT-food-bot/security).
2. Click **Report a vulnerability**.
3. Describe the issue, the impact, and the steps to reproduce it.

If private reporting is not available, contact the maintainer through the
GitHub profile: <https://github.com/MatinBodaghi>. Please avoid sending
credentials or personal data in the first message.

Useful reports include:

- The affected file, endpoint, or command.
- A minimal proof of concept with secrets redacted.
- The expected and actual behavior.
- The impact (for example: credential disclosure, session hijacking, unauthorized reservation).

## What to expect

- Acknowledgement of the report as soon as possible, usually within 72 hours.
- An assessment and a proposed fix timeline.
- Credit in the release notes if you want it.

This is a volunteer project, so these are best-effort targets, not a commercial
service-level agreement. There is no bug bounty.

## Scope

In scope:

- Handling of AUT credentials, CAS tickets, and session cookies.
- Encryption and key management (`TOKEN_KEY`, AES-GCM).
- Telegram webhook authentication and authorization.
- Injection, path traversal, and unsafe HTML rendering in bot messages.
- Logic that could cause unintended reservations, cancellations, or credit loss.
- Exposure of secrets through logs, error messages, or committed files.

Out of scope:

- Vulnerabilities in `food.aut.ac.ir`, `accounts.aut.ac.ir`, Telegram, Cloudflare,
  or other third-party services. Report those to the respective provider.
- Denial of service through the university's own rate limits.
- Social engineering.
- Issues that require a compromised device or an already stolen token.

## Handling secrets

- `.dev.vars` is gitignored and must never be committed.
- `data/captured/` is gitignored and may contain your username, password,
  cookies, and CAS service tickets. Treat it as sensitive.
- Production secrets belong in Cloudflare (`wrangler secret put`), not in the
  repository.
- If a credential is exposed, rotate the AUT password and the Telegram bot token
  immediately, and generate a new `TOKEN_KEY`. Re-encrypting stored data may be
  required after rotating `TOKEN_KEY`.

## Safe harbor

We will not pursue legal action against researchers who:

- Act in good faith and avoid privacy violations, data destruction, and service
  disruption.
- Report the issue privately and give us reasonable time to fix it.
- Do not access other users' accounts or data.

## Disclosure policy

Please give us a reasonable window to release a fix before public disclosure.
We will coordinate the disclosure date with you and credit your contribution if
you wish.
