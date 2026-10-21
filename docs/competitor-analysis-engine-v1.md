# JENAN COMPETITOR ANALYSIS ENGINE — ARCHITECTURE & IMPLEMENTATION PLAN

## M0 status, authority and frozen baselines

**M0 APPROVED at `88858341da8c016617cb380775e5aef12a0b244b`.
M1 IMPLEMENTED — CHECKPOINT FOR OWNER REVIEW. M2 NOT STARTED.**

The subsequent owner decisions replace establishment-only counting: model a unified
Competitor Entity separately from locations/branches and original source records.
The owner subsequently approved that M0 and explicitly authorized M1 only.
The five-stage split is not authorization to start M2 or later phases.

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
M1 implements only the foundation below. **M2 NOT STARTED.**

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

**Stop after this M1 checkpoint for owner review.**
