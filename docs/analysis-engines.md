# Jenan PRO Analysis Engines | محركات التحليل في جنان برو

## Purpose and order

Jenan PRO builds seven analysis engines, one at a time. Each engine's technical baseline
is built, tested and approved before the next one starts. The owner's 2026-10-21 decision
defers final Sonar acceptance and final tags until all seven technical baselines are complete:

1. Spatial Analysis Engine (`docs/spatial-engine-v1.md`)
2. Market & Demand Engine ([contracts and checkpoints](market-demand-engine-v1.md);
   M0 and M1–M5 split approved; M1 CLOSED at `d95da803`; M2 CLOSED at `e905daa`;
   M3 CLOSED at `e57a295`; real-demand acceptance BLOCKED / NOT VERIFIED;
   M4 CLOSED at `d2ef88e`; M5 accepted; Final Technical SHA
   `c54d647838c1ce10730277f3977abc4980c3715d`;
   **TECHNICALLY COMPLETE — PENDING FINAL SONAR**, frozen)
3. Competitor Analysis Engine ([M0 architecture proposal](competitor-analysis-engine-v1.md);
   planning only, awaiting review; M1 NOT STARTED)
4. Opportunity & Gap Engine
5. Financial Feasibility Engine
6. Operational Feasibility Engine
7. Risk & Decision Engine

An engine produces **documented facts and measurements** from governed data. It does not
decide. The interpretation of the facts belongs to the later engines, and the final decision
to the Risk & Decision Engine. The Data Center is the source of truth for data, sources,
versions, rights and quality; the Map is read through a read-only port. No engine is linked to
Projects yet, and no engine has a foreign key to Projects or to the `jenan_map` schema.

## Branch line

The Data Center foundation is a frozen baseline at `jenan-data-center/integration@04d6148`
and is never modified by the engines. The engines are aggregated on their own line:

- `jenan-engines/integration` starts from that baseline and receives approved technical
  engine baselines through explicit merge commits, without squash or destructive rebase.
  A technical merge is not final engine closure and creates no final tag.
- Each engine is built on its own branch (`jenan-engines/spatial`, ...) created from
  `jenan-engines/integration`, so the next engine starts from the previous one.
- Nothing is merged to `main` until the owner decides.

## Technical freeze and deferred final closure (owner decision, 2026-10-21)

- Market & Demand technical closure is accepted by the owner at Final Technical SHA
  **`c54d647838c1ce10730277f3977abc4980c3715d`**. Exact-SHA CodeQL run
  [39617080553](https://github.com/Jenan21/jenanbiz1-git/actions/runs/39617080553)
  passed both languages with zero open/new alerts. Its five existing dismissed
  repository findings remain unchanged. Status: **TECHNICALLY COMPLETE — PENDING
  FINAL SONAR**, not FINAL CLOSED. Real-demand acceptance remains BLOCKED / NOT VERIFIED.
  Freeze the engine; stop for explicit approval before any necessary shared modification.
- The owner authorized Competitor Architecture & Implementation Plan / M0 only,
  then explicitly approved a Market-to-integration merge commit without squash and
  a `jenan-engines/competitor-analysis` planning branch. No main merge, final tag,
  Sonar attempt or Competitor implementation is authorized.

- Spatial: **TECHNICALLY COMPLETE — PENDING FINAL SONAR**, not `FINAL CLOSED`.
- Final Technical Engine SHA (M7):
  `8d97baace8abd6889f400a56952e345f3068f3af`.
- Separate Sonar workflow-only setup SHA:
  `98ad93e3706a506bed8e6df9ff6e0eec1a2e64d0`; this adds no engine logic.
- Spatial M1–M7 technical acceptance is approved. Sonar Quality Gate:
  **DEFERRED / PENDING**. No further Sonar setup, subscription or analysis attempts now.
- Final Tag: **NOT CREATED**. Main Merge: **NO**.
- The owner authorizes merging Spatial into `jenan-engines/integration` only to continue
  subsequent engine development, then creating `jenan-engines/market-demand` for M0
  architecture/scope review. The owner subsequently approved M0/M1–M5, closed M1 at
  `d95da8030fbdcd6e68199cc4ca60bb6f528ece01`, then closed M2 at
  `e905daa0675f4cccf808978280cfe34eb133bc20` and explicitly authorized M3 only.
  The owner subsequently accepted and CLOSED M3 at
  `e57a295d6d09343ccc3bdfbc62f8093646bc97d2`, after identical Local/Remote/Desktop
  hashes were verified, then explicitly authorized M4 only. M4 adds existing shared-table
  persistence and authorized exact historical replay. The owner then CLOSED M4 at
  `d2ef88e609b516ef6fb10483e14f4e29554db629` and explicitly authorized M5 final
  technical acceptance only. The third engine requires a separate owner decision.
  The M5 acceptance commit changes tests/documentation only: production Market
  arithmetic and persistence retain M4's accepted behavior. Full local gates pass;
  the existing CodeQL workflow is dispatched only after that final commit is pushed,
  with its exact SHA and language analysis records checked before technical closure.
  The delivery report records that immutable SHA/run linkage. Real demand acceptance
  remains BLOCKED / NOT VERIFIED independently of these synthetic technical gates.
- Spatial is frozen. A necessary shared fix for a later engine requires stopping and
  informing the owner before modifying the accepted Spatial baseline.
- After all seven engines: run Sonar against their recorded Final Technical SHAs, address
  quality-gate failures in traceable follow-up revisions, rerun the required tests, and
  record the accepted replacement SHAs where fixes change a technical baseline. Only then
  issue approved final tags and mark the engines `FINAL CLOSED`.

## The shared core

`services/analysis-engines/shared` is pure TypeScript: it imports only `zod`, `node:crypto`,
the pure vocabulary of the Data Center (`services/data-center/contracts.ts`) and its own
files. A static test (`tests/unit/analysis-engines-boundaries.test.ts`) fails the build if any
file in `services/analysis-engines` imports the database, Prisma, Projects, the Map, the UI or
the framework, calls the network, reads the environment, or uses a hidden clock or randomness.
Database and Data Center access lives in `adapters/` directories, the only place the test allows
it, under a stricter rule (see Adapters below).

### Adapters

An engine reaches anything outside its own tree only through an adapter: a directory named
`adapters` inside the engine's own tree. The boundary test checks each adapter against its own exact list:

- **A database adapter** (the Spatial Engine's PostGIS reader) may import exactly `pg`, `zod` and
  files of the engine's own tree. It is the only code that imports the driver.
- **A Data Center provider** (the Spatial Engine's `data-center-provider.ts`) may import `zod`,
  files of the engine's own tree and the Data Center's three read services
  (`discoverDataCenterVersions`, `readDataCenterVersionContent`, `resolveDataCenterMapReference`)
  with the pure modules they share. It never imports a driver, Prisma or the application's database
  layer, holds no SQL and calls nothing that writes (no usage record, no audit entry). It has no
  access policy of its own: the Data Center applies its existing policy to the actor it is given.
  No other file of an engine may import those services.
- **Market's read-only Data Center provider** has a separate exact allowlist: discovery,
  version-content and the pure actor/error vocabulary only, plus its own/shared modules.
  It does not import the Map resolver or Spatial, and it performs no registration, usage,
  audit, persistence or Data Center writes. Its pure port reuses Data Center's existing
  metadata DTO/schema (named `map-reference` historically); this grants no Map capability.
  The actual configured local database currently lacks the Data Center schema, so production
  inventory and real demand acceptance remain BLOCKED / NOT VERIFIED, not assumed empty.
  Its M3 execution entry point composes those reads with pure deterministic Market
  calculations, bounded source/row/method evidence and strict result revalidation.
  The provider itself still writes no run/input/usage/audit data. M4 adds separate internal
  adapters below; Shared Core, Spatial and Data Center remain unchanged.
- **Spatial M5 run persistence and historical replay adapters** have explicit, narrow exceptions for
  Prisma and the application database. The persistence adapter inserts run/input rows only; the
  historical reader performs one exact-version read and applies Data Center source-scope,
  permission, specialty and mission-context checks. It never discovers versions or writes to
  Data Center tables. The replay service is internal and is not re-exported by the engine index.
- **Market M4 shared-table persistence and historical replay adapters** have their own exact,
  separate allowlists, without broadening the frozen Spatial permissions. The run service
  returns only after a complete shared `AnalysisEngineRun`/`AnalysisEngineRunInput` nested
  create succeeds. These existing append-only tables hold the bounded request/result/input
  evidence and per-input provenance/usage intent; there is no new dataset store, table,
  migration, Data Center usage/audit write or public API. The historical reader loads raw
  non-GeoJSON content by exact version, reuses current source/robot authorization, checks
  required permission and the recorded organization/specialty/mission context, and verifies
  the existing Data Center checksum and captured typed content. The replay transaction is
  Repeatable Read; it preserves recorded selection/gap/quality/time decisions and reruns
  the exact `1.0.0-m3` calculation, checking request/input/output hashes and full equality.
  It never discovers a newer replacement or writes a new run. Changed rights, ownership
  or attribution conservatively block replay rather than widen a historical result.
  History lookup is owner/platform-admin scoped and reauthorizes inputs before returning
  stored evidence; hidden/missing runs use the same unavailable error.

Neither is re-exported by the engine's index, and neither may read the environment, the clock or
the network. An adapter never imports Projects or the Map's service. The pure core talks to an
adapter through a port (an interface), so the place where the computation runs, or the way the
Data Center is reached, can change without changing the contracts.

| Module | Responsibility |
| --- | --- |
| `states.ts` | Metric statuses, platform states, run statuses, confidence bands, environments |
| `errors.ts` | `EngineError` and its five codes with their HTTP statuses |
| `canonical.ts` | Canonical JSON, SHA-256, `roundTo`, `compareText` |
| `gaps.ts` | Gap model, bilingual catalog, rendering, normalization |
| `confidence.ts` | Explainable heuristic breakdown and policy descriptor |
| `cost.ts` | Cost estimate and budget check |
| `contracts.ts` | Input descriptor, metric, envelope building blocks, derivations, envelope validator |
| `run-record.ts` | Append-only run record contract (`AnalysisEngineRun` / `AnalysisEngineRunInput`) |

### Missing data is never a number

`COMPUTED`, `PARTIAL` and `ESTIMATED` carry a value. `NO_COVERAGE`, `NOT_AVAILABLE`,
`NOT_COMPUTABLE` and `NOT_FOUND_WITHIN_RADIUS` carry `null` for both value and confidence; the
schema rejects a number there. Each status maps to the platform vocabulary of the Project
Analysis report (`VERIFIED`, `ESTIMATED`, `UNAVAILABLE`, `COMPUTED`): everything that has no
value is `UNAVAILABLE`, and the engine status keeps the finer meaning. A test reads
`lib/projects/analysis-report.ts` as text and fails if that vocabulary changes.

"Nothing found within the radius" is different from zero. A count of zero is allowed only when
the data declares itself a complete inventory; from a sample, or from data of unknown
completeness, it must be reported as `NOT_FOUND_WITHIN_RADIUS` with a null value.

### Gaps

A gap is a documented reason why a measurement is missing, partial or limited. Severities:

- `BLOCKING`: the affected measurement could not be produced;
- `WARNING`: a value was produced but is limited and must be shown with the limitation;
- `INFO`: a fact the consumer must know that does not reduce what was produced.

Every gap has a code, a severity, an optional input id and subject, and a bilingual (Arabic and
English) message and remedy rendered from the catalog. A missing template parameter throws
instead of printing a hole. `deriveInputGaps(input)` produces the gaps that follow from an
input's own description (expired, stale or unknown freshness, unavailable quality, sample or
unknown completeness, unregistered Map layer, undeclared or restricted license, export not
allowed, attribution required, undeclared coverage). The envelope validator requires them, so
a limitation of the data cannot be left out of a result. Gap wording states facts; a test
rejects verdict, recommendation and probability words in both languages and any percentage.

The run status is derived, not chosen: `COMPLETED` only when every measurement was computed and
no gap is worse than `INFO`; `FAILED` when nothing was produced and something blocked it;
otherwise `COMPLETED_WITH_GAPS`.

### Confidence is a heuristic, not a probability

A confidence breakdown is a sum of points granted by documented rules (100 in all), mapped to a
band (`HIGH`, `MEDIUM`, `LOW`, `INSUFFICIENT`) by documented thresholds, and lowered by
documented caps. It stores the policy id and version, every factor with its points and the
input that determined them, and every cap that applied. It is self-verifying: the points must
add up to the score, the score band must follow from the thresholds, and the band must be the
weaker of the score band and every cap. A policy descriptor carries its weights, thresholds,
caps, methodology and a disclaimer, and its `isProbability` member can only be `false`. No
engine may display a figure such as "87% chance of success".

### Inputs, rights and attribution

An input descriptor says exactly what was used: its kind and governance (`DC_PUBLISHED`,
`MAP_REGISTERED`, `MAP_UNREGISTERED`, `ENGINE_OUTPUT`), reference and SHA-256 checksum, source,
ownership, license text, license class, usage policy, attribution, export permission,
completeness (`INVENTORY`, `SAMPLE`, `UNKNOWN`), evidence status, quality, freshness, coverage
and limitations. Ownership, license and usage policy stay separate fields; nothing is inferred
from another.

Export is allowed only when the result has at least one input and every input allows it,
declares a license class and is not restricted; an undeclared license class fails closed, as in
the Data Center Map contract. A result with no input at all (the Map has nothing published, no
layer is usable, or every layer was excluded) is denied with the single reason `NO_INPUTS`: the
absence of inputs is never a permission. Attribution is the grouped, sorted set of the
attribution texts of the inputs.

### The envelope validator

`findEnvelopeViolations` checks what no single schema can see, and `assertEnvelope` fails
closed with `CONTRACT_VIOLATION`. It verifies that inputs are unique and sorted, references
resolve, gaps are normalized and include every input-derived gap, attribution and rights equal
what the inputs require, the status is the derived one, the three hashes match, the confidence
breakdown belongs to a declared policy, production uses no unregistered Map layer, counts and
densities from data that is not an inventory carry their gap and at most `LOW` confidence, a
zero never comes from such data, expired data supports no value, unregistered layers cap
confidence at `MEDIUM`, the cost is within the budget, and the timing is not inverted. Each
violation has a stable code and a path.

### Determinism

Canonical JSON follows RFC 8785 for the values engines produce: keys sorted by UTF-16 code
unit, no whitespace; `undefined` members omitted, `undefined` in arrays rejected; `NaN`,
infinities, bigint, functions, symbols, maps, sets and class instances rejected; a date is its
ISO string; `-0` is `0`. Measurements are rounded once with `roundTo` (half away from zero on
the decimal digits) before they are stored.

- `requestHash` covers the normalized request without the list of defaults the engine filled in,
  so typing a default explicitly gives the same hash as omitting it.
- `inputsHash` covers the resolved input descriptors, including their checksums.
- `outputHash` covers the whole result except `runId`, `timing` and `determinism`. It includes
  `evaluatedAt`, so freshness cannot be borrowed from another day.

### Cost

An estimate is computed from the normalized request alone, before any data is read, as a list
of explainable lines. The budget is chosen by the server and cannot be set by a caller. An
estimate above the budget is refused with `REQUEST_TOO_LARGE` (HTTP 422).

### Run record

`AnalysisEngineRun` and `AnalysisEngineRunInput` are one structure for all seven engines. The
contract (`run-record.ts`) defines the record: engine key and version, contract ids,
environment, status, the three hashes, the normalized request and the full result (each at most
2 MiB of canonical JSON), error code, confidence and gap summaries, actor, an opaque `subject`,
timing, cost, runtime, and one input row per input holding a full snapshot of its descriptor.
A run without a result is `FAILED` and names its error code. The M5 additive migration creates
these shared tables only: neither Projects, the Map nor the Data Center is referenced by a
foreign key. Database triggers reject updates and deletes, and the runtime persistence API
exposes insert and authorized-read operations only.

For each Data Center input, the run-input row stores its exact version id and checksum, source
id, type key, immutable reference, version provenance/eligibility metadata, and a run-linked
usage intent (consumer, purpose, roles, version id and content hash). This is the engine's
traceable usage record; the frozen Data Center schema and `DataCenterUsage` table are unchanged.
The resolver captures the full Data Center reference and each role's selection trace through
an internal persistence hook, separately from `EngineInput`. Resolution timestamps and Data
Center heuristic confidence therefore do not enter the public input descriptor or its hashes.
Roles sharing a version retain their own exact/by-type selection traces in the provenance row.

Historical replay is internal, not discovery. A run is readable only by its owning actor or a
platform Data Center administrator; ownership matches both actor kind and actor id. The historical reader then applies current source scope,
retrieval, permission, specialty and mission-context access checks, but reads only the saved
version id; it does not require that version to remain currently published and never falls back.
Missing or inaccessible history has one unavailable response. If accessible historical content
does not match its recorded checksum, replay fails explicitly. Replay uses the saved normalized
request, evaluation instant, Map release/reference, Data Center reference, version and hashes,
and returns no result unless the recomputed request, input and output hashes match.

Reproducing a run means running the same engine version with the stored request and the stored
`evaluatedAt` against inputs with the same checksums, and comparing output hashes. The
evaluation instant can be pinned only by replay and acceptance callers, never to a future
time.

### M5 database acceptance

Run migrations against a newly created disposable PostgreSQL database, not the application's
existing database. Set `DATABASE_URL` to that database and run `prisma migrate deploy`.
With `DATA_CENTER_DATABASE_TESTS=1`, run the Data Center integration suites together with
`tests/integration/spatial-data-center-provider.integration.test.ts`.

The M5 cases exercise real nested run/input inserts, exact version/hash and usage provenance,
superseded-version replay, shared-version per-role selection, missing historical rows, invalid
or changed historical content, run ownership and revoked source retrieval, SQL NULL failure
records, and update/delete rejection on both history tables. They use rolled-back transactions;
expected SQL failures have savepoints. Historical data loss/corruption is simulated only in
test fixtures, restoring immutable triggers before rollback, never in the production adapter.

The approved SQL migrations retain constraints/indexes that Prisma does not fully model,
including Data Center's deferrable version foreign keys. Do not rewrite this frozen baseline
to make a raw `migrate diff --to-schema` empty. Verify applied migration names/checksums and
unchanged pre-M5 models instead; M5 adds only the two analysis-history tables and their guards.

## Extending the core

A later engine extends the shared vocabularies in its own commit, with tests (for example a
value kind and unit for currency amounts, or ratios). An existing member never changes meaning.
Each engine publishes its own gap catalog (combined with the shared one, a duplicate code is
refused), its own confidence policy, and its own cost policy.

Spatial M6 adds optional metric `method`, numerical `RATIO` (`ratio` unit) for normalized
observations and integer `ORDINAL` (`none` unit) for descriptive numerical ordering. Existing
metrics omit the optional field unchanged. Neither kind is a feasibility or success score.
The full Spatial request, including every target and comparison derivative, is bounded to
500 metrics before any backend read. See [Spatial M6](spatial-engine-v1.md#density-constraint_screening-and-site_comparison-m6).
