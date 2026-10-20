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

Shared gaps plus four of its own: `DATASET_GEOMETRY_INVALID` (blocking), `ROAD_LABEL_POINTS_ONLY`
(warning), `BOUNDARY_UNOFFICIAL` (info) and `NETWORK_ANALYSIS_NOT_SUPPORTED` (info). All are
bilingual and worded as facts.

## Data port

`SpatialDataPort` is the seam between the engine and wherever the spatial computation runs.
PostGIS is the compute backend in v1 and there is no second geometry library. The port is
read-only by construction, reports its placement (`APP_DATABASE` or `DEDICATED_CONNECTION`) and
the versions of PostGIS, GEOS and PROJ it reports, and never touches the `jenan_map` schema. The
query primitives are added, with tests, by the milestones that use them.

## Milestones

| Milestone | Content | State |
| --- | --- | --- |
| M1 | Shared core, contracts, states, gaps, confidence policy, canonical hashing, cost estimator, request normalization, Map layer policy, geometry pre-checks, port seam, unit tests | Done |
| M2 | Read-only Map adapter over PostGIS, a Map read contract test, `LOCATION_CONTEXT` | Planned |
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
