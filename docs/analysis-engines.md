# Jenan PRO Analysis Engines | محركات التحليل في جنان برو

## Purpose and order

Jenan PRO builds seven analysis engines, one at a time. Each engine is built, tested and
closed before the next one starts:

1. Spatial Analysis Engine (`docs/spatial-engine-v1.md`)
2. Market & Demand Engine
3. Competitor Analysis Engine
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

- `jenan-engines/integration` starts from that baseline and receives each closed engine
  through a merge commit, followed by a tag (for example `JENAN-PRO-SPATIAL-ENGINE-V1.0`).
- Each engine is built on its own branch (`jenan-engines/spatial`, ...) created from
  `jenan-engines/integration`, so the next engine starts from the previous one.
- Nothing is merged to `main` until the owner decides.

## The shared core

`services/analysis-engines/shared` is pure TypeScript: it imports only `zod`, `node:crypto`,
the pure vocabulary of the Data Center (`services/data-center/contracts.ts`) and its own
files. A static test (`tests/unit/analysis-engines-boundaries.test.ts`) fails the build if any
file in `services/analysis-engines` imports the database, Prisma, Projects, the Map, the UI or
the framework, calls the network, reads the environment, or uses a hidden clock or randomness.
Database and Data Center access arrives later in `adapters/` directories, the only place the
test allows it.

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

Export is allowed only when every input allows it, declares a license class and is not
restricted; an undeclared license class fails closed, as in the Data Center Map contract.
Attribution is the grouped, sorted set of the attribution texts of the inputs.

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
A run without a result is `FAILED` and names its error code. The record is append-only and has
no foreign key to Projects or to the Map. The Prisma models and their additive migration are
delivered with the Spatial Engine milestone M5; until then the contract is the specification.

Reproducing a run means running the same engine version with the stored request and the stored
`evaluatedAt` against inputs with the same checksums, and comparing output hashes. The
evaluation instant can be pinned only by replay and acceptance callers, never to a future
time.

## Extending the core

A later engine extends the shared vocabularies in its own commit, with tests (for example a
value kind and unit for currency amounts, or ratios). An existing member never changes meaning.
Each engine publishes its own gap catalog (combined with the shared one, a duplicate code is
refused), its own confidence policy, and its own cost policy.
