# Jenan PRO Spatial Analysis Engine v1 | محرك التحليل المكاني

The first of the seven analysis engines (see `docs/analysis-engines.md` for the shared core,
the branch line and the principles). It lives in `services/analysis-engines/spatial` on the
branch `jenan-engines/spatial`, built on top of the frozen Data Center baseline.

## Scope

Six analyses, all expressed as documented spatial facts and measurements:

| Analysis | Produces |
| --- | --- |
| `LOCATION_CONTEXT` | Where the location is: administrative context, nearby places |
| `PROXIMITY` | The nearest features of each role, searched in expanding rings |
| `CATCHMENT` | Counts per role within each radius; population when a population dataset exists |
| `DENSITY` | Feature density, clusters and grid counts |
| `CONSTRAINT_SCREENING` | Whether the location touches constraint areas (for example protected areas) |
| `SITE_COMPARISON` | The same measurements side by side for the main location and its candidates, with no ranking |

Left out of v1 on purpose, and listed in every result under `capabilities.excluded`: route and
travel time, driving distance, terrain, geocoding, AI recommendations, and financial or
business recommendations. All distances are straight-line distances on the Earth's surface.

The engine never says a location is good or bad and never says what to do. It states facts and
the limits of the data behind them. Interpretation belongs to the later engines and the final
decision to the Risk & Decision Engine.

### Engine capability and production data

Two different questions are kept apart. **Capability** is whether the engine's code, contracts,
calculations and tests are complete. **Production data availability** is whether the data a
given analysis needs has been collected. The engine is closed when its capability is complete,
not when all of the Kingdom's data exists. When data is missing the engine returns
`NOT_AVAILABLE`, `NO_COVERAGE` or `NOT_COMPUTABLE` with the documented reason, never an
invented value and never a zero. Unit tests use geometric fixtures; acceptance tests run against
the real Saudi data that is available.

At the time of the foundation investigation the Map held a sample of points of interest and
places, administrative boundaries from a non-governmental source, and road label points only.
There was no population, competitor or road-network dataset and no spatial dataset in the Data
Center. Those analyses therefore report their data as unavailable until the data is published.

## Request contract `jenan.spatial-analysis.request/v1`

| Member | Meaning |
| --- | --- |
| `analyses` | One or more of the six analyses |
| `location` | A GeoJSON `Point`, `Polygon` or `MultiPolygon` in WGS84 (the main location) |
| `candidates` | Up to 20 more locations with unique lower-case ids (`primary` is reserved) |
| `parameters` | `radiiMeters`, `roles`, `nearestCount`, `maxSearchMeters`, `cluster`, `grid` |
| `data` | Optional pins of a role to a Data Center version or a Map layer |
| `mapLayerPolicy` | `REGISTERED_ONLY` or `ALLOW_UNREGISTERED` (see below) |
| `options` | `requestId` (correlation) and `evaluatedAt` (replay only) |

The contract rejects any member it does not define: there is no budget, no project reference,
no language and no way to ask for a recommendation.

**Default radii are 500 m, 1 km, 3 km and 5 km.** Another radius needs an explicit request, from
100 m up to 50 km, with at most 8 radii. `maxSearchMeters` must be one of the search ladder
rings (500 m, 1 km, 3 km, 5 km, 10 km, 25 km, 50 km) and defaults to 5 km. `nearestCount` is 1 to
20 and defaults to 3.

**Roles** say what a dataset is used for: `place:locality`, `poi:hospital`, `road:major`,
`competitor:cafe`, `constraint:protected_area` or `population`. The kind is lower snake case and
`population` takes none. Administrative roles are implicit and cannot be requested.

**Rules between analyses and parameters:** proximity, catchment and density need at least one
feature role (`place`, `poi`, `road` or `competitor`); constraint screening needs a
`constraint:*` role; the population role belongs to catchment; a site comparison needs at least
one candidate and one more analysis. A pinned dataset must belong to a requested role.

**Locations are bounded** so cost is known before any data is read: an area has at most 2,000
positions in total, at most 100 rings and 100 parts, a closed ring, no antimeridian crossing, an
extent above zero and at most 250,000 km² (measured with a spherical pre-check accurate to about
half a percent). Topological validity is decided by PostGIS (`ST_IsValid`) in a later milestone.

### Normalization

`normalizeSpatialRequest` validates the request and returns its canonical form: defaults filled
in, radii ascending, roles and analyses sorted and de-duplicated (analyses in engine order),
candidates by id. It also returns the applied `mapLayerPolicy`, the `evaluatedAt` instant, the
optional `requestId`, and `defaultsApplied`. Two requests that ask for the same analysis give the
same normalized object and the same request hash; the `defaultsApplied` list is not hashed.

`evaluatedAt` defaults to the injected clock. A caller may pin it only when the service allows it
(replay and acceptance paths), never to a future instant, because an earlier instant would make
stale data look fresh.

`prepareSpatialRequest` normalizes, estimates the cost and refuses a request above the server
budget (`REQUEST_TOO_LARGE`).

### Map layer policy

- Production is `REGISTERED_ONLY`: only layers of a published, registered Map release. An
  explicit request for `ALLOW_UNREGISTERED` is refused with `MAP_LAYER_POLICY_VIOLATION` (403).
- Development and test default to `ALLOW_UNREGISTERED`. Layers that are not registered are used
  only when asked for or defaulted, are labelled with the `MAP_LAYER_UNREGISTERED` gap and cap
  confidence at `MEDIUM`.
- Sample or unknown data can never yield a conclusion that reads as a complete market inventory
  (see counts below).

## Result contract `jenan.spatial-analysis.result/v1`

The result is the shared envelope: engine identity, policies and runtime; derived status; the
normalized request with its defaults and policy; the inputs used (full descriptors); data
availability per role; results per analysis and target (metrics only); normalized gaps;
attribution; rights; the three hashes; limits; timing. Results are ordered by analysis (engine
order), then the main location, then candidates by id. A parsed result has passed the shared
envelope rules and the Spatial rules (engine key and contracts, production policy, unique and
requested analyses and targets, analyses within the engine version's declared capabilities,
order).

Rights follow from the inputs and fail closed. A result that has no input at all (the Map has
nothing published, or in production every layer is unregistered and excluded) is not exportable:
`rights` is `{ allowExport: false, denials: [{ reason: "NO_INPUTS" }] }`. The absence of inputs is
never a permission. A target outside the Map's coverage keeps the inputs the run read, so the
denials are theirs.

## Confidence `spatial-confidence-v1`

An explainable heuristic quality indicator for the data a measurement rests on. It is not a
probability or a success rate, and its descriptor says so. Each factor takes the weakest dataset
the measurement depends on; ties are broken by input id.

| Factor | Points | Rule |
| --- | --- | --- |
| `coverage` | 25 | Full 25; partial in proportion to the covered fraction; undeclared 0; none: not scored (`NO_COVERAGE`) |
| `freshness` | 20 | Fresh: 20 falling linearly to 0 over the source's freshness period; stale or unknown 0; expired: not scored |
| `sourceQuality` | 20 | Measured: 20 times the recorded score; insufficient data or unavailable 0 |
| `provenanceRights` | 10 | Published or registered 4 (unregistered 0), recorded license 2, declared license class 2, attribution statement 2 |
| `geometryFidelity` | 15 | Fit of the geometry to the measurement (exact 10, suitable 7, proxy 3, unsuitable 0) plus declared positional accuracy 5 (undeclared 2); invalid geometry: not scored |
| `completeness` | 10 | 10 times available roles over requested roles times a multiplier: inventory 1, sample 0.2, unknown 0.1 |

Bands: `HIGH` from 75, `MEDIUM` from 50, `LOW` from 25, otherwise `INSUFFICIENT`. Caps lower the
band and never raise it: a count or density from data that is not an inventory is capped at
`LOW` (`COUNT_IS_NOT_AN_INVENTORY`); an unregistered layer, an unmeasured quality, an estimated
value and a fallback method are each capped at `MEDIUM`.

Example: a count of points of interest from an unregistered Map layer that is a fresh sample
scores 25 + 20 + 0 + 4 + 9 + 2 = 60, which is `MEDIUM` by points and `LOW` after the caps.

A measurement that no data supports (no coverage, expired data, invalid geometry, no dataset) is
not scored and carries no value; `metricStatusForBlocks` maps the reason to the status. The
weights, thresholds and caps belong to the policy id: a change is a new policy, for example
`spatial-confidence-v2`.

## Cost `spatial-cost-v1`

Units are an abstract measure of work (not seconds, not money). Every selected analysis runs for
the main location and each candidate: a point weighs 1, an area `2 + positions / 500`.

| Analysis | Units |
| --- | --- |
| `LOCATION_CONTEXT` | 3 per target weight, plus for each place role 0.5 per search ring (up to `maxSearchMeters`) per target weight (`context.<role>`) |
| `PROXIMITY` | For each feature role: 0.5 per search ring (up to `maxSearchMeters`) plus 0.1 per requested nearest feature (`nearestCount`, which sets the size of the query and of the result) |
| `CATCHMENT` | 1 per feature role, 1 per radius (+1 above 10 km), +2 per radius with a population role |
| `DENSITY` | 4 + min(40, grid cells / 2000) for each feature role |
| `CONSTRAINT_SCREENING` | 1.5 per constraint role |
| `SITE_COMPARISON` | 0.2 per target |

The default budget is 1,000 units and the maximum is 5,000; both are chosen by the server. The
weights are provisional and are calibrated against measured runs on real data before the engine
is closed; a change of weights is a new cost policy version. Versions: `1.0.0` (M1), `1.1.0`,
which added the `nearestCount` component to `PROXIMITY` (`proximity.<role>.nearest`), and `1.2.0`
(M2), which prices the nearest-place search of each place role in `LOCATION_CONTEXT`
(`context.<role>`).

## Gaps

The shared gaps plus ten of its own, all bilingual and worded as facts:

| Code | Severity | Says |
| --- | --- | --- |
| `DATASET_GEOMETRY_INVALID` | blocking | A dataset's geometry cannot be used for measurement |
| `MAP_NOT_PUBLISHED` | blocking | The Map has no published, enabled release (with the Map's state) |
| `BOUNDARY_UNOFFICIAL` | warning | The administrative boundaries are not issued by a government authority; results must be shown as based on unofficial boundaries |
| `ADMIN_NEAR_BOUNDARY` | warning | The location is within 1,000 m of the edge of its unit (the distance is stated) |
| `ADMIN_AMBIGUOUS_ON_BOUNDARY` | warning | Two or more polygons of a level cover the location; no single unit is stated |
| `ADMIN_TARGET_SPANS_UNITS` | warning | An area intersects several units; the unit is stated for its representative point |
| `ADMIN_UNIT_NOT_FOUND` | warning | Inside the mapped country but no polygon of that level covers the location |
| `MAP_SOURCE_ID_UNRECOGNIZED` | warning | Features near the location have a source id the engine does not recognize, so their kind is unknown |
| `ROAD_LABEL_POINTS_ONLY` | warning | The road layer holds label points, not a road network |
| `NETWORK_ANALYSIS_NOT_SUPPORTED` | info | Distances are straight lines; travel distance and time are not supported |

`BOUNDARY_UNOFFICIAL` was information in M1 and is a warning from M2: a value that rests on an
unofficial boundary is limited and must be presented with that limit.

## Data port

`SpatialDataPort` is the seam between the engine and wherever the spatial computation runs.
PostGIS is the compute backend in v1 and there is no second geometry library. The port is
read-only by construction, reports its placement (`APP_DATABASE` or `DEDICATED_CONNECTION`), the
versions of PostGIS, GEOS and PROJ it reports, whether the Map's tables can be read through it,
whether its role could write (`roleCanWrite`) and any difference between the Map's tables and the
engine's read contract (`contractProblems`). It never touches the `jenan_map` schema.

`SpatialMapPort` (`map-port.ts`) extends it with four typed questions and nothing else: it has
no method that accepts SQL, a table name or a column name.

| Method | Answers |
| --- | --- |
| `describeMap({ releaseId?, layers })` | The Map's runtime state, the release (the published one unless a release is named), its boundary and, for each layer, the reviewed provenance, the display binding and whether the release holds features |
| `checkGeometries(locations)` | Whether each location is a valid geometry, with PostGIS's reason when it is not |
| `locate({ releaseId, location, levels })` | Where the location lies against the national boundary (full, partial with the covered share, none) and the administrative polygons of each level that intersect it |
| `nearest({ releaseId, layerId, location, kind, rings, limit })` | The nearest features of a kind, searched ring by ring, and the features nearby whose kind cannot be read |

## LOCATION_CONTEXT (M2)

`runSpatialAnalysis(port, request, options)` (`engine.ts`) is the entry point. The clock and the
run id are injected (`clock`, `newRunId`); `budgetUnits`, `allowEvaluatedAtOverride` and
`requireReadOnlyRole` (on by default in production) are chosen by the server. A request for an
analysis that this version does not implement is refused by name with `INVALID_INPUT`. The
result is parsed against `spatialResultSchema` before it is returned; a result that breaks its
own contract is a defect and is never returned (`CONTRACT_VIOLATION`).

### What it produces

For the main location (`primary`) and each candidate. Every metric says `MAPPED_FEATURES_ONLY`
and carries a `spatial-confidence-v1` breakdown when it has a value.

| Metric | Value | Meaning |
| --- | --- | --- |
| `context.within_boundary` | boolean | The whole target lies inside the national boundary of the published release. The boundary is judged as covering the target, so `false` is a value, not a missing one |
| `context.country` | country code | From the boundary record |
| `context.region`, `context.governorate` | label as stored in the Map | The polygon that covers the representative point of the target |
| `context.<level>.boundary_distance` | metres | Geodesic distance from the target to the edge of that polygon |
| `context.<level>.contains_target` | boolean | Areas only: the polygon contains the whole area |
| `context.<level>.intersecting_units` | text | Labels joined with ` \| `, only when two or more polygons intersect the target |
| `context.<place role>.nearest.distance`, `.name` | metres, text | The nearest mapped place of the kind (`place:<kind>`), searched in rings of 500 m, 1, 3, 5, 10, 25 and 50 km up to `maxSearchMeters` (default 5 km). The role `place` accepts any recognized kind and adds `.kind` |

Roles that are not places are ignored by `LOCATION_CONTEXT`. The representative point of an area
is PostGIS's point on its surface and is stated in the limitations with six decimals. Containment
is planar on the stored WGS84 geometry, as the Map's own lookups are, and an edge counts as
covered. Distances are geodesic (geography, metres) and are rounded to 0.1 m.

### Statuses

| Situation | Result |
| --- | --- |
| Exactly one polygon covers the target's point | `COMPUTED`, or `PARTIAL` when an area is only partly inside the national boundary |
| The target lies outside the national boundary | `NO_COVERAGE` for everything except `within_boundary` (which is `false`); nothing is searched |
| Two or more polygons of a level cover the point (a shared edge, an overlap) | `NOT_COMPUTABLE` with `ADMIN_AMBIGUOUS_ON_BOUNDARY`; the candidates are listed in `intersecting_units` |
| Inside the boundary, no polygon of the level covers the point | `NOT_FOUND_WITHIN_RADIUS` with `ADMIN_UNIT_NOT_FOUND` |
| Within 1,000 m of the polygon's edge (or the distance could not be measured) | The value, with `ADMIN_NEAR_BOUNDARY` and the geometry fit lowered to `PROXY` |
| An area intersects several polygons | The polygon of its representative point, `contains_target = false`, `ADMIN_TARGET_SPANS_UNITS` |
| Nothing of the kind within the searched rings | `NOT_FOUND_WITHIN_RADIUS`; never a zero |
| A feature whose kind cannot be read is as near as the best match, or nearer, or the only one | `NOT_COMPUTABLE` with `MAP_SOURCE_ID_UNRECOGNIZED` |
| The spatial backend fails while answering | `NOT_COMPUTABLE` with `BACKEND_UNAVAILABLE`; the failure kind is in the limitation, never the driver's message |
| A layer is missing, empty, or unregistered in production | `NOT_AVAILABLE` with `DATASET_NOT_AVAILABLE` naming the role |

Whole-run refusals (an `EngineError`, before or instead of a result): an invalid request
(`INVALID_INPUT`), a cost above the budget (`REQUEST_TOO_LARGE`), an unsupported analysis, a pin
to the Data Center (not readable yet), a pin to a layer the role is not read from or to something
that is not a release id, an invalid location (`INVALID_INPUT`, naming the target and the reason),
unregistered layers requested in production (`MAP_LAYER_POLICY_VIOLATION`), and a backend that
cannot be used (`BACKEND_UNAVAILABLE` with a `reason`: one of the adapter's failure kinds,
`MAP_CONTRACT_MISMATCH`, `MAP_NOT_REACHABLE` or `ROLE_CAN_WRITE`).

### Registration and the Map-layer policy

A Map layer is registered when the Map is enabled, its release is the one the Map has published,
the release lists reviewed provenance for the layer (all seven provenance members, as the Map
itself requires), and the layer's display binding, if it has one, has not been disabled or marked
unavailable. A layer without a display binding is registered: the governorates of the real
release are a data-only layer. Production reads registered layers only; a layer that is not
registered makes its role `NOT_AVAILABLE`, adds `UNREGISTERED_LAYERS_EXCLUDED` and appears in no
input. Elsewhere an unregistered layer is used, labelled `MAP_UNREGISTERED` with the
`MAP_LAYER_UNREGISTERED` gap and a confidence capped at `MEDIUM`. A request may pin a place role
to another release (`data.roles[role] = { source: "MAP", layerKey: "places", releaseId }`); that
release is read under the same policy. A pin to the published release is no pin.

### Inputs

Each Map layer is described exactly as the Map recorded it: id `map:<releaseId>:<layer>`, the
source, organization, URL, license and attribution of its reviewed provenance (falling back to
the release's own source and license, and saying so), `THIRD_PARTY` ownership, and its coverage
from the boundary record. The engine does not infer anything the Map does not say: the license
class stays undeclared, so `LICENSE_CLASS_UNDECLARED` and `EXPORT_NOT_PERMITTED` apply and
`rights.allowExport` is `false`; completeness is `UNKNOWN`; quality is unavailable (the Map's
bare confidence number has no method or date). The Map declares no freshness period, so the
engine applies documented defaults: 365 days, and 1,825 days for the boundary, regions and
governorates, and each input says the period is the engine's. The 2017 geoBoundaries data is
therefore stale and its measurements are `LOW`; fresh places reach `MEDIUM`; nothing reaches
`HIGH` while quality is unmeasured.

An administrative layer is treated as unofficial unless the boundary record says
`authoritative: true` without `unofficial: true`; silence, a malformed record and any other
combination mean "not official". The Map has no per-layer flag, so the administrative layers
share the boundary's status. The Map's own notice and authority text are quoted in the
limitations.

## The Map read adapter

`services/analysis-engines/spatial/adapters` is the only code of the engine that talks to a
database. It changes nothing in `jenan_map`: no file, no schema, no row.

- **Snapshot.** Every call opens `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, sets
  `statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout` and `search_path`
  with `SET LOCAL`, runs `SELECT 1` so the snapshot exists (a transaction can no longer be
  switched to read-write after that), runs its queries and always rolls back. A connection whose
  state is uncertain is destroyed rather than returned to the pool.
- **Fixed queries.** Every statement is a constant in `queries.ts`: one SELECT, positional
  parameters only, schema-qualified Map tables, geometry predicates on the stored geometry,
  distances on geography, locale-free orderings (`COLLATE "C"`). A unit test reads the file and
  rejects any statement that could write, lock, change a setting, sleep or reach outside the
  database, that interpolates a value, or that names a table or column outside the read contract.
- **Read contract** (`map-contract.ts`). The five tables the engine reads (`runtime`, `release`,
  `boundary`, `release_layer`, `feature`) with their columns and exact PostgreSQL types
  (`geometry(Geometry,4326)`, `geometry(MultiPolygon,4326)`, `jsonb`, ...). `capabilities()`
  compares them with the catalog of the connected database and the engine refuses to run when
  they differ. Four indexes are checked by the tests (the engine is slower, not wrong, without
  them).
- **`sourceId`.** The kind of a place, point of interest or road is not a column: the Map encodes
  it as `<layer>:<kind>:<z>/<x>/<y>/<n>`. The adapter reads it with one strict pattern (in SQL
  and in the TypeScript parser, which must agree) and never splits, loosens or guesses. A feature
  that does not match is counted as unrecognized and stops the ring search; if it is as near as
  the best match, or nearer, the nearest place is `NOT_COMPUTABLE` instead of wrong.
- **Failures** become one of eight kinds (`UNREACHABLE`, `TIMEOUT`, `POSTGIS_MISSING`,
  `SCHEMA_MISMATCH`, `PERMISSION_DENIED`, `READ_ONLY_VIOLATION`, `INVALID_GEOMETRY`, `UNKNOWN`).
  Only the kind and the SQLSTATE travel towards callers; the driver's text, which can name hosts
  and users, stays in `cause`. Rows that are not what the contract says fail closed as
  `SCHEMA_MISMATCH` instead of being coerced.
- **Configuration** (`readOnlySessionConfigSchema`, every value bounded): `connectionString`
  (a secret, never logged), `placement`, `statementTimeoutMs` (default 5,000), `lockTimeoutMs`
  (1,000), `idleInTransactionTimeoutMs`, `connectionTimeoutMs`, `poolMax`, `idleTimeoutMs`,
  `postgisSchema` and `applicationName`. A configuration error names the field, never the value.

### The role the engine reads with

`buildReadOnlyRoleStatements({ role, password, database })` returns the SQL a database
administrator runs once: a login role that is not a superuser and owns nothing, whose sessions
default to read-only with a statement time limit, with `CONNECT` on the database, `USAGE` on
`jenan_map` and the PostGIS schema, and `SELECT` on exactly the five contract tables. All names
and the password are validated, so nothing a caller supplies can become SQL. `capabilities()`
reports `roleCanWrite` (a superuser, a member of `pg_write_all_data`, or any write privilege,
including on a single column, on a contract table). Production refuses such a role
(`ROLE_CAN_WRITE`): a read-only transaction stops an engine statement from writing, but only the
role's privileges stop anything else, and the adapter has no raw-SQL method for the latter to
matter. On PostgreSQL before 15 the operator should also revoke `CREATE` on schema `public` from
`PUBLIC`.

## Tests

- **Unit** (no database): the Map contract and its fixtures, error mapping, the session (with a
  scripted pool), the static SQL checks, the reader, the read-role generator, the input
  descriptors, the Map state, `LOCATION_CONTEXT` and the engine run (with a fake port shaped like
  the real Saudi release), and the boundary rules for adapters.
- **PostGIS** (opt-in). `RUN_SPATIAL_ENGINE_POSTGIS_TESTS=1` and `SPATIAL_ENGINE_TEST_ADMIN_URL`
  (a loopback PostgreSQL with PostGIS); `SPATIAL_ENGINE_REAL_MAP_DB` (the name of the real Map
  database) adds the real Saudi suite. Every database and role they create is named `se_*` and
  dropped afterwards; the real database is only ever the template of a copy.
  - `spatial-engine-adapter.integration.test.ts`: the contract against the Map's own migrations,
    the read-only role, fifteen write routes refused, the snapshot, time limits, PostGIS or the
    Map missing, contract drift, unreachable server, and eight changed `sourceId` formats.
  - `spatial-engine-synthetic.integration.test.ts`: a Map built through the Map's release state
    machine with hand-worked geometry, in development and production, over Map runtime states, and
    proving that a run changes nothing even over a role that could write.
  - `spatial-engine-real-saudi.integration.test.ts`: production mode on a copy of the real
    release; the engine compared with independently written SQL on real points; the contract and
    `sourceId` conformance of the real data; a real `sourceId` corrupted on the copy.

## Performance (measured on the development machine, real release, production mode)

Median of five warm runs on one pool, in milliseconds: a point with the administrative context 56;
the same with three place roles 162; a 20 km area 151; a 2° x 2° area 199; the main location and
five candidates 256. The first run on a cold database takes about 400 ms. Runs measured while the
machine was loaded were up to ten times slower, so these figures are a baseline for the M7
performance gate, not a promise. The heaviest case is an area that holds many places (the
nearest-place search ranks them all); the statement timeout fails it safe.

## Known limits

- The Map has no index on `layerId`; the layer checks scan the release's features (about 80 ms on
  the real release). The Map's schema must not change for the engine, so this is a
  recommendation to the Map.
- The freshness periods are engine defaults, not Map declarations.
- Before M4 the number of metrics per result entry must be bounded for requests with many roles
  and many nearest features (the schema allows 500).
- The cost weights remain provisional until M7.
- CodeQL runs only for pull requests into `main`; its trigger needs to include
  `jenan-engines/integration` for the closure gate.

## Milestones

| Milestone | Content | State |
| --- | --- | --- |
| M1 | Shared core, contracts, states, gaps, confidence policy, canonical hashing, cost estimator, request normalization, Map layer policy, geometry pre-checks, port seam, unit tests | Done |
| M2 | Read-only Map adapter over PostGIS, a Map read contract test, `LOCATION_CONTEXT` | Done |
| M3 | Data Center discovery and content read functions (on the engines branch only) and the provider | Planned |
| M4 | `PROXIMITY` and `CATCHMENT` | Planned |
| M5 | `AnalysisEngineRun` models and additive migration, audit, admin acceptance route (no UI) | Planned |
| M6 | `DENSITY`, `CONSTRAINT_SCREENING`, `SITE_COMPARISON` | Planned |
| M7 | Real-data performance, documentation, closure gate | Planned |

### Closure gate

lint, typecheck, unit tests, PostGIS integration tests, Data Center integration tests, build,
Sonar, CodeQL, Copilot review and performance. Then a pull request into
`jenan-engines/integration` (not `main`), a merge commit and the tag
`JENAN-PRO-SPATIAL-ENGINE-V1.0`. CodeQL currently runs only for pull requests targeting `main`,
so its trigger needs to include the integration branch for this gate.
