# JENAN COMPETITOR ANALYSIS ENGINE — ARCHITECTURE & IMPLEMENTATION PLAN

## M0 status, authority and frozen baselines

**M0 PROPOSAL — AWAITING OWNER REVIEW. M1 NOT STARTED.**

The owner authorized architecture/planning only on 2026-10-21 and separately approved
a nonsquashed integration merge followed by this planning branch:

- Branch: `jenan-engines/competitor-analysis`.
- Parent integration merge: `c2856d4822786243f96528605686712244d5270c`.
- Merge parents: `f87c30e794df11c39d275434a4c223d5ade5d6e4` and
  `1792b31914153dba62a314abcdf01ccf25132496`.
- Market Final Technical SHA remains **`c54d647838c1ce10730277f3977abc4980c3715d`**.
  `1792b31914153dba62a314abcdf01ccf25132496` records the subsequent owner-approved
  freeze in documentation only; it is not a replacement technical SHA.
- Spatial Final Technical SHA remains `8d97baace8abd6889f400a56952e345f3068f3af`.
- Both engines: **TECHNICALLY COMPLETE — PENDING FINAL SONAR**. Frozen runtime/contracts;
  stop for explicit approval before a necessary shared change affects them.
- Data Center frozen baseline unchanged. No main merge, final tag or Sonar attempt.
- Integration basic regression: 193/193 existing tests PASS; merge tree equals the
  accepted Market branch tree, with Map/Data Center/Spatial/schema unchanged.

This document creates no runtime module, dataset, registry entry, migration, endpoint,
UI, database write, external collection or new engine execution.

## 1. Exact purpose and non-goals

Describe the **documented competitive supply** for a defined geography, sector/activity,
product/service segment and time: which establishments match an explicit definition,
how many are distinct, how coverage and attributes differ, and what cannot be measured.

An establishment listing is not automatically a verified operating competitor.
A company is not a branch; a branch is not a listing; a brand is not a legal entity.
Competition is not demand, saturation, investment attractiveness, success probability,
forecast revenue or a recommendation. No automatic population/competitor ratio becomes
an opportunity or shortage. No composite "competitor strength" score in v1.

## 2. Architecture and reuse

Proposed engine key/directory: `competitor-analysis`, under the existing engine tree.
Pure TypeScript contracts/validation/calculations + narrow Data Center/history adapters.

Reuse Shared Core unchanged:

- Engine input descriptors, envelopes, gaps/availability, rights/attribution and cost limits.
- Canonical normalization, code-point ordering, SHA-256 request/input/output determinism.
- Quantity/unit/dimension/time primitives and explainable confidence framework.
- Existing shared append-only Run/Input contracts and PostgreSQL tables for M4 history.

Existing persistence implementations are engine-specific, not a universal persistence
service: reuse the Shared contracts/tables and existing Data Center policies/checksums,
not Market/Spatial adapter imports or blind copies. If generic extraction would modify
a frozen engine, stop and request separate approval; do not do that during M0.

Data flow: `Data Center exact version -> validated typed dataset -> pure engine ->
existing Shared Run/Input evidence -> authorized exact historical replay`.
No competitor datastore. Economic/listing data need not be GeoJSON.

No direct Spatial or Market imports/calls. Future orchestrator-supplied spatial facts
must have an approved versioned contract with run/source hashes, period, scope, rights
and confidence. They do not grant Map access. In v1, use source-declared geographic
membership; no inferred radius/catchment membership or travel-distance calculation.
Radius/polygon requests lacking a suitable approved fact contract return unsupported/
NOT_COMPUTABLE, not a silently substituted administrative area.

## 3. Data Center inventory and proposed roles

Names below are **proposed engine contracts**, not changes to the frozen type registry.

| Role | Proposed typeKey | Required content |
| --- | --- | --- |
| `competitor.establishments` | `competitor-establishments` | Source record ids, explicit establishment/entity/branch/brand relationships, source claims, sector/activity, geography, operational evidence and dates |
| `competitor.attributes` | `competitor-attributes` | Establishment-linked product/service/price/capacity attributes, units, dates, evidence and limitations |
| `competitor.identity-links` | `competitor-identity-links` | Explicit source-backed equivalence/parent/branch links; never inferred from similar names |
| `competitor.dimensions` | `competitor-dimensions` | Versioned geography, sector/activity, segment, unit and attribute definitions/crosswalks |

Every dataset declares contract/version, role, coverage (geography/sector/time and
completeness), source/version, observation method and rights. Every row has stable source
identity, dated evidence and explicit unavailable fields; no silent repair/default-open.
Crosswalks must be source-backed/versioned; no guessed category equivalence.
Source content remains bounded under existing read and shared 2 MiB envelope limits;
large inventories need a separately approved immutable-artifact contract, not raised limits.

M2 discovery validates role/type, scope, temporal applicability, semantics and rights,
not dataset name similarity. Exact pin uses that version or explicitly fails; by-type/
asOf selection uses the existing deterministic trace with no alternate-content fallback.
Keep source/version/checksum, publication/effective/observation dates, quality, ownership,
license, usage and attribution throughout. Output cannot be more permissive than inputs.

## 4. Proposed input contract

`jenan.competitor-analysis.request/v1`:

- `scope`: country/administrative geography with versioned identity; sector/activity
  classification; optional explicit segment; `asOf` or explicit observation interval.
- `competitorDefinition`: versioned activity/product/service matching rules and
  counting unit **ESTABLISHMENT**; explicit treatment of inactive/unknown-status records.
- `analyses`: establishment inventory, observed distinct count, segment composition,
  comparable attribute summary and explicitly eligible historical changes.
- `data.roles`: exact versionId/optional expected checksum or deterministic type/asOf.
- `parameters`: declared filters, requested attributes/units and comparison/base periods.
- Trusted execution context supplies actor, evaluation instant, run id and timing;
  request cannot supply an authorization override, hidden estimate or arbitrary formula.

Reject unsupported analyses, contradictory scope/periods and excessive budgets before
reading sources. Sort only semantically unordered sets; preserve temporal sequence.
No interpolation, hidden clock, random identity resolution, external network or LLM.

## 5. Identity, taxonomy and calculation rules

Keep these independent axes rather than one ambiguous status:

| Axis | Proposed values / interpretation |
| --- | --- |
| Evidence class | OBSERVED, DERIVED, CONTEXTUAL; ESTIMATED excluded from v1 until a separate explicit method is approved |
| Matching class | VERIFIED_MATCH (documented classification criteria met), CANDIDATE, EXCLUDED, UNRESOLVED |
| Operational claim | ACTIVE, INACTIVE, UNKNOWN, CONFLICTED, with valid dates and source method; a listing alone does not prove ACTIVE |
| Availability | AVAILABLE, NO_COVERAGE, NOT_AVAILABLE, NOT_COMPUTABLE |
| Completeness | INVENTORY, SAMPLE, UNKNOWN, source-declared for the exact scope/period |

VERIFIED_MATCH means matching evidence, not an independent audit or a success claim.
Candidate/contextual listings remain separately labeled and do not inflate verified totals.

Identity policy proposal:

1. Source namespace + source record id identifies a record, not necessarily an entity.
2. Exact duplicate records are detected deterministically and reported.
3. Collapse multiple listings only with trustworthy stable establishment identifiers or
   explicit equivalence links. Different branches remain different establishments.
4. No fuzzy name/address/phone matching and no speculative merges.
5. Unresolved cross-source overlap means a cross-source **distinct total is
   NOT_COMPUTABLE**; report per-source counts and unresolved overlap, never sum blindly.
6. Identity conflicts and unexplained conflicting active/inactive claims remain gaps;
   do not choose the friendliest/latest claim without an approved precedence policy.

Deterministic v1 calculations:

- Inventory and distinct matching counts with counting unit, inclusion/exclusion reasons,
  period, coverage/completeness and complete source lineage.
- SAMPLE/UNKNOWN counts describe only observed records, never the whole market.
  A market-wide total is unavailable without scoped INVENTORY and resolvable identities.
- Segment counts/ratios require explicit definitions, declared multi-label treatment,
  valid positive denominator and stated denominator population. Multi-label percentages
  are not presented as disjoint shares summing to 100%.
- Optional price/capacity min/max/median only for compatible observed attributes:
  unit/currency, quantity basis, tax/delivery basis, product/service definition,
  observation interval and scope must agree. No FX/unit/tax conversion or imputation.
  Show sample size, missingness and method; price is not revenue.
- Historical count/attribute differences require compatible definition, identities,
  inventory universe/coverage, methodology, unit, geography, segment and periods.
  No percent/index with zero/invalid base. A new/removed listing does not prove an
  opening/closure; actual openings/closures require explicit source events (deferred).
- No market share, HHI/CR concentration, saturation, demand-gap, rankings or investment
  recommendation from establishment counts; these require separate evidence/contracts.

## 6. Proposed output contract and gaps

`jenan.competitor-analysis.result/v1` reuses Shared envelope and adds:

- scoped inventory entries, source claims, identity decisions and inclusion/exclusion traces;
- metric/outcome slots with nullable values, unit, counting basis, evidence class,
  availability, completeness, sample sizes and limitations;
- exact selection/source evidence, definitions/method versions, confidence breakdown/caps,
  rights/provenance and request/input/output hashes.

No records in a covering complete inventory can yield **0**. No source, partial/
unverified coverage or unresolvable identities cannot be represented as "no competitors".

| Condition | Result |
| --- | --- |
| Source does not cover requested geography/sector/time | NO_COVERAGE, null |
| Covered dataset lacks requested attribute/status evidence | NOT_AVAILABLE, null |
| Conflicting identities, invalid denominator or incompatible comparisons | NOT_COMPUTABLE, null |
| No authorized source / hidden exact version | Same generic unavailable behavior; no existence leak |
| Valid contextual candidate list only | CONTEXTUAL candidates and gaps, not verified market inventory |

Unavailable metrics carry no invented numeric confidence. Identity ambiguity may block
a total while leaving independent per-source observations usable and clearly labeled.

## 7. Proposed `competitor-confidence-v1@1.0.0`

Quality of competitive evidence, **not strength, popularity, market share or success**.
Reuse Shared explainable policy machinery, not either frozen engine's policy.

Proposed 100-point factors (require review before M1):
source quality 15; geographic/sector coverage 15; temporal relevance/freshness 15;
completeness 15; identity resolution 15; measurement/operating-status method 15;
rights/provenance 10. HIGH >=80, MEDIUM >=60, LOW >=35, else INSUFFICIENT.

Factor awards require explicit evidence; missing metadata earns no inferred points.
SAMPLE/UNKNOWN completeness and stale observations cap at LOW for market-wide claims;
unknown operational status cannot support an active-competitor total. Unresolved
duplicate identities block the distinct total, rather than merely lower its score.
Expired/inaccessible/invalid evidence is ineligible under current-read policy.
Unavailable rights block usage; missing required attribution blocks export.
Derived metrics cannot exceed the weakest necessary input's band. Per-metric
limitations, factor evidence, score/band and caps remain reproducible.

## 8. Proposed M1–M5 (five phases)

| Phase | Complete bounded objective / checkpoint |
| --- | --- |
| M1 | Contracts, identity/counting semantics, scope/time/units, confidence policy, normalization/hashes, gap states, limits and static boundaries; no Data Center connection |
| M2 | Read-only Data Center discovery/exact selection/checksum/access/rights, typed datasets/coverage validation and truthful actual inventory inspection; no new store |
| M3 | Deterministic identity decisions, inventory/counts/composition/compatible attributes and time changes, golden/adversarial calculations and complete lineage |
| M4 | Existing Shared Run/Input append-only atomic persistence, current-authorized exact historical replay with preserved matching/identity decisions and full hashes |
| M5 | Full technical acceptance, fresh migrations, Market/Spatial/Shared regressions, PostgreSQL/PostGIS, concurrency/load/rollback/limits, CodeQL on exact final SHA, types/lint/build, push/Desktop equality |

Five phases reuse already available Shared infrastructure and proven acceptance
patterns without rebuilding them. Identity correctness remains explicit M1/M3 work,
not an extra engine or a hidden fuzzy-matching service. Stop at each checkpoint for
owner review; M0 approval does not authorize all phases automatically.

## 9. Required acceptance matrix

- Same-name different branches; renamed same establishment; chain vs branch; duplicate
  rows; explicit equivalence; conflicting identifiers; multi-source unresolved overlap.
- Listed vs verified matching vs active status; closed/unknown/conflicted temporal claims.
- Covered complete empty inventory =0; unavailable/partial/outside coverage never =0.
- Exact pin/no fallback, by-type/asOf determinism, wrong role/type, malformed dataset,
  checksum and metadata tampering, coverage, withdrawn rights and current authorization.
- Price/capacity dimension/basis compatibility, sample size/missingness, multi-label
  denominators, comparable historical universe and zero-base guard; no invented openings.
- Stable hashes under set reordering; no mutation; strict runtime/result reproduction;
  weakest-input confidence, rights intersection, full calculation/source traces.
- Boundary AST tests for no direct engines/Projects/Map/network/AI/Data Center writes;
  only exact named adapters and existing Shared run nested-create permission.
- Atomic run/input commit, true nested-input rollback, append-only guards, concurrent
  ids/duplicates, owner/admin/no-existence-leak and revoked robot/member/source access.
- Bounded rows/versions/outcomes/bytes/work admitted before compute; explicit failure
  without truncation. Proposed initial budgets: 32 exact versions, 2,000 rows/version,
  10,000 rows total, 500 metric outcomes, 2 MiB envelope; inventory pagination/storage
  design must be reviewed if inventory evidence reaches those limits.
- Full previous-engine regressions, fresh existing migrations only in owned scratch DB,
  real committed concurrency/p50/p95 samples with disclosed fixture size; types/lint/build.
  No threshold invented as a production SLA; budgets finalized in M1/M5 before measurement.

## 10. Real-data acceptance and blockers

**REAL-DATA COMPETITOR ACCEPTANCE = BLOCKED / NOT VERIFIED.**

The latest configured local read-only check during Market M5 found no Data Center
source/version tables. No new authorized populated production connection has been
provided. This is not evidence that production competitor data are absent. M0 performs
no external scraping/collection and creates no synthetic production inventory.

Real acceptance needs authorized immutable versions with traceable identity/counting
units, explicit competitor classification, scope/time coverage and usable rights.
Manual source-backed spot checks should verify distinct establishments vs branches,
active evidence, duplicate links, exclusions and at least one genuine uncovered case.
Historical comparison additionally needs comparable real dated inventories or source
observations; a single POI snapshot cannot certify historical openings/closures.
Contextual POIs may validate contextual ingestion only, not verified competitor inventory.
Fixtures test function but never substitute for this acceptance.

Approval decisions requested before M1:

1. ESTABLISHMENT counting unit, strict explicit identity/equivalence, and no fuzzy merge.
2. Listed/candidate vs verified match vs operational-state separation; no claimed total
   market inventory from SAMPLE/UNKNOWN coverage.
3. v1 scope: source-declared administrative geography; compatible observed attribute
   summaries and historical comparisons, excluding radius inference, market-share/
   strength/ranking/recommendation and all estimates.
4. Proposed contracts/roles, five phases, initial limits and confidence policy above.

No implementation starts until the owner reviews and approves this proposal.
