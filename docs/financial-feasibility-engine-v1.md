# JENAN FINANCIAL FEASIBILITY ENGINE — M0 ARCHITECTURE REVIEW

## 1. Authority and stop

**M0 APPROVED at `70eacc1a2c445af60f2a480bc096186083be371e`.
M1 implemented as a review candidate; NOT CLOSED because the frozen Competitor
performance regression gate remains NOT PASS. M2 NOT STARTED.**
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
it and authorized M1 only, recorded in section 11. No production-data acceptance,
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

**M1 = IMPLEMENTED / NOT CLOSED. Full regression performance gate = NOT PASS.**
Deliver a synchronized candidate checkpoint, not an accepted closed baseline.
**M2 NOT STARTED. REAL-DATA FINANCIAL FEASIBILITY ACCEPTANCE = BLOCKED / NOT VERIFIED.**
Sonar remains deferred; no main/integration merge or final tag.
