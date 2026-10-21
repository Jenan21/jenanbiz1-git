# JENAN MARKET & DEMAND ENGINE — ARCHITECTURE & IMPLEMENTATION PLAN

## M0 status and authority

**Architecture proposal only — awaiting owner approval. M1 has not started.**

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
| Confidence-policy framework | Explainable `market-demand-confidence-v1`, not Spatial's geometry weights |
| Rights, export and envelope validation | Fail-closed export and full provenance, including derived outputs |
| Cost primitives | A request-only market work estimate and early admission check |
| RunRecord contract and AnalysisEngineRun/Input tables | Append-only run/input history, provenance and usage without new Project/Map FKs |

**Do not pretend every reusable contract already has a generic implementation:**

1. The current shared `COUNT`/`DENSITY` metrics explicitly mean mapped features; using them
   for transactions or products would violate their meaning. Current numeric kinds also
   reject negative values, so a falling demand series cannot be represented as a signed
   numeric change without an additive contract extension.
2. Propose engine-neutral `QUANTITY` and `CHANGE` kinds with explicit units and signed-change
   validation. Final names/units and envelope checks must be approved in M1; never reinterpret
   existing COUNT, RATIO or ORDINAL members, or encode a negative number as misleading text.
3. The existing database persistence, usage and historical-replay implementations live under
   `spatial/adapters`, and some are GeoJSON/Spatial-specific. Market must not import them.
   The shared tables and pure run contracts are reusable; those adapter implementations are
   not yet an engine-neutral service.
4. The architecture test currently permits adapters only in Spatial and names the allowed
   files explicitly. Market needs a narrow additive boundary-test update, not a disabled guard.

Any shared-core extension or proposed extraction that would require changing frozen Spatial
must be brought to the owner **before editing**, with its backward-compatibility tests.
No such change is made or implicitly approved by this M0.

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
- For v1, Spatial summaries are **optional context only**, not a prerequisite for measured
  market calculations. They cannot turn population into buyers or POIs into transactions.
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
| DEMAND_TREND | Comparable adjacent/selected period absolute change and relative change `(current - previous) / previous`; negative change allowed; previous zero makes relative change unavailable |
| AUDIENCE_CONTEXT | Population/household cohort as an observed context value; no assertion that all residents are potential buyers |
| ASSUMPTION_BASED_DEMAND | Optional `eligible population × explicit adoption fraction × frequency per matched period`, only with compatible source-backed inputs; always ESTIMATED |

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

## 6. Proposed inputs and outputs

### Request (proposed `jenan.market-demand.request/v1`)

- `analyses`: explicit subset of the five v1 analyses.
- `scope`: country and exact area authority/level/code/version, sector taxonomy/code/version,
  cohort/universe definition and the requested reporting period(s).
- `data`: per-role exact Data Center version pins, or approved registered type plus `asOf`.
- `parameters`: explicit series selection/comparison periods and optional estimate assumptions
  represented by governed input references, not silent constants.
- `options`: correlation id; evaluation instant permitted only in authorized replay/acceptance.
- No Project FK, project budget, success target, recommendation flag, raw customer data,
  external URL connector, caller-selected server budget or arbitrary table/query.

### Result (proposed `jenan.market-demand.result/v1`)

Reuse the engine envelope: engine identity/contracts/policies; normalized request; input
availability and descriptors; analysis metrics grouped by the requested scope/series;
per-metric method, units, state, input refs, confidence and limitations; bilingual gaps;
rights and attribution; hashes; bounded work/cost and timing.

Add a validated calculation trace identifying exact observation ids and transformations,
periods, numerator/denominator or assumption input references. Keep that trace inside the
canonical hashed result and store it in the run. A reference to an entire dataset alone is
not enough to explain which rows and assumptions produced a metric.

Observations may be COMPUTED or PARTIAL; assumption-derived outputs are ESTIMATED, never
upgraded to VERIFIED by a successful formula. No best-project recommendation, feasibility
score, success probability, project revenue forecast or financial conclusion is produced.

### Proposed work caps (for approval/calibration in M1–M6)

- 500 total metrics, bounded before discovery/reads or expensive work.
- At most 32 input versions (below Data Center's 50-id exact-read request cap).
- At most 20 selected series and 120 requested periods.
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

## 8. Confidence, provenance, rights and persistence

Use a dedicated `market-demand-confidence-v1` policy on the shared framework. Proposed factors:
source/evidence quality, methodology and sample representativeness, geographic/sector/cohort
coverage, period alignment, freshness and dimensional comparability. Weights/thresholds must
be explicit, versioned and tested in M1, not borrowed from Spatial or treated as probability.

Hard caps take precedence: unknown/sample representativeness cannot become HIGH because
arithmetic succeeded; an estimate cannot outrank its weakest required input; lack of data
never increases confidence. Unavailable metrics have null confidence.

Persist exact normalized request; request/input/output hashes; policy/method versions;
observation/calculation lineage; Data Center exact version/source/type/checksum; source and
publication/effective metadata; license/usage/attribution/quality snapshot; actor; gaps; and
run-linked usage intents. Use the existing append-only run/input tables without new Project,
Map or Data Center foreign keys and without writes to frozen Data Center usage tables.

A Market-owned adapter can use the existing generic published read and pure Data Center
policy/checksum helpers. Exact historical replay of non-GeoJSON content requires its own
approved internal seam: the Spatial historical adapter currently requires GeoJSON. Design
that seam in M1 and implement/test it in M5 without importing or editing Spatial. Prefer an
approved engine-neutral extraction if needed; stop for owner approval before any extraction
that touches the frozen engine. No ordinary historical discovery/API is added.

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

## 10. Proposed milestones: M0 plus six implementation/acceptance stages

M1–M6 are **proposed only**; no stage starts before this M0 is approved. Six stages keep
foundations, source access, observed calculations, assumption-based work, history and technical
acceptance independently reviewable, while avoiding an unnecessary second Spatial build.

| Stage | Bounded deliverable / review gate |
| --- | --- |
| M0 (this report) | Architecture, v1/data contracts, limitations and decisions; no implementation |
| M1 | Contracts/normalization, additive shared vocabulary proposal approval, boundary guards, cost/caps, gaps/confidence and persistence/replay seam design |
| M2 | Read-only governed Data Center adapter, engine-side observation validator, exact/by-type selection, scope/rights/provenance; authorized source inventory |
| M3 | MARKET_CONTEXT, OBSERVED_DEMAND and DEMAND_TREND; duplicate/revision handling, comparable periods/dimensions, signed changes and no false zero |
| M4 | AUDIENCE_CONTEXT and optional ASSUMPTION_BASED_DEMAND; explicit assumptions, unit/time/cohort compatibility and ESTIMATED lineage |
| M5 | Append-only run/input/usage persistence and exact historical non-spatial replay; real fresh PostgreSQL acceptance |
| M6 | Full technical acceptance, real-data cases where available, bounded performance/security/access tests, CodeQL/review, documentation and Technical SHA |

After every stage, report delivered contracts/capabilities, targeted tests, baseline diff,
data gaps and git/archive status, then stop for the next explicit owner instruction. Final
Sonar and final tags remain deferred under the seven-engine policy; an M6 technical pass is
not a claim that Sonar passed or final closure was granted.

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
- Explicit estimate factors including valid zero, invalid rates/frequencies, missing inputs,
  cohort incompatibility, ESTIMATED status and weakest-input confidence.
- Provenance down to rows/assumptions; rights/export/attribution closure; trace/hash sensitivity.
- Fresh disposable PostgreSQL migrations, atomic append-only persistence, exact version/hash/
  usage rows, authorized historical replay, missing history/content and mismatch failures.
- Reproducibility for identical requests and versions, stable tie-breaks and caller isolation.
- No external network/AI, no Map writes, no Data Center writes, no Projects FK/imports, no
  engine-to-engine imports, no silent weakening of the existing Spatial regression tests.
- Regression: complete Spatial/shared suite and relevant Data Center/PostgreSQL suites;
  PostGIS regression when a shared change could affect Spatial geometry/envelope behavior.
- TypeScript, lint, production build and diff checks at implementation technical acceptance;
  bounded repeated/concurrent timing gates calibrated on approved actual datasets.
- Security/access testing, review and CodeQL. Sonar is deferred, not reported as PASS.

## 12. Proposed Real-Data Acceptance

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

## 13. Current blockers and decisions required before M1

1. **Owner M0 approval:** authorize v1 analyses, deferred items, milestone count and proposed
   work caps. Implementation remains stopped.
2. **Shared vocabulary/guards:** approve the additive quantities/units/signed-change semantics
   and narrow Market adapter allowlist before any shared edits; preserve Spatial semantics.
3. **Persistence/replay seam:** approve the Market-owned/internal or engine-neutral approach
   for non-GeoJSON history. Any necessary change to frozen Spatial requires a separate stop.
4. **Governed data:** authorize an actor-scoped inventory and supply/approve statistical
   sources, taxonomy, observation schemas, area/cohort definitions and estimate assumptions.
   M0 has not established production availability or source licensing.
5. **Large datasets:** no approved executable immutable market artifact reader exists in this
   proposal. Keep bounded inline v1 or request a separate approved contract; no DC schema change.
6. **Sonar:** DEFERRED / PENDING by owner decision, not an M1 blocker and not final closure.

**Stop after M0. Do not implement Market & Demand M1 until the owner reviews this plan.**
