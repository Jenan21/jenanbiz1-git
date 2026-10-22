# JENAN OPPORTUNITY & GAP ENGINE — M0 ARCHITECTURE & IMPLEMENTATION PLAN

## 1. Status and authority

**M0 PROPOSAL FOR OWNER REVIEW. M1 NOT STARTED.**
The owner accepted Competitor technical closure and authorized this fourth engine's
architecture/planning only. After clarification, the owner confirmed its actual Final
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
are authorized by this plan. No main merge, tag, Sonar or M1 implementation.
Branch integration is a separate operation: no merge is performed during M0.
Before implementation, confirm the accepted Competitor-to-engines-integration
promotion and create the dedicated `jenan-engines/opportunity-gap` branch from that
accepted integration point, preserving all three technical baselines.

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

Proposed factor maxima (100 total), for owner review before M1:
source quality 15; measurement/definition quality 15; comparability 20;
geographic/sector coverage 15; temporal alignment/freshness 10; completeness 10;
provenance/rights 10; benchmark/rule applicability 5.
Proposed band thresholds: HIGH >=80, MEDIUM >=60, LOW >=40.
M1 must define evidence-backed point rules per factor and active policy validation;
this table alone does not authorize arbitrary point assignment.

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

Review before M1:

1. Approve separate DATA_GAP / BENCHMARK_GAP / DEMAND_SUPPLY_GAP / OPPORTUNITY_SIGNAL;
   no ranking, investment recommendation or composite opportunity percentage.
2. Approve strict observed-need versus serviceable-capacity semantics and no inference
   from population or competitor/location counts.
3. Approve the proposed v1 analyses, deferring estimates, and confidence policy direction.
4. Approve Data Center-first inputs; defer cross-engine fact ingestion until a trusted
   orchestrator contract exists, with no frozen-engine edits.
5. Approve the proposed phase split and the separate integration/branch preparation
   before M1. No integration merge is implied by this documentation draft.

**STOP AFTER M0. No implementation, registration, migration, tests/build, network
collection, main/integration merge, tag, Sonar or M1 start is performed by this plan.**
