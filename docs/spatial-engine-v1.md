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
| `SITE_COMPARISON` | Common-source measurements, min-max normalization and descriptive numeric ordering; no preference or business verdict |

Left out of v1 on purpose, and listed in every result under `capabilities.excluded`: route and
travel time, driving distance, terrain, geocoding, AI recommendations, and financial or
business recommendations. All distances are straight-line distances on the Earth's surface.

The engine never says a location is good or bad and never says what to do. It states facts and
the limits of the data behind them. Interpretation belongs to the later engines and the final
decision to the Risk & Decision Engine.

M6 implements all six analyses. Availability remains a per-source, per-target decision:
implementing an analysis does not create the production data it needs.

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
| `data` | Optional selections of a role from the Data Center (an exact version, or a type as of an instant) or from a Map layer |
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

**Selecting data for a role** (`data.roles[role]`) takes one of three forms and nothing else:

| Form | Meaning |
| --- | --- |
| `{ source: "DATA_CENTER", versionId }` | That exact published version. It is used as given and never replaced by another |
| `{ source: "DATA_CENTER", typeKey, asOf? }` | The preferred published version of that type in force as of `asOf` (the evaluation instant when it is omitted), chosen by the Data Center's written selection policy (below) |
| `{ source: "MAP", layerKey, releaseId? }` | A Map layer, optionally of a named release |

A Data Center selection names a version or a type, never both, and an exact version has no
`asOf`. `typeKey` has the Data Center's own shape (`geojson`), `asOf` is a UTC instant, and
nothing else (no query, no geography of the caller's own) is accepted; the place the analysis is
about narrows a type selection from the request's locations when the data is resolved.

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

The instant a Data Center type is selected as of (`asOf`) is written in one canonical form
(`2026-06-01T00:00:00.000Z`), so two spellings of the same instant are the same request with the
same hash. It cannot be later than the evaluation instant (with the same minute of clock
tolerance): a selection "as of" a time that has not come selects nothing that was in force. A
replay that pins an earlier evaluation instant holds the selection to that instant.

`prepareSpatialRequest` normalizes, bounds the total output across all analyses and targets
(including comparison derivatives) to 500 metrics, estimates cost and refuses an oversized
request before any backend read (`REQUEST_TOO_LARGE`). A server budget increase never bypasses
the metric ceiling.

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

Resolving a Data Center selection has no separate cost component: the requested analysis prices
the work, and `PROXIMITY` and `CATCHMENT` account for their bounded reads above. Dataset feature
and request limits bound the work; exceeding the result metric ceiling is rejected before any
backend is read.

## Gaps

The shared gaps plus twenty-one of its own, all bilingual and worded as facts:

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
| `DATA_CENTER_NOT_IN_FORCE` | blocking | Datasets of the type exist but none was in force as of the instant |
| `DATA_CENTER_CONTENT_INVALID` | blocking | The selected version is not valid WGS84 GeoJSON (the Data Center's own code is stated); nothing was repaired |
| `DATA_CENTER_INTEGRITY_FAILED` | blocking | The stored checksum does not match the stored content |
| `DATA_CENTER_PIN_CHANGED` | blocking | The content is not the one expected; it was not replaced by another version |
| `DATA_CENTER_VERSION_NOT_SPATIAL` | blocking | The selected version is not spatial (GeoJSON) data |
| `DATA_CENTER_TOO_MANY_CANDIDATES` | blocking | So many datasets of the type match that a choice would rest on part of them; none was selected |
| `DATA_CENTER_COMPETING_DATASETS` | info | Other datasets of the type were in force; the one chosen and the policy that chose it are stated (a lower bound, `19+`, when the Data Center's listing was cut) |
| `MAP_DATA_CENTER_BINDING_REFUSED` | warning | A Map layer's reference to the Data Center was not accepted, so the layer is unregistered and its rights and quality are not taken from the Data Center |
| `MAP_DATA_CENTER_BINDING_CHANGED` | info | The Data Center changed what it states about the version a layer is bound to; its current statements are used |

A dataset that is unavailable, has no coverage or cannot be reached uses the shared codes
`DATASET_NOT_AVAILABLE`, `NO_COVERAGE` and `BACKEND_UNAVAILABLE` (backend `DATA_CENTER`).

`BOUNDARY_UNOFFICIAL` was information in M1 and is a warning from M2: a value that rests on an
unofficial boundary is limited and must be presented with that limit.

## Data port

`SpatialDataPort` is the seam between the engine and wherever the spatial computation runs.
PostGIS is the compute backend in v1 and there is no second geometry library. The port is
read-only by construction, reports its placement (`APP_DATABASE` or `DEDICATED_CONNECTION`), the
versions of PostGIS, GEOS and PROJ it reports, whether the Map's tables can be read through it,
whether its role could write (`roleCanWrite`) and any difference between the Map's tables and the
engine's read contract (`contractProblems`). It never touches the `jenan_map` schema.

`SpatialMapPort` (`map-port.ts`) extends it with six typed questions and nothing else: it has
no method that accepts SQL, a table name or a column name.

| Method | Answers |
| --- | --- |
| `describeMap({ releaseId?, layers })` | The Map's runtime state, the release (the published one unless a release is named), its boundary and, for each layer, the reviewed provenance, the display binding and whether the release holds features |
| `checkGeometries(locations)` | Whether each location is a valid geometry, with PostGIS's reason when it is not |
| `locate({ releaseId, location, levels })` | Where the location lies against the national boundary (full, partial with the covered share, none) and the administrative polygons of each level that intersect it |
| `nearest({ releaseId, layerId, location, kind, rings, limit })` | The nearest features of a kind, searched ring by ring, and the features nearby whose kind cannot be read |
| `countFeatures({ releaseId, layerId, location, kind, radiiMeters })` | Mapped and unrecognized feature counts for each requested radius |
| `measureDataset({ features, location, radiiMeters, maxSearchMeters, nearestCount, includePopulation })` | Validates and measures a bounded Data Center feature set: nearest features, catchment counts and, when enabled, area-weighted population |

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
| `context.<place role>.nearest.distance`, `.name`, `.feature_ref` | metres, text, text | The nearest mapped place of the kind (`place:<kind>`), searched in rings of 500 m, 1, 3, 5, 10, 25 and 50 km up to `maxSearchMeters` (default 5 km). The role `place` accepts any recognized kind and adds `.kind`. `.feature_ref` is the place's reference (below) |

Roles that are not places are ignored by `LOCATION_CONTEXT`, whether they select a Map layer or a
Data Center dataset: `PROXIMITY` and `CATCHMENT` resolve their selected sources in M4.
A Data Center selection for a *place* role is refused, not ignored (see Whole-run refusals): the
places of `LOCATION_CONTEXT` come from the Map, and a dataset that was asked for is never
silently replaced by Map data. The representative point of an area
is PostGIS's point on its surface and is stated in the limitations with six decimals. Containment
is planar on the stored WGS84 geometry, as the Map's own lookups are, and an edge counts as
covered. Distances are geodesic (geography, metres) and are rounded to 0.1 m.

### Naming a place: the feature reference

A name does not identify a place: the real Map holds 34 neighbourhoods called «الورود». Every
nearest place therefore carries a stable reference, and consumers must identify it by the
reference and never by the name:

`map:<releaseId>:feature:<featureId>`

Both parts are the Map's own UUIDs in their canonical lower-case form (the feature's `id` and the
`id` of the release the figure was read from, which is the pinned release when a role is pinned).
The reference is scoped by the release, whose features are not changed once it is published, so it
keeps pointing at the same feature. It carries no source id, no tile address and no label, and
nothing else about the Map's internals is exposed. It has the same status, evidence and confidence
as the name, and it is valueless (never invented) exactly when the name is.

The contract enforces it: a metric whose key ends in `.feature_ref` must hold a well-formed
reference whose release is one of the Map releases the metric rests on (`inputRefs`), otherwise the
result is not valid. A nearest feature whose id is not a canonical Map id is a changed Map and
makes the answer `NOT_COMPUTABLE` instead of being named anyway. Features at exactly the same
distance are taken in a fixed order (the id, compared bytewise, independent of the database
locale), so the nearest of several that tie is always the same one.

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
(`INVALID_INPUT`), a cost above the budget (`REQUEST_TOO_LARGE`), an unsupported analysis, a Data
Center selection for a place role (`data_center_pin_for_map_role`: places are read from the Map,
and Map data is never silently used in place of a dataset that was asked for), a pin to a layer the role is not read from or to something
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

`services/analysis-engines/spatial/adapters/postgis-map-reader.ts` and its session are the only
code of the engine that talks to a database. They change nothing in `jenan_map`: no file, no
schema, no row. (The Data Center provider in the same directory talks to the Data Center's read
services, never to a database; see the next section.)

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

## The Data Center provider (M3)

M3 builds the engine's data source: how a dataset is found in the Data Center and read, exactly
and deterministically, under the Data Center's own access policy. M4 uses this machinery for
`PROXIMITY` and `CATCHMENT`.

### What was added to the Data Center, and where

Three read functions and two pure helpers, in `services/data-center/`, **on the engines branch
only**: no migration, no schema change, no change to an existing Data Center file, nothing on the
frozen baseline `jenan-data-center/integration@04d6148`.

| Function | Does |
| --- | --- |
| `discoverDataCenterVersions` (`discovery.ts`) | Metadata of published versions, never their content: dataset, version and its SHA-256, source, ownership, license class, usage policy, attribution, coverage, quality, freshness, publication (the Data Center's Map contract `DataCenterMapReference`) |
| `readDataCenterVersionContent` (`version-content.ts`) | The content of exactly one published version, verified |
| `resolveDataCenterMapReference` (existing) | What the Data Center says now about one version, used for Map releases (below) |
| `computeDataCenterVersionChecksum` (`version-checksum.ts`) | Recomputes a version's SHA-256 exactly as `service.ts` composes it |
| `rankVersions` (`version-selection.ts`) | The selection policy below |

### Access: the existing policy, unchanged

Both new functions use `accessiblePublishedVersionWhere` verbatim, so a caller sees exactly what
retrieval shows it: an administrator everything that is published and in force; a person the
platform's data, their own private sources and the organization sources where they are an active
owner or hold `data-center.read` (and a version's `requiredPermission`); a robot only the sources
it holds an unrevoked, unexpired `READ` grant for, matching its principal, robot, role, specialty
and mission, and only while it is assigned to that mission. Everywhere: the source's retrieval
switch, validity windows, no open conflict, evidence not conflicted, item not archived, and only
the item's published version. A version restricted to a specialty or mission context is visible
only to a caller that names it (`specialty`, `missionContext` of the provider).

**No existence oracle.** A version that is forbidden, hidden, unpublished, superseded, expired,
archived, not yet effective or nonexistent, and a robot that holds no grant, all get one answer in
one shape: discovery lists the id as unavailable without a reason, the content read raises
`PUBLISHED_VERSION_NOT_FOUND` (404, identical message), and the provider reports `NOT_AVAILABLE`.
Nothing is written: no usage record, no audit entry, no event.

### Choosing a version: `dc-version-selection-v1`

An exact version (`versionIds`) is used as given. A type (`typeKeys`) as of an instant (`asOf`) is
chosen by one written, fixed policy; the same request, instant and available versions always give
the same version.

- **In force as of an instant**: published by then (the latest `PUBLISHED` event; an unknown
  publication date is excluded), its source date not after the instant, effective by then, and
  neither its effective period nor its expiry ended.
- **Without `asOf`** nothing is compared with a clock: the Data Center's access policy alone
  decides what is served, as retrieval does. (Comparing the publication time with the caller's
  clock made a version published at that very moment look unpublished, which a real-database
  test found.)
- **Preference** among the versions in force: the later source date (an unknown one last), then
  the later publication date (unknown last), then the smaller version id compared by code point.
  The last rule is a fixed tie-break, independent of the order the database returns rows in. The
  version "latest now" is never used when an instant is given.
- A version's reason for not being in force is reported (`NOT_PUBLISHED_AT_AS_OF`, ...).
- Caps: more than 2,000 rows or 500 candidates is `TOO_MANY_CANDIDATES` (refused, never cut); the
  listing holds up to 20 versions in force and says when it was cut (`truncated`).

`asOf` only narrows what the Data Center serves today. Only an item's published version is
retrievable, so a superseded version is not served for a past instant either, and the newer
version is never returned in its place.

**Geography** uses the structured coverage the Data Center stores, never geometry (no PostGIS in
the Data Center): country codes, region codes and a WGS84 box. Every filter given must hold, boxes
that touch intersect, and a version whose coverage was never declared matches no geographic filter
(unknown is never turned into "everywhere"). `NO_COVERAGE` (datasets of the type exist, none
covers the place) is told apart from `NOT_AVAILABLE` (nothing readable exists). The engine derives
the filter from the request's locations (`targetGeography`: the box of every target widened by
the distance searched).

### Reading one version

`readDataCenterVersionContent` reads one version after the access check, and then:

1. recomputes the stored checksum from the stored columns and refuses on a difference
   (`VERSION_CHECKSUM_MISMATCH`), returning nothing of the content;
2. refuses a pinned `expectedChecksum` that is not the version's (`EXPECTED_CHECKSUM_MISMATCH`);
3. for a dataset of type `geojson`, validates the content as WGS84 GeoJSON with the Data Center's
   own validator (no `crs`, positions in range, closed rings, structure limits, at most 10,000
   features) and refuses invalid content with the validator's code (422); nothing is repaired;
4. `require: "GEOJSON"` refuses a dataset that is not spatial (`CONTENT_NOT_SPATIAL`).

There is no fallback to another version, ever. Topological validity (self-intersections and the
like) is decided by PostGIS before any M4 measurement; invalid geometries are not repaired.

### The port and the provider

The engine never reads a Data Center table. `SpatialDataCenterPort` (`data-center-port.ts`) has
three read-only questions: `discover(selection)`, `readContent({ versionId, expectedChecksum? })`
and `resolveMapReference(versionId)`. Expected states are outcomes, not exceptions:
`NOT_AVAILABLE`, `INTEGRITY_FAILED`, `PIN_CONTENT_CHANGED`, `NOT_SPATIAL`, `CONTENT_INVALID`
(with the Data Center's code, and only a code). An exception, `DataCenterProviderError` (kind
`UNAVAILABLE` or `UNKNOWN`, the original in `cause`, never its message), means the Data Center
could not be asked at all.

`createDataCenterProvider({ actor, now, specialty?, missionContext? })`
(`adapters/data-center-provider.ts`) implements it by calling the three Data Center services and
nothing else. It has no access policy of its own, imports no database layer, Prisma or driver
(a static test, and a unit test that fails if it touches `db`), and reads no clock: `now` is only
what the Data Center states freshness at and defaults `asOf` to.

### Resolving what a request selected

`dataSourceRequestsOf(roles, { geography })` turns the Data Center selections of a normalized
request into resolver requests, in role order (an exact version is never narrowed by place).
`resolveSpatialDataSources({ requests, port, evaluatedAt })` then, role by role: discovers; reads
the content **with the discovered checksum pinned**; verifies that the version and checksum read
are the ones selected (otherwise `PIN_CONTENT_CHANGED`, with no fallback); checks the features of
the dataset (`checkDatasetFeatures`: a dataset is used whole or not at all, so no feature, more
than 10,000, a feature without geometry, or a geometry collection refuses the whole dataset);
and builds the input descriptor. Roles that resolve to the same version share one input.

The result lists, per role, a status (`RESOLVED`, `NOT_AVAILABLE`, `NO_COVERAGE`, `NOT_IN_FORCE`,
`TOO_MANY_CANDIDATES`, `INTEGRITY_FAILED`, `PIN_CONTENT_CHANGED`, `NOT_SPATIAL`, `CONTENT_INVALID`,
`BACKEND_UNAVAILABLE`), a trace of how the dataset was chosen (mode, policy, instant, discovery
status, the version selected, the versions in force, those that were not and why), and its gaps.
When several datasets were in force the choice is reported (`DATA_CENTER_COMPETING_DATASETS`).

The input descriptor (`data-center-inputs.ts`) states what the Data Center states and nothing
else: id `dc:<versionId>`, the SHA-256, the source, ownership, license, license class, usage
policy, attribution, whether export is permitted, evidence status, quality (measured, or
unavailable, with its method, method version and date), coverage and freshness (recomputed at the
run's instant, never at "now"). The license class stays undeclared when it is undeclared; the
Data Center does not record completeness, so it is `UNKNOWN`; the Data Center's own resolved time
and confidence number are not copied.

### Map references

A Map release can keep a binding to a Data Center version (`DataCenterMapBinding`: the release
and layer ids, the artifact's digest, and the snapshot of the Data Center's reference). The Data
Center remains the source of truth for rights, ownership, source, attribution, quality and
freshness; the Map remains the source of truth for the artifact and its geometry; no foreign key
links them. `reconcileMapBinding` (`map-data-center.ts`) parses the binding with the Data Center's
own schema, checks it was kept for this release and layer, asks for exactly the version it names
through `resolveDataCenterMapReference`, and compares the answer with the snapshot using the Data
Center's `assessMapBinding`. The result is `RECONCILED` or `NOT_REGISTERED` with one of
`BINDING_INVALID`, `BINDING_FOR_ANOTHER_LAYER`, `VERSION_UNAVAILABLE`, `INCONSISTENT` or
`BACKEND_UNAVAILABLE`. `applyMapBinding` then gives a reconciled layer the Data Center's
*current* statements (the snapshot is only compared), keeps the Map's identity, reference and
artifact digest, uses the Data Center's declared coverage (the Map's extent only when the Data
Center declares none), and makes a refused layer unregistered. A binding can only enrich a layer or
take its registration away; it never grants it. The real Map records no binding yet, so the
engine run does not call this; it is a tested capability, ready for the Map to store one.

### Usage

`buildDataCenterUsageIntents` derives, from the inputs of a finished result only, what the Data
Center's usage record needs (version, SHA-256, consumer `analysis-engine:spatial`, purpose, roles).
It is **prepared, not written**: the permanent record belongs with the run record (M5), in the
same step, so a failed run leaves no usage behind.

## PROXIMITY and CATCHMENT (M4)

Each requested analysis runs independently for the main location and every candidate. The result
contains only analyses that were requested. A role uses the Map by default or exactly the data
source it selected; an unavailable Data Center version is never replaced silently by Map data.
Selections for roles not read by the requested analyses are neither resolved nor listed as inputs.

`PROXIMITY` reports a bounded set of nearest features per feature role, searched through the
configured distance rings. It reports straight-line geodesic distance, a name and, for Map
features, a release-scoped feature reference. An unreadable Map source id can make a result
`NOT_COMPUTABLE`; the engine does not guess the feature kind.
When the target is outside a source's declared coverage, proximity metrics report `NO_COVERAGE`
even if a spatial query happens to return a nearby feature.

`CATCHMENT` counts mapped features by role and radius. These describe the selected dataset, not
a complete real-world inventory. A zero in data whose completeness is unknown or sample-based is
not reported as a factual zero; an out-of-coverage count is `NO_COVERAGE`, not zero. A population
role is only measured from a selected Data Center dataset whose features are polygons with a
non-negative integer `population` property. The
estimate weights each polygon's population by the share of its area intersecting the radius,
which assumes population is distributed uniformly within each polygon. Such a result is always
`ESTIMATED`, carries that limitation, and includes `POPULATION_AREA_WEIGHTED_ESTIMATE`; unsupported
population schemas produce no estimate.

Data Center geometries are checked by PostGIS before measurement. Invalid geometry yields no
distance, count or population measurement. Since M6 the entire run is limited to 500 metrics;
the engine rejects a request that would exceed the ceiling before reading a backend and never
truncates requested results.

### Decision for the owner: selections that the current analysis cannot read

`LOCATION_CONTEXT` reads places from the Map only. When it is requested, a Data Center selection
for a *place* role is therefore refused (`data_center_pin_for_map_role`) rather than silently
replaced by Map data. `PROXIMITY` and `CATCHMENT` resolve the selected feature and population
sources. A selection for a role no requested analysis reads is neither resolved nor listed; it
remains part of the normalized request and its hash.

## Tests

- **Unit** (no database): the Map contract and its fixtures, error mapping, the session (with a
  scripted pool), the static SQL checks, the reader, the read-role generator, the input
  descriptors, the Map state, `LOCATION_CONTEXT` and the engine run (with a fake port shaped like
  the real Saudi release), and the boundary rules for adapters. M3 adds: the checksum
  recomputation and the selection policy (`version-checksum`, `version-selection`: 41), the
  Data Center input descriptors, dataset checks, resolution and prepared usage with a fake port,
  the provider with the Data Center's three services replaced (requests, one answer for every
  refusal, outcome per error, zero database access), the request contract and normalization of
  Data Center selections, and the Map binding reconciliation with a fake port.
  M4 adds Map and Data Center feature routing, no-fallback behavior, proximity and catchment
  metrics, population-estimate labeling, coverage and result-ceiling checks, plus invalid-geometry
  guards for the fixed PostGIS statements.
- **Data Center integration** (opt-in, real migrated PostgreSQL, every test in a transaction
  that is always rolled back): `DATA_CENTER_DATABASE_TESTS=1` and a `DATABASE_URL` that points at
  a database migrated from scratch.
  - `data-center-discovery.integration.test.ts` (24): exact versions and no substitution, the
    same answer for every kind of unavailable version, conflicts, platform, private,
    organization, permission, robot-grant, specialty and mission access, selection, tie-break,
    `asOf` and validity windows, unknown publication dates, limits, geography, quality, rights,
    determinism and no writes.
  - `data-center-version-content.integration.test.ts` (38): the verified read, a drift guard that
    creates versions through the real service in 13 shapes and recomputes each checksum, nine
    tampering cases and lineage, fifteen invalid GeoJSON forms, access for people, organizations
    and robots, and no writes.
  - `spatial-data-center-provider.integration.test.ts` (32): the provider and the resolver on
    real data: an exact pin, access (people, organizations, robots with and without a grant,
    revoked, unassigned, other specialty), every kind of unavailable version, selection by type
    and as of an instant, competing versions and the tie-break, a cut listing, geography, invalid
    GeoJSON, a tampered version, no fallback to a newer version or to the runner-up, requests
    taken through normalization and resolution, a Map release bound to a version (reconciled,
    superseded, hidden, changed since the snapshot, tampered), and no writes.
- **PostGIS** (opt-in). `RUN_SPATIAL_ENGINE_POSTGIS_TESTS=1` and `SPATIAL_ENGINE_TEST_ADMIN_URL`
  (a loopback PostgreSQL with PostGIS); `SPATIAL_ENGINE_REAL_MAP_DB` (the name of the real Map
  database) adds the real Saudi suite. Every database and role they create is named `se_*` and
  dropped afterwards; the real database is only ever the template of a copy.
  - `spatial-engine-adapter.integration.test.ts`: the contract against the Map's own migrations,
    the read-only role, fifteen write routes refused, the snapshot, time limits, PostGIS or the
    Map missing, contract drift, unreachable server, and eight changed `sourceId` formats.
  - `spatial-engine-synthetic.integration.test.ts`: a Map built through the Map's release state
    machine with hand-worked geometry, in development and production, over Map runtime states,
    M4 Map counts and Data Center measurements (including invalid geometry), and proving that a
    run changes nothing even over a role that could write.
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

### M7 bounded workload acceptance

The real Saudi suite now also enforces explicit thresholds for density and comparison on a
read-only scratch copy of the existing published release. It warms one reader pool, measures
10 sequential density runs, then 12 runs in three batches of four concurrent callers. Every
answer must retain the same determinism hashes and 13 metrics. The nearest-rank p95 must be
below 5,000 ms sequentially and 10,000 ms at concurrency four. No timeout, pool size, metric cap,
feature cap or server budget is raised to make the test pass.

The maximum-candidate case uses 20 candidates plus the primary location, one common hospital
source and one 5 km radius, with density and site comparison. Both repeated runs must emit
441 metrics with identical determinism hashes and finish below 15,000 ms each. These are
local acceptance ceilings, not production throughput or availability promises. The fixture
does not manufacture a population or constraint source.

An isolated run on 2026-10-21 measured sequential p95 **279 ms**, concurrent p95 **538 ms**,
and maximum-candidate runs **1,763 / 1,886 ms**, on release
`b3c4b6ff-7cee-4b42-95d3-c3683cf88a34`. The full-suite rerun is reported separately at
closure; measurements vary with host load.

The final complete three-file PostGIS rerun passed **130/130** tests using Vitest's thread
pool with a single worker. Its sequential density p95 was **117 ms**, concurrent p95
**173 ms**, and maximum-candidate runs **1,070 / 1,205 ms**. The existing three-site Riyadh
acceptance took **470 / 330 ms**. Earlier attempts encountered transaction/statement timeouts
and then Windows fork/temp-cache initialization errors. The complete PostgreSQL suite passed
on a sequential rerun and the complete PostGIS suite passed with the thread runner; no
application timeout or acceptance threshold was increased and no test was excluded.

The existing `spatial-cost-v1@1.2.0` weights and request/data limits are retained, not
reinterpreted as milliseconds. The cost estimate is a deterministic admission heuristic;
measured latency also depends on feature distribution, topology and host contention. The
500-metric preflight, 10,000-feature analytical cap, 20-candidate bound, read-only pool and
statement/lock/connection timeouts remain the independent work/safety limits. Real dense
population and constraint datasets still need their own performance qualification when
available; this acceptance makes no national-scale SLA claim.

## DENSITY, CONSTRAINT_SCREENING and SITE_COMPARISON (M6)

These capabilities remain inside the engine and its read-only PostGIS adapter. No Map or
Data Center table, migration or service is changed. M5 persistence captures their source versions,
hashes, per-role selection and usage in the same append-only history. Historical replay uses
the same measured-role selection for all analyses, including constraint roles; no current-version
discovery or fallback is added.

### Density

For each feature role and radius, `density.<role>.r<metres>.count` is the observed number of
features within geodesic distance of the target, and `.per_km2` divides that count by the
geodesic area of the buffered target. For an area target this is its buffer, not just a circle
around a centroid. Radii retain their common request values across sites.

At the largest radius, `.grid.occupied_cells` and `.grid.max_cell_count` summarize a square
grid of point observations. `.cluster.count`, `.cluster.largest` and `.cluster.noise` summarize
`ST_ClusterDBSCAN` using the requested epsilon and minimum point count. Both methods operate
in a target-centred WGS84 azimuthal equidistant metre projection. Cell keys are
`floor(x / cellMeters), floor(y / cellMeters)` with the target anchor at the origin. DBSCAN's
window order is the immutable feature identifier (Data Center content index when no Map id is
involved), compared bytewise. This is local clustering, not a nationwide market inventory.
The output is bounded summaries, not cell geometries or cluster membership exports.

Lines, polygons and multipoints can be counted by radius, but are never silently converted to
representative points for grid/cluster analysis: those metrics are `NOT_COMPUTABLE` with
`DENSITY_POINTS_REQUIRED`. The SQL rejects invalid, empty, out-of-range or wrong-SRID features
before measurement. It reads at most 10,001 candidate features; more than 10,000 refuses the
analysis with `RESULT_TRUNCATED`, rather than clustering or reporting a partial sample as a
successful calculation. Existing statement timeouts still apply.

### Constraint screening

Constraint roles select Data Center geometry; the frozen Map contract has no constraint layer.
For each role the engine emits intersection count (`ST_Intersects`), target containment count
(`ST_Covers`), overlap area, bounded nearest distance and counts within every requested radius
(`ST_DWithin`). Overlap is the geodesic area of the **union** of polygon intersections, avoiding
double counting overlapping constraints. Area overlap is unavailable for point targets;
nearest distance is straight-line and bounded by `maxSearchMeters`.

These are spatial facts only, never legal conclusions or an assurance that a site is clear.
Without a usable source, metrics are null `NOT_AVAILABLE`; out-of-extent targets are null
`NO_COVERAGE`, and expensive measurement is skipped. Current Map sample data is not a source of
legal constraint polygons.

### Coverage, zeros, confidence and comparison

Exact pins are checked for each target before measurement. Each radius is also checked against
the declared bounding box; an extent that does not establish full search coverage cannot prove
a zero. A zero for count/density/grid/cluster/constraint absence is returned only for a declared
`INVENTORY` that covers the relevant search. Otherwise zero becomes null `NOT_COMPUTABLE` with
an explicit gap. Positive observations from `SAMPLE`/`UNKNOWN` or incomplete search coverage
are `PARTIAL`. Data Center completeness remains `UNKNOWN`; the engine never invents inventory
metadata. Positive constraint distance zero means an observed contact, not absence.

Every valued M6 metric uses `spatial-confidence-v1` and retains input references, limitations,
a method identifier and the normal input-level source/version/hash/rights/export/attribution
envelope. M6 observed constraint measurements also retain the non-inventory confidence cap;
successful geometry arithmetic never upgrades sample completeness.

Comparison permits the existing maximum of **20 candidates plus the primary target**. It
resolves a role's source once, then applies identical radii and parameters to every target.
For each numerical base metric it emits `comparison.<base-key>.normalized` (unitless `RATIO`,
min-max in [0, 1], equal values map to 0.5) and `.rank` (`ORDINAL`, descending numerical order,
ties broken by target id). These additive shared metric kinds are not business scores. There
is no combined rank, recommendation, preferred site or success probability.

A comparison is refused for that entire metric group if any site has no value, a different
input/method/unit, or lacks established coverage for the relevant search. It emits null
`NOT_COMPUTABLE` derivatives and `SITE_METRIC_NOT_COMPARABLE`; it does not silently drop an
unavailable site. Comparison confidence is the weakest contributing confidence band and score,
never a bonus for normalization. Each site's underlying results and target-scoped gaps remain
available in the same run.

No new migrations or external services are required. Tests distinguish synthetic geometry on
real PostGIS, real migrated PostgreSQL persistence/replay, and actual Saudi Map acceptance.
Missing real constraint/population data remains an acceptance gap, not a synthetic success.

## Known limits

- The Map has no index on `layerId`; the layer checks scan the release's features (about 80 ms on
  the real release). The Map's schema must not change for the engine, so this is a
  recommendation to the Map.
- The freshness periods are engine defaults, not Map declarations.
- M6 rejects requests whose conservative total output bound exceeds 500 metrics across all
  targets, analyses and comparison derivatives; it does not truncate results.
- M7 retains the cost weights as an admission heuristic, not a latency prediction; the
  measured workload and remaining production-data qualification limits are documented above.
- A Data Center dataset's completeness is `UNKNOWN`: the Data Center does not record it, so a
  count from it is never presented as an inventory.
- Data Center content is validated structurally (WGS84, ranges, closed rings, limits); topological
  validity is decided by PostGIS before M4 measurement.
- An exact Data Center version is never replaced by a geographic alternative; M6 checks its
  declared extent against each target before measurement and checks search coverage before
  stating a confirmed zero or ranking comparable metrics.
- Ordinary Data Center discovery serves published versions only. M5's separately authorized
  internal historical reader can replay an exact saved superseded version, never a fallback.
- The Map records no binding to a Data Center version yet, so the reconciliation is a tested
  capability that the engine run does not call.
- CodeQL's automatic push/PR triggers target `main`. Its existing `workflow_dispatch` supports
  explicit branch acceptance without a merge, PR or trigger change.

## Milestones

| Milestone | Content | State |
| --- | --- | --- |
| M1 | Shared core, contracts, states, gaps, confidence policy, canonical hashing, cost estimator, request normalization, Map layer policy, geometry pre-checks, port seam, unit tests | Done |
| M2 | Read-only Map adapter over PostGIS, a Map read contract test, `LOCATION_CONTEXT` | Done |
| M3 | Data Center discovery and content read functions (on the engines branch only), the provider, deterministic version selection, request selections, Map reference reconciliation, prepared usage | Done |
| M4 | `PROXIMITY` and `CATCHMENT` | Done |
| M5 | Append-only run/input/usage persistence and authorized exact historical replay, no public history discovery | Closed at `f09aedc` |
| M6 | `DENSITY`, `CONSTRAINT_SCREENING`, `SITE_COMPARISON` | Closed at `faba3a7` |
| M7 | Real-data performance, bounded concurrency/max-candidate acceptance, documentation, closure gate | OPEN: local gates passed; approved Sonar Server/Cloud quality gate pending |

### Closure gate

lint, typecheck, unit tests, PostGIS integration tests, Data Center integration tests, build,
Sonar, CodeQL, Copilot review and performance. Record the scope and evidence for each gate;
IDE diagnostics alone are not evidence of a server-side Sonar quality-gate status.

The owner's M7 authorization explicitly prohibits a merge, a final tag or starting the next
engine. Final acceptance produces a report for review on `jenan-engines/spatial` only. A later
pull request/merge into `jenan-engines/integration` (never `main`) or a final
`JENAN-PRO-SPATIAL-ENGINE-V1.0` tag requires a separate explicit authorization. M7's
validation-only changes do not change the accepted M6 runtime version or invalidate its
persisted run/replay provenance.

### M7 acceptance checkpoint (2026-10-21; not engine closure)

- Spatial/shared units: **1,108/1,108**, 33 files.
- Real Data Center/PostgreSQL: **138/138**, eight files, on an independent fresh database
  after all **78** approved migrations. No schema/migration change was needed. Rollback
  verification left no run/input/item/source fixtures; append-only triggers were enabled.
  Only that disposable database was dropped afterwards.
- Full PostGIS: **130/130**, three files, including the actual Saudi release acceptance
  and the new measured M7 workload. Synthetic constraint/population tests are not described
  as real-data acceptance; those actual production datasets are still unavailable.
- TypeScript, ESLint, production build (163 static pages) and `git diff --check`: passed.
  The six unrelated lint warnings, four existing build tracing warnings and the existing
  PostgreSQL driver's concurrent-query deprecation warning remain disclosed.
- CodeQL: existing workflow explicitly dispatched on `jenan-engines/spatial`, run
  [39540990106](https://github.com/Jenan21/jenanbiz1-git/actions/runs/39540990106), at
  `faba3a7b8d69c47511c466e13357886a56a77708`; JavaScript/TypeScript and Actions analyses
  completed successfully. The branch had no open code-scanning alerts when checked.
  A checkpoint commit containing the new tests/docs needs its own dispatched run.
- Copilot read-only review of Spatial/shared, persistence/replay and the new performance
  acceptance: no significant issues reported. This is review evidence, not a formal proof.
- Sonar: IDE file analysis was triggered for core paths, but this is **not** a verified
  Server/Cloud quality gate. The owner explicitly chose to keep M7 **OPEN** until the approved
  Sonar Server/Cloud gate is provided. It must not be silently replaced with IDE diagnostics.
- The frozen Map/Data Center baselines, Projects UI, `main` and previous unrelated work
  remain untouched. No merge, final tag or second-engine work is authorized or performed.
