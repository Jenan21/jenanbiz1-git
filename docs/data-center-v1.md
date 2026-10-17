# Jenan Platform Data Center v1 | مركز بيانات منصة جنان

## Architecture and change boundary

The Data Center is a shared platform service, not a Projects attachment store.
It extends the existing Next.js App Router application, Prisma/PostgreSQL
database, authenticated sessions, organization RBAC, audit log, rate limiting,
and document storage. It does not replace those systems.

The existing `/admin/data-center` page was a summary placeholder. PR #25 was
reviewed as an unmerged implementation candidate; its separation of scoped
records, immutable content versions, ingestion, and retrieval informs this
implementation. It is not merged wholesale.

The prior review identified missing UI implementation and a missing evidence
table in its migration, insufficient organization-scoped retrieval checks,
an Academy approval race, stale mutation responses, an impossible private
approval path, and filtering after candidate limiting. These are review
inputs, not accepted behavior or a reason to reuse the old migration.

The target architecture has four layers sharing provenance and governance
(see the incomplete-coverage disclosure below):

- **Data:** computable structured datasets and geographic information.
- **Knowledge:** documents, research, operational knowledge, and explanations.
- **Assets:** reusable templates, designs, prompts, and tool definitions.
- **Evidence:** sources, verification, dates, confidence, and version references.

Consumers use service/API contracts rather than internal tables. A robot's
specialty, mission, department, and permissions must narrow retrieval; none
grants access by itself. Retrieval must never send the complete corpus to a
model. Tool definitions are descriptive knowledge, not execution grants.
Source knowledge and Academy-generated material remain separate.

### Integration boundaries

| Consumer | Contract boundary |
| --- | --- |
| Projects and Investment | Permission-filtered market, location, price, cost, study, and asset context; record exact version references. |
| Software, HR, Marketing, Marketplace, Hiring | Department/service filters narrow the caller's authorized scope; never substitute for RBAC. |
| Jenan PRO Map | Geographic exchange metadata only; no Map implementation or schema migration is modified. |
| Robots and Missions | Bounded retrieval through the shared context service; explicit robot access restrictions and metadata-only usage records. |
| Robot Academy | Targeted releases of approved source versions; no automatic distribution or training. |
| Design Intelligence | Published approved design assets by department/style; drafts are not default retrieval candidates. |
| Tool Registry | Knowledge describes a tool; execution remains governed by the existing registry and permissions. |

Existing integrations remain intact. There is no per-department copy of the
Hub corpus and no new database, model retraining service, paid provider, or
vector infrastructure in this change.

No homepage, authentication UI, Jenan PRO Map, or Project Analysis UI changes
are part of this delivery. New consumer integrations are opt-in contracts;
this implementation does not claim to have migrated every existing consumer.

## Storage and security policy

Original binaries belong in the existing document storage provider, not in
PostgreSQL. Local deployments use the configured local document directory;
supported Vercel deployments use the existing Blob provider. Protect and back
up both database and binary storage.

Uploads are untrusted. Validation and a configured malware-scanner hook must
precede extraction and storage. Missing scanning infrastructure is an
unavailable capability, not a successful scan. Never execute imported tools,
macros, scripts, or document content. Do not add arbitrary URL fetching for
API imports without an approved SSRF-safe connector.

The optional server-configured ClamAV INSTREAM adapter uses
`DATA_CENTER_CLAMAV_HOST` and `DATA_CENTER_CLAMAV_PORT` (default `3310`).
It is a client transport, not a bundled scanner daemon. Run an approved
scanner on a private network, maintain its definitions, and restrict access
to it. Uploaded metadata cannot choose the scanner host. Missing, timed-out,
or unrecognized scanner responses fail closed. Tests may inject a scanner
double; that does not establish production malware protection.

Human approval is distinct from factual verification. Estimated and derived
facts must remain labelled as such. AI suggestions cannot confer VERIFIED
status or fabricate source metadata. Private material must never be promoted
to platform scope as a side effect of publishing or Academy release.

Audit events and usage records must contain identifiers, action/result,
timestamps, version references, and necessary governance metadata, not copies
of document contents, prompts, or sensitive extracted text. Source ownership
and redistribution licenses are independent attributes; neither authorship
nor a successful import grants redistribution rights.

## Admin routes

The existing admin shell hosts these separate pages:

`/admin/data-center`, `/admin/data-center/data`,
`/admin/data-center/knowledge`, `/admin/data-center/assets`,
`/admin/data-center/imports`, `/admin/data-center/sources`,
`/admin/data-center/evidence`, `/admin/data-center/conflicts`,
`/admin/data-center/versions`, `/admin/data-center/robot-knowledge`,
`/admin/data-center/academy`, `/admin/data-center/publishing`,
`/admin/data-center/usage`, `/admin/data-center/audit`, and
`/admin/data-center/settings`.

An unavailable capability must explain its prerequisite. Empty tables are
not populated with demonstration records, and missing telemetry must not be
converted into a fabricated system-health percentage.

## Database and module layout

The migration is additive to the existing application migration chain.
Data Center records use the `DataCenter` prefix; existing business-domain
models and migrations are not removed.

| Record family | Responsibility |
| --- | --- |
| Type registry | Extensible content classifications and review requirements. |
| Source | Provenance authority, access scope, license and retrieval/export policy. |
| Item and Version | Stable identity plus append-only content/evidence snapshots. |
| Review and Event | Human decisions and lifecycle history tied to versions. |
| Conflict | Both participating records/versions and an explicit resolution. |
| Usage | Exact version consumed, actor and consumer metadata. |
| Import | Original file metadata, checksum, scanner, adapter and storage reference. |
| Academy release | Requested target, approved source version and approval history. |

`services/data-center/contracts.ts` defines validated input and adapter
contracts. `policy.ts` centralizes authorization/evidence policies.
`service.ts` contains transactional governance operations, `imports.ts`
handles ingestion, and `retrieval.ts` contains consumer context/export and
Academy boundaries. `lib/admin/data-center-http.ts` adapts those services
to authenticated HTTP; UI code does not query the internal tables.

## API and service boundaries

The administrator endpoint is `/api/admin/data-center`. Read operations
select an area or item; JSON write operations use an explicit `action`
discriminant. Uploads use multipart form data rather than inline binary
JSON. Consumer context and policy-filtered export live under
`/api/data-center`. These endpoints reuse session authentication, origin
validation for writes, per-user rate limits, and private/no-store responses.

The service contracts in `services/data-center` are the integration boundary.
Consumers should retain `itemId`, `versionId`, version number, checksum, and
source information returned by retrieval, rather than looking up a moving
"latest" record when regenerating an old report. A later draft must not be
mistaken for a published revision.

Semantic retrieval is a pluggable provider capability. A missing provider
must return an explicit unavailable state; it must not silently claim that
keyword results are semantic results. PostgreSQL keyword retrieval needs no
external vector database.

## Operational rollout

1. Review the additive migration and deploy it through the existing Prisma
   migration process. Do not use a schema reset on an existing environment.
2. Verify existing session, approval, organization membership, and audit
   behavior before granting Data Center capabilities to production roles.
3. Register the content types that the organization actually intends to use.
   Type registry entries describe supported content; they are not sample
   datasets or evidence of ingestion.
4. Configure and test an approved scanner before enabling file imports.
   Keep unsupported providers disabled and expose their actual availability.
5. Import a licensed source, review a draft, approve and publish its exact
   version, then verify scoped retrieval and usage references.
6. Pilot each department/robot integration separately. Do not auto-release the
   corpus to all robots or infer tool execution permissions from stored assets.
7. Establish a freshness review owner, license review process, conflict
   resolution policy, backup schedule, and restore-drill owner.

## Backup and restore architecture

Application JSON/CSV exports are policy-filtered interchange, **not** a
disaster-recovery backup. Redistribution restrictions still apply to exports.

An operator-managed backup must capture:

1. A consistent PostgreSQL snapshot, including Hub versions, usage references,
   review history, sources, conflicts, Academy links, RBAC, and audit records.
2. Original objects and their storage-key/checksum manifest, at the same recovery
   point as the database.
3. Migration history and the matching application revision.
4. Required runtime configuration through the deployment's secret manager,
   never through an application export or repository commit.

Use the existing infrastructure backup process; retain encrypted copies under
the platform retention/access policy. For restoration, first restore into a
new isolated database and storage namespace. Apply additive migrations with
the existing deployment workflow, verify checksums and exact-version links,
check tenant isolation, and test retrieval before an authorized cutover.
Do not reset or overwrite the running production database. Keep the previous
environment intact until the recovery point is accepted. Schedule restore
drills; a successful export alone does not prove recoverability.

## Deliberate limits and next phase

- No paid external service, foundation-model retraining, large vector
  database, full Market Engine, or user-section redesign is introduced.
- Malware scanning and semantic retrieval require explicitly configured
  adapters. They must not be represented as available merely because their
  interfaces exist.
- API-source ingestion must use an approved adapter with fetched payloads;
  unrestricted remote URL fetching is not a supported import action.
- Backup/restore is an operator architecture and runbook, not an unaudited
  destructive restore button.
- Existing departments and robots need versioned adoption work before their
  current read paths can be described as migrated to this hub.

The next phase should pilot a real licensed dataset, a real scanner adapter,
and one authorized mission consumer; measure retrieval quality, context size,
freshness, access denials, and exact-version references. Add approved
connectors/embedding providers only after that pilot, and test restore
drills before relying on this store for production continuity.

## Delivery verification

**Status: foundation checkpoint, not a completed or accepted v1.** Work was
time-boxed at the owner's request; remaining scope is not silently declared
complete. PR #32 remains for owner review and must not be merged as a
completed v1 without closing the gaps below.

### Verified initial checks

- Backend agent reported 40 passing focused tests, including six real
  PostgreSQL rollback-isolated workflows; owned ESLint, full typecheck,
  Prisma validate/generate, and additive migration deployment passed.
- UI agent reported passing focused UI/route tests and live authenticated
  responsive checks. This is not equivalent to final functional acceptance
  of every required workflow.
- Secret scanning of the foundation checkpoint files found no secrets.
- Local Node was v22.23.3, whereas the repository requests Node 24; the
  lockfile was installed unchanged.
- Full final lint/test/build results are not established by the initial
  focused checks.
- Final automated review/CodeQL was requested but refused because the
  validation time limit was reached. No successful final security scan or
  automated review is claimed.

### Incomplete coverage requiring follow-up

- The persisted layer enum still uses DATA, KNOWLEDGE, INTELLIGENCE, CONTEXT;
  the required independent ASSET/EVIDENCE layers and complete asset schema
  are not delivered. Their UI pages must not be mistaken for complete hubs.
- Lifecycle lacks DEPRECATED; complete per-operation permissions, stale
  reviewer version guards, robot grants, and a trusted bounded mission
  context contract remain to be completed and validated.
- Category/department registries and publication metadata are present, but
  full ownership, license, geography, freshness, evidence, and the specified
  seven-factor confidence policy are incomplete.
- Academy has targeted requests and approvals, but not the complete release
  classification/validity/level/mandatory policy or supervisor/committee
  robot-proposal workflow.
- Retrieval still has a 2,000-candidate cap; complete context-budget,
  department/location/date filtering, and consumption analytics are not
  production-accepted.
- Export covers permitted published retrieval rows, not the requested full
  metadata/evidence/version/source/audit interchange.
- PDF text extraction and a configured production malware scanner/semantic
  provider are unavailable by default.

Next work should close these existing mission gaps and run the full delivery
gate before adding more capabilities. No homepage, Auth, Map, or Project
Analysis redesign is needed to do so.
