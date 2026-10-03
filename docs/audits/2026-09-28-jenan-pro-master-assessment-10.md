# Jenan PRO Master Assessment — 10/10 Standard

Date: 2026-09-28

## Scope and scoring method

- Scope: the current local product, including 152 active legacy screens, 80 Admin/Robot Operations screens, supplemental Programs pages, shared reports, and the current uncommitted Studio upgrade.
- Funding Eligibility is permanently excluded and remains a required 404 surface.
- Scores reflect usable product quality, not route count, code volume, or passing tests.
- Overall is bottleneck-sensitive: a critical provider, legal, accuracy, or operational gap caps the score even when the UI is polished.
- A test pass proves a contract; it does not prove clarity, usefulness, visual distinction, or production readiness.
- No service is currently rated 10/10.

Classification legend:

- `RF`: READY FOR 10/10 REFINEMENT
- `FW`: NEEDS FUNCTIONAL WORK
- `DA`: NEEDS ACCURACY / DATA WORK
- `UX`: NEEDS UX SIMPLIFICATION
- `VR`: NEEDS VISUAL REFINEMENT
- `PH`: NEEDS PRODUCTION HARDENING
- `BI`: BLOCKED BY EXTERNAL INTEGRATION

## Platform verdict

| Overall | Functional | Accuracy | UX / Simplicity | Visual | Production | Verdict |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 6.4 | 7.1 | 7.4 | 6.2 | 6.8 | 5.1 | Strong closed-pilot foundation; not yet a globally competitive production release. |

The strongest current qualities are truthful unavailable states, deterministic project/program calculations, database-backed workflows, access control, route coverage, RTL responsiveness, and the newly completed Projects, Academy, and Market journeys. The primary release blockers are external email/payment/backup/monitoring providers, a real queue consumer, regional ERP compliance, broad Admin UX, and unresolved dependency-security debt.

### Post-assessment implementation delta — 2026-09-28

The ranked scores below remain the original cross-platform snapshot so the 136-row ordering stays comparable. Current Studio implementation has since closed its HyperFormula and MuPDF licensing blockers, added permissive formula evaluation and secure rasterized redaction, completed PDF preview/order/status, multi-condition Sheets filters and KPI, Presentation themes/charts/images, and Docs images/header/footer/page styles. Jenan Software has since added operational P&L/balance/cash-flow views, safe CSV outputs, Inventory/CRM analytics, sourced Projects/POS/Purchases summaries, persistent branches/settings, six domain reports, and two applied migrations. Talent has since added multi-dimensional discovery/applicant filters, benefits/conditions, required screening questions with answer snapshots, privacy-safe Excel reporting and participant-only audited messaging. These sections pass lint, typecheck, focused tests, full E2E workflows, production build and all ten responsive viewports; a full-platform re-score should be performed after the remaining sections are upgraded.

## Master Assessment — lowest maturity to highest

| # | Section / service | O | F | A | UX | V | P | Classification | Exact blocker and 10/10 action |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | Platform / production email delivery | 2.5 | 2.0 | 7.0 | 3.0 | 5.0 | 1.0 | BI, PH | Only provider contracts and `PENDING_PROVIDER` outbox exist. Connect an approved provider, retries, bounce/complaint handling, templates, delivery telemetry, and recovery/report E2E. Do not show “sent” before provider confirmation. |
| 2 | Platform / payment collection and subscription enforcement | 2.8 | 2.0 | 6.5 | 3.5 | 4.5 | 2.0 | BI, FW, PH | Payments are records, not a complete collection flow; subscription status is not a universal entitlement gate. Add provider checkout/webhooks/idempotency/refunds/tax evidence, then enforce plan access. Hide upgrade CTAs until this exists. |
| 3 | Platform / external backup and real restore | 3.0 | 3.0 | 6.5 | 3.5 | 4.0 | 2.0 | BI, PH | Backup and restore-drill records exist, but no approved off-host storage and proven restore environment. Add encrypted immutable backup, retention, restore automation, RPO/RTO evidence, and disaster runbook. |
| 4 | User Center / investments and investment detail | 3.2 | 2.5 | 7.5 | 4.0 | 5.5 | 2.0 | BI, FW, DA | Truthful `NOT_CONNECTED` state, but no portfolio provider, holdings, returns, allocation, or risk computation. Add a provider connection/revocation flow and sourced calculations; otherwise hide detail/report navigation. |
| 5 | Supplemental / Pricing | 3.4 | 2.0 | 8.0 | 4.0 | 5.5 | 2.5 | FW, BI | Correctly says `NOT_PUBLISHED`, but offers no purchasable plan. Publish only approved Plan records after payment integration; until then remove Pricing from primary conversion paths rather than presenting an empty commercial page. |
| 6 | Platform / external monitoring and APM | 3.6 | 3.5 | 7.0 | 4.5 | 4.5 | 2.5 | BI, PH | Health/log/alert schemas are internal only. Connect metrics, traces, error aggregation, retention, alert routing, SLOs, and on-call ownership. |
| 7 | Robot Factory / genetics and autonomous selection | 3.8 | 2.5 | 4.5 | 3.0 | 4.0 | 3.0 | FW, DA, UX, VR | Capability/genome data exists but no safe generation policy editor, simulation, comparison, or explainable selection. Hide the route from routine operators until policy review and rollback exist. |
| 8 | Mission Engine / executive reports | 4.0 | 2.5 | 5.5 | 4.0 | 5.0 | 2.5 | FW, DA, VR | Generic panels, no success-rate, duration, retry, fallback, evidence-quality, or cost trend report. Build a sourced operational report or remove the report-center label. |
| 9 | Admin Finance / reports | 4.0 | 2.5 | 5.5 | 3.5 | 5.0 | 2.5 | FW, DA, VR | No complete P&L, period comparison, allocation, reconciliation, or export workflow. Do not call raw payment/cost rows a finance report. |
| 10 | Observability / executive reports | 4.0 | 2.5 | 5.0 | 3.5 | 4.5 | 2.5 | FW, DA, BI | Current aggregates lack time-series history and external monitoring truth. Add SLO/error-budget/incident/queue/restore trends after provider integration. |
| 11 | Admin Finance / service profitability | 4.1 | 3.0 | 4.0 | 4.0 | 5.0 | 3.0 | FW, DA | Revenue is not reliably attributed to service/mission/model, so margin is incomplete. Define allocation rules, explain assumptions, and add reconciliation tests. Hide profitability rankings until attribution is complete. |
| 12 | Academy / live webinars | 4.2 | 4.0 | 8.0 | 5.0 | 6.5 | 2.5 | BI | Catalog, registration, engagement and truthful stream state exist; real live/recorded media is provider-dependent. Add approved stream lifecycle, attendance, replay, moderation, and failure fallback. |
| 13 | Marketing / external channels and attribution | 4.2 | 3.0 | 8.0 | 5.0 | 6.0 | 2.5 | BI, DA | Internal campaigns/leads work, while reach, clicks, impressions, CAC and ROAS remain unavailable. Connect channel APIs with attribution windows and source timestamps; never infer these from leads alone. |
| 14 | Admin shared / generic operation renderer | 4.3 | 5.0 | 7.0 | 3.0 | 3.5 | 4.0 | UX, VR, FW | One table renderer serves most of 80 routes. Replace it section-by-section with task-specific views, filters, drill-down, charts, confirmations and role-aware actions. Delete duplicate raw panels after each replacement. |
| 15 | Robot Academy / reports | 4.4 | 3.0 | 5.5 | 4.0 | 5.0 | 3.0 | FW, DA, VR | Needs cohort funnel, pass/fail causes, skill distribution, retraining efficacy and source dates. Generic tables are not a report center. |
| 16 | Robot Organization / hierarchy | 4.4 | 4.0 | 5.5 | 3.5 | 4.5 | 3.5 | FW, UX, VR | Workers/supervisors/managers are filtered lists, not an operable hierarchy. Add explicit role assignment, org graph, capacity, promotion/demotion audit and conflict checks. |
| 17 | Robot Organization / Supreme Committee | 4.4 | 3.5 | 5.5 | 3.5 | 4.5 | 3.5 | FW, UX, VR | Review records exist without a clear quorum/vote/override workflow. Simplify to a review queue until voting rules, rationale and audit are enforced. |
| 18 | Tool Governance / execution approvals | 4.5 | 4.0 | 6.0 | 4.0 | 5.0 | 3.5 | FW, PH | Least-privilege service logic is stronger than its UI. Add per-execution approval, reason, expiry, scope display and denial history; enforce permissions at every handler. |
| 19 | Shared reports / email outbox | 4.5 | 6.0 | 8.0 | 5.5 | 5.5 | 2.0 | BI, PH | Persistent traceable requests correctly remain `PENDING_PROVIDER`. Add worker, retry/backoff, provider receipt, bounce state and cancellation; never equate queued with sent. |
| 20 | Robot Factory / batch creation and lifecycle | 4.6 | 4.5 | 5.5 | 4.0 | 4.5 | 4.0 | FW, UX, VR | Batch creation is a basic form and list. Add requirement templates, preview, member roster, progress/errors, cancellation and deterministic selection explanation. |
| 21 | Robot Academy / curriculum and theory | 4.6 | 4.0 | 6.0 | 4.0 | 4.5 | 4.0 | FW, UX, VR | Data exists, but curriculum is a table. Add prerequisite graph, sequencing conflicts, version comparison and content approval. Hide generic “learning” panels that add no action. |
| 22 | Robot Academy / graduation, elimination and retraining | 4.6 | 4.0 | 5.5 | 4.0 | 4.5 | 4.0 | FW, DA, UX | Status lists lack reasons, appeal, remediation plan and re-entry criteria. Require evidence and human approval for irreversible outcomes. |
| 23 | Observability / backups and restore drills | 4.6 | 4.5 | 6.0 | 4.5 | 5.0 | 3.0 | BI, PH | Internal records/actions work; real restore remains external. Show only verifiable backup freshness and drill evidence, never a green state from a record alone. |
| 24 | User Center / voluntary social unlocks | 4.8 | 5.0 | 7.0 | 5.0 | 6.0 | 3.5 | UX, BI | Manual acknowledgement is honest but weak evidence and limited user value. Either connect approved verification or simplify to ordinary optional community links; remove “verify” wording when only self-attestation occurs. |
| 25 | Admin / subscriptions and plans | 4.8 | 4.0 | 6.0 | 3.5 | 4.5 | 4.0 | FW, UX, BI | Mostly read-only and not connected to billing lifecycle. Add plan editor, entitlement preview, proration/cancel rules and webhook status, or keep it admin-read-only and remove mutation expectations. |
| 26 | Admin / services and RBAC matrix | 4.8 | 4.0 | 6.5 | 3.5 | 4.0 | 4.0 | FW, UX, PH | Matrix is rendered as rows; scoped permissions are not consistently visible/enforced. Add role templates, diff preview, least-privilege warnings, affected-user count and rollback. |
| 27 | Admin Finance / ledger | 4.8 | 4.5 | 6.0 | 4.0 | 5.0 | 4.0 | FW, DA, UX | Raw financial/cost records lack reconciliation, account taxonomy, period closing and correction/reversal. Keep deterministic totals, but do not present this as accounting-grade ledger yet. |
| 28 | Robot Academy / practical labs and sandbox | 4.8 | 4.5 | 7.0 | 4.0 | 4.5 | 3.0 | BI, FW, UX | Queue/sandbox boundaries are real; AI-dependent runs remain provider-blocked. Add run console, resource limits, evidence, timeout/cancel and provider failure state. |
| 29 | Robot Organization / escalations | 4.8 | 4.5 | 6.0 | 4.0 | 4.5 | 4.0 | FW, UX | Escalation view overuses information requests and lacks routing policy, owner, SLA, reason and resolution trail. Consolidate duplicate escalation surfaces. |
| 30 | Admin / executive reports | 4.8 | 4.0 | 6.0 | 4.0 | 5.0 | 3.5 | FW, DA, VR | Robot/academy/mission/intelligence/finance/system report routes exist but mostly reuse raw panels. Build separate sourced documents with period comparison and supported outputs. |
| 31 | Platform / managed Redis and multi-instance behavior | 4.9 | 6.0 | 8.0 | 6.0 | 5.0 | 3.0 | BI, PH | Redis adapter exists and production fails closed if absent, but HA/failover/load tests are missing. Make provider mandatory and test multi-instance rate-limit consistency. |
| 32 | Marketing / analytics | 5.0 | 5.0 | 7.5 | 5.5 | 6.0 | 3.5 | BI, DA | Internal conversion/pipeline metrics are usable; channel metrics are correctly unavailable. Separate internal funnel and external media performance more clearly and show formula/source tooltips. |
| 33 | Robotics / pricing and budget compatibility | 5.0 | 3.5 | 8.0 | 5.5 | 6.5 | 3.0 | BI, DA | Public profiles are sanitized and honest; pricing compatibility cannot work without a pricing/provider contract. Remove optional budget emphasis until pricing exists, or label it strictly as request context. |
| 34 | Shared reports / portfolio and investment | 5.0 | 4.0 | 8.5 | 5.5 | 6.5 | 3.5 | BI, DA | Correctly refuses invented data. Connect portfolio source or keep these as explicit status pages; do not advertise them as generated reports. |
| 35 | Robot Academy / specializations and geography | 5.0 | 5.0 | 6.5 | 4.5 | 5.0 | 4.0 | FW, UX, VR | Taxonomy and geography records exist without graph/map editing or proficiency evidence. Add prerequisite validation and map only when coordinates are sourced. |
| 36 | Intelligence / skills registry | 5.0 | 5.0 | 6.5 | 4.5 | 5.0 | 4.0 | FW, UX, VR | Skills/prerequisites exist but are mostly read-only. Add prerequisite editor, assignment evidence, deprecation and impact analysis. |
| 37 | Admin Finance / revenue | 5.0 | 5.0 | 6.5 | 4.5 | 5.0 | 4.0 | BI, DA | Payment records are real but not a complete revenue ledger. Add recognition period, refunds, currency normalization, provider settlement and tax treatment. |
| 38 | Platform / notifications | 5.1 | 4.5 | 6.5 | 5.5 | 5.0 | 4.0 | FW, PH | In-app records cover few events; no preferences, read-state center, digest, push/email or retry. Consolidate notification taxonomy before adding channels. |
| 39 | Admin / users | 5.2 | 5.0 | 7.0 | 4.0 | 4.5 | 4.5 | FW, UX, VR | Real users/roles appear, but search, pagination, bulk actions, disable/reactivate reasoning and membership drill-down are weak or absent. |
| 40 | Admin / audit | 5.2 | 5.0 | 7.5 | 4.0 | 4.5 | 4.5 | UX, VR, PH | Audit records are valuable, but raw rows lack actor/entity/action/date filters, metadata diff, export and retention policy. Simplify columns and add investigation flow. |
| 41 | Models / execution history | 5.2 | 4.5 | 6.5 | 4.5 | 5.0 | 4.0 | FW, DA, VR | Stores tokens/latency/cost/quality/error, but lacks replay, trace drill-down, source request link and aggregate comparisons. Provider execution remains external. |
| 42 | Observability / health and logs | 5.2 | 5.5 | 6.5 | 4.5 | 5.0 | 4.0 | BI, UX, PH | Useful internal snapshot, no historical graph/query/correlation/retention. Replace large tables with service health summary and trace-first drill-down. |
| 43 | Intelligence / experiences, learning logs and evidence | 5.2 | 5.0 | 6.5 | 4.5 | 5.0 | 4.5 | FW, UX, DA | Mission-linked records exist but experience is conflated with knowledge. Define separate learning outcomes, evidence lineage, robot/mission drill-down and trend visualization. |
| 44 | Marketing / performance report | 5.3 | 5.0 | 7.5 | 5.5 | 6.0 | 4.0 | BI, DA | Printable and source-aware, but cannot be decision-grade until channel attribution and spend reconciliation are connected. Hide unsupported ROI claims. |
| 45 | Software HR / payroll | 5.3 | 6.0 | 4.5 | 6.0 | 6.5 | 4.5 | DA, PH | Deterministic records are not country-compliant payroll. Add jurisdiction/versioned tax, benefits, GOSI/social insurance, approval and payslip rules; label current output operational, not statutory. |
| 46 | Software / POS | 5.3 | 5.5 | 6.0 | 5.5 | 6.0 | 4.5 | FW, PH | Branch-linked shifts, payments and currency-safe cash reconciliation now work. Hardware, offline sync, payment terminal, POS returns and receipt/fiscal-device compliance remain production blockers; hide POS where fiscal certification is required. |
| 47 | Robot Academy / dashboard and batches | 5.3 | 6.0 | 6.5 | 4.5 | 5.0 | 4.5 | UX, VR, FW | Rich persisted panels but table-heavy. Add cohort timeline, capacity, queue exceptions, batch drill-down and focused operator actions. |
| 48 | Admin Finance / costs and AI costs | 5.3 | 5.5 | 6.5 | 4.5 | 5.0 | 4.5 | DA, UX | Mission/model/token costs persist; infrastructure/tool/worker allocation and budget variance are incomplete. Add source invoice and cost-center mapping. |
| 49 | Programs / fleet | 5.4 | 6.0 | 7.0 | 5.5 | 6.0 | 4.5 | FW, UX | Vehicle CRUD/status works; missing maintenance history, assignment, odometer, insurance and telemetry. Do not add decorative live maps before a real GPS source. |
| 50 | Programs / field operations | 5.5 | 6.5 | 7.0 | 5.5 | 6.0 | 4.5 | FW, UX | Assignments/status work; missing due date, priority, evidence, comments, location and offline/mobile workflow. Add only fields that drive SLA and proof. |
| 51 | Software / inventory | 5.5 | 6.0 | 5.5 | 5.5 | 6.0 | 4.5 | FW, DA | Quantities, movements, cost-value summary, reorder review, count recency and CSV now work. Add branch locations/bins, reservations, valuation method/version, transfer workflow and landed-cost accounting; keep profit language disabled. |
| 52 | Robot Academy / exams and results | 5.5 | 5.5 | 6.5 | 5.0 | 5.0 | 4.5 | FW, UX, DA | Exam/result records exist, but authoring/review/appeal and result explanation are weak. Reuse server-graded question governance from user Academy. |
| 53 | Software / purchases | 5.6 | 6.0 | 5.5 | 5.5 | 6.0 | 5.0 | FW, DA | Supplier master, purchase orders, receiving, inventory posting, financial posting, currency summaries and overdue review work. Approval, supplier invoice/AP ledger, three-way matching, settlement and landed cost remain required for procurement-grade use. |
| 54 | Auth / password recovery | 5.6 | 6.5 | 8.0 | 6.5 | 7.0 | 3.5 | BI, PH | Token lifecycle and anti-enumeration are solid; actual delivery is blocked by email provider. Development code must remain non-production only. |
| 55 | Platform / file storage | 5.6 | 7.0 | 7.5 | 6.5 | 5.0 | 4.0 | BI, PH | Ownership/checksum/type limits exist, but storage is local with no malware scan, quota, retention, encryption/key policy or cloud replication. |
| 56 | Supplemental / Benefits | 5.6 | 4.5 | 8.0 | 6.0 | 6.0 | 4.5 | UX, VR | Honest informational page but not an authoritative product workspace. Either make it a concise sourced capability index or remove it from primary navigation; avoid marketing filler. |
| 57 | Robot Factory / registry and robot profile | 5.6 | 6.0 | 7.0 | 5.0 | 5.5 | 4.5 | FW, UX, VR | Identity, skills, certifications and status are real. Needs profile verification workflow, editing controls, provenance, comparison and lifecycle history. |
| 58 | Academy / approved studies and research | 5.8 | 6.5 | 8.5 | 6.0 | 7.0 | 4.0 | BI, RF | Versioned source/author/date/references/attachments and save engagement work. Content value is blocked by licensed approved sources; add reading progress and citation export after content supply. |
| 59 | Academy / learning paths | 5.8 | 6.5 | 8.0 | 6.0 | 7.0 | 4.0 | BI, FW | Timeline and engagement lifecycle work when approved stages exist. Needs prerequisite enforcement, course links, path completion evidence and certificate rules. |
| 60 | Robotics / public dashboard and search | 5.9 | 6.5 | 7.5 | 6.5 | 7.0 | 4.5 | FW, DA | Search is real and privacy-safe, but discovery lacks richer media, comparison and published capability evidence. Keep it information-only; do not add execution commerce until policy/pricing exists. |
| 61 | Marketing / dashboard | 5.9 | 6.5 | 7.0 | 6.0 | 6.5 | 4.5 | DA, UX | Real campaign/lead state, but external metrics absence dominates the page. Make internal funnel primary and move provider readiness to a compact banner. |
| 62 | Software / operational project management | 5.9 | 6.0 | 6.0 | 5.5 | 6.5 | 5.0 | FW, UX | Live Projects-domain phases, timing, members, latest financial plan, progress and CSV now work without duplicating records. A separate task/time ledger, dependencies, workload, comments and evidence remain unavailable and are disclosed. |
| 63 | Software / accounting | 6.0 | 6.5 | 6.0 | 5.5 | 6.5 | 5.0 | DA, PH | Currency-separated cash-basis P&L, operational balance snapshot, cash flow, sourced chart of accounts and CSV/print work. Payables/equity/bank reconciliation, period close, immutable reversal and country tax rules remain unavailable; statutory claims stay disabled. |
| 64 | Software / CRM | 6.0 | 6.5 | 6.5 | 6.0 | 6.5 | 5.0 | FW, UX | Pipeline, disclosed weighted forecast, next actions, linked customers, audited activity and CSV now work. Needs owner assignment, consent, deduplication, reminders and explicit lead-to-customer conversion. |
| 65 | Talent / matching | 6.0 | 6.0 | 6.0 | 6.0 | 6.5 | 5.5 | DA, UX | Deterministic matching, matched skills/gaps and scoped candidate consent work and avoid fake AI. Publish factor weights, add calibration/fairness review and human override history; avoid “smart” claims without validation. |
| 66 | User Center / payments history | 6.1 | 6.5 | 8.0 | 6.5 | 6.5 | 5.0 | BI, FW | Accurate persisted transactions and empty states; collection/refund/dispute depend on provider. Add filters and support links, not an internal fake pay button. |
| 67 | Auth / onboarding | 6.1 | 6.5 | 8.0 | 6.5 | 7.0 | 5.0 | UX, FW | Account type/location/interests persist, but interests do not materially personalize Home/Academy yet. Either consume them in recommendations or remove the choice. |
| 68 | Models / router and fallbacks | 6.1 | 7.0 | 7.5 | 5.0 | 5.5 | 5.0 | BI, UX, PH | Deterministic rules, priorities, quality/latency/cost and fallback history are solid. Needs provider health, simulation, conflict detection and safe staged rollout. |
| 69 | Tools / registry and permissions | 6.1 | 6.5 | 7.5 | 5.0 | 5.5 | 5.5 | BI, UX, PH | Least privilege and approval flags exist. Needs scope-level editor, handler health, time-limited grants, deprecation and execution policy preview. |
| 70 | Observability / alerts and incidents | 6.1 | 6.0 | 7.0 | 5.0 | 5.5 | 5.0 | BI, UX, PH | Persistent alerts/incidents/logs exist; add rules, deduplication, ownership, SLA, escalation, external notification and incident timeline. |
| 71 | Programs / people | 6.2 | 7.0 | 7.5 | 6.0 | 6.5 | 5.0 | FW, UX | Invitations/acceptance/owner checks work. Needs roles, removal, invitation expiry, contribution view and bulk import; do not add hierarchy until permissions are defined. |
| 72 | Models / registry | 6.2 | 7.0 | 7.5 | 5.5 | 5.5 | 5.5 | BI, UX, PH | Provider/model/capability/cost/latency/quality records are strong. Needs secrets separation, health checks, model version lifecycle and staged enable/disable. |
| 73 | User Center / reports index | 6.3 | 7.0 | 8.0 | 6.5 | 6.5 | 5.5 | UX, RF | Correctly links persisted projects/audit to real shared reports. Add report status/freshness and one clear “generate/open” action; avoid duplicating the report center. |
| 74 | Software / unified reports | 6.3 | 6.5 | 6.5 | 6.0 | 6.5 | 5.5 | DA, VR | Six distinct Sales/Finance/HR/Inventory/CRM/Projects reports now expose source, caveat, CSV and Print/PDF with currency separation. Add period filters/comparison, saved schedules, approval and cross-module reconciliation. |
| 75 | Talent / reports | 6.3 | 6.5 | 6.5 | 6.0 | 6.5 | 5.5 | DA, VR | Funnel, posting performance, accepted-decision time, pipeline chart, Print/PDF and privacy-safe three-sheet Excel now work. Add stage aging, source quality, period comparison and scheduled retention-aware reports. |
| 76 | Admin / command center | 6.3 | 7.0 | 7.0 | 5.0 | 5.5 | 6.0 | UX, VR | Real summaries and access controls, but multiple legacy dashboards compete with the 80-route operations center. Choose one command model and remove duplicate navigation/metrics. |
| 77 | Software HR / performance | 6.3 | 6.5 | 6.0 | 6.0 | 6.5 | 5.5 | DA, UX | Needs competency framework, review cycle, evidence, calibration and employee acknowledgement. Simplify raw score inputs. |
| 78 | Observability / workers and queues | 6.3 | 7.5 | 7.5 | 5.5 | 5.5 | 6.0 | PH, UX | Heartbeats, leasing, retry and dead-letter state work. Needs always-on consumer, autoscaling thresholds, idempotency dashboard and stuck-job remediation. |
| 79 | Software Sales / reports | 6.3 | 6.5 | 6.5 | 6.0 | 6.5 | 5.5 | DA, VR | Sourced operational totals work. Add periods, comparisons, aging, margin source and drill-down; do not present cash records as statutory revenue. |
| 80 | Mission Engine / control, create and queue | 6.4 | 7.5 | 7.5 | 5.0 | 5.5 | 6.0 | UX, VR, PH | Persistent state machine, idempotency, subtasks and history are strong. Needs visual DAG/queue, templates, worker consumer, bulk retry and clear operator priorities. |
| 81 | Mission Engine / dependencies, retry and fallback | 6.4 | 8.0 | 8.0 | 5.0 | 5.0 | 6.0 | UX, VR, PH | Cycle prevention/backoff/fallback are real; UI is form-heavy. Add graph, dry-run, projected cost/latency and policy conflict warnings. |
| 82 | Mission Engine / approvals, evidence and cost | 6.4 | 7.5 | 8.0 | 5.0 | 5.5 | 6.0 | UX, VR | Records and audit work. Needs approval chain/SLA/comments, evidence lineage, cost breakdown and anomaly detection. Simplify simultaneous forms into staged tabs. |
| 83 | Software HR / attendance and leave | 6.5 | 7.0 | 6.5 | 6.5 | 7.0 | 5.5 | DA, FW | Needs work schedules, timezone, holidays, manager approval, balances and correction audit. Avoid “automatic compliance” claims. |
| 84 | Software / company management | 6.5 | 7.0 | 7.0 | 6.5 | 6.5 | 5.5 | FW, PH | Owner-gated persistent branches, default branch/currency/tax/fiscal-year/prefix/timezone settings, audit and POS attribution now work. Legal entity data, approval policy, bank/tax registrations and multi-company consolidation remain. |
| 85 | User Center / invoice detail | 6.5 | 7.0 | 8.0 | 6.5 | 7.0 | 5.5 | BI, RF | Persisted amount/status/date and Print work without invented tax. Needs invoice number, line items, tax source, seller legal identity, downloadable artifact and provider reconciliation. |
| 86 | Talent / applicants and candidate detail | 6.6 | 7.5 | 7.0 | 6.0 | 7.0 | 5.5 | UX, PH | Status filters/sorting, match evidence, notes, screening-answer snapshots, audited participant messaging and notification-backed transitions work. Add interview scheduling, rejection reasons, bulk actions and consent-expiry policy. |
| 87 | Robotics / recommendations and information request | 6.6 | 7.5 | 7.5 | 7.0 | 7.0 | 5.5 | DA, BI | Reason/gap recommendations and non-execution request are honest. Needs explainable ranking formula, request SLA/status and pricing provider. |
| 88 | Talent / profile | 6.7 | 7.0 | 7.0 | 6.5 | 7.0 | 6.0 | UX, DA | Needs structured experience/education, visibility controls, completeness guidance and verified skills. Remove giant free-text fields. |
| 89 | Talent / employer post and dashboard | 6.7 | 7.5 | 7.0 | 6.5 | 7.0 | 5.5 | PH, UX | Job CRUD, quality gate, benefits/conditions and up-to-five required screening questions work. Needs entitlement, approval/moderation, expiration, templates and jurisdiction-specific legal job-posting checks. |
| 90 | Account / overview | 6.7 | 7.5 | 8.0 | 6.5 | 7.0 | 6.0 | UX, RF | Real cross-domain counts and routes. Add recent items and one primary next action; remove low-value total counters and use onboarding interests or delete them. |
| 91 | Programs / overview | 6.8 | 8.0 | 8.0 | 7.0 | 7.0 | 6.0 | UX, RF | Creation/activation/status and sourced readiness work. Explain readiness formula, add prerequisite preview and suspension reason; avoid drag/reorder unless it changes operations. |
| 92 | Software Sales / customers and products | 6.8 | 7.5 | 7.0 | 6.5 | 7.0 | 6.0 | UX, PH | Real org-scoped CRUD. Needs deduplication, contacts, tax identity, stock links, search/pagination and import validation. |
| 93 | Software Sales / quotes and orders | 6.8 | 7.5 | 7.0 | 6.5 | 7.0 | 6.0 | DA, UX | Lifecycle works; needs approval, expiry, discounts/tax rule source, conversion trace and immutable revision history. |
| 94 | Software Sales / receipts and returns | 6.8 | 7.0 | 7.0 | 6.5 | 7.0 | 6.0 | DA, FW | Needs payment allocation, partial return, reason codes, stock/accounting reversal and provider reconciliation. |
| 95 | Software HR / employees | 6.8 | 7.5 | 7.0 | 6.5 | 7.0 | 6.0 | PH, UX | Core records work; needs field-level privacy, documents, lifecycle, bulk import and granular HR roles. |
| 96 | Talent / dashboard, jobs and search | 6.8 | 7.5 | 7.0 | 7.0 | 7.0 | 5.5 | DA, RF | Multi-dimensional job/talent filters, salary threshold, skills, location, work mode, experience, availability and sorting now work on consent-scoped records. Add freshness badges, employer verification and saved searches; avoid guaranteed-match language. |
| 97 | Marketing / audience | 6.8 | 7.5 | 7.0 | 6.5 | 7.0 | 6.0 | DA, RF | Persisted segments/interests/location work; needs consent basis, estimated size source and overlap/deduplication. |
| 98 | Robotics / results and public profile | 6.8 | 7.5 | 8.0 | 7.0 | 7.5 | 5.5 | DA, RF | Sanitized profiles, skills/certifications/geography and verification date are strong. Needs media, comparison, capability evidence and staleness policy. |
| 99 | Studio / Sheets | 6.8 | 8.0 | 7.5 | 7.0 | 7.5 | 4.0 | PH | The GPL dependency is now removed; MIT formula evaluation, multi-condition filters, sourced KPI, chart, CSV/XLSX/PDF and formula regression tests work. Persist filters and add cell-level formula error guidance plus larger workbook benchmarks. |
| 100 | Platform / tests, build and dependency security | 6.8 | 8.0 | 7.5 | 6.0 | 6.0 | 4.5 | PH | Strong Vitest/Playwright/build coverage and Next/Sharp critical fixes. Production audit still reports 11 transitive vulnerabilities and Snyk is unavailable; Studio licensing blockers are resolved, while its final changes remain uncommitted. |
| 101 | Intelligence / knowledge versions and review | 6.8 | 8.0 | 8.5 | 5.5 | 5.5 | 6.5 | UX, VR, RF | Immutable versions, approval, evidence, diff, rollback-as-new and audit are strong. Add arbitrary-version rollback, conflict handling, source graph and focused review queue. |
| 102 | Studio / CV | 6.9 | 7.5 | 7.5 | 7.0 | 7.5 | 6.0 | UX, RF | Three templates and Print/PDF/versioning work. Needs structured repeated experience/education entries, contact privacy, page-break controls and ATS validation. |
| 103 | Programs / finance ledger | 7.0 | 8.0 | 8.5 | 7.0 | 7.0 | 6.0 | DA, RF | Minor-unit income/expense and balance are deterministic. Needs categories, periods, budgets, recurring entries and export; label it operational ledger, not accounting. |
| 104 | Talent / detail and application | 7.0 | 8.0 | 7.5 | 7.0 | 7.0 | 6.0 | RF, PH | Benefits/conditions, required answers, CV/profile consent snapshot, duplicate constraint, withdraw/status notifications and participant-only messaging work. Needs explicit consent receipt artifact, withdraw/rejection reason and attachment malware/retention policy. |
| 105 | Marketing / campaigns and detail | 7.0 | 8.0 | 7.5 | 7.0 | 7.0 | 6.0 | BI, RF | Internal creation/status/robot assignment work. Add provider mapping, schedule/budget guard and channel launch acknowledgment. Keep external delivery disabled until connected. |
| 106 | Marketing / leads | 7.0 | 8.0 | 7.5 | 7.0 | 7.0 | 6.0 | PH, RF | Real lead lifecycle and conversion records. Needs ownership, deduplication, consent, import validation and CRM sync. |
| 107 | Home / global command experience | 7.0 | 7.5 | 8.0 | 6.5 | 8.0 | 6.0 | UX, RF | Visually strong and source-aware, not a missing route. Simplify globe/news/stat density, fix ambiguous notification/search links, and personalize the first next action. |
| 108 | Studio / Logo and brand | 7.0 | 7.5 | 7.5 | 7.0 | 7.5 | 6.0 | RF | Industry/style/three proposals and PNG/SVG/PDF work. Needs font outlining/embedding, more controlled geometry, accessibility contrast and brand-guideline output. |
| 109 | Software Sales / invoices | 7.0 | 8.0 | 7.5 | 7.0 | 7.0 | 6.0 | DA, PH, RF | Invoice lifecycle and totals are useful. Needs country tax version, credit note/reversal, provider payment status, immutable numbering and compliant PDF. |
| 110 | Shared reports / project analysis and evaluation | 7.1 | 8.0 | 8.0 | 6.5 | 7.0 | 6.0 | BI, RF | Deterministic sourced sections, PDF endpoint, Print/Share and email outbox work. Add chart summaries, source timestamps per section and provider delivery confirmation. |
| 111 | Market / viewing and offers | 7.1 | 8.0 | 7.5 | 6.5 | 7.0 | 6.0 | FW, PH | Real requests/offers/status/audit. Needs timezone/calendar conflicts, reminders, counteroffers, expiry jobs, notifications and permission-specific history. |
| 112 | Studio / Letterhead | 7.1 | 8.0 | 8.0 | 7.0 | 7.5 | 6.0 | RF | Logo/A4-Letter/header/footer, DOCX and PDF work. Needs image sanitization, margin controls, multipage preview and exact office-render regression. |
| 113 | Market / dashboard and seller flow | 7.2 | 8.0 | 7.5 | 7.0 | 7.5 | 6.5 | RF, BI | Real draft/media/review/publish and quality gate. Needs autosave, structured valuation, seller verification, moderation and external settlement. |
| 114 | Studio / Presentations | 7.2 | 8.0 | 8.0 | 7.0 | 7.5 | 6.0 | RF, PH | Multiple layouts/order/duplicate/versioning, three persisted themes, editable charts, compressed images, real PPTX and Print/PDF now pass E2E. Needs speaker notes, font embedding and Office-render visual regression. |
| 115 | Projects / hub and creation | 7.3 | 8.5 | 8.0 | 7.0 | 7.5 | 7.0 | RF | Real creation, membership, phases and focused routes. Needs guided first-run, duplicate detection and clearer scope between project and Software project management. |
| 116 | Projects / professional feasibility | 7.3 | 8.5 | 7.0 | 6.5 | 7.5 | 6.5 | DA, UX, BI | Rich but cognitively heavy. Add staged inputs, assumptions register, sensitivity explanation and domain validation for NPV/IRR/inflation/tax. Hide advanced metrics until required inputs are complete. |
| 117 | Studio / dashboard and history | 7.3 | 8.0 | 8.0 | 7.0 | 7.5 | 6.5 | RF, PH | Versioning/restore/audit and tool discovery are useful. Needs diff, delete/archive, quota, storage durability and collaboration conflict strategy. |
| 118 | Academy / content source and approval governance | 7.3 | 8.0 | 8.5 | 6.5 | 6.5 | 7.0 | RF | Immutable versions, author/source/date/references/attachments and approval gates are strong. Needs license metadata, expiry/review schedule, duplicate detection and publisher workflow. |
| 119 | Projects / analysis and intelligence | 7.4 | 8.0 | 7.0 | 7.0 | 7.5 | 6.5 | DA, BI, RF | Sourced snapshots and limitations are visible. Needs authoritative market-data providers, freshness/confidence rules and structured citations rather than free-text source. |
| 120 | Projects / start, compliance, vendors and launch | 7.4 | 8.5 | 8.0 | 7.0 | 7.5 | 7.0 | RF, PH | Route-specific persistent records and audit now work. Needs jurisdiction rules, attachments, expiry, procurement/RFP and compliance hard gates before launch. |
| 121 | Projects / reports | 7.4 | 8.0 | 8.0 | 7.0 | 7.5 | 6.5 | BI, RF | Real project PDF and report views. Add section-level provenance, approval signature, comparison/version diff and confirmed email provider. |
| 122 | Academy / dashboard and course catalog | 7.4 | 8.0 | 8.0 | 7.0 | 7.5 | 6.5 | RF | Eight sourced dimensions, search and real counts now work. Needs duration, prerequisites, saved courses and content-quality governance visible to learners. |
| 123 | Market / deal timeline and report | 7.4 | 8.0 | 8.0 | 7.0 | 7.5 | 6.5 | BI, RF | Stages now derive from records; report is distinct with Print/Share. Needs persistent deal entity/state machine, settlement, signatures and source timestamp per milestone. |
| 124 | Studio / Docs | 7.4 | 8.0 | 8.0 | 7.0 | 7.5 | 6.0 | RF, PH | Templates, semantic blocks, versions, import, images, header/footer, page styles, native Word tables, real DOCX and Print/PDF now pass structural and E2E checks. Needs richer inline editing, pagination controls and Office-render accessibility regression. |
| 125 | Projects / evaluation, risk and governance | 7.5 | 8.5 | 7.5 | 7.0 | 7.5 | 7.0 | DA, RF | Weighted evidence, revisions, human decision and risk register are strong. Explain weights/scales, link risk owner to user, enforce review schedule and add comparison. |
| 126 | Studio / PDF Lab | 7.5 | 9.0 | 8.5 | 7.0 | 7.5 | 5.5 | PH, RF | Merge/split/extract/delete/reorder/rotate/optimize/images/watermark/numbering, local preview/order and secure redaction work. MuPDF was removed; redaction now uses Apache/MIT PDF.js and Canvas rasterization and passes text-removal plus full E2E tests. Add visual rectangle selection, output-size budgets and high-page-count benchmarks. |
| 127 | Projects / simplified feasibility | 7.6 | 8.5 | 7.5 | 7.5 | 7.5 | 7.0 | DA, RF | Deterministic and understandable; needs formula disclosure, units/currency validation and benchmark test cases reviewed by a finance expert. |
| 128 | Academy / course detail and lesson player | 7.6 | 8.5 | 8.0 | 7.5 | 8.0 | 6.5 | RF | Distinct player, private notes and progress work. Needs approved media/attachments, resume position, keyboard shortcuts and lesson duration. |
| 129 | Academy / server-graded assessments and result | 7.6 | 8.5 | 8.5 | 7.0 | 7.5 | 7.0 | RF | Correct answers never leave server; attempts/certificate tested. Add question version lock, explanations after submit, partial-credit types, appeal/manual-review path and accessibility audit. |
| 130 | Market / listing catalog and detail | 7.6 | 8.0 | 8.0 | 7.5 | 8.0 | 6.5 | RF | Dedicated searchable catalog and sourced detail now work. Add pagination, saved searches, comparison, seller trust and stale-listing policy. |
| 131 | Platform / RBAC, origin validation and audit | 7.7 | 8.0 | 8.5 | 6.0 | 5.5 | 7.5 | PH, RF | Strong base controls and audited sensitive actions. Needs centralized mutation guard, scoped permission enforcement coverage, audit completeness test and security review. |
| 132 | Academy / certificate and public verification | 7.8 | 8.5 | 8.5 | 7.5 | 8.0 | 7.0 | RF | Real issuance, expiry, Print/PDF, safe public verification and share URL. Needs revocation reason/status history, branded downloadable PDF artifact and QR verification. |
| 133 | Market / NDA and protected documents | 7.8 | 8.5 | 8.5 | 7.5 | 7.5 | 7.0 | RF, PH | Server-side NDA gates confidential fields/files and direct downloads. Checkbox acceptance is not legal e-signature; add generated agreement hash, signer metadata, revocation/legal retention. |
| 134 | Platform / localization, responsive and accessibility foundation | 7.8 | 8.0 | 8.0 | 8.0 | 8.0 | 7.0 | RF, PH | Arabic/English, RTL/LTR and ten viewports are broad. Needs formal WCAG 2.2 AA, keyboard/screen-reader/color-contrast testing and consistent English error localization. |
| 135 | Auth / gateway, login and registration | 8.0 | 8.5 | 8.5 | 7.5 | 8.5 | 7.0 | RF, PH | Argon2id, hashed sessions, rate limit, origin checks and 73 visual cases are strong. Add verified-email policy, optional MFA, session/device management, field-level errors and simplify decorative density. |
| 136 | Platform / Prisma and PostgreSQL integrity | 8.1 | 8.5 | 8.5 | 6.0 | 5.0 | 8.0 | RF, PH | 57 migrations, transactions, indexes and constraints are strong; no destructive reset. Add DB check constraints, migration-from-empty CI, restore proof and retention review. |

## What should be hidden or removed now

1. Hide Pricing conversion actions until approved plans and payment collection exist; keep only a concise `NOT_PUBLISHED` state if the route must remain.
2. Rename or hide social “verification” where the system only stores voluntary acknowledgement. Keep the official links, remove any implication of automated proof.
3. Remove duplicate legacy Admin dashboards/navigation as each task-specific replacement reaches acceptance.
4. Hide profitability rankings, statutory payroll/accounting claims, external marketing ROI, robotics price compatibility and portfolio returns until their inputs are authoritative.
5. Keep Funding Eligibility absent. Any remaining schema cleanup must be dependency-audited and migration-only.
6. Do not expose export formats unless the generated file is validated. Studio DOCX/XLSX/PPTX/SVG and Software CSV/Print outputs now pass structural or E2E checks; keep the same gate for every new format.

## Complexity that currently adds too little user value

- The Home/Auth globe, distribution panels and multiple statistics compete with the primary next action. Preserve one strong world signal and reduce duplicate counts.
- Project professional feasibility exposes too many panels at once; use progressive stages and an assumptions register.
- Admin uses many named routes over the same raw-table renderer. Route count is not product depth; replace or consolidate.
- Robot Academy and Organization expose taxonomy/hierarchy before operators can edit or act on it. Hide read-only duplicates.
- Studio should avoid CRDT/collaboration complexity until single-user editing, file fidelity and storage durability are proven.
- Software project management overlaps with the Projects domain; narrow it to operational delivery or integrate it rather than maintaining two project products.

## Output, source and calculation assessment

| Area | Current judgment | Required for 10/10 |
| --- | --- | --- |
| Project feasibility/risk/quality | Deterministic and persisted, but formulas/weights are not sufficiently explained or independently certified. | Versioned formula specification, units, assumptions, expert-reviewed fixtures, sensitivity explanation, source timestamps. |
| Academy | Course and engagement outputs are real; external resources are source/version/approval gated. | Licensed content supply, assessment version lock, certificate revocation/QR, media provider. |
| Market | Confidentiality is server enforced; deal report is sourced. | Legal e-signature evidence, persistent deal state, settlement/escrow provider, valuation rubric. |
| Studio | Native files and PDF transformations exist in current worktree. | Resolve GPL/AGPL licensing, final E2E/build, font/render fidelity, malware/image sanitization. |
| Software ERP | Operational records are useful; statutory accuracy is not established. | Country/versioned tax and labor rules, reconciliation, reversals, period close, audit-approved reports. |
| Marketing | Internal leads/conversions are valid; external media metrics are unavailable. | Provider attribution, spend reconciliation, freshness and attribution-window metadata. |
| Robotics | Published profile evidence is real and sanitized; price/execution is intentionally unavailable. | Capability evidence policy, ranking transparency, pricing/availability provider and SLA. |
| Reports | Project reports/PDF/Print/Share are usable; email is an outbox only. | Provider-confirmed delivery, section provenance, charts only where sourced. |

## New-user and final-product verdict

- A new user can register, onboard, use Projects, Academy core, Market, Programs and several Studio/Software workflows without training, but the number of top-level modules and technical terminology still creates cognitive load.
- The strongest user surfaces now look final-adjacent: Auth, Home, Projects, Academy course journey, Market protected flow, and shared reports.
- Studio is visually and functionally approaching final quality but is not production-ready until licensing/security/final regression are cleared.
- Most Admin surfaces still look like an operations prototype: correct records and controls inside generic tables rather than role-specific products.
- The platform as a whole is not 10/10 until its weakest mandatory operational dependency is production-ready; a polished route cannot compensate for missing payment, email, backup, worker and monitoring infrastructure.

## Ordered path to 10/10

1. Resolve production blockers: email, payment, backup, monitoring, managed Redis, active queue consumer, and Studio licensing/security.
2. Replace generic Admin pages with section-specific operator experiences, starting Finance/Reports, Robot Academy and Organization.
3. Certify accuracy: project formulas, ERP tax/labor/accounting rules, marketing attribution, market valuation and robotics ranking.
4. Simplify first-run UX and module boundaries; hide incomplete or low-value surfaces instead of advertising them.
5. Complete visual refinement against each authoritative reference, then run all 232 screens at ten viewports plus keyboard/WCAG checks.
6. Perform staging load/security/restore/provider-failure drills before any public launch.
