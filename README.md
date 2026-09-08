# Jenan BIZ Core

Production-oriented foundation and visual application shell for Jenan BIZ. Core workflows cover internal tools, AI Gateway execution, organization programs, academy learning, projects, market listings, talent, notifications, and local file storage. Real payments, external authentication providers, and third-party channel integrations remain separately configurable.

## Requirements and startup

- Node.js 20.9 or newer
- npm 10 or newer
- Docker Desktop with PostgreSQL 18 through `compose.yaml`

```bash
npm install
npm run db:setup-env
docker compose up -d postgres
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`. `.env.example` contains placeholders only; never commit real secrets.

Quality commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run format:check`, `npm run prisma:validate`, and `npm run build`.

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

Authenticated visual shells include Dashboard, Projects, Academy, Studio, Talent, Market, Software, Jenan Robotics, Funding Eligibility, Marketing, Account, Pricing, and Benefits. Administrative shells include Command, Data Center, Global Health, Bounty Hunters, and Social Growth. These routes intentionally show explicit empty, unavailable, or concept states instead of fabricated operational data.

- `/software/robotics` is the Jenan Robotics visual catalog. Purchasing, renting, quotations, media, availability, and specifications are not active.
- `/funding-eligibility` is an informational eligibility shell. It does not calculate a financial decision or submit an application.
- `/admin/bounty-hunters` presents the Evolution Command Center and Jenan Collective Intelligence Core concept without running agents or an intelligence engine.

## Architecture notes

Arabic and English dictionaries are included. Locale resolution checks a `locale` cookie, then `Accept-Language`, defaulting to Arabic; the root layout applies matching `lang` and `dir` attributes. Locale-prefixed routing can be added after navigation requirements are finalized.

Authentication uses PostgreSQL-backed users and sessions. Passwords are hashed with Argon2id, opaque session tokens are stored only as SHA-256 hashes, and the browser receives an HttpOnly/SameSite cookie. Register, login, and logout are exposed through same-origin API routes. OAuth is intentionally not implemented.

Public registration is closed by default when `NODE_ENV=production`. Administrators provision or approve production users through authorized workflows. Only set `ALLOW_PUBLIC_REGISTRATION=true` when a reviewed public onboarding flow is intentionally enabled.

`/dashboard` requires an authenticated session. `/admin` additionally requires the `ADMIN` or `SUPER_ADMIN` platform role. Organization membership permissions are resolved from persisted roles and permissions.

The Prisma schema models identity, multi-tenant organizations, RBAC, sessions, notifications, auditing, community-access grants, plan/subscription/payment records, and file metadata. Payment models are structural only. PostgreSQL runs locally through `compose.yaml` with a persistent volume and healthcheck.

## Community Access

Academy, software, and talent can use a free community-access entitlement in their UI. The backend supports Facebook, Instagram, TikTok, YouTube, Snapchat, and X through `GET` and `POST /api/community-access`. Administrators manage approved HTTPS profile links through `GET` and `POST /api/admin/social-links`; active links are available platform-wide through `GET /api/platform/social-links`.

The access grant is based on a clear user acknowledgement after opening a configured link. It does not claim to automatically verify a follow or subscription, because the social networks do not expose that verification consistently. The UI should state this plainly and keep ordinary account access available when no approved channel is configured.

## User Dashboard Data

`GET /api/dashboard` returns the authenticated user's private dashboard data. Its metrics are computed from persisted records, not UI lists: projects, organization memberships, open market and job requests, funding assessments, learning progress, services, files, unread notifications, and community access. `recentActivity` contains only the authenticated user's audit events. The existing dashboard UI can consume this endpoint without exposing another user's records.

Integration tests use the real local PostgreSQL database and clean up their records:

```bash
npm run test:integration
```

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

The authentication E2E suite exercises real registration, login failure and success, logout, protected dashboard access, USER denial from `/admin`, and ADMIN access. Run-scoped users are deleted in global teardown, including failure runs that reach teardown. Do not run E2E against a shared production database.

## Initial SUPER_ADMIN bootstrap

The first `SUPER_ADMIN` is created by a server-side CLI only; there is no HTTP endpoint. Supply `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, and optional profile variables through the runtime environment, then run:

```bash
npm run auth:bootstrap-super-admin
```

Never place real values in Git. The command uses Argon2id, a serializable PostgreSQL transaction, and an advisory transaction lock. It refuses to run when any `SUPER_ADMIN` already exists or when the requested email is already assigned, and writes `super_admin.bootstrapped` to `AuditLog`. Any later SUPER_ADMIN creation must use a separately authorized administrative workflow.

## Authentication rate limiting

`login` and `register` use a vendor-neutral `RateLimitProvider` contract. Development and tests default to the documented in-memory adapter. That adapter is process-local and is not suitable for production or multi-server deployments. Production fails closed until application startup supplies a distributed provider implementing atomic increment and expiry semantics; Redis or another distributed store can be integrated later without changing the auth routes.

## Security posture

Session cookies are HttpOnly, SameSite=Lax, scoped to `/`, and Secure in production. Opaque session values are never stored directly in PostgreSQL, sessions have explicit expiry and are deleted on logout or expiry, passwords use Argon2id, validation is server-side, duplicate emails return a conflict, invalid login paths perform password verification against a dummy Argon2id hash, RBAC is enforced in server components, and security-relevant auth actions are audited without passwords or tokens.

## Production Operations

`compose.yaml` provides PostgreSQL, Redis, migration, application, and scheduled PostgreSQL backup services. Set non-empty `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `AUTH_SECRET`, and `METRICS_TOKEN` values in the deployment environment, then run:

```bash
docker compose up -d --build
```

The application uses Redis for atomic, distributed auth rate limits when `REDIS_URL` is configured. `GET /api/health/live` checks process liveness; `GET /api/health/ready` checks PostgreSQL and the configured rate-limit provider. `GET /api/metrics` requires `Authorization: Bearer $METRICS_TOKEN` and returns current record and dependency state for a monitoring collector.

Vercel cannot run the Docker Compose Redis or backup services. For Vercel, configure a managed Redis-compatible `REDIS_URL`, set `METRICS_TOKEN`, and use an external monitor to call `/api/health/ready`. Supabase Free does not replace a tested backup and restore policy; export backups to independently retained storage before production use.

The Vercel deployment must not be promoted until a managed Redis integration is connected and has supplied `REDIS_URL` to the Production environment. The repository's scheduled readiness workflow intentionally fails when `/api/health/ready` is not healthy; it does not replace an independently retained PostgreSQL backup or a restore drill.

The `postgres-backup` service writes a compressed PostgreSQL dump immediately after startup and then on `BACKUP_INTERVAL_SECONDS` (default: daily). It retains backups for `BACKUP_RETENTION_DAYS` (default: 14), and its healthcheck fails when the latest successful backup is stale. Restore drills must be performed against a separate database before treating a deployment as production-ready.

GitHub Actions runs type checking, linting, Prisma migrations, tests, and a production build for pull requests and pushes to `main`. A separate scheduled workflow probes the public Vercel readiness endpoint every five minutes; a non-200 response makes the workflow fail visibly. These workflows become active after this change is committed and pushed. Configure managed Redis and the production environment variables before relying on a successful readiness check.

## Next steps

1. Review domain terminology, tenancy rules, and authorization boundaries.
2. Select and implement the authentication/session strategy and password hasher.
3. Provision PostgreSQL, set `DATABASE_URL`, and create the reviewed initial migration.
4. Add validation, error handling, testing, and observability conventions.
5. Design product sections and deliver them as separately scoped phases.
