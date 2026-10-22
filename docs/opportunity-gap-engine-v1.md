# JENAN OPPORTUNITY & GAP ENGINE — M0 ARCHITECTURE & IMPLEMENTATION PLAN

## 1. Status and authority

**M0 APPROVED. M1 accepted at `473e0e2957525a504ff02c229d2f048ed1de0857`.
M2 CLOSED at `2568b77c618912ca1fb41c157dfa7380ade525ee`.
M3 CLOSED at `839eca0bc6ac3386cfa6cc457ef540ee9d17565f`.
M4 CLOSED at `93a9f9de18d2aeb916396198c9ca4df7bb24c575`.
M5 APPROVED — TECHNICALLY COMPLETE — PENDING FINAL SONAR.
Owner-accepted Final Technical SHA: `10dcafcf27c45db8b371fa5b79ac9da6bc4f21a5`
(documentation-only closure of scanned code/test SHA
`f9b44b849e6cec93631db20cbb9c2b795058e836`).**
The owner accepted Competitor technical closure and authorized this fourth engine's
architecture/planning, then approved M0 and authorized M1 only. After clarification, the owner confirmed its actual Final
Technical SHA as `eaa2d09374593d5677fc77c3efbc4f5a3e42e4a0`, not the earlier M4 commit.
Competitor documentation closure: `4bb2e2c80026edda7f240c3a8a25f33b01166da2`.
Competitor M4: `f1a7f7da1c0873ccdeb8a6e99db8b1f8d5937974`.

Three engines are **TECHNICALLY COMPLETE — PENDING FINAL SONAR**:

| Frozen engine | Final Technical SHA |
| --- | --- |
| Spatial | `8d97baace8abd6889f400a56952e345f3068f3af` |
| Market & Demand | `c54d647838c1ce10730277f3977abc4980c3715d` |
| Competitor Analysis | `eaa2d09374593d5677fc77c3efbc4f5a3e42e4a0` |

Data Center remains frozen at `04d6148dfb875532404059adb55fcac8ee6913b2`.
No frozen runtime/contract, Shared Core, Map, schema, UI or production data changes
are authorized by this plan. No main merge, tag or Sonar.
The owner subsequently accepted M2 and authorized M3 calculations only, then explicitly
approved the limited positive-difference signal policy described in section 13.
The owner subsequently closed M3 and authorized M4 persistence/exact replay only.
The owner explicitly approved promoting Competitor into `jenan-engines/integration`
without squash, followed by creating `jenan-engines/opportunity-gap` from that merge.
The M0 proposal was preserved at `354ca7a` before branch preparation.
Integration merge: `294b421563430a264df2e8f955eb344f2326e623`.
All three accepted technical runtime baselines remain unchanged.

## 2. Purpose and non-goals

Identify **documented mismatches and bounded opportunity signals**, not decide whether
to invest. Separate missing evidence from an actual service/supply gap:

- `DATA_GAP`: missing, stale, inaccessible, partial or incompatible evidence.
- `BENCHMARK_GAP`: comparable measured provision below an explicit versioned target.
- `DEMAND_SUPPLY_GAP`: comparable observed need/demand exceeds documented serviceable
  supply/capacity in the same units, population, geography and reporting interval.
- `OPPORTUNITY_SIGNAL`: an explainable rule outcome supported by the above facts.
  It is not automatically a feasible project or a recommendation.

Low competitor counts, population, POIs, density and geographic proximity are context.
They do not establish unmet demand, accessible capacity or an investment opportunity.
One entity with 15 branches remains one entity and 15 locations; neither count is
capacity or fulfilled demand. Observed transactions may describe already-served demand,
not total need: an explicit measurement boundary is required before subtraction.

Out of v1: success probability, project ranking, a composite opportunity percentage,
investment advice, revenue/profit/market-share forecasts, inferred unmet demand from
absence of listings, AI/LLM, scraping, external collection, direct Map/Projects access
and direct Spatial/Market/Competitor runtime imports. No new domain datastore.

## 3. Architecture and trusted inputs

Proposed flow:

`authorized Data Center exact versions -> typed validated facts -> pure deterministic
rules/calculations -> Shared envelope -> existing Shared Run/Input history`.

Dependencies:

- Reuse unchanged Shared quantity semantics, canonical hashing, envelope, error/gap,
  confidence, rights/attribution and Run/Input contracts.
- A narrow Data Center adapter discovers permitted versions, reads exact bytes,
  verifies checksums and preserves scope/source/rights/coverage/quality.
- No automatic runs of previous engines. Optional upstream facts arrive through
  a future explicitly approved orchestrator port, not direct engine imports.
- The future upstream-fact DTO needs engine key/version/runId, result contract,
  request/input/output hashes, metric reference, exact original source lineage,
  scope, semantics, evidence class, rights and confidence. A hash alone is not
  authentication: only a trusted server resolver may construct accepted facts and
  must reauthorize original inputs. Reject caller-supplied arbitrary result JSON.
- Existing engines are frozen. If upstream-fact transport requires their modification,
  leave that integration unavailable and request approval; do not patch them in M1.
- Data Center is authoritative. Availability of an accepted engine does not establish
  availability of suitable production observations, capacity or benchmark data.

Proposed pure directory: `services/analysis-engines/opportunity-gap`.
Proposed modules: model/contracts, normalization, comparability, confidence,
data-port/datasets/preparation, calculations and run-history. Add modules only as
their phase requires them, not empty scaffolding in M0.

## 4. Proposed input contract

`jenan.opportunity-gap.request/v1`

| Field | Meaning |
| --- | --- |
| `scope` | Versioned geography, sector/activity, segment/cohort, asOf/reporting period |
| `analyses` | DATA_COVERAGE, BENCHMARK_GAP, DEMAND_SUPPLY_GAP, OPPORTUNITY_SIGNALS, HISTORICAL_CHANGE |
| `data.roles` | Exact versionId/checksum pins or governed type/asOf selectors |
| `definition` | What need/service, population and unit are being evaluated |
| `benchmarkPolicy` | Explicit versioned target/reference and justification, when applicable |
| `signalPolicy` | Approved versioned rules and thresholds; no arbitrary executable formula |
| `historical` | Optional independently pinned comparable baseline |

Run ID, actor, organization/robot context, environment and evaluation timing are
trusted server context, never independently client-authorized request fields.
No default target per capita, catchment, opening hours, utilization, conversion rate,
competition threshold or demand multiplier. Reject required omitted assumptions
rather than use a plausible hidden default.

Proposed dataset roles/typeKeys (not registered or asserted to exist):

| Role | Proposed typeKey | Required semantics |
| --- | --- | --- |
| `need.observations` | `opportunity-need-observations` | Observed need, explicitly served/unserved/total measurement boundary |
| `supply.capacity` | `opportunity-supply-capacity` | Documented serviceable capacity, not entity/location counts |
| `provision.observations` | `opportunity-provision-observations` | Actual measured provision for benchmark comparison |
| `benchmarks.targets` | `opportunity-benchmarks` | Versioned justified target, units, applicability and authority |
| `context.indicators` | Reuse a compatible existing approved context type where possible | Context only, never demand |
| `dimensions.dictionary` | `opportunity-dimensions` | Versioned metric/sector/unit/universe definitions |

Dataset contract family: `jenan.opportunity-gap.<dataset>/v1`; exact final names,
required role combinations and reuse of existing approved types are decided in M1/M2.
No registry writes or Competitor/Market dataset duplication without necessity.
Each row requires id, sourceRecord references, declared evidence/measurement method,
semantics, geography/sector/period, coverage, missingness and limitations.

## 5. Proposed output contract

`jenan.opportunity-gap.result/v1`

Shared-compatible envelope plus:

- Normalized request, engine/calculation/policy versions, evaluatedAt and three hashes.
- Versioned findings with `findingId`, kind, scoped subject, supporting/counter evidence,
  method/rule/target references, limitations and separate data gaps.
- Metrics with value/null, exact unit/semantics, source class, computability/coverage
  state, input/source record references, formula and confidence.
- Signal states `SUPPORTED`, `NOT_SUPPORTED`, `INSUFFICIENT_EVIDENCE`,
  `NOT_COMPARABLE`. NOT_SUPPORTED applies only where sufficient comparable evidence
  actually evaluated the rule false; it does not mean no opportunities exist.
- Shared-compatible availability/gaps, rights intersection and attribution.
- Explicit exclusions/inclusion reasons and source selection decisions.

Keep `OBSERVED`, `DERIVED`, `ESTIMATED`, `CONTEXTUAL` distinct. A deterministic
calculation is DERIVED, not automatically ESTIMATED. A rule outcome is not OBSERVED
merely because some supporting inputs are observations.
Detailed metric states retain `NOT_AVAILABLE`, `NO_COVERAGE`, `NOT_COMPUTABLE`,
`PARTIAL`; map them explicitly to existing Shared availability/platform vocabulary,
without modifying Shared or losing the detailed reason.

## 6. Proposed deterministic calculations and guards

1. **Coverage:** describe evidence availability and its exact geographic/temporal/
   sector scope. Coverage completion is not an opportunity or success score.
2. **Benchmark difference:** measured provision minus explicit target, plus separately
   labeled shortfall `max(target - provision, 0)` when an approved policy defines it.
   A policy target is normative, not observed demand. A target-minus-competitors
   calculation cannot be labeled unmet demand.
3. **Demand/capacity balance:** signed need minus serviceable supply only with an
   explicit compatible total-need/service boundary. An unmet-need claim additionally
   requires observed unmet need or an approved method that accounts for already-served
   demand, capacity accessibility, duplication and the eligible population.
4. **Ratios:** positive, compatible denominators only; retain absolute values and
   denominator meaning. Zero base yields null ratio, not infinity or 100%.
5. **Signals:** approved transparent predicates over valid findings. Return the
   underlying comparisons/counterevidence, not a weighted project rank.
6. **Historical change:** only comparable definitions, measurement boundaries,
   methods, coverage, populations, geography, units and periods; no missing-period
   interpolation or inference that a listing change is an opening/closure.

The comparability guard checks metric identity, stock/flow/rate semantics, unit/
currency basis, geography and boundary version, sector/category, cohort/universe,
time/frequency/time zone, coverage and methodology. No subtraction of people from
business counts, transactions from seats, STOCK from FLOW, different segments or
non-overlapping periods. No area/population allocation, conversions or de-duplication
without an approved explicit method. No zero unless measured or established by
complete scoped inventory. Partial data permit labeled sample facts only, not a
population-wide gap or definitive negative signal.

Estimates are **proposed deferred outside initial v1 calculations**. If later approved,
they require explicit assumptions, exact source inputs, versioned formula, scope,
limitations and confidence caps; never upgrade them to observed gap.

## 7. Proposed opportunity-confidence-v1

Independent explainable evidence-quality policy using unchanged Shared infrastructure.
**Not a probability, opportunity strength or investment score.**

Approved factor maxima (100 total), implemented in M1:
source quality 15; measurement/definition quality 15; comparability 20;
geographic/sector coverage 15; temporal alignment/freshness 10; completeness 10;
provenance/rights 10; benchmark/rule applicability 5.
Approved band thresholds: HIGH >=80, MEDIUM >=60, LOW >=40.
The M1 checkpoint below defines evidence-backed point rules and active validation;
this table alone never authorizes arbitrary point assignment.

Derived final confidence must not exceed the weakest necessary input, both score and
band. Required unknown/contradictory inputs block a signal/calculation, not merely
reduce a score. Partial sample/context-only descriptive facts cap at LOW and cannot
support a definitive market-wide gap. Missing/incompatible computed values carry null
confidence. Normative benchmark limits must be visible; a high-confidence benchmark
comparison still does not prove unmet demand.

## 8. Bounds, integrity and persistence

Proposed v1 bounds, subject to measurable M1 validation: <=32 exact versions including
baseline; <=10,000 combined parsed rows; <=500 metrics/findings combined; <=100
versioned rule evaluations; <=2 MiB canonical request/result; existing Shared 20,000
cost-unit budget with phase-specific pre-I/O/work estimates. Reject excess, never
truncate. Account for retained discovery traces and avoid unbounded rule cross-products.

Maintain source/version/hash -> row/fact -> method/policy -> result lineage.
Rights cannot become more permissive; context and upstream inputs are also governed.
Canonicalize semantically unordered collections; preserve meaningful priority order.
Recompute findings, confidence, rights and hashes to reject rehashed fabrication.

M4 uses existing append-only Shared Run/Input tables and an atomic nested create.
History must preserve targets/rules, assumptions if ever approved, selection traces,
exact versions, states and three hashes. Current permissions/rights are rechecked
before returning cached data, including retained discovery metadata.
Replay uses original calculation/policy version and evaluation instant, never latest
fallback, discovery, data-gap filling or implicit upgrade. Failed execution/history
save must remain explicit; recovery must leave no orphan/partial history.

## 9. Proposed phases and delivery gates

| Phase | Deliverable and stop |
| --- | --- |
| M0 | This architecture, evidence semantics, contracts, policy and decisions; stop for review |
| M1 | Pure contracts, strict comparability, gap/signal taxonomy, confidence, normalization/hashes, bounds/static tests; no live integration |
| M2 | Governed exact Data Center discovery/read/checksum, coverage/rights/provenance, type/dataset validation; inspect authorized real data if available |
| M3 | Approved deterministic differences/ratios/signals/history comparisons with guards, counterevidence and null/partial behavior; no persistence yet |
| M4 | Existing Shared persistence, exact historical replay, current authorization, atomic failure/recovery and reproducibility |
| M5 | Full regressions, fresh PostgreSQL/migrations/PostGIS when relevant, committed load/concurrency/performance, boundary/security/static gates, exact-SHA CodeQL, types/lint/build and final sync |

Each phase needs explicit acceptance before the next. Sonar stays deferred until all
seven engines are technically complete; no final tag or main merge.
Required tests: context cannot become demand; few/zero competitors cannot imply a
gap; served demand cannot silently become total need; different units/universes/periods
reject; benchmark target is not observed need; partial coverage cannot prove zero or
absence; explicit false vs unknown signal; zero denominator; deterministic permutations;
weakest-input confidence; provenance/rights; no fallback; no-existence leak; bounds;
tamper resistance; atomic saves/rollback/retry and immutable exact replay.
Run unchanged Shared/Spatial/Market/Competitor/Data Center regressions as applicable.

## 10. Current evidence and owner decisions

Verified from accepted code/contracts: existing pure Shared infrastructure, strict
Market contextual/observed distinction, Competitor entity/location semantics,
governed Data Center reads and Shared history precedents. This establishes reusable
technical contracts, not compatible live need/capacity/benchmark observations.
M0 makes no production data query and runs no synthetic acceptance as real acceptance.

**REAL-DATA OPPORTUNITY & GAP ACCEPTANCE = BLOCKED / NOT VERIFIED.**
Actual authorized need, serviceable supply, provision, benchmark applicability,
scope compatibility and measurable gaps remain NOT VERIFIED. Lack of visibility
does not prove that the Data Center lacks data.

Owner-approved M0 decisions:

1. Approve separate DATA_GAP / BENCHMARK_GAP / DEMAND_SUPPLY_GAP / OPPORTUNITY_SIGNAL;
   no ranking, investment recommendation or composite opportunity percentage.
2. Approve strict observed-need versus serviceable-capacity semantics and no inference
   from population or competitor/location counts.
3. Approve the proposed v1 analyses, deferring estimates, and confidence policy direction.
4. Approve Data Center-first inputs; defer cross-engine fact ingestion until a trusted
   orchestrator contract exists, with no frozen-engine edits.
5. Approve the proposed phase split and the separate integration/branch preparation
   before M1. No integration merge is implied by this documentation draft.

The original M0 stopped before implementation. The following M1 checkpoint records
only the subsequently authorized foundation; stop again before M2.

## 11. M1 checkpoint — pure contracts and comparison foundation

**M1 ACCEPTED at `473e0e2957525a504ff02c229d2f048ed1de0857`.**
The owner subsequently authorized M2 only; the original M1 evidence below is retained.

M1 implementation SHA: `ed531f1b10f1608f3f135a27a936228902c4f639`.
Subsequent documentation-only SHA pinning does not change this implementation baseline.
The earlier synchronized HEAD `2c10c42e8b64e407a5ce7a519c31030756159026`
is its immediate child and changes only this document and `analysis-engines.md`
to pin that implementation SHA. It is not a different runtime implementation.
The final M1 review candidate is the dedicated branch HEAD including the subsequent
documentation-only targeted-performance verification recorded below; the delivery
report records its exact SHA and verifies Local/Remote/Desktop equality.

### Binding decisions

- `DATA_GAP` is missing evidence or capability, never a market opportunity.
- `BENCHMARK_GAP` requires an exact versioned policy, authority, justification,
  original source/version/hash/record, applicability scope and period, and validity.
- `DEMAND_SUPPLY_GAP` eligibility requires identical units, definition, period,
  geography, sector, cohort, universe, adjustment and methodology. Incompatibility
  returns `NOT_COMPUTABLE`, not a conversion, allocation, proxy or inferred value.
- Total need and serviceable capacity differ from already-served/unmet need,
  normative targets, contextual indicators and competitor entity/location counts.
  Even compatible operands establish eligibility only, not an unmet-demand claim.
- `OPPORTUNITY_SIGNAL` is an explanatory deterministic rule outcome. The M1
  taxonomy mapper distinguishes explicit false from insufficient/incompatible evidence;
  it does not implement or approve a rule. Governed rule evaluation belongs to M3.
- No composite Opportunity Score, investment advice, success probability, revenue/
  profit forecast, network, AI/LLM, scraping or direct previous-engine imports.
- Missing required evidence blocks/limits a conclusion; no guessed default or zero.

### Final M1 contracts

Pure directory: `services/analysis-engines/opportunity-gap/`; six files only:
`model.ts`, `request.ts`, `comparison.ts`, `confidence.ts`, `contracts.ts`, `index.ts`.
No adapters, registry change, database/schema, domain datastore, routes or UI.

- Request: `jenan.opportunity-gap.request/v1`.
  Explicit scope, quantity definition, analyses, exact role/version/hash pins,
  nullable versioned benchmark/rule policy and separately pinned history.
  No discovery selector or latest-version fallback is implemented in M1.
  The canonical evaluation instant participates in the request hash. Actor, run ID,
  environment and timing are separate trusted context, not request permissions.
- Fact: `jenan.opportunity-gap.fact/v1`.
  Role, explicit measurement boundary, observed/normative/contextual class, finite
  value/null, Shared quantity semantics, coverage, documented versioned method,
  exact source-record evidence, benchmark authority when applicable and limitations.
  Estimated facts/derived comparisons are rejected in this base-fact contract.
  Method identity must agree with the semantics' versioned methodology.
- Metric/finding: `jenan.opportunity-gap.metric/v1` and
  `jenan.opportunity-gap.finding/v1`.
  Preserve state, scope, method, input/fact/metric references, original evidence,
  confidence/null, limitations and (findings) explicit provenance/rights.
- Result: `jenan.opportunity-gap.result/v1`, engine version `1.0.0-m1`.
  Shared-compatible envelope, canonical request/evidence, separate findings,
  input descriptors, availability, gaps, attribution, intersected rights and three
  deterministic hashes. No extra application keys or executable formulas.
- Detailed states: `COMPUTED / PARTIAL / NO_COVERAGE / NOT_AVAILABLE /
  NOT_COMPUTABLE`. Shared platform/availability semantics remain unchanged.
  The comparison guard's `COMPUTED` says **eligibility was checked**, not that a gap
  exists. Partial comparisons cannot establish definitive positive/negative signals.

`buildOpportunityFoundationResult` is explicitly a **diagnostic M1 envelope**,
not the future analytics runner. Each analysis receives one null/
`NOT_COMPUTABLE` diagnostic and one `DATA_GAP`, with the bilingual
`OPPORTUNITY_ANALYTICS_DEFERRED` gap. No business predicate is evaluated and no
numeric gap or supported market signal can be emitted by this version.
Finding/metric confidence is therefore null; the independent confidence calculator
is implemented and tested separately, ready for eligible M3 calculations.
The M1 validator reconstructs the complete deterministic diagnostic envelope,
rejecting rehashed invented values, findings, availability, policies or lineage.
This preserves a truthful output contract without prematurely implementing M3.

Dataset roles/typeKeys remain proposals from section 4; none are registered.
Typed in-memory evidence is not a read authorization, dataset checksum verification,
source authentication or production acceptance. These are M2 obligations.
Arbitrary upstream engine-run inputs are rejected pending an approved trusted resolver.
No identity resolution is attempted; independent fact IDs remain independent even
when they reference one source record. Duplicate IDs/conflicting exact hashes reject.

### opportunity-confidence-v1

Reuses unchanged Shared heuristic policy and breakdown validators.

| Factor | Documented M1 points |
| --- | --- |
| Source quality, 15 | `floor(15 * measured quality)`; unavailable quality 0 |
| Measurement/definition, 15 | documented 15, limited 5; unsupported blocks |
| Comparability, 20 | exact 20; incompatible/unknown blocks |
| Geography/sector, 15 | complete 15, partial 5, unknown 0; none blocks |
| Temporal/freshness, 10 | still-fresh at explicit evaluation time 10; stale 3, unknown 0 |
| Completeness, 10 | inventory 10, sample 3, unknown 0 |
| Provenance/rights, 10 | documented analysis permission and classified license 10; undeclared license 5 |
| Benchmark/rule applicability, 5 | documented 5; unknown/not applicable blocks |

Denied/unverified analysis usage, missing provenance/license/usage policy, expired or
future source metadata, future quality assessment, estimated/conflicted evidence,
or an insufficient required operand block scoring with an explicit reason.
For each factor the weakest required input wins, using input ID as a stable tie-break.
Any supplied operand confidence bounds each factor to
`floor(factor maximum * operand score / 100)`; therefore derived score cannot exceed
the weakest operand score, even for a different Shared confidence policy.
Separate LOW/MEDIUM operand caps preserve the weakest band independently of score.
Partial/unknown inventory/coverage, stale/unknown freshness, limited method,
unverified evidence and undeclared license cap at LOW; unmeasured quality caps at MEDIUM.
Partial confidence describes a subset only, never a market-wide conclusion.
**Confidence is evidence quality, not opportunity strength or project success.**

### Integrity, bounds and compatibility

- <=32 exact role/version pins including history; <=10,000 typed facts;
  <=500 metrics/findings combined; 2 MiB canonical JSON; 20,000 cost-unit budget.
  Rule evaluation count is zero in M1; the proposed <=100 rule bound belongs to M3.
- Stable ordering of pins, analyses, inputs, facts, source evidence and limitations.
  Request hash includes evaluation time; output hash excludes only existing Shared
  volatile execution metadata. Changed fact content changes output hash.
- Every input matches requested exact version/hash and role pins.
  Fact evidence resolves to those exact descriptors; no fallback or silent truncation.
- Rights/attribution follow Shared intersection rules, including restricted sources
  and fail-closed no-input behavior.
- Diagnostic envelopes pass unchanged Shared envelope and pure Run/Input record
  validation. M1 performs **no persistence or historical replay**.
- Shared, Spatial, Market, Competitor, Data Center and Map files are unchanged.
  Dedicated AST tests actively reject prior engines, live providers, DB/store calls,
  network/AI packages, hidden clock/randomness and dynamic imports.

### Verification evidence

Synthetic fixtures only; no live opportunity dataset was read.

| Gate | Result |
| --- | --- |
| Opportunity foundation/comparison/confidence/boundaries | Final 119/119 PASS (55 + 37 + 27); initial focused run 113/113 PASS |
| First full Opportunity + Shared/Spatial/Market/Competitor/Data Center unit regression | 1,966 PASS; 3 existing browser-only skips; 66 files; 87.24 s |
| Final full regression, after six additional M1 integrity/limit cases | 1,971 PASS; 1 frozen Competitor performance failure; 3 existing skips; 66 files; 200.17 s |
| Frozen Competitor acceptance isolated recheck | 1 PASS / 1 performance failure; 20,234.29 ms against unchanged 15,000 ms bound |
| Owner-authorized targeted performance verification, 2026-10-22 | 2/2 independent runs PASS: 4,873.02 ms and 4,811.81 ms; unchanged 15,000 ms bound |
| Consolidated regression status after targeted verification | PASS: all 1,972 non-skipped cases now have passing evidence; 3 existing browser-only skips; no full-suite rerun |
| TypeScript | PASS |
| Scoped ESLint, zero warnings | PASS |
| Production Webpack build | PASS; 161/161 static generation tasks |
| `git diff --check` | PASS before documentation closure; repeated at commit |
| New PostgreSQL integration/persistence | Not applicable to pure M1; no DB/schema/provider changes |

Evidence is retained outside the repository in session files
`opportunity-m1-focused.json`, `opportunity-m1-unit-results.json`,
`opportunity-m1-unit.log`, `opportunity-m1-build.log`,
`opportunity-m1-unit-contended-results.json`,
`opportunity-m1-competitor-performance-recheck.json`.
Targeted verification: `opportunity-m1-targeted-perf-1.json` and
`opportunity-m1-targeted-perf-2.json`.
Generated build-only declaration changes were restored; no generated files committed.

**Historical performance failure, resolved by targeted verification:** the final full run measured the frozen
Competitor 32-run acceptance at 20,683.70 ms versus its 15,000 ms limit; an isolated
recheck still measured 20,234.29 ms. That same test passed in the earlier full run.
Git diff confirms the Competitor runtime, acceptance test and fixtures are byte-for-byte
unchanged from its accepted Final Technical SHA. Host CPU load was 71% when inspected,
but the exact cause is not proven. No threshold was relaxed, assertion skipped,
frozen code changed or external process stopped. All final Opportunity cases passed.
On the owner's explicit targeted-only instruction, the exact failing test was run
twice on the same Windows host/worktree, Node `v24.14.0`, Vitest `4.1.11`,
same env-file, threads pool and one worker. Only its exact test name was selected;
the other case in the file was filtered out, not disabled or modified.
The 32-analysis measured work took **4,873.02 ms** then **4,811.81 ms**, both
well below the unchanged **15,000 ms** assertion, with all determinism, identity,
isolation and result-size assertions intact. The whole-file runner durations were
5.87 s and 5.57 s respectively. No baseline code, threshold or machine setting changed.
Host CPU load before the targeted window was 36%, versus 71% inspected during the
prior failure window. This demonstrates environment-sensitive wall-clock behavior
of unchanged code; it does not identify a specific external process or prove CPU load
alone caused the earlier delay. No foreign process was stopped or inspected.
The case runs **32 interleaved Competitor analyses**, not historical replay.

Git diff against Competitor Final Technical SHA also confirms its runtime, Shared,
Data Center, test fixtures, acceptance test, Vitest config and dependency manifests
are unchanged. Opportunity is not imported by the targeted test. There is therefore
no observed M1 code regression requiring reopening or modifying Competitor.
**Full regression status = PASS (consolidated evidence, not a new full-suite run):**
the saved final aggregate provides 1,971 passing cases, and the one remaining case
now passed twice. The original aggregate failure and earlier failed isolated retry
remain preserved above; they have not been relabeled as successful executions.
M1 was presented for owner review, not automatically declared CLOSED.
The owner's subsequent authorization to start M2 accepts this reviewed baseline.

**REAL-DATA OPPORTUNITY & GAP ACCEPTANCE = BLOCKED / NOT VERIFIED.**
This is not an M1 technical failure. Fixtures are never represented as production data.
Sonar remains DEFERRED / PENDING; no final tag or main merge.
The M1 stop was respected; M2 began only after explicit owner authorization.

## 12. M2 checkpoint — Data Center integration and source/version validation

**M2 APPROVED / CLOSED. Final SHA: `2568b77c618912ca1fb41c157dfa7380ade525ee`.**
Local HEAD, remote branch HEAD and the clean isolated Desktop archive matched that
SHA at owner acceptance. The M2 stop was respected; M3 began only after approval.

### Scope and entry points

- `prepareOpportunityData(port, request, evaluatedAt)` is the pure preparation service.
- `createOpportunityDataCenterProvider(actor, context)` is the only live adapter.
- `prepareOpportunityDataCenterInputs(request, actor, context)` connects preparation
  to that adapter. It does not run calculations, business rules, persistence or replay.
- The pure index exports DTOs/preparation only, never the live adapter.
- Current engine-result M1 contracts and diagnostic behavior remain unchanged.
  Preparation has its own `jenan.opportunity-gap.preparation/v1`, version `1.0.0-m2`.
- Existing Data Center discovery and exact-content services enforce source scope,
  organization permissions, robot grants, specialty/mission, publication and retrieval
  rights. There is no direct SQL/Prisma/driver, write, new store or alternate source.
- Actor, evaluation instant, organization and specialty/mission context are trusted
  server parameters captured when constructing the provider. Request fields cannot
  grant permissions or select another actor/organization.

### Exact source/version selection and integrity

The approved request's exact role/version/checksum pins are authoritative. M2 performs
**EXACT discovery only**, one requested version per call, followed by a read of that
same version and checksum. It does not implement optional type-based discovery,
latest-version selection or fallback. Missing required need/capacity or provision/
benchmark roles produce explicit `NOT_AVAILABLE / EXACT_PIN_REQUIRED`, without I/O
to guess another source. Historical input groups are separately pinned and checked;
missing corresponding roles remain explicit, never borrowed from current inputs.

The provider delegates full stored-version checksum recomputation to the existing
Data Center reader. That checksum includes content and immutable stored metadata,
not simply `sha256(content)`. Preparation independently checks the returned
`recomputed: true` integrity DTO, the requested/stored checksum, exact version ID,
and discovery/read metadata equality, excluding only `resolvedAt`.
An additional SHA-256 digest of the exact content bytes is retained separately;
it is not mislabeled as the Data Center version checksum. Repeated exact version
reads in one preparation cannot change metadata/content silently.

Hidden, unauthorized, unpublished, superseded, expired/withdrawn and nonexistent
versions use the governed Data Center unavailable behavior. No hidden reference,
content, rights metadata or reason for denial is returned. The caller's own
requested pin remains in its source slot. Organization-scoped reads recheck scope
before invoking the existing reader. Integrity errors remain distinct for authorized
reads; policy/backend/programming faults propagate rather than become empty success.

### Dataset and provenance contract

Strict `jenan.opportunity-gap.dataset/v1` requires:

- role and actual Data Center `sourceId`;
- exact quantity definition and versioned geography/sector/cohort/metric definition/
  method/universe/adjustment plus reporting period/time-zone;
- scoped coverage status, inventory/sample/unknown completeness and source evidence;
- nonempty documented source-record inventory (`id`, original `reference`,
  `description`, canonical `recordedAt`);
- typed fact rows and explicit limitations.

Rows reuse the M1 fact fields, but evidence names **local source-record IDs**.
Benchmark rows likewise name a local authority-source record. After exact checksum
validation, the adapter-independent binder attaches the actual input ID, version ID
and checksum. This avoids an impossible checksum self-reference inside the bytes
being checksummed. Fact IDs are version-namespaced; no entity/fact deduplication or
speculative merging occurs. Duplicate local row/source identities and unresolved
source/coverage evidence reject. Benchmark source evidence must occur among row
evidence; the benchmark policy, applicability and validity are checked explicitly.

The dataset source must match Data Center metadata. Each row must match its dataset's
declared role, scope, definition and method, and pass all unchanged M1 fact semantics.
A benchmark remains normative, contextual data cannot become demand, and observations
cannot become estimates/derived comparisons. Local provenance, exact source/version/
hash and full governed metadata are retained. JSON schema validity alone does not
authenticate a source: only the server-governed provider supplies production inputs.

Final M2 role/type mapping (not registered in production):

| Role | Expected exact typeKey |
| --- | --- |
| `need.observations` | `opportunity-need-observations` |
| `supply.capacity` | `opportunity-supply-capacity` |
| `provision.observations` | `opportunity-provision-observations` |
| `benchmarks.targets` | `opportunity-benchmarks` |
| `context.indicators` | `opportunity-context-indicators` |
| `dimensions.dictionary` | `opportunity-dimensions` |

No Data Center baseline/registry changes are made. Integration tests register these
types only in rolled-back transactions on disposable, freshly migrated PostgreSQL.
Production ingestion/registration requires separately governed approved sources.

### Rights, semantic and coverage validation

- Preserve source ownership, license/class, usage policy, retrieval/export flags,
  mandatory attribution, evidence status, quality assessment, freshness and coverage.
  Nonempty license/usage policy and governed retrieval are required; M2 does not
  invent legal interpretation beyond these declared policies.
- Refuse conflicted/estimated/generated evidence, invalid/future metadata or source
  records, expired/out-of-force sources and future reporting periods.
- Unit/measure-kind/subject mismatch returns `NOT_COMPUTABLE`.
  Definition/method/cohort/universe/adjustment mismatch also blocks preparation.
- Exact geography, sector and time scopes are required; a different scope produces
  `NO_COVERAGE`. Conflicting country/declared region metadata is rejected.
  Missing geographic metadata is not assumed worldwide.
- Only complete inventory coverage can claim COMPLETE. A row cannot upgrade its
  parent dataset coverage. Partial/unknown coverage retains limitations and yields
  `PARTIAL`; source freshness is evaluated at the explicit instant, not trusted solely
  from a `FRESH` label. Null/incomplete rows also prevent a complete-ready source.
- Source slots preserve `AVAILABLE / PARTIAL / NO_COVERAGE / NOT_AVAILABLE /
  NOT_COMPUTABLE` with explicit validation reasons. The preparation-level status and
  `ready` flag summarize these slots; an empty request returns an explicit unavailable
  reason and fail-closed export rights, not a fabricated zero or empty success.
- Rights and attribution are intersected from retained input descriptors using
  unchanged Shared helpers. Restricted input licenses stay nonexportable. Uncovered
  retained sources also participate, so rights cannot be broadened by dropping them.
- `ready` means source validation passed, **not** that a gap/opportunity was computed,
  real-data acceptance passed, or a benchmark/rule is investment advice.

No direct Spatial/Market/Competitor imports or upstream facts are introduced.
No network collection, AI/LLM, scraping, Map/Projects access, Data Center writes,
domain datastore, API/UI connection, calculations, opportunity score, persistence,
historical replay or recommendation is implemented. Historical preparation is an
exact authorized read under current policy, not M4 replay.

### Bounds and determinism

The unchanged request validator enforces <=32 exact pins including baseline and
2 MiB canonical request JSON before I/O. Reads are bounded to 200,000 content
characters each. Dataset shape is bounded and cumulative parsed rows **plus source
records** must be <=10,000; exact 10,000 acceptance and 10,001 rejection are tested.
The full preparation including its hashes must fit 2 MiB. Excess rejects explicitly,
never truncates. Sequential bounded reads avoid unbounded fan-out/cross-products.
No business rule evaluation or M3 work is performed.

Stable normalized request/pin ordering, exact source snapshots, content hashes,
bound evidence, evaluatedAt, rights, attribution, work counts and validation states
participate in reproducibility hashes. Both current and historical evidence remain
separate. Request/input/output hashes are stable under input-pin permutations.
M2 makes no persistence or replay promise beyond deterministic exact preparation.

### Tests and verification

| Gate | Evidence |
| --- | --- |
| Opportunity unit tests | **169/169 PASS** across five files: foundation 55, confidence 37, boundaries 32, preparation 38, provider 7 |
| Full unit regression | **2,022 PASS**, 3 existing browser-only skips; 68 files; 124.83 s |
| Unchanged DB/Data Center/Shared/Spatial/Market/Competitor regression | **389/389 PASS**, 13 files, including real PostgreSQL/PostGIS and copied Saudi Map acceptance |
| Final Opportunity PostgreSQL integration | **14/14 PASS**, 7.99 s; no skipped cases |
| Consolidated distinct DB cases | **403/403 PASS**, 14 files, using saved baseline regression plus final focused M2 verification |
| TypeScript | PASS |
| ESLint | PASS, zero warnings |
| Production Webpack build | PASS; 161/161 static generation tasks |
| `git diff --check` | PASS; repeated before commit |

The first combined DB attempt passed all 389 baseline cases but failed one new M2
case because a test was accidentally registered inside another test callback.
The organization case was moved to suite level, and an AST registration guard now
checks all Opportunity unit/integration cases. The final **14/14** focused DB run
passes the corrected registration and organization behavior. Therefore 403/403 is
consolidated evidence, not a claim that the earlier failing aggregate was green.
No frozen test/runtime or threshold was changed to fix this test setup error.
Initial fixture-only setup failures (immutable corruption injection and missing
revision evidence) were also corrected exclusively inside disposable test setup.

PostgreSQL cases prove exact reads/no writes, wrong caller hashes, stored-content
tamper detection, no fallback from unpublished/superseded versions, hidden/missing
equivalence, current retrieval/archive checks, specialty/mission, organization
scope/membership and robot grant revocation, malformed/source/unit/scope/partial
payloads, and restricted rights/original record attribution. Counts before/after
reads include types, sources, items, versions, audits, events, usage and Shared
Run/Input rows. No writes occur. Corruption injection disables immutability only
inside the owned rolled-back test transaction, then reenables it.

Each fresh application scratch database applied all **78 existing migrations** and
was dropped. Spatial tests copied the existing loopback Saudi Map template and
used their unchanged read-only adapter/independent SQL checks; the template itself
was not modified. Saved unit, DB and build JSON/log evidence is retained outside
the repository under `opportunity-m2-*` session files.
Production build-generated declaration changes were restored; no generated files
or scratch runners are committed.

### Real data, baseline safety and stop

**REAL-DATA OPPORTUNITY & GAP ACCEPTANCE = BLOCKED / NOT VERIFIED.**
No authorized production opportunity dataset or production query was supplied.
Tests use synthetic fixtures even though the storage/permissions/checksums run on
real PostgreSQL. Frozen Spatial real-map regression is not Opportunity real-data
acceptance. Missing production access neither proves no coverage nor proves zero gap.

Changed runtime is confined to the Opportunity directory (new port, dataset schema,
preparation, one read adapter and pure exports). Existing M1 behavior is retained.
Only the global unit architecture allowlist is extended for the exact new read
provider; all previous adapter allowlists remain intact. Shared, Data Center, Map,
Spatial, Market, Competitor runtimes and all schemas/migrations remain unchanged.
No main merge, tag or Sonar. The owner subsequently reviewed and closed M2, then
explicitly authorized M3 only.

## 13. M3 checkpoint — deterministic calculations and opportunity signals

**M3 APPROVED / CLOSED. Final SHA: `839eca0bc6ac3386cfa6cc457ef540ee9d17565f`.**
Local, remote and isolated Desktop archive HEADs matched at owner acceptance.
The M3 stop was respected; M4 began only after explicit approval.

### Authority and public entry points

The owner approved M2 at `2568b77c618912ca1fb41c157dfa7380ade525ee` and authorized
M3 only. A structured follow-up explicitly approved the limited signal policy:
positive compatible total-need/capacity difference or documented target shortfall;
no investment inference, arbitrary thresholds, composite score or speculative
aggregation. Multiple observations/sources for one operand remain ambiguous until
an independently documented aggregation method is approved.

- `analyzeOpportunityData(port, request, context)` calls unchanged M2 preparation,
  then calculates from the validated exact-version evidence.
- `analyzeOpportunityDataCenterInputs(request, actor, context)` connects that flow
  to the existing read-only provider and preserves trusted organization/robot context.
- `buildOpportunityCalculationResult(request, evidence, context)` is the pure
  deterministic calculation surface for **trusted server evidence only**. It is not
  a client-authorized source-ingestion endpoint.
- `findOpportunityCalculationProblems(result)` reconstructs the full M3 output,
  rejecting modified values, formulas, confidence, findings, rights and hashes,
  including rehashed output fabrication.
- Result contract remains `jenan.opportunity-gap.result/v1`; calculation engine
  version is `1.0.0-m3`. The M1 diagnostic builder and its version-specific validator
  remain unchanged. M2 preparation remains `1.0.0-m2`.

### Calculation definitions

| Finding | Deterministic behavior |
| --- | --- |
| `DATA_GAP` | Explicit missing/partial/stale/ambiguous/incompatible-source diagnostics. `data_gap.detected=false` is emitted only when requested coverage has complete fresh exactly scoped evidence; it does not claim an economic opportunity. Unknown coverage is not encoded as zero or false. |
| `DEMAND_SUPPLY_GAP` | Signed `totalNeed - serviceableCapacity`, only for exactly comparable complete operands. Positive balance does not establish observed unmet need, accessible unmet demand or a feasible project. |
| `BENCHMARK_GAP` | Signed `measuredProvision - documentedTarget`, plus `max(documentedTarget - measuredProvision, 0)`. Exact policy, authority, scope, period, source and validity are required. A normative target is never relabeled observed demand. |
| Comparison index | `(left / right) * 100`, where right is capacity or benchmark target; 100 means equality. Carries explicit INDEX semantics, operand units and formula. A zero denominator gives null/NOT_COMPUTABLE, not infinity or an invented percentage. A still-valid absolute balance remains available. |
| `OPPORTUNITY_SIGNAL` | Exact policy `opportunity-positive-difference/1.0.0`: positive demand/capacity balance, or negative provision/target balance (positive target shortfall). Sufficient comparable false evidence gives NOT_SUPPORTED; missing evidence gives INSUFFICIENT_EVIDENCE; incompatible evidence/unsupported policy gives NOT_COMPARABLE. No probability or opportunity-strength score. |
| Historical comparison | Independently pinned and separately validated baseline balances, then `currentSignedBalance - historicalSignedBalance`. Same definitions, dimensions, methods, units and reporting frequency/time-zone are required. Nonoverlapping chronological calendar periods or chronological snapshots only; CUSTOM intervals do not establish equal reporting exposure. No interpolation, missing-baseline substitution or current-to-historical fallback. |

Signals require a requested benchmark/demand comparison and the exact approved
policy. Signals alone, without a selected comparison, return an explicit unavailable
predicate. Unknown policies do not silently use the approved policy.
The `data_gap.detected` metric is specifically a source-coverage diagnostic:
false does not suppress separate ambiguity/comparability or mathematical data-gap
findings. Always read each comparison's state and limitations independently.

### Guards, evidence and confidence

- Reuse M1 comparability and fact contracts. A unit/definition/geography/sector/time/
  method/cohort/universe/adjustment mismatch prevents arithmetic. M3 explicitly maps
  a retained dataset with a different requested scope to **NOT_COMPUTABLE**, even
  though M2 preparation records the broader source-coverage state as NO_COVERAGE.
- Missing source, unknown value, uncovered scope, observed zero and explicit false
  remain distinct. Partial/unknown inventory or stale evidence never yields a
  population-wide numeric balance or a definitive negative signal. Such balances
  carry null/NOT_COMPUTABLE; original PARTIAL source diagnostics remain visible.
- No implicit sum, maximum, averaging, deduplication or preferred-source selection.
  More than one fact or exact source pin for a required role blocks the comparison,
  even if only one source is currently usable. Served need, already-unmet need,
  context indicators and entity/branch counts do not substitute for total need or
  compatible serviceable capacity.
- Current/historical input descriptors must match retained metadata exactly;
  every role/version/checksum must be explicitly pinned. Identical fact identity
  cannot change between phases. Original evidence, source-record refs and exact
  governed source/version/checksum are retained.
- Each metric/finding carries formula/method, scope, operand refs, provenance,
  limitations, confidence or explicit null, and conservative aggregate rights.
  Restricted/uncovered retained inputs continue to constrain export/attribution.
- `opportunity-confidence-v1` is applied first to each necessary input and then
  to the comparison with operand ceilings. The result cannot exceed the weakest
  necessary operand score/band. Missing/invalid required evidence cannot be repaired
  by confidence points. Confidence is evidence quality, not opportunity strength.
- Signed differences retain operand units; base-100 indices declare their denominator.
  Arithmetic that is nonfinite or unsafe for a discrete quantity becomes explicit
  null/NOT_COMPUTABLE. No business rounding, conversion or estimated value is added.
- Normalize all unordered evidence/pins/diagnostics and output refs. Shared request,
  input and output hashes remain deterministic; run ID and timing are excluded from
  output hashes as before. Evaluation instant, selected policies, evidence and
  source diagnostics remain represented. The input hash pins exact descriptors and
  checksums; the output hash additionally covers fact rows and diagnostics.
- Bounds: <=32 retained inputs, <=10,000 combined current/historical facts, <=500
  metrics/findings, <=100 rule evaluations, <=20,000 cost units and <=2 MiB JSON.
  Reject excessive evidence/output rather than silently truncate. Complete original
  operand limitations remain in evidence; calculation reason lists are grouped
  deterministically to preserve multiple simultaneous incompatibilities.
- Recomputing output from trusted evidence is not source authentication. M3's live
  path still obtains evidence through governed M2 exact reads. M4 will add persisted
  history/replay and reauthorization; none is implemented here.

### Verification

| Gate | Evidence |
| --- | --- |
| Opportunity unit cases | **231/231 PASS**: M1/M2 169 plus M3 62 |
| Full unit regression | **2,084 PASS + 3 existing browser-only skips**, 69 files, 69.94 s |
| PostgreSQL/Data Center/PostGIS regressions | **404/404 PASS**, 14 files, 484.15 s, one complete green execution: 389 unchanged baseline plus 15 Opportunity cases |
| TypeScript / ESLint | **PASS**, zero lint warnings |
| Production Webpack build | **PASS**, compile 67 s, static generation **161/161** in 30.7 s |
| `git diff --check` | **PASS**, repeated before commit |

M3 tests cover positive/zero/negative balances, normative targets, index denominators,
overflow, all comparability dimensions (including simultaneous mismatches), partial/
unknown/no coverage, served/unmet boundaries, ambiguity/no aggregation, stale sources,
exact policy enforcement, weakest-input confidence, historical compatibility and
chronology, deterministic permutations, rehashed output tampering, unpinned/conflicting
evidence, byte bounds, read-only M2 integration, hidden/missing equivalence and explicit
backend failure propagation. PostgreSQL adds a full governed M3 calculation/signal run,
identical repeated hashes, and unchanged Data Center/audit/usage/Shared Run/Input counts.

The first unit invocation omitted DATABASE_URL and had two import/setup failures;
the final full invocation supplies an explicit nonproduction unit-only loopback URL
and passes every runnable case. No production connection or code workaround was used.
Saved evidence is retained in the session's `opportunity-m3-*` files.
All 78 existing migrations were applied to owned loopback scratch database
`se_opportunity_m3_be6b51ce1ead`; it was dropped and absence was verified.
The unchanged Spatial harness used only disposable copies of its Saudi Map template.
The temporary runner was removed. Build-only generated declaration changes were
restored; no generated assets or dependencies are included in this checkpoint.
The M3 candidate is the single implementation/test/documentation commit containing
this checkpoint, reported by its full SHA at delivery (no separate documentation
candidate SHA).

### Real-data status, unchanged baselines and stop

**REAL-DATA OPPORTUNITY & GAP ACCEPTANCE = BLOCKED / NOT VERIFIED.**
All Opportunity calculation fixtures are synthetic, including those stored in real
PostgreSQL. Real Saudi Map regressions do not establish Opportunity real-data acceptance.

No Shared, Data Center, Map, Spatial, Market or Competitor runtime change; no schema,
migration, new datastore, network collection, scraping, AI/LLM, profit forecast,
investment recommendation or Opportunity Score. No persistence/history save/replay
service, main merge, final tag or Sonar in M3. The owner subsequently approved M3
and authorized M4 only.

## 14. M4 checkpoint — persistence, exact historical replay and reproducibility

**M4 IMPLEMENTED — TARGETED PERFORMANCE GATE PASS; PENDING OWNER CLOSURE. M5 NOT STARTED.**

### Accepted boundary and architecture

M3 accepted SHA: `839eca0bc6ac3386cfa6cc457ef540ee9d17565f`.
M4 adds one pure `run-history` module and four narrowly allowlisted adapters:
`run-service`, `run-persistence`, `historical-data-center` and `replay-service`.
The existing Data Center provider, M1/M2 preparation and M3 arithmetic remain
unchanged. No Shared implementation, database schema or migration is modified.
Persistence uses existing `AnalysisEngineRun` / `AnalysisEngineRunInput` tables,
not a new Opportunity datastore. The pure index never exports live adapters.

Entry points:

- `runOpportunityAnalysisPersisted(request, actor, context)` validates trusted server
  execution/access context, captures governed M2 exact reads, runs M3 unchanged,
  constructs the Shared record, reauthorizes evidence and atomically saves the run
  and all input rows. A save error propagates; it never returns a successful result.
- `readOpportunityRun(runId, actor)` filters by engine plus owner/actor kind or current
  human admin in the lookup itself. Foreign and absent runs share a generic
  `OpportunityHistoryUnavailable`. It validates columns/snapshots, exact evidence,
  current rights and complete result reproduction before returning cached history.
- `replayOpportunityAnalysis(runId, actor)` uses a RepeatableRead transaction, current
  authorization and exact historical rows; returns the fully reconstructed result.
  No discovery service, latest-version selection, history write or fallback.

### Run/Input/Output and source retention

The append-only Shared run contains the full normalized request and M3 output,
request/input/output hashes, engine version `1.0.0-m3`, evaluation instant, timing,
owner/robot principal, subject, confidence summary, gap counts and cost. Historical
arithmetic is supported only at that exact contract/version; no silent upgrade.

Each Shared input row stores the exact version ID/checksum and full governed input
descriptor, Data Center source/type/version IDs, original source-record provenance,
usage intent and a separately calculated **SHA-256 of content bytes**. The content
digest is not confused with the Data Center full-version checksum.

Run runtime `jenan.opportunity-gap.run-history/v1` contains the trusted specialty/
mission/organization authorization context plus the ordered exact read transcript.
It retains discovery DTOs, exact requested version/hash, read status, original
metadata, content kind, integrity response and source bytes. This is a bounded
historical snapshot in the existing Shared record, not a new source store.
Storing original bytes permits rejection of manipulated facts or a transcript
that still happens to have a syntactically valid result hash.

Runtime/transcript is independently bounded to 2 MiB and <=64 operations (32 pins,
each exact discovery/read). Request/result retain existing 2 MiB bounds. Excess is
rejected rather than dropping provenance. A source-unavailable result is preserved
as such: later publication cannot fill a historically missing operand.

### Exact historical authorization and replay

1. Lookup the run using current owner/admin restrictions; no revealing second
   existence query.
2. Validate Shared record, engine version, all duplicated columns, snapshot values,
   hashes, confidence summary and immutable M3 reconstruction.
3. Reauthorize **every retained reference**, including discovery metadata and
   malformed/uncovered/excluded inputs, not only operands used in calculations.
4. Query the original Data Center version ID directly. Apply current source scope,
   organization membership/required permission, robot grants/mission assignment,
   specialty/mission restrictions, retrieval permission, archive/conflict checks.
5. Recheck declared license/class, usage policy, export/attribution and ownership.
   Changed rights fail closed; do not serve stale cached rights or silently broaden
   them. These checks also apply to human admins where rights/archives are concerned.
6. Recompute the existing Data Center full-version checksum from actual stored
   columns/upstream refs; require the originally captured version number/hash.
   Compare original stored content bytes with the retained read response.
7. Feed the validated transcript through M2 preparation and unchanged M3 calculations
   at the original request, policies and evaluation instant. This is an in-memory
   exact transcript port, **not live discovery**. Require the same operation order,
   query pins, number of calls, all three hashes and complete canonical result.
8. Return the recomputed result. No writes and no selection of replacement versions.

Historical supersession or temporal expiry does not upgrade the run: arithmetic
uses the original evaluation instant and exact bytes. Current archive, access,
retrieval or license-policy revocation still prevents access. Originally missing
versions stay missing even if newly published. A checksum/byte/column/transcript/
output mismatch is an explicit integrity failure, never an empty successful result.
An integrity hash proves consistency, not caller authorization; production capture
must originate in the trusted governed adapter, never arbitrary client JSON.

### Atomicity, append-only behavior and failure/recovery

- One nested Shared `create` saves Run and Input rows in a RepeatableRead transaction;
  no update/upsert/delete and no Data Center usage/audit/write path.
- Existing DB append-only triggers protect both tables against update/delete.
  Duplicate run IDs fail rather than overwrite or masquerade as a new successful run.
- Real DB tests inject a failing nested Input insert in a scratch-only savepoint,
  prove no partial Run/Input rows remain, then retry the same ID successfully.
- Invalid execution and backend/save failures propagate; a pre-result exception
  does not fabricate a successful result or partial history. This M4 surface does
  not introduce a separate failed-before-result history format.
- Corruption tests temporarily disable exact named immutability triggers only inside
  disposable test transactions and restore them in `finally`; production adapters
  contain no such capability. No production database is reset or written.

### Verification

| Gate | Evidence |
| --- | --- |
| Focused pure history and boundary tests | Initial 71/71 PASS |
| Focused real PostgreSQL | Initial 38/38 PASS, 29.48 s; final expanded Opportunity coverage **41/41 PASS** |
| Opportunity unit cases | **252/252 PASS**, including 17 history cases and four additional boundary probes |
| Full current unit regression | **PASS (consolidated evidence)**: saved 2,104 passing cases plus the sole timing case passing twice in the targeted review below; 3 existing browser-only skips. Not a new green aggregate execution. |
| Full PostgreSQL/Data Center/PostGIS regression | **430/430 PASS**, 14 files, 499.90 s, one complete green execution (389 unchanged baseline + 41 Opportunity) |
| TypeScript / scoped ESLint | **PASS**, zero warnings |
| Production Webpack build | **PASS**, compile 42 s, static generation **161/161** in 11.0 s |
| `git diff --check` | **PASS**, repeated before commit |

Added coverage: durable committed history read/replay across separate real
transactions; exact old versions after new publication/expiry; independently pinned
historical periods; missing evidence stays missing; actor/owner isolation; current
license/retrieval/attribution/export/private scope; organization membership;
specialty/mission context; robot-grant revocation; retained excluded metadata;
version bytes, result/hash/input-column/transcript corruption; duplicate IDs;
atomic nested-insert failure/retry; database append-only triggers; invalid execution.

An AST test-registration guard caught three newly added cases accidentally nested
under another case before the final database regression. They were moved to suite
level. The earlier full-unit attempt is retained as failed evidence, not relabeled
as a green run.

The final unit aggregate then passed the corrected registration guard and all
Opportunity cases, but the unchanged frozen Competitor 32-interleaved-analysis case
took **19,219.47 ms** against its unchanged **15,000 ms** threshold. Its first targeted
retry took **17,136.85 ms** and also failed. No Competitor runtime, test, fixture,
threshold or machine setting was changed. Host CPU load observed after the aggregate
was 59%; this is evidence of possible contention, not proof of a specific cause.
After the complete database regression, the second and final bounded targeted retry
took **19,999.02 ms** and also failed. Therefore **Full regression = NOT PASS**.
Although this same unchanged case passed in the first M4 unit attempt (which failed
the AST registration guard), current passing timing evidence has not been established.
No further repeated full suites or threshold changes were used to force acceptance.
All failing executions remain saved and must not be described as green.

Both fresh owned application scratch databases applied all **78 existing migrations**
and were confirmed dropped: `se_opportunity_m4_c414c0502411` (focused) and
`se_opportunity_m4_fef057953c63` (full regression). The unchanged Spatial harness
used disposable copies of its Saudi Map template; the template was not modified.
Saved logs/JSON use `opportunity-m4-*` session filenames. The temporary runner is
removed before delivery, and generated build declaration changes are restored.
The delivery SHA identifies one implementation/test/documentation checkpoint commit,
**not an accepted closed baseline**. The targeted review below resolves the timing
gate with saved evidence; owner closure is still required and M5 is not authorized.

### Targeted performance review — 2026-10-22

The owner authorized only the failed performance scenario and at most two targeted
rechecks, not another full suite or modifications to frozen engines/thresholds.
Exactly two targeted invocations were performed on the same host/worktree, Node
`v24.14.0`, existing Vitest/configuration and unchanged unit-only environment:

`Competitor M5 bounded synthetic acceptance > keeps 32 interleaved complete analyses
deterministic and isolates source/result mutation`

Scenario: 32 interleaved analyses, 15 locations per run, with deterministic-result
and mutation-isolation assertions. It is not historical replay.

| Invocation | Actual bounded `totalMs` | Required threshold | Outcome |
| --- | --- | --- | --- |
| Targeted review 1 | **8,562.99 ms** | **<15,000 ms** | PASS |
| Targeted review 2 | **8,260.77 ms** | **<15,000 ms** | PASS |

The threshold measures scenario `totalMs`, not the whole Vitest process or test
callback duration. Each invocation ran only this scenario; the other test in that
file was excluded by the selector. No runtime/test/fixture/configuration/dependency
or machine-setting changes were made. Git verified unchanged code/config against
M4 implementation SHA `6218c885a56a78f70b6c9774365688e45cd16ae7`.

**Targeted performance gate = PASS.** The timing failure is non-deterministic/
environment-sensitive (flaky timing), not a consistently reproducible arithmetic
or M4 functional failure. These results do not prove a specific external process
or CPU contention was the exact cause. No frozen engine was reopened or modified.

Saved evidence: `opportunity-m4-performance-review-1.json/.log` and
`opportunity-m4-performance-review-2.json/.log`. Earlier failures remain preserved.
Full regression now has consolidated passing evidence (2,104 previously passing
cases plus this one case passing twice); the earlier aggregate execution itself
remains failed. No full suite, database suite or build was rerun for this
documentation-only verification checkpoint.

The implementation SHA above is unchanged. The final review candidate is the
documentation-only commit containing this verification, reported at delivery with
matching local/remote/isolated Desktop archive HEADs. This explains the two SHAs
without presenting an implementation commit and a different unexplained candidate.
Await owner acceptance; **M5 NOT STARTED**.

### Real-data status and stop

**REAL-DATA OPPORTUNITY & GAP ACCEPTANCE = BLOCKED / NOT VERIFIED.**
Synthetic Opportunity fixtures on real PostgreSQL are not production acceptance.
No Map, Data Center baseline, Shared or prior-engine runtime changes; no external
network, scraping, AI/LLM, score or investment inference. No main merge or final tag.
Sonar remains DEFERRED / PENDING. The M4 checkpoint stopped here pending owner review.

## 15. M5 — Final Technical Acceptance & Closure

### Authority, scope and baseline

The owner explicitly **CLOSED M4** at
`93a9f9de18d2aeb916396198c9ca4df7bb24c575` and authorized M5 only.
Local, remote Opportunity branch and clean isolated Desktop archive were verified
at that exact SHA before M5. The owner accepted the two saved timing passes and
explicitly waived another full regression solely to re-establish M4.

M5 adds acceptance tests and this documentation, not engine runtime behavior.
Map, Data Center, Shared, Spatial, Market and Competitor runtime/schema/workflows
remain unchanged. No production fixtures, data registry changes, routes or UI.
No engine five, main merge, final tag or Sonar execution.

### Final acceptance implementation

- Three pure acceptance cases: 32 interleaved four-source complete calculations
  (data coverage, demand/supply, benchmark and both approved deterministic signals);
  16 exact in-memory transcript reconstructions with live ports deliberately disabled;
  and >2 MiB request rejection before any source I/O.
- Exact expected arithmetic, input count, deterministic hashes, result byte bound,
  request/source/result mutation isolation and blocked real-data status are asserted,
  not only successful function return values.
- Five committed PostgreSQL acceptance cases: eight persisted full-source runs at
  concurrency four, sixteen exact persisted replays at concurrency four, four racing
  duplicate IDs (one success and three explicit unique-key failures), real nested
  child insertion failure/atomic rollback/same-ID recovery, and eight concurrent
  foreign/missing read/replay requests returning the same unavailable error.
- Each committed case verifies Run/Input row deltas and unchanged Data Center source,
  item, version, type, usage, audit, event and quality counts. Full cached results
  and replays are compared, including the restrictive no-export rights.
- The database acceptance file is opt-in and refuses any database not matching
  `se_opportunity_m5_[a-f0-9]{12}` before fixture creation or test-only DDL.
  The injected child failure uses a validated generated UUID-derived run ID and
  an exactly named constraint removed in `finally`. Production has no such path.
- The AST suite-level registration guard now includes the new acceptance file.

### Evidence and measurable gates

| Gate | Evidence |
| --- | --- |
| Opportunity unit tests | **255/255 PASS**, including three new M5 acceptance cases |
| Opportunity plus global engine-boundary selection | **273/273 PASS**, nine files, 13.61 s |
| Full unit regression | **PASS, consolidated evidence**: 2,104 saved passing M4 cases + the sole frozen timing case accepted after two targeted passes + three new M5 cases = 2,108 distinct passes; three existing browser-only skips. No new aggregate execution claimed. |
| Full PostgreSQL / Data Center / PostGIS baseline | Saved accepted **430/430 PASS**, 14 files, 499.90 s; includes 41 Opportunity exact-history/tamper/access/append-only cases and the unchanged real-Saudi Spatial harness. Not unnecessarily rerun. |
| New committed Opportunity acceptance | **5/5 PASS**, 27.14 s process / 22.64 s test suite |
| Frozen Competitor committed acceptance, freshly rerun unchanged | **5/5 PASS**, 30.48 s process |
| Frozen Market committed acceptance, freshly rerun unchanged | **5/5 PASS**, 15.64 s process |
| Combined distinct database coverage | **445 distinct PASS**, consolidated baseline plus 15 targeted committed acceptance cases, not one aggregate execution |
| New fresh databases | Each applied all **78 existing migrations**, then confirmed dropped |
| TypeScript / scoped ESLint | **PASS**, zero warnings |
| Production Webpack build | **PASS**, compile 79 s; static generation **161/161** |
| `git diff --check` | **PASS** before technical checkpoint commit |
| CodeQL security-extended | **PASS** for JavaScript/TypeScript and Actions on the exact technical SHA below; no analysis errors/warnings and zero new/open alerts |

| Scenario | Count / concurrency | Total | p50 | p95 / max | Gate |
| --- | --- | --- | --- | --- | --- |
| Pure four-source calculations | 32 interleaved | 1,899.45 ms | n/a | n/a | <15,000 ms total: PASS |
| Pure exact transcript replay | 16 interleaved | 388.92 ms | n/a | n/a | <15,000 ms total: PASS |
| Committed Opportunity runs | 8 / 4 | 5,929.48 ms | 2,411.25 ms | 3,607.91 ms | <15,000 ms each / <30,000 ms batch: PASS |
| Committed Opportunity replays | 16 / 4 | 4,620.62 ms | 1,125.63 ms | 1,377.39 ms | <15,000 ms each / <30,000 ms batch: PASS |
| Frozen Competitor runs / replays | 8 / 4; 16 / 4 | 6,879.31 / 7,756.50 ms | 3,319.80 / 1,857.86 ms | 3,584.99 / 2,402.62 ms | Same unchanged gates: PASS |
| Frozen Market runs / replays | 8 / 4; 16 / 4 | 3,250.07 / 2,900.03 ms | 1,298.89 / 701.14 ms | 1,943.22 / 787.63 ms | Same unchanged gates: PASS |

The per-operation/batch thresholds follow the accepted Market/Competitor M5
bounded acceptance prior art; they were not raised after a failure. These are
small synthetic workload measurements, **not production capacity/SLA claims**.
The database acceptance measurements ran while final type/lint checks were also
active on the same host; all gates passed without retries or environment changes.

Scratch databases dropped:
`se_opportunity_m5_13895a76ba21`, `se_competitor_m5_bd0bfe14efc9`,
`se_market_m5_c25e01ff5538`. Saved session receipts:
`opportunity-m5-unit-results.json`, `opportunity-m5-unit.log`,
`opportunity-m5-db-{opportunity,competitor,market}.json`,
`opportunity-m5-db-acceptance.log`, and `opportunity-m5-build.log`.

### Exact-SHA CodeQL and versioned closure

**Scanned code/test SHA: `f9b44b849e6cec93631db20cbb9c2b795058e836`.**
This commit contains all acceptance tests and locally verified artifacts.
The follow-up closure commit changes only documentation to record the completed
scan and final delivery; it does not substitute an unscanned technical candidate.
The owner subsequently approved M5 and explicitly designated that documentation-only
closure, `10dcafcf27c45db8b371fa5b79ac9da6bc4f21a5`, as the accepted Final Technical
SHA. The exact-SHA scan target above remains unchanged. Engine four is frozen;
only engine five's M0 architecture/planning is now authorized.

Existing unchanged `codeql.yml` was manually dispatched on the Opportunity branch:
[CodeQL run 39760768528](https://github.com/Jenan21/jenanbiz1-git/actions/runs/39760768528).
Its recorded `headSha` exactly matches the technical SHA:

| Category | Analysis ID | Rules | Raw results | Outcome |
| --- | --- | --- | --- | --- |
| JavaScript / TypeScript | `2003842967` | 103 | 5 | PASS, empty error/warning |
| Actions | `2003834707` | 23 | 0 | PASS, empty error/warning |

Both jobs and the overall run completed successfully. Before/after repository alert
snapshots contain the same five previously dismissed and six fixed alerts:
**zero new alerts, zero open alerts**. Five raw JavaScript findings are not falsely
reported as zero raw findings or new Opportunity defects. No dismissed alert was
created, dismissed or edited during this work.
Receipts: `opportunity-m5-codeql-alerts-before.json`,
`opportunity-m5-codeql-alerts-after.json`, `opportunity-m5-codeql-analyses.json`,
`opportunity-m5-codeql-run.json`.

### Status and stop

**OPPORTUNITY & GAP ENGINE = TECHNICALLY COMPLETE — PENDING FINAL SONAR.**
All M5 technical gates pass. No runtime or schema change was required.
**REAL-DATA OPPORTUNITY & GAP ACCEPTANCE = BLOCKED / NOT VERIFIED.**
All new database content is explicitly synthetic despite using real PostgreSQL.
**Sonar = DEFERRED / PENDING.** No engine five before owner approval of M5.

Delivery uses the pushed documentation-only closure HEAD for Local = Remote =
clean isolated Desktop archive; the exact hash is recorded in the delivery report
rather than attempting a self-referencing commit SHA. The technical SHA above stays
fixed. The central Desktop's unrelated dirty Auth checkout is not staged, switched
or modified (HEAD `874cd98699594f42e896628d2df3427af95fab6a`, tracked binary-diff
SHA-256 `83e10f1393233c158909908404f41f697ef5ccd0bcd920b171d69cd9f8e546f6`
preserved). Remote main/integration remain at their pre-M5 SHAs.
No final tag or main merge, and stop here for owner review.
