# Security policy

## Reporting a vulnerability

Please report security problems privately. Use **Report a vulnerability** on the repository's *Security* tab
(GitHub private vulnerability reporting) and do not open a public issue or pull request that describes the problem.
Include what you found, how to reproduce it, and what an attacker would gain. You will get an acknowledgement
within three working days.

The production site is private while it is being tested. Do not probe it without written permission from the owner.

## What the platform already does

- Sign-in is rate limited per client, per account and per address; password-recovery codes allow five guesses in total.
- Passwords are hashed with Argon2id; sessions are opaque, stored only as hashes, and sent in an HttpOnly cookie.
- The private-preview gate compares credentials in constant time, stops evaluating them after ten wrong guesses from
  one client in ten minutes, and fails closed when it is half configured.
- Every state-changing request is checked for a same-site origin; responses carry framing, content-type, referrer and
  transport-security headers, and a full content security policy is being collected in report-only mode.
- The password hash never leaves the database unless a query asks for it explicitly; other users only ever see a
  display name.

## Known and accepted advisories

`npm audit --omit=dev` must stay at zero. The following advisories exist in development tooling only and have no
patched release upstream; they are reachable only by patterns written in this repository's own ESLint configuration,
never by user input or by anything that ships:

| Package | Advisory | Why accepted |
|---|---|---|
| `braces` (via `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch`) | stack exhaustion on deeply nested glob patterns | no fixed version is published; dev-only; static patterns |

The continuous-verification workflow fails on any critical advisory anywhere and on any advisory in shipped code.

## Supported versions

Only the current `main` branch and the deployment built from it receive security fixes.
