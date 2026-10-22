# JENAN OPERATIONAL FEASIBILITY ENGINE — M0 ARCHITECTURE REVIEW

## 1. Authority, baseline and mandatory stop

**M0 owner-approved at `136b36593a813c091704845a2bfc6d8d5165fe2e`.
M1 implemented for checkpoint review only. M2 NOT STARTED.**
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
M0 added no runtime scaffold. The owner subsequently authorized M1 pure contracts,
semantics, confidence, bounds, hashes and storage compatibility only.
The Financial branch and its Desktop archive remain at their accepted baseline.
Stop after the M1 checkpoint for owner review; do not start M2 or engine seven.

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
**M0 owner-approved. M1 checkpoint evidence follows; M2 NOT STARTED.**
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
