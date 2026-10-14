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
  transport-security headers and an enforced, nonce-based content security policy.
- The password hash never leaves the database unless a query asks for it explicitly; other users only ever see a
  display name.
- Expensive or abusable work is bounded: password hashing is limited per instance and refused quickly under a flood,
  uploads are checked by content and size, exports and PDF/OOXML processing have page, pixel and archive ceilings, and
  the database pool and queries have timeouts (see `docs/load-testing.md`).
- A black-box sweep of every API route runs in CI: no route is reachable without a session unless it is on a reasoned
  public list, members cannot reach administrator routes, cross-site writes are refused, and hostile input never
  produces a server error or leaks internals.
- E-mail addresses are verified with a short-lived code before they can accept invitations or publish; people join a
  project only by accepting an invitation sent to their own verified address, never by being added.
- On the public site a new account (password or Google/Apple) waits for the owner's approval and has no session until then.

## Risk register

Reviewed on 2026-10-14. Severity is our own judgement of real impact on this deployment (reachability and consequence),
not the raw advisory score. "Resolved" items stay listed so the reasoning is not lost.

| # | Severity | Item | Reachable by | Status and control | Next step |
|---|---|---|---|---|---|
| 1 | High | E-mail ownership was never proven: someone could register with an address that is not theirs and then receive invitations, listings or payments meant for the real owner | Anyone able to register | **Mitigated in code.** Six-digit verification code (15 min, five guesses, one code a minute, five an hour), `emailVerifiedAt` set only for the address the code was sent to; accepting or sending invitations, publishing listings and postings, and requesting campaign payment require a verified address when `REQUIRE_EMAIL_VERIFICATION=true` (automatic after `PUBLIC_LAUNCH=approved`). Google sign-in only creates accounts for addresses the provider asserts are verified | Configure Resend (`docs/email-setup.md`), then set `REQUIRE_EMAIL_VERIFICATION=true` **before the invited trial** |
| 2 | High | Project membership without consent: an owner could add any registered account, and the "user not found" answer revealed which addresses are registered | Any project owner | **Resolved.** Replaced by Invite/Accept: invitations are keyed by address with no account lookup (same answer for registered and unknown addresses), grant nothing until the matching, verified account accepts, expire after 14 days, can be declined or cancelled, and are capped per project and per person | None |
| 3 | Medium | The private-preview gate was one shared password | Anyone who learned it | Replaced for the public site by per-account sign-in plus owner approval (item 10). The gate (constant-time comparison, ten-guess lockout) stays available for private previews | Remove the gate only together with approval being on |
| 4 | Medium | Mail must be configured for verification, recovery, invitations and approval notices | Everyone (availability) | **Configured** on 2026-10-14: Resend with `jenanpro.sa` verified (SPF/DKIM/DMARC). Fails safe if it breaks: no code is ever shown on `jenanpro.sa`, recovery answers the same for known and unknown addresses, and an owner can still approve from `/admin/users` | Keep `npm run mail:check` green; watch Resend's sending limits |
| 5 | Medium | Hosting plan: Vercel Hobby is meant for personal, non-commercial use and has lower quotas and fewer firewall features than Pro | A traffic spike or a public launch | App-level limits (Redis-backed rate limits, Argon2 concurrency limit that answers 503 quickly, readiness cache, pool and query timeouts). No heavy load test is run against Hobby | **Move to Pro now that the site is public** |
| 6 | Medium | Single region and single database (Vercel `iad1`, Neon `us-east-1`): latency for Saudi users and data-residency questions under the Saudi PDPL | Every user | Backups and rollback plan documented | Decide on the move in `docs/region-migration-plan.md`; nothing moves without the owner's approval |
| 7 | Low | Five npm advisories rated high (`braces` and the chain `micromatch` → `fast-glob` → `@next/eslint-plugin-next` → `eslint-config-next`): stack exhaustion on deeply nested glob patterns | Nobody: development tooling only, static patterns written in this repository, never shipped, never fed user input | `npm audit --omit=dev` is zero and CI fails on any shipped-code advisory or any critical one; Dependabot watches for a fixed release | Upgrade when upstream publishes a patched version |
| 8 | Low | The content security policy allows inline styles (`style-src 'unsafe-inline'`); `script-src` is strict, nonce-based and enforced | An attacker who can already inject markup (none known) | Cannot run script; frames, objects, base URI and form targets are restricted; violations are reported to `/api/security/csp-report` | Replace inline style attributes with classes, then remove `'unsafe-inline'` |
| 9 | Info | Code scanning, secret scanning and Dependabot alerts | n/a | Zero open alerts at this review; CodeQL runs on every push | Keep it at zero |
| 10 | Medium | **Public exposure** (decision of 2026-10-14): anyone can see the site and register | The whole internet | Registration only creates a `PENDING` account with no session (password and Google/Apple); signing in needs the owner's approval, audited and atomic; per-client, per-address and per-account rate limits; registrations are mailed to nobody but the owners (capped at ten an hour) | Residual: the registration form still answers "e-mail already registered" for an existing address (rate limited, as before); there is no CAPTCHA, so a bot can fill the waiting list. Review the list in `/admin/users` regularly and add a CAPTCHA if spam appears |
| 11 | Medium | **Weak passwords allowed** (decision of 2026-10-14): the rule is four characters and one capital letter, chosen by the owner for convenience (`lib/auth/password-policy.ts`) | Anyone who can guess a password | Argon2id hashing, per-client, per-address and per-account rate limits, account approval, audit of failures. Such a password can still be guessed in a few thousand tries by someone who is not throttled, and a database leak would expose it quickly to offline cracking | Accepted by the owner. Strongly advised: a longer rule (10+ characters) at least for administrators, optional two-step sign-in, and a check against lists of common passwords |

Nothing above is a critical item. Items 10 and 11 are accepted by the owner; 5 and 6 should be settled soon after the launch.

`npm audit --omit=dev` must stay at zero. The accepted development-only advisories (item 7) have no patched release
upstream. The continuous-verification workflow fails on any critical advisory anywhere and on any advisory in shipped code.

## Supported versions

Only the current `main` branch and the deployment built from it receive security fixes.
