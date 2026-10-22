# JENAN OPPORTUNITY & GAP ENGINE — M0 ARCHITECTURE & IMPLEMENTATION PLAN

## 1. Status and authority

**M0 APPROVED. M1 implemented; technical gates verified, pending owner review.
M2 NOT STARTED.**
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
are authorized by this plan. No main merge, tag, Sonar or M2 implementation.
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

**M1 IMPLEMENTED — TECHNICAL GATES VERIFIED / PENDING OWNER REVIEW. M2 NOT STARTED.**

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
M1 is ready for owner review, not automatically declared CLOSED.

**REAL-DATA OPPORTUNITY & GAP ACCEPTANCE = BLOCKED / NOT VERIFIED.**
This is not an M1 technical failure. Fixtures are never represented as production data.
Sonar remains DEFERRED / PENDING; no final tag or main merge.
Stop for M1 review; do not begin M2 automatically.
