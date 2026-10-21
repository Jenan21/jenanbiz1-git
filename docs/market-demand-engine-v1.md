# JENAN MARKET & DEMAND ENGINE — ARCHITECTURE & IMPLEMENTATION PLAN

## M0 status and authority

**M0 architectural direction and owner decisions approved on 2026-10-21.
Detailed contracts and the final proposed stage split below await review. M1 has not started.**

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
- This M0 creates documentation only: no engine module, shared schema extension, migration,
  Data Center type/record, source connection, UI, API or analytical result.

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
   optional metric-semantics block. Review these definitions before M1 implements anything;
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

## 6. Detailed contract proposal — for review before M1

### Request (proposed `jenan.market-demand.request/v1`)

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
| `series` | Up to 20 `{id, metricDefinitionId, unit, aggregation, timeWindow, periods}` selections; ids refer to definitions in governed content |
| `data.roles` | Role to bounded nonempty list of exact `{source:"DATA_CENTER", versionId, expectedChecksum?}` OR one `{source:"DATA_CENTER", typeKey, asOf?}` selector; modes cannot be mixed within a role |
| `parameters.comparisons` | Optional explicit `{seriesId, fromPeriodId, toPeriodId, measures}` pairs; measures are ABSOLUTE_CHANGE, PERCENT_CHANGE, INDEX; no inferred missing-period comparisons |
| `parameters.basePeriods` | Required per series requesting INDEX; exact selected `periodId`, no automatic base substitution |
| `parameters.estimates` | Explicit `{id, cohortObservationRef, adoptionObservationRef, frequencyObservationRef, outputUnit, periodId}`; all refs resolve to selected governed version/row ids |
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
`periods` select source-defined interval ids or snapshot ids, not caller-created observations.
Snapshot selections resolve to a reference date rather than a fictitious interval.
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
| `period` | `{id, startDate, endDate, frequency, calendar, timeZone}` for an interval observation; null for a STOCK snapshot |
| `timeWindow` | Requested bounds, distinct from the actual source period; never fabricated source coverage |
| `referenceDate` | `{id, date, calendar, timeZone}` for STOCK snapshots; null for interval observations; no invented annual total |
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
  Exactly one of `period` and `referenceDate` is populated for a level observation.
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

### Result (proposed `jenan.market-demand.result/v1`)

Strict result envelope: `contract`, `runId`, engine key/version/contracts/runtime/policies,
derived run `status`, normalized request/evaluation instant, `inputs`, `dataAvailability`,
analysis `results`, `gaps`, `rights`, `attribution`, `determinism`, `limits` and `timing`.
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

### Proposed work caps (for approval/calibration in M1–M5)

- 500 total metrics, bounded before discovery/reads or expensive work.
- At most 32 input versions (below Data Center's 50-id exact-read request cap).
- At most 20 selected series and 120 requested periods.
- At most 40 explicit comparisons and 20 estimates; preflight includes every requested
  absolute/percent/index derivative, context and estimated metric in the 500 total.
- At most 2,000 rows per version and 10,000 parsed observations per run, with a refusal
  before calculations on any excess; also retain content and common run JSON byte limits.
- Preflight the output cross-product and server cost; enforce actual read/parse bounds too.
  Admission cost is a work heuristic, not a promised number of milliseconds.

These are proposals, not implemented or claimed to be performance-qualified. In particular,
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

**Policy proposal for review:** id `market-confidence-v1`, version `1.0.0`,
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

## 10. Final proposed split: M0 plus five implementation/acceptance stages

**Recommend M1–M5, not seven stages.** These stages remain proposed until the detailed
contracts in this revision are reviewed. M0 direction approval is not authorization to
start M1. Five stages preserve separate gates for contracts, governed data, deterministic
analysis, exact history and technical acceptance. Four would combine history with final
acceptance or data access with arithmetic and hide a meaningful risk boundary.

| Stage | Bounded deliverable / review gate |
| --- | --- |
| M0 (this report) | Approved direction/decisions incorporated; seven contract/model proposals presented; stop for review |
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

1. **Detailed contract review:** direction and the four architectural decisions are approved;
   review this revision's seven deliverables, five-stage split, confidence rubric and work
   caps, then separately authorize M1. Implementation remains stopped.
2. **Compatibility:** additive engine-neutral primitives are approved in principle. Their
   concrete schemas/interpretations, legacy encoding/hash preservation and narrow boundary
   allowlist are specified here for review, not already implemented.
3. **Persistence/replay seam:** review the proposed engine-neutral service without dataset
   duplication or Spatial/DC edits. Exact non-GeoJSON historical authorization remains a
   capability to implement and verify, not an existing generic implementation.
4. **Governed data:** authorize an actor-scoped inventory and supply/approve statistical
   sources, taxonomy, observation schemas, area/cohort definitions and estimate assumptions.
   M0 has not established production availability or source licensing.
5. **Large datasets:** no approved executable immutable market artifact reader exists in this
   proposal. Keep bounded inline v1 or request a separate approved contract; no DC schema change.
6. **Sonar:** DEFERRED / PENDING by owner decision, not an M1 blocker and not final closure.

**Stop after M0. Do not implement Market & Demand M1 until the owner reviews this plan.**
