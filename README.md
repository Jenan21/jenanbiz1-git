# Jenan Pro Core

Production-oriented foundation and visual application shell for Jenan Pro. Core workflows cover internal tools, AI Gateway execution, organization programs, academy learning, projects, market listings, talent, notifications, and local file storage. Real payments, external authentication providers, and third-party channel integrations remain separately configurable.

## Requirements and startup

- Node.js 20.9 or newer
- npm 10 or newer
- Docker Desktop with PostgreSQL 17 through `compose.yaml`

```bash
npm install
npm run db:setup-env
docker compose up -d postgres
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`. `.env.example` contains placeholders only; never commit real secrets.

Quality commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run format:check`, `npm run prisma:validate`, and `npm run build`.

## Sentry error monitoring

The optional `@sentry/nextjs` integration covers browser errors, the React global error boundary, unhandled Next.js Node/Edge request errors, and unexpected errors caught by the shared safe-error handler (tagged with the existing public reference ID). Expected validation errors remain unreported. Existing audit logs, metrics, authentication, and worker execution are unchanged. Monitoring sends events only in production with a configured DSN; development and unconfigured deployments do not send events. Tracing is disabled, and Replay, profiling, and Sentry Logs are not enabled.

**Project provisioning is not completed:** the official agent-plugin installer ran in the cloud agent but detected no supported assistant CLI and skipped installation. The onboarding run code is not an API credential; no Sentry token, authenticated Sentry MCP session, project ID, or DSN was available. No project or DSN has been fabricated.

To finish setup:

1. An authenticated owner of organization `jenanpro` should create/select a **Next.js** project in Sentry. One project can cover the browser and Next.js backend. Copy its client DSN to `NEXT_PUBLIC_SENTRY_DSN` in the deployment settings and its actual slug to `SENTRY_PROJECT`. No numeric project ID is needed. Leave `SENTRY_DSN` empty to use the same project server-side.
2. If separate browser/server projects are required, set the second project's DSN as `SENTRY_DSN` and configure source-map uploads for both projects before enabling it (the current build targets the single `SENTRY_PROJECT`). Existing database-backed robot jobs execute within Next.js requests; there is no new standalone worker SDK/process.
3. Store a least-privilege Sentry build token with the required source-map/release upload permissions as the CI/deployment secret `SENTRY_AUTH_TOKEN`, never as `NEXT_PUBLIC_*`, in source, logs, or a tracked environment file. Supply it only to trusted builds, not untrusted fork PRs or the running application.
4. Set `SENTRY_RELEASE` to the immutable commit SHA during build and server runtime. `withSentryConfig` injects the matching browser release and uses debug IDs for source-map association. Uploads and release creation/finalization are enabled only when both the build token and project slug exist; otherwise source-map generation/upload is disabled. Uploaded generated maps are deleted from the build output. Do not enable `productionBrowserSourceMaps` or publish `.next`/maps as public artifacts.
5. Build/deploy with the existing commands. On a private staging deployment with real DSNs, trigger a controlled, non-sensitive client exception and server exception, confirm both arrive in the correct project/release with readable stack traces, and verify unauthenticated requests cannot retrieve `/_next/static/**/*.map`. No intentional-error route is shipped.

The CSP permits only Sentry's HTTPS ingestion domains in addition to same-origin connections; no tunnel, access-gate bypass, or general network wildcard is added. Self-hosted Sentry requires a separately reviewed CSP origin.

`sendDefaultPii` is off. SDK data collection disables user information, cookies, HTTP headers/bodies, URL query parameters, GraphQL documents/variables, AI inputs/outputs, database query data, queue arguments, stack-frame variables, and source context lines. The shared event filter also removes request metadata, Next.js request paths, user details, breadcrumbs, and extra data before transmission. Error messages, stacks, tags, and other SDK context can still contain application-supplied data: review Sentry's server-side data-scrubbing rules and retention/access controls before enabling production DSNs. Never include credentials or private business inputs in exception messages or custom context.

## Structure

- `app/`: App Router routes and layouts.
- `components/`: reusable UI and layout components.
- `config/`: application and environment configuration.
- `hooks/`: reusable React hooks.
- `lib/`: i18n, authentication contracts, and utilities.
- `services/`: integration and application service boundaries.
- `styles/`: global styles and Tailwind entrypoint.
- `types/`: shared TypeScript contracts.
- `prisma/`: PostgreSQL model and future migrations.

## Visual routes

Authenticated visual shells include Dashboard, Projects, Academy, Studio, Talent, Market, Software, Jenan Robotics, Marketing, Account, Pricing, and Benefits. Administrative shells include Command, Data Center, Global Health, Bounty Hunters, and Social Growth. These routes intentionally show explicit empty, unavailable, or concept states instead of fabricated operational data.

- `/software/robotics` is the Jenan Robotics visual catalog. Purchasing, renting, quotations, media, availability, and specifications are not active.
- `/admin/bounty-hunters` presents the Evolution Command Center and Jenan Collective Intelligence Core concept without running agents or an intelligence engine.

## Architecture notes

Arabic and English dictionaries are included. Locale resolution checks a `locale` cookie, then `Accept-Language`, defaulting to Arabic; the root layout applies matching `lang` and `dir` attributes. Locale-prefixed routing can be added after navigation requirements are finalized.

Authentication uses PostgreSQL-backed users and sessions. Passwords are hashed with Argon2id, opaque session tokens are stored only as SHA-256 hashes, and the browser receives an HttpOnly/SameSite cookie. Register, login, and logout are exposed through same-origin API routes. Google and Apple sign-in are available as an optional second way in (see "Social sign-in" below).

Public registration is closed by default when `NODE_ENV=production`; set `ALLOW_PUBLIC_REGISTRATION=true` to open it. When the site is public (`PUBLIC_LAUNCH=approved`) every new account waits for the owner's approval before it can sign in (see "Staged access").

`/dashboard` requires an authenticated session. `/admin` additionally requires the `ADMIN` or `SUPER_ADMIN` platform role. Organization membership permissions are resolved from persisted roles and permissions.

The Prisma schema models identity, multi-tenant organizations, RBAC, sessions, notifications, auditing, community-access grants, plan/subscription/payment records, and file metadata. Payment models are structural only. PostgreSQL runs locally through `compose.yaml` with a persistent volume and healthcheck.

## Community Access

Academy, software, and talent can use a free community-access entitlement in their UI. The backend supports Facebook, Instagram, TikTok, YouTube, Snapchat, and X through `GET` and `POST /api/community-access`. Administrators manage approved HTTPS profile links through `GET` and `POST /api/admin/social-links`; active links are available platform-wide through `GET /api/platform/social-links`.

The access grant is based on a clear user acknowledgement after opening a configured link. It does not claim to automatically verify a follow or subscription, because the social networks do not expose that verification consistently. The UI should state this plainly and keep ordinary account access available when no approved channel is configured.

## User Dashboard Data

`GET /api/dashboard` returns the authenticated user's private dashboard data. Its metrics are computed from persisted records, not UI lists: projects, organization memberships, open market and job requests, learning progress, services, files, unread notifications, and community access. `recentActivity` contains only the authenticated user's audit events. The existing dashboard UI can consume this endpoint without exposing another user's records.

Integration tests use the real local PostgreSQL database and clean up their records:

```bash
npm run test:integration
```

## Project Analysis: what it measures

Project analysis reports indicators for the **location and country** of a project: population, purchasing power and inflation from the World Bank, and competitor venues mapped on OpenStreetMap near the chosen city. It does not evaluate the idea itself, because no AI provider is configured; the results screens and the report say so.

- Idea, city and project name are checked before anything is stored (`lib/projects/text-quality.ts`, in the forms and again in `app/api/projects/route.ts`). Repeated letters ("ههههه"), keyboard mashing, repeated words and answers that are too short are refused with a readable reason. The check judges whether the text is understandable, not whether the idea is good.
- Competitor discovery runs only for sectors with an honest map category (`lib/projects/competitor-sectors.ts`). A sector without one (for example technology, services or energy) gets no competitor count, and a search that returns nothing is shown as unavailable, never as low competition.
- The signed-in home (`/dashboard`) is a single screen with no scrolling on desktop and tablet sizes (on short screens the lower rows give way before the page would scroll) and follows the owner's reference design. It shows no invented figures: the market tiles say "unavailable" until a real data source is connected, and notifications are disabled. Its search looks through the platform's own pages and tools in the browser (`lib/navigation/home-search.ts`), and its hero is a colour-graded photograph of a night city (`public/assets/home-hero.webp`, made from `global-city-night.jpg`) under the glowing links, which also appears as a faint watermark inside every service card.

## One identity across the platform

Every signed-in page uses the same header (`components/shell/jenan-header.tsx`: brand, the section navigation from `lib/navigation/main-nav.ts`, language, profile with the role, sign-out), and section pages are built from the same stage (`styles/jenan-shell.css`): a colour-graded photograph, a reading-side fade and glass panels. The Projects section (`/projects`, `components/projects/projects-hub.tsx`) is the first section rebuilt as one screen with no scrolling; the member shell (`PlatformShell`, used by Market, Programs and the user center) and the project flows already use the shared header, and the rest of the sections follow the same pattern one by one. `GET /api/auth/admin-access` returns the account's own role for the header. The header also carries a Back button (the floating Back/Home/Admin shortcuts are hidden on any page that has the header, so they never cover its content).

The first page of each section (`/software`, `/academy`, `/talent`, `/market`, `/marketing`) is a one-screen showcase built from `components/shell/section-showcase.tsx` and the content in `lib/navigation/section-showcases.ts`: a headline over the stage photo, three plain statements about what the section does (capabilities, never figures) and six rectangular service tiles that each lead to a working page. The functional dashboards moved one level down: `/talent/dashboard`, `/marketing/dashboard` (which also hosts the administrator's payment review) and `/market/dashboard`. Icons across the home, Projects and showcase pages are small rounded rectangles with one sharp corner rather than large discs. The header carries the approved Jenan PRO logo (`public/assets/jenan-pro-mark.webp`, the silver "Jenan" with the "PRO" recoloured from blue to the platform's cyan) and a section's scene (`public/assets/home-panels/*-scene.webp`) is shown once, at its own size, fading into the page instead of being enlarged into the cards. The Academy pages, the Software suite and the Talent workspaces sit under the same header too (`styles/section-pages.css`): Academy and Software keep a slim strip of their own links below it, Talent keeps its seeker/employer sidebars.

## Jenan Digital Workforce

`/admin/academy` is backed by the Academy registry, universal skill graph, academic profiles, certification gates, retraining queue, workforce demand and gaps, candidate batches, cohorts, curriculum versions, geography foundation, runtime allocation, and shared agent-genome packs. Seed the initial registry with:

```bash
npm run academy:seed
npm run test:academy
```

Labs that require a live model provider are explicitly marked `Awaiting AI Provider`; they do not simulate production AI outcomes. `LIVE-ACCEPTANCE-001` remains an external provider/billing blocker and is intentionally deferred. See `docs/academy-workforce-requirement-matrix.md` for the V1 requirement matrix and deferred integrations.

## Browser QA and E2E

Playwright runs real browser tests against the local application and PostgreSQL. The visual-layout suite covers Desktop, Laptop, Tablet, and Mobile in Arabic RTL and English LTR. It checks document direction, horizontal overflow, and horizontal viewport containment for essential page elements. It intentionally contains no golden screenshot assertions or approved baselines yet; those will be created only after the Figma source of truth is approved.

The `review-pack` Playwright project creates review-only screenshots under ignored `outputs/visual-review-pack`. These files are never treated as golden baselines and are excluded from Git.

```bash
npx playwright install chromium
npm run test:e2e
```

The authentication E2E suite exercises real registration, onboarding, login failure and success, password recovery, logout, protected dashboard access, origin checks, rate limits, USER denial from `/admin`, and ADMIN access. Run-scoped users are deleted in global teardown, including failure runs that reach teardown. Do not run E2E against a shared production database.

The `security-sweep` project (`npm run test:e2e:security`) reads every API route from `app/api`, so a route added later is covered automatically. It checks that callers without a session get `401`/`403` on everything except an explicit, reasoned public list, that an ordinary member never reaches an administrator route, that a request from another site is refused even with a valid session, and that hostile input (truncated or deeply nested JSON, oversized strings, prototype-pollution and injection payloads, wrong types) never produces a `5xx` or leaks internals. `link-integrity` crawls the signed-in application as a member and as an administrator and fails on any broken link. For sustained-load and abuse behaviour see [docs/load-testing.md](docs/load-testing.md) (`npm run loadtest`).

## Initial SUPER_ADMIN bootstrap

The first `SUPER_ADMIN` is created by a server-side CLI only; there is no HTTP endpoint. Run it from a trusted machine with the target `DATABASE_URL` in the runtime environment and the administrator's address on the command line:

```bash
npm run auth:bootstrap-super-admin -- --email=owner@example.com --name="Site Owner"
```

The password is never read from a file and never written anywhere: leave `SUPER_ADMIN_PASSWORD` unset in an interactive terminal and the command generates a strong password (24 characters) and shows it **once** at the end; or supply your own `SUPER_ADMIN_PASSWORD` (16 to 128 characters). A database that is not local needs a typed confirmation of its host name (`--yes` in automation). The address is stored as **not verified** unless `--mark-verified` is passed (use it only when you own the inbox); verify it from the account after signing in once e-mail is set up (`docs/email-setup.md`). The command uses Argon2id, a serializable PostgreSQL transaction and an advisory lock; it refuses to run when any `SUPER_ADMIN` already exists or the address is already assigned, so there is exactly one bootstrap, and it writes `super_admin.bootstrapped` to `AuditLog`. Never place real values in Git. Any later SUPER_ADMIN creation must use a separately authorized administrative workflow.

Administrators and the owner sign in on the same page as members and land on the member home. The administration area is `/admin` (approvals of new accounts are at `/admin/users`). Administrators get an "Admin" entry in the home header and in the floating shortcuts shown on every other member page (`components/navigation/page-shortcuts.tsx`, which also gives every member page "Back" and "Home"; the rules for where it appears are in `lib/navigation/page-shortcuts.ts`). Whether the account is an administrator is answered by `GET /api/auth/admin-access`, which returns only `{ "admin": true | false }` to a signed-in account and 401 to anyone else; other accounts never see the entry and `/admin` itself still enforces the role on the server. The pre-entry page, sign-in, registration and the signed-in home get no shortcuts.

## Password rule

Owner decision (2026-10-14): a password needs **at least four characters and at least one capital letter**; its length beyond that, digits and symbols are the person's choice. The rule lives in `lib/auth/password-policy.ts` and is shared by the sign-up form, the recovery form and both API schemas (`lib/auth/validation.ts`, `app/api/auth/forgot/route.ts`); the upper bound of 128 characters stays so hashing work is bounded. Sign-in accepts any existing password. The Super Admin CLI still asks for 16+ characters. See `SECURITY.md` (item 11) for the risk of short passwords.

## Authentication rate limiting

`login`, `register`, `oauth`, and sensitive project operations use a vendor-neutral `RateLimitProvider` contract. Development and tests default to the documented in-memory adapter. When `REDIS_URL` is configured, the application uses Redis with atomic increment and expiry semantics across instances. Production fails closed if no distributed provider is configured.

Every authentication route spends three independent budgets (`lib/rate-limit/auth-rate-limit.ts`): one client trying one account, one client across all accounts, and one account across all clients, so neither spraying many accounts from one address nor rotating addresses against one account gets around the limit. Expensive routes (document processing, exports, uploads, image analysis, metrics) share the same provider through `enforceRouteRateLimit` (`lib/rate-limit/route-rate-limit.ts`). The client address is read from the platform's forwarded-address header (Vercel overwrites it, so it cannot be spoofed there); when the app runs behind another reverse proxy, make that proxy overwrite `X-Forwarded-For` instead of appending to it.

## Social sign-in (Google and Apple)

Both sign-in panels show «المتابعة عبر Google / Apple» under the form, but **only for providers that are configured**. A provider whose credentials are missing is not shown at all, and when none is configured the whole row disappears (the panel keeps its approved layout), so nothing is offered that cannot work. To turn one on, set its variables (see `.env.example`; `AUTH_SECRET` must also be set) and register this redirect URI with the provider, using the value of `NEXT_PUBLIC_APP_URL` as the origin:

| Provider | Variables | Redirect URI |
|---|---|---|
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `<origin>/api/auth/oauth/google/callback` |
| Apple | `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (.p8 contents, `\n` for line breaks) | `<origin>/api/auth/oauth/apple/callback` |

Google accepts `http://localhost:3000` for development. Apple only accepts a public HTTPS domain that you have verified in the Apple developer account, so test it through an HTTPS tunnel or on the real domain.

How it works: `GET /api/auth/oauth/{provider}/start` creates a single-use state, nonce, and (for Google) PKCE verifier, stores them in a signed HttpOnly `jenan_oauth` cookie that lives 10 minutes, and redirects to the provider. The callback (`GET` for Google, `POST` form for Apple) verifies the state, exchanges the code, and verifies the ID token signature against the provider's published keys together with issuer, audience, expiry, nonce, and a verified email. Apple's client secret is an ES256 token signed on the server from your `.p8` key. No provider token is stored.

Accounts: a returning provider identity signs in directly. A verified email that already belongs to an account is linked to it only when that cannot be an impersonation, meaning the address was verified before, the account has no password, or public registration is closed so every account was provisioned by an administrator; otherwise the person is told to sign in with their password. Otherwise a new passwordless account is created when public registration is allowed and the person continues to `/user/onboarding`. Disabled accounts are refused. Every outcome is audited and rate limited under the `oauth` policy, and failures return to the panel with a neutral notice.

Tests: `npm run test:e2e:social-auth` (UI states and the full redirect flow against a local mock provider), plus `tests/unit/oauth-*.test.ts` and `tests/integration/oauth-signin.integration.test.ts`.

## E-mail: verification, recovery and invitations

All outgoing e-mail goes through one provider (Resend) configured with `RESEND_API_KEY` and `MAIL_FROM`; the full set-up (domain, SPF/DKIM records, variables) is in [docs/email-setup.md](docs/email-setup.md) and `npm run mail:check` validates it. Until it is configured nothing is sent and the interface says so.

- **E-mail verification.** `/user/verify-email` (and a notice in the signed-in shell) mails a six-digit code to the account's own address: valid for 15 minutes, five guesses per code (counted atomically), one code a minute, five an hour; the code only verifies the address it was sent to. When `REQUIRE_EMAIL_VERIFICATION=true` (automatic after `PUBLIC_LAUNCH=approved`), accepting invitations, inviting people, publishing market listings and job postings, and requesting campaign payment need a verified address. Accounts created through Google sign-in start verified because the provider asserts the address.
- **Project invitations (Invite/Accept).** A project owner invites an e-mail address with a role; nobody is added directly. The invitation is keyed by the address (so the answer is identical for registered and unknown addresses), grants nothing, expires after 14 days, can be cancelled by the owner, and is accepted or declined by the signed-in account whose verified address matches. Owners see their pending invitations per project; invitees see theirs at the top of Projects. Limits: 50 open invitations per project, 40 invitations per person per day, and the existing membership rate limit. Organization invitations also require a verified address on both sides when verification is required.

## Visual regression for the frozen pages

`/`, `/login` and `/register` are design-frozen, so changes to them are checked pixel for pixel before and after. `tests/e2e/visual-regression.spec.ts` captures 64 screenshots (four states, Arabic and English, eight viewports, reduced motion) with zero tolerance. Baselines are not committed: record them on the commit you start from, then compare after your change.

```bash
VISUAL_BASELINE_DIR=/path/outside/the/repo npm run test:e2e -- tests/e2e/visual-regression.spec.ts --project=visual-regression --update-snapshots   # record
VISUAL_BASELINE_DIR=/path/outside/the/repo npm run test:e2e -- tests/e2e/visual-regression.spec.ts --project=visual-regression                      # compare
```

The home world map is a static asset (`public/assets/gateway-world.v1.svg`, immutable cache) referenced with `<use>`, generated from the map data by `npm run generate:world-map`; `node scripts/generate-world-map.mjs --check` fails when the committed files are stale.

## Password recovery delivery

Development returns a local single-use recovery code for testing. Production sends the code through Resend when `RESEND_API_KEY` and `MAIL_FROM` (or the older `AUTH_RECOVERY_EMAIL_FROM`) are configured; `AUTH_RECOVERY_EMAIL_ENDPOINT` may override the API endpoint for a compatible approved provider. Responses never reveal whether an account exists. If no provider is configured, the interface reports that recovery delivery is unavailable. Provider failures are audited, the undelivered token is invalidated, and the public response remains neutral to prevent account enumeration.

## Security posture

Session cookies are HttpOnly, SameSite=Lax, scoped to `/`, and Secure in production. Opaque session values are never stored directly in PostgreSQL, sessions have explicit expiry and are deleted on logout or expiry, passwords use Argon2id, validation is server-side, duplicate emails return a conflict, invalid login paths perform password verification against a dummy Argon2id hash, RBAC is enforced in server components, and security-relevant auth actions are audited without passwords or tokens.

Further controls, all covered by tests:

- **Password hash isolation.** The database client omits `User.passwordHash` globally; only the sign-in and OAuth-linking queries ask for it (`omit: { passwordHash: false }`). Other people's accounts are only ever exposed as a display name (`lib/auth/public-user.ts`).
- **Recovery codes.** An attempt is reserved atomically before a code is checked, so concurrent guesses cannot exceed five per code; unknown addresses and wrong codes take as long as real ones, and e-mail delivery runs after the response is sent so timing does not reveal which addresses exist.
- **Private-preview gate.** Credentials are compared in constant time (UTF-8, so non-Latin passwords work), a client is blocked for ten minutes after ten wrong guesses (a correct guess is refused too while the block lasts), a signed twelve-hour cookie spares later requests the check, and rotating the password revokes every cookie.
- **Response headers.** Every response carries `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and `Strict-Transport-Security`. In production the proxy sends a complete, nonce-based `Content-Security-Policy` (scripts only with a per-request nonce and `strict-dynamic`, images, connections, frames and objects restricted to the site and the configured map tile provider). It is enforced: the policy was audited against a production build with `npm run test:e2e:csp` (every reachable page as a member and as an administrator, the PDF preview and the Visual DNA tool) and produced no violations. Violations are posted to `/api/security/csp-report` and logged as `[csp-violation]`; set `CSP_REPORT_ONLY=1` to downgrade the policy to report-only if a release needs it. Re-run the audit after adding a third-party origin, font, map provider or embedded content.
- **Errors.** Route handlers return a generic message with a short reference for database and runtime errors (`lib/http/safe-error.ts`); the detail goes to the server log.
- **Database transport.** `lib/db-url.ts` pins `sslmode=verify-full` whenever the URL asks for `require`, `prefer`, or `verify-ca`, so a future `pg` major (which follows libpq and stops verifying the certificate for those modes) cannot weaken TLS silently.
- **Redirects.** The post-sign-in destination must be a same-site path (`lib/auth/redirect.ts`).
- **Supply chain.** `npm audit --omit=dev` must stay at zero (CI enforces it); `package.json` lists the install scripts that may run (`allowScripts`: only Prisma's), GitHub Actions are pinned to commit SHAs, and Dependabot, CodeQL, dependency review, secret scanning with push protection, and private vulnerability reporting are enabled for the repository. See `SECURITY.md` for the reporting process and the accepted development-tooling advisories.
- **Containers.** The image runs as the unprivileged `node` user from a digest-pinned base image; Compose drops all capabilities from the app and keeps uploaded files on a named volume.

## Production Operations

`compose.yaml` provides PostgreSQL, Redis, migration, application, and scheduled PostgreSQL backup services. Set non-empty `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `AUTH_SECRET`, and `METRICS_TOKEN` values in the deployment environment. Set `ALLOW_PUBLIC_REGISTRATION=true` only when public account creation is intended, and configure the password-recovery email variables before production launch. Then run:

```bash
docker compose up -d --build
```

The application uses Redis for atomic, distributed auth rate limits when `REDIS_URL` is configured. `GET /api/health/live` checks process liveness; `GET /api/health/ready` checks PostgreSQL and the configured rate-limit provider. `GET /api/metrics` requires `Authorization: Bearer $METRICS_TOKEN` and returns current record and dependency state for a monitoring collector.

Vercel cannot run the Docker Compose Redis or backup services. For Vercel, configure a managed Redis-compatible `REDIS_URL`, link a private Vercel Blob store, set `METRICS_TOKEN`, and use an external monitor to call `/api/health/ready`. Persisted user files use private Blob storage on Vercel and local disk in development. Supabase Free does not replace a tested backup and restore policy; export backups to independently retained storage before production use.

Set both `SITE_ACCESS_USERNAME` and `SITE_ACCESS_PASSWORD` to protect a private preview with HTTP Basic authentication. The protection fails closed when only one value is configured, and a production deployment with no gate at all answers `503` unless the owner has approved the public launch with `PUBLIC_LAUNCH=approved`. Readiness and liveness endpoints remain public so external monitors can verify the deployment.

The Vercel deployment must not be promoted until a managed Redis integration is connected and has supplied `REDIS_URL` to the Production environment. The repository's scheduled readiness workflow intentionally fails when `/api/health/ready` is not healthy; it does not replace an independently retained PostgreSQL backup or a restore drill.

The `postgres-backup` service writes a compressed PostgreSQL dump immediately after startup and then on `BACKUP_INTERVAL_SECONDS` (default: daily). It retains backups for `BACKUP_RETENTION_DAYS` (default: 14), and its healthcheck fails when the latest successful backup is stale. Restore drills must be performed against a separate database before treating a deployment as production-ready.

GitHub Actions runs on pull requests and pushes to `main`. The *Continuous verification* workflow has a fast `verify` job (type check, lint, unit and integration tests, production build, dependency audit) and an `e2e` matrix that runs the 37 Playwright projects in seven parallel groups, each with its own server, PostgreSQL, and Redis, so the suite finishes in the time of its slowest group. A separate `production-build` job builds the application and starts the real production server (private gate, Redis rate limits, enforced content security policy), then runs the CSP audit and the load and abuse test against it. The `review-pack` project only produces screenshots and is excluded. *CodeQL* analyses the code and the workflows, *Dependency review* blocks pull requests that add high-severity dependencies, and a separate scheduled workflow probes the public Vercel readiness endpoint every five minutes; a non-200 response makes it fail visibly. Configure managed Redis and the production environment variables before relying on a successful readiness check.

### Releasing to Vercel

The project is `jenan-pro-private`. `vercel-build` (`prisma generate && next build`) generates the Prisma client during the Vercel build because `generated/prisma` is not committed. Deploy a clean export of a commit rather than a working tree, so only tracked files are uploaded (`.vercelignore` additionally excludes `.env*`, local data, and test output). Deploy from this repository only; an older clone linked to the same project would replace the release with outdated code.

1. Apply pending migrations to the production database first; they are additive, so the running release keeps working. Run `prisma migrate status`, then `prisma migrate deploy`, with `DATABASE_URL` set to the Production `DATABASE_URL_UNPOOLED` value (pull it with `vercel env pull --environment=production` inside a temporary directory and delete the file afterwards).
2. Export the commit and link it: `git archive --format=tar --output=release.tar HEAD -- . ':(exclude)design-references' ':(exclude)tests'`, extract it into an empty directory, then `vercel link --yes --project jenan-pro-private`.
3. Stage the release without switching domains: `vercel deploy --prod --skip-domain --yes --logs`.
4. Verify the staged URL, which also works behind Deployment Protection: `vercel curl <url>/api/health/ready` must report `ready`.
5. Promote it with `vercel promote <url> --yes`. To roll back, promote the previous production deployment URL the same way.

The `PRODUCTION_READINESS_URL` repository variable is the address the scheduled readiness monitor probes; keep it pointed at the live domain's `/api/health/ready`.

### Official domain

The platform's official domain is **`jenanpro.sa`** (and `www.jenanpro.sa`, which redirects to it); it is defined once in `config/site.ts`. It is attached to the Vercel project and `NEXT_PUBLIC_APP_URL` is `https://jenanpro.sa` in Production, and a production deployment without that variable falls back to the same origin. The registrar's DNS (`pns01.t2.sa`, `pns02.t2.sa`) must carry `A @ 216.198.79.1`, `A @ 64.29.17.1` and `CNAME www a2cd6bf48c149688.vercel-dns-017.com.`; the site is also reachable on `jenan-pro-private.vercel.app` until they resolve. Once `https://jenanpro.sa/api/health/ready` answers, point the `PRODUCTION_READINESS_URL` repository variable at it.

### Attaching a custom domain

A `.sa` domain must first be registered through a SaudiNIC-accredited registrar (`whois.nic.net.sa` answers `No Match` until it is). Then:

1. Run `vercel domains add <domain> jenan-pro-private`, then `vercel domains verify <domain>` and create the DNS records it prints at the DNS provider (the apex `A` records and a `CNAME` for `www`), or delegate the nameservers to `ns1.vercel-dns.com` and `ns2.vercel-dns.com`. Add `www.<domain>` with a permanent redirect to the apex: `vercel api /v10/projects/jenan-pro-private/domains -X POST -f name=www.<domain> -f redirect=<domain> -F redirectStatusCode=308`. Vercel issues the HTTPS certificate by itself once the records resolve; a domain can be attached before it resolves.
2. Set `NEXT_PUBLIC_APP_URL` to `https://<domain>` in the Production environment and release again; it is used for OAuth redirect URIs, absolute links, and the metadata base (canonical and Open Graph URLs).
3. Register the new OAuth redirect URIs with Google and Apple and update `PRODUCTION_READINESS_URL`.
4. The site stays behind the private gate until the owner approves each step of the staged access below. E-mail (verification, recovery, invitations) needs `RESEND_API_KEY` and `MAIL_FROM`; follow [docs/email-setup.md](docs/email-setup.md).

### Staged access

The platform is opened in stages, and the owner approves each one:

1. **Private testing.** The gate covers every page and API except the health probes, so the home page, sign-in, registration, password recovery, and OAuth cannot be reached without the gate password. The first administrator is created with `npm run auth:bootstrap-super-admin`.
2. **Limited trial.** A small invited group is given access through the gate. Before inviting anyone: configure e-mail and run `npm run mail:check`, set `REQUIRE_EMAIL_VERIFICATION=true`, create the single Super Admin, and rotate the gate password (with the owner's approval). Hosting location is studied in [docs/region-migration-plan.md](docs/region-migration-plan.md).
3. **Public site with approval (owner decision, 2026-10-14).** Everyone can see the site and register, but **nobody signs in until the owner approves the account.** In Production: remove `SITE_ACCESS_USERNAME` and `SITE_ACCESS_PASSWORD`, set `PUBLIC_LAUNCH=approved`, `ALLOW_PUBLIC_REGISTRATION=true` and `REQUIRE_ACCOUNT_APPROVAL=true`, and release again. How it works:
   - Registration (password or Google/Apple) creates the account as `PENDING`, with no session. The panel says the request was received; nothing is mailed to the address the applicant typed.
   - Signing in with the right password answers "waiting for approval" (`PENDING_APPROVAL`); a wrong password or unknown address answers like any failed sign-in.
   - The owners are e-mailed about each new request (at most ten e-mails an hour) and see the waiting list, with **Approve** and **Decline** buttons, at `/admin/users`. Approving is atomic and audited, and e-mails the applicant a link to the sign-in page; declining suspends the account.
   - `REQUIRE_EMAIL_VERIFICATION` becomes required automatically at this stage, so an approved person still proves the address before inviting, publishing or paying.
   - Turning approval off (`REQUIRE_ACCOUNT_APPROVAL=false`) is an owner decision; see `SECURITY.md` (public exposure).

A deployment with neither a gate nor `PUBLIC_LAUNCH=approved`, such as a Vercel Preview, answers `503` instead of opening by accident.

## Next steps

1. Review domain terminology, tenancy rules, and authorization boundaries.
2. Select and implement the authentication/session strategy and password hasher.
3. Provision PostgreSQL, set `DATABASE_URL`, and create the reviewed initial migration.
4. Add validation, error handling, testing, and observability conventions.
5. Design product sections and deliver them as separately scoped phases.
