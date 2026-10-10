# Jenan PRO Complete Platform Execution Master

This file records the binding implementation rules supplied on 2026-09-26. The original archives and all extracted contents beside this file remain the detailed source of truth and must not be deleted or edited.

## Official Reference Library

Use all three packages as one library:

1. `Jenan_PRO_COMPLETE_PLATFORM_UI_BLUEPRINT.zip`
2. `Jenan_PRO_PAGE_BY_PAGE_UI_REFERENCES.zip`
3. `Jenan_PRO_ADMIN_INTELLIGENCE_ROBOT_OPERATIONS.zip`

Archives are stored under `archives/`; immutable extracted copies are under `extracted/`. Read `BROWSER_INDEX.html`, `spec.txt`, `PAGE_CATALOG.csv`, `route_manifest.json`, `MASTER_PAGE_MAP.md`, and package instructions before implementing each section.

Reference priority:

1. Newest approved Jenan PRO design.
2. Detailed page visual reference.
3. `reference.html`.
4. Page `spec.txt`.
5. General blueprint.

For the homepage, `APPROVED_HOME_REFERENCE/homepage.png` is the canonical single source of truth and overrides every older Home, landing, pre-entry, experimental, or alternate homepage reference. Production uses one homepage implementation at `/`; `/home` may only redirect to it. For Auth panels, `APPROVED_AUTH_REFERENCES/login.png` and `register.png` remain canonical. `/auth` and `/login` are sign-in, and `/register` is account creation. Password recovery and onboarding inherit the same visual DNA. Elements intentionally removed by prior product decisions must not return merely to match an older reference.

For the authenticated user homepage, `APPROVED_AUTHENTICATED_HOME_REFERENCE/authenticated-home.png` is the canonical visual source for `/dashboard`. It defines the post-login composition and must remain separate from the public homepage reference. Permanent product decisions still override legacy content shown inside the image, including the removed funding service and the prohibition on presenting demo market or opportunity values as live data.

For the user investment workspace, `APPROVED_USER_INVESTMENTS_REFERENCE/user-investments.png` is the canonical visual source for `/user/investments`. Preserve its investment-command composition while sourcing values from the authenticated user's records. Missing valuations, returns, market values, allocations, or opportunities must use explicit unavailable states rather than the sample numbers shown in the reference. Funding eligibility remains removed from navigation and content.

For the projects section home, `APPROVED_PROJECTS_REFERENCE/projects-home.png` is the canonical visual source for `/projects`. Preserve its city command scene, four primary project services, project statistics, sector distribution, outputs, recent projects, activity, and sector intelligence. All values must come from the authenticated user's project records or use explicit unavailable states. The funding eligibility navigation item visible in the historical reference remains permanently removed.

The four project subsection references under `APPROVED_PROJECT_SUBSECTION_REFERENCES/` are canonical for their section entry routes: `project-analysis.png` for `/projects/analysis`, `project-feasibility.png` for `/projects/feasibility`, `project-start.png` for `/projects/start`, and `project-evaluation.png` for `/projects/evaluation`. Implement and review them one at a time. Their sample scores, forecasts, budgets, maps, and recommendations are composition references only; production results must be calculated from submitted or persisted project data.

Within the feasibility subsection, `APPROVED_PROJECT_SUBSECTION_REFERENCES/project-feasibility-professional-flow.png` is the canonical visual source for the complete `/projects/feasibility/pro/*` workflow. It complements rather than replaces `project-feasibility.png`: the older image remains authoritative for choosing the simplified or professional study, while the professional-flow image governs general information, market and competitors, marketing, technical and operational planning, deterministic financial analysis, review, and the final report. Historical professional URLs remain compatibility surfaces that reuse this single workflow. Only persisted project inputs, disclosed external sources, and deterministic calculations may populate the result and report.

Within the project-analysis subsection, the six images under `APPROVED_PROJECT_SUBSECTION_REFERENCES/project-analysis/` are the canonical visual sources for the complete workflow: `project-analysis-input.png`, `project-analysis-progress.png`, `project-analysis-details.png`, `project-analysis-result.png`, `project-analysis-report.png`, and `project-analysis-export.png`. They complement the subsection entry reference and govern `/projects/analysis`, `/projects/analysis/new`, `/projects/analysis/progress`, `/projects/analysis/details`, `/projects/analysis/map`, `/projects/analysis/result`, `/projects/analysis/recommendations`, `/projects/analysis/report`, and `/projects/analysis/print`. Historical analysis URLs remain compatibility surfaces that reuse this single implementation. Sample market size, growth, opportunity, competition, purchasing-power, and risk values in the images are composition references only. Production must use persisted inputs and disclosed OpenStreetMap and World Bank records, label unavailable values and limitations explicitly, and never present evidence completeness as a probability of project success. Only implemented PDF download, browser print, and authenticated link-copy actions may be active.

Within the project-start subsection, the six images under `APPROVED_PROJECT_SUBSECTION_REFERENCES/project-start/` are the canonical visual sources for the complete workflow: `project-start-dashboard.png`, `project-start-data.png`, `project-start-licenses.png`, `project-start-budget.png`, `project-start-team-vendors.png`, and `project-start-timeline-launch.png`. They govern `/projects/start`, `/projects/start/new`, `/projects/start/licenses`, `/projects/start/setup`, `/projects/start/team`, `/projects/start/vendors`, `/projects/start/roadmap`, `/projects/start/launch`, and `/projects/start/report`. Historical project-start URLs remain compatibility surfaces that reuse this single implementation. Sample budgets, completion percentages, team members, suppliers, tasks, milestone dates, and readiness scores in the images are composition references only. Production must use persisted project inputs and deterministic calculations, label missing information explicitly, and prevent launch until the evaluation approval, financial plan, required launch-plan sections, prerequisite phases, compliance items, and high-risk controls satisfy the production gates.

Project evaluation is the first decision stage inside the project-start subsection, not a separate production service. The six images under `APPROVED_PROJECT_SUBSECTION_REFERENCES/project-evaluation/` are canonical for `/projects/start/evaluation`, `/projects/start/evaluation/new`, `/projects/start/evaluation/result`, `/projects/start/evaluation/risks`, `/projects/start/evaluation/recommendations`, and `/projects/start/evaluation/report`. The historical `/projects/evaluation` routes are compatibility aliases and must reuse the same implementation. Scores must come from the six persisted assessment records and their documented evidence, risks must come from the project risk register, recommendations must be deterministic, and approval remains a human decision gated by the financial plan and prerequisite phases.

For the job-seeker experience, the three top-level images under `APPROVED_TALENT_REFERENCES/` remain canonical for the primary surfaces: `job-seeker-dashboard.png` for `/talent`, `job-seeker-profile.png` for `/talent/profile`, and `job-seeker-jobs-applications.png` for `/talent/jobs`. The images under `APPROVED_TALENT_REFERENCES/job-seeker/` are canonical for their named child surfaces: saved jobs, application tracking, the complete multi-step application flow and its review, success, and rejection states, single-application detail and status timeline, CV upload and analysis, job recommendations, job detail, employer public profile, interviews and notifications, and messages with employers. Together they supersede every older job-seeker dashboard, profile, jobs, applications, pre-entry, and alternate candidate in the extracted archives. The job-seeker reference library now covers every primary navigation section and the required end-to-end child flows. The archives remain immutable historical material and must not be used to override these approved images. Use the approved Jenan PRO wordmark rather than the lotus symbol shown in the visual references. Sample employers, jobs, match scores, interview dates, saved jobs, profile details, and counts are composition references only; production must use persisted account records or explicit empty and unavailable states.

For the employer experience, `APPROVED_TALENT_REFERENCES/employer/employer-dashboard.png` is the only canonical visual source for the employer home at `/talent/employer`. It supersedes the previously supplied alternate employer dashboard and every legacy employer-home candidate in the extracted archives. The remaining top-level images in that employer folder are canonical only for their named child surfaces: job creation basics and requirements, job management, candidate search, global employment requests, saved-shortlists management, applicants, candidate profile, interviews, messages, candidate communication and interview scheduling, hiring pipeline, company profile, hiring settings, reports, and support. They must not replace or compete with the approved employer home. Older employer dashboard, job-management, and report compositions are preserved under `APPROVED_TALENT_REFERENCES/employer/superseded/` for historical comparison only and have no production authority. The employer reference library now covers every primary sidebar section and its required core child surfaces. The lotus symbol shown in these images remains excluded; production uses the approved Jenan PRO wordmark. Sample identities, companies, counts, conversion rates, hiring costs, charts, schedules, and recommendations are visual composition references only.

Legacy `Jenan BIZ` or `جنان بيز` names are visual-history references only. New UI uses `Jenan PRO` and `جنان برو` exclusively.

## Permanent Product Decisions

- Funding Eligibility is cancelled. Ignore funding pages in legacy manifests and remove all visible routes, navigation, cards, search, actions, reports, and links for it.
- Inspect dependencies before backend/schema cleanup. Never reset databases, remove production data, alter secrets, or replace core architecture for UI work.
- Keep Auth, Sessions, RBAC, rate limiting, audit, Prisma/data access, PostgreSQL, Redis, APIs, workers, and security controls intact unless fixing a verified defect.
- Reference screenshots are not production canvases. Build layouts with real React, CSS, SVG, forms, tables, charts, maps, and data.
- Never claim demo numbers are live. Label demo/placeholder/estimated data and show source, date, confidence, and review state where relevant.
- Deterministic totals, taxes, ROI, break-even, invoice totals, and financial formulas stay in deterministic code.
- Every visible action must work, navigate to a real route, or be explicitly disabled. Unsupported exports must not appear active.

## Design System

- Dark premium futuristic foundation.
- Deep navy and black-blue surfaces.
- Electric cyan and teal primary signals.
- Controlled emerald, gold, and purple accents.
- Glass depth, restrained glow, premium cards, clear hierarchy, strong typography, and professional business/data/AI presentation.
- Each section may have its own accent and visual emphasis while remaining in the Jenan PRO family.
- No stretching, distortion, `object-fit: fill` for important assets, overlap, unintended horizontal scrolling, clipped text, or large fixed-image gutters.
- Recompose by device priority. Use Grid, Flexbox, `minmax()`, `clamp()`, percentages, viewport units when justified, and content-driven breakpoints.

Required responsive checks: 2560x1440, 1920x1080, 1440x900, 1366x768, 1280x800, 1024x1366, 820x1180, 430x932, 390x844, and 360x800.

## Required User Flows

### Authentication and Home

- Auth gateway, login, registration, password recovery, and onboarding.
- Home with real navigation, opportunity/news states, platform statistics, distribution, trust strip, footer, and truthful unavailable states.

### User Center

- Account/dashboard, investment data and detail, voluntary social unlocks, payments, invoice, reports, notifications, and activity.
- Social unlocks must follow platform policies. Use official APIs only where allowed; otherwise use claim/manual/periodic verification. Never use bots or fake followers.

### Projects

- Hub, project creation, processing/progress, result, details, indicators, geographic intelligence, risks, recommendations, final report, print/PDF/share/email when genuinely supported.
- Include project analysis, evaluation, launch, and exactly two feasibility types: simplified and professional detailed.
- Professional feasibility may include market, financial, technical, operational, SWOT, risk, sensitivity, break-even, ROI/NPV/IRR, timeline, executive summary, and final report when supported by real inputs.

### User Academy

- Academy, courses, course details, lessons, player, attachments/notes, quiz, result, completion, and certificate.
- Webinars with details, registration, and live/recorded content.
- Studies with list/detail/reader; research with list/detail/sources; learning paths with progress; certificates with verification and supported print/PDF/share.
- The visual authority for the Academy is `APPROVED_ACADEMY_REFERENCES/academy-primary-board.png`. The two `academy-complementary-board-*.png` files extend route and state coverage where the primary board does not show a screen.
- Academy supplemental production routes include `/academy/sections`, `/academy/section/business`, `/academy/journey`, `/academy/assessments`, `/academy/certificates`, `/academy/downloads`, `/academy/community`, `/academy/search`, and `/academy/profile`. They reuse the live course, approved resource, engagement, assessment, and certificate registries; unavailable community or media providers must remain explicit.

### Jenan Market

- Buyer: listings, detail, NDA/confidentiality, protected details, documents, viewing request, offer, negotiation/deal stages, closing, and report.
- Seller: create listing, basic/financial/asset information, media, documents, confidentiality, preview, review, publish, and inquiry/offer management.
- Never expose confidential data before required confidentiality steps.

### Tools and Jenan Software

- Tools: Jenan PDF, Docs, Sheets, Presentations, logo/branding, letterhead, CV builder, and history/versioning where supported.
- Jenan Software: Sales, Accounting, HR, Inventory, CRM, Project Management, POS, Purchases, Invoices, Company Management, and Reports.
- Sales includes customers, quotations, sales orders, invoices, receipts, products, returns, discounts, taxes, and reports.
- HR includes employees, profiles, attendance, leave, payroll, performance, and reports.
- Do not leave these as card-only shells.

### Talent and Jobs

- Job seeker: jobs, detail, apply, profile, CV, and application status.
- Employer: dashboard, create job, applicants, candidate detail, matching, pipeline, and reports.
- The current baseline covers the complete approved job-seeker and employer route libraries, including saved jobs, application detail, interviews, messages, company profiles, employment requests, shortlists, hiring settings, and support. Employer shortlists, company data, hiring preferences, interviews, and support tickets use persisted records and ownership checks; discoverable profiles remain consent-scoped.
- Acceptance must validate the loaded interface rather than the initial loading shell, exercise the persisted end-to-end hiring flow, and check every employer route at the required desktop, laptop, tablet, and mobile widths without horizontal page overflow.
- Include talent search and matching. Never promise guaranteed employment.

### Marketing

- Dashboard, campaigns, create flow, campaign detail, channels, audience, leads, analytics, and performance report.
- Display actual campaign outputs only when sourced.

### Jenan Robotics

- User-facing robotics search, results, item detail, and recommendations where specified by page references.

## Required Admin and Intelligence Flows

### Admin Command Center

- Users, subscriptions, services, RBAC, audit, platform activity, costs, revenue, system health, operations, and reports.

### Robot Factory

- Dashboard, batch creation, registry, batch detail, generation/selection rules, robot registry, and persistent individual robot profiles.
- Runtime workers are allocated on demand; do not create permanent workers without need.

### Robot Academy

- Dashboard, batches, batch detail, curriculum, theory, practical training, exams, results, review, graduation, intelligence, department distribution, failures/exclusions, retraining, skill matrix, specializations, geography, and reports.
- Cover current disciplines including programming, design, interaction, marketing, advertising, investment, e-commerce, contracting, maintenance/operations, food sectors, and engineering.

### Robot Organization

- Workers, supervisors, managers, the 50-robot Supreme Intelligence Committee, committee review, and escalations.
- Escalation is risk-based; not every task passes through every level.

### Mission Engine

- Mission Control, create, queue, detail, subtasks, dependencies, retries, fallbacks, approvals, escalations, evidence pack, cost, and reports.
- Mission records carry objective, department, priority, SLA, assignee, model, tools, dependencies, attempts, evidence, cost, status, logs, and output where applicable.
- Preserve idempotency, concurrency controls, locks, retry policies, fallbacks, and queue state.

### Intelligence Center

- Shared knowledge, experiences, skills, learning logs, evidence, reviews, versions, and rollback.
- Knowledge requiring verification carries source, date, evidence, confidence, version, and review state.

### Model and Tool Registries

- Model registry/detail/provider/capabilities/status/cost/latency/quality/routing/fallback/execution history.
- Routing balances task type, quality, cost, risk, availability, and latency rather than always choosing the strongest model.
- Tool registry/detail/permissions/execution history/risk rules with least privilege and approval requirements.

### Revenue, Cost, Observability, and Reports

- Revenue dashboard and period/service views; cost dashboard, AI/model/infrastructure/tool/worker/mission costs, service profitability, cost ledger, and finance reports.
- Show daily/monthly revenue, cost by model/mission/department, top revenue/cost services, and margin only when data is sufficient.
- Observability includes workers, queues, health, logs, alerts/incidents, database, Redis, APIs, backups, restore-drill state, and metrics.
- Executive reports include platform, robot performance, robot academy, missions, intelligence, finance, and system health, with print/export layouts distinct from dashboards.

## UI State and Acceptance Rules

Every applicable page includes loading, empty, success, error, permission-denied, disabled, processing, completed, and failed states. Reuse shared components rather than cloning headers, navigation, controls, cards, tables, chart wrappers, report actions, modals, and state treatments.

Current delivery target is a strong, stable 60-70% baseline for each complete section. Do not chase pixel perfection until every section flow exists. For each section:

1. Inspect existing code and improve rather than rebuild without cause.
2. Complete all child pages and the full service flow.
3. Run functional QA.
4. Run responsive QA.
5. Compare implementation beside the reference.
6. Reach approximately 70% visual direction fidelity.
7. Run lint, typecheck, relevant unit/integration/E2E tests, build, and route checks.
8. Commit with a clear `[70% BASELINE][PASS] ... Full Flow` message.
9. Preserve the same approved version in the repository and local desktop project copy.
10. Report pages, routes, functionality, QA results, approximate visual match, remaining differences, checks, commit, archive status, and blockers.

This acceptance and closure policy applies to every platform section without exception. After the gate passes, the section commit is pushed, and local and remote hashes match, record the section as an accepted, closed baseline and continue to the next section. Later product requests may raise visual fidelity, performance, accessibility, efficiency, or add features as focused versioned improvements; those future opportunities do not make the accepted baseline incomplete and must not trigger an unrequested rebuild. Reopen a closed section only for a verified regression or an explicit new product decision.

Recommended implementation order: Auth/Register, Home, User Dashboard, Projects, Academy, Jenan Market, Tools, Jenan Software, Talent/Jobs, Marketing, user-facing Robotics, Admin, Robot Factory, Robot Academy, Robot Organization, Mission Control, Intelligence Center, Models/Tools, Revenue & Costs, Observability, and Reports.
