# JENAN MARKET & DEMAND ENGINE — ARCHITECTURE & IMPLEMENTATION PLAN

## M0 status and authority

**M0 APPROVED on 2026-10-21, including M1–M5 and the detailed contract/policy basis.
M1 was subsequently accepted and CLOSED at
`d95da8030fbdcd6e68199cc4ca60bb6f528ece01`. The owner then authorized M2 only.
M3 was subsequently authorized and accepted as recorded below.**

**Owner finalization (2026-10-21): M2 = CLOSED.** Final M2 implementation SHA:
`e905daa0675f4cccf808978280cfe34eb133bc20` (TECHNICALLY COMPLETE).
M2 PostgreSQL datasets were **Fixtures / Synthetic**, never Real Demand Data.
Production visibility is **NOT VERIFIED**; the local connection's missing schema does
not mean the production Data Center lacks Market data. Real-data demand acceptance
remains **BLOCKED / NOT VERIFIED**, not an engine failure.

**Subsequent owner acceptance: M3 = CLOSED** at
`e57a295d6d09343ccc3bdfbc62f8093646bc97d2`, with Local HEAD = Remote HEAD = Desktop HEAD
verified identical. The owner then explicitly selected **"ابدأ M4 فقط وفق الخطة المعتمدة"**:
existing Shared Run/Input persistence and exact authorized historical replay only.
The M4 checkpoint is recorded in section 17; it does not authorize M5.
Shared Core, Spatial, Map and the Data Center frozen baseline remain unchanged.

- Engine: Market & Demand Engine / محرك السوق والطلب.
- Proposed engine key and directory: `market-demand`,
  `services/analysis-engines/market-demand/`.
- Branch: `jenan-engines/market-demand`, created from
  `jenan-engines/integration@f87c30e794df11c39d275434a4c223d5ade5d6e4`.
- That two-parent merge records: "Spatial technical baseline merged for subsequent engine
  development; final closure pending Sonar."
- Spatial remains **TECHNICALLY COMPLETE — PENDING FINAL SONAR**.
  Final Technical Engine SHA: `8d97baace8abd6889f400a56952e345f3068f3af`.
  Sonar-only setup SHA: `98ad93e3706a506bed8e6df9ff6e0eec1a2e64d0`.
- No Spatial final tag, no merge to `main`, no Sonar subscription or further Sonar attempts.
  The final Sonar policy is recorded in [the shared architecture](analysis-engines.md).
- The initial M0 was documentation only. The M1 checkpoint below records the pure contract,
  validation and arithmetic implementation; it adds no Data Center connection, migration,
  registered type/record, dataset store, UI, API or production analytical run.

### Approved decisions, incorporated without implementation

1. A count is not demand. A measurement needs explicit subject, unit, reporting period,
   geography, sector/cohort, source and observation/estimate semantics. Population, business
   and POI counts remain contextual unless a genuinely different demand observation is supplied.
2. Additive engine-neutral primitives for quantities, dimensions, time windows, signed absolute/
   percentage change and base-period indices are allowed when needed. Existing Spatial
   contracts keep their meaning. A zero/invalid denominator never yields a percentage.
3. Data Center is the only governed dataset source. Reuse the shared run/input tables and
   contracts; do not create a second Market dataset store or force economic data into GeoJSON.
   Large inputs remain future immutable references, not larger inline content limits.
4. Strict Market boundaries prohibit Spatial/Projects imports, network calls, AI/LLM arithmetic,
   Data Center/Map writes, business recommendations, success probability and revenue prediction.
5. Results distinguish OBSERVED, ESTIMATED, DERIVED and CONTEXTUAL independently from
   availability states. Confidence policy id is exactly **`market-confidence-v1`**.
6. Time semantics are mandatory from the beginning. No implicit interpolation, adoption rate,
   current-period substitution or conversion of population/competitors into a market value.
7. No "market size in SAR" without appropriate sales/transaction evidence or an approved
   explicit valuation methodology. Monetary sizing remains excluded from this v1 proposal.

## 1. Exact purpose

Describe the **size, composition and observed change of demand** for a specified sector,
geography, population/cohort and period, from readable governed source versions. Keep
observations separate from explicit assumption-based estimates and contextual indicators.

The engine answers: what was observed, where, when, in what unit, how it changed on a
comparable basis, and what cannot be established. It does not answer whether a project
should launch, what revenue it will earn, which location wins, or its probability of success.

Supply-side counts, POIs, marketplace listings, population size, GDP and internet search
signals are not purchases or demand by themselves. A demand proxy stays a labelled proxy;
it cannot silently substitute for an absent measured demand dataset.

## 2. Shared Core reuse and discovered constraints

Reuse the existing pure modules, not copies of them:

| Existing capability | Intended reuse |
| --- | --- |
| Canonical JSON, SHA-256, rounding and stable comparison | Normalization and request/input/output hashes, stable ordering |
| Metric/run/platform states and errors | Null unavailable values; explicit partial/estimated/error states |
| EngineInput and source/version descriptors | Exact version/hash, source, quality, dates, rights, coverage and attribution |
| Gap catalog/rendering/normalization | Engine-specific bilingual gaps combined with common gaps |
| Confidence-policy framework | Explainable `market-confidence-v1`, not Spatial's geometry weights |
| Rights, export and envelope validation | Fail-closed export and full provenance, including derived outputs |
| Cost primitives | A request-only market work estimate and early admission check |
| RunRecord contract and AnalysisEngineRun/Input tables | Append-only run/input history, provenance and usage without new Project/Map FKs |

**Do not pretend every reusable contract already has a generic implementation:**

1. The current shared `COUNT`/`DENSITY` metrics explicitly mean mapped features; using them
   for transactions or products would violate their meaning. Current numeric kinds also
   reject negative values, so a falling demand series cannot be represented as a signed
   numeric change without an additive contract extension.
2. The owner approves additive generic primitives in principle. The concrete proposal below
   uses `QUANTITY`, `CHANGE` and `INDEX`, explicit dimensions/units, time windows and an
   optional metric-semantics block. M0 approval authorizes these additions in M1;
   never reinterpret existing COUNT, RATIO or ORDINAL, or encode a negative number as text.
3. The existing database persistence, usage and historical-replay implementations live under
   `spatial/adapters`, and some are GeoJSON/Spatial-specific. Market must not import them.
   The shared tables and pure run contracts are reusable; those adapter implementations are
   not yet an engine-neutral service.
4. The architecture test currently permits adapters only in Spatial and names the allowed
   files explicitly. Market needs a narrow additive boundary-test update, not a disabled guard.

Additive Shared Core extensions must preserve old payloads/hashes when optional fields are
absent, and pass Spatial regression tests. Any extraction or fix requiring edits to frozen
Spatial must be brought to the owner **before editing**. This document does not authorize
rewiring Spatial or claim that its adapter implementations have already moved into Shared Core.

## 3. Architecture and independence

```text
Trusted caller / later orchestrator
    -> market request normalization and admission limits
    -> injected MarketDataPort
        -> Market adapter
            -> existing Data Center published discovery / exact content read
    -> typed observation validation and comparability checks
    -> deterministic analysis -> common envelope validation
    -> authorized engine-run persistence / replay adapter
        -> shared AnalysisEngineRun / AnalysisEngineRunInput
```

The pure core has no database, framework, environment, hidden clock, randomness, network or
AI/LLM access. Actor context, clock, run id, ports and server budget are injected. Adapters
retain existing Auth/RBAC, robot grants, source scope, retrieval restrictions and concealment.

Data Center remains Registry/Governance, not an analytics engine. Its frozen schema, services
and baseline migrations are not rewritten. Market performs its own typed content validation
after the existing reader has verified the stored Data Center checksum.

The existing `services/market/market-service.ts` is a marketplace-listing transaction service,
not this engine. Its listing-quality heuristic and asking prices are not market-demand
evidence. It is not imported, replaced, or wired into the engine.

### Relationship to Spatial

- No Market-to-Spatial imports, direct invocation, DB joins to Spatial run internals or
  dependency on the Spatial implementation/version.
- Geography in v1 is an exact declared administrative/statistical area, not an arbitrary
  polygon needing spatial recomputation.
- A later orchestrator may supply an authorized, immutable ENGINE_RUN reference to an
  approved upstream result, using a common contract and exact output hash. A client-supplied
  JSON blob or hash alone does not prove authorization or provenance.
- v1 does not ingest Spatial results. Documented spatial facts may be optional context in a
  future orchestrator/contract integration, never a prerequisite for demand calculations.
  They cannot turn population into buyers or POIs into transactions.
- If optional engine-output ingestion is enabled later, a resolver must validate current
  access, the stored run/version/output hash and lineage/rights; do not trust copied claims.
  Do not add that dependency or resolver during Market M0.

## 4. Data required from Data Center

The following are **proposed roles/content contracts**, not claims of existing registered
types or datasets. Registering/publishing sources is a separate approved governance action.

| Role | Minimum source content | What it can establish |
| --- | --- | --- |
| Observed demand | Sales/transactions, service use or product volume by sector, area, cohort and reporting period; quantity unit; census/sample scope | Observed quantity or explicitly scoped subtotal |
| Demand series | Comparable observations with stable methodology and reporting basis | Period change, growth or decline where comparable |
| Population/cohort | Official or otherwise governed population/household cohort, geography and reference period | Audience context, not customer count |
| Consumption assumptions | Dated eligible share/adoption/frequency, measured or reviewed estimate, with exact denominators and compatible units | Explicit assumption-based demand estimate |
| Classification dictionary | Sector taxonomy/version, area authority/code/version, cohort definitions and unit/period semantics | Exact matching and auditable joins |

### Proposed role/typeKey bindings

Use four registered type keys at most. A demand time series is multiple observations in
one logical dataset, not a second copy or an artificial version per reporting period.

| Engine role | Proposed Data Center typeKey | Layer | Required for |
| --- | --- | --- | --- |
| `demand.observations` | `market-demand-observations` | DATA | OBSERVED_DEMAND, DEMAND_TREND |
| `context.indicators` | `market-context-indicators` | DATA | MARKET_CONTEXT, AUDIENCE_CONTEXT |
| `demand.assumptions` | `market-demand-assumptions` | DATA | ASSUMPTION_BASED_DEMAND only |
| `dimensions.dictionary` | `market-dimensions` | DATA | Taxonomy, geography, cohort and unit definition validation |

The proposed content contracts are `jenan.market.observations/v1`,
`jenan.market.context/v1`, `jenan.market.assumptions/v1` and
`jenan.market.dimensions/v1`. None has been registered by this M0. Existing registered
equivalent types can be mapped only after actor-authorized inventory and schema equivalence
checks, never by guessing a type key. A version must match both its type and content contract.

Observed-demand rows require `measuredSubject` such as fulfilled purchase transactions,
service-use events or product units actually sold; `evidenceNature=OBSERVATION`; a measurement
method; and an explicit `statisticalScope`. Unmet intentions, internet interest, active
businesses and population cannot be relabelled as these subjects. Estimated source rows
remain estimates; they do not satisfy a request for observed demand.

Each role pins the Data Center version and its actual checksum. Row ids identify observations
inside that version. No row is independently copied to a Market source table. Assumption rows
record adoption/frequency value, basis, applicability, method, evidence nature and source
lineage; unsupported free-text assumptions never become calculation inputs.

Each observation needs an id, sector code/classification version, area authority/level/code/
boundary version, cohort/universe, period start/end and granularity, metric definition, numeric
value, unit, measurement method/version, coverage/completeness declaration and revision identity.
Sampling weight/uncertainty and suppression flags are required when applicable; absent metadata
is not manufactured. No individual customer records or personal identifiers are accepted.

The Data Center descriptor supplies the exact version id, source id, checksum, evidence state,
rights, source publication/effective/expiry dates and recorded quality. Content supplies the
market-specific statistical dimensions that the frozen schema does not model.

Use existing `discoverDataCenterVersions` and `readDataCenterVersionContent`: the latter
already returns non-GeoJSON content as `OTHER`. The Market adapter must validate that raw
content against a versioned market observation schema; `OTHER` does not mean usable.
Exact pins never fall back. By-type selection must be deterministic at a captured `asOf`,
with its candidate/selection trace retained.

Country/region/bbox metadata is not a declaration of complete city, sector, cohort or time
coverage. Validate those dimensions against the content's explicit statistical universe.
Unknown coverage is never treated as national/full-market coverage.

Keep the existing 200,000-character Data Center content limit. Do not split a logical dataset
into artificial versions or increase the limit for Market. A large-data reader would require
a separate approved immutable-artifact contract; until then it is an explicit capability gap.

### Current availability evidence

M7 established an actual Saudi Map sample and no suitable real population/constraint source
for that acceptance. That says nothing about measured purchases or demand. No approved
Market observation dataset, taxonomy, sampling method or consumption-assumption dataset has
been supplied for this M0. Production Data Center market availability has **not** been
inventoried under an authorized consuming actor here; it remains **UNVERIFIED**, not "empty."
Data inventory is a first execution prerequisite, not a reason to fabricate a fixture result.

## 5. Proposed v1 analyses and deterministic methods

| Analysis | Proposed calculation / limitation |
| --- | --- |
| MARKET_CONTEXT | Source-backed sector/geography/cohort/period descriptors and available indicator observations; no synthetic overview score |
| OBSERVED_DEMAND | Source observations; sum only explicitly disjoint additive partitions on the same definition/unit/period/universe |
| DEMAND_TREND | Explicit comparable period pairs: absolute change, optional percent change and base-100 index; negative change allowed; invalid/zero base disables the affected derivative |
| AUDIENCE_CONTEXT | Population/household cohort as an observed context value; no assertion that all residents are potential buyers |
| ASSUMPTION_BASED_DEMAND | Optional `eligible population × explicit adoption fraction × frequency per matched period`, only with compatible source-backed inputs; always ESTIMATED |

`changeAbsolute = current - previous`; `changePercent = 100 * (current - previous) / previous`
requires a finite positive previous value; `index = 100 * current / base` requires a finite
positive base value and an explicit base period. A zero baseline still permits absolute
change when both observed values are valid. Percent is not a probability or market-share
claim; index is not a project score. Current/base values must come from the same comparable
series. The calculation trace retains the unrounded values and operand refs; round the final
display metric once under a declared method version.

Trend v1 does not extrapolate future periods, smooth gaps, interpolate missing observations or
automatically seasonally adjust. Different-length periods, real/nominal definitions, changed
classification/boundaries/universe, or sampling bases cannot be compared without an explicit
governed crosswalk/transformation. No inferred equivalence.

Zero is valid only when the source positively establishes the exact quantity/universe/period
as zero and does not mark it missing, censored or suppressed. A sample zero does not establish
zero total-market demand. An observed sample subtotal may be reported as PARTIAL, explicitly
limited to the observed sample; no undocumented extrapolation or sum across overlapping cohorts.

Duplicate/revised records are handled by explicit revision precedence inside a pinned version.
Unresolved conflicting duplicates refuse the affected metric, rather than arbitrary first-row
selection or double counting. Requests never silently convert currencies, periods or units.

For the optional estimate, adoption fractions are in [0,1], frequency is nonnegative with an
explicit time basis, and cohort definitions must match. A missing input disables that metric
only; it does not erase independent observed measurements. No adoption default or POI-derived
rate is supplied. Assumptions and calculation lineage are returned with the estimate.

Currency-valued market size, TAM/SAM/SOM, CAGR, cross-country conversion and inflation
adjustments are deferred from v1. They need separately approved definitions, units, price
indices and compatible series; they are not approximated from unrelated indicators.
Even if future sources contain sales amounts, monetary sizing needs a separately reviewed
contract; a population/POI-only request must never emit a SAR market size.

## 6. Approved contract basis and M1 concrete encoding

### Request (`jenan.market-demand.request/v1`)

Strict object: unknown fields are rejected. All ids are bounded opaque identifiers, all
numbers finite, all arrays bounded; actor authorization is injected by the trusted caller,
not accepted as a client-provided grant.

| Field | Proposed shape and validation |
| --- | --- |
| `contract` | Literal `jenan.market-demand.request/v1` |
| `analyses` | Nonempty subset of the five named analyses; normalized in stable engine order |
| `scope.geography` | `{countryCode, authority, level, code, version}`; one exact administrative/statistical area; no arbitrary geometry |
| `scope.sector` | `{taxonomy, version, code}`; one exact sector, no inferred taxonomy mapping |
| `scope.cohort` | `{definitionId, version}`; includes an explicit all-population universe when applicable, never omitted to mean everyone |
| `series` | Up to 20 `{id, metricDefinition:{id,version}, unit, aggregation, timeWindow, periods}` selections; periods are explicit typed intervals/snapshots with source-defined ids |
| `data.roles` | Role to bounded nonempty list of exact `{source:"DATA_CENTER", versionId, expectedChecksum?}` OR one `{source:"DATA_CENTER", typeKey, asOf?}` selector; modes cannot be mixed within a role |
| `parameters.comparisons` | Optional explicit `{seriesId, fromPeriodId, toPeriodId, measures}` pairs; measures are ABSOLUTE_CHANGE, PERCENT_CHANGE, INDEX; no inferred missing-period comparisons |
| `parameters.basePeriods` | Required per series requesting INDEX; exact selected `periodId`, no automatic base substitution |
| `parameters.estimates` | Explicit `{id, seriesId, cohortObservationRef, adoptionObservationRef, frequencyObservationRef, outputUnit, periodId}`; all refs identify governed inputs/rows; actual source resolution and estimate orchestration are later milestones |
| `options.requestId` | Optional correlation id, not a data/source selector |
| `options.evaluatedAt` | Permitted only by trusted replay/acceptance path; ordinary callers cannot set freshness arbitrarily |

Raw client observation arrays, rates or frequency values are not accepted as governed inputs.
Every role selected must be used by a requested analysis or definition validation; reject
unrelated inputs. Type selection uses captured evaluation time when `asOf` is omitted, then
pins the actual chosen version/hash. Exact selectors have no `asOf`; no historical access is
opened through this normal request.

Normalize defaults, sorted unique selections and periods, explicit comparison/base refs and
the captured `asOf` before hashing. Preserve dimension identifiers byte-for-byte; don't
silently case-fold taxonomy codes. No Project FK, budget, success target, recommendation flag,
personal records, raw URL connector, arbitrary SQL or caller-chosen server work limits.
`periods` name source-defined intervals/snapshots with their expected temporal semantics,
not caller-created observations. M2 checks those declarations against actual source content.
Snapshot selections carry a reference date rather than a fictitious interval.
INDEX selects its current period through the comparison's `toPeriodId` and its base through
`basePeriods`; a conflicting `fromPeriodId` is rejected, not silently ignored.

### Generic metric semantics and time-series model

The proposed **optional generic semantics block** describes quantity and time, not Market
business logic. Existing Spatial metrics omit it and retain exactly their current encoding.
Market-specific analytical categories stay in the Market result contract.

| Generic member | Meaning |
| --- | --- |
| `value`, `unit`, `dimension` | Value plus a versioned unit definition: e.g. transaction count, product quantity, persons, fraction, percent or base-100 index; product/person/event definitions are not interchangeable |
| `measureKind` | FLOW, STOCK, RATE, SHARE or INDEX; governs aggregation and comparison |
| `evidenceNature` | OBSERVATION, ESTIMATE or DERIVED; independent of publication/evidence verification state |
| `time` | Discriminated union: `{kind:"INTERVAL",id,startDate,endDate,frequency,calendar,timeZone}` or `{kind:"SNAPSHOT",id,date,calendar,timeZone}`; no invented interval for stocks |
| `timeWindow` | Requested bounds, distinct from the actual source period; never fabricated source coverage |
| `asOf` | Captured data-selection instant; not the observation period or source publication date |
| `dimensionRefs` | Versioned geography, sector, cohort and metric-definition refs, plus statistical universe/coverage |
| `comparison` | From/to period refs, optional `basePeriod`, operand refs and method; not a second independent value outside the metric |

Proposed additive value kinds: QUANTITY (nonnegative level), CHANGE (signed absolute or
percent change) and INDEX (nonnegative, explicit positive base). Percent levels stay bounded
to their definition (e.g. adoption fraction [0,1]); percent change may exceed 100 or be
negative. An index of 100 is the base observation, not "100% demand." No new kind changes
the legacy COUNT/DENSITY mapped-feature constraints or existing nonnegative kinds.
Add SOURCE_OBSERVATION and DERIVED_QUANTITY interpretations for these new kinds; keep
ESTIMATE for estimated values and retain the existing estimated-status invariant.
Do not route population context through legacy mapped-feature POPULATION semantics.

Unit definitions describe the measured entity and denominator and are versioned in the
dictionary. FLOW units might be transactions or product units during the observation period;
RATE units specify the denominator period and entity. A CHANGE in absolute units shares its
operands' dimension; percent change and INDEX are dimensionless but retain operand dimension
and unit refs in their calculation trace. Definition mismatch blocks the calculation.

**Time rules:**

- Dates use ISO `YYYY-MM-DD`; intervals are half-open `[startDate,endDate)` with explicit
  Gregorian calendar and IANA reporting time zone. Selection/evaluation/publication instants
  are separate UTC timestamps. Source declarations must support any normalization from
  inclusive dates; do not guess a conversion.
- v1 supports MONTHLY, QUARTERLY, ANNUAL and CUSTOM reporting periods; arbitrary custom
  comparisons require exact equal-length/equivalent-basis declarations. No fiscal/calendar
  or daily/monthly conversion is implicit.
- A series has stable definition, sector/geography/cohort/boundary versions, measure kind,
  unit, methodology, statistical universe and adjustment basis. Those attributes form its
  identity; changes split the series or block comparison.
- Monthly/quarterly/annual FLOWs can compare aligned completed calendar periods on the same
  reporting basis even if calendar month lengths differ; no per-day normalization or
  seasonality adjustment is implied. Partial-to-full period change is NOT_COMPUTABLE.
- STOCK levels belong to a declared snapshot date. Do not sum populations across time.
  FLOW rows may be summed only over explicitly disjoint additive partitions; RATE/SHARE/
  INDEX are not summed or averaged without declared numerator/denominator weights.
  Exactly one temporal variant is present; no ambiguous period-plus-snapshot payload.
- A current level is the explicitly selected latest eligible completed period/snapshot
  available at `asOf`, with the actual period returned. An older observation is never
  relabelled as today. The requested time window cannot expand source coverage.
- Missing months stay missing. Each trend pair and base period must exist and satisfy
  comparability; no interpolation, forward fill, inferred zero or annualization.
- Duplicate/revision resolution requires explicit precedence in the pinned version. Sort
  by series identity, period start/end and observation id; equal conflicting revisions
  fail the affected metric rather than using arrival order.
- Seasonality, forecasts and seasonal adjustment are deferred; retain frequency and
  adjustment metadata so later support does not require inventing historic periods.

### Result (`jenan.market-demand.result/v1`)

Strict result envelope: `contract`, `runId`, engine key/version/contracts/runtime/policies,
derived run `status`, normalized request/evaluation instant, `inputs`, `dataAvailability`,
analysis `results`, `gaps`, `rights`, `attribution`, `determinism`, `limits` and `timing`.
The concrete request member is `{normalized, evaluatedAt}`. Each result group is
`{analysis, seriesId, metrics}`; `limits` uses the existing cost/budget fields, and the
shared 2 MiB canonical JSON limit applies to the whole result.
Results group stable metrics by analysis/series/period or explicit comparison, never by
an undisclosed chosen candidate. Run statuses remain the existing shared COMPLETED,
COMPLETED_WITH_GAPS and FAILED; do not overload them with evidence categories.

Each Market metric contains the existing key/bilingual label/status/platformState/valueKind/
unit/value/inputRefs/confidence/limitations/method, plus required semantics and Market-only
`resultClass`, `signalRole` and `lineageNature` described below. The exact extension layout
must preserve backwards compatibility of existing shared schemas in M1.

Every numeric demand metric must state **what was measured, unit/dimension, period or
snapshot, geography, sector/cohort, source refs and evidence nature**. Context metrics
require the same applicable semantics. A unit/label alone never establishes demand.

### Metric taxonomy: evidence category is not availability

| Market `resultClass` | Meaning | Typical shared `status` |
| --- | --- | --- |
| OBSERVED | Direct measured demand observation, no assumption-based extrapolation | COMPUTED or PARTIAL |
| ESTIMATED | Assumption-based output or a derived output that depends on an estimate | ESTIMATED; incomplete scope additionally carries a gap |
| DERIVED | Deterministic transformation of compatible non-estimated demand observations | COMPUTED or PARTIAL |
| CONTEXTUAL | Population, households, businesses, POIs or other non-demand indicator; never counted as demand | COMPUTED/PARTIAL, or ESTIMATED when the context value itself is estimated |

`signalRole` is DEMAND or CONTEXT. `lineageNature` is OBSERVATION, ESTIMATE or DERIVED and
retains the contributing natures in the calculation trace; a contextual source estimate
is therefore CONTEXTUAL + CONTEXT + ESTIMATE + ESTIMATED, not an observed demand metric.
Any estimate in required demand operands makes a derived demand output ESTIMATED, never
pure OBSERVED/DERIVED. Context remains CONTEXTUAL even after arithmetic.

NO_COVERAGE, NOT_AVAILABLE and NOT_COMPUTABLE are **availability statuses**, not extra
numeric kinds. They carry `value=null`, `confidence=null`, platformState UNAVAILABLE and
the expected signal role/semantics, with `resultClass=null` and `lineageNature=null` because
no result was obtained. A gap explains the intended but missing observation/calculation.

The platformState VERIFIED, if ever used for COMPUTED, requires all contributing inputs
to be verified under shared rules; it is not inferred from the label OBSERVED. CONTEXTUAL
and DERIVED are classifications, not proof of evidence verification or data completeness.

Add a validated calculation trace identifying exact observation ids and transformations,
periods, numerator/denominator or assumption input references. Keep that trace inside the
canonical hashed result and store it in the run. A reference to an entire dataset alone is
not enough to explain which rows and assumptions produced a metric.

Observations may be COMPUTED or PARTIAL; assumption-derived outputs are ESTIMATED, never
upgraded to VERIFIED by a successful formula. No best-project recommendation, feasibility
score, success probability, project revenue forecast or financial conclusion is produced.

### Work caps (M1 admission / later runtime calibration)

- 500 total metrics, bounded before discovery/reads or expensive work.
- At most 32 input versions (below Data Center's 50-id exact-read request cap).
- At most 20 selected series and 120 requested periods.
- At most 40 explicit comparisons and 20 estimates; preflight includes every requested
  absolute/percent/index derivative, context and estimated metric in the 500 total.
- At most 2,000 rows per version and 10,000 parsed observations per run, with a refusal
  before calculations on any excess; also retain content and common run JSON byte limits.
- Preflight the output cross-product and server cost; enforce actual read/parse bounds too.
  Admission cost is a work heuristic, not a promised number of milliseconds.

M1 enforces request-side series/period/version/comparison/estimate and metric bounds, and
the whole-result metric/byte bounds. Actual read/parse row bounds belong to M2/M3; no M1
reader exists. These limits are not claimed to be performance-qualified. In particular,
32 versions do not authorize exceeding the shared 2 MiB persisted request/result bounds.

## 7. Missing-data and integrity behavior

| Situation | Behavior |
| --- | --- |
| No readable compatible source / concealed inaccessible version | NOT_AVAILABLE, null value/confidence and gap; no existence leak |
| Known geographic coverage excludes requested area | NO_COVERAGE; stop affected work before calculation |
| Geography/cohort/time coverage not established | NOT_COMPUTABLE with an explicit unknown-scope gap; no zero |
| Period/sector/cohort missing or suppressed | Null NOT_AVAILABLE/NOT_COMPUTABLE with precise non-sensitive gap |
| Sample/incomplete observations | PARTIAL for usable observations; LOW confidence cap; no market-wide total |
| Missing estimate assumption, invalid denominator or incompatible dimensions | NOT_COMPUTABLE for that derivative; retain independently usable results |
| Expired input | No supported valued metrics; use shared expiry and availability rules |
| Invalid content or conflicting duplicates | Explicit validation/integrity failure or affected metric gap; no silent row dropping |
| Exact version/hash drift | Explicit error; no latest-version substitution |
| Historical content lost or current access revoked | Replay fails explicitly with concealed unavailable response; no fallback |

Period comparability and stale/fresh states are separate: a historic reporting period can
be a valid historical observation, but does not become a current-period demand measurement.
Pin the evaluation instant and explain the applicable freshness policy.

## 8. market-confidence-v1, provenance, rights and persistence

**Approved M1 policy:** id `market-confidence-v1`, version `1.0.0`,
EXPLAINABLE_HEURISTIC, POINTS_100, `isProbability=false`. HIGH >=80, MEDIUM >=60,
LOW >=35, otherwise INSUFFICIENT. Points are quality heuristics, not confidence intervals
or probabilities of market/project success. No Spatial weights/policy are imported.

| Factor | Max | Full / limited / unavailable points and basis |
| --- | ---: | --- |
| sourceQuality | 20 | 20 for recorded MEASURED quality >=0.8 with method/date; 10 for lower recorded MEASURED quality; 0 if unavailable/insufficient |
| geographicCoverage | 15 | 15 exact area/boundary coverage; 8 declared partial usable coverage; 0 unknown |
| temporalCoverage | 15 | 15 all required complete periods/snapshots; 8 declared partial coverage usable for the particular level; 0 unknown |
| freshness | 10 | 10 fresh under explicit policy; 5 stale usable only with limitation; 0 unknown; expired inputs cannot support a valued metric |
| completeness | 15 | 15 declared complete for the exact statistical universe; 8 declared sample/subset; 0 unknown |
| measurementMethod | 15 | 15 named/versioned applicable and compatible method; 8 documented but limited method; 0 absent/unsupported |
| evidenceNature | 5 | 5 traceable non-estimated observations/derivations; 3 reviewed explicit estimates; 0 unverified nature |
| rightsProvenance | 5 | 5 complete exact source/version/hash/row lineage and declared rights; 3 complete lineage but undeclared license class; 0 inadequate metadata |

Weights total 100. Scope/comparability/integrity checks happen first: points cannot rescue
an invalid comparison, invalid denominator, missing required assumptions or unauthorized input.
For each metric, evaluate every required input/operand for the same eight factors and use
the minimum points per factor, recording the determining input id and explanation. For a
derived metric, additionally cap its final band at the weakest operand band; the original
score remains the sum of factors, not an untraceable adjusted value.

Proposed caps: SAMPLE or UNKNOWN completeness, incomplete descriptor coverage, undeclared license
class or unverified evidence => at most LOW; estimated required inputs/outputs, stale input,
unknown freshness or unmeasured source quality => at most MEDIUM. Apply all relevant caps
and the weakest-operand cap.
Sample weights do not remove the sample cap in v1 or create representative national demand.
These coverage caps apply only after content establishes the actual statistical scope.
An unknown requested geography/cohort/time basis still fails the scope gate rather than
yielding a low-confidence market total.
If the weakest operand is INSUFFICIENT, return NOT_COMPUTABLE with null value/confidence,
rather than forcing it into a supported HIGH/MEDIUM/LOW cap. A candidate level with an
INSUFFICIENT own score is likewise unavailable under this Market proposal.

Hard caps take precedence: unknown/sample representativeness cannot become HIGH because
arithmetic succeeded; an estimate cannot outrank its weakest required input; lack of data
never increases confidence. Unavailable metrics have null confidence.
Known denied retrieval, missing exact provenance or checksum mismatch blocks use before
scoring. Missing/RESTRICTED export rights deny export but do not create analysis permission
or automatically destroy an otherwise authorized observation. Rights are a gate plus a
provenance factor, not a way to purchase higher confidence.

Persist exact normalized request; request/input/output hashes; policy/method versions;
observation/calculation lineage; Data Center exact version/source/type/checksum; source and
publication/effective metadata; license/usage/attribution/quality snapshot; actor; gaps; and
run-linked usage intents. Use the existing append-only run/input tables without new Project,
Map or Data Center foreign keys and without writes to frozen Data Center usage tables.

The shared storage contracts/tables already exist; the current executable persistence/replay
adapters still live in Spatial, and the historical reader requires GeoJSON. M0 must not
claim otherwise. Propose an engine-neutral service over the existing run/input tables and
current Data Center read/access/checksum contracts, with an injected engine content validator.
Market consumes that shared service; Spatial's existing adapters remain byte-for-byte frozen.
No Market dataset persistence, shadow input-content store, duplicate tables or second migration.

Design the generic non-GeoJSON historical-read authorization/integrity seam in M1 and
implement it in M4. It is internal exact-version replay only, never historical discovery.
Any implementation that cannot avoid editing frozen Spatial or Data Center must stop and
explain the blocker before doing so. Do not extract/rewire Spatial without new permission.

Run ownership checks and current source access apply at replay. Authorization, exact version
and checksum validation precede parsing/analysis. Recompute the three hashes with the saved
request/evaluation instant; return a successful replay only on exact agreement.

## 9. v1 scope versus deferred work

**v1:** deterministic context, observed quantities, comparable historic changes, audience
context and explicit assumption-based demand; bounded versioned structured datasets;
honest gaps; provenance/rights/confidence; append-only persistence and authorized exact replay.

**Deferred:** AI demand prediction, external live APIs/scraping, geocoding/routing, large
artifact execution, arbitrary polygon population allocation, competitor inventory, opportunity
ranking, pricing recommendations, TAM/SAM/SOM, monetary sizing/currency conversion, project
financials, real-time streams, causal claims, recommendations and success scores.

No Projects/marketplace UI, reports UI or production routes are added by the engine milestones.
Future consumers integrate through its contracts, not duplicate calculations.

## 10. Approved split: M0 plus five implementation/acceptance stages

**M1–M5 approved; M1/M2 accepted and M3 explicitly authorized; M4 not started.** Five stages preserve separate gates for
contracts, governed data, deterministic
analysis, exact history and technical acceptance. Four would combine history with final
acceptance or data access with arithmetic and hide a meaningful risk boundary.

| Stage | Bounded deliverable / review gate |
| --- | --- |
| M0 | APPROVED: direction, detailed contracts, policy basis and five-stage split |
| M1 — Contracts & boundaries | Strict input/output/observation/time schemas, additive shared primitives with unchanged legacy encodings, market-confidence-v1, gaps, normalization/hashes, caps and boundary tests; design shared persistence/history seam; Spatial/shared regression gate |
| M2 — Governed inputs | Read-only Data Center adapter, authorized inventory, exact/by-type pinning, typed content/dictionaries, rights/coverage/period/revision validation; actual PostgreSQL/RBAC tests and real-data manifest or explicit source gaps |
| M3 — Deterministic analysis | All five analyses: context/audience, measured quantity, signed change/percent/base index, explicit assumption estimates; hand-computed golden tests, time/units/cohorts/sample/zero/lineage cases; no estimation shortcut or monetary result |
| M4 — Persistence & replay | Engine-neutral internal service over existing run/input tables, append-only usage/provenance, exact authorized non-GeoJSON historical read/replay; fresh PostgreSQL migrations and mismatch/access/revision tests; no Spatial/DC rewiring |
| M5 — Technical acceptance | Full functional/integration/regression gates, actual-data reconciliation and declared gaps, cold/warm/repeated/concurrent bounds, access/boundary review, CodeQL, typecheck/lint/build, recorded Technical SHA and desktop/remote equality |

Combining the smaller audience/assumption module with M3 reuses the same typed quantities,
scope matching, confidence and trace calculations; it removes a handoff, not a feature or
test. Approval of M1 does not automatically approve completing all later stages unattended.

After every stage, report delivered contracts/capabilities, targeted tests, baseline diff,
data gaps and git/archive status, then stop for the next explicit owner instruction. Final
Sonar and final tags remain deferred under the seven-engine policy; an M5 technical pass is
not a claim that Sonar passed or final closure was granted.
Missing observed-demand data blocks numerical real-data acceptance; it is not waived by
finishing fixture tests or by reducing the number of milestones.

## 11. Required tests and technical gates

- Contract normalization/defaults/order/time and deterministic request hashes; invalid
  taxonomy, units, periods, input dimensions and unexpected properties.
- Exact pins, deterministic multi-version selection, source/actor/organization/robot policy,
  no existence oracle, revoked rights, conflicts and no current/historical fallback.
- Published content checksum plus market schema validation; all caps before expensive work;
  oversized content/rows/results and excessive series/period cross-products.
- Golden hand-calculated quantities, disjoint/overlapping partitions, revised duplicates,
  missing vs measured zero, samples vs inventories, suppressed observations.
- Positive/negative/zero change, zero denominator, discontinuous/unequal periods, changed
  methods/boundaries, no hidden interpolation and no automatic conversion.
- Percent formula distinguishes 0.1 fraction from 10 percent; explicit positive-base
  indices, missing/zero base, partial/full period mismatch, snapshot-vs-flow rejection.
- OBSERVED/ESTIMATED/DERIVED/CONTEXTUAL independent of availability, source verification
  and lineage nature; population/business/POI counts cannot satisfy demand requirements.
- All eight confidence factor points, 100-point sum, threshold boundaries, weakest-input
  rules, interacting caps, insufficient-score null values and rights gates.
- Explicit estimate factors including valid zero, invalid rates/frequencies, missing inputs,
  cohort incompatibility, ESTIMATED status and weakest-input confidence.
- Provenance down to rows/assumptions; rights/export/attribution closure; trace/hash sensitivity.
- Fresh disposable PostgreSQL migrations, atomic append-only persistence, exact version/hash/
  usage rows, authorized historical replay, missing history/content and mismatch failures.
- Reproducibility for identical requests and versions, stable tie-breaks and caller isolation.
- No external network/AI, no Map writes, no Data Center writes, no Projects FK/imports, no
  engine-to-engine imports, no silent weakening of the existing Spatial regression tests.
- Negative contract/boundary cases for recommendation, success probability, revenue
  prediction and monetary sizing from contextual counts; neither forbidden fields nor
  unsupported analysis flags are accepted or emitted.
- Regression: complete Spatial/shared suite and relevant Data Center/PostgreSQL suites;
  PostGIS regression when a shared change could affect Spatial geometry/envelope behavior.
- TypeScript, lint, production build and diff checks at implementation technical acceptance;
  bounded repeated/concurrent timing gates calibrated on approved actual datasets.
- Security/access testing, review and CodeQL. Sonar is deferred, not reported as PASS.

## 12. Proposed Real-Data Acceptance

### Evidence ledger at this M0 revision

| Capability / evidence | Current verified fact | What may be tested after implementation | Remaining gap |
| --- | --- | --- | --- |
| Real Saudi spatial sample | Prior Spatial M7 acceptance exists | Existing Spatial regression only; not Market demand acceptance | No Market ingestion or inferred demand from that sample |
| Published market source inventory | Not performed under an authorized Market consuming actor | Actor-scoped metadata/read/access/checksum tests in M2 | Types, rights and actual market coverage UNVERIFIED |
| Observed demand quantity | No approved exact version/rows established here | Reconcile observed quantity to independently calculated source rows | Real sales/service-use/product-volume source needed |
| Time change/index | No two comparable actual demand periods established | Reconcile signed change, percent and base-100 index on exact periods | Comparable definitions/periods and valid base needed |
| Audience context | No suitable population source established by prior Spatial acceptance; not proof of organization-wide absence | Reconcile governed statistical cohort/snapshot to source | Authorized suitable population/cohort version needed |
| Assumption-based demand | No approved compatible adoption/frequency/cohort set | Recompute explicit estimate and test its lineage/confidence | Method, sources and applicability approval needed |
| Market persistence/replay | Generic tables exist; Market service not implemented | Real disposable PostgreSQL persistence/access/history tests in M4 | Not yet a Market replay PASS; fixture replay remains separate |

There is currently **no verified actual-data numerical Market acceptance**. Existing
Spatial/PostgreSQL evidence is reusable infrastructure evidence, not measured market demand.
Hand-calculated fixtures will prove algorithm behavior but are never called production data.
Only actual accessible versions may establish real no-coverage/unavailable behavior; an
empty fixture or failed login cannot prove there is no organization-wide source.

### Acceptance protocol once sources and execution are approved

1. Inventory only actor-readable published source metadata first. Record date, exact version/
   checksum, rights, source reporting periods and statistical coverage. Do not publish hidden
   source existence or treat synthetic/test records as production.
2. Select one approved Saudi sector, one exact Riyadh statistical geography and one
   consistent observed demand series. The specific sector/period/source is chosen from real
   available evidence, not assumed from the Map sample.
3. Verify observed quantity against the original governed rows using an independent
   calculation. Repeat with identical pinned request/versions and compare hashes.
4. Use at least two comparable real periods for signed absolute/relative change. With fewer
   periods, report trend NOT_AVAILABLE; do not invent history.
5. Test absent/out-of-scope geography/period, sample/unknown coverage and a source-suppressed
   value. Use a real confirmed zero only if a source actually supplies one.
6. Estimate demand only if real compatible cohort, adoption and frequency inputs exist and
   their use/assumptions are approved. Otherwise record that acceptance as unavailable.
7. Test real authorized persistence/replay on copies/disposable test records, not by editing
   production versions; keep geometry fixtures, statistical fixtures and actual data distinct.
8. Measure cold/warm/repeated and bounded concurrent runs without raising caps to pass.

If no suitable actual demand source is available, the unavailable-state acceptance can pass,
but numerical real-data acceptance remains **BLOCKED / NOT VERIFIED**. Do not call fixture
accuracy or a census population lookup proof of real consumer demand.

## 13. Remaining review items and blockers

1. **M1 review:** M0 and M1 execution are approved. Review the M1 checkpoint before any M2
   implementation; the engine is not claimed complete at this foundation stage.
2. **Compatibility:** M1 implements additive engine-neutral quantities/time/semantics.
   Legacy Spatial payloads omit these fields and keep their meaning/encoding. Frozen Spatial
   source remains unchanged; any necessary future fix still requires a stop and owner notice.
3. **Persistence/replay seam:** review the proposed engine-neutral service without dataset
   duplication or Spatial/DC edits. Exact non-GeoJSON historical authorization remains a
   capability to implement and verify, not an existing generic implementation.
4. **Governed data:** authorize an actor-scoped inventory and supply/approve statistical
   sources, taxonomy, observation schemas, area/cohort definitions and estimate assumptions.
   M0 has not established production availability or source licensing.
5. **Large datasets:** no approved executable immutable market artifact reader exists in this
   proposal. Keep bounded inline v1 or request a separate approved contract; no DC schema change.
6. **Sonar:** DEFERRED / PENDING by owner decision, not an M1 blocker and not final closure.

**Stop after M1. Do not start M2 until the owner reviews the checkpoint and authorizes it.**

## 14. M1 implementation checkpoint

### Delivered surface and deliberate limits

- Pure `services/analysis-engines/market-demand/` modules: model/taxonomy and evidence
  validation, strict request/normalized-request/result/metric contracts, normalization,
  confidence, bilingual gaps and arithmetic helpers. Version `1.0.0-m1`.
- No `runMarketAnalysis` pipeline, Data Center adapter, source inventory, source registration,
  persistence implementation or report/UI endpoint. Those are not hidden M1 deliverables.
- LEVEL, ABSOLUTE_CHANGE, PERCENT_CHANGE and INDEX helpers operate only on injected typed
  evidence. Trend traces preserve exact from/to rows, units, periods and method version.
  No aggregation, assumption-product orchestration, forecast or seasonality runner in M1;
  full five-analysis execution remains M3.
- Source estimates must carry explicit source refs, assumptions, method and limitations.
  Derived arithmetic remains ESTIMATED if any operand is an estimate; context stays
  CONTEXTUAL. Current confidence handling fails closed if required supporting input
  evidence is unresolved; M2/M3 must resolve it, not guess or bypass it.

### Final concrete temporal/unit encoding

Shared `quantities.ts` supplies strict temporal unions, ordered half-open windows,
Gregorian complete MONTHLY/QUARTERLY/ANNUAL intervals and explicit CUSTOM intervals,
IANA time zones, source/assumption refs, quantity dimensions and unit definitions.
Unit shape: `{id, version, dimension, entity, per}`; dimensions are EVENTS, ITEMS, PEOPLE,
HOUSEHOLDS, ENTITIES, FREQUENCY, FRACTION, PERCENT and INDEX. A FREQUENCY alone requires
an explicit entity/frequency denominator. There is no currency unit in this Market v1.

Discrete counts require safe integers; levels are finite/nonnegative; changes may be signed;
fraction/share bounds differ from percent-change bounds. The metric's generic `unit` tag
is `quantity`, `percent` or `index_points`, with the actual versioned unit in `semantics`.
Comparison semantics retain the operand unit and exact temporal refs. Results round once
to six decimals; unrounded operands and a versioned method stay in the hashed trace.

### Integrity, compatibility and trust boundary

The new optional `semantics` block and QUANTITY/CHANGE/INDEX value kinds extend Shared Core;
SOURCE_OBSERVATION/DERIVED_QUANTITY interpretations describe these kinds only. Existing
COUNT/DENSITY retain MAPPED_FEATURES_ONLY; legacy numeric kinds still reject negatives.
No default is inserted into an old result or its hashes when the new optional block is absent.

The full Market result schema rechecks the shared envelope, exact request normalization,
input pins/roles, series/scope/period selection, deterministic arithmetic, classification,
confidence policy/breakdown, rights/attribution and all three hashes. Rehashing a falsified
numeric result does not make it valid. Missing metrics/values require explicit gaps.

Injected inputs are trusted server-side evidence snapshots, not self-authorizing client
records. M1 schemas cannot prove that an input was really retrieved or that a source exists;
M2 must verify actor access, exact content/checksum, role/type/content semantics and period
coverage before supplying these snapshots. M1 adds no endpoint that accepts arbitrary
observations as production Data Center data.

Static tests enforce Market -> own modules/Shared Core only; Shared Core -> no engines;
no Spatial, Projects, Map service, Data Center reader/writer, database, network, AI SDK,
dynamic import/require, hidden clock/environment, randomness or logging. Existing Spatial
adapter allowlists are not widened for M1.

**REAL-DATA DEMAND ACCEPTANCE = BLOCKED / NOT VERIFIED.**
Every new observation fixture is synthetic unit-test evidence, not real demand data.

### M1 verification results (2026-10-21)

| Gate | Result |
| --- | --- |
| Market M1 unit/contract/boundary fixtures | 145 PASS across four test files |
| Complete existing Shared Core/Spatial unit regression | 1,108 PASS; combined 1,253/1,253 across 37 files |
| Real migrated PostgreSQL Data Center/provider regression | 138/138 PASS across eight files; all 78 migrations on a fresh disposable database |
| Complete Spatial PostGIS regression | 130/130 PASS across three files, including the real Saudi Map-copy suite |
| Combined database regression | 268/268 PASS, zero failed/skipped; child and wrapper exit codes 0; own scratch database removed |
| TypeScript | PASS |
| Scoped ESLint | PASS, zero warnings (`--max-warnings=0`) |
| Production build | PASS with existing `next-build.mjs --webpack`, one build worker, 161 static-page generation tasks |
| Whitespace/scope checks | PASS; frozen paths unchanged; build-generated `next-env.d.ts` change removed from this clean worktree |

The default Turbopack attempt failed on this isolated worktree's existing `node_modules`
junction leaving its filesystem root. The supported Webpack build then passed, including
Next's TypeScript check. No dependency, build script or configuration was changed to
work around it. The existing pg concurrent-query deprecation remains a disclosed test
warning, not a failed test or a relaxed threshold. No Sonar analysis was attempted.

The owner accepted and **CLOSED M1** at
`d95da8030fbdcd6e68199cc4ca60bb6f528ece01`. The figures above describe that immutable
checkpoint, not the subsequent M2 test totals. M2 was separately authorized; see below.
Map changed: **NO**. Data Center frozen baseline changed: **NO**. Spatial source changed:
**NO**. Main merge: **NO**. Final tags: **NOT CREATED**.

## 15. JENAN MARKET & DEMAND ENGINE — M2 CHECKPOINT REPORT

### Delivered read-only integration

M2 prepares governed inputs, not analytical results. The server entry point
`prepareMarketDataCenterInputs(request, trustedActor, trustedContext)` normalizes the M1
request, constructs the isolated provider and calls pure `prepareMarketData`.
There is no analytical runner, aggregation, assumption-product calculation, endpoint,
UI, dataset store, new run/input persistence or historical replay implementation.
The M1 arithmetic/result identity remains `1.0.0-m1`; M2 does not emit a result envelope
or silently reinterpret an old result version.

The single adapter calls only the existing Data Center discovery and exact-content read
services. They apply current source scope, organization membership/permission, robot grants,
publication, conflict, expiry, specialty and mission-context policy. Optional organization
context also narrows a direct exact read. An asOf selection does not authorize historical
access or reveal a currently hidden/superseded version. Missing and inaccessible versions
have the same external unavailable response; authorization/infrastructure errors are not
disguised as empty successful discovery.

The complete pure Data Center metadata DTO is reused rather than copied. Its existing file
and contract name contain `map-reference`; this is a Data Center value/schema, **not Map
access**. Market does not import the Map resolver, any Map service or Spatial. Neither
Spatial's provider nor Data Center's frozen code was extracted or changed.

### Explicit inventory contracts

These remain engine contract names, not production Data Center registrations:

| Role | Exact proposed typeKey | Strict JSON content contract | Declaration |
| --- | --- | --- | --- |
| demand.observations | market-demand-observations | jenan.market.observations/v1 | ACTUAL_DEMAND_MEASUREMENTS |
| context.indicators | market-context-indicators | jenan.market.context/v1 | CONTEXT_ONLY |
| demand.assumptions | market-demand-assumptions | jenan.market.assumptions/v1 | EXPLICIT_ASSUMPTIONS |
| dimensions.dictionary | market-dimensions | jenan.market.dimensions/v1 | DIMENSION_DEFINITIONS |

Every dataset declares versioned geography/sector/cohort, periods and INVENTORY/SAMPLE/UNKNOWN
completeness. Unknown coverage is explicit `null`, never worldwide/complete coverage.
Observation/context rows carry a unique id, subject, full M1 quantity/unit/dimension/time
semantics, evidence nature, nullable availability/value, coverage/method, lineage,
assumptions and limitations. Population/business/competitor/POI subjects cannot enter the
demand-observation contract. All context remains CONTEXTUAL, even if measured accurately.
Estimated/derived Data Center sources cannot be relabelled as actual observations.

Assumption rows explicitly distinguish ADOPTION_FRACTION in [0,1] and
CONSUMPTION_FREQUENCY with its entity/frequency denominator, applicability dimensions/time,
method and evidence/assumption/limitation basis. Dictionary entries bind versioned metric
definitions to subject, unit, measure kind and methodology. No currency/monetary-sizing
contract was added.

Rows name self evidence as `{observationId}`; an external reference additionally names
`versionId`. The authorized reader supplies the actual `dc:<versionId>` identity,
source, version number and verified checksum; the JSON never supplies a self-referential
checksum. Self refs must resolve. External refs must resolve to explicitly selected inputs
and to Data Center-declared upstream lineage. Missing, unavailable, cyclic and transitively
invalid evidence is blocked without implicit reads. Repeated ids/conflicting definitions,
invalid values/units/time, duplicate refs and header/row coverage contradictions are rejected,
not silently repaired or truncated.

### Selection, availability and provenance

- Exact pins are discovered and read literally. A supplied expected checksum must agree
  with discovery, and the existing exact reader recomputes the stored Data Center checksum
  over its authoritative content/metadata representation. No alternate dataset is tried.
- By-type selection delegates to `dc-version-selection-v1`, with a captured normalized asOf.
  The selected version is validated once; a malformed, wrong-scope or incompatible preferred
  dataset does not cause a search for a more convenient candidate.
- Missing relevant roles discover only their exact proposed typeKeys; dimensions.dictionary
  is required for requested measurement-definition validation. No title/fuzzy-name matching.
- Preserve discovery mode/policy/asOf, authorized candidates, selected id, exclusions and
  truncation. The existing preferred-of-all policy still selects correctly if its displayed
  candidate list is truncated; TOO_MANY_CANDIDATES fails explicitly.
- Prepared sources include their complete metadata reference, EngineInput, validated dataset,
  bound observation/assumption rows, per-series/period matches and bilingual gaps.
  Independently valid levels remain available if a comparison is incompatible.
  `comparisonAvailability` checks definitions, unit, geography/sector/cohort, methodology,
  measurement coverage and comparable periods across selected sources; it calculates no change.
  `operandAvailability` resolves explicit estimate refs and their declared roles/kinds/coverage;
  formula eligibility, cross-operand estimation and its confidence are still M3.
- Outside declared geography/sector/cohort/time: NO_COVERAGE, never zero. Unknown coverage,
  mismatched boundary/classification versions or overlapping but incompatible period definitions:
  NOT_COMPUTABLE. Covered but absent/suppressed requested measurement: NOT_AVAILABLE.
  Multirow aggregation is not performed in M2 and is not silently treated as an identity value.
- Snapshot the source, ownership/owner, license/class, usage policy, attribution/requirement,
  exact version/checksum, publication/effective dates, geographic metadata, quality methodology
  and freshness. Do not borrow Data Center's heuristic score as Market confidence.
  Shared rights/attribution derivation and input hashing are reused unchanged; exports can
  never be more permissive than any contributing input. Future/expired or contradictory
  evidence is blocked; independent valid sources are retained with explicit gaps.
- Bounds: 32 version selections including automatically required roles, 200,000 content
  characters/version, 2,000 rows/definitions per version, 10,000 total rows/definitions.
  Existing Data Center discovery caps remain unchanged. No quota increase or artifact-store
  workaround was introduced.

### Actual data inventory and blockers — not fixture acceptance

At **2026-10-21T10:49:40.511Z**, the repository's actually configured **local** database
was contacted in a PostgreSQL **READ ONLY** transaction. `to_regclass` returned NULL for
`public."DataCenterType"`, `public."DataCenterSource"` and `public."DataCenterVersion"`.
The schema-only preflight took 23 ms; this is not a dataset-performance measurement.
The configured database cannot supply a governed Data Center inventory in this state.
No migration, reset, account creation, fabricated actor, type registration or data write was
performed against it to make the inventory pass.

**Current-source discovery = BLOCKED_CONFIGURED_DATABASE_HAS_NO_DATA_CENTER_SCHEMA.**
Registered type/source/version counts and usable real contextual sources are **NOT VERIFIED**,
not zero. The production Data Center was not inventoried by this local connection; the finding
does not establish organization-wide absence of market data.

**REAL DEMAND DATA = NOT AVAILABLE FOR VERIFICATION.**
**REAL-DATA DEMAND ACCEPTANCE = BLOCKED / NOT VERIFIED.**
An authorized connection to the populated Data Center is needed to settle the actual inventory,
then suitable demand observations and comparable time-series evidence are needed for acceptance.
No population/Spatial/POI dataset was converted or invented to fill this gap.

Integration fixtures are explicitly synthetic even though the PostgreSQL services, checksums,
lifecycle and policy enforcement under test are real. Proposed types are registered **only
inside rolled-back fixture transactions in an independently migrated disposable database**,
never as a production schema/registry change.

### Validation and save state

| Gate | M2 checkpoint |
| --- | --- |
| Market complete unit/contract/boundary tests | 216 PASS across five files, including 65 new dataset/source-preparation cases |
| Existing Shared/Spatial unit regression | 1,108 PASS; combined 1,324/1,324 across 38 files, zero failed/skipped |
| Market real PostgreSQL integration, synthetic governed fixtures | 25/25 PASS |
| Existing Data Center/PostgreSQL/provider regression | 138/138 PASS across eight files |
| Full Spatial/PostGIS regression | 130/130 PASS across three files, including 44 real Saudi Map-copy cases |
| Final database suite outcomes | 293 PASS across 12 suites, zero failed/skipped; reconciled from each suite's latest completed run |
| Disposable database safety | All 78 existing migrations applied only to own fresh scratch databases; scratch databases removed |
| TypeScript | PASS, including the final production build's TypeScript check |
| Scoped ESLint | PASS, zero warnings (`--max-warnings=0`) |
| Production build | PASS, existing `next-build.mjs --webpack`, one worker, 161 static-page generation tasks |
| Whitespace and frozen-source checks | PASS; no Shared/Spatial/Map/Data Center/schema/workflow/dependency change |

The first combined database run exposed a nested test-registration mistake in the new
Market suite and four existing real Saudi PostGIS statement timeouts during concurrent
validation. The test declaration was corrected. The complete Market and real Saudi suites
then passed 69/69 without competing builds, with **no Spatial change, timeout increase,
retry flag, skip or threshold relaxation**. After a final source-reference alias validation
refinement, all 25 Market PostgreSQL tests passed again. The other ten suites had already
passed; the total above reports latest per-suite outcomes, not a fictitious single green run.
The pre-existing pg concurrent-query deprecation remains a disclosed warning.
The existing isolated-worktree dependency junction still requires the supported Webpack
path documented at M1. No build configuration or dependency was changed. The two
build-generated `next-env.d.ts` import changes were removed from this clean worktree;
unrelated edits in the original workspace and desktop root were preserved.

Measured final exact-input preparation on the migrated local PostgreSQL fixture:
**785.48 ms** for two discovery calls, two checksum-verified reads and three rows/definitions
(two demand periods and one dictionary definition). This is one fixture measurement,
not a production-data benchmark, percentile, load SLA or real-demand acceptance.

No Shared Core additions were necessary: M1 quantities, normalization, gaps, rights,
confidence foundations and hashes were reused. Existing M1 and Spatial contracts remain
unchanged, including legacy result/hash behavior. Market's AST boundary now permits exactly
one read-only provider; pure modules cannot import it. The global adapter allowlist preserves
Spatial's existing entries and adds only Market discovery/content access.

Changed surfaces: Market `data-port.ts`, `datasets.ts`, `data-sources.ts`,
`adapters/data-center-provider.ts`, `gaps.ts` and pure `index.ts`; the new Market data-source
unit suite and synthetic fixture helper; the Market/global boundary suites; the new
PostgreSQL Market integration suite; this document and the shared architecture status.

**Map changed: NO. Data Center frozen baseline changed: NO. Spatial changed: NO.**
**Shared Core changed: NO. M3 started: NO. Main merge: NO. Final tags: NOT CREATED.**
**Sonar: DEFERRED / PENDING, no attempt made.**
M2 stops at this technical checkpoint for owner review; it is not full Market Engine closure
and does not certify unavailable real demand data.

## 16. JENAN MARKET & DEMAND ENGINE — M3 CHECKPOINT REPORT

### Accepted prerequisite and bounded scope

- M2 implementation: `e905daa0675f4cccf808978280cfe34eb133bc20`, accepted **CLOSED** by
  the owner. The separate documentation-only closure is
  `e492835618366f0d788a9fc5e2c02d1160a28bbd`; it records the accepted SHA, synthetic
  PostgreSQL fixtures and production inventory **NOT VERIFIED** before M3 implementation.
- M3 implements deterministic calculations and their governed execution/validation seam
  only. It creates no persistence adapter, run/input/usage record, replay service, API,
  UI, registry entry, migration or datastore. M4 is not authorized or started.
- Shared Core, Spatial, Map, Data Center, schemas, application routes, dependencies,
  workflows and protected branch tips remain unchanged.

### Contracts and execution

Request and result identifiers remain `jenan.market-demand.request/v1` and
`jenan.market-demand.result/v1`. New execution results identify
`engine.version = 1.0.0-m3`. The public `marketResultSchema` accepts both this shape
and the unchanged `1.0.0-m1` envelope. M1's schema/type and arithmetic API remain
available; old parsed values, classifications, confidence and deterministic hashes
continue to pass their original regression suite.

`runMarketAnalysis(request, injectedReadOnlyPort, trustedContext)` normalizes the request,
performs M2 discovery/exact read/checksum/content/coverage/rights validation, computes
only eligible measurements and validates the complete result before returning it.
The existing single privileged provider exposes `runMarketDataCenterAnalysis`; it supplies
the authorized actor and existing Data Center read services. It gains no write capability.
Run id, evaluation instant, environment and timing come from the trusted caller; neither
the engine nor provider reads a hidden clock, environment, random source or network.

In addition to the existing envelope, M3 returns:

- `outcomes`: exactly one identified slot for each requested analysis/series/period,
  comparison operation or explicit estimate. Each slot names its periods, operation,
  nullable metric key, availability/computation state, `value` and result class.
  Missing/incompatible/unsupported evidence returns `value: null`, not zero, and a
  specific blocking gap. A failed slot does not erase independent valid measurements.
- `sourceEvidence`: the exact governed selection decision, version/checksum, complete
  metadata/ownership/license/usage/attribution/publication/effective dates/quality,
  typed dataset and bound rows used during this run. These are bounded, in-memory
  validation evidence, **not new persistence or historical replay**.
- `work`: discovery calls, exact reads and parsed rows/definitions. The deterministic
  cost also includes requested outcome slots; the fixed budget is 20,000 cost units.

Shared `dataAvailability` describes whether a dataset was found, not whether a particular
measurement can be calculated. A present dataset can be AVAILABLE there while a requested
slot correctly says NOT_AVAILABLE or NOT_COMPUTABLE. The exact per-source validation
state and per-slot null value are retained; no failed dataset or pin is silently replaced.
Every caller-specified pin, including unavailable ones, must retain its own explicit decision.
Implicit type/asOf discovery remains recorded as such; it is not rewritten as a caller pin.

### Deterministic calculation methods

| Capability | M3 behavior |
| --- | --- |
| Market/audience context | Population, households, businesses, competitors, POIs and contextual indicators retain CONTEXTUAL; audience analysis only accepts population/households |
| Observed demand | Only actual measurements from validated `jenan.market.observations/v1`, demand subject and OBSERVATION evidence; contextual, derived or estimated evidence cannot become an observed measurement |
| Identity level | Report the source quantity with its exact scope, time, unit, method and evidence lineage; existing six-decimal numerical normalization remains explicit |
| Disjoint subtotal | Add only additive FLOW/STOCK quantities with compatible definitions, scope, unit, period and method; every component in a multirow subtotal must declare a unique partition key in one versioned disjoint scheme |
| Absolute change | `current - base`, signed; a measured zero base is permitted |
| Percentage change | `100 * (current - base) / base`; base must be positive |
| Base index | `100 * current / base`; explicit matching requested base period, positive base |
| Historical comparability | Definition, unit, geography, sector/cohort/universe, adjustment, methodology, measurement method/coverage and time basis must agree; ordered nonoverlapping equal-frequency periods, with equal CUSTOM durations |
| Aggregated historical change | Preserve original component rows in both periods, require matching disjoint schemes and partition keys, and compare their exact subtotals without interpolation |
| Explicit estimate | Only the selected `cohort * adoptionFraction * consumptionFrequency` method, never a generic formula evaluator or a guessed default |

The optional additive Market dataset member
`partition: {scheme:{id,version}, key, disjoint:true}` is a source-backed declaration, not
an inference from unique row ids. It extends only Market contracts; existing datasets
without it still parse and retain identity behavior. Missing/duplicate/incompatible proof
returns NOT_COMPUTABLE. Rates, shares and indices are not blindly summed; they need
a separately approved weighting contract.

Observed components can produce a **DERIVED subtotal/change**, never a fabricated
new observation or an estimate. Contextual subtotals remain CONTEXTUAL. Any required
estimated lineage is explicitly reflected/capped and cannot be admitted as observed demand.

The explicit estimate uses genuine, separately typed assumption rows; it does not fabricate
observations, change roles or relabel unit dimensions to satisfy validation. It requires:

- Population/household cohort snapshot at the reporting period start, matching calendar
  and time zone; no silent carry-forward of an older snapshot.
- Compatible geographic, sector, cohort, universe and adjustment scope for all operands.
- Adoption fraction in [0,1] with the cohort entity, plus a nonnegative consumption
  frequency whose entity, denominator/cohort and reporting frequency match the output.
- A validated output dictionary definition, explicit selected source rows, model formula,
  declared source assumptions, scenario assumption, limitations and confidence cap.
- Only supported demand quantities; no currency/money unit, monetary market sizing,
  revenue prediction, probability, project ranking or investment recommendation.

No rounding policy for fractional **discrete event/person/entity counts** was approved.
If a formula produces a noninteger in such a unit, M3 returns NOT_COMPUTABLE with null,
including tiny fractions that would otherwise round to zero at six decimals. It does not
invent a rounding assumption or misuse an ITEMS dimension. Continuous product quantities
can use their genuinely declared ITEMS unit. Unsafe/overflowing intermediates and results
also fail explicitly; a finite percentage does not legitimize an overflowing subtotal.

### Confidence, provenance and validation

Policy remains exactly `market-confidence-v1@1.0.0`: the same eight factors, weights,
thresholds and caps approved in M1, not a probability of business success.
Only Market's basis adaptation changed; Shared confidence code is untouched.

Each calculation expands the exact transitive observation/assumption lineage and retains
all required source inputs. Real typed dictionary definitions also participate in quality,
rights, freshness/completeness and weakest-input capping; they are not pretend demand
observations. Each factor uses the weakest evidence, and every required operand's band
caps the result. A declared scenario is ESTIMATED and at most MEDIUM even if all its
measured operands are high quality. Missing/expired/conflicting/insufficient evidence
does not receive a confidence-shaped fallback.

Trace forms are MARKET_LEVEL, SUM_DISJOINT, MARKET_COMPARISON and EXPLICIT_ESTIMATE.
Every metric links source/version/hash to exact source rows, supporting definitions and
assumptions, method, semantics and result. Rights and attribution are the conservative
Shared derivations over the governed inputs, never widened for a derived result.

The result validator rebinds each typed dataset to its actual source/version metadata,
reapplies the same pure source validation, reconstructs selection/coverage/operand states,
reruns the deterministic calculations, and compares every outcome, metric, trace,
confidence, gap, input, availability entry, budget and rights. Recomputing hashes does
not legitimize a changed number, formula, classification, method, source decision,
missing/duplicate output, confidence or export permission.

Existing limits remain: 20 series, 120 selected periods, 32 total version selections
including implicit roles, 2,000 rows per version, 10,000 total rows and **500 requested
outcome slots / at most 500 computed metrics**. The exact 500-slot all-unavailable result
is tested without dropping any slot or substituting zero. A 501st result slot is rejected.
The M3 envelope permits up to 5,000 distinct gaps so full-budget unavailable slots can
coexist with source-validation gaps; this is Market-only, not a Shared/M1 contract change.
The Shared 2 MiB envelope ceiling is preserved, checked incrementally during metric
construction and before return. Oversized evidence fails REQUEST_TOO_LARGE; it is
never silently truncated.

### Validation and performance

Tests use synthetic
governed fixtures unless explicitly identified as existing Spatial real-Saudi regression.
No fixture is Real Demand Data. PostgreSQL integration counts run/input and Data Center
source/item/version/type/usage/audit/event rows before/after M3 execution, verifies zero writes, exact checksums,
repeat-run deterministic hashes and identical missing/inaccessible public outcomes.

| Gate | M3 checkpoint |
| --- | --- |
| Market full unit/contract/arithmetic/source/boundary suite | 289 PASS across six files, including 73 M3 end-to-end/golden/adversarial cases |
| Frozen Shared/Spatial unit regression | 1,108 PASS; combined 1,397/1,397 across 39 files, no failures/skips |
| Full PostgreSQL/Data Center/provider/PostGIS suite | 295/295 PASS across 12 files in one completed combined run |
| Market PostgreSQL integration | 27/27 PASS, including governed M3 execution/determinism/zero writes/no-existence-leak; rerun after final source refinements |
| Existing Data Center/PostgreSQL/provider regressions | 138/138 PASS across eight files |
| Existing Spatial/PostGIS regressions | 130/130 PASS across three files, including 44 real Saudi Map-copy cases |
| Database safety | All 78 existing migrations applied only to own disposable scratch databases; exact scratch cleanup verified |
| TypeScript / scoped ESLint / whitespace | PASS; lint requires zero warnings |
| Production build | PASS with existing supported Webpack path, one worker, 161 static-page generation tasks |
| Frozen source/baseline diff | Shared, Spatial, Map, Data Center, schema, dependencies, workflows and app/UI unchanged |

The full database suite completed in **251.71 s** without failed tests, relaxed thresholds
or skips. A final focused Market rerun retains the latest per-suite evidence without claiming
that every repeated run adds new unique tests. The pre-existing pg concurrent-query
deprecation warning remains, without a driver/dependency or Spatial change.

Local synthetic PostgreSQL M3 exact-read-to-calculation measurements: **590.63 ms**
in the complete database run and **298.01 ms** in the final focused run, for two discovery
calls, two exact/checksum-verified reads, two demand-period rows and one dictionary
definition. These are individual fixture measurements, not a production SLA, percentile,
load/concurrency gate or Real-Demand acceptance. M5 retains the broader performance gate.

Changed surfaces: Market `model.ts`, `datasets.ts`, `data-sources.ts`, `confidence.ts`,
`calculations.ts`, `contracts.ts`, `index.ts`, `adapters/data-center-provider.ts`; new
`advanced-calculations.ts`, `engine.ts`, `result.ts`; new unit engine suite, two additive
PostgreSQL integration cases; this report and the architecture status. Shared additions:
**NONE**. Only the Market-local source-validation helper was extracted/reused so runtime
preparation and result verification apply identical metadata/evidence rules.

**REAL-DATA DEMAND ACCEPTANCE = BLOCKED / NOT VERIFIED.**
Production inventory remains NOT VERIFIED; unavailable access does not prove absence
of Market data. An authorized populated Data Center connection and suitable actual demand
periods are still required. This is not a functional calculation failure.

**Map changed: NO. Data Center frozen baseline changed: NO. Spatial changed: NO.**
**Shared Core additions/changes: NONE. M4 started: NO. Main merge: NO.**
**Sonar: DEFERRED / PENDING; no attempts. Final tags: NOT CREATED.**
M3 stops for owner review; it does not grant M4 approval or final Market Engine closure.

## 17. JENAN MARKET & DEMAND ENGINE — M4 CHECKPOINT REPORT

### Accepted prerequisite and scope

The owner accepted and CLOSED M3 at `e57a295d6d09343ccc3bdfbc62f8093646bc97d2`;
Local HEAD, Remote HEAD and the desktop Market archive were verified identical before
M4 began. The subsequent explicit M4-only approval authorizes persistence in existing
Shared Run/Input tables and exact historical replay. It does not authorize M5, new
datasets, Data Center/schema changes, Spatial changes, Sonar or a main merge.

M4 adds internal backend services, not public routes or UI. There is no second Market
dataset store, new table, migration, registered type, shared-core rewrite or dependency.
The existing nonpersisting M3 entry points retain their original behavior and hashes.

### Contracts and entry points

| Surface | Contract / behavior |
| --- | --- |
| Request / result | Unchanged `jenan.market-demand.request/v1` and `jenan.market-demand.result/v1` |
| Arithmetic version | Exactly `1.0.0-m3`; M4 does not silently upgrade historical calculations |
| Shared stored record | Existing `jenan.analysis-engine.run-record/v1` |
| Market runtime metadata | `jenan.market-demand.run-history/v1`, with trusted replay authorization context |
| Per-input provenance | `jenan.market-demand.input-provenance/v1`, exact role/reference/selection evidence |
| Per-input usage intent | `jenan.market-demand.input-usage/v1`, exact version/checksum/roles/analyses and CALCULATION_EVIDENCE or SOURCE_VALIDATION |
| `runMarketAnalysisPersisted` | Trusted actor/context, existing governed M3 execution, atomic save, then return |
| `persistMarketRun` | Internal validated Shared record append; verifies current source authorization and historical content before saving |
| `readMarketRun` | Internal owner/platform-admin lookup, full record/column integrity and current input authorization before returning evidence |
| `replayMarketAnalysis` | Internal authorized exact historical reconstruction, no new run or discovery |

Neither database adapter nor service is re-exported through the pure engine index.
The trusted caller supplies run id, evaluation instant, timing, createdAt, environment
and optional subject/organization/specialty/mission context. Recorded USER/ROBOT identity
comes from the authenticated Data Center actor, never an independent submitted actor.
Persistence context is validated before computation.

### Atomic persistence and failure behavior

The existing `AnalysisEngineRun` stores the bounded complete request/result envelope,
engine/contracts, request/input/output hashes, status, actor, subject, timing, cost,
confidence/gap summaries, recorded access context and createdAt. The existing
`AnalysisEngineRunInput` stores each exact snapshot, version/source/type/checksum plus
provenance and usage intent. This is run evidence, not a duplicate independently managed
Market dataset inventory. The original shared **2 MiB** JSON bounds remain enforced.

Successful persistence uses one nested run/input create in a **Repeatable Read**
transaction, with a 30-second transaction timeout. Required exact versions are checked
inside that transaction before creation. Duplicate ids or a persistence failure surface
as errors; no unsaved successful result is returned and no orphan input is accepted.
Existing database append-only triggers still reject UPDATE and DELETE.

An `EngineError` before a result is recorded explicitly as FAILED, with its error code,
bounded submitted request (or an omitted/size/SHA-256 marker), and no invented result,
input/output hash or confidence. Its cost/gap defaults and failure capture are strictly
validated. A failed record is not replayable. If execution and failure-history saving
both fail, an AggregateError preserves both causes. Data Center authorization and
unexpected infrastructure errors propagate unchanged; no successful empty result or
fabricated calculation failure is substituted.

The PostgreSQL suite also verifies a real committed run can be reloaded from another
transaction and replayed, independently of the rolled-back fixture transaction proxy.
Only that test's exact generated record/user are removed under test-only guard control;
production adapters never disable triggers or execute raw SQL.

### Authorized exact historical replay

1. Query the Market run by id and owner kind/id, unless the caller is the current platform
   administrator. Foreign and missing ids return the same generic unavailable error.
2. Validate the complete shared record against the recorded M3 result, including all
   duplicated columns, snapshots, summaries, provenance and usage intent. Input rows are
   restored using Shared code-point ordering, independent of database collation/row order.
3. Reauthorize each captured input using the existing current Data Center source-scope/
   robot-grant policy and matching required permission, organization, specialty and mission
   context. Revoked retrieval, private/organization access loss, suspended membership,
   revoked robot grant, archived/conflicted item or unavailable exact version block replay.
4. Read only the recorded immutable version id. Verify the existing Data Center checksum
   over content and immutable version metadata/lineage; verify version number, source,
   type and canonical parsed Market dataset against the captured evidence. Non-GeoJSON
   Market content remains raw typed JSON, not a forced geographic representation.
5. Conservatively require current license/class, usage policy, export permission,
   attribution requirement/text and ownership/owner to match the captured rights.
   A rights change blocks lookup/replay, even if apparently more permissive; it never
   silently broadens or rewrites the old result.
6. Retain original source-selection decisions, failed pins, gaps, quality, evaluation
   time and confidence evidence. A newer publication, later quality assessment, changed
   source freshness or elapsed original measurement expiry never chooses replacement
   data or rewrites historical evaluation. Current access/rights revocation still wins.
7. Reuse M3 source finalization and deterministic calculations at the recorded evaluation
   instant. Recompute request/input/output hashes and require complete canonical result
   equality, not just matching displayed numbers. Unsupported arithmetic versions fail.

Replay executes in a Repeatable Read transaction. It performs no rediscovery/current
type selection, fallback, interpolation, network/AI call, persistence or Data Center
usage/audit write. An originally missing measurement stays missing; later data do not
turn the historical gap into an observation.

### Validation and measured behavior

| Gate | M4 result |
| --- | --- |
| Market full units | 337 PASS across eight files, including 39 new record/service cases and tightened AST capability checks |
| Frozen Shared/Spatial units | 1,108 PASS; combined **1,445/1,445** across 41 files, zero failures/skips |
| Full PostgreSQL/Data Center/provider/PostGIS regression | **334/334 PASS** across the existing 12 files, including 66 Market cases at that point |
| Final Market PostgreSQL suite | **68/68 PASS**, after adding committed durability and database-order independence cases; includes all 27 previous cases and 41 M4 cases |
| Final targeted record/service/boundary rerun | 92/92 PASS after the last canonical-order refinement |
| Existing Data Center/provider regressions | 138/138 PASS, unchanged |
| Existing Spatial/PostGIS regressions | 130/130 PASS, including 44 existing real-Saudi Map-copy cases |
| TypeScript / scoped ESLint / diff check | PASS, zero-warning lint |
| Final production build | PASS, existing Webpack path with one worker, 161 static generation tasks |
| Database safety | All 78 existing migrations applied only to owned disposable databases; exact scratch cleanup verified |

The completed full database regression took **199.05 s**. The final focused Market
suite took **49.03 s**; these runs overlap and are not summed as unique test counts.
An interim collected test nesting error was corrected. Another interim fixture run hit
the existing 20-second test deadline during concurrent checks; the final sequential
rerun passed all 68 cases without relaxing any timeout, threshold, assertion or scope.
The pre-existing pg concurrent-query deprecation remains, with no driver/Spatial edit.

Local synthetic two-input exact replay measured **214.32 ms** in the full regression
and **169.64 ms** in the final focused run. These individual measurements are not a
production SLA, percentile, load/concurrency certification or Real Demand acceptance.
Broader technical acceptance/performance remains M5 scope.

### Changed files, frozen surfaces and remaining acceptance

- New Market-only pure `run-history.ts`; new adapters `run-persistence.ts`,
  `run-service.ts`, `historical-data-center.ts`, `replay-service.ts`.
- New unit suites `market-demand-run-history.test.ts` and
  `market-demand-run-service.test.ts`; extended existing Market PostgreSQL and
  Market/global AST boundary suites. The only runtime write allowlisted is
  `tx.analysisEngineRun.create` with nested inputs; no Data Center/Map/Projects writes,
  raw SQL, network, scraping, LLM or cross-engine imports.
- This checkpoint and the shared architecture status. **Shared Core additions: NONE.**
  No existing arithmetic, Data Center contract, schema, registry or Spatial adapter changed.
- No new UI/routes: responsive and visual acceptance are not applicable to this
  backend-only checkpoint; no accepted public interface was modified.

**REAL-DATA DEMAND ACCEPTANCE = BLOCKED / NOT VERIFIED.**
Market PostgreSQL content is **Fixtures / Synthetic**, never Real Demand Data.
Production Data Center inventory remains NOT VERIFIED; unavailable authorized access
does not prove production Market data are absent. Real observed-demand acceptance still
needs an authorized populated source and suitable comparable actual-demand periods.

**Map changed: NO. Data Center frozen baseline changed: NO. Spatial changed: NO.**
**Shared Core changed: NO. M5 started: NO. Main merge: NO.**
**Sonar: DEFERRED / PENDING; no attempts. Final tags: NOT CREATED.**
M4 is **TECHNICALLY COMPLETE**, stops at this checkpoint for owner review, and does
not claim final Market Engine closure or authorize M5.
