# JENAN OPERATIONAL FEASIBILITY ENGINE — M0 ARCHITECTURE REVIEW

## 1. Authority, baseline and mandatory stop

**M0 PROPOSAL ONLY — NOT APPROVED. M1 NOT STARTED.**
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
history rewrite, dependency install, runtime scaffold or implementation is authorized.
The Financial branch and its Desktop archive remain at their accepted baseline.
Stop after this M0 for owner review; do not start M1 or engine seven.

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
**M0 COMPLETE FOR REVIEW ONLY. M1 NOT STARTED.**
**Sonar = DEFERRED / PENDING. No main/integration merge or Final Tag.**
