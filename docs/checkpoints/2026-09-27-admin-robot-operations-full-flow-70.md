# [70% BASELINE][PASS] Admin and Robot Operations Full Flow

## Implemented pages and routes

- The authoritative 80-route contract covers Admin, Robot Factory, Robot Academy, Robot Organization, Mission Control, Intelligence, Models and Tools, Finance, Observability, and Executive Reports.
- Existing exact Admin pages remain authoritative; scoped catch-all routes fill the missing operational pages without replacing working dashboards.
- Top-level operational routes use the same `ADMIN` / `SUPER_ADMIN` guard as `/admin/*`.
- A shared operational renderer supports command, list, matrix, queue, timeline, evidence, finance, registry, profile, and report views.
- The operations API provides path-scoped snapshots and audited commands for mission creation, candidate-batch creation, and robot information-request review.

## Functional and security QA

- All 80 declared pages return 200 for an administrator.
- All 80 declared pages return 403 for an authenticated ordinary user.
- Existing Admin acceptance remains green: 19 primary pages, protected APIs, robot creation/approval validation, and robot detail access.
- POST commands require platform-admin access, same-origin validation, strict Zod validation, and write an `AuditLog` entry.
- Data panels use explicit Prisma selections and bounded result sets.
- User-facing robot requests remain review-only and do not create tasks, model runs, evidence, or costs.
- Funding Eligibility remains absent from the route manifest and is not exposed by this work.

## Data truth and unavailable states

- Live sources include users, subscriptions, plans, RBAC, audit, organizations, robots, academy, missions, evidence, costs, learning, models, finance, queues, and sessions.
- Every panel declares `LIVE`, `PARTIAL`, or `UNAVAILABLE`; empty sources are not replaced with demo records.
- Mission dependency graphs and approval policies, shared-knowledge rollback, persisted model routing, per-tool permissions, structured tool-call logs, worker heartbeats, incident management, and backup/restore feeds remain explicitly unavailable.
- Revenue and cost views report recorded payments, ledger entries, and cost records only; no unsupported profitability claim is generated.

## Responsive and visual QA

- The shared operational UI uses the Jenan PRO premium dark visual family with compact command surfaces, source-state badges, metrics, forms, and responsive data tables.
- Representative pages from all ten groups render without browser errors or document overflow.
- `/missions` and `/missions/create` were inspected directly at desktop and mobile sizes.
- Automated responsive acceptance passed at 2560x1440, 1920x1080, 1440x900, 1366x768, 1280x800, 1024x1366, 820x1180, 430x932, 390x844, and 360x800.
- Approximate current visual fidelity: 72-76% for the shared operations family.

## Engineering checks

- Admin operations route contract: 2 tests passed; exactly 80 unique routes.
- Admin operations E2E: 5 tests passed, including all-route admin access, all-route user denial, representative rendering, ten viewports, source truth, and audited commands.
- Existing Admin control-panel E2E: 5 tests passed on a fresh fully migrated database.
- ESLint: passed.
- TypeScript: passed.
- Production build: passed (111 route entries generated).
- `git diff --check`: passed.
- Snyk Code is required by repository instructions but unavailable in the current tool environment; no dependencies were added.

## Environment and remaining differences

- The existing local `jenanbiz` Docker volume contains a historical failed migration (`20260828110000_add_project_intelligence_snapshots`). It was not reset or force-resolved.
- Acceptance was rerun safely against an isolated `jenanbiz_e2e` database with all 44 migrations applied.
- External worker, incident, backup, restore-drill, model-routing, and tool-governance providers are the remaining integration blockers for fully live versions of the explicitly unavailable panels.
- The 70% baseline intentionally uses one reusable operational visual system; later refinement may add route-specific charts, network diagrams, and print layouts after the external data contracts exist.