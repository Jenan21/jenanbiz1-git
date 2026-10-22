# JENAN FINANCIAL FEASIBILITY ENGINE — M0 ARCHITECTURE REVIEW

## 1. Authority and stop

**M0 APPROVED at `70eacc1a2c445af60f2a480bc096186083be371e`.
M1 CLOSED after NO M1-ATTRIBUTABLE PERFORMANCE REGRESSION.
M2 owner-approved / CLOSED at `166d48a8c689f18ccf6e70fa1accf654fb0fb0a0`,
with four pre-existing Competitor PostgreSQL failures retained as NOT PASS.
M3 owner-approved / CLOSED at `fc38b498aad426ecbd2a17c754b3b32ad7aacb30`.
M4 owner-approved / CLOSED at `b6fb4a3f8d765f7ce3c43dfc5eec38cb099b9618`.
M5 owner-approved / technically CLOSED on 2026-10-22:
TECHNICALLY COMPLETE — PENDING FINAL SONAR.
Real-data acceptance remains BLOCKED / NOT VERIFIED.**
The owner approved engine four's final technical closure on 2026-10-22 and explicitly
designated `10dcafcf27c45db8b371fa5b79ac9da6bc4f21a5` as its Final Technical SHA.
Its code/test candidate `f9b44b849e6cec93631db20cbb9c2b795058e836` remains the
exact-SHA CodeQL target; the accepted SHA is its documentation-only closure child.
These roles are explicit, not competing unexplained candidates.

Four engines are **TECHNICALLY COMPLETE — PENDING FINAL SONAR**:

| Engine | Accepted technical baseline |
| --- | --- |
| Spatial | `8d97baace8abd6889f400a56952e345f3068f3af` |
| Market & Demand | `c54d647838c1ce10730277f3977abc4980c3715d` |
| Competitor Analysis | `eaa2d09374593d5677fc77c3efbc4f5a3e42e4a0` |
| Opportunity & Gap | `10dcafcf27c45db8b371fa5b79ac9da6bc4f21a5` |

Data Center stays frozen at `04d6148dfb875532404059adb55fcac8ee6913b2`.
The original M0 was a documentation-only proposal. The owner subsequently approved
it and authorized M1–M5 separately, recorded in sections 11–16. No production-data acceptance,
main/integration merge,
final tag, Sonar, frozen engine/Shared/schema/Map/UI/Projects changes.

Planning branch `jenan-engines/financial-feasibility` starts from the accepted
engine-four closure to preserve all four baselines without changing integration.
The normal integration-promotion step requires separate approval before M1;
no merge or branch-history rewrite is implied by this plan.

References: [execution master](../design-references/Jenan-PRO/EXECUTION_MASTER.md),
its immutable three-archive extracted library, and financial-page spec
`043_المشاريع_دراسات_الجدوى/projects_feasibility_pro_financial/spec.txt`.
The spec names CAPEX, OPEX, revenue, cash flow, break-even, ROI, NPV, IRR and payback;
it does not supply approved financial inputs or calculation policies.
This phase adds no UI, and does not import the legacy workflow's formulas.

## 2. Purpose and exclusions

Calculate explainable **conditional financial projections** from explicit,
authorized, versioned assumptions. A computed projection is not realized revenue,
verified demand, a project success probability or a decision to invest.

v1 includes CapEx, OpEx, disclosed revenue assumptions, cash flow, gross/operating/
net margins, restricted-model break-even, simple payback, conditional NPV/IRR,
declared scenarios, bounded sensitivity and cash funding requirement.

Forbidden: invented prices, volumes, conversion/utilization/growth/default rates;
AI/LLM gap completion; network collection/scraping; final investment/financing advice;
success probability; composite financial viability score; lender selection or
funding-eligibility service; automatic cross-engine execution or direct imports
from Spatial/Market/Competitor/Opportunity; hidden zeroes for missing inputs.
The removed Funding Eligibility product remains removed in routes/navigation/reports.
`funding requirement` below is only a cash shortfall measurement, not that service.

Out of v1: FX conversion, tax/zakat/legal advice or automatic statutory tax rules,
automatic debt amortization/interest deduction, Monte Carlo, optimizer/recommended
scenario, automatic terminal valuation, mid-period payback interpolation, irregular-date
XNPV/XIRR, multiple-root IRR selection, multi-product break-even without an approved
sales-mix method, inflation-rate inference, and a standalone ROI definition.
The legacy page's ROI label does not authorize adding ambiguous ROI to this scope.

## 3. Architecture and reuse

`authorized exact Data Center snapshots -> validated financial model and assumptions
-> pure decimal calculations -> engine-local result + Shared-compatible metadata
-> append-only existing Run/Input storage -> exact historical replay`.

- Pure engine: proposed `services/analysis-engines/financial-feasibility`.
  Contracts, normalization/decimal policy, model validation, confidence, calculations
  and run-history arrive only in their approved milestones; no M0 scaffold.
- Narrow read adapter uses unchanged Data Center access and exact version/checksum
  APIs. No production registry/source writes, direct SQL source bypass, external
  network, or caller-asserted source authorization.
- Declared owner assumptions are valid model inputs, not observed facts. For live
  persisted runs they must be governed versioned financial input records, including
  author/approval/date/rights. M1 pure fixtures need no live publication.
  No pretending Data Center holds a private assumption that was never registered.
  If its existing publishing controls cannot support the necessary private input,
  report the capability gap before adding a new input channel.
- Upstream engine facts may later arrive only via an approved trusted orchestrator
  contract with original source lineage, versions/hashes and current reauthorization.
  v1 does not depend on that future channel and does not convert demand to sales.
- Reuse unchanged Shared canonical hashing, errors, states, bounds, confidence
  helpers, rights/provenance conventions and existing Run/Input tables where valid.

**Verified integration constraint:** Shared quantity dimensions do not include MONEY;
its numeric metric/record validators are not a ready-made decimal monetary contract.
Do not label money as ITEMS/INDEX, coerce strings with casts, or extend frozen Shared.
Propose strict engine-local monetary/rate/financial-metric contracts and record
validation over the existing generic JSON storage. M1 must prove envelope/history
compatibility with focused contract tests and identify reusable helpers precisely.
If a required Shared/schema change remains necessary, stop for explicit approval.
No lossy numeric conversion simply to satisfy a Shared metric validator.

## 4. Proposed contracts and input semantics

Contracts:
`jenan.financial-feasibility.request/v1`,
`jenan.financial-feasibility.dataset/v1`,
`jenan.financial-feasibility.result/v1`.

| Input group | Required meaning |
| --- | --- |
| Model identity/scope | Versioned subject, geography/sector, scenario, author, model purpose |
| Calendar | Explicit t0, full contiguous MONTHLY or ANNUAL periods, horizon, timezone; no implicit partial-year allocation |
| Monetary policy | One explicit ISO currency, precision, price base date, NOMINAL or REAL basis, rounding policy |
| Assumptions | ID, value/unit, definition, author/date, rationale, exact source/version/hash/record or declared-owner origin, approval and limitations |
| Revenue | Per-product quantity and price by period, common sales unit, explicit returns/discount/tax treatment; or declared net revenue schedule, never both counted |
| Costs | Item IDs, category, fixed/variable and COGS/operating classification, amount or quantity x rate, period, cash timing, inclusion/exclusion completeness |
| CapEx | Asset/expenditure schedule including t0; no automatic depreciation or salvage assumptions |
| Working capital | Explicit change-in-working-capital schedule and treatment, including any recovery; missing is not zero |
| Accounting bridge | Explicit depreciation/amortization, finance expense and tax/zakat expense schedules for requested profit metrics |
| Cash bridge | Explicit cash tax, other operating cash items, finance/equity injections, debt cash flows and distributions with separate classifications |
| Valuation/payback | Cash-flow basis, approved-for-this-model rate/period/basis, horizon; no assumed WACC or hurdle rate |
| Scenarios/sensitivity | Named full overrides or declared perturbations, allowed parameter IDs and bounds; no invented optimistic/pessimistic multipliers |
| Funding | Minimum cash reserve, t0 available cash, eligibility/timing of committed cash and declared funding basis |
| Governance | Exact Data Center source/version/checksum pins, evidence records, rights/license/usagePolicy, freshness/coverage |

Proposed dataset roles: `financial.model-assumptions`, `financial.revenue-schedule`,
`financial.cost-schedule`, `financial.capex-schedule`, `financial.cash-adjustments`,
`financial.financing-schedule`, `financial.scenarios`.
They may be sections of one pinned dataset rather than duplicated sources.
Final typeKeys/grouping require M1/M2 compatibility review, not M0 registration.

Actor/org/robot context, run ID and timing are trusted server execution fields.
Values distinguish OBSERVED, DECLARED_ASSUMPTION and DERIVED; explicit zero requires
an evidenced declaration, while missing/unknown stays null. Complete empty schedules
must explicitly assert no applicable items, not rely on absent arrays.
Unique item IDs and mutually exclusive input modes prevent double counting.

## 5. Numerical, time and accounting policy proposed for approval

- Money and rates use canonical base-10 decimal strings, bounded magnitude/scale,
  never unrestricted JavaScript floating-point monetary arithmetic.
  Inspect existing decimal dependencies in M1 before choosing a library; no M0 install.
  Proposed precision: 34 significant digits, HALF_EVEN; supported currency minor
  units explicitly versioned. Keep unrounded intermediates within that precision;
  round reported amounts only. Reject overflow/excess precision, never truncate.
- One currency per model; mismatched currency, real/nominal basis, calendar or units
  blocks affected metrics. Rates must be declared per model period in the same basis;
  no guessed annual/monthly conversion, escalation or price index.
- Separate accrual revenue/costs from collections/payments. Revenue recognition is
  not a cash receipt. A disclosed complete conversion schedule is required for cash
  flow; an optional explicitly chosen same-period-cash model is an assumption.
- Net sales exclude collected indirect tax. VAT/tax recovery/payment schedules
  require explicit inputs; never assume a jurisdiction's rates/exemptions.
- CapEx is not an immediate OpEx expense. Depreciation is noncash. Interest expense
  is not loan principal; debt/equity injections are not revenue.
- No automatic roll-up of incompatible periods, allocations, business mix, tax loss
  carryforwards or terminal proceeds. Explicitly declared deterministic schedules
  may model such amounts without implying legal/economic validation.

## 6. Metric formulas, prerequisites and failure states

Every metric includes formula ID/version, operands, currency/unit, period, accounting
and cash-flow basis, assumptions, source/record references, evidence class, confidence,
rights, limitations and state. Required missing components block the dependent total,
not unrelated metrics. A subtotal may be PARTIAL only when prominently identified
as a non-total and never fed into valuation/financing as a complete model.

| Metric | Proposed deterministic rule and guards |
| --- | --- |
| CapEx | Sum distinct declared capital cash expenditures by scheduled period, with separate depreciation |
| OpEx / COGS | Sum complete declared expense schedules by classification; variable quantity x unit cost only with declared compatible drivers |
| Revenue | Declared net schedule OR sum of declared product quantity x price with explicit adjustments; output remains a projection if any driver is assumed |
| Gross profit / margin | Net sales - COGS; margin = gross profit / net sales x 100 |
| Operating profit / margin | Gross profit - operating expenses - D&A not already included; explicit mutually exclusive cost classifications prevent double counting |
| Net profit / margin | Operating profit + declared non-operating income - finance expense - declared tax/zakat expense and other declared non-operating costs |
| Margin guards | Require positive net sales; zero/negative denominator => null / NOT_COMPUTABLE with reason, never Infinity/0%; negative margins are allowed |
| Project free cash flow | Direct-cash mode: actual scheduled operating collections - operating cash payments - cash taxes - CapEx + declared project disposal cash; working-capital effects are already in collections/payments, never subtracted again. Alternative accrual-bridge mode: operating profit + D&A - cash taxes - CapEx - increase in working capital + declared project disposal cash. Require a complete reconciliation; never combine the two modes or include debt/equity funding flows |
| Closing liquidity | Opening cash + separately classified operating/investing/financing net cash flows, reconciled by period including t0 |
| Break-even | Single product, linear fixed-cost/variable-unit model only: contribution = net unit price - variable unit cost; units = fixed expense / contribution; whole units round up; sales = units x price |
| Break-even guards | Same period/classification/unit; positive contribution and price; zero fixed expense yields zero break-even; no guessed mix or sales ramp. Cash vs accounting fixed-cost basis must be labeled; default metric proposed is accounting break-even |
| Simple project payback | First period-end when cumulative complete undiscounted project CF (including negative t0 outlay) is nonnegative after an initial outlay. No linear interpolation; report first crossing and later deficits separately |
| No payback | Complete horizon without crossing => explicit NOT_REACHED_WITHIN_HORIZON, numeric null, not "never"; no negative initial outlay => NOT_APPLICABLE; incomplete CF => NOT_COMPUTABLE |
| NPV | CF0 + sum(CFt / (1+r)^t), end-of-period equally spaced project CF, explicit per-period r > -1; r=0 is valid; zero terminal value only if explicitly declared |
| IRR | Same complete project CF series, negative t0 followed by nonnegative CF and at least one positive CF only; other sign patterns => NON_CONVENTIONAL_CASH_FLOWS / NOT_COMPUTABLE, no arbitrary root |
| IRR solver | Deterministic bracketed bisection, explicit versioned bounded search domain strictly above -1, fixed iteration/residual tolerances proposed and tested in M1/M3; no sign bracket or convergence => null with distinct reason, not fabricated zero |
| Scenario analysis | Run each explicitly supplied scenario independently; compare only compatible currencies/bases/horizons. Missing scenario assumptions stay missing; no automatic best-case recommendation |
| Sensitivity | One-at-a-time finite differences at explicitly supplied low/base/high driver values; hold other assumptions fixed, expose resulting metric deltas and failed points; no hidden +/-10%, derivatives, Cartesian sweep or causal claim |
| Gross cash funding requirement | max(0, reserve - minimum cumulative pre-new-financing cash balance), including t0; includes all complete operating/investing cash obligations under the declared unlevered basis |
| Residual cash funding gap | Separately include only explicitly committed financing/available cash at declared dates; exclude candidate/proposed funding and avoid duplicate opening-cash inclusion |

Funding is horizon- and period-granularity-dependent; a monthly close does not prove
no intramonth shortage. The residual gap is not credit eligibility, a financing
recommendation or proof that funding will be obtained. Discounted project cash
flow and liquidity cash flow must not be substituted for one another.

## 7. Result, confidence and missingness

Proposed states reuse Shared meanings where applicable:
COMPUTED / PARTIAL / ESTIMATED / NO_COVERAGE / NOT_AVAILABLE / NOT_COMPUTABLE.
Per-metric reason codes cover missing required assumption, incompatible dimensions,
incomplete expense/cash schedule, duplicate item, zero denominator, nonpositive
contribution, payback not reached/not applicable, nonconventional IRR, unbracketed
root, numerical nonconvergence and unsupported method.
Invalid structural requests fail explicitly; valid requests with unavailable inputs
produce truthful nulls and reasons, not success-shaped invented numbers.

Calculation validity and evidence certainty are separate. A perfectly deterministic
assumption-based projection is still assumption-based, not verified revenue.
Proposed `financial-confidence-v1` evaluates source/provenance, completeness,
accounting coherence, calendar/currency compatibility, assumption approval/freshness
and method applicability. Exact factor points/caps require M1 review/tests:
no invented score weights approved implicitly by this M0.
Cap derived confidence at the weakest essential input; unvalidated declared-owner
assumptions cap at LOW; even owner-approved projections cannot become verified
actuals. Missing essential inputs => null value/confidence. Confidence is not
investment attractiveness, forecast accuracy or project success probability.

Result carries normalized model, assumption register, schedules and reconciliations,
all requested metrics/scenarios/sensitivity points, source lineage, rights/attribution,
limitations, engine/method/decimal/confidence versions, evaluation instant and
request/input/output hashes. Restrictive rights propagate across every scenario,
including retained/excluded evidence; do not export unsupported formats.

## 8. Bounds and reproducibility

Proposed bounds, measured and finalized in M1: <=32 exact versions, <=120 monthly
or <=30 annual periods, <=1,000 line items, <=10 scenarios including base,
<=20 sensitivity drivers with three explicitly supplied points each,
<=10,000 combined expanded input rows, <=500 scalar metrics/summary findings,
<=2 MiB canonical request/result/history payload and existing 20,000 cost units.
Schedule arrays are bounded separately and count against bytes/work. Estimate total
work across all scenarios/sensitivity/IRR iterations before expansion/I/O; no hidden
cross-product, silent truncation or partial save on a limit failure.

M4 proposes atomic append-only Run/Input writes using existing tables, governed
source snapshots and exact assumption/scenario/method/rounding versions.
Recheck current owner/org/robot/source/rights permissions before cached read/replay,
including retained metadata; foreign/missing errors must be indistinguishable.
Replay original exact versions, bytes, evaluation time and calculation version;
no latest fallback, new assumptions, live rate fetch, implicit upgrade or stale
cached-output success after a revoked permission. Detect input/transcript/result
tampering and mismatched hashes. Saves fail explicitly with no orphan inputs.

## 9. Proposed M1–M5 plan and acceptance

| Phase | Deliverable and mandatory stop |
| --- | --- |
| M0 | This architecture/formula/boundary proposal, owner closure of engine four; stop for review |
| M1 | Strict contracts, decimal/time/currency/accounting semantics, missingness/confidence, hashes/bounds, Shared/history compatibility proof and boundary fixtures; no live integration or full calculations |
| M2 | Read-only Data Center exact versions/checksums, source/assumption approvals, license/usage/provenance, period/currency/coverage/current permissions, no existence leak or fallback |
| M3 | Approved deterministic schedules, reconciliation, formulas, scenarios/sensitivity and bounded numerical solver; independent reference examples and edge cases |
| M4 | Atomic existing-storage Run/Input/Output persistence, exact historical replay/current authorization, append-only, hash/tamper and recovery verification |
| M5 | Final regression/fresh PostgreSQL/Data Center/PostGIS where applicable, committed load/concurrency/replay/recovery, boundaries/security, exact-SHA CodeQL, types/lint/build/diff and Local/Remote/Desktop sync |

Each milestone needs a checkpoint and explicit owner acceptance before the next.
No M1 runtime or package installation under this M0 authorization.

Required tests: decimal rounding/overflow, zero vs missing, assumed vs actual revenue,
quantity/price mismatch, duplicate costs and cost classification, CapEx/D&A separation,
revenue vs collections, principal vs interest, explicit tax treatment, working capital,
negative profit/zero sales, nonpositive contribution, capacity-independent break-even,
no payback/late deficit, NPV zero/negative valid rates, IRR known root/nonconventional/
no bracket/nonconvergence, scenario independence/no mutation, sensitivity failed points,
reserve/t0/committed funding timing, absent vs zero finance, exact pins/hash/rights,
no prior-engine imports, no IO in pure core, no latest fallback/no existence leak,
deterministic permutations/hashes, bounded work and atomic rollback/retry/replay.

M0 validation is documentation inspection and whitespace/change-scope verification.
It provides no runtime PASS claims and does not rerun accepted M5 tests.

## 10. Review decisions and current evidence

Approval requested for: the v1 scope/exclusions; explicit-assumption-only revenue;
single-currency/time/basis rules; decimal approach; formula/accounting/cash-flow
definitions; conservative conventional-only IRR; restricted break-even; period-end
payback; conditional cash requirement (not Funding Eligibility); local financial
contracts without frozen Shared edits; bounded scenarios/sensitivity; and M1–M5 split.
M1 will make the numerical solver policy and confidence factors explicit before M3.
Any material deviation requires another review, not silent implementation.

**REAL-DATA FINANCIAL FEASIBILITY ACCEPTANCE = BLOCKED / NOT VERIFIED.**
No production financial data/assumptions were queried or accepted. Not having
queried them does not prove the Data Center lacks them.
**REAL-DATA OPPORTUNITY & GAP ACCEPTANCE = BLOCKED / NOT VERIFIED** remains unchanged.
**Sonar = DEFERRED / PENDING. No final tag. No main merge.**
The original M0 stopped here. M1 below records only the separately authorized work.

## 11. M1 checkpoint — pure financial foundation

### Binding owner decisions and scope

The owner approved M0 and authorized **M1 only** on the synchronized
`70eacc1a2c445af60f2a480bc096186083be371e` baseline.
Revenue assumptions must be explicit and documented, never inferred from population,
competitors or demand. Both requested NPV and IRR are blocked until complete flows,
an explicit period discount rate and compatible timing are available. IRR does not
mathematically need an external discount rate, but this model gate implements the
owner's stricter explicit-input requirement; no rate is guessed.
Ambiguous/nonconventional IRR never selects an arbitrary root. Break-even needs
documented fixed costs and a positive compatible contribution margin.
Cash requirement is a measurement only; confidence describes evidence/methodology,
not a success probability. Missing financial values are null, never default zero.

Seven pure files under `services/analysis-engines/financial-feasibility`:
`decimal.ts`, `model.ts`, `request.ts`, `semantics.ts`, `confidence.ts`,
`contracts.ts`, `index.ts`. No adapter, network, source I/O, database writes,
schema, UI, Projects/Map connection, upstream-engine imports or M2 execution.
The planning branch continues from accepted engine four without a promotion merge.

### Implemented contracts and semantics

- Strict `jenan.financial-feasibility.request/v1` / `result/v1`, with result phase
  `M1_FOUNDATION` and engine `1.0.0-m1`.
- Versioned geography/sector, currency/price basis/base date, t0, ordered complete
  monthly/annual periods, cash-flow/timing basis, exact version/checksum pins,
  declared assumption register, evidence, accounting/cash schedules, valuation
  prerequisites, explicit scenario overrides and sensitivity disclosures.
- Assumptions retain author/time, approval, rationale, methodology, limitations,
  source record and exact version/hash. Scenario/sensitivity changes also require
  author/time/rationale/evidence. Future declarations and conflicting evidence
  input-ID/version identities are rejected.
- Request-supported currencies in this v1 foundation: SAR/USD/EUR/AED/QAR (2 minor
  units), JPY (0), KWD/BHD/OMR (3). Unsupported currencies fail explicitly; no FX.
- Exact pinned dependency `decimal.js@10.6.0`, isolated cloned arithmetic context,
  34 significant digits, HALF_EVEN. Inputs are plain decimal strings with at most
  18 integer/16 fractional digits; internally retained arithmetic results allow
  up to 34 significant digits and 64 fractional places. No binary money arithmetic.
  Inputs with excess scale/magnitude, division by zero and arithmetic overflow fail
  explicitly. Reporting alone rounds to the declared currency's minor units.
  Global Decimal configuration cannot affect the isolated arithmetic context.
- The package/lock change adds only the new exact dependency. Existing dependency
  versions remain unchanged. npm replaced this worktree's former node_modules
  junction with a local dependency installation; the original workspace files
  were not staged, edited or reset.
- Separate accounting and cash timing; revenue is either an explicitly declared
  monetary schedule or compatible declared sales quantity x price.
  A monetary amount/physical quantity cannot be consumed twice across line items;
  a price may be reused across distinct quantities. Accounting and cash-only
  assumptions cannot silently substitute for each other.
- Complete empty schedules require explicit no-applicable-items declarations and
  evidence, covering t0 and every model period. Absent/incomplete schedules block
  only dependent metric readiness. Direct-cash prerequisites do not subtract
  working capital again; accrual-bridge prerequisites explicitly require it.
- Readiness checks implement fixed-cost/price/unit compatibility, positive
  contribution, complete cash schedules, rate >-1, IRR policy presence,
  end-period valuation timing, and separately declared initial cash/reserve/
  committed financing. They do not calculate break-even, cash requirements or NPV.
- `classifyFinancialIrrCashFlows` checks only an explicitly supplied candidate
  cash-flow sign pattern: multiple sign changes => `AMBIGUOUS_IRR` and
  `NON_CONVENTIONAL_CASH_FLOWS`; no root is solved or selected in M1.
  The versioned future bisection configuration is explicit, bounded and immutable:
  [-0.9999, 100], 256 iterations, rate tolerance 1e-12 and normalized residual
  tolerance 1e-10. M3 must still test the actual numerical algorithm.
- States: COMPUTED / PARTIAL / ESTIMATED / NO_COVERAGE / NOT_AVAILABLE /
  NOT_COMPUTABLE. Monetary/rate/quantity/period result contracts enforce nulls for
  valueless states and specific blocking numerical reason codes.
  Every M1 result is diagnostic: **all metrics are null / NOT_COMPUTABLE with
  M1_CALCULATIONS_DEFERRED**, plus actual missing/incompatible-input reasons.
  No synthetic fixture result is presented as an implemented financial forecast.

### Confidence, limits, hashes and unchanged-storage proof

`financial-confidence-v1/1.0.0` uses explainable **bands, not a new numeric score**:
three factors (source evidence, completeness/freshness, assumption review), with
the weakest factor determining the band. HIGH source evidence requires all
necessary inputs VERIFIED and measured quality >=0.8. Lower/unknown evidence or
nonfresh/incomplete inputs cap at LOW. Owner-approved assumed projections cap at
MEDIUM; unreviewed assumptions cap at LOW. Unknown/mismatched source references,
missing values or blocked methods have null confidence. Factors/policy are stored
and reconstructable; no probability, success or investment meaning is attached.
All diagnostic M1 metrics retain null confidence because calculation is deferred.

Bounds: <=32 versions, <=120 monthly or <=30 annual periods, <=1,000 total line
items, <=10 scenarios including base, <=20 one-at-a-time sensitivity drivers with
three explicit points, <=10,000 expanded rows, <=500 metrics, <=2 MiB JSON and
20,000 cost units. Conservative work estimation includes IRR iterations even when
IRR is requested only by a sensitivity target. Some valid-size models can exceed
the combined work budget and are rejected, never silently truncated.

Canonical normalization sorts unordered identities, evidence references, analyses,
pins, scenarios/overrides and coverage; meaningful chronological periods stay ordered.
Decimal spelling normalizes, including negative zero. Hashes preserve full financial
assumptions, schedules, provenance, rights and policy versions; run ID/timing are
excluded from output hashing. Full reconstruction rejects forged/rehashed results.

**Shared remains unchanged.** `buildFinancialFoundationRecord` is a pure
storage-shape proof, not a persistence/authorization API. It validates the financial
result then uses the existing Shared `runRecordSchema` and `toRunInputRecord`.
The round-trip test preserves all decimal strings in generic JSON and matches
request/result/input hashes; no cast to a numeric Shared monetary metric.
Existing tables need no M1 migration. Actual durable saves/access/replay remain M4.
Input descriptors here are trusted test/server values; M1 does not claim live
source authorization or Data Center byte/checksum validation implemented before M2.

### Verification and unresolved gate

| Gate | Saved evidence |
| --- | --- |
| Final Financial unit cases | **152/152 PASS**: contracts 67, decimal 42, confidence 15, isolation/registration 28 |
| Financial plus unchanged global boundaries | **170/170 PASS**, five files, 9.00 s |
| Full engine/Data Center unit regression | **NOT PASS**: 2,256 passing, one frozen Competitor timing failure, three prior skips, 75 files, 224.81 s |
| TypeScript | **PASS** after final runtime changes |
| Scoped ESLint | **PASS**, zero warnings, repeated after final test correction |
| Production Webpack build | **PASS**, compile 3.9 min; static generation **161/161** |
| `git diff --check` | **PASS**, including staged new files before checkpoint commit |
| Database | No new DB execution: M1 has no persistence/adapter/schema changes. Engine-four saved 445-case consolidated DB acceptance remains unchanged, not claimed as newly run Financial acceptance |

The failing unchanged scenario is:
`Competitor M5 bounded synthetic acceptance > keeps 32 interleaved complete
analyses deterministic and isolates source/result mutation`.
Aggregate actual **21,017.00 ms**, required **<15,000 ms**.
Exactly two targeted rechecks on this host/Node v24.14.0/current worktree/config:
**20,031.69 ms FAIL**, then **18,344.51 ms FAIL**.
No build/type/lint job ran concurrently with these targeted rechecks.
The frozen Competitor code/test/config, other four engine runtimes, Shared,
Data Center and Prisma are unchanged against accepted M0 baseline.
The M4 history shows this timing gate was environment-sensitive, but these three
current failures do **not** establish a current passing gate or prove a particular
external cause. No threshold was raised and no frozen engine was reopened.
No repeated full suite or unlimited timing retries were used to force acceptance.

The final focused run also covers two locally tightened contract guards and a
suite-level registration guard added after the aggregate. An intermediate focused
run caught the sensitivity-budget test nested in another test; it was moved to
suite level, and final **170/170 PASS** explicitly includes it. Earlier failed
receipts are preserved, not relabeled as green.
Saved session receipts use `financial-m1-*` JSON/log filenames, including
`financial-m1-regression`, `financial-m1-targeted-perf-1/2`,
`financial-m1-final`, `financial-m1-typecheck-final`, `financial-m1-eslint-final`
and `financial-m1-build`.

Historical checkpoint status before the subsequent attribution review:
**M1 = IMPLEMENTED / NOT CLOSED. Full regression performance gate = NOT PASS.**
This failed execution is retained despite the owner's later M1 closure in section 13.
At that historical checkpoint M2 had not started.
**REAL-DATA FINANCIAL FEASIBILITY ACCEPTANCE = BLOCKED / NOT VERIFIED.**
Sonar remains deferred; no main/integration merge or final tag.

## 12. M1 performance attribution A/B — 2026-10-22

The owner authorized exactly three runs per SHA of the single frozen Competitor
32-interleaved-complete-analyses scenario, not another full regression or any
Competitor/threshold change:

- Baseline: `70eacc1a2c445af60f2a480bc096186083be371e`.
- M1 candidate: `329822e8865841418c3ef4e7ef89142a34552016`.
- Alternating order: baseline/M1, baseline/M1, baseline/M1.
- Same disposable worktree path for both SHAs, switching detached HEAD between
  invocations; same physical node_modules, Node v24.14.0, Vitest 4.1.11,
  unchanged config/test/fixtures and explicit unit-only DATABASE_URL.
  No dependency reinstall or build/typecheck/database load during the comparison.
- This is a host Node unit benchmark, not a Docker/database test. Neither SHA
  accesses a container; the container environment was not changed or recreated.
- The benchmark, Competitor/Shared implementation and Vitest config have no diff
  between the two SHAs. The declared decimal dependency is present in the common
  installed environment for both, avoiding an installation/environment confound.
  This isolates source-SHA attribution under that environment; it is not a separate
  comparison of historical dependency installation layouts.
- Actual durations below are the benchmark's measured `totalMs`, not total process
  or assertion-callback time. Exactly one test executed per invocation; the other
  case was excluded by the test-name selector.

| Round | Baseline actual ms | M1 actual ms | Unchanged gate |
| --- | --- | --- | --- |
| 1 | 8,664.2656 | 8,875.6072 | Both PASS, <15,000 ms |
| 2 | 8,636.0165 | 8,450.2192 | Both PASS, <15,000 ms |
| 3 | 9,329.5042 | 8,825.5706 | Both PASS, <15,000 ms |
| Median | **8,664.2656** | **8,825.5706** | **6/6 PASS** |

`delta = (M1 median - baseline median) / baseline median * 100 = +1.8617%`.
Baseline range is 8,636.02–9,329.50 ms; M1 range is 8,450.22–8,875.61 ms.
The small median difference is within the observed overlapping sample spread;
both variants pass the original gate on every sample. There is no evidence of a
material M1 source-attributable slowdown in this bounded comparison.

**NO M1-ATTRIBUTABLE PERFORMANCE REGRESSION.**
The earlier frozen timing failure is tracked as
**PRE-EXISTING / ENVIRONMENT-SENSITIVE PERFORMANCE DEBT**, not a Financial defect.
The three current baseline passes do not establish that the baseline failed
under the earlier host conditions, nor prove a particular external root cause.
Six samples are not a statistical equivalence proof or production SLA claim.
The earlier aggregate remains failed; it is never relabeled a green execution.
No runtime/configuration/threshold change or additional test execution was made
for this attribution review. At delivery, M1 awaited owner review and M2 had not
started. Subsequent owner approval is recorded below without rewriting those receipts.

Saved session evidence: `financial-m1-ab-environment.json`,
`financial-m1-ab-results.json`, `financial-m1-ab-summary.json`, and six
`financial-m1-ab-{BASELINE,M1}-{1,2,3}.json/.log` receipts.
The follow-up documentation-only SHA records the attribution result and is
reported separately from the unchanged tested implementation candidate.

## 13. M2 checkpoint — read-only exact financial source validation

The owner **APPROVED / CLOSED M1** based on the bounded attribution review.
Tested M1 implementation remains `329822e8865841418c3ef4e7ef89142a34552016`;
the separate documentation-only child is
`0aeb3e7de39beb069c29eb56eaa60bffdde795f1`, the pre-M2 baseline.
The earlier failed full regression is not relabeled PASS.
The owner then authorized M2 only, with no financial calculations in that phase.
M2 was subsequently **APPROVED / CLOSED** at
`166d48a8c689f18ccf6e70fa1accf654fb0fb0a0`; its four pre-existing Competitor
database failures remain a documented NOT-PASS exception, not a passing regression.
The owner authorized **M3 calculations only** after approving M2.

### Read contract and binding

- Pure `FinancialDataPort` injects exact discovery and governed byte reads.
  The sole live adapter imports only existing Data Center contracts, discovery
  and version-content reader. Pure exports do not import the adapter.
- `prepareFinancialDataCenterInputs` receives the actor, organization and access
  context from the server, never from financial model fields. It discovers the
  pinned ID and reads with its required checksum. Discovery and read metadata
  must agree except `resolvedAt`; the existing reader recomputes the full
  Data Center SHA-256 checksum. A separate content SHA-256 is not misrepresented
  as that full version checksum.
- M2 v1 deliberately accepts **one complete published model version** atomically.
  No pin gives NOT_AVAILABLE; multiple pins give NOT_COMPUTABLE without I/O.
  No arbitrary multi-source aggregation, guessed model selection, latest fallback
  or runtime type registration. The unchanged M1 request remains more general.
- Strict `jenan.financial-feasibility.dataset/v1` holds the financial model,
  documented local evidence records, owner-approval attestation and coverage.
  Type key: `financial-feasibility-model`; role: `financial.model-assumptions`.
  Local record IDs bind to the actual read version/checksum/input ID after reading,
  avoiding a circular checksum embedded inside its own content.
- Every local evidence reference must resolve uniquely. The normalized bound
  model must equal the submitted normalized request exactly. Caller-replaced
  prices, revenue assumptions, schedules, scenarios or sensitivity values are
  rejected, not blended with the published model.

### Validation and access

- Requires published governed data, VERIFIED non-AI evidence, matching source ID,
  approved model and approved assumptions. Approval cannot predate declarations;
  future approval/record/metadata dates are rejected. Future projection periods
  remain legitimate explicitly declared assumptions, not realized activity.
- `approvedBy` is a recorded **approval attestation** within governed published
  content; it is not cryptographic identity verification or independent proof
  of a natural person's approval. Existing Data Center publication/review and
  current authorization are still required; no new approval authority is invented.
- License, license class, usage policy and required attribution must be present.
  Source/ownership/provenance/quality/freshness and restrictive export rights are
  retained. Expired/not-yet-effective sources are rejected; stale/unknown freshness
  is PARTIAL, not falsely current.
- Exact sector/geography and explicit country/region source coverage are checked.
  Currency, complete calendar, period, timing and accounting basis must agree;
  there is no FX conversion, time resampling or financial arithmetic.
- Missing/null assumptions, partial schedules or partial/unknown model coverage
  cannot become ready or zero-valued results. Preparation returns explicit
  AVAILABLE / PARTIAL / NO_COVERAGE / NOT_AVAILABLE / NOT_COMPUTABLE with reasons,
  rights, inputs, provenance and deterministic request/input/output hashes.
- Current retrieval, publication, permission, specialty/mission, organization
  membership and robot grants remain enforced by the existing governed readers.
  Organization scope is reapplied before a direct read. Hidden and absent
  versions both return the same NOT_AVAILABLE shape, without exposing metadata.
  Known checksum failures have an explicit integrity state; backend/policy errors
  propagate rather than being swallowed.
- One exact discovery/read in the normal path, bounded 200,000-character content,
  combined records/rows <=10,000 and existing financial request/output size bounds.
  No financial calculations, writes, persistence/replay, schema changes, network
  collection, prior-engine imports, UI/Map/Projects wiring, main merge or tags.

### Saved verification

| Gate | Evidence |
| --- | --- |
| Financial unit / global boundaries | **195 Financial cases PASS; 213 including 18 global cases** |
| Related engine/Data Center unit regression | **2,302 PASS; four skipped**, 77 files, 205.26 s: three existing browser-only skips plus the explicitly excluded, previously accepted frozen Competitor timing-debt case |
| Financial synthetic PostgreSQL | **22/22 PASS**, fresh owned database, all **78 existing migrations**, rollback-only fixtures; final run 21.03 s |
| Exact source/version/checksum | PASS, including caller hash mismatch, immutable-byte tamper rejection and superseded-version no fallback |
| Approval/provenance/rights/license/usage | PASS, including unreviewed model/assumptions, wrong source, restrictive rights and resolved evidence records |
| Currency/period/sector/coverage | PASS, including actual PostgreSQL mismatches, missing/partial inputs and out-of-coverage not interpreted as zero |
| Current authorization / no existence leak | PASS, including hidden vs absent, required permission, retrieval revocation, archive, specialty/mission, suspended membership, trusted organization mismatch and revoked robot grant |
| PostgreSQL / Data Center / PostGIS broader regression | **NOT PASS**: original 450-case execution had 445 PASS + five FAIL; one new test-registration error corrected, remaining four are unchanged Competitor cases |
| Consolidated final DB coverage | **448 passing / 452 distinct cases, four frozen Competitor failures**: 426 unchanged cases passing in the broad run plus the final 22/22 Financial cases; not claimed as a new single all-green execution |
| TypeScript / scoped ESLint | **PASS**, zero warnings |
| Production Webpack build | **PASS**, compile 120 s; **161/161** static routes generated |
| Diff / frozen runtime boundaries | PASS; no Data Center, Shared, prior engine, Map or Prisma runtime/schema changes |

The original Financial PostgreSQL failure was a new test accidentally registered
inside another case; both added cases were moved to suite level. The Financial
AST registration guard now also inspects the integration file. The final unit
regression and final 22-case DB execution include the corrected tests.
An earlier version-creation fixture lacked required title/reason; it was corrected
without changing Data Center. All earlier failed receipts remain historical failures.

### Four frozen Competitor DB failures: bounded pre-M2 attribution

Only the same four failing cases were rerun on pristine
`0aeb3e7de39beb069c29eb56eaa60bffdde795f1`, in a disposable detached worktree
with the same physical dependencies/generated Prisma client and Docker PostgreSQL.
All four reproduced with the same failure signatures:

1. Stored by-type selection replay: existing dataAvailability schema rejection.
2. Unselected discovery-candidate reauthorization: same schema rejection.
3. Out-of-force trace reauthorization: `EXPIRED_EFFECTIVE_PERIOD` on publication.
4. Deterministic type/asOf selection: NO_COVERAGE instead of AVAILABLE.

These are **PRE-EXISTING ON PRE-M2 BASELINE**, not attributed to Financial M2.
Their fixture uses a fixed October instant with a live publication clock; date
and selection sensitivity is visible, but this check does not claim to fully
diagnose or repair the frozen engine. No frozen code/test/threshold was changed.
This is separate from the owner-accepted M1 timing debt and requires explicit
review rather than automatically extending that acceptance to new failures.
The broader DB gate remains NOT PASS. The owner accepted M2 with this explicitly
retained pre-M2 exception; this does not convert the broader gate to PASS.

Saved session receipts: `financial-m2-unit-final`, `financial-m2-unit-regression`,
`financial-m2-db-focused-final`, `financial-m2-db-focused.json`,
`financial-m2-db-regression`, `financial-m2-db-baseline-final`,
`financial-m2-db-baseline.json`, `financial-m2-typecheck-final`,
`financial-m2-eslint-final` and `financial-m2-build`.
Owned scratch databases and the baseline comparison worktree were removed.

**REAL-DATA FINANCIAL FEASIBILITY ACCEPTANCE = BLOCKED / NOT VERIFIED.**
Synthetic fixture success is not production financial-data acceptance.
**M3 checkpoint details follow in section 14. Sonar DEFERRED / PENDING; no final
tag or main/integration merge.**

## 14. M3 checkpoint — deterministic financial calculations

M2 remains owner-approved / CLOSED at
`166d48a8c689f18ccf6e70fa1accf654fb0fb0a0`. The M2 broader database regression
remains NOT PASS because of the four reproduced, unchanged Competitor failures;
that result is not relabeled and no Competitor code or threshold was changed.
M3 adds pure deterministic calculations only. It does not add persistence, Data
Center reads/writes, prior-engine imports, UI, or database/schema changes.

### Calculation semantics

- Sums and reports CapEx, OpEx and explicitly declared revenue; quantity-times-price
  revenue is accepted only from explicit same-period, same-currency volume and price.
  No population, demand, competitor, inferred price, or missing-value revenue is used.
- Cash flow supports the declared direct-cash schedule and an accrual bridge that
  adds depreciation back once, subtracts cash tax, CapEx and working-capital change,
  and includes explicit disposal cash.
- Gross, operating and net margins use explicit accounting schedules and are
  NOT_COMPUTABLE for zero or negative revenue denominators. Single-product break-even
  requires explicit fixed costs and positive contribution margin; whole units round up.
- Simple payback is period-end only, with no interpolation; it reports the first
  crossing and discloses any later cumulative deficit. No crossing is not presented
  as a numeric payback.
- NPV uses the complete t0-plus-equal-period cash-flow schedule and an explicit
  compatible per-period discount rate. IRR reports no selected root for ambiguous/
  nonconventional cash flows and uses only the bounded declared bisection policy.
- Cash requirement is a measured reserve shortfall; residual financing counts only
  explicitly committed financing and subtracts explicit debt payments/distributions.
  It is not a financing recommendation.
- Scenarios apply only declared overrides. Sensitivity compares explicit low/base/high
  values one driver at a time; it neither ranks scenarios nor implies causality.
- Monetary arithmetic uses the isolated 34-significant-digit HALF_EVEN decimal
  policy; displayed money uses the currency minor-unit scale, with six-decimal
  percentage/quantity reporting. Results carry method/version, assumption IDs,
  evidence, confidence, rights and limitations. Hashes exclude run ID and timing.

### Saved M3 verification

| Gate | Result |
| --- | --- |
| Financial M1/M2/M3 unit and boundary tests | **208/208 PASS** |
| Global engine-boundary regression | **18/18 PASS**; 226 total in the combined focused run |
| TypeScript | **PASS** |
| Scoped ESLint, zero warnings | **PASS** |
| Production build | **PASS** with a nonconnecting local placeholder `DATABASE_URL` required for route initialization |
| Full regression | **NOT CLAIMED PASS**; the previously accepted four Competitor DB failures remain documented |
| PostgreSQL/Data Center | **NOT RUN for M3**: no DB/source integration changed and Docker is unavailable; M2 evidence remains separate |
| Real-data financial acceptance | **BLOCKED / NOT VERIFIED** |

No real financial-data acceptance is implied by synthetic calculation fixtures.
The owner subsequently **APPROVED / CLOSED M3** at
`fc38b498aad426ecbd2a17c754b3b32ad7aacb30`, explicitly retaining the historical
Full Regression NOT-PASS exception as not M3-attributable, and authorized M4 only.

## 15. M4 checkpoint — atomic history and exact financial replay

The accepted M3 implementation, remote branch and Desktop archive were verified
at `fc38b498aad426ecbd2a17c754b3b32ad7aacb30` before implementation.
M4 does not change M3 formulas or calculation version `1.0.0-m3`.
The new engine-local history contract is
`jenan.financial-feasibility.run-history/v1`. Existing Shared contracts, history
tables/migrations, Data Center and all four prior engines remain unchanged.

### Persistence and reproducibility

- `runFinancialAnalysisPersisted` prepares the exact approved published model via
  the existing read provider, calculates it, validates its captured discovery/read
  transcript and persists one Run with nested Input rows in a RepeatableRead
  transaction. Errors propagate; no successful result is returned on save failure.
- The complete normalized model, original financial assumptions/schedules,
  scenario/sensitivity disclosures, output and request/input/output hashes are
  retained. Each Input repeats the exact source/version/checksum, original
  descriptor, content-only hash, provenance and usage intent.
- History records separately pin calculation, decimal, HALF_EVEN reporting and
  confidence policies. Every original metric method/version and IRR solver policy
  remains in the saved output/request. Financial per-metric confidence remains
  in the output; no fabricated Shared numeric/confidence conversion is added.
- `readFinancialRun` filters by engine and owner (or current trusted platform
  admin) before lookup. Missing and foreign history share
  `FinancialHistoryUnavailable`. The server supplies specialty, mission context
  and organization scope; the model cannot grant these permissions.
- Current source scope, retrieval rights, active membership, required permission,
  robot grants/mission assignment, archive/publication state and license/usage/
  attribution/export/ownership consistency are checked **before** recalculating
  stored output. Backend errors are not converted to cached success.
- Historical replay reads only the exact retained version ID. Supersession and
  age alone do not replace that version; original freshness/evaluation metadata
  is replayed, while current permissions and rights remain mandatory. An archived
  or no-longer-published item is unavailable. Missing old versions never fall
  back to a newer published model or newer financial assumptions.
- The live version checksum is recomputed from its stored columns. Live content
  must match the captured original bytes. Transcript validation redoes model
  approval/binding and M3 arithmetic at the original evaluation time, then checks
  the complete result and all repeated record/input metadata and hashes.
- Replay returns the original result, not an upgraded result or a new history
  write. The existing database append-only triggers remain enforced on both
  Run and Input tables. A failed nested insert rolls back the entire run;
  retry after rollback can use the same Run ID. A duplicate already-committed
  ID fails explicitly without overwriting history or adding orphan Inputs.
- v1 history deliberately stores only successfully prepared exact approved
  models; rejected/unavailable preparation raises a typed error and writes no
  run. It does not invent a partial numerical result or silently fill an input.

### Saved M4 verification

| Gate | Evidence |
| --- | --- |
| Financial M1–M4 unit / engine-local boundary cases | **231/231 PASS**, including **23** pure historical-contract cases |
| Global engine boundaries | **18/18 PASS**; combined focused execution **249/249 PASS** |
| Financial PostgreSQL persistence/replay | **27/27 PASS**, including committed durable history in a separate transaction, failed nested Input insert/rollback/retry and duplicate ID |
| Financial M2 Data Center regression | **22/22 PASS**; combined isolated database execution **49/49 PASS** |
| PostgreSQL / PostGIS schema readiness | All **78 unchanged migrations** applied on an owned disposable PostgreSQL 17 / PostGIS **3.5** database |
| Exact historical replay | PASS after publishing different financial assumptions; original full result/versions retained without writes |
| Current authorization / no existence leak | PASS: owner/admin/foreign/missing, retrieval/rights changes, archive, specialty/mission, trusted organization, suspended membership, removed required permission, revoked robot grant |
| Integrity and append-only | PASS: result/request hash/Input hash/provenance/source-byte corruption, missing historical version despite a newer version, and all four Run/Input update/delete rejection paths |
| TypeScript / zero-warning scoped ESLint | PASS |
| Production build | PASS, isolated nonconnecting local `DATABASE_URL`; no production DB used |
| Diff / frozen runtime boundaries | PASS; only Financial implementation, its tests, the narrow global test allowlist and related documentation changed |
| Full regression | **NOT CLAIMED PASS**; accepted pre-existing Competitor exceptions remain unchanged, and the broad suite was not rerun |

Early failed M4 test executions are retained as failed receipts. Their corrections
were limited to fixtures: legal restricted-license/export transitions, removal of
review/evidence references before deleting an owned scratch historical version,
and settlement of its existing deferrable constraints. No Data Center constraint,
schema, frozen engine, performance threshold or runtime formula was modified.
The global boundary test allowlist was extended only for the four new Financial
history adapters, each with an explicit package list; it does not widen pure-core
or previous-engine access.

Saved session receipts: `financial-m4-unit-final-verified`, `financial-m4-db-verified`,
`financial-m4-migrations`, `financial-m4-build`, `financial-m4-typecheck-final-verified`
and `financial-m4-eslint-final-verified`. They are synthetic technical evidence, not
production financial-data acceptance. The owned disposable database container and
its anonymous volume were removed after validation; unrelated containers were
not changed. Source-control sync is reported with the checkpoint SHA.

**REAL-DATA FINANCIAL FEASIBILITY ACCEPTANCE = BLOCKED / NOT VERIFIED.**
**M4 owner-approved / CLOSED at `b6fb4a3f8d765f7ce3c43dfc5eec38cb099b9618`.
The owner authorized M5 only. Sonar DEFERRED / PENDING; no final tag or
main/integration merge.**

## 16. M5 final technical acceptance

M5 adds acceptance tests only; Financial arithmetic/history/adapters, Shared,
Data Center, previous engines, Map, Prisma schema/migrations and UI are unchanged
from the owner-approved M4 baseline. No sixth engine is started.

### Additional acceptance coverage

- Thirty-two interleaved complete, explicitly approved synthetic financial
  analyses, including scenarios/sensitivity, have identical deterministic
  hashes, bounded output and independently mutable results. Revenue and price
  are declared inputs, never inferred. The existing 15-second batch bound
  is retained.
- Sixteen full transcript reproductions use original captured bytes and do
  not call live discovery/read. Oversized requests fail before I/O. An explicit
  complete zero-activity schedule can cover the full 120-month horizon; missing
  financial data is not converted to zero.
- Eight durably committed runs at concurrency four and sixteen durable replays
  at concurrency four exercise the actual database transaction boundaries,
  without the rollback/proxy harness. Both retain the prior acceptance bounds:
  maximum operation below 15 seconds and batch below 30 seconds.
- Four concurrent executions of the same Run ID yield exactly one committed
  Run/Input pair and three explicit `P2002` conflicts, without overwrites.
- A real nested Input CHECK failure leaves no Run or orphan Input. Removing
  only the owned scratch fault permits retrying the same unsaved Run ID.
- Concurrent foreign/missing history lookups and replays return the same
  `FinancialHistoryUnavailable`. Every batch checks unchanged Data Center
  source/item/version/type/usage/audit/event/quality counts.
- All new durable fixtures are guarded to an owned `se_financial_m5_*` scratch
  database. Existing Financial source/history and frozen Data Center/PostGIS
  tests run on a separate owned migrated database.

### Local verification

| Gate | Saved result |
| --- | --- |
| Financial M1–M5 unit regression | **235/235 PASS**, including four new M5 acceptance cases |
| Global engine boundaries | **18/18 PASS**; Financial plus global coverage **253/253 PASS** inside the final consolidated execution |
| Consolidated unit regression | **3,349 PASS / 11 skipped**, 204 files PASS and one skipped file, 430.17 s; not an unrestricted Full Regression |
| Financial PostgreSQL M2 / M4 / M5 | **22 + 27 + 5 = 54 cases PASS** across the related DB and separate committed-acceptance executions |
| Related Financial / Data Center / PostGIS | **254/254 PASS in ten files**, plus **5/5** new committed M5 cases; consolidated **259 passing DB cases**, not one 259-case execution |
| Real PostgreSQL / PostGIS | **17.5 / 3.5.2**; both owned application databases migrated with all **78 unchanged migrations**; read-only adapters and synthetic spatial tests active |
| Persistence / exact replay / recovery | PASS, including original old assumptions after newer publication, tampering, append-only triggers, true committed race and nested rollback/retry |
| Current authorization / no existence leak | PASS, including permission, membership, robot grant, retrieval/rights, archive and concurrent foreign/missing lookups/replays |
| TypeScript / zero-warning scoped ESLint | PASS, including post-production-build typecheck |
| Production build | **PASS on unchanged retry**, 161/161 static pages; first execution retained as failed due to existing Next.js dependency security advisory |
| Patch formatting / frozen runtime scope | PASS; only the two new Financial acceptance test files and these two directly related docs changed |
| Exact-SHA CodeQL | **PASS**, Actions and JavaScript/TypeScript; both uploaded analyses match `66afdfea4fd8e118c0833232fd95f673e00d6a33`, no analysis errors/warnings and **zero new/open alerts** |

The 11 unit skips comprise ten existing opt-in/environment/browser skips and
the explicitly excluded, owner-accepted Competitor timing-debt case. Financial
and global boundary cases have no skips. PostGIS tests create/drop their own
separate Map-schema scratch databases and read-only roles.

The first production-build command completed compilation and page generation
but exited 1 with `SecurityFatalError`, recommending an upgrade of the existing
Next.js **16.4.0** dependency. Repeating the same unchanged command exited 0.
The earlier failure is not erased; a successful build is not proof of dependency
security. A separate Next.js security update is recommended. M5 does not modify
the manifest/lockfile, suppress this advisory, or claim it has remediated it.
Existing Map filesystem-tracing warnings also remain unchanged.

### Measured synthetic performance

The local focused pure run and the consolidated regression both passed without
raising thresholds. The committed DB measurements use actual transactions,
not mocked persistence or a wrapping rollback transaction.

| Scenario | Count / concurrency | Total ms | p50 / p95 / max ms | Required bounds |
| --- | --- | --- | --- | --- |
| Complete financial analyses, focused | 32 interleaved | 1,420.85 | Batch only | <15,000 |
| Complete analyses, consolidated regression | 32 interleaved | 3,001.34 | Batch only | <15,000 |
| Original transcript reproduction, consolidated | 16 interleaved | 1,452.21 | Batch only | <15,000 |
| Committed complete financial runs | 8 / 4 | 2,593.45 | 1,028.70 / 1,579.11 / 1,579.11 | Each <15,000; total <30,000 |
| Committed exact historical replay | 16 / 4 | 1,938.21 | 477.79 / 574.06 / 574.06 | Each <15,000; total <30,000 |

Committed throughput: **3.0847 runs/s** and **8.2550 replays/s**. These small
synthetic acceptance batches are not a production capacity/SLA claim.

### Exact-SHA scan and source-control roles

Tested M5 code/test candidate and exact-SHA CodeQL target:
**`66afdfea4fd8e118c0833232fd95f673e00d6a33`**.

[CodeQL workflow 39823202833](https://github.com/Jenan21/jenanbiz1-git/actions/runs/39823202833)
completed successfully for that exact head SHA:

- Actions job `119979586705`, 49 seconds; analysis `2006997719`,
  category `/language:actions`, zero results.
- JavaScript/TypeScript job `119979587005`, 2 minutes 27 seconds; analysis
  `2007010365`, category `/language:javascript-typescript`, five existing
  dismissed findings, **zero new/open alerts**. The five dismissals already
  existed before dispatch; M5 adds no dismissals.
- Both analyses have empty error/warning fields. GitHub's Ubuntu image
  migration annotation is informational, not a code finding.

The final closure commit is a **documentation-only child** of this candidate.
Its different SHA identifies saved closure evidence, not another runtime/test
implementation. No code/test change follows the tested/scanned candidate.
The final report supplies the closure SHA after push and equality verification
of Local HEAD, remote branch HEAD and the clean detached Desktop archive.

The owned M5 container and anonymous data volume were removed after testing.
The unrelated `jenanbiz-postgres` container remains healthy and untouched.

Historical Full Regression remains **NOT PASS**, with the owner-accepted
Competitor timing debt and four pre-M2 Competitor PostgreSQL failures unchanged.
The final unit regression explicitly excludes only the accepted Competitor
32-interleaved timing case; it must not be called an unrestricted all-green
Full Regression. No frozen test, code, schema or performance limit is changed.

Saved session logs: `financial-m5-pure-first`, `financial-m5-committed-acceptance`,
`financial-m5-db-regression`, `financial-m5-migrations-regression`,
`financial-m5-migrations-acceptance`, `financial-m5-typecheck-initial`,
`financial-m5-eslint`, `financial-m5-unit-regression`, `financial-m5-build`,
`financial-m5-build-retry`, `financial-m5-typecheck-final`,
`financial-m5-typecheck-restored-generated-file`, `financial-m5-codeql-watch`,
`financial-m5-codeql-run.json`, `financial-m5-codeql-analyses.json` and
`financial-m5-codeql-alerts.json`.

**REAL-DATA FINANCIAL FEASIBILITY ACCEPTANCE = BLOCKED / NOT VERIFIED.**
**JENAN FINANCIAL FEASIBILITY ENGINE = TECHNICALLY COMPLETE — PENDING FINAL SONAR.**
M5 was explicitly accepted by the owner on 2026-10-22. Accepted documentation-only
closure SHA: `2eee9fd2bdb4445e30931070bff8fb0392113de8`; tested implementation
and exact-SHA CodeQL remain `66afdfea4fd8e118c0833232fd95f673e00d6a33`.
The approval message included a 41-character transcription of the closure SHA;
Local/Remote/Desktop all verified the 40-character SHA recorded here.
The historical regression
exceptions and separate existing dependency-security advisory remain explicit.
**Sonar DEFERRED / PENDING. No main/integration merge, final tag or sixth engine.**
