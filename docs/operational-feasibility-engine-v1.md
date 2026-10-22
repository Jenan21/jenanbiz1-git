# JENAN OPERATIONAL FEASIBILITY ENGINE — M0 ARCHITECTURE REVIEW

## 1. Authority, baseline and mandatory stop

**M0 owner-approved at `136b36593a813c091704845a2bfc6d8d5165fe2e`.
M1 owner-approved / CLOSED at `45e8db5dc1525a8fd88c0dc4603a69f22c0e895e`.
M2 owner-approved / CLOSED at `3728dcafff7f797dcefddb0dd3f0da9118314b7e`.
M3 owner-approved / CLOSED at `d4396ca777a58a0ae2287cbe74e6c67aa2c49348`.
M4 persistence and exact historical replay implemented for checkpoint review only.
M5 NOT STARTED.**
The owner approved engine five and authorized Operational M0 only on 2026-10-22.
Five of seven engines are now owner-accepted as
**TECHNICALLY COMPLETE — PENDING FINAL SONAR**.

| Frozen engine | Owner-accepted technical baseline |
| --- | --- |
| Spatial | `8d97baace8abd6889f400a56952e345f3068f3af` |
| Market & Demand | `c54d647838c1ce10730277f3977abc4980c3715d` |
| Competitor Analysis | `eaa2d09374593d5677fc77c3efbc4f5a3e42e4a0` |
| Opportunity & Gap | `10dcafcf27c45db8b371fa5b79ac9da6bc4f21a5` |
| Financial Feasibility | `2eee9fd2bdb4445e30931070bff8fb0392113de8` |

Financial's **tested implementation / exact-SHA CodeQL target** remains
`66afdfea4fd8e118c0833232fd95f673e00d6a33`; its accepted final SHA above is a
**documentation-only child**, never substituted into test/scan evidence.
The owner's approval message transcribed that child as
`2eee9fd2bdb4445e3a0931070bff8fb0392113de8` (41 characters).
The verified 40-character Local = Remote = Desktop archive SHA is the table value;
this records the transcription discrepancy, not a different accepted implementation.

Data Center remains frozen at `04d6148dfb875532404059adb55fcac8ee6913b2`.
Historical full regression remains **NOT PASS**, with the previously accepted
Competitor timing debt and four pre-M2 Competitor database failures retained.
The Financial M5 Next.js dependency-security advisory remains separately recorded;
this architecture work neither remediates it nor treats CodeQL as dependency clearance.

The isolated planning branch `jenan-engines/operational-feasibility` starts directly
from the accepted Financial closure. No integration/main merge, final tag, Sonar,
history rewrite or dependency install is authorized.
M0 added no runtime scaffold. The owner subsequently approved M1 pure contracts,
semantics, confidence, bounds, hashes and storage compatibility, and authorized
M2 governed Data Center read integration, then explicitly closed M2 and authorized
M3 deterministic operational calculations, then explicitly closed M3 and authorized
M4 persistence and exact historical replay only on 2026-10-23.
The Financial branch and its Desktop archive remain at their accepted baseline.
Stop after the M4 checkpoint for owner review; do not start M5 or engine seven.

References: [execution master](../design-references/Jenan-PRO/EXECUTION_MASTER.md),
the immutable three-archive library, and page 045
`projects_feasibility_pro_operational/spec.txt` and `reference.html`.
The operational page covers processes, team, suppliers, quality, inventory and
policies, with an operational-plan output. Its sample percentages/counts provide
no evidence, calculation policy, readiness score or production data.
This phase does not modify that page or connect the engine to Projects/UI.

## 2. Purpose and explicit exclusions

Compute explainable **conditional operational resource requirements, capacity,
shortfalls and documented prerequisite gaps** from exact authorized inputs.
Report what the declared operational plan requires and what the evidence supports;
do not decide whether the project should launch or succeed.

Proposed v1:

- Process/resource definitions, approved operating calendars and resource allocation.
- Independent resource and simple serial-process capacity, workload and bottlenecks.
- Workforce-hours requirements, FTE equivalents and declared-role staffing gaps.
- Supplier quantity/date commitments and same-period supply shortfalls.
- Deterministic period-bucket inventory balance and lead-time reorder arithmetic.
- Observed quality ratios where actual complete denominators exist.
- Explicit policy/prerequisite evidence gaps, without legal certification.
- Named scenarios and bounded one-at-a-time sensitivity from supplied inputs only.
- Assumptions, provenance, rights, confidence, limitations and exact replay.

Forbidden: invented demand, productivity, shifts, absenteeism, yield, supplier
availability, lead times, inventory or safety stock; inferred demand from population,
competitors or Financial revenue; AI/LLM/scraping; success probability; composite
Operational/Readiness Score; final launch/investment/funding recommendation.
No direct imports or execution of any of the five prior engines.
No payroll/CapEx/OpEx/margins/NPV recalculation, financial advice or revival of
Funding Eligibility. Risk ranking and final decisions belong to the later engine.

Out of v1: queueing/wait-time models, Monte Carlo, stochastic safety stock/service
levels, optimization, automatic roster scheduling, labor-law/overtime advice,
multi-product shared-resource throughput optimization, rework loops, parallel-network
simulation, inferred BOM/conversion coefficients, shelf-life/lot allocation,
automatic purchasing/hiring or vendor selection. Unsupported methods return an
explicit state, not a simplified calculation silently presented as equivalent.

## 3. Architecture and verified reuse constraints

`authorized exact Data Center snapshots -> validate/bind approved operational model
-> pure deterministic operational calculations -> engine-local result and evidence
-> atomic existing Run/Input history -> current-authorized exact historical replay`.

Proposed pure folder: `services/analysis-engines/operational-feasibility`.
No folder or code scaffold is created in M0.

- Reuse unchanged Shared canonical hashing, identifiers, input descriptors, rights,
  attribution, applicable state/confidence helpers and Run/Input storage contracts.
- Read only through the existing Data Center governed APIs and narrow engine-local
  adapters. Do not register production sources/types or bypass current policy with
  caller-asserted authorization or unrestricted source SQL.
- Owner-declared plans are assumptions, not observed operations. Live runs require
  published, approved, versioned records with author/date/rationale/approval and
  exact source lineage. A caller cannot override published capacity or staffing.
- The existing `decimal.js` dependency supports a locally cloned deterministic
  arithmetic context; no import from Financial's decimal module, global Decimal
  mutation, dependency update or Shared extraction is necessary.
- **Verified constraint:** Shared quantity dimensions do not model HOURS,
  resource-hours, FTE, item/hour or hours/item directly, and Shared metrics use
  numeric values. Use strict engine-local decimal/unit/metric schemas rather than
  mislabeling hours as ITEMS/INDEX or forcing decimal strings through casts.
- Existing Run/Input generic JSON storage can retain the local result, using the
  same unchanged record primitives already exercised by Financial. M1 must prove
  storage-envelope/hash compatibility, without importing Financial or inventing
  a Shared confidence summary for an incompatible local metric contract.
- If any essential capability needs Shared/Data Center/schema changes, stop and
  request approval rather than widening frozen contracts.

## 4. Proposed input contracts

Contracts: `jenan.operational-feasibility.request/v1`,
`jenan.operational-feasibility.dataset/v1`,
`jenan.operational-feasibility.result/v1`.

| Group | Required explicit semantics |
| --- | --- |
| Model | Subject/scenario, site, geography, sector taxonomy/version, output definitions, author and approval |
| Calendar | Nonoverlapping half-open reporting windows, Gregorian dates, IANA timezone; exact operating minutes/days explicitly supplied for each resource/role |
| Targets | Declared production/service workload by output/site/period, identified as PLAN rather than realized demand/sales |
| Resources/processes | Unique pools, resource counts, output units, cycle time or capacity rate (mutually exclusive), setup/downtime, allocation and complete loss definitions |
| Workforce | Role/skill pool, required task labor content, available qualified staff-hours, explicit hours per FTE; headcount-to-hours conversion only with declared calendars |
| Suppliers | Exact supplier/material identifiers, quantity, unit, delivery date/period, evidence of commitment and inclusion status; quotation is not a commitment |
| Inventory | Opening usable stock, explicit usable receipts, required consumption, adjustments/losses, period and material unit, dated/bucketed availability |
| Reorder inputs | Declared consumption rate and matching lead-time basis, explicitly declared safety stock; no default to zero |
| Quality | Inspected/accepted/rejected counts, complete cohort, defect vs defective-unit definition, period and method; observed and assumed yield remain distinct |
| Policies | Declared applicable requirement set, evidence/status/expiry, approver; explicitly reviewed NOT_APPLICABLE needs a rationale |
| Scenarios/sensitivity | Named parameter overrides and explicit low/base/high points, immutable scope/unit/calendar, declared author/rationale/evidence |
| Governance | Exact source/versionId/checksum/record references, approval, ownership, license, usagePolicy, attribution, freshness and coverage |

Proposed dataset grouping: a single governed `operational.model` containing
calendars, targets, resources, staffing, supplier commitments, inventory, quality,
requirements and scenarios. Separate exact pinned datasets may be supported only
if M1/M2 can preserve cross-record compatibility and bounded reads.
Type keys/grouping require milestone review; M0 creates no registry entries.

All values distinguish OBSERVED, DECLARED_ASSUMPTION and DERIVED.
Absent schedules are unknown, not complete empty schedules. An evidenced complete
empty schedule may explicitly declare zero applicable items.
IDs, periods, resource allocations, cohort and output units must match exactly.
Server actor/org/robot/mission context, run ID and evaluatedAt cannot be supplied
as an authorization grant inside the model.

## 5. Numerical and dimensional semantics

Propose canonical base-10 decimal strings, 34 significant digits, HALF_EVEN,
maximum 18 integer digits and 16 input fractional digits. Validate finite magnitude
and precision; never silently truncate. Round reported continuous quantities to
six decimal places, with versioned reporting policy; never round intermediates
before a capacity comparison. Whole deliverable counts round down and required
indivisible staff/units round up only when the declared method requires it.

Convert only explicitly compatible time units (60 minutes/hour); a day, shift,
FTE, month or working day has no implicit productive-hour value. No automatic
seasonal/holiday/DST calendar, geography transfer, interpolation or unit conversion.
Shared personnel-hours across tasks cannot be counted twice. Incomplete allocation,
overlapping reservations or unknown setup/loss treatment blocks dependent totals.

Allowed zero is explicit evidence, not a fill value. A valid positive required
workload against explicit zero capacity yields a computable shortfall, but no
numeric load ratio. Invalid negative available hours or losses beyond scheduled
time are rejected, never clamped. Resource load can exceed 100%; it is not a bounded
share and must not be mislabeled as Shared PERCENT share semantics.

## 6. Proposed deterministic calculations and guards

| Calculation | Rule / prerequisites |
| --- | --- |
| Net resource time | Sum explicitly allocated resource-minutes minus nonoverlapping declared setup and unavailable minutes for the same pool/period; loss accounting must be complete |
| Stage capacity | Net resource-minutes / positive resource-minutes per output unit; or net resource-hours x explicit compatible units/resource-hour rate, never both |
| Effective output | Already-net good-output rate OR explicitly defined gross output x declared yield in [0,1]; never apply yield/loss a second time |
| Simple serial bottleneck | Minimum comparable good-output stage capacity, only for the declared one-output linear route with compatible stage/yield basis, no shared pools, branches, loops or unmodeled transfer constraints; report all tied limiting stages |
| Required resource time | Declared target x compatible resource time/unit; all routing/loss conversions must be explicit, not inferred |
| Capacity gap / spare capacity | max(0, target - capacity) / max(0, capacity - target), same output/site/period; a gap is not a demand forecast |
| Load ratio | Required resource time / available resource time x100, strictly positive denominator; >100 is retained as overload, 0/0 is NOT_COMPUTABLE |
| Labor requirement | Sum target x explicit labor-hours/unit plus explicitly declared nonoverlapping fixed labor-hours, by role/period; machine cycle time is not automatically labor time |
| FTE equivalents / staffing gap | Required qualified hours / positive explicit productive hours per FTE; ceil only for declared homogeneous full-time staffing method; gap = max(0, required - available qualified hours) |
| Supplier shortfall | max(0, declared material requirement - usable committed delivery quantity) by exact material/site/period; no sum of alternative quotes and no implied reliability probability |
| Inventory projected balance | Opening usable stock + usable receipts + signed declared adjustments - declared required consumption; carry exact balance between contiguous periods and require complete schedules |
| Inventory shortage | max(0, -projected balance), labeled projected net requirement/backlog, not negative physical inventory; expose gross receipts/requirements and signed balance separately |
| Reorder threshold | Explicit consumption units/time x explicit compatible lead time + explicitly declared safety stock; threshold arithmetic only, no optimal order/automatic procurement |
| Observed yield / rejection ratio | Accepted/inspected or rejected/inspected x100, positive complete same-cohort denominator, disjoint/reconciled classifications; assumed yield cannot be relabeled observed |
| Prerequisite gaps | List each declared applicable requirement with current supporting evidence, missing/expired/conflicting status and limitations; no global compliance certification or readiness score |
| Scenarios / sensitivity | Recalculate only supplied independent overrides or three explicit one-at-a-time points; preserve failing points/reasons, no invented +/-10%, Cartesian sweep or best-case recommendation |

Proposed synthetic hand-checks for M3:

- Two independent serial stages: 480 and 360 net minutes, 2 minutes/good unit
  each => capacities 240 and 180; target 200 => serial capacity 180, gap 20,
  stage-two required time 400 and load 111.111111%. This says nothing about sales.
- Required qualified labor 30 hours; explicit 6 productive hours/FTE => 5 FTE
  equivalents. Available qualified hours 24 => hours gap 6, not an assumed hire.
- Opening stock 20 + usable receipts 30 - required consumption 60 => projected
  balance -10 and shortage 10, not a claim of negative physical stock.
- Explicit consumption 4 units/calendar-day, lead time 3 calendar-days, safety
  stock 2 => reorder threshold 14. A working-day lead time cannot be substituted.
- Inspected 100, accepted 92, rejected 8 in the same complete cohort => observed
  yield 92%; a plan assumption of 92% does not establish this observed ratio.

Period-end inventory/supply arithmetic does not prove intraperiod availability.
Do not claim an order/service can be fulfilled before its dated receipt. Missing
intraperiod timing limits the interpretation; timestamp scheduling is out of v1.

## 7. Result, state and confidence policy

Each metric/finding carries method ID/version, value or explicit null, exact unit
and period, site/output/role/material, operand and assumption IDs, evidence,
source/version/hash, observed-vs-projected interpretation, confidence, rights and
limitations. Include normalized assumptions, allocation/reconciliation diagnostics,
all scenario points and deterministic request/input/output hashes.

Proposed states: COMPUTED / ESTIMATED / PARTIAL / NO_COVERAGE / NOT_AVAILABLE /
NOT_COMPUTABLE / NOT_SUPPORTED, with explicit reasons. Final names must remain
compatible with the local envelope and unchanged Shared run-status mapping in M1.
Unsupported process networks are NOT_SUPPORTED; incompatible methodology, units,
calendar, cohort or missing essential operands are NOT_COMPUTABLE. Unauthorized
and absent records share the same unavailable response without existence leakage.
Malformed requests fail explicitly, and backend failures propagate, not cached success.

PARTIAL may describe a labeled evidence subset, never an authoritative complete
capacity, staff requirement or inventory total. Block dependent totals when an
essential input is missing; unrelated valid metrics may remain available.
Unknown applicable policy set cannot produce "no requirements missing".

Proposed `operational-confidence-v1`: evidence/provenance, completeness, freshness,
approval, unit/calendar compatibility and applicability of the operational method.
No numeric weights or thresholds are approved implicitly by this proposal; M1 must
define and test any local heuristic. Cap at the weakest essential input; unavailable
metrics have null value/confidence. Even approved assumed productivity yields an
assumption-based projection, not verified output, staff availability or success odds.
No cross-domain readiness/feasibility score.

## 8. Data Center and history requirements for later milestones

M2: read only exact source/versionId/checksum, validate approved source/model and
assumptions, provenance/ownership/license/usagePolicy/attribution, source validity,
geography/sector/site, time/unit/definition/methodology and complete coverage.
Approval is a governed attestation, not cryptographic proof or legal certification.
No latest fallback, no arbitrary old-version substitution and no direct upstream
engine imports. Partial/unknown coverage never proves absence or zero.

Apply current permission/org membership/specialty/mission/robot/source policy
before metadata/content exposure. Current rights must constrain every retained
input, scenario, result and later replay. Reuse existing APIs; no Data Center write.

M4: atomic append-only Run/Input/Output in existing tables, original exact source
bytes/version/checksum, model/assumptions/approvals and method/decimal/rounding/
confidence versions. Store bounded discovery/read transcript and metadata.
Historical replay reauthorizes current access before validating/recomputing the
cached result; original versions, evaluatedAt and method only, no current assumptions
or latest resolution. Missing old source, byte/hash tampering or revoked rights
fails explicitly. Foreign/missing Run IDs stay indistinguishable.
Duplicate committed IDs fail without overwrite; failed child insert rolls back
with no orphan records and permits a valid same-ID retry. Replay writes nothing.
Unsupported old methods fail explicitly rather than silently upgrading calculations.

## 9. Proposed bounds and implementation phases

Initial bounds for M1 verification: <=32 exact source versions, <=120 reporting
periods, <=100 process stages, <=200 resource/role pools, <=1,000 combined base
schedule/commitment/requirement items, <=10 scenarios including base,
<=20 one-at-a-time sensitivity drivers with three explicit points,
<=10,000 expanded input rows, <=500 scalar result metrics/findings,
<=2 MiB canonical request/result/history payload and existing 20,000 work units.
Count time expansion, allocations, scenarios and sensitivity before I/O/expansion.
The first reached limit rejects explicitly; maxima are not all simultaneously
available. No silent truncation, unbounded network simulation or partial save.
Finalize measured work weights/limits in M1, never raise gates just to pass tests.

| Phase | Deliverable and mandatory stop |
| --- | --- |
| M0 | This architecture/scope/formula proposal and engine-five acceptance record; stop before M1 |
| M1 | Strict model/unit/time/decimal/state/confidence contracts, method prerequisites, bounds/hashes and unchanged storage compatibility; no live integration/full calculations |
| M2 | Governed exact Data Center reads, approval/rights/coverage/compatibility/current authorization/checksums, no existence leak/latest fallback; no calculations yet |
| M3 | Approved deterministic capacity/labor/supply/inventory/quality/prerequisite calculations and supplied scenarios/sensitivity, independent hand-checks and invalid-method tests |
| M4 | Atomic history, original assumptions/methods, current-authorized exact replay, tamper/append-only, rollback/retry and duplicate safety |
| M5 | Final focused/regression/DB/PostGIS/boundary/access/performance/concurrency gates, exact-SHA CodeQL, typecheck/lint/build/diff, commit/push/Desktop sync; Sonar still deferred |

Every milestone requires its own owner authorization. Keep frozen historical
Competitor failures NOT PASS, separate from new Operational gates. No rerunning
Financial acceptance merely to record its approval. New failures need targeted
attribution, not edits to frozen engines or loosened limits.

## 10. Acceptance plan and review decisions

Later functional acceptance must verify missing vs explicit zero, zero denominators,
overload >100%, full allocations, no duplicate pool/shift/loss accounting, role/unit/
calendar incompatibility, stale/unapproved assumptions, shared-resource/branch/loop
rejection, supplier commitment vs quote, complete inventory chronology, observed
vs assumed quality, unknown requirement applicability, scenario independence and
bounded worst-case expansion. Structural invalidity, legitimate unavailability
and infrastructure failure must remain distinguishable.

M4/M5 require real owned scratch PostgreSQL transactions, current revocations,
old versions after newer publication, tamper detection, actual concurrent persistence/
replay/duplicate races and rollback/recovery. Capture throughput and p50/p95/max.
Use existing acceptance reference gates (pure batch <15 s, DB operation <15 s,
batch <30 s) only with a declared scenario/count/environment and measured receipts.
Do not claim those synthetic gates prove production capacity or real-data acceptance.

M0 review requests approval of the bounded v1 scope, local dimensional/decimal
contracts, simple serial-route restriction, explicit planned targets, deterministic
inventory/reorder semantics and evidence-only prerequisite reporting. Exact confidence
weights, work-unit policy and schema invariants must be explicit in M1, not invented
silently. Future UI/orchestration or process optimization needs separate approval.

**REAL-DATA OPERATIONAL FEASIBILITY ACCEPTANCE = BLOCKED / NOT VERIFIED.**
**M0/M1 owner-approved. Their checkpoint evidence follows; M2 is recorded in section 12.**
**Sonar = DEFERRED / PENDING. No main/integration merge or Final Tag.**

## 11. M1 checkpoint — pure foundation only

The owner approved M0 and authorized **M1 only** on 2026-10-22, with Financial
baseline `2eee9fd2bdb4445e30931070bff8fb0392113de8`. No new source is discovered,
registered, read or authorized by this milestone. No operating metric is calculated.

### Implemented contracts and semantics

- Six pure files under `services/analysis-engines/operational-feasibility`:
  `decimal`, `model`, `request`, `confidence`, `contracts` and `index`.
  No adapter, database access, environment, network, AI, hidden clock, randomness,
  prior-engine import, UI or Projects connection.
- Strict request/dataset/value/unit/schedule/result contracts. Production/service
  TARGET requires PLAN. Planned targets/commitments remain declared assumptions.
  Supplier rows retain COMMITTED / QUOTATION / UNKNOWN; quotation/unknown produces
  a prerequisite gap, never committed supply or a fabricated zero.
- Units explicitly model quantities, time, resource-time, time/unit, consumption
  rate, lead time, hours/FTE, FTE, fractions and unbounded load percentage.
  Headcount is not an accepted substitute for qualified staff-hours. Hours/FTE
  requires an explicit role and calendar reference to its reporting period.
- Whole counts and [0,1] fractions are checked separately from load percentage,
  which may exceed 100. Negative operand quantities are invalid; inventory
  adjustments use an explicit ADD/SUBTRACT direction rather than hidden signs.
- Complete empty schedules require evidenced `noApplicableItems`; missing/null
  remains distinct from zero. Cross-references, identities, period/site/entity/
  pool/role/calendar and operand units are checked. Schedule row/operand reuse
  cannot silently double-count a quantity. Receipts/commitments retain explicit
  dates and report incomplete timing; dates outside the declared period fail.
- Observed quality schedules require observed whole counts and an inspection
  cohort; assumed yield cannot become measured quality. Cohort mismatch is a
  prerequisite reason. Applicability unknown remains unknown; EVIDENCED and
  NOT_APPLICABLE requirements need supporting evidence and rationale.
- Only one-output NET_GOOD_OUTPUT simple serial models with distinct stage pools
  are supported. Branched/parallel/rework/shared pools, mixed outputs or unresolved
  gross loss basis produce **NOT_SUPPORTED** without simplification. This M1
  boundary is intentionally conservative; general network simulation is not v1.
- Periods are explicit nonempty half-open, contiguous, ordered Gregorian intervals
  in one validated IANA timezone. Only explicit minute/hour conversion is supplied;
  no assumed productive hours/day, shift/FTE conversion or working-day/calendar-day
  lead-time substitution.
- The local `decimal.js` clone uses 34 significant digits and HALF_EVEN.
  Input decimals allow <=18 integer / <=16 fractional digits; canonical output
  preserves up to 34 significant digits until six-place reporting rounding.
  No binary Number quantity conversion, global Decimal mutation, overflow clipping
  or import of Financial arithmetic.
- Proposed state vocabulary is retained. Foundation metrics themselves are
  **NOT_COMPUTABLE or NOT_SUPPORTED with null value/confidence**, always including
  `M1_CALCULATIONS_DEFERRED`; even complete valid inputs yield no capacity, staffing,
  inventory, quality ratio, score, success probability or launch recommendation.
  Prerequisite diagnostics include missing schedules/operands/source descriptors,
  unknown coverage, review, zero denominator, resource/cohort/unit incompatibility,
  quotation, timing, applicability and undeclared scenario/sensitivity.
- Approved attestations require author/reviewer/date/rationale and evidence.
  Future declarations/approvals are rejected relative to trusted evaluatedAt;
  dataset approval must follow approval of every operand. These are contract
  attestations, not live source authorization or cryptographic identity checks.

### Confidence, determinism and bounds

`operational-confidence-v1/1.0.0` is an evidence-quality **band policy**, not a
numeric operational score. Its three factors are source evidence, coverage/
freshness and assumption review; the result equals the weakest factor.
HIGH source evidence requires every essential input VERIFIED and measured quality
>=0.8. Incomplete/nonfresh/unmeasured evidence or unreviewed operands caps LOW.
Approved declared plans cap MEDIUM; fully supported observed inputs may reach HIGH.
Missing operands/evidence or incompatible methods return null confidence.
M1 exposes this policy/helper for contract testing; no foundation metric receives
numeric output or metric confidence.

Normalization is locale-independent, deduplicates/sorts exact evidence and sorts
unordered identities, while preserving chronological periods and stage order.
Decimal spellings normalize before hashing. requestHash includes normalized
request/evaluatedAt; inputsHash includes exact descriptors; outputHash excludes
runId/timing only. Validation rebuilds the whole expected foundation result,
rejecting forged values/rights/policies even with a recomputed outer hash.
Returned results do not share mutable input or result state.

Bounds enforce 32 exact checksummed Data Center descriptors, 120 periods, 100 stages,
200 pools, 1,000 **combined** values + schedule rows + requirement entries,
base plus <=9 declared scenarios, <=20 one-at-a-time sensitivity drivers,
10,000 expanded work rows, 500 prospective scalar outputs, 20,000 work units,
and 2 MiB canonical request/result/whole-record size.
Work is measured before any future execution:

`variants = 1 + scenarios + 3*sensitivityDrivers`

`expandedRows = (combinedBaseItems + stages*periods)*variants`

`prospectiveMetrics = analyses*periods*variants`

`costUnits = expandedRows + prospectiveMetrics + scheduleCoverageEntries`

These are conservative M1 admission bounds, not an execution of the M3 formulas.
Oversize/invalid input fails explicitly; no truncation. Whole-unit scenario
overrides retain their original unit constraints, observations cannot be overwritten
as assumptions, and sensitivity requires ordered explicit low/base/high with the
original declared base, not an invented percentage.

### Unchanged Shared/history compatibility

The pure `buildOperationalFoundationRecord` validates/rebuilds the foundation
result, then uses unchanged `runRecordSchema` and `toRunInputRecord`.
It preserves local decimal/unit semantics as bounded JSON, exact input snapshots,
hashes, actor/createdAt metadata, versioned policies and explicit blocking gaps.
The Shared confidence summary is null rather than a fabricated numeric conversion.
This is a **storage-shape proof only**, not persistence, authorization or replay.
Those capabilities remain deferred to M2/M4.

Shared, Data Center, all five engines, Prisma, Map, Auth, routes, dependencies
and workflows remain unchanged. The global boundary test changes only the exact
`operational-feasibility/decimal.ts` allowlist for the existing decimal dependency;
no general import or adapter capability is widened. The local AST guard tests
side-effect/type/dynamic imports and prohibited capabilities explicitly.

### Saved verification

| Gate | Result |
| --- | --- |
| Operational M1 cases | **174/174 PASS**: 90 contracts/semantics, 32 decimal/time, 14 confidence, 10 bounds, 28 isolation |
| Global engine boundaries | **18/18 PASS**; Operational + global focused coverage **192/192** within the final combined run |
| Final related regression | **648/648 PASS**, 22 files, 15.14 s; 174 Operational + 235 Financial + 239 Shared/global cases, no skips |
| Shared history compatibility | PASS; unchanged Run/Input schema validation, exact snapshot/hash repetition, local decimal JSON and no database writes |
| TypeScript / scoped ESLint | PASS, zero warnings |
| Production build | PASS on unchanged retry, 161/161 static pages; earlier failed advisory-interrupted executions retained |
| Frozen runtime / dependency scope | PASS; only new Operational files/tests, one exact global-test exception and directly related docs |
| Full regression | **NOT CLAIMED PASS**, historical accepted Competitor exceptions remain NOT PASS; broad suite not rerun |
| Live Data Center / PostgreSQL Operational integration | **NOT STARTED**, intentionally outside M1; descriptor and storage-shape tests are not live authorization/persistence evidence |
| CodeQL / Sonar | No new M1 scan claimed; exact-SHA final CodeQL planned for M5; Sonar DEFERRED / PENDING |

The initial typecheck found the new descriptor guard used `SHA256` instead of
the existing Shared `SHA-256` literal; only that new guard was corrected.
A subsequent invalid-decimal schema-refinement guard preserves normal safeParse
failures without throwing from a secondary arithmetic refinement. All final
648 cases and the final production build include these corrections.

Build executions again surfaced the **existing Next.js dependency security
advisory** before exiting 1. The same unchanged command succeeded on retry,
including after the final schema correction. Those failed receipts are not
reclassified; successful compilation/CodeQL does not remediate dependency security.
A separate dependency security upgrade remains recommended, not included here.
Existing Map filesystem-tracing warnings remain unchanged.

Saved session receipts: `operational-m1-focused-initial`,
`operational-m1-focused-final`, `operational-m1-related-regression`,
`operational-m1-final-regression`, `operational-m1-typecheck-final`,
`operational-m1-eslint-final`, `operational-m1-build`,
`operational-m1-build-retry`, `operational-m1-build-final` and
`operational-m1-build-final-retry`. Generated Next type-declaration path changes
were restored to the approved baseline, not included as a product change.

**JENAN OPERATIONAL FEASIBILITY ENGINE — M1 CHECKPOINT FOR OWNER REVIEW.**
**REAL-DATA OPERATIONAL FEASIBILITY ACCEPTANCE = BLOCKED / NOT VERIFIED.**
**M2 NOT STARTED. Sonar DEFERRED / PENDING. No main merge or Final Tag.**

## 12. M2 checkpoint — governed Data Center reads and exact source validation

The owner explicitly approved and CLOSED M1 at
`45e8db5dc1525a8fd88c0dc4603a69f22c0e895e`, accepting its saved gates:
174 Operational, 18 global boundaries, 192 focused coverage and 648 related
regression cases PASS. The historical Full Regression is **NOT CLAIMED PASS**.
Competitor gates remain frozen; its accepted historical failures are not repaired
or relabeled here. The existing Next.js dependency-security advisory remains a
separate debt, and CodeQL does not replace dependency remediation.

### Integration and exact selection

- Engine-local `data-port`, `datasets`, `data-sources` and the single
  `adapters/data-center-provider` are added. The pure package does not export
  the live adapter. No full operational calculations, persistence, replay,
  source registration/write, schema, UI, Map or prior-engine dependency is added.
- `prepareOperationalDataCenterInputs` accepts the model plus exactly one
  explicit `{ sourceId, versionId, checksum }`. The new strict wrapper leaves
  the accepted M1 model/request contract unchanged. It deliberately cannot
  discover "best", latest or an arbitrary old model or combine models silently.
- The adapter invokes only the unchanged governed `discoverDataCenterVersions`
  and `readDataCenterVersionContent` APIs with an EXACT version and expected
  checksum. Normal preparation performs one discovery and one content read.
  Trusted organization scope adds an exact scope check before a direct read.
- Data Center recomputes its full immutable-version checksum; this is not merely
  a SHA of JSON content. The pure pipeline checks pinned source/version/checksum,
  discovery/read metadata consistency and the returned recomputed-integrity
  assertion. It separately captures `contentHash` for the exact returned bytes.
- Missing, inaccessible, archived, superseded or unavailable pinned versions
  remain unavailable. No fallback to a newer version or substitution of another
  older version occurs. Exact historical replay is still deferred to M4; M2
  does not bypass current Data Center publication policy to access old versions.

### Governed operational dataset and compatibility

`jenan.operational-feasibility.source-dataset/v1` under the proposed
`operational-feasibility-model` type holds one complete model and an explicit
local source-record register. It is separate from M1's pure dataset/storage proof:
on-source evidence uses local IDs to avoid embedding the checksum inside the
bytes it hashes. `bindOperationalDataset` resolves every value/schedule/requirement/
scenario/sensitivity evidence ID to the selected exact input/version/checksum.
No production type or source is registered by the implementation.

- All local evidence IDs must resolve to unique records with reference,
  description and date. Model approval records reviewer/date/rationale/evidence;
  model/operand declarations, approvals and evidence records must predate model
  approval/evaluation. Governed VERIFIED, non-AI evidence is required.
- The published source ID, owner, ownership, license class/license, usagePolicy,
  retrieval rights and mandatory attribution must be valid. Export restrictions,
  provenance, freshness, quality, source scope and exact references remain in
  validated input/result descriptors. Approval is a governed attestation, not
  cryptographic identity verification or proof of external source authenticity.
- Exact model equality after M1 normalization prevents overriding approved
  targets, resource/unit definitions, productivity/method versions, role/calendar
  assumptions, scenarios, evidence or interpretations in the submitted model.
  PLAN stays PLAN; quotations do not become supplier commitments.
- Geography/sector taxonomy/authority/version must match, source country/region
  coverage must support the model, and explicit site coverage must contain its
  exact site. Calendars/reporting periods must agree; no resampling, geography
  substitution, time-unit inference or methodology substitution.
- Source coverage explicitly declares COMPLETE/PARTIAL/NONE/UNKNOWN, inventory/
  sample completeness, site IDs, period IDs and evidence. Ready requires complete
  inventory coverage of every requested period, nonmissing operands and complete
  schedules. Explicit evidenced zero remains distinct from null/missing.
- M2 reuses M1 prerequisite diagnostics **without computing operating values**.
  Unsupported networks remain NOT_SUPPORTED. Unit/resource/cohort incompatibility
  and zero method denominators are NOT_COMPUTABLE. Missing/partial schedules,
  missing operands, quotation/unknown commitments, incomplete receipt timing,
  unknown applicability or absent declared scenarios keep preparation PARTIAL,
  not numerical zero or operational readiness.
- Expired/not-yet-effective sources are rejected. Stale/unknown freshness and
  source age beyond the declared freshness window keep preparation PARTIAL,
  even if a malformed port claims FRESH. Future metadata/record/approval dates
  are rejected; legitimate future planned operating periods are not actuals.

The preparation result contains status/reason/ready, normalized request, authorized
source/record/input descriptors, restrictive rights/attribution, work counters,
limitations and deterministic request/input/output hashes. `AVAILABLE` means only
**exact approved inputs validated**, not a feasible project or completed operation.
No operating metrics, Operational Score, success probability, AI/LLM, scraping,
launch/investment recommendation, financial recalculation or persistence is exposed.

### Current authorization, integrity and error behavior

The server supplies actor, organization, specialty and mission context. The model
cannot grant access. Existing current source scope, permission, organization
membership, specialty/mission and explicit robot-grant policies are enforced on
discovery and direct reads. Reusing a provider does not cache access approval:
retrieval revocation, archive, membership suspension and robot-grant revocation
are rechecked against current state.

Hidden/absent source versions return the same NOT_AVAILABLE shape without content
or metadata. Known integrity mismatches have explicit INTEGRITY_ERROR / checksum
failure handling only after governed access. Robot-policy errors, unrelated
Data Center errors and backend failures propagate; no broad catch converts them
to success or cached data. Provider actor/context are copied at creation.

M1 byte/work limits run before I/O. The port limits content to 200,000 characters,
one exact discovery candidate and one content read. Local source records plus
values/schedule rows/requirements are bounded to 10,000, with existing scenario,
work/metric and 2 MiB preparation-output limits. Oversized requests/data and invalid
contracts fail explicitly; no truncation or source combination.

### Saved verification

| Gate | Result |
| --- | --- |
| Operational M1–M2 unit/isolation cases | **236/236 PASS**: 90 contracts, 32 decimal, 14 confidence, 10 bounds, 29 isolation/registration, 55 source-validation and 6 provider cases |
| Global engine boundaries | **18/18 PASS**; Operational plus global coverage **254/254 PASS** within the final runner |
| Final related unit regression | **710/710 PASS**, 24 files, no skips: 236 Operational + 235 unchanged Financial + 239 Shared/global |
| Operational synthetic PostgreSQL | **23/23 PASS**, including no-write exact preparation, real checksum tampering, no version substitution, source restrictions/revocations and compatibility |
| PostgreSQL / Data Center regressions | **103/103 PASS** in six files: 23 Operational + 80 existing Data Center foundation/constraints/discovery/version-content/workflow cases; 99.97 s |
| Frozen schema readiness | All **78 unchanged migrations** on owned disposable PostgreSQL **17.5**, PostGIS **3.5.2** installed; no new Operational spatial analysis or real-data acceptance claimed |
| TypeScript / scoped zero-warning ESLint | PASS |
| Production build | PASS on unchanged retry; initial build stopped on the existing Next.js dependency-security advisory, retained separately as security debt |
| Post-build TypeScript / git diff --check | PASS; generated declaration paths restored; frozen runtime, Shared, Data Center, prior engines, Prisma and dependencies unchanged |
| Owned validation environment cleanup | Completed: only the M2 scratch container and its anonymous volume removed; unrelated PostgreSQL container retained |
| Full regression | **NOT CLAIMED PASS**; accepted historical Competitor exceptions remain unchanged; broad suite not rerun |
| M3 / live calculations / persistence / replay | NOT STARTED |

The first typecheck caught singular specialty/mission fields in the **new test
fixture** instead of the existing plural `specialties`/`missionContexts` API.
Only that fixture was corrected; final PostgreSQL and unit results include the
correction. No frozen source/policy/schema or performance limit was changed.
Owned DB fixtures roll back, assert their `se_operational_m2_*` database identity
before mutation, and compare source/type/item/version/audit/event/usage/Run/Input
counts across successful preparation to prove it writes nothing.

Saved session receipts: `operational-m2-unit-initial`,
`operational-m2-typecheck-initial`, `operational-m2-eslint-initial`,
`operational-m2-db-initial`, `operational-m2-related-regression`,
`operational-m2-migrations`, `operational-m2-db-final`,
`operational-m2-unit-final`, `operational-m2-typecheck-final`,
`operational-m2-eslint-final`, `operational-m2-build`,
`operational-m2-build-retry` and `operational-m2-typecheck-postbuild`.

The existing Next.js advisory recommends a security upgrade. No dependency was
changed or warning suppressed in M2; the initial failed build remains a failed
receipt, while the unchanged retry passed. CodeQL is not dependency remediation.
Generated Next declaration-path drift was restored to the accepted baseline.

**JENAN OPERATIONAL FEASIBILITY ENGINE — M2 CHECKPOINT FOR OWNER REVIEW.**
**REAL-DATA OPERATIONAL FEASIBILITY ACCEPTANCE = BLOCKED / NOT VERIFIED.**
**Sonar = DEFERRED / PENDING. M3 NOT STARTED. No Final Tag or main merge.**

## 13. M3 checkpoint — deterministic operational calculations

The owner approved and CLOSED M2 at
`3728dcafff7f797dcefddb0dd3f0da9118314b7e`. All M2 gates and the synchronized
Local/Remote/Desktop baseline were accepted. This checkpoint implements M3 only;
the historical M1/M2 sections above retain their milestone-specific evidence.
M4 persistence/replay/recovery and M5 final technical acceptance are not started.

### Explicit, governed calculation semantics

The accepted M1 contract did not distinguish scheduled time from setup/unavailable
time, or aggregate labor time from labor-per-unit plus fixed labor. M3 therefore
adds an optional, strict engine-local `calculationSemantics` field to the existing
model, without changing the meaning of any legacy value or schedule:

- Resource entries pin one stage/period, scheduled resource-time operand,
  dedicated setup/unavailable operands and a declared
  `COMPLETE_NONOVERLAPPING` loss-accounting attestation. A positive cycle-time
  operand or explicit net-good-output rate is selected, never inferred.
- Workforce entries pin role/output/period, explicit labor-time-per-output
  and fixed labor time, complete nonoverlapping allocation, and either continuous
  FTE or homogeneous full-time staffing semantics. Available qualified hours and
  productive hours/FTE remain explicit schedules; headcount is not an input.
- Every referenced operand must exist; stage/period identities are checked.
  Duplicated calculation allocations and reuse of dedicated losses/fixed labor
  as another schedule's consumption are rejected. Dimensional compatibility is
  checked before arithmetic. Missing semantics return NOT_COMPUTABLE, never
  assumed zero losses, a workday duration, a staffing calendar or productivity.
- Legacy M1/M2 requests without the field remain valid. Their original foundation
  result/hashes and accepted tests are preserved; M3-dependent metrics remain
  unavailable until the missing semantics are supplied in an approved version.
- The optional field flows through the existing source dataset's model shape,
  full-version checksum, binding and exact normalized model equality. It is not
  a caller-side override. The same read-only adapter now exposes
  `calculateOperationalDataCenterInputs`; no second adapter or source registry
  is added. Server actor/context and current M2 authorization are still required.

`calculateOperationalData` performs strict request/size/work/output planning
before I/O, then runs the unchanged governed source-preparation gates. Only
AVAILABLE/ready input preparation executes calculations. Partial, stale,
unavailable or incompatible preparation returns an explicit preparation state
and `result: null`; it never returns computed zero or cached source content.
The pure `calculateOperational` entry point supports synthetic validation and
per-metric gaps; it does not provide authorization or attest real source approval.

### Implemented formulas and interpretation

| Calculation | Implemented behavior |
| --- | --- |
| Net Resource Time | Explicit scheduled resource-minutes minus separately declared setup and unavailable minutes; negative remainder is NOT_COMPUTABLE, not clamped |
| Stage Capacity | Net minutes divided by positive minutes/good-output-unit, or net minutes multiplied by explicit compatible net output rate; exact minute/hour conversion only |
| Effective Output | NET_GOOD_OUTPUT capacity, floored only for explicitly indivisible deliverables; no second multiplication by observed/assumed quality yield |
| Simple Serial Bottleneck | Minimum comparable serial stage capacity; all exact tied stage IDs retained; unsupported topology/shared pool/mixed output/gross-or-unknown loss basis remains NOT_SUPPORTED |
| Required Resource Time | Declared PLAN target multiplied by explicit compatible stage cycle requirement; no demand/sales inference |
| Capacity Gap / Spare Capacity | Positive part of target minus deliverable serial capacity / capacity minus target |
| Load Ratio | Required resource minutes divided by positive net available minutes, times 100; overload above 100 retained; zero capacity can yield a computable gap but no numeric load ratio |
| Labor Requirement | Explicit target times declared labor-hours/unit plus explicit fixed labor-hours, by role/period; no machine-time-to-labor conversion |
| FTE / Staffing | Required hours divided by explicit positive productive hours/FTE; hours gap and continuous FTE gap use declared qualified availability; staff units ceil only for homogeneous full-time method |
| Supplier Shortfall | Positive part of declared consumption minus usable dated committed supply; quotations/unknown commitment status block a complete shortfall instead of becoming supply |
| Inventory Balance / Shortage | Opening usable stock plus dated usable receipts plus signed adjustments minus consumption; exact signed balance carried between contiguous periods; any supplied later opening must reconcile |
| Inventory Outputs | Receipts, consumption, signed projected balance and positive projected shortage are separate; negative balance means projected backlog/net requirement, not physical negative stock |
| Reorder Threshold | Explicit consumption rate times compatible calendar-day/working-day lead time plus explicit safety stock; no optimal order or procurement recommendation |
| Observed Yield / Rejection Ratio | Accepted/inspected and rejected/inspected times 100, with positive same-cohort observed counts and accepted + rejected = inspected |
| Prerequisite Gaps | Declared missing/expired/conflicted findings and evidence, with gap count only when applicability is complete; no readiness score or compliance certification |
| Scenarios / Sensitivity | Only named independent overrides and explicit one-at-a-time low/base/high points; original base model retained, failing/null points preserved, no Cartesian sweep or invented variation |

Complete evidenced empty schedules can explicitly state no applicable items.
An absent row in another incomplete/undeclared schedule is not zero. Material
definitions, resource pools, roles, time bases, reporting calendars and inspection
cohorts cannot be silently substituted. Period-end supply/inventory arithmetic
does not establish intraperiod service or delivery availability.

Continuous arithmetic retains the existing locally cloned precision-34,
HALF_EVEN decimal context. `exactValue` means the unreported result in that
versioned decimal context, not an infinite-precision rational number; `value`
uses six-place reporting. No intermediate reporting rounding precedes gap,
load, bottleneck or inventory comparisons. Overflow fails explicitly.

### Result, confidence, hashes and limits

The new `jenan.operational-feasibility.calculation-result/v1` result identifies
engine version `1.0.0-m3` and phase `M3_CALCULATIONS`, separate from the accepted
M1 foundation result. Each metric contains method/version, exact/reported value
or null, dimensional unit, site/period/entity/variant, operand and assumption IDs,
exact input/version/checksum/source-record evidence, evidence-quality confidence,
reasons, limitations and any limiting stages. Rights/required attribution remain
derived from retained exact inputs. Approved plans remain assumption-based
ESTIMATED outputs; observed quality remains an OBSERVED_RATIO.

Confidence uses the unchanged weakest-factor policy over essential source
descriptors, not unrelated inputs, and never means operational success.
Unavailable metrics have null values and confidence. Prerequisite findings
remain evidence findings, not invented numeric confidence.

Normalized request/input/output hashes are deterministic. Output hashes exclude
only run ID and execution timing, retaining evaluatedAt and method/policy versions.
`validateOperationalCalculationResult` fully recomputes and compares semantics,
not just a caller-provided hash; changing a metric and recomputing its hash still
fails validation. Input collection ordering is normalized; serial stage order
and chronological periods remain meaningful.

The existing limits are not raised: 1,000 combined base items (now also counting
calculation entries), 10,000 expanded rows, 500 scalar metrics/findings,
20,000 work units and 2 MiB payloads. Exact expanded output/finding planning
runs before source I/O. Actual metric/operand/schedule/evidence work is additionally
metered against the same 20,000-unit budget; exhaustion throws explicitly.
No truncation, partial save, persistence, historical replay or recovery is added.

### Saved verification

| Gate | Result |
| --- | --- |
| New deterministic M3 calculation cases | **94/94 PASS** |
| Operational M1–M3 unit/isolation regression | **330/330 PASS** |
| Global engine boundaries | **18/18 PASS**; combined Operational/global **348/348 PASS** within final related runner |
| Final related unit regression | **804/804 PASS**, 25 files, no skips: 330 Operational + 235 unchanged Financial + 239 Shared/global |
| Operational PostgreSQL M2/M3 | **24/24 PASS**, including real published-model calculations/no writes and current retrieval revocation |
| PostgreSQL / Data Center related regression | **104/104 PASS**, six files: 24 Operational + 80 unchanged Data Center cases; **71.76 s** |
| PostgreSQL / PostGIS / schema | PostgreSQL **17.5**, PostGIS **3.5.2**, all **78 unchanged migrations** applied to owned disposable DB |
| TypeScript / post-build TypeScript | PASS |
| Scoped ESLint with zero warnings | PASS |
| Production build | PASS on unchanged retry; initial dependency-advisory failure retained separately |
| git diff --check / frozen paths | PASS; no Shared, prior-engine, Data Center runtime, Prisma, Map, UI, workflow or dependency changes |
| Historical Full Regression | **NOT CLAIMED PASS**; accepted Competitor timing/database exceptions retained, broad suite not rerun |
| CodeQL / Sonar | No new M3 scan claimed; final acceptance remains later; **Sonar DEFERRED / PENDING** |
| Owned validation DB cleanup | Completed; only M3 container and its anonymous volume removed, unrelated PostgreSQL retained |

Hand-checked results include stages 240/180 against target 200, bottleneck 180,
gap 20, second-stage required time 400 and load 111.111111%; labor 30 hours,
5 FTE and 6-hour staffing gap; supplier shortfall 10; inventory -10 / shortage 10;
reorder threshold 14; observed yield/rejection 92%/8%. These are synthetic tests,
not production data or real-data acceptance. Additional checks cover exact tied
stages, minute/hour/rate methods, whole/continuous rounding, zero/missing inputs,
unsupported networks, incompatible units/cohorts, signed multi-period inventory,
scenario failure points, source-model mismatch, tampering and exact output/work
limits before I/O. Existing PostgreSQL `pg` deprecation warning remains a warning,
not a failed DB test or a newly fixed dependency.

The initial npm test-script invocation found no optional local `.env`; validation
used the existing Vitest configuration directly, with explicit scratch DB variables
only for integration tests. New fixture registration/type issues were corrected
before final passing receipts. No dependencies were installed or changed.
The initial production build stopped on the already documented Next.js
dependency-security advisory; the unchanged retry succeeded. A separate security
upgrade remains recommended, and CodeQL is not dependency remediation.
Generated Next declaration-path drift was restored before post-build typecheck.

Saved session receipts: `operational-m3-focused-initial`,
`operational-m3-focused-governed`, `operational-m3-focused-final`,
`operational-m3-related-initial`, `operational-m3-unit-final`,
`operational-m3-migrations`, `operational-m3-db-final`,
`operational-m3-typecheck-final`, `operational-m3-typecheck-postbuild`,
`operational-m3-eslint-final`, `operational-m3-build`,
`operational-m3-build-retry`.

**JENAN OPERATIONAL FEASIBILITY ENGINE — M3 CHECKPOINT FOR OWNER REVIEW.**
**REAL-DATA OPERATIONAL FEASIBILITY ACCEPTANCE = BLOCKED / NOT VERIFIED.**
**Sonar = DEFERRED / PENDING. M4 NOT STARTED. No Final Tag or main merge.**

## 14. M4 checkpoint — atomic persistence and exact historical replay

The owner approved and CLOSED M3 at
`d4396ca777a58a0ae2287cbe74e6c67aa2c49348`, authorizing M4 only.
The accepted calculation implementation, method IDs, version `1.0.0-m3`,
decimal/rounding/confidence policies, contracts and arithmetic are unchanged.
This milestone adds only engine-local history and adapters; M5 is not started.

### Recorded evidence and atomic persistence

- `run-history.ts` captures exactly one governed EXACT discovery and one expected-
  checksum content read. It retains the original immutable source bytes, reference,
  source/version/checksum, original operational model and approved assumptions,
  schedules, loss/productivity/labor semantics, scenarios, sensitivity, approvals
  and local source-record register. Missing/hidden sources remain unavailable;
  partial/stale/incompatible preparation rejects explicitly, without saved guesses.
- `buildOperationalRunRecord` validates the M3 result by full recomputation and
  reproduces it through the saved source transcript before accepting a record.
  No guessed runtime, current model or latest-version lookup substitutes for
  original evidence. A calculation-only synthetic result cannot be persisted
  as a governed run without a matching approved source transcript.
- `jenan.operational-feasibility.run-history/v1` records trusted replay scope and
  exact calculation, decimal, rounding and confidence policy versions. The current
  supported calculation version remains `1.0.0-m3`; unknown engine/policy versions
  fail, never silently upgrade. Canonical request/input/output hashes retain
  original evaluatedAt; only run ID and execution timing are excluded from the
  unchanged M3 output hash.
- The existing `AnalysisEngineRun` result JSON is Output; no new Output table,
  migration, foreign key or schema is added. Run/result plus all nested Input rows
  commit in one RepeatableRead transaction. Inputs repeat exact version/source/
  type/checksum, content SHA, original model provenance and declared usage intent.
  All these repeated columns are checked again when read.
- Current source authorization is checked again inside the persistence transaction,
  not merely during preparation. Persisted actor identity must match the trusted
  principal. Duplicate run IDs fail at the unchanged unique constraint without
  overwrite; a three-way race commits exactly one Run/Input pair.
- Failure inserting a nested Input rolls back the parent Run and its Output;
  the same run ID can then be retried successfully. A later duplicate still fails.
  There is no update/upsert/delete or cleanup compensation path in the adapter.
  Existing append-only database triggers protect both Run and Input rows.

### Exact historical replay and current authorization

`replayOperationalAnalysis` reads history through a new transaction, applies owner/
admin history filtering, and reauthorizes retained exact source references before
validating or recomputing stored calculations. Foreign and nonexistent Run IDs
produce the same `OperationalHistoryUnavailable` response, with no stored model
or source metadata returned.

The narrow `historical-data-center` adapter reads only the exact stored version
ID. It recomputes the full unchanged Data Center immutable-version checksum,
checks original source/type/item/layer/version number and compares retained bytes.
It may read a superseded exact version when its parent item is still published
and accessible; it never resolves latest or chooses any substitute version.
Missing historical versions, changed bytes/checksums or inconsistent stored
provenance/usage/columns fail explicitly.

Current source scope, required permissions, organization membership, unresolved
conflicts, retrieval rights, ownership, license/usage/export/attribution and trusted
specialty/mission scope are enforced. Current robot grants must be unrevoked,
unexpired and backed by current robot mission assignment. Stored evaluation time
cannot revive a grant or membership. Changed rights conservatively make history
unavailable; replay does not widen export rights or replace historical descriptors.

After authorization and integrity checks, pure replay feeds only the original
recorded discovery/content transcript back through M2/M3, with the original model,
evaluatedAt and calculation policies. It recomputes the full result and compares
canonical semantics, not just supplied hashes. A newer model or a changed source
freshness window does not replace historical assumptions/confidence. Current
authorization and historical evidence quality are deliberately distinct.

Replay has no live latest discovery, Data Center write, audit/usage write,
Run/Input insert, update or delete. PostgreSQL row counts are unchanged across
replay. Backend failures propagate; there is no cached-success fallback.
Checksums detect inconsistency but are not signatures against an administrator
who can rewrite all records, source bytes and checksums consistently.

### Bounds, isolation and verification

Transcript operation count is exactly two, source content retains its existing
200,000-character bound, and the canonical record plus expanded stored input
provenance/usage envelope must fit the existing 2 MiB history limit. No calculation
or performance threshold is raised. The only new live capabilities are four exact
Operational history adapters, allowlisted by path and import in local/global tests;
the pure index exports no adapter.

| Gate | Saved result |
| --- | --- |
| New pure Operational history cases | **28/28 PASS** |
| Operational M1-M4 unit/isolation cases | **358/358 PASS** |
| Global engine boundaries | **18/18 PASS**; Operational/global coverage **376/376 PASS** within final related runner |
| Final related unit regression | **832/832 PASS**, 26 files, no skips: 358 Operational + 235 unchanged Financial + 239 Shared/global |
| M4 PostgreSQL history/recovery/access cases | **35/35 PASS**, targeted final runner **32.08 s** |
| Operational M2/M3 + Data Center PostgreSQL regressions | **104/104 PASS**, six related regression files' results retained from the combined run; 24 Operational + 80 Data Center |
| Atomic commit / duplicate race / rollback-retry / append-only | PASS, including real committed transactions and injected nested-input failure |
| Original-version replay / tamper detection / no latest fallback | PASS |
| Current authorization / no existence leak / read-only replay | PASS |
| PostgreSQL / PostGIS / schema | PostgreSQL **17.5**, PostGIS **3.5.2**, **78 unchanged migrations** applied; no spatial acceptance claimed |
| TypeScript / post-build TypeScript | PASS |
| Scoped ESLint with zero warnings | PASS |
| Production build | PASS on unchanged retry; initial existing Next.js advisory failure retained |
| git diff --check / frozen boundaries | PASS; no Shared, prior-engine, Data Center runtime, Prisma, Map/UI, workflow or dependency changes |
| Historical Full Regression | **NOT CLAIMED PASS**; accepted Competitor debt unchanged, broad suite not rerun |
| Sonar / M5 | **DEFERRED / PENDING** / NOT STARTED; no new CodeQL scan claimed |

The first expanded combined DB command failed only new M4 fixture checks:
an attempted grant-expiry update was correctly rejected by the frozen immutable
grant trigger, and two newly added tests were nested rather than registered.
The fixture now advances only the test Date clock to verify actual grant expiry
(restored in finally); no grant trigger/policy was changed. Test registration was
corrected and checked by the existing AST guard. The targeted final history run
passes all 35 collected cases. The six regression files had already passed;
their saved 104 passing cases were not rerun. The earlier failed combined
137-case command is retained as failed, **not relabeled a combined PASS**.
Initial test-only type errors (required role key and conflict fixture fields)
were corrected before final typecheck/DB receipts. No frozen implementation fix
was needed.

The inherited PostgreSQL driver deprecation warning remains a warning. The first
production-build command stopped on the existing Next.js security advisory; the
unchanged retry passed. A separate dependency-security upgrade remains recommended;
CodeQL does not remediate vulnerable dependencies. Generated Next declaration-path
drift was restored before post-build typecheck.

Saved session receipts: `operational-m4-focused-initial`,
`operational-m4-focused-final`, `operational-m4-unit-final`,
`operational-m4-unit-final-2`, `operational-m4-migrations`,
`operational-m4-db-initial`, `operational-m4-db-final` (failed combined command),
`operational-m4-db-history-final`, `operational-m4-typecheck-final-2`,
`operational-m4-typecheck-postbuild`, `operational-m4-eslint-final-2`,
`operational-m4-build`, `operational-m4-build-retry`.
Only the owned M4 disposable container and its anonymous volume were removed
after verification; unrelated PostgreSQL was left running.

**JENAN OPERATIONAL FEASIBILITY ENGINE — M4 CHECKPOINT FOR OWNER REVIEW.**
**REAL-DATA OPERATIONAL FEASIBILITY ACCEPTANCE = BLOCKED / NOT VERIFIED.**
**Sonar = DEFERRED / PENDING. M5 NOT STARTED. No Final Tag or main merge.**
