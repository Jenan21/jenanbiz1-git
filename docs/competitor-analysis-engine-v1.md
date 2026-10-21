# JENAN COMPETITOR ANALYSIS ENGINE — ARCHITECTURE & IMPLEMENTATION PLAN

## M0 status, authority and frozen baselines

**M0 APPROVED at `88858341da8c016617cb380775e5aef12a0b244b`.
M1 CLOSED at `bde54c6d53a4062bb1edf7223d83328e98f34c6b`.
M2 CLOSED at `f8d974c206e25af32bc18472d94ad32eefbcb8c4`.
M3 CLOSED at `54c5c0fc02414b23087a08e47b747524b758556c`.
M4 CLOSED at `f1a7f7da1c0873ccdeb8a6e99db8b1f8d5937974`.
M5 LOCAL TECHNICAL GATES PASS — EXACT-SHA CODEQL / FINAL CLOSURE PENDING.**

The subsequent owner decisions replace establishment-only counting: model a unified
Competitor Entity separately from locations/branches and original source records.
The owner subsequently approved M0, accepted and closed M1 at the SHA above,
and explicitly authorized M2. After accepting and closing M2 at the SHA above,
the owner authorized M3, accepted and CLOSED it at the SHA above, then authorized
M4, accepted and CLOSED it at the SHA above, then authorized M5 final technical
acceptance only. No fourth engine is authorized.

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

M0 itself was documentation-only. M1 now adds pure contracts/helpers and synthetic
tests described in section 11; it creates no dataset, registry entry, migration,
endpoint, UI, database write, external collection or live integration.

## 1. Exact purpose and non-goals

Describe the **documented competitive supply** for a defined geography, sector/activity,
product/service segment and time: which entities/locations match an explicit definition,
how many unique competitors versus competitor locations are evidenced, where they are,
how documented dimensions differ, and what cannot be measured.

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

No direct Spatial or Market imports/calls. Orchestrator-supplied spatial facts
must have an approved versioned contract with run/source hashes, period, scope, rights
and confidence. They do not grant Map access. In v1, use source-declared geographic
membership. Density/proximity and candidate-location comparisons are in v1 only when
appropriate documented geography/facts are available; no inferred radius/catchment
membership, hidden geometry calculation or travel-distance calculation.
Radius/polygon requests lacking a suitable approved fact contract return unsupported/
NOT_COMPUTABLE, not a silently substituted administrative area.
Absence of spatial facts leaves a capability gap; it does not remove those approved
analyses from v1 or authorize calling Spatial directly. Their optional contract is
proposed below for review, not implemented or already supplied.

## 3. Data Center inventory and proposed roles

Names below are **proposed engine contracts**, not changes to the frozen type registry.

| Role | Proposed typeKey | Required content |
| --- | --- | --- |
| `competitor.entities` | `competitor-entities` | Namespaced competitorEntityId, entity definition, business/brand/control identity evidence and validity dates |
| `competitor.locations` | `competitor-locations` | Namespaced locationId/branchId, documented entity link or unresolved state, geographic membership, source records and dated operational claims |
| `competitor.attributes` | `competitor-attributes` | Explicit ENTITY or LOCATION-linked product/service/price/capacity attributes, units, dates, evidence and limitations; no branch-to-entity extrapolation |
| `competitor.identity-links` | `competitor-identity-links` | Typed SAME_ENTITY, SAME_LOCATION or LOCATION_OF_ENTITY links with source evidence/validity; brand association alone does not prove equivalence |
| `competitor.matching-rules` | `competitor-matching-rules` | Versioned target activity/product/service definitions and explainable DIRECT/INDIRECT/POTENTIAL/NOT_COMPARABLE/UNKNOWN rules |
| `competitor.dimensions` | `competitor-dimensions` | Versioned geography, sector/activity, segment, unit and attribute definitions/crosswalks |

Dataset contract identifiers proposed respectively:
`jenan.competitor.entities/v1`, `jenan.competitor.locations/v1`,
`jenan.competitor.attributes/v1`, `jenan.competitor.identity-links/v1`,
`jenan.competitor.matching-rules/v1` and `jenan.competitor.dimensions/v1`.
These replace the earlier establishment-only proposal; there is no registry migration.

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
  entity-definition reference; included relationship classes and explicit treatment
  of inactive/unknown-status records. No implicit union of direct/indirect/potential.
- `countingUnits`: explicit `UNIQUE_COMPETITOR_ENTITIES`, `COMPETITOR_LOCATIONS`, or both.
  Each metric retains its unit and inclusion rules; no default treats locations as entities.
- `analyses`: discovery/inventory, entity/location counts, relationship breakdown,
  concentration/distribution, compatible dimension comparisons, eligible historical
  changes, and conditional documented proximity/density/candidate-location comparisons.
- `data.roles`: exact versionId/optional expected checksum or deterministic type/asOf.
- `parameters`: declared filters, requested attributes/units, denominator population,
  comparison/base periods and optional bounded candidate-location references.
- Optional `spatialFacts`: proposed `jenan.competitor-analysis.spatial-facts/v1`,
  supplied by a trusted orchestrator, not an engine call or user assertion. Carries
  factId, subject/entity/location/candidate refs, exact source/run/hash lineage,
  geography/boundary version, period/asOf, distance/area unit and method, matching
  inventory universe, coverage, evidence, confidence, limitations and rights.
  Only allowlisted fact types/methods can be consumed; missing/incompatible facts
  yield explicit gaps. No shared contract or orchestrator implementation is added in M0.
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
| Match relationship | DIRECT, INDIRECT, POTENTIAL, NOT_COMPARABLE, UNKNOWN, relative to the requested activity/segment and rule version |
| Match evidence state | SUPPORTED, AMBIGUOUS, INSUFFICIENT; independent of relationship and operational status |
| Identity state | RESOLVED, SEPARATE_UNVERIFIED, AMBIGUOUS, CONFLICTED, with explicit decision reasons |
| Operational claim | ACTIVE, INACTIVE, UNKNOWN, CONFLICTED, with valid dates and source method; a listing alone does not prove ACTIVE |
| Availability | AVAILABLE, NO_COVERAGE, NOT_AVAILABLE, NOT_COMPUTABLE |
| Completeness | INVENTORY, SAMPLE, UNKNOWN, source-declared for the exact scope/period |

A DIRECT match requires source-backed same-need/product/service/activity criteria;
INDIRECT requires an explicit substitution/complementary-competition rule with evidence.
POTENTIAL is a documented possible relationship, not confirmed active competition.
NOT_COMPARABLE requires a documented exclusion rule; UNKNOWN means insufficient
classification evidence, not proof of noncompetition. Every decision includes target,
rule id/version, reason, evidence refs and applicable time/scope.
Name similarity, proximity or broad category alone cannot establish DIRECT/INDIRECT.
Activity/strength is a separate evidence axis: no invented percentage-strength field.

Identity policy proposal:

1. `competitorEntityId` identifies the unified competitor under a declared versioned
   entity definition. `locationId`/`branchId` identifies its physical operating location.
   `sourceRecordId` is the original source-namespaced record (version separately pinned).
   None of these ids may be silently used as another.
2. Multiple source records can describe one location; multiple locations can link to
   one entity. A location's entity link may be unresolved: do not fabricate one unique
   business per location. Canonical ids/links and decision evidence are deterministic.
3. Collapse records only through trustworthy identifiers or explicit same-entity/
   same-location evidence. Franchise, brand, chain and legal-ownership relationships
   are typed, not automatically merged. Missing/conflicting control evidence stays ambiguous.
4. No fuzzy name/address/phone matching and no speculative merges.
5. Unresolved cross-source overlap means a cross-source **distinct total is
   NOT_COMPUTABLE**; report per-source records and resolved counts as scoped evidence,
   not an exact global total. Separate unresolved records are not proven distinct entities.
6. Identity conflicts and unexplained conflicting active/inactive claims remain gaps;
   do not choose the friendliest/latest claim without an approved precedence policy.

Deterministic v1 calculations:

- Inventory and separate entity/location counts with counting unit, relationship filter, inclusion/exclusion reasons,
  period, coverage/completeness and complete source lineage.
- SAMPLE/UNKNOWN counts describe only observed records, never the whole market.
  A market-wide total is unavailable without scoped INVENTORY and resolvable identities.
- One evidenced competitor entity with fifteen linked branches yields **1 unique
  competitor / 15 competitor locations**, never fifteen unique businesses.
- Location distribution and entity-associated location concentration may report branch
  shares only with compatible scoped counts, explicit unit/universe and a valid denominator.
  Name these "share of observed competitor locations", not market/sales share.
  V1 concentration means this documented entity/location distribution; HHI/CR or
  other composite indices need separate formula/denominator approval before exposure.
  No sales/revenue concentration or saturation inference.
- Density requires matching scoped location count and valid positive covered area;
  label observed-sample density vs complete-inventory density. Proximity consumes
  documented compatible distance facts only, not raw coordinates as distance proof.
- Candidate-location comparisons use the same entity definition, matching policy,
  asOf, coverage, inventory universe and spatial method; expose side-by-side facts
  and gaps only, without an overall winner, success score or investment recommendation.
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
- No undocumented market share, sales/profit estimates, invented strength, saturation,
  demand-gap, final investment ranking/recommendation, live internet reviews/ratings,
  scraping or AI fame/success inference.

## 6. Proposed output contract and gaps

`jenan.competitor-analysis.result/v1` reuses Shared envelope and adds:

- scoped inventory entries, source claims, identity decisions and inclusion/exclusion traces;
- `jenan.competitor-analysis.entity/v1`: competitorEntityId, entity-definition ref,
  resolved identifiers, typed relationships, identity state and source evidence.
- `jenan.competitor-analysis.location/v1`: locationId/branchId, nullable evidenced
  competitorEntityId, geography, operational claims and original sourceRecordRefs.
- `jenan.competitor-analysis.match/v1`: entity/location ref, relationship,
  evidence state, target/rule version, reason and dated evidence.
- `jenan.competitor-analysis.metric/v1`: metric definition/method, entity/location/
  candidate refs, explicit counting unit/denominator, relationship filter, geography,
  period/asOf, value or null, evidence, confidence, limitations, provenance and rights.
- metric/outcome slots with nullable values, unit, counting basis, evidence class,
  availability, completeness, sample sizes and limitations;
- `coverageStatus`: COMPLETE, PARTIAL, NONE or UNKNOWN, independent of metric availability
  and the unchanged Shared status vocabulary. PARTIAL is never silently coerced to zero;
  an observed partial count may be shown with its limitation while the total remains null.
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
| Partial/sample inventory | coverageStatus PARTIAL; labeled observed subset if valid, requested exact total unavailable/null |
| Valid contextual candidate list only | CONTEXTUAL candidates with UNKNOWN/POTENTIAL evidence as supported, not confirmed market inventory |

Unavailable metrics carry no invented numeric confidence. Identity ambiguity may block
a total while leaving independent per-source observations usable and clearly labeled.

## 7. Proposed `competitor-confidence-v1@1.0.0`

Quality of competitive evidence, **not strength, popularity, market share or success**.
Reuse Shared explainable policy machinery, not either frozen engine's policy.

Owner-approved M0 100-point factors, implemented independently in M1:
source quality 15; identity certainty 15; category/activity match certainty 15;
geographic coverage 10; temporal relevance/freshness 10; completeness 15;
measurement method 10; provenance/rights 10.
HIGH >=80, MEDIUM >=60, LOW >=35, else INSUFFICIENT.

Factor awards require explicit evidence; missing metadata earns no inferred points.
SAMPLE/UNKNOWN completeness blocks a whole-market total rather than granting one
with low confidence; valid subset metrics are explicitly limited and capped at LOW.
Stale observations cap at LOW;
unknown operational status cannot support an active-competitor total. Unresolved
duplicate identities block the distinct total, rather than merely lower its score.
Expired/inaccessible/invalid evidence is ineligible under current-read policy.
Unavailable rights block usage; missing required attribution blocks export.
Derived metrics cannot exceed the weakest necessary input's band. Per-metric
limitations, factor evidence, score/band and caps remain reproducible.

## 8. Proposed M1–M5 (five phases)

| Phase | Complete bounded objective / checkpoint |
| --- | --- |
| M1 — Contracts, Identity, Matching & Confidence | Entity/location/source contracts, relationship rules, scope/time/units, independent confidence, normalization/hashes, gaps/limits/static boundaries; no Data Center connection |
| M2 — Data Center Integration & Source Validation | Read-only discovery/exact versions/checksum/access, dataset/coverage validation, rights/provenance and truthful inventory inspection; no new store |
| M3 — Competitor Analytics | Entity vs location counts, direct/indirect breakdown, concentration/distribution, available proximity/density facts, dimension/candidate comparisons and gaps with full lineage |
| M4 — Persistence, Historical Replay & Reproducibility | Existing Shared Run/Input atomic persistence, current-authorized exact replay, preserved identity/matching decisions and hashes |
| M5 — Final Technical Acceptance | Regression, fresh migrations, PostgreSQL/PostGIS as applicable, load/performance/security/boundaries, exact-SHA CodeQL, real-data acceptance if available, types/lint/build and push/Desktop equality |

Five phases reuse already available Shared infrastructure and proven acceptance
patterns without rebuilding them. Identity correctness remains explicit M1/M3 work,
not an extra engine or a hidden fuzzy-matching service. Stop at each checkpoint for
owner review; M0 approval does not authorize all phases automatically.

## 9. Required acceptance matrix

- One entity/fifteen branches; fifteen listings of one branch; unresolved franchise/
  brand links; unique-entity count distinct from location count; no fake entity per listing.
- Same-name different branches; renamed same establishment; chain vs branch; duplicate
  rows; explicit equivalence; conflicting identifiers; multi-source unresolved overlap.
- All five relationship classes, reasons/evidence and match uncertainty independent
  from activity; name/category/proximity alone never establishes certain competition.
- Documented concentration basis/denominator, area/distance fact scope/hash/rights,
  absent spatial facts, invalid area and compatible candidate comparisons without ranking.
- Listed vs supported matching vs active status; closed/unknown/conflicted temporal claims.
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

What can be established now: existing Shared building blocks, accepted exact-version/
rights/history patterns, planning-branch isolation and regression evidence. These are
architectural prerequisites, not proof of real competitor identities, counts or coverage.
Actual entity resolution, DIRECT/INDIRECT assignments, activity, concentration, geographic
density/proximity and candidate comparisons remain **NOT VERIFIED** until suitable
authorized datasets/facts are supplied. Synthetic tests can validate future mechanics only.

Real acceptance needs authorized immutable versions with traceable entity/location/
source-record identities, explicit competitor classification, scope/time coverage and usable rights.
Manual source-backed spot checks should verify distinct establishments vs branches,
active evidence, duplicate links, exclusions and at least one genuine uncovered case.
Historical comparison additionally needs comparable real dated inventories or source
observations; a single POI snapshot cannot certify historical openings/closures.
Contextual POIs may validate contextual ingestion only, not verified competitor inventory.
Fixtures test function but never substitute for this acceptance.

Owner decisions incorporated: unified competitor entity distinct from locations and
source records; deterministic limited identity handling; five relationship classes
separate from activity; descriptive concentration/distribution and conditional spatial/
candidate facts in v1; Data Center exact versions; independent eight-factor confidence;
zero only with proved coverage; five phases approved in principle; Sonar deferred.

The owner approved the revised contracts and proof limits at the M0 SHA above.
The historical M1 checkpoint below describes its foundation-only scope; the owner
then accepted and **CLOSED M1 at `bde54c6d53a4062bb1edf7223d83328e98f34c6b`**.
Local, remote and Desktop archive HEADs were verified equal at that accepted SHA.
M2 is documented separately in section 12; **M3 NOT STARTED**.

## 11. JENAN COMPETITOR ANALYSIS ENGINE — M1 CHECKPOINT REPORT

### Scope and final contracts

M1 is a pure TypeScript foundation, not a production source reader or complete
analytics runner. No adapters, endpoints, stores, migrations or external calls.
Engine version: `1.0.0-m1`. Independent contracts:

- `jenan.competitor-analysis.request/v1`, `jenan.competitor-analysis.result/v1`.
- `jenan.competitor-analysis.entity/v1`, `...location/v1`, `...match/v1`,
  `...metric/v1`, and typed `...identity-link/v1`.
- Bounded M1 evidence/coverage contracts `...evidence/v1` and `...coverage/v1`.

The request declares versioned administrative geography, activity taxonomy/code,
nullable segment, exact `asOf`, entity definition, inclusion relationships, activity
filter, explicit entity/location counting units, analyses and Data Center role selectors.
Selectors describe exact version/checksum pins or typeKey/asOf; they perform no read.
Trusted context supplies the evaluation instant externally; no actor/authorization
override, runtime clock or arbitrary formula is accepted. The normalized request hash
includes that explicit evaluation instant. Only `IDENTITY_MATCHING` and the `COUNTS`
semantic guard are enabled at M1; later analysis identifiers are reserved but rejected
explicitly by M1 normalization. No M3 distribution, spatial, historical or comparison
runner is implemented.

M1 requires canonical UTC millisecond timestamps (`...ss.SSSZ`): noncanonical/higher
precision is rejected, never silently rounded. Validity intervals are half-open.
The request uses an explicit snapshot, not an inferred observation interval.
Non-null segment membership is NOT_COMPUTABLE until a documented segment contract
is available; no broad-activity or administrative-radius substitution.

The result extends the unchanged Shared envelope with normalized evidence, coverage,
source-record references, reproducible matches and typed metrics. Quantity units retain
UNIQUE_COMPETITOR_ENTITIES versus COMPETITOR_LOCATIONS. Geography, classification,
date, method and inventory universe must agree with request/coverage. Validation
re-evaluates M1 decisions/count semantics and confidence, not just JSON shape/hashes.
A caller cannot rehash an invented count, classification or widened rights into validity.
The existing Shared envelope and pure Run/Input record mapping remain compatible;
no database save or replay is implemented.

### Identity and matching

- Canonical entity/location ids are namespaced and distinct. Source identity is
  `(inputId, sourceNamespace, sourceRecordId)`, with exact version/hash/rights in the
  Shared descriptor. Identical original ids in different namespaces remain separate.
  Multiple original records may evidence one canonical location.
- Only declared authoritative identifiers or explicit source links establish RESOLVED
  identity. Exact repeated rows collapse; conflicting rows for one canonical id fail.
  No name/address/phone similarity, brand/franchise equivalence, random id, speculative
  merge or one-business-per-listing rule exists.
- Grouping preserves link states/evidence. Conflicting resolved source bindings and
  multiple location ids for one established entity branch fail explicitly.
  Unknown entity links remain null/ambiguous; established locations remain independently
  usable when the unique-business total is blocked.
- Typed link contracts describe SAME_ENTITY / SAME_LOCATION / LOCATION_OF_ENTITY;
  ambiguous/conflicted links carry no canonical identity. M1 groups declared canonical
  bindings. Loading source link datasets/policies belongs to M2, not unsupervised
  entity resolution in M1.
- DIRECT / INDIRECT / POTENTIAL / NOT_COMPARABLE need an applicable versioned rule,
  matching taxonomy, explicit same-need/substitution/potential/exclusion criterion
  and dated source evidence. DIRECT/INDIRECT additionally require a specific activity,
  never a broad category.
- Missing/conflicting rules give UNKNOWN with INSUFFICIENT/AMBIGUOUS evidence. Every
  decision carries scope/asOf, rule refs, reason, evidence, confidence or an explicit
  unscorable state, and limitations. DIRECT does not certify ACTIVE operation or strength.

### Count semantics and gaps

The M1 count helper is an inclusion/identity/coverage guard for later M3 analytics:

- One entity with 15 branches gives **1 unique competitor / 15 locations**.
  Fifteen original records for one established branch give **1 location**, not 15.
- Exact scoped totals, including zero, need a complete attested location inventory,
  explicit matching enumeration, eligible sources/methods and resolved identities
  appropriate to the unit. Unknown matching/activity is not silently excluded.
- Partial/sample/unknown inventory never supplies a whole-market total. A valid
  positive subset is labeled separately (`observedSubset` / `OBSERVED_SUBSET`);
  scoped total stays null. No positive observations in incomplete data give
  NO_COVERAGE, not zero.
- Missing scope evidence: NOT_AVAILABLE. Incompatible geography/activity/time/entity
  definition: NO_COVERAGE. Unresolved/incompatible identity, method, membership or
  inclusion decisions: NOT_COMPUTABLE.
- Shared-compatible results always include the requested scoped-total slot.
  PARTIAL subset metrics accompany, never replace, that unavailable/null total.
  Missing/partial slots require subject-specific gaps.
- The combined catalog reuses Shared gaps and adds
  COMPETITOR_IDENTITY_UNRESOLVED, COMPETITOR_MATCH_UNKNOWN,
  COMPETITOR_COVERAGE_INCOMPLETE. Unavailable totals have no invented confidence.

### Independent confidence and rights

`competitor-confidence-v1@1.0.0`, POINTS_100, EXPLAINABLE_HEURISTIC,
`isProbability=false`. Deterministic factor points:

| Factor | Max | Documented award |
| --- | ---: | --- |
| sourceQuality | 15 | floor(measured quality × 15); absent/future measurement 0 |
| identityCertainty | 15 | resolved 15; separate-unverified 5; ambiguous/conflicted 0 |
| activityMatch | 15 | supported 15; ambiguous 5; insufficient 0 |
| geographicCoverage | 10 | complete 10; partial 5; unknown 0; none ineligible |
| freshness | 10 | fresh within interval 10; stale/elapsed 3; unknown 0 |
| completeness | 15 | inventory 15; sample 5; unknown 0 |
| measurementMethod | 10 | documented/versioned 10; limited 5; unsupported ineligible |
| rightsProvenance | 10 | documented rights with license class 10; undeclared class 5 |

Use the weakest necessary input per factor, stable input-id ordering for ties and
Shared thresholds HIGH>=80 / MEDIUM>=60 / LOW>=35.
Partial/sample/unknown inventory, uncertain identity/matching, stale/unknown freshness
and unverified evidence/undeclared license cap at LOW; absent/future-dated quality
measurement caps at MEDIUM.
Required derived operands constrain both same-policy factor points and band;
INSUFFICIENT or foreign-policy operands cannot silently be upgraded.

Unsupported methods, missing provenance/usage, expired/future source evidence,
CONFLICTED/ESTIMATED source evidence, expired usage decisions or denied/unverified
analysis usage are unscorable; no full or partial count is derived from them.
Source usage decisions are explicit trusted descriptors, not live authorization in M1;
M2 must obtain them through Data Center policy. Export permission is not analysis
permission. Restricted export can coexist with permitted analysis.
Shared rights intersection and attribution remain exact; output export never becomes
more permissive than inputs. Checksums are retained, not claimed verified against live
content at M1. Confidence describes evidence, never strength or success probability.

### Limits and static boundaries

- At most 32 input versions/selections, 2,000 source-record descriptors, 2,000 canonical
  entities, 2,000 canonical locations and 100 rules per M1 evidence bundle.
  These bounded foundation contracts stay below the proposed 10,000 total-row ceiling;
  no per-version record count exceeds 2,000.
- At most 500 metrics across the complete result, 7 sections, and the unchanged
  **2 MiB canonical JSON** ceiling for request/evidence/complete result.
  No silent truncation, overflow fallback, pagination or budget increase.
- AST tests permit only own pure modules, Shared Core and zod. They actively reject
  Spatial/Market/Projects/Map/Data Center service imports, database/filesystem/network/
  AI dependencies, dynamic/type-import escapes, writes, hidden clocks/randomness,
  environment reads and logging. No adapter directory exists.
- No revenue/profit/share estimate, success probability, strength percentage,
  recommendation, scraping or unapproved geography calculation.

### Validation, changed files and backward compatibility

Every test dataset is **Fixtures / Synthetic**, not real competitor acceptance.
New foundation/confidence/output/static tests run with all current Shared/Spatial/
Market unit regressions. TypeScript, zero-warning scoped ESLint, existing Map asset
check and production Webpack build pass; build completes **161 static-generation tasks**.
Final combined unit gate: **1,575/1,575 PASS across 45 files in 61.07 seconds**:
Competitor M1 **129**, frozen Market **338**, Shared/Spatial **1,108**.
The M1 tests include existing Shared Run/Input record conversion without a database.
This is test-suite duration, not a production throughput or SLA measurement.
Final production build compiles in 79 seconds, performs its own TypeScript check,
and completes 161 static-generation tasks. The final delivery report records the
implementation SHA and verified Local/Remote/Desktop equality.
`git diff --check` is required before commit.
No PostgreSQL/Data Center/PostGIS integration test is claimed at M1: there is
no new adapter/schema; actual integration begins at M2. No visual/responsive QA is
applicable because no UI changes.

Production additions under `services/analysis-engines/competitor-analysis/`:
`model.ts`, `request.ts`, `identity.ts`, `matching.ts`, `confidence.ts`, `counts.ts`,
`contracts.ts`, `index.ts`.
Tests: `tests/unit/competitor-analysis-foundation.test.ts`,
`tests/unit/competitor-analysis-confidence-contracts.test.ts`,
`tests/unit/competitor-analysis-boundaries.test.ts`,
`tests/unit/support/competitor-analysis-fixtures.ts`.
Documentation: this file and `docs/analysis-engines.md`.
No dependency manifest or existing engine/global boundary test was modified.

Backward compatibility is additive: Shared Core, frozen Spatial/Market runtime,
Data Center, Map, schema, Auth/RBAC and Projects remain unchanged.

**REAL-DATA COMPETITOR ACCEPTANCE = BLOCKED / NOT VERIFIED.**
M1 proves synthetic mechanics only. It does not inspect production inventory or
establish that competitor data are absent. Actual identities, counts, matching,
activity and coverage remain NOT VERIFIED.

| Boundary / later phase | Status |
| --- | --- |
| Map changed | NO |
| Data Center frozen baseline changed | NO |
| Spatial changed | NO |
| Market changed | NO |
| Shared Core changed | NO |
| M2 started | NO |
| Main merge | NO |
| Final tag | NOT CREATED |
| Sonar | DEFERRED / PENDING until all seven technical engines are complete |

**M1 owner review complete: CLOSED at the SHA recorded above.**

## 12. JENAN COMPETITOR ANALYSIS ENGINE — M2 CHECKPOINT REPORT

### Scope and read capability

M2 adds a read-only Data Center provider and pure source preparation, not an analytics
runner, datastore, public API or persistence implementation. The accepted M1
request/result contracts, confidence policy and count guards retain their version
and behavior. Preparation returns `jenan.competitor-analysis.prepared-inputs/v1`:
normalized request/evaluation instant/hash, per-role states/reasons/selection trace,
exact metadata and validated datasets, Shared inputs/hash, normalized evidence,
coverage, M1 matching decisions, intersected rights, attribution, gaps and work counts.
No production counts, distribution/comparison runner or historical replay is added.

The sole provider imports existing Data Center discovery/exact-content services
and pure actor/error vocabulary only. Actor, evaluation time, organization, specialty
and mission context come from trusted server context, never the request body.
Trusted actor/context are copied when creating the provider.
Organization scope is rechecked on exact reads, not just by-type discovery.
Current Data Center source/robot authorization runs for every read; its policy is
not replaced by an engine-specific authorization system.

- Exact pins discover/read only their exact version and optional checksum.
- By-type selection delegates to `dc-version-selection-v1`, with explicit request
  `asOf`, exact role/type and a bounded candidate trace. No title/name heuristic.
- Missing, inaccessible, superseded and withdrawn versions remain unavailable,
  with no alternate dataset, prior version, synthetic content or other-engine fallback.
- Discovery and reader version/source/metadata/checksum must agree. The existing
  Data Center reader recomputes its canonical version checksum, not just the raw
  content string or stored checksum field. Corruption and pin mismatch block input.
- Data Center backend/programming/policy errors propagate explicitly; only documented
  unavailable/integrity errors map to typed source states.
- Runtime performs no registry, dataset, source, usage, event, audit, run or input write.
  No Prisma/driver/network dependency is added to Competitor production code.

### Dataset, source-record and identity contracts

Six strict, independently versioned dataset contracts implement the proposed roles
in section 3: `jenan.competitor.entities/v1`, `...locations/v1`,
`...matching-rules/v1`, `...identity-links/v1`, `...attributes/v1`,
`...dimensions/v1`. The corresponding type keys remain **proposals, not new
production registry entries**.

Required roles are entities, locations, matching-rules and dimensions.
Attributes and identity-links are validated if explicitly supplied.
Each dataset declares its source id, source records, geographic/activity/entity/
segment coverage, half-open validity, completeness, limitations and role-specific rows.
The source id must match the authorized Data Center metadata.
Local source records use the explicit `SELF` token, bound only after an authorized
exact read to `dc:<versionId>`. Other-version evidence must resolve to a source record
from another version explicitly selected in the same bundle. A dataset cannot
impersonate another version. Duplicate original records in one version are rejected.

- Entity, location/branch and original record ids stay distinct.
- Canonical definitions, location geography/activity and rule criteria must be declared
  by the selected versioned dimensions dictionary.
- Missing/broad/conflicting category evidence gives UNKNOWN, not invented DIRECT.
  INDIRECT requires documented substitution, not a relabeled same-need rule.
- Resolved cross-source links must agree with explicit canonical row bindings;
  they do not establish a speculative merge. Ambiguous/conflicted link datasets
  block preparation with NOT_COMPUTABLE rather than silently produce a distinct total.
  Ambiguous entity links on otherwise established locations retain the accepted M1
  behavior: unique-business total null; resolved locations may remain usable.
- Attribute/link subjects, evidence, canonical targets, scope and row/source-record
  validity are verified. Future observations are rejected.
- Exactly one location inventory universe is supported in M2. Multiple selected
  location inventories explicitly return NOT_COMPUTABLE until a documented partition
  policy exists; no accidental union, overlap deduction or invented deduplication.

### Coverage, rights, confidence and limits

Geography/category/entity definition/segment/time coverage is checked before evidence
assembly. Metadata and dataset country/region assertions cannot contradict each other.
The location inventory must attest the exact request scope/entity definition and
enumerate the supplied in-force canonical locations with location-source evidence.

Missing authorization/source yields NOT_AVAILABLE; uncovered scope/time yields
NO_COVERAGE; invalid/incompatible evidence yields NOT_COMPUTABLE. Partial inventory
remains PARTIAL in coverage and the unchanged M1 count guard returns a null scoped
total, not zero; a positive observed subset is separate.
Preparation status AVAILABLE means usable validated inputs, not complete market coverage.
No 0-competitor claim is made from absent/partial data.

Exact source/version/checksum/origin/upstream links, publication/freshness, ownership,
license/usage/export restrictions, attribution, coverage, measured quality and
source-record methods/claims remain traceable. Current authorized reads establish
the explicit analysis-usage descriptor; this captured descriptor is not future
authorization or a replay capability. `competitor-confidence-v1@1.0.0` remains unchanged:
confidence measures evidence quality, never strength or success. Restricted export
does not imply denied analysis, and derived rights never become more permissive.

Bounds: 32 total selected versions including implicit required roles; 100 returned
discovery candidates; 200,000 content characters/version before parsing; 2,000 rows
including source records/version; 10,000 parsed rows/run; the stricter existing
combined M1 evidence limits; 100 rules; 500 future result metrics; unchanged 2 MiB
canonical JSON ceiling. Limits reject explicitly; no truncation or silent fallback.

### Verification and evidence status

All new PostgreSQL datasets and unit source DTOs are **Fixtures / Synthetic**.
Real PostgreSQL execution is not real competitor data acceptance.
Each new integration fixture transaction is rolled back; proposed type registration
is test-only. Checksum corruption injection temporarily changes only the owned
synthetic scratch fixture's immutable trigger inside its rolled-back transaction,
following existing integration-test practice, never production behavior.

Final unit gate: **1,749 PASS, 3 existing browser-only tests SKIPPED**, across
58 passing files and one skipped file, 83.90 seconds:
Competitor **194**, Market **338**, Shared **239**, Spatial **869**, Data Center **109**.
All 47 engine files / **1,640 engine tests PASS**, with zero skips.
The three existing Data Center UI/browser tests require their separate browser mode;
there are no UI changes or claims of running that mode.
The focused new PostgreSQL suite passes **10/10** after all **78 existing migrations**
deploy to a fresh owned scratch database. Its 15-location / four-source preparation
measured **234.84 ms** on this local synthetic fixture, excluding publication/setup.
This is an observation, not a production latency/load/SLA claim.

Final database regression gate: **351/351 PASS across 14 files**, zero skips/failures:
Competitor **10**, Market **68 + 5 committed acceptance**, Data Center/provider **138**,
Spatial/PostGIS **130**. The 346-test regression run took **293.09 seconds**;
the five committed-load acceptance tests took **10.44 seconds** in a separate fresh
database. All 78 existing migrations applied successfully to each owned database;
both were dropped after verification. No migration/schema edit or configured DB reset.
Final full-gate Competitor preparation measured **491.28 ms** for the same
four-source/15-location synthetic size. Market regression telemetry: eight committed
runs/concurrency four in **2,620.59 ms** (max **1,832.15 ms**); sixteen exact replays/
concurrency four in **1,440.96 ms** (max **441.54 ms**). These verify the frozen
Market regression only, not a new Competitor persistence/load feature.

Initial harness attempts exposed the existing Market committed-load suite's required
database name and committed fixtures contaminating by-type discovery in other suites.
The final harness isolates that suite in its own owned fresh database; no frozen test
or source change was made. An initial concurrent run also exceeded an existing Spatial
latency bound; the final isolated gate passed its original threshold without relaxation.
An initial build exited natively during host memory pressure; the real production
retry used one worker and a 3 GiB Node heap, with no skipped TypeScript/static checks.

TypeScript: PASS. Scoped ESLint: PASS with zero warnings. Existing Map asset check:
PASS. Production Webpack build: PASS, compilation **30.9 seconds**, built-in TypeScript
**33.7 seconds**, **161/161 static-generation tasks**. `git diff --check`: PASS.
Build-only generated route-reference edits are restored; no dependency/config change.
CodeQL is not run for M2; the final technical scan belongs to M5.
No UI change: responsive/visual acceptance is not applicable.

The read-only configured loopback schema probe found no Data Center tables.
No authorized populated production connection was supplied or accessed.
This does **not** establish that the production Data Center lacks competitor or
market data. Actual entities, branches, categories, coverage, activity and counts are
**NOT VERIFIED**. Do not create data just to satisfy acceptance.

**REAL-DATA COMPETITOR ACCEPTANCE = BLOCKED / NOT VERIFIED.**

New production files: `data-port.ts`, `datasets.ts`, `data-sources.ts`,
`adapters/data-center-provider.ts`. Additive exports/gap in `index.ts`/`contracts.ts`.
New tests: `competitor-analysis-data-sources.test.ts`,
`competitor-analysis-data-provider.test.ts`, `support/competitor-data-fixtures.ts`,
and `competitor-analysis-data-center.integration.test.ts`.
Competitor and global boundary tests allow exactly the new provider and pure DTO;
no accepted engine capability is broadened. Documentation changes are limited to
this checkpoint and `docs/analysis-engines.md`.

| Boundary / later phase | Status |
| --- | --- |
| Map changed | NO |
| Data Center frozen baseline changed | NO |
| Spatial changed | NO |
| Market changed | NO |
| Shared Core changed | NO |
| Schema / migrations changed | NO |
| Separate Competitor Data Store | NO |
| M3 started | NO |
| Main merge | NO |
| Final tag | NOT CREATED |
| Sonar | DEFERRED / PENDING until all seven technical engines are complete |

The preceding table records the M2 checkpoint boundary, not the current M3 state.
The owner subsequently accepted and CLOSED M2 at
`f8d974c206e25af32bc18472d94ad32eefbcb8c4` and explicitly authorized M3 only.

## 13. M3 checkpoint — deterministic descriptive competitor analytics

**M3 TECHNICALLY COMPLETE — CHECKPOINT FOR OWNER REVIEW. M4 NOT STARTED.**

### Contracts and execution

`analytics.ts` implements bounded pure calculations; `engine.ts` composes the accepted
M2 port, captured typed preparations and a strictly validated Shared-compatible result.
The narrow existing Data Center adapter adds `runCompetitorDataCenterAnalysis`; no
new provider capability, data store, registry, endpoint, UI or database write is added.

Request/result contract identifiers remain `jenan.competitor-analysis.request/v1` and
`jenan.competitor-analysis.result/v1`. M3 results carry engine version `1.0.0-m3`
and use `competitorAnalyticsResultSchema` / `assertCompetitorAnalyticsResult`.
The accepted `1.0.0-m1` result schema and validator are retained; an M1 result cannot
masquerade as a result for newly enabled M3 analyses.

Optional request parameters explicitly declare observed attribute selectors and their
comparison basis, independently pinned earlier historical sources, or candidate
geographies. IDs/pins are deduplicated and canonicalized; unused parameters, excessive
combined selections, future baselines and attribute windows after the requested
snapshot are rejected before source I/O.

### Implemented facts and guarded calculations

- **Counts:** unique resolved competitor entities and established locations/branches
  remain distinct. One verified entity with 15 branches yields one unique competitor
  and 15 locations. Included/excluded inventory entries retain classification and
  identity reasons. Ambiguous entity identity cannot establish a unique-business total.
- **Matching breakdown:** DIRECT, INDIRECT, POTENTIAL, NOT_COMPARABLE and UNKNOWN
  retain the accepted explicit-rule/evidence semantics. Requested relationship
  subsets are reported separately. An entity may occur in more than one relationship
  subset; overlapping business counts are not added as a disjoint partition.
- **Distribution:** entity-associated included locations divided by an explicit total
  or observed-subset denominator. Resolved identity, current validity and a positive
  denominator are required. This is a location distribution, never sales share,
  market share, competitor strength, saturation or an investment recommendation.
- **Observed dimensions:** documented numeric attributes by subject and exact
  ATTRIBUTE/UNIT dictionary references, with observed/missing sample sizes, individual
  facts and min/max/median. Product, quantity basis, currency, tax, delivery basis and
  observation window must agree exactly. No conversions, duplicate-subject selection,
  contextual-to-observed promotion or imputation. Incomplete samples stay PARTIAL;
  their confidence is conservatively capped LOW.
- **Historical count changes:** comparable complete snapshots support `current - base`,
  `(current - base) / base * 100`, and `current / base * 100`. Identity/inventory
  definitions, scope, classification rules and documented source/method policy must
  remain comparable. Negative changes are valid; a zero base permits absolute change
  but leaves percentage/index null. Missing/incompatible snapshots remain gaps.
  This checkpoint implements historical **count** comparisons; observed attribute
  comparison is current-snapshot side-by-side/sample statistics, not an invented
  historical attribute series or historical replay.
- **Conditional spatial facts:** no approved proximity/area/spatial-facts contract is
  supplied at this checkpoint. Density, proximity and candidate-location count requests
  therefore return explicit NOT_COMPUTABLE/null gaps. No geometry, radius, catchment,
  implicit candidate coverage, direct Spatial import or Map access is fabricated.
- **Coverage:** verified complete empty coverage can establish zero; absent/partial
  coverage cannot. Exact totals remain null when unprovable; observed subsets are
  labeled separately. Inactive, expired, future, ambiguous and out-of-scope evidence
  is not silently included. Missing values are null, not zero.

### Confidence, provenance, rights and reproducibility

`competitor-confidence-v1` still measures evidence quality, never business success or
competitor strength. Derived confidence does not exceed required input quality;
incomplete samples receive the additional cap above. Every metric retains the relevant
exact source/version/checksum, source records, subject references and versioned method.
Current metrics reference current inputs; historical comparisons include both snapshots.
Final retrieval/export/attribution restrictions cannot be widened by a calculation.

Request, input and output hashes are canonical and deterministic, including unordered
snapshot arrays. Run IDs and operational timing do not change semantic hashes.
Strict result validation recomputes inventory, evidence, metrics, confidence, rights,
gaps and hashes; rehashed arithmetic/source/identity/rights tampering is rejected.
This validates captured snapshot coherence and deterministic arithmetic, **not** fresh
authorization or cryptographic proof of arbitrary offline source claims. Live execution
still obtains authorized exact bytes/checksums through the accepted M2 provider.

Combined current/historical selections are bounded at 32 including required implicit
roles; combined parsed rows at 10,000; output metrics at 500; canonical result at 2 MiB.
Existing per-source/content/evidence/cost limits remain enforced. Excess work/output is
rejected, never silently truncated or replaced with fallback data.
Pure Shared `buildRunRecord` compatibility is tested without introducing persistence.

### Saved final validation

| Gate | Result |
| --- | --- |
| Full unit regression: Competitor, Market, Shared, Spatial, Data Center | 1,812 PASS; 3 pre-existing browser-only skips; 59 passing files + 1 skipped; 141.44 s |
| New M3 unit cases | 63 PASS |
| Full isolated PostgreSQL/Data Center/PostGIS regression | 352/352 PASS across 13 files; 388.01 s |
| Separate committed Market acceptance regression | 5/5 PASS; 22.48 s |
| Combined database gates | 357/357 PASS across 14 files |
| Final-code focused Competitor PostgreSQL rerun | 16/16 PASS; 36.22 s |
| Fresh disposable databases | All 78 migrations applied; each owned scratch database dropped |
| TypeScript | PASS |
| Scoped ESLint | PASS; zero warnings |
| Production Webpack build | PASS; type checking enabled; 161/161 static-generation tasks |
| Map asset preparation | PASS; no tracked Map change |
| `git diff --check` | PASS |

M3 tests cover counts/branches/ambiguous identities, taxonomy subsets, documented
distribution denominators, observed dimension comparability and missingness, historical
guards/zero bases, weakest-input confidence, provenance/rights, canonical hashes,
rehashed result tampering, output limits, unchanged Shared record contracts and static
no-network/no-AI/no-Map/no-Spatial/no-Market/no-Projects/no-write boundaries.
Six new PostgreSQL cases extend the ten accepted M2 integration cases, including
hidden/private non-disclosure, exact malformed-source rejection without fallback,
four-source counts, eight-version historical comparisons, observed attributes and
conditional spatial gaps. Existing authorization/checksum/revocation cases still pass.

Measured full-regression synthetic M3 execution: **1,715.75 ms** for four exact sources
and 15 locations on this shared Windows/PostgreSQL host. Four interleaved pure runs
produce identical hashes without mutating inputs. This is a technical observation,
not a production SLA, comprehensive load acceptance or evidence of real competitor data;
M5 remains responsible for final performance/load acceptance.

### Real data, changed surfaces and stop

**REAL-DATA COMPETITOR ACCEPTANCE = BLOCKED / NOT VERIFIED.**
All technical datasets, including PostgreSQL datasets, are **Fixtures / Synthetic**.
No authorized populated production Data Center connection was supplied or used.
Lack of production visibility does not prove absence of competitor or Market data.

New runtime files: `analytics.ts`, `engine.ts`. Focused additive changes:
`model.ts`, `request.ts`, `datasets.ts`, `data-sources.ts`, `contracts.ts`, `index.ts`,
and `adapters/data-center-provider.ts`. Tests add `competitor-analysis-analytics.test.ts`
and extend existing foundation/PostgreSQL cases. Documentation updates only this
checkpoint and `docs/analysis-engines.md`.

| Frozen boundary / later phase | Status |
| --- | --- |
| Map / Data Center frozen baseline / Spatial / Market / Shared Core changed | NO |
| Schema / migrations / separate Competitor Data Store | NO |
| Persistence / historical replay / API / UI / Projects integration | NOT STARTED |
| M4 started | NO |
| Main merge | NO |
| Final tag | NOT CREATED |
| CodeQL | Not run at M3; final technical scan belongs to M5 |
| Sonar | DEFERRED / PENDING until all seven technical engines are complete |

**Stop at this M3 checkpoint for owner review. Do not start M4 automatically.**

The preceding status/table records the M3 checkpoint. The owner subsequently
accepted and CLOSED M3 at `54c5c0fc02414b23087a08e47b747524b758556c` and explicitly
authorized M4 only. No M3 arithmetic or approved scope is reopened by M4.

## 14. M4 checkpoint — persistence, exact historical replay and reproducibility

**M4 TECHNICALLY COMPLETE — CHECKPOINT FOR OWNER REVIEW. M5 NOT STARTED.**

### Existing Shared storage, not a Competitor datastore

`run-history.ts` adds pure `jenan.competitor-analysis.run-history/v1` contracts and
strict result-to-record mapping. The full normalized request/result, both captured
preparations when present, entity/location decisions, classification evidence, scope,
coverage, quality, confidence, gaps, rights, attribution, actor/context, cost and timing
are retained together with request/input/output hashes.

Only `AnalysisEngineRun` and its existing `AnalysisEngineRunInput` children are written.
Input columns retain exact Data Center version/source/type/checksum, the full Shared
descriptor snapshot and independent `jenan.competitor-analysis.input-provenance/v1` /
`jenan.competitor-analysis.input-usage/v1` records. CURRENT versus BASELINE source
lineage is explicit. These are Shared history evidence, **not Data Center usage writes**.
There is no new table, migration, registry, endpoint, UI, Map/Projects link or dataset.

`runCompetitorAnalysisPersisted` uses the accepted read-only provider and returns the
unchanged M3 result only after saving history. `persistCompetitorRun` validates the full
record, binds its actor to the authenticated principal, rechecks live source access and
exact bytes, then performs one atomic parent/nested-input create in Repeatable Read
with a 30-second transaction timeout. Existing append-only database triggers remain
enabled. Duplicate run IDs fail rather than overwrite; failed child insertion leaves
no partial parent/inputs.

The captured result still uses engine/calculation version `1.0.0-m3`. M4 does not
change formulas, the confidence policy, result contract, identity resolution or
matching semantics. It exports the existing canonical preparation function under
`canonicalCompetitorPreparation` solely to reuse identical unordered-dataset
normalization during exact-byte/snapshot comparison. All M3 regression cases pass.

### Current-authorized exact lookup/replay

- `readCompetitorRun` applies engine plus owner/actor-kind filters in the database
  query; administrators may inspect history only while all relevant sources remain
  authorized. Foreign and nonexistent IDs produce the same unavailable error.
- Current source scope, organization membership/permission, required version
  permission, specialty/mission context, robot grant and mission assignment are
  checked again. Stored context/old grants never substitute for current authorization.
- Retrieval withdrawal, archival, unresolved conflicts and changed license/usage/
  export/attribution/ownership terms deny lookup/replay, even when the change appears
  more permissive. Historical evidence cannot silently gain new rights.
- Reauthorization includes retained unselected discovery candidates and out-of-force
  trace IDs, not just metric input references. Returning cached metadata must not
  bypass a later visibility restriction.
- Exact immutable version columns are read directly under these policies and their
  Data Center checksum recomputed. Captured version/source/type/item/layer identity,
  checksum/number and declared rights must agree. Raw dataset bytes are parsed and
  compared with the captured canonical typed datasets.
- Later quality assessments, source freshness settings, version supersession or
  temporal expiry do not rewrite the historical snapshot. A valid historical version
  may be replayed after expiry if current access/rights still permit it.
- Originally unavailable inputs/gaps stay unavailable; no latest-version fallback,
  rediscovery, gap filling, external collection or new run is performed by replay.
- `replayCompetitorAnalysis` reruns the unchanged pure M3 engine at the recorded
  evaluation instant with captured, now-authorized exact preparations. All three hashes
  and the complete result must match. Full identity/matching/inventory/metrics and
  rights/provenance are reproduced, not merely retrieved as an unchecked JSON blob.
- Unknown contract/calculation versions, inconsistent record summaries/columns,
  altered snapshots/usage/provenance, altered source bytes or hashes fail explicitly.
  No historical arithmetic is silently upgraded.

### Failures and limits

Shared 2 MiB request/result limits and accepted M3 version/row/metric/cost limits
remain enforced. Pre-result `EngineError` failures receive an explicit FAILED record
with no fabricated result, inputs, confidence or output/input hashes. Oversized failed
requests are omitted with their digest/byte length rather than stored unbounded.
Execution errors are rethrown; a simultaneous failure-history save error preserves
both causes in `AggregateError`. Policy/infrastructure exceptions are not relabeled
as successful calculations or fabricated arithmetic failures. Save failures never
return success-shaped unsaved results.

### Saved final gates and measurements

| Gate | Result |
| --- | --- |
| Full unit regression: Competitor / Shared / Spatial / Market / Data Center | 1,851 PASS; 3 pre-existing browser-only skips; 61 passing files + 1 skipped; 96.16 s |
| New pure history / persisted-service cases | 19 + 11 PASS |
| New static boundary / test-registration checks | 9 PASS; exact history capability allowlists only |
| Full isolated PostgreSQL/Data Center/PostGIS regression | 389/389 PASS across 13 files; 272.52 s |
| Competitor PostgreSQL subset | 53/53 PASS: 16 accepted M2/M3 + 37 new M4 cases |
| Separate committed Market acceptance regression | 5/5 PASS; 9.78 s |
| Combined database gates | 394/394 PASS across 14 files |
| Fresh database / migrations | All 78 migrations applied in each owned scratch database; databases dropped afterward |
| TypeScript | PASS |
| Scoped ESLint | PASS; zero warnings |
| Production Webpack build | PASS with type checking enabled; 161/161 static-generation tasks |
| Map asset preparation | PASS; no tracked Map change |
| `git diff --check` | PASS |

PostgreSQL cases verify Shared-only atomic storage, exact input metadata/usage,
full-result replay, eight-version CURRENT/BASELINE historical-count replay, later
publication/quality/expiry, original missing gaps, owner/admin and private/organization/
robot restrictions, cached metadata visibility, specialty/mission context, archival,
checksum corruption, four stored-input corruption surfaces, pre-save revocation,
forged actor rejection, FAILED history, duplicate IDs, child-insertion rollback and
append-only UPDATE/DELETE protection. The durability case commits an explicit
missing-input result and reads/replays it through separate real transactions;
nonempty four/eight-input cases run against actual PostgreSQL inside isolated
rollback-only fixture transactions. Unit cases also verify no result is returned
before save completion and both error causes survive dual failures.

Measured full-regression four-source / 15-location exact replay: **893.20 ms** on this
shared Windows/PostgreSQL host. This is a synthetic technical measurement, not a
production SLA or M5 final load acceptance. No M5 workload/CodeQL/Sonar stage is started.

Early validation caught test fixture/context mistakes and a nested test-registration
error; the fixture scopes/registration were corrected, an active registration guard
was added, and the complete final gates above were rerun successfully. No frozen
Data Center policy, test threshold or engine arithmetic was weakened to pass a test.

### Real data, changed files and stop

**REAL-DATA COMPETITOR ACCEPTANCE = BLOCKED / NOT VERIFIED.**
All technical data, including committed durability and rollback-only PostgreSQL cases,
are **Fixtures / Synthetic**, not real competitor acceptance. No authorized populated
production connection was supplied or used. Lack of production visibility is not
evidence that Data Center lacks competitor/Market data and is not a technical failure.

New runtime files: `run-history.ts`, `adapters/run-persistence.ts`,
`adapters/historical-data-center.ts`, `adapters/replay-service.ts`,
`adapters/run-service.ts`. Focused existing runtime changes: pure export in `index.ts`
and naming/export of the existing canonical preparation helper in `engine.ts`.
Tests add `competitor-analysis-run-history.test.ts` and
`competitor-analysis-run-service.test.ts`; extend Competitor PostgreSQL and static
boundary tests plus exact global adapter allowlists. Documentation changes only this
checkpoint and `docs/analysis-engines.md`.

| Frozen boundary / later phase | Status |
| --- | --- |
| Map changed | NO |
| Data Center frozen baseline / writes | NO |
| Spatial / Market / Shared Core changed | NO |
| Schema / migrations / independent Competitor datastore | NO |
| Projects / API / UI integration | NO |
| M5 started | NO |
| Main merge | NO |
| Final tag | NOT CREATED |
| CodeQL | Not run at M4; final technical scan remains M5 |
| Sonar | DEFERRED / PENDING until all seven technical engines are complete |

**Stop after this M4 checkpoint for owner review. Do not start M5 automatically.**

The preceding status/table records the M4 checkpoint. The owner subsequently
accepted and CLOSED M4 at `f1a7f7da1c0873ccdeb8a6e99db8b1f8d5937974` and explicitly
authorized M5 final technical acceptance. Sonar remains deferred.

## 15. M5 final technical acceptance

### Scope, frozen boundaries and existing behavior

M5 adds `tests/unit/competitor-analysis-acceptance.test.ts` and
`tests/integration/competitor-analysis-acceptance.integration.test.ts`.
No production runtime, formula, matching/identity/confidence contract, Shared Core,
Data Center, Spatial, Market, Map, schema, migration, UI or endpoint is changed.
All M1-M4 cases remain part of the final gates. The accepted M3 calculation version
`1.0.0-m3` and M4 history format are not upgraded.

### Final local gates

| Gate | Result |
| --- | --- |
| Full Competitor / Shared / Spatial / Market / Data Center unit/static regression | 1,853 PASS; 3 pre-existing browser-only skips; 62 passing files + 1 skipped; 47.50 s |
| Full isolated PostgreSQL / Data Center / PostGIS regression | 389/389 PASS; 13 files; 194.62 s |
| Committed Competitor final acceptance | 5/5 PASS; 20.42 s |
| Separate committed Market frozen acceptance | 5/5 PASS; 7.71 s |
| Combined database gates | 399/399 PASS across 15 files |
| Competitor PostgreSQL coverage | 53 prior M2-M4 cases + 5 committed M5 cases = 58 PASS |
| Fresh databases and migrations | All 78 migrations applied independently to each of three owned scratch databases; all dropped |
| TypeScript | PASS; standalone check and production-build type check enabled |
| Scoped ESLint | PASS; zero warnings across Competitor runtime/tests and global boundaries |
| Production Webpack build | PASS; 161/161 static-generation tasks |
| Map asset preparation | PASS; no tracked Map change |
| `git diff --check` | PASS |
| Exact-SHA CodeQL | Pending the technical commit; both language jobs will be recorded below |
| Sonar | DEFERRED / PENDING until all seven engines are technically complete |

The 389-case regression includes Competitor 53, Market 68, Spatial/provider/PostGIS
169 and Data Center 99. The separate committed suites add five cases each.
All database acceptance uses fresh migrated disposable databases, not a production
reset. Saudi/PostGIS regressions retain their existing read/template fixture policy.

### Committed load, concurrency and recovery

The new suite refuses to run unless `COMPETITOR_ACCEPTANCE_DATABASE_TESTS=1` and
`current_database()` matches the owned `se_competitor_m5_<12 hex>` scratch pattern.
It creates explicitly synthetic governed fixtures in that database only and freezes
Data Center row counts after setup. Runtime writes are limited to Shared history.

| Measurement | Observed | Enforced gate |
| --- | --- | --- |
| Pure 32 interleaved analyses, four sources / 15 locations each | 5,505.54 ms total; 5.81 operations/s | total <15,000 ms |
| Eight committed runs, concurrency four | 4,733.83 ms total; p50 2,105.38 ms; p95/max 2,633.95 ms; 1.69 operations/s | max <15,000 ms; total <30,000 ms |
| Sixteen exact replays, concurrency four | 5,353.91 ms total; p50 1,318.22 ms; p95/max 1,618.93 ms; 2.99 operations/s | max <15,000 ms; total <30,000 ms |

Every committed run retains four exact input rows, one unique entity, 15 locations,
restricted export, attribution and identical deterministic hashes. Separate read
transactions reload the full nonempty results. Replay reproduces the complete stored
result/hashes with no Run/Input/Data Center/audit/usage writes. Pure interleaved
calculations preserve submitted requests/source bytes and isolate result mutation.
These are bounded synthetic measurements on a shared Windows host, not production
capacity, a generalized throughput claim or a production latency SLA.

Four concurrent attempts at one run ID produce exactly one success and three explicit
unique-constraint failures; exactly one parent/four children remain, no overwritten or
orphan inputs. A test-only constraint then rejects a nested child insertion in a real
transaction: no parent/child is committed and Data Center counts do not change.
After removing that exact test-only constraint, retrying the same unsaved ID succeeds,
persists four inputs and replays exactly. No production trigger is disabled by this
acceptance suite. Concurrent foreign/missing lookups/replays all yield the same
unavailable error and make no writes.

### Security, integrity and static capability gates

The unchanged 53-case PostgreSQL suite plus final acceptance verify current source/
organization/version-context/robot permissions, owner/admin filtering, no existence
leak, exact bytes/checksums, input/source provenance/rights, expiry/supersession,
canonical hashes, rehashed result/input corruption, append-only triggers, failures
and rollback. Pure tests cover metric/input/output/version limits, explicit missing/
partial states, identity ambiguity, taxonomy, observed dimension comparability and
historical arithmetic guards. Oversized submitted input is rejected before source I/O.

Competitor AST and global static boundaries still restrict writes to one atomic
Shared Run nested create; exact history/read adapters have narrow allowlists.
No network, AI/LLM, scraping, Spatial/Market import, Map/Projects access, raw SQL,
Data Center write, hidden clock or success/revenue/strength inference capability is
added to runtime. This is automated static/integrity/access acceptance, not a claim
that bounded tests alone prove the absence of every possible vulnerability.

### Real-data status and finalization

**REAL-DATA COMPETITOR ACCEPTANCE = BLOCKED / NOT VERIFIED.**
All technical fixtures, including the durable committed load/recovery dataset, are
**Fixtures / Synthetic**, not real competitors. No authorized populated production
connection was supplied or accessed. Absence of production visibility is not evidence
that the Data Center lacks competitor/Market data, and is not a technical failure.

Local gates above are complete. Final technical SHA, exact-SHA CodeQL results and
the subsequent documentation-only closure will be pinned once the technical commit
and remote scan exist. Finalization must verify Local/Remote/Desktop equality.
No main merge, final tag, Sonar run or fourth-engine start is authorized.
