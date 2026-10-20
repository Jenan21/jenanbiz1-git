# Jenan Platform Data Center v1 | مركز بيانات منصة جنان

## Architecture and change boundary

The Data Center is a shared platform service, not a Projects attachment store.
It extends the existing Next.js App Router application, Prisma/PostgreSQL
database, authenticated sessions, organization RBAC, audit log, rate limiting,
and document storage. It does not replace those systems.

`/admin/data-center` stays the single administration hub. Its former page
showed counts from the database next to figures that were not measured: fixed
percentage changes, values computed from a robot skill average, and a "system
health" taken from that average. The counts are kept as the Overview /
Platform Metrics section and the invented figures were removed. PR #25 was
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
| Jenan PRO Map | Display and spatial experience only. The Map consumes published Data Center versions through the independent contract in `services/data-center/map-contract.ts` (see "Map contract"); no Map code, table or schema is touched and there is no foreign key between the two. |
| Robots and Missions | Bounded retrieval through the shared context service; a robot sees only the sources an administrator granted to that robot, principal, role, specialty and mission (see "Robot access grants"); metadata-only usage records. |
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

The Overview section also shows **Platform Metrics**: row counts of users,
organizations, robots, robot tasks, shared knowledge, learning records,
verified evidence, model executions and cost records, read from the database
through `GET /api/admin/data-center?area=platform`. They are counts only. They
are not a health, skill or performance indicator, are never rounded or derived
from another figure, and a count that cannot be read is shown as unavailable
instead of zero. Measured platform health needs an approved monitoring source
and appears only when one exists.

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
| Source | Provenance authority, ownership, access scope, license, usage policy, attribution and retrieval/export policy. |
| Item and Version | Stable identity plus append-only content/evidence snapshots, with structured coverage and attribution. |
| Review and Event | Human decisions and lifecycle history tied to versions. |
| Conflict | Both participating records/versions and an explicit resolution. |
| Usage | Exact version consumed, actor and consumer metadata. |
| Import | Original file metadata, checksum, scanner, adapter and storage reference. |
| Academy release | Requested target, approved source version and approval history. |
| Evidence link | Append-only provenance and evidence references of a version. |
| Robot grant | Explicit, expiring, revocable access of one robot to one source. |
| Version lineage | Directed "derived from" edges between immutable versions. |
| Quality assessment | Append-only, explainable quality statements about a version. |

`services/data-center/contracts.ts` defines validated input and adapter
contracts. `policy.ts` centralizes authorization/evidence policies.
`service.ts` contains transactional governance operations, `imports.ts`
handles ingestion, and `retrieval.ts` contains consumer context/export and
Academy boundaries. `robot-grants.ts` creates and revokes robot grants,
`quality.ts` records quality assessments, and `map-contract.ts` with
`map-resolver.ts` hold the Map contract. `lib/admin/data-center-http.ts`
adapts those services to authenticated HTTP; UI code does not query the
internal tables.

### Migrations and database-only constraints

The Data Center migrations are additive. An earlier migration is never edited:
every later schema change is a new migration, and a database built from the
whole chain from scratch must succeed.

| Migration | Purpose |
| --- | --- |
| `20261017150000_platform_data_center_v1` | Original tables, enums, CHECKs, immutability triggers, full-text index and seed types. |
| `20261017152000_data_center_publication_metadata` | Category and department registries, source organization, effective dates, published-version pointer. |
| `20261020053000_data_center_schema_sync` | Corrective: `DataCenterItem.revision`, `DataCenterAcademyRelease.parentRevision` and the `DataCenterEvidenceLink` table, which the schema and services use but the two migrations above never created. |
| `20261020060000_data_center_parent_revision_reserved` | `parentRevision` becomes nullable and reserved. |
| `20261020061000_data_center_source_rights` | Ownership, declared license class, usage policy, source URL and attribution on sources. |
| `20261020062000_data_center_robot_grants` | `DataCenterRobotGrant` and its guard trigger. |
| `20261020063000_data_center_version_lineage` | `DataCenterVersionLineage` and its acyclic guard. |
| `20261020064000_data_center_version_coverage_attribution` | Structured WGS84 coverage and attribution on versions. |
| `20261020065000_data_center_quality_assessments` | `DataCenterQualityAssessment`. |

`DataCenterAcademyRelease.parentRevision` is **reserved and unused in v1**: no
Data Center code reads or writes it, and NULL means "not set". Its former
default of 0 was a placeholder that never described a real parent revision, so
the migration cleared it. Do not give it business meaning without a design
decision.

A database built from the whole chain matches `prisma/schema.prisma` except
for the objects below. They are intentional, enforced by PostgreSQL, and
reported by `prisma migrate diff` as "removed" because the schema does not
model them. Never generate a migration from that output: it would drop them.
Any other line in that output is new, undocumented drift.

**Database-only foreign keys (21).** All are `ON DELETE RESTRICT` unless noted.
A modelled foreign key needs a back-relation field on the referenced model, and
the Data Center deliberately adds none to the core `User`, `Organization`,
`Robot` and `Mission` models.

| Database-only constraint | Why the schema does not model it |
| --- | --- |
| `DataCenterItem_current_version_fkey` and `DataCenterItem_published_version_fkey`: `DataCenterItem(id, currentVersion)` and `(id, publishedVersion)` to `DataCenterVersion(itemId, number)`, `DEFERRABLE INITIALLY DEFERRED` | Prisma cannot express deferrable constraints. They guarantee that an item points only to a version it owns. They are checked at `COMMIT`, so the tests force them with `SET CONSTRAINTS … IMMEDIATE`. |
| To `User` (15): `DataCenterSource_ownerId_fkey`, `DataCenterItem_createdById_fkey`, `DataCenterVersion_createdById_fkey`, `DataCenterReview_reviewerId_fkey`, `DataCenterEvent_actorId_fkey`, `DataCenterConflict_resolvedById_fkey`, `DataCenterUsage_actorId_fkey`, `DataCenterImport_actorId_fkey`, `DataCenterAcademyRelease_requestedById_fkey`, `DataCenterAcademyRelease_approvedById_fkey`, `DataCenterEvidenceLink_linkedById_fkey`, `DataCenterRobotGrant_principalId_fkey`, `DataCenterRobotGrant_grantedById_fkey`, `DataCenterRobotGrant_revokedById_fkey`, `DataCenterQualityAssessment_assessedById_fkey` | Modelling them would add a back-relation field per column to the core `User` model. |
| `DataCenterSource_organizationId_fkey` to `Organization`, `DataCenterUsage_missionId_fkey` and `DataCenterRobotGrant_missionId_fkey` to `Mission`, `DataCenterRobotGrant_robotId_fkey` to `Robot` | Same reason: back-relations on `Organization`, `Mission` and `Robot`. |

There is no foreign key from any Data Center table to the `jenan_map` schema,
and none is allowed; see "Map contract".

**CHECK constraints (35).** Prisma does not report them and the schema does not
model them.

| Table | CHECK constraints |
| --- | --- |
| `DataCenterSource` | `DataCenterSource_scope_check`, `DataCenterSource_freshness_check`, `DataCenterSource_ownership_kind_check`, `DataCenterSource_usagePolicy_check`, `DataCenterSource_attribution_check`, `DataCenterSource_attribution_required_check`, `DataCenterSource_sourceUrl_check`, `DataCenterSource_license_class_check` |
| `DataCenterItem` | `DataCenterItem_version_check` |
| `DataCenterVersion` | `DataCenterVersion_number_check`, `DataCenterVersion_content_check`, `DataCenterVersion_origin_check`, `DataCenterVersion_ai_not_verified`, `DataCenterVersion_effective_dates_check`, `DataCenterVersion_attribution_check`, `DataCenterVersion_coverage_countries_check`, `DataCenterVersion_coverage_regions_check`, `DataCenterVersion_coverage_bbox_check` |
| `DataCenterReview` | `DataCenterReview_decision_check` |
| `DataCenterConflict` | `DataCenterConflict_distinct_check`, `DataCenterConflict_resolution_check` |
| `DataCenterImport` | `DataCenterImport_sizeBytes_check` |
| `DataCenterAcademyRelease` | `DataCenterAcademyRelease_targetKind_check`, `DataCenterAcademyRelease_status_check`, `DataCenterAcademyRelease_independent_check` |
| `DataCenterEvidenceLink` | `DataCenterEvidenceLink_kind_check`, `DataCenterEvidenceLink_existing_evidence_check` |
| `DataCenterRobotGrant` | `DataCenterRobotGrant_validity_check`, `DataCenterRobotGrant_text_check`, `DataCenterRobotGrant_revocation_check` |
| `DataCenterVersionLineage` | `DataCenterVersionLineage_distinct_check` |
| `DataCenterQualityAssessment` | `DataCenterQualityAssessment_score_check`, `DataCenterQualityAssessment_score_range_check`, `DataCenterQualityAssessment_method_check`, `DataCenterQualityAssessment_metrics_check` |

**Functions and triggers (5 functions, 10 triggers).**

| Function | Triggers and use |
| --- | --- |
| `data_center_immutable` | Rejects every update and delete: `DataCenterVersion_immutable`, `DataCenterReview_immutable`, `DataCenterEvent_immutable`, `DataCenterUsage_immutable`, `DataCenterImport_immutable`, `DataCenterEvidenceLink_immutable`, `DataCenterVersionLineage_immutable` and `DataCenterQualityAssessment_immutable`. |
| `data_center_robot_grant_guard` | `DataCenterRobotGrant_guard`: grants are never deleted and the only allowed update is the single revocation of an active grant. |
| `data_center_lineage_acyclic` | `DataCenterVersionLineage_acyclic`: an edge may only be added to a version that no other version derives from, which makes cycles impossible for any writer. |
| `data_center_codes_match` and `data_center_regions_within` | Immutable helper functions for the coverage CHECKs, because a CHECK cannot contain a subquery. |

**Index.** `DataCenterVersion_search_idx` is a GIN full-text index on
`to_tsvector('simple', title || ' ' || content)`. Prisma cannot model an
expression index. The GIN indexes on `specialties` and `missionContexts` are
modelled in the schema.

These objects are covered by tests on a real PostgreSQL database
(`tests/integration/data-center-constraints.integration.test.ts` for the
original objects and `data-center-foundation.integration.test.ts` for the later
ones), which are opt-in through `DATA_CENTER_DATABASE_TESTS=1` and a migrated
`DATABASE_URL`. The constraints test also fails when a CHECK, trigger,
function or the full-text index exists in the database without being named in
this document, and when a foreign key that Prisma does not model is missing
from the list above.

`prisma migrate diff` on that database also reports four differences that
already exist on `main` and are outside the Data Center, so no Data Center
migration touches them: the column `CommitteeReview.reviewer` and the indexes
`JobApplication (matchScore, status)`, `JobPosting (qualityScore, status)` and
`MarketListing (qualityScore, status)`.

## Ownership, license and attribution

Ownership says who owns the data and is stored on the source: `PLATFORM_OWNED`,
`USER_OWNED`, `THIRD_PARTY` or `AI_GENERATED`. It is not a license. Three
further fields are independent of it and of each other: the free-text
`license`, the optional declared license class (`JENAN_OWNED`, `OPEN_LICENSE`,
`LICENSED`, `RESTRICTED`, the vocabulary the Jenan PRO Map uses) and the
`usagePolicy`. The class is declared by an administrator and is never inferred
from ownership or from the license text; an undeclared class stays NULL. Each
field is carried unchanged, so mapping between the vocabularies loses nothing.

These rules are enforced by contract validation and by CHECK constraints: a
`GENERATED` source is `AI_GENERATED` and the reverse; `JENAN_OWNED` needs
`PLATFORM_OWNED`; a `RESTRICTED` source cannot allow export; mandatory
attribution needs attribution text; `sourceUrl` accepts only http(s) URLs
without embedded credentials. Without a declared ownership a source is
`THIRD_PARTY` (`AI_GENERATED` for a generated source) and its usage policy is
"Internal use; redistribution requires explicit permission". These are
conservative defaults, not verified claims about a source, and existing
sources received the same defaults.

Attribution is explicit text, not an unstructured JSON blob. A source carries
the credit line (`attribution`, `attributionRequired`) and a version may carry
its own, which takes precedence for that version. Retrieval rows carry the
effective attribution, ownership, license class, usage policy and export
permission; each feature of the geospatial context carries ownership and
attribution; the CSV export has `ownership`, `usagePolicy` and `attribution`
columns and the JSON export carries the full rows. A redistributed file
therefore keeps its credit. Export still includes only sources that allow
export.

## Geographic coverage

A version may declare plain WGS84 metadata: ISO 3166-1 country codes, ISO
3166-2 region codes (the country of every region must be listed) and a
west/south/east/north box. The box is all four values or none, longitude is
-180 to 180, latitude is -90 to 90, west is not east of east (antimeridian
crossing is not supported in v1) and south is not north of north. Validation
lives both in the contract and in CHECK constraints. No PostGIS or geometry
type is added and nothing is copied from the `jenan_map` schema.

Coverage that was not declared is stored as empty lists and NULL and is
reported as `null`; it is never turned into a worldwide extent. The version
checksum covers attribution, coverage and lineage only when they are present,
so a version without them keeps the checksum of the original algorithm and
equal input in a different order hashes identically.

## Quality assessments

Quality is recorded, not computed. A `DataCenterQualityAssessment` is
append-only. A `MEASURED` assessment carries a score from 0 to 1 together with
the method, the method version, the measurement date and a written
explanation, plus optional scalar metrics; `INSUFFICIENT_DATA` states that an
assessment was attempted without enough data and carries no score. A version
without an assessment has quality "unavailable". The most recent measurement
date wins, so `INSUFFICIENT_DATA` can supersede an older score. Nothing in the
platform defaults, estimates or backfills a score. The separate confidence
score remains a labelled heuristic.

## Robot access grants

No robot has implicit access. An AI actor can use only the sources for which an
administrator created an unrevoked, unexpired `DataCenterRobotGrant` that
matches its principal, robot, role, specialty and mission, and the robot must
still be assigned to that mission. `READ` allows retrieval; proposing a draft
needs a `PROPOSE` grant. A proposal is always an AI-origin draft for human
review; AI actors cannot register sources, review, approve or publish.

Only administrators create or revoke grants. A grant expires after at most 365
days, there is at most one active grant per combination, every action is
audited, and a grant is never edited or deleted. The robot identity fields of
an actor are filled only by trusted server code. **No HTTP route authenticates
robots yet**, so connecting the robot runtime is later work; the enforcement
itself is in the service layer and is tested.

## Version lineage

`DataCenterVersionLineage` records, with real foreign keys, that a version was
derived from other versions. Edges are written only while the derived version
is created (at most 20), upstream versions must exist and be readable by the
actor so lineage cannot probe hidden sources, and edges are append-only and
acyclic. It replaces a free-form list of upstream identifiers.

## Map contract

The Jenan PRO Map displays data and owns the spatial experience; the Data
Center owns the data, its sources, versions, rights, quality and publication.
`services/data-center/map-contract.ts` is the independent, pure (no database,
no network) contract between them, and `map-resolver.ts` builds a reference
from Data Center tables only.

| Member | Content |
| --- | --- |
| `dataset`, `version` | Item and version identity, SHA-256 checksum, evidence status, origin and upstream version identifiers. |
| `source`, `ownership`, `rights` | Source, ownership, license text, declared license class, usage policy, export permission and attribution with its level (version or source). |
| `coverage` | Structured WGS84 coverage, or `null` when none was declared. |
| `quality` | `UNAVAILABLE`, `INSUFFICIENT_DATA` or `MEASURED` with its method, method version and date. |
| `confidence`, `freshness`, `publication` | Heuristic confidence with its policy version, freshness re-evaluated from the stored dates, and the published version. |

Only the published version of a retrievable, unarchived item can be
referenced, and the resolver applies the same visibility rules as retrieval.
`assessMapReferenceUse` decides whether a reference may be displayed or
exported and returns explicit findings; an undeclared license class is
treated as `RESTRICTED` for export, with the reason stated. The Map keeps only
an opaque version reference and an immutable snapshot of the reference for a
published release (`mapBindingSchema`, together with its own release, layer and
artifact identifiers and the artifact's own SHA-256), and `assessMapBinding`
reports whether the Data Center still agrees with that snapshot: version,
checksum, export permission, license class, license text, usage policy,
attribution and ownership.

There is no foreign key, import, query or route between the Data Center and
the `jenan_map` schema; `tests/unit/data-center-map-contract.test.ts` asserts
it for the services, the models and the migrations. The contract is not used
by the Map or by Projects yet. Connecting them is a separate step that goes
through this contract only.

## Existing knowledge stores

The existing `SharedKnowledge`, `Knowledge*` and `GeographicKnowledge` models
are neither replaced nor copied, and the Data Center creates no third
knowledge store. A later adapter may reference them from the Data Center;
until then they remain separate.

## API and service boundaries

The administrator endpoint is `/api/admin/data-center`. Read operations
select an area or item; JSON write operations use an explicit `action`
discriminant. Uploads use multipart form data rather than inline binary
JSON. Consumer context and policy-filtered export live under
`/api/data-center`. These endpoints reuse session authentication, origin
validation for writes, per-user rate limits, and private/no-store responses.
`/api/admin/data-center` answers 403 to a caller without an administrator
session, like every administration API (`tests/e2e/admin-control-panel.spec.ts`);
the shared handlers answer 401 anonymously, which stays true for
`/api/data-center`.

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

### Verification procedure

Run these against a scratch PostgreSQL database created for the purpose:

1. `prisma validate` and `prisma generate`.
2. `prisma migrate deploy` on an empty database, then
   `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`.
   The output must contain only the 21 database-only foreign keys and the four
   differences that already exist on `main`, as listed under "Migrations and
   database-only constraints". Any other line is new, undocumented drift.
3. The Data Center unit tests (`tests/unit/data-center-*`) and the mocked
   workflow and HTTP tests under `tests/integration`.
4. The real PostgreSQL tests with `DATA_CENTER_DATABASE_TESTS=1` and
   `DATABASE_URL` pointing at the migrated scratch database. Each test runs in
   a transaction that is always rolled back.
5. `npm run typecheck` and ESLint on the Data Center files.

### Initial checks (historical, before the unified branch)

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

- The persisted layer enum keeps DATA, KNOWLEDGE, INTELLIGENCE and CONTEXT by
  decision. Original files stay with `DataCenterImport` and evidence with
  `DataCenterEvidenceLink`, instead of ASSET and EVIDENCE layers. The Assets
  and Evidence pages are views over registered asset types and evidence links,
  not separate asset or evidence schemas.
- The lifecycle keeps its six states (no DEPRECATED). Only the organization
  permission keys `data-center.read` and `data-center.write` exist; finer
  per-operation permissions are not defined. `DataCenterItem.revision` is
  incremented by every version, evidence link, conflict resolution and quality
  assessment, but no command accepts an expected revision yet, so stale-review
  guards are not enforced.
- Organization-scoped access for a role needs `Permission` rows named
  `data-center.read` and `data-center.write` assigned to that role. No migration
  or seed creates them, so until an operator does, only organization owners and
  platform administrators have organization-scoped access.
- Robot grants are enforced in the service layer, but no HTTP route
  authenticates robots, so the trusted bounded mission-context contract and the
  robot runtime integration are not delivered.
- Ownership, declared license class, usage policy, attribution, structured
  coverage and explainable quality are delivered. Confidence is the existing
  seven-factor heuristic (`dc-confidence-v2-seven-factors`); its consistency
  factor stays at zero because no independent consistency assessment exists.
  Freshness is re-evaluated from stored dates, but there is no scheduled
  freshness review.
- Academy has targeted requests and approvals, but not the complete release
  classification/validity/level/mandatory policy or supervisor/committee
  robot-proposal workflow.
- Retrieval still has a 2,000-candidate cap; complete context-budget,
  department/location/date filtering, and consumption analytics are not
  production-accepted.
- Export covers permitted published retrieval rows (with ownership, usage
  policy and attribution columns), not the requested full
  metadata/evidence/version/source/audit interchange.
- PDF text extraction and a configured production malware scanner/semantic
  provider are unavailable by default.
- The Map contract exists and is tested, but neither the Map nor Projects use
  it yet.
- Full `next build`, SonarCloud, CodeQL and the final automated review have
  not been run on the unified branch as part of this foundation work.

Next work should close these gaps and run the full delivery gate before adding
more capabilities. No homepage, Auth, Map, or Project Analysis redesign is
needed to do so.
