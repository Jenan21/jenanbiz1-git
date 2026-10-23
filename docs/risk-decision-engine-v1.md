# JENAN RISK & DECISION ENGINE — M0 ARCHITECTURE REVIEW

## 1. Authority, accepted baseline and mandatory stop

**M0 owner-approved on 2026-10-23 at
`2f11937a98a8a1b0940a99f0b887c48d0aadee47`.
M1 owner-approved / CLOSED on 2026-10-23; final tested implementation commit:
`396095c1795a79d2f67bfb698d40c5ab09b26fdc`.
M2 authorized for exact governed reads only; owner approved the narrow historical
Data Center capability exception on 2026-10-23. The owner subsequently approved
fail-closed exclusion of unprovable Map lineage. M2 owner-approved / CLOSED at
`c71bf1f8bccb4dd8fc03cc225182d66a8acd48eb`, with Local/origin/Desktop matching.
M3 owner-approved / CLOSED at
`310c97a23b610898e0562a5ba039b4a63443f1fe`.
M4 owner-approved / CLOSED at
`ac3c3afd7370000cfbb08be64a0d7c8933daebc9`.
M5 final technical acceptance gates passed on exact tested/CodeQL SHA
`80038136f607ef57f50b08b38b3a0387fdaa4012`, without new functionality or
redesign. Engine seven is **TECHNICALLY COMPLETE — PENDING FINAL SONAR**;
owner-facing closure is reported separately from the documentation-only child.
No final tag or main/integration merge is authorized.**

Six of seven engines are owner-approved as **TECHNICALLY COMPLETE — PENDING FINAL
SONAR**. Engine seven starts on `jenan-engines/risk-decision` directly from the
accepted Operational documentation closure, without integration/main merge.

| Frozen engine | Owner-accepted technical closure |
| --- | --- |
| Spatial | `8d97baace8abd6889f400a56952e345f3068f3af` |
| Market & Demand | `c54d647838c1ce10730277f3977abc4980c3715d` |
| Competitor Analysis | `eaa2d09374593d5677fc77c3efbc4f5a3e42e4a0` |
| Opportunity & Gap | `10dcafcf27c45db8b371fa5b79ac9da6bc4f21a5` |
| Financial Feasibility | `2eee9fd2bdb4445e30931070bff8fb0392113de8` |
| Operational Feasibility | `f2cb60f13508765795429d7b45447760f05e4ef1` |

Operational's **tested implementation / exact-SHA CodeQL** remains
`93a0a952c8a97ec9e7563cf90f87a8f1f0651d5c`, never replaced by its
documentation-only closure SHA. Its branch and Desktop archive stay frozen.
Financial's tested/scanned SHA likewise remains
`66afdfea4fd8e118c0833232fd95f673e00d6a33`, separate from its closure child.
Data Center's accepted baseline remains
`04d6148dfb875532404059adb55fcac8ee6913b2`, with only the owner-approved
additive historical-read exception committed at
`0aafb9b17b4f32fd222bf89035145ef9016ada46`.

Historical Full Regression remains **NOT CLAIMED PASS**: the accepted Competitor
timing debt and pre-Financial-M2 database failures are not reopened or relabeled.
Next.js dependency-security remediation is an independent final-security-campaign
item; CodeQL is not dependency clearance. **Sonar = DEFERRED / PENDING.**
No final tag, main/integration merge, production-data certification or deployment.

Reference authority: [execution master](../design-references/Jenan-PRO/EXECUTION_MASTER.md),
the three preserved reference archives, and the page-by-page references for
page 026 (risk matrix/scenarios), 048 (professional result) and 049 (final report).
Their spec/HTML sample scores, returns and recommendations are composition only.
The newer owner decision here forbids success percentages and opaque final scores.
Project evaluation remains inside project-start, with human approval; no legacy
evaluation route, UI redesign or unsupported export format is introduced by M0.

## 2. Purpose and explicit product boundary

Aggregate and interpret **already computed, exact, authorized outputs** of the six
engines. Identify evidenced exposures, unresolved conditions and evidence gaps;
explain a conditional final decision against a declared, approved policy.
Do not rerun or change upstream mathematics, estimates, findings or confidence.

Included in proposed v1:

- Risk identification and stable categories with exact evidence and causal rationale.
- Impact, likelihood and severity only where their separate prerequisites exist.
- Cross-engine consistency checks and explicitly declared dependency risks.
- Data-quality/confidence limitations, kept distinct from established business risks.
- Financial, operational, market, competition, location and opportunity/dependency risks.
- Comparison of existing explicitly mapped scenario outputs, without new forecasts.
- Evidence-linked mitigation actions and individually evaluated decision conditions.
- Explainable final decision, counterevidence, assumptions, limitations and human-review status.
- Atomic history, exact replay of this interpretation and current authorization.

Forbidden: Probability of Success/project success percentage; opaque or weighted
Final Score; invented probability/causality; AI/LLM completion of missing data;
scraping; upstream recalculation; automatic launch, investment, funding, procurement
or risk acceptance; resurrecting Funding Eligibility. A measured capital need is
not financing eligibility, a loan recommendation or evidence that funding exists.
No Projects/UI/API/worker wiring is proposed within M0-M5 engine implementation.

## 3. Architecture and verified integration constraints

`exact approved decision policy + exact persisted upstream run pins
-> current-authorized read-only snapshots -> strict versioned projections
-> comparability/evidence checks -> deterministic rules and condition evaluation
-> explainable conditional decision -> own atomic history -> own exact replay`.

Engine folder: `services/analysis-engines/risk-decision`, created in M1 only;
M0 created no runtime scaffold.
The pure core imports only its own modules and unchanged Shared primitives.
No direct, dynamic, type-only or transitive imports from prior-engine packages.
No previous run/replay/validation service is called as an upstream data provider.

Verified constraints from existing code:

1. Shared Run/Input storage already retains engine identity, request/result
   contracts, original request/result JSON, input snapshots, runtime, actor and
   request/input/output hashes. It has append-only database protection.
2. Existing historical readers can invoke full result reproduction. Operational
   `validateOperationalRunRecord` reproduces its transcript through M2/M3.
   Calling such a reader would violate the no-upstream-recalculation boundary.
3. Native result structures are heterogeneous. Spatial/Market/Competitor/Opportunity
   expose grouped `results[].metrics`; Financial exposes decimal `metrics`,
   `scenarios` and `sensitivities`; Operational exposes decimal `metrics`,
   `prerequisiteFindings` and explicitly identified variants. M1 foundation results must not
   be mistaken for final arithmetic outputs.
4. Shared confidence summaries and numeric metric schemas cannot represent a
   decision, dimensioned decimal claims or likelihood evidence by themselves.
   Use strict engine-local schemas; do not cast into incompatible Shared metrics.
5. A prior-engine run is not a Data Center version. Do not forge a DATA_CENTER
   input/ref kind for it or add a Shared enum/Prisma foreign key. M1 inspection
   confirmed that Shared already supports `ENGINE_RUN` / `ENGINE_OUTPUT` /
   `ANALYSIS_ENGINE`; use those existing primitives, not a custom fake DC input.

Proposed ports: `RiskPolicyPort` for exact governed Data Center policy content,
and `UpstreamRunSnapshotPort` for exact authorized stored Run/Input projections.
A narrow Risk-owned adapter reads existing history tables without writes, engine
imports, upstream replay or upstream calculation. It uses current platform
principal/access policy and existing governed source APIs; never caller-asserted
authorization, run ownership alone, or a privileged unfiltered bulk read.
The approved decision model is a real Data Center input; original run references
use existing ENGINE_RUN descriptors, with full local pins/projections/lineage in
the Risk result/runtime. Shared generic Run/Input JSON storage is reused unchanged.

**M1/M2 stop gate:** prove a read-only path for every supported upstream contract
and its transitive current rights, including historical versions and Map lineage.
Do not copy/weaken policy, bypass inaccessible history, or silently use a prior
reader that recalculates. If existing frozen capabilities cannot provide this,
report the exact capability gap and request approval before any Shared/Data
Center/prior-engine/schema change. Architecture is not a claim that this new
adapter or a universal cross-engine history API already exists.

## 4. Proposed contracts and exact upstream identity

Contracts: `jenan.risk-decision.request/v1`, `jenan.risk-decision.policy/v1`,
`jenan.risk-decision.upstream-snapshot/v1`, `jenan.risk-decision.result/v1`,
and `jenan.risk-decision.run-history/v1`. Proposed governed role/type:
`risk.decision-policy` / `risk-decision-policy`; M0 registers neither.

| Input group | Required semantics |
| --- | --- |
| Decision subject | Opaque subject identity, site/geography/sector taxonomy, target decision scope and period; no Projects FK |
| Six engine slots | Exactly the six known engine roles, each with exact run pins or approved NOT_APPLICABLE rationale; missing is explicit, never zero/clean |
| Run pin | runId, engine key/version, request/result contract, requestHash/inputsHash/outputHash, native result content hash, evaluatedAt, scenario/site/period selectors |
| Policy | Exact source/version/checksum, author, approval, approvedAt, rationale, validity, explicit required conditions and failure dispositions |
| Claim selector | Stable native metric/finding key plus analysis/entity/site/period/variant coordinates and bounded JSON pointer; match exactly one item |
| Applicability | Explicit rule/condition applicability, evidence and approver; absent evidence cannot be converted into NOT_APPLICABLE |
| Comparability | Currency/price/cash-flow/timing basis, quantities/units, population/cohort, coverage, geography/site, scenario identity and method versions |
| Scenario map | Exact named upstream variants/runs and declared compatible assumption mapping; matching labels alone is insufficient |
| Dependency edges | Explicit upstream/downstream condition or claim IDs, dependency meaning, evidence and owner; bounded acyclic graph |
| Actions | Rule/template ID, evidence-linked purpose, responsible role, optional declared due date, verification criterion and status |
| Governance | Source lineage, provenance/ownership/license/usagePolicy/attribution, restrictions, current actor/org/robot/mission scope |

Initial native result inventory (versions must be pinned in M1's compatibility manifest):

| Engine key | Result contract | Allowed evidence surface |
| --- | --- | --- |
| `spatial` | `jenan.spatial-analysis.result/v1` | Stored spatial facts, screening states and explicit geographic limitations; current constant `1.0.0-m6` |
| `market-demand` | `jenan.market-demand.result/v1` | Stored metrics/outcomes/assumption traces; calculation version `1.0.0-m3` |
| `competitor-analysis` | `jenan.competitor-analysis.result/v1` | Stored analytic metrics and mapping/coverage limits; analytics version `1.0.0-m3` |
| `opportunity-gap` | `jenan.opportunity-gap.result/v1` | Stored gap findings/metrics, including unmet prerequisites; calculation version `1.0.0-m3` |
| `financial-feasibility` | `jenan.financial-feasibility.result/v1` | M3_CALCULATIONS only, `1.0.0-m3`; existing money/ratios/cash-flow/scenario outputs |
| `operational-feasibility` | `jenan.operational-feasibility.calculation-result/v1` | M3_CALCULATIONS only, `1.0.0-m3`; existing capacity/staff/supply/inventory/quality findings |

Validate the persisted envelope, exact contract/version, request/result/row
identity and the native deterministic hash recipe, using a bounded local
compatibility manifest and Shared canonical hashing, **not upstream equations**.
Also hash the full stored result bytes/canonical content for evidence identity;
do not assume every engine has identical outputHash exclusions.
Hashes detect inconsistency, not forged signatures or proof against an omnipotent
administrator rewriting all original bytes and hashes.
Unknown versions/ambiguous selectors are rejected, never interpreted via a
best-effort schema or silently mapped to the nearest/latest version.
Only authorized persisted records are decision inputs, not arbitrary caller JSON
or a self-attested export with a plausible runId/hash.

## 5. Evidence, risks and unknowns

Each finding has stable ID, category, kind, status, subject/entity/site/period/
scenario, claim refs, rule/method version, assumptions, evidence-quality band,
counterevidence, limitations and explicit reasons.

- Kinds: `EVIDENCED_EXPOSURE`, `CONDITIONAL_RISK`, `EVIDENCE_GAP`,
  `DATA_QUALITY_LIMITATION`, `CROSS_ENGINE_CONFLICT`, `DEPENDENCY_GAP`.
- Assessment states: `SUPPORTED`, `CONDITIONAL`, `UNKNOWN`, `NOT_APPLICABLE`,
  `NOT_COMPARABLE`, `NOT_SUPPORTED`. These are not likelihood bands.
- Categories: FINANCIAL, OPERATIONAL, MARKET, COMPETITION, LOCATION,
  OPPORTUNITY_DEPENDENCY, DATA_QUALITY, CROSS_ENGINE, GOVERNANCE.
- Preserve original observation/declared-plan/projection class. A plan-derived
  shortage is conditional on that plan, not observed future failure.
- Missing/expired/inaccessible/low-confidence evidence does not establish an
  adverse event, its severity or a numerical zero. It can block a decision under
  an explicit completeness rule, with `EVIDENCE_GAP` as the reason.
- An unavailable version and a forbidden version have the same external response;
  do not reveal even its existence or risk category to an unauthorized actor.
- No mapped competitors does not prove no competition; proximity does not prove
  demand; opportunity does not prove sales; PLAN targets are not market demand.
- Upstream PARTIAL/ESTIMATED/NOT_COMPUTABLE/NOT_SUPPORTED, ambiguous IRR and other
  method states remain attached to the claim; they are not recast as failure.

Duplicate claims retain one canonical identity plus all lineage. Multiple engines
quoting the same source are not independent corroboration. Never count the same
claim multiple times to escalate a risk or create a confidence average.

## 6. Impact, likelihood, severity and confidence

**Impact:** retain an existing upstream consequence/quantity or an explicitly
approved assessment with unit, period, event definition and supporting evidence.
A cash deficit is usable as reported; Risk does not compute cash flow, lost profit,
labor cost or monetary impact from an operational gap.

**Likelihood:** nullable numeric or qualitative assessment. Numeric input needs
an event, horizon, exposed population/denominator where applicable, method,
evidence, source date and approved methodology; probability scale is explicit.
An observed frequency remains frequency unless a justified methodology supports
its use as a probability. Qualitative bands need a documented assessment rubric
and evidence. Owner-declared estimates stay DECLARED_ASSUMPTION, not observations.
Do not infer likelihood from confidence, risk counts, scenario labels, market
growth or distance from a threshold. Unknown likelihood remains null.

**Severity:** no default `impact * likelihood`, 5x5 score or platform-wide weights.
An approved versioned lookup matrix may map supported impact/likelihood bands to
LOW/MEDIUM/HIGH/CRITICAL; every cell and rubric must be declared and complete.
Missing prerequisites yield `NOT_ASSESSABLE`, not LOW. An impact-only critical
condition must be a separately declared hard condition, not invented likelihood
or a disguised matrix severity. No global averaged/weighted risk score.

**Confidence:** evidence/input/methodology quality only. Preserve native bands
and policy/version; derive a finding band conservatively from essential evidence
only where a declared cross-policy mapping exists. Otherwise report the native
components and UNKNOWN comparability, not an invented common numeric percentage.
Shared or repeated evidence cannot raise confidence through apparent agreement.
Decision assurance is an explicit evidence explanation, never probability of success.

## 7. Deterministic interpretation and cross-engine rules

Use a finite typed rule vocabulary, not arbitrary code, SQL, eval or natural-language
rules. Proposed operators: exact equality/inequality, dimension-compatible ordered
comparison, membership, presence, explicit state checks, and bounded ALL/ANY.
No financial/operational/spatial recalculation, interpolation, simulation,
optimization, exchange-rate conversion or inferred unit/calendar conversion.
Compare source values with declared compatible decimal semantics; retain original
values and rounding. Never recompute an unavailable exactValue from rounded output.
A threshold boundary sensitive to missing precision is UNKNOWN.
M0 proposed a local decimal dependency clone. M1 uses a smaller exact comparison
implementation instead: validated base-10 strings, sign/integer length/fraction
comparison, at most 18 integer digits, 34 significant digits and scale 64.
It performs no arithmetic or rounding, never converts through JS Number, preserves
original claim values and records `NONE_PRESERVE_UPSTREAM` rounding. Thus no decimal
package import, global context mutation, Shared change or global allowlist change
is needed. Numeric native JSON values retain their original precision limitations;
M2 projection must not fabricate additional exactness from their string form.

Examples, conditional on approved rule applicability and compatible inputs:

| Evidence | Permitted interpretation | Forbidden inference |
| --- | --- | --- |
| Existing Financial cash deficit/capital requirement | Cash/capital coverage condition needs an evidenced response | Loan eligibility, financing recommendation, success odds |
| Existing Operational capacity/staff/supplier/inventory gap | Conditional resource exposure for the declared plan | Future failure probability or invented hiring/supply availability |
| Low-quality Market observation | Evidence-quality limitation and request for better evidence | Weak demand is established |
| Sparse mapped Competitor inventory | Coverage limitation | Low actual competition |
| Spatial constraint-screening finding | Site-specific review condition with source limits | Legal clearance or legal prohibition without authority |
| Financial vs Operational scenario claims | Compare explicitly linked same-basis claims | Treat unrelated revenue/production assumptions as a contradiction |

A cross-engine conflict requires two identified claims that assert incompatible
things about the same mapped entity, scenario, period, measure and scope.
Different units, coverage, uncertainty or dates normally yield NOT_COMPARABLE or
a compatibility gap, not a proven contradiction. No majority voting or silent
winner selection. A material unresolved conflict makes affected conditions UNKNOWN;
both claims, their lineage and the required resolution remain visible.

Dependency propagation follows explicit evidenced acyclic edges only. An unknown
prerequisite creates a dependency gap, not a confirmed downstream adverse event.
No automatic causal graph inferred from shared words or engine order.

## 8. Scenario comparison and mitigation

Compare only already available, exactly pinned scenario outputs. A scenario's
Financial and Operational variants require explicit approved mapping of relevant
assumptions, units, site and timing. Reuse of an invariant upstream claim must be
declared and justified; otherwise the scenario has an evidence gap.
Do not create missing downside/upside runs, probabilities or forecasts.

Output a side-by-side condition/risk/evidence comparison. Optional dominance is
allowed only over an explicitly approved set of comparable conditions and
directions, with all critical conditions available; ties/incomparability remain
explicit. No default best scenario, expected value or blended Final Score.

Mitigations are deterministic approved rule-linked action templates or documented
owner actions, not generated promises: obtain evidence, resolve a conflict,
verify a commitment, revise a specified plan assumption, or obtain human review.
Each carries rationale, affected condition IDs, owner/status and verification
evidence required. Do not invent prices, vendors, staff, deadlines or efficacy.
PLANNED/IN_PROGRESS is not IMPLEMENTED/VERIFIED. Residual risk cannot decrease
because an action was listed; it requires new authorized evidence/upstream outputs
and a new Risk run. Existing history and decisions are never overwritten.

## 9. Explainable final decision and human authority

Each required condition returns `SATISFIED`, `NOT_SATISFIED`, `UNKNOWN`,
`NOT_APPLICABLE` or `NOT_SUPPORTED`, with exact evidence, operator, threshold,
rule/version, rationale, limitations and explicit failure disposition.
NOT_APPLICABLE needs approved evidence and cannot hide known applicability.
Policy approval and at least one substantive applicable required condition are
mandatory; empty rule lists or six missing/waived slots cannot vacuously pass.
Final positive evaluation requires coverage of all six engine roles, except
individually evidenced owner-approved non-applicability.

Proposed deterministic final decision precedence:

| Evidence/policy result | Final decision | Meaning |
| --- | --- | --- |
| Required method/contract/rule cannot be supported | `NOT_SUPPORTED` | No defensible final evaluation; retain any independently established failures |
| A supported required condition fails with approved BLOCK disposition | `DO_NOT_PROCEED_UNDER_CURRENT_PLAN` | Explicit policy blocker under this plan, not universal project failure |
| No BLOCK failure; a required condition is UNKNOWN or a material conflict remains | `DEFER_PENDING_EVIDENCE` | State exactly what evidence/resolution is missing; retain known REVISE failures |
| All required conditions evaluable, at least one fails with REVISE disposition | `REVISE_PLAN` | Enumerate changes/verification needed, without inventing replacement values |
| Every applicable required condition is satisfied; no unresolved blocker/unknown | `PROCEED_UNDER_DECLARED_CONDITIONS` | Explainable conditional recommendation under the declared evidence and policy |

No numeric rating is needed for this truth table. A confirmed BLOCK remains
visible even when other inputs are unknown; unknowns do not erase it. Rejected
authorization or integrity errors return no final decision at all, not a neutral
business outcome. Optional informational findings do not silently alter precedence.
M1 must encode and test the exact truth table before M3 implements interpretation.

The result includes executive explanation, rule-by-rule evidence, satisfied and
failed conditions, unresolved questions, scenario mapping, mitigations,
counterevidence, exact policy/engine versions, human-review-required flag and
limitations. Explanation is deterministic templated text, not an LLM narrative.
Every decision must identify what evidence or policy change could change it.
The human approval state remains `NOT_REQUESTED/PENDING` in this engine; no
project approval, risk acceptance, legal certification or launch action is written.
Changing this authority boundary requires an explicit separate product decision.

## 10. Authorization, lineage and no-existence-leak

M2 validates exact policy source/version/checksum, publication/approval, provenance,
rights/license/usagePolicy/attribution, temporal validity and full declared coverage.
Policy approval must be bound to the existing authorized approval workflow and
an identified authorized owner/reviewer, not just a caller-supplied APPROVED label.
For each exact upstream run, check current principal, owner/admin scope and all
needed original Data Center/Map lineage permissions and trusted org/robot/mission
context. A permitted Risk policy or copied snapshot cannot launder restricted
upstream content. Authorization covers all original dependencies, not just the
one metric selected for display. Current policy revocation takes effect on read
and replay; stored evaluatedAt never revives an expired grant.

No fallback to latest, another run or arbitrary older version. Exact historical
superseded versions may be used only through an authorized supported historical
read path. Missing/forbidden inputs share the same unavailable shape, including
list/count/detail errors; do not expose raw database/internal validation errors.
Integrity failures become visible only after current authorization. Infrastructure
failures follow existing explicit errors, never success-shaped cached fallbacks.

Output rights are the conservative intersection of policy and consumed upstream
rights; original attribution and license duties remain. No exporter/UI/link is
created here. A service actor cannot widen the requesting principal's permissions.
The native production/synthetic and real-data-acceptance states are preserved;
combining six technically accepted engines cannot promote their blocked/unverified
real-data status into production acceptance.

## 11. Bounds, determinism, persistence and exact replay

Proposed initial bounds, subject to M1 proof without silently raising Shared limits:
six engine slots, at most four declared comparison scenarios, at most 24 distinct
exact run snapshots, 1,000 selected claims, 200 conditions/rules, 500 dependency
edges, 500 findings/actions each, 128 unique transitive source descriptors,
20,000 interpretation work units. Read budget: at most two governed policy
operations and one bounded read per distinct upstream run, with authorization
work also metered; aggregate native content at most 8 MiB and at most 2 MiB per
native result. Request/result and the expanded stored Run/Input/runtime envelope
must each fit the existing 2 MiB limit.

Preflight cardinalities/selector/dependency cycles/declared work before I/O;
meter actual authorization, bytes, parsing, selected facts, rule edges and
scenario expansion. Reject oversize with an explicit bound reason before
persistence; no silent truncation, skipped critical rule or partial positive
decision. Not every maximally sized upstream run set can fit; that is an explicit
unsupported bound, not permission to widen storage or drop lineage.

Use unchanged canonical hashing, stable sorting and Risk-local normalization:
requestHash binds approved policy/run pins/selectors; inputsHash binds exact policy,
native result hashes, selected claim snapshots and full lineage; outputHash binds
deterministic risk/condition/decision semantics. Exclude only declared execution
metadata such as runId/timing, never evaluatedAt, rights, evidence or policy versions.
No mutation of caller/upstream objects; no clock/random/network access in the core.

M4 stores original policy, exact run pins/hashes, typed selected claims with
original evidence and scenario mappings, native hash recipe/projection versions,
rule/severity/confidence/decimal versions, condition outcomes and full result.
Atomic existing Run/Input/result creation with duplicate protection, append-only
behavior, rollback and same-ID retry without orphan records.
No new tables, foreign keys, mutable decision state or upstream writes.

Own replay reauthorizes all original lineage, verifies the exact original stored
upstream outputs/hashes and policy, then reexecutes **Risk interpretation only**.
It never reruns any of the six engines, substitutes assumptions or writes a
Run/Input/usage/audit record. Unavailable original evidence yields unavailable
history, not latest/cached-success substitution. Policy changes require a new run;
historical decision logic is replayed with the original version, not today's policy.

## 12. Proposed M1-M5 implementation and acceptance gates

| Milestone | Scope | Mandatory checkpoint before the next milestone |
| --- | --- | --- |
| M1 | Strict request/policy/upstream-projection contracts, six-role inventory, decimal/state/evidence semantics, rule truth table, confidence mapping, bounds, deterministic hashes and unchanged Shared/history compatibility; no live reads or business inference | M1 checkpoint, pure fixtures for every native version and unknown/error path, AST import/capability guards, types/lint/build/diff |
| M2 | Governed exact policy read plus current-authorized read-only upstream Run/Input snapshots; exact native schema/hash/lineage, compatibility/coverage/rights validation, no recalculation/no latest/no existence leak | M2 checkpoint with disposable PostgreSQL/Data Center and applicable Map authorization tests; stop for any frozen-capability gap |
| M3 | Pure supported risk/unknown separation, categories, supported matrix assessments, conflicts/dependencies, existing scenario comparison, action templates, condition truth table and explainable decision | M3 checkpoint with hand-checked positive/negative/unknown/conflicting/unsupported cases; no new upstream financial/operational metrics |
| M4 | Atomic own history and exact historical replay of Risk interpretation; current authorization, integrity, original policy, append-only, duplicate/rollback/retry and zero replay writes | M4 checkpoint with real committed PostgreSQL transactions, tampering/revocation/concurrency and historical-version fixtures |
| M5 | Final focused/consolidated permitted regression, PostgreSQL/Data Center/PostGIS where applicable, authorization/recovery, bounded load/concurrency, exact-SHA CodeQL, types/lint/build/diff, Local/Remote/Desktop equality | M5 final technical closure report; tested implementation SHA separate from documentation child; retain real-data and Sonar status |

Required tests across these milestones include: missing != zero; data gap !=
confirmed adverse risk; no estimate-to-observation conversion; absent likelihood
or impact cannot yield severity; duplicate lineage cannot inflate confidence;
unknown or partial upstream result cannot cause a positive required condition;
incompatible site/period/unit/currency/scenario cannot create a false conflict;
identical scenario names cannot authorize a join; mixed pass/fail/unknown truth
tables; empty/applicability-waived policies cannot vacuously pass; confirmed
blockers survive unknowns; no overwritten history; tamper/hash/version rejection;
current rights/robot/org/revocation; foreign/missing equivalence; no prior-engine
execution/imports, source writes, AI/LLM or unsupported export behavior.

M5 proposed load gates follow bounded prior-engine acceptance: 32 complete pure
interpretations and 16 pure replays each <15 s; eight committed runs and 16
read-only replays at concurrency four, <15 s per operation and <30 s per batch.
Measure p50/p95/max, throughput, input/work/byte counts and unchanged source row
counts. These are future acceptance targets, **not tests executed or PASS in M0**.
No frozen Competitor threshold change or indiscriminate historical full rerun.

## 13. M0 delivery and review decisions

This milestone changes documentation only: the new plan, the engine index and
the Operational approval record. No code, test, migration, workflow, registry,
package, UI, source publication or prior-engine baseline is modified. Existing
Operational test/CodeQL receipts are retained without rerunning or relabeling them.
M0 validation is the documentation diff/scope and repository/archive synchronization;
no runtime/build/security-scan PASS is claimed for this unimplemented engine.

The owner approved the conditional decision vocabulary/precedence, evidence-only
likelihood/severity model, read-only exact upstream adapter boundary, explicit
six-role applicability, supported rule language and bounds at the M0 SHA above,
then authorized M1 only. New milestone approval is required before M2.

**REAL-DATA RISK & DECISION ACCEPTANCE = BLOCKED / NOT VERIFIED.**
**REAL-DATA OPERATIONAL FEASIBILITY ACCEPTANCE = BLOCKED / NOT VERIFIED.**
**Historical Full Regression = NOT CLAIMED PASS. Sonar = DEFERRED / PENDING.**

**M0 ARCHITECTURE REVIEW ONLY. STOP BEFORE M1. No Final Tag or main merge.**

The preceding M0 stop marker is the historical architecture checkpoint; M0 was
subsequently approved. The current mandatory stop is the M1 checkpoint below.

## 14. M1 checkpoint: contracts, semantics and policy foundation

**JENAN RISK & DECISION ENGINE — M1 CHECKPOINT FOR OWNER REVIEW.**
M1 changes only six new pure Risk modules, four own test files, one own fixture
and directly related documentation. Shared, Data Center, Map, the six prior
engines, Prisma, Auth/UI, API/worker wiring, workflows and dependencies remain
unchanged. No adapter, database/network access, source/type registration, current
authorization claim, production decision or M2 implementation was added.

### Implemented contract surfaces

- `semantics.ts`: categories, evidenced/conditional/gap/conflict kinds, assessment
  and condition states, decision vocabulary, exact scope/basis/UTC-millisecond
  periods, disclosures/approvals, event-bound impact/likelihood, evidence quality,
  severity prerequisites and conservative comparability diagnostics.
- `policy.ts`: finite typed PRESENT/STATE/EQ/NE/GT/GTE/LT/LTE/IN/ALL/ANY rules;
  dimensioned decimal thresholds, reference uniqueness, acyclic rules/dependencies,
  explicit condition applicability and BLOCK/REVISE disposition, action templates,
  complete unique declared severity cells and native confidence mappings.
- `snapshots.ts`: exact six-engine compatibility manifest, engine/run/request/
  result/hash/content pins and retained-envelope integrity inspection; no native
  engine imports, replay or arithmetic validators.
- `request.ts`: exactly six unique role slots, PINNED/MISSING/evidenced
  NOT_APPLICABLE, exact claim selectors, explicit scenario maps, approval/period
  checks, normalization, expanded DAG work accounting and deterministic request hash.
- `contracts.ts`: strict claim/snapshot contracts, exact source/ENGINE_RUN
  descriptor bindings, claim scope/key/entity/variant matching, source-lineage
  checks, rights ceilings and attribution preservation, M1-only result/hashes
  and unchanged Shared Run/Input storage compatibility builder.
- `index.ts`: pure exports only, no adapter or side-effect capability.

The foundation result is always `M1_FOUNDATION` / `COMPLETED_WITH_GAPS`,
`decision: null`, empty findings/conditionOutcomes, `automaticAction: false`,
`humanReview: NOT_REQUESTED`, `currentAuthorization: NOT_CHECKED_M1` and
`sourceValidation: DEFERRED_M2`. It retains explicit reasons
`M1_INTERPRETATION_DEFERRED` and `M2_AUTHORIZATION_NOT_STARTED`.
No M1 input, including all six synthetic outputs, can generate a launch decision,
confirmed risk, success percentage, opaque score or implied source authorization.

The standalone condition-state classifier encodes the approved policy truth table
only; it does not extract/evaluate claims or produce an engine decision. It
requires exactly one declared outcome per condition, refuses a positive/negative
definite condition with missing/partial/conflicted evidence, prevents unapproved
applicability waivers, forbids vacuous all-optional/all-waived policies and keeps
the approved precedence: NOT_SUPPORTED, known BLOCK failure, unresolved required
evidence/conflict, REVISE failure, then all required conditions satisfied.
Known outcomes remain available to the caller; the M1 result does not call this
classifier or pretend to have evaluated them.

### Evidence, likelihood/severity and precision safeguards

Native unavailable states carry null, not zero; explicit zero is preserved.
ESTIMATED cannot become OBSERVED. Evidence gaps/data-quality/dependency gaps do
not carry an adverse event impact, likelihood or severity. Conditional risks retain
assumptions; conflicts identify at least two claims. Assessed severity requires
impact/likelihood for the same event/horizon and exact site/scenario scope, plus
the exact approved matrix/version and matching cell. No matrix/default band is
inserted. Numeric likelihood requires an explicit scale, range, methodology,
population/source date and approval evidence; observed frequency needs a positive
denominator and remains distinct from a supported probability.

Cross-policy confidence has no implicit mapping: undeclared native mappings return
NOT_COMPARABLE/null with a reason and preserve components. Explicit mappings cannot
upgrade a known native evidence band. Repeated lineage cannot raise confidence;
weakest essential mapped evidence is retained, never averaged into a probability.
Comparability reports exact site/geography/sector/period/scenario/unit/currency/
price/cash-flow/timing/cohort/method differences without declaring a business conflict.

M1's exact string comparator intentionally replaces the proposed Decimal clone:
no arithmetic or rounding is needed, and exact decimal order requires no new
dependency or frozen global-boundary exception. It handles signs, signed zero,
trailing zeros, tiny fractions and values beyond Number's integer precision.
Nonfinite/scientific/oversized/malformed inputs are rejected explicitly. Monetary
bases require currency, price and cash-flow basis; no unit/calendar/FX inference.

### Native output compatibility and its limitations

Test fixtures generate real synthetic outputs from **all six unchanged engines**,
then exercise the local manifest/integrity inspector against their retained
Run/Input envelopes. Test-only engine imports are not production Risk imports.
The inspector verifies row/native/pin identity, exact supported versions/contracts,
request/input/output/content hashes and native request/input/timing/environment
consistency. Shared recipes omit only their existing volatile/default fields;
Financial/Operational recipes preserve their native decimal request/result rules.
Spatial's request does not duplicate evaluatedAt; its result envelope supplies the
exact pinned evaluation time. Financial/Operational M1 foundation phases are
rejected as calculation evidence even though Financial shares its result contract.

This is **ENVELOPE_HASHES_ONLY**, explicitly **NOT_CHECKED** current authorization.
It is not native business-semantic recalculation, digital signature verification,
an authenticated M2 upstream reader or proof against consistent administrator
rewrites. The M1 projected snapshots are pure synthetic contract values, not
accepted caller substitutes for a retained production record. M2 must obtain
exact originals through current-authorized, read-only access before extraction.
The historical six-engine permission/Map lineage capability proof remains an M2
integration stop gate; if it needs frozen changes, stop for approval.

### Bounds, hashes and storage compatibility

All request/result/foundation-record envelopes use the existing 2 MiB canonical
JSON ceiling; the expanded stored `{record,inputHistory}` is checked too.
Before recursive canonicalization, a bounded traversal rejects cycles, nesting
beyond 64 levels, more than 200,000 JSON nodes and excessive string/key bytes.
The six-slot, 24-pin, four-scenario, 1,000-claim, 200-rule/condition, 500-edge/action,
128-unique-lineage and 20,000-work bounds remain explicit. Actual M1 request work
includes repeated composite-rule expansion per condition/scenario, not merely
unique DAG nodes; snapshot/claim/lineage work is additionally charged by the result.
Cycles, duplicate native aliases, unresolved references and excess work/bytes
fail before an interpretation or storage builder can pretend to succeed.
The proposed 8 MiB aggregate native read ceiling remains a future M2 I/O bound,
not an M1 live-read/performance claim.

requestHash binds normalized policy/slots/selectors and evaluatedAt; inputsHash
binds exact descriptors and projected snapshots/lineage; outputHash retains all
policy/evidence/rights/evaluatedAt semantics and excludes only runId/timing.
No input mutation or hidden clock/network/randomness. Validation reconstructs the
M1 foundation only, never a previous engine's result.
Shared `ENGINE_RUN` descriptors and real policy DC input fit unchanged Run/Input
schemas. Confidence summary stays null rather than fabricating a Shared numeric
summary. Record creation time cannot precede evaluation. These are storage-shape
proofs only: atomic DB persistence and historical replay remain M4.

### Saved validation receipts

| Gate | Saved result |
| --- | --- |
| Risk M1 strict unit/semantic/policy/native-version/boundary cases | **300/300 PASS** |
| Global engine boundaries | **18/18 PASS**, unchanged; Risk/global focused coverage **318/318 PASS** inside final related runner |
| Related regression | **1,136/1,136 PASS**, 31 files, no skips, **73.61 s**: 300 Risk + 362 Operational + 235 Financial + 239 Shared/global |
| Native inventory | All six real synthetic output contracts/hash recipes PASS; no runtime prior-engine imports/recalculation |
| Exact measurable limits | 20,000 expanded request units accepted / 20,001 rejected; 1,000 claims accepted / 1,001 rejected; 128 distinct lineage accepted / 129 rejected; exact 2 MiB canonical bytes accepted / next byte rejected; 64 nesting levels / 200,000 nodes accepted, next level/node rejected; cycles and oversized expanded history rejected |
| Shared Run/Input compatibility / serialization / hash tampering | PASS; existing ENGINE_RUN/DC descriptors, no Shared/schema changes |
| TypeScript / zero-warning scoped ESLint | PASS, including final post-build TypeScript after declaration-path restoration |
| git diff --check / frozen boundaries | PASS; only six Risk modules, four Risk tests, one test fixture and these two documentation files changed |
| Production build | PASS on identical retry; original existing Next.js advisory failure retained |
| PostgreSQL / live Data Center / current authorization | NOT RUN / NOT CLAIMED; deliberately deferred beyond M1 |
| CodeQL | No M1 scan claimed; exact-SHA acceptance remains a future M5 gate |
| Historical Full Regression | **NOT CLAIMED PASS**; no frozen Competitor rerun/threshold change |
| Sonar / real-data acceptance | **DEFERRED / PENDING** / **BLOCKED / NOT VERIFIED** |

Initial own test syntax errors were corrected before final typecheck. The next
focused run had one Spatial request-clock assumption failure (the local inspector
was corrected to the actual existing contract); no Spatial code changed. An
expanded own lineage-bound test initially indexed a sorted snapshot array by
position; it was corrected to find the exact run ID. The failed intermediate
commands remain failed; the earlier 1,135-case passing execution is retained and
the final 1,136-case execution above includes the added structural JSON bound.
Both production-build validation rounds stopped first on the pre-existing Next.js
advisory; each unchanged retry passed. Security remediation remains reserved for the owner's final campaign,
not disguised as a Risk/CodeQL fix. Generated Next declaration-path drift restored.

Saved session logs: `risk-m1-focused-initial`, `risk-m1-focused-2`,
`risk-m1-focused-3`, `risk-m1-related-unit` (failed intermediate),
`risk-m1-related-unit-final`, `risk-m1-typecheck-initial`,
`risk-m1-typecheck-final`, `risk-m1-typecheck-final-2`, `risk-m1-eslint`,
`risk-m1-eslint-final`, `risk-m1-build`, `risk-m1-build-retry`,
`risk-m1-unit-structural-final`, `risk-m1-typecheck-prebuild`,
`risk-m1-eslint-structural-final`, `risk-m1-build-structural-final`,
`risk-m1-build-structural-retry`, `risk-m1-typecheck-postbuild`.

**JENAN RISK & DECISION ENGINE — M1 CHECKPOINT FOR OWNER REVIEW.**
**REAL-DATA RISK & DECISION ACCEPTANCE = BLOCKED / NOT VERIFIED.**
**Historical Full Regression = NOT CLAIMED PASS. Sonar = DEFERRED / PENDING.**
**STOP BEFORE M2. No Final Tag or main/integration merge.**

## 15. Owner M1 closure and M2 capability stop gate (2026-10-23)

The owner approved **M1 / CLOSED** at final implementation SHA
`396095c1795a79d2f67bfb698d40c5ab09b26fdc`, accepting all section 14 gates.
Local, origin `jenan-engines/risk-decision` and the Desktop Risk archive were
verified clean and equal at that SHA before the M2 capability investigation.
Any subsequent documentation-only child records this approval; it does not
replace the tested M1 implementation SHA or claim additional runtime validation.
The section 14 review/stop marker above is the historical M1 checkpoint.

### Verified capability gap, not an implementation failure

M2 was authorized for exact retained-output reads, current authorization,
version/method/hash and compatibility validation, without upstream execution,
Risk persistence/replay or a final decision.

The architecture's mandatory section 3 stop gate is now active:

- Data Center's public [exact content reader](../services/data-center/version-content.ts)
  checks `version.number === version.item.publishedVersion`. It intentionally
  rejects superseded historical versions; replacing a retained run's original
  version with the current publication is forbidden.
- Its [retrieval authorization filter](../services/data-center/retrieval.ts)
  exposes the published/in-force predicate, but the complete version-permission
  filter is private. [Source scope](../services/data-center/policy.ts) alone
  does not cover `requiredPermission`, specialty and mission-context restrictions.
  Copying that private filter into Risk would violate the approved no-policy-copy
  boundary. Removing publication/time predicates from the published filter would
  also be a policy bypass, not a supported historical authorization API.
- Historical authorization implementations exist in the frozen upstream engine
  adapters, not as a shared governed historical Data Center capability. Importing
  them would cross the approved no-production-import boundary.
- Existing [Operational history reads](../services/analysis-engines/operational-feasibility/adapters/run-persistence.ts)
  call `validateOperationalRunRecord`, which rebuilds the record and reproduces
  the calculation transcript. The [Spatial replay service](../services/analysis-engines/spatial/adapters/replay-service.ts)
  calls `runSpatialAnalysis`. Neither is a permissible Risk evidence reader.

**M2 capability gate = BLOCKED / OWNER APPROVAL REQUIRED.**
No frozen files, runtime modules, tests, dependencies or database records were
changed. No tests were rerun for this documentation-only investigation; the saved
M1 receipts remain unchanged. No M2 authorization/no-existence-leak/live-read,
native method/compatibility, PostgreSQL or CodeQL PASS is claimed.
Map historical lineage remains a separate unproven M2 gate, not implicitly
cleared by finding the Data Center blocker.

The proposed approval scope is a narrowly additive, read-only exact historical
Data Center authorization/read capability that reuses the single existing
permission policy, preserves published-reader behavior, rechecks current
source/version rights and grants, and returns the same unavailable response for
hidden and absent references. No engine recalculation, schema change, automatic
action or widening of caller access is authorized by this proposal.
Do not implement the frozen-boundary extension until the owner explicitly agrees.

**M3 NOT STARTED. REAL-DATA RISK & DECISION ACCEPTANCE = BLOCKED / NOT VERIFIED.**
**Historical Full Regression = NOT CLAIMED PASS. Sonar = DEFERRED / PENDING.**

## 16. M2 limited Data Center exception and independent Map checkpoint

The owner explicitly approved the section 15 Data Center exception on 2026-10-23,
without authorizing changes to the six engines, Shared or Map historical behavior.
Section 15 is retained as the preceding investigation, not an unresolved
Data Center approval request.

Implemented only the additive
[`readHistoricalDataCenterVersionContent`](../services/data-center/historical-version.ts)
capability and shared access-predicate extraction in
[`retrieval.ts`](../services/data-center/retrieval.ts).
The existing source/version permissions, robot grants, current rights,
specialty/mission and conflict policy are reused, not copied. The published
reader keeps its original temporal/publication eligibility. Historical reads
require exact source/version/checksum and an actual original `PUBLISHED` event;
skipped/unpublished drafts are not made accessible by their version number.
Stored hashes are recomputed, original historical dates retained, and current
source rights returned. Unavailable/hidden/absent versions share one 404.
No writes, fallback, fabricated publication reference, schema/dependency/API
change, previous-engine import or upstream recalculation was introduced.

Saved focused PostgreSQL receipts:

- `risk-m2-history-integration-initial.log`: **44 PASS / 1 FAIL**. The own robot
  revocation test tried to set only `revokedAt`, violating the existing database
  revocation constraint. Corrected the test to use the existing audited
  `revokeDataCenterRobotAccess` service; no production revocation logic changed.
- `risk-m2-history-integration-final.log`: **45/45 PASS** before the final
  invalid-reference case was added.
- `risk-m2-history-integration-validated.log`: **46/46 PASS**, one file, no skips,
  **26.25 s**: eight new historical cases plus 38 unchanged published-reader
  cases. Real migrated, dedicated PostgreSQL/PostGIS; transactions rolled back.
- `risk-m2-history-typecheck.log` / `risk-m2-history-eslint.log`: PASS,
  scoped lint zero warnings.
- `risk-m2-history-build.log`: inherited Next.js dependency-advisory interruption,
  retained as failed. `risk-m2-history-build-retry.log`: unchanged retry PASS.
  Dependency remediation remains reserved for the final security campaign.
- `risk-m2-history-typecheck-postbuild.log`: PASS after restoring generated
  declaration-path drift. `git diff --check`: PASS. The dedicated test container
  was stopped and removed; the unrelated existing PostgreSQL container untouched.

### Independent Map evidence capability gate: not silently waived

The existing Spatial
[`buildMapLayerInput`](../services/analysis-engines/spatial/map-inputs.ts)
deliberately persists `checksum: null` for ordinary Map layers, even registered
ones. Its retained limitations explicitly say no layer content checksum exists.
Only a boundary with a declared original digest may carry a checksum. A native
output hash protects that recorded descriptor; it does not retrospectively hash
the original layer contents.

Map's [public published-release reader](../services/jenan-map/service.ts) checks
the current publication pointer. Low-level `releaseById` and
[layer enumeration](../services/jenan-map/layers.ts) are not, by themselves, a
principal-aware exact historical content-integrity receipt. Spatial's dedicated
historical adapter/replay logic cannot be imported or run by Risk.
No claim is made that historical Map evidence is always unauthorized; the
missing capability is an independent reusable proof satisfying Risk's approved
current-authorization and exact-lineage requirements without upstream execution.

The owner resolved this stop by explicitly approving **fail-closed
`NOT_SUPPORTED`** for every output whose historical Map lineage cannot be proved
completely. The reader returns no native value, lineage, metadata or evidence for
that outcome. It neither guesses a checksum nor reads current Map as a substitute.
This is a recorded historical capability limitation, not a failure of Risk when
excluded safely. No Map implementation or frozen engine was changed.

## 17. M2 checkpoint: governed exact retained reads (subsequently owner-closed)

**Implemented for owner review, not owner-closed. STOP before M3.**
M1 stays closed at its separately recorded tested SHA. The Data Center prerequisite
SHA in section 1 is separate from the Risk M2 implementation commit.

### Read-only integration and exact evidence preparation

The internal server adapter
[`prepareRiskRetainedOutputs`](../services/analysis-engines/risk-decision/adapters/retained-reads.ts)
accepts a trusted authenticated Data Center principal, an explicit evaluation
instant, the strict Risk request and bounded existing access context. It is not
exported through the pure Risk entry point, nor wired to a new route or worker.

It reads the exact approved policy source/version/checksum through the reusable
historical capability, then exact retained run/output pins within one read-only
repeatable-read transaction. It uses current Data Center permission predicates
and existing owner/admin run visibility, with no unfiltered existence lookup.
All retained Data Center sources are reauthorized before checking a run's
integrity, compatibility or unsupported lineage. No source authorization cache,
audit/usage write, native runtime call, upstream recalculation, latest fallback,
substitute run, Risk persistence or replay is introduced.

The strict, versioned
[`jenan.risk-decision.read-policy/v1`](../services/analysis-engines/risk-decision/read-policy.ts)
content binds the original Risk policy, subject/scope, exact native pins and full
claim selectors to owner-reviewed native-coordinate checks and selected native
content/method hashes. It is stored as a governed existing `dataset` item: no new
Data Center type, Shared contract, schema or permission semantics are needed.
Policy must be published, verified, non-AI, in force at the declared evaluation
instant, and have declared licensing/usage; unproved upstream policy lineage is
refused. A source being visible is not permission to replace its approved policy.

Every run uses the M1 native manifest and original request/input/output/content
hash recipes, without invoking the six engines. Original saved source/version/
checksum/provenance must agree with authorized historical content and original
input descriptors. Changed current ownership, rights or attribution cannot be
silently replaced with stale retained rights. Unretained upstream version
dependencies and non-Data-Center lineage have no complete proof path here and are
excluded as `NOT_SUPPORTED`.

Compatibility requires the persisted subject plus all nine explicit mappings:
project, site, geography, sector, time, scenario, currency, unit and method.
A dimension absent from a native contract needs an explicit approved
`NOT_APPLICABLE` rationale, not guessed equivalence. Unit and methodology cannot
be waived. Native site/variant/entity, unit, structured methodology and monetary
currency/price/cash-flow basis, when present, must also match selected coordinates;
there is no conversion or recalculation. The mapping policy is authoritative
reviewed context, not automated taxonomy matching or real-data certification.

Available evidence contains only validated native selections and their original
lineage; selected key/method/content and native evidence references must match.
Each failed outcome contains only the caller-pinned `runId`, a status and
`evidence: null`. Hidden and nonexistent records share `UNAVAILABLE`; only
authorized records can report `TAMPERED`, `INCOMPATIBLE` or `NOT_SUPPORTED`.
Caller-declared `MISSING` slots remain separate and are not discovered by probing.

The preparation contract is `jenan.risk-decision.preparation/v1`, phase
`M2_EXACT_READS`: `decision = null`, empty findings/condition outcomes and
`automaticAction = false`. Missing, unavailable or unsupported evidence is
never evaluated as confirmed risk. Request/outcome/output hashes are deterministic;
M1 JSON/depth/node/work limits remain, retained native bytes are capped at 8 MiB
in aggregate, each lineage at 128 and the entire final preparation at 2 MiB.

### Validation scope and truthful limitations

Focused tests use actual native envelopes from all six calculators **in test
fixtures only**, rebound to synthetic, governed PostgreSQL sources inside
rolled-back transactions. Production Risk does not import or execute them.
These tests certify retained-read/hash/access/mapping mechanics, not production
data, real geography/taxonomy equivalence or the truth of original model inputs.
Unprovable Spatial Map lineage stays `NOT_SUPPORTED`; other outputs without
selectable, provable evidence are likewise not represented as available.

No six-engine/Map/Shared source, schema, Auth, UI, dependency or workflow change.
Global guards add only a named read-only Risk adapter allowlist; prior engine
allowances are not broadened. No broad historical regression, CodeQL or Sonar
claim is made in M2.

### Saved M2 validation receipts

- `risk-m2-focused-2.log`: **344/344 PASS**, six files, no skips:
  **325 Risk M1/M2 + 19 global boundary cases**. The additional global case is
  the exact read-only Risk adapter guard; no prior-engine gate was removed.
  This is a test count, not a coverage-percentage claim.
- `risk-m2-retained-validated.log`: **24/24 PASS**, one file, no skips,
  **76.16 s**. Covers exact native envelopes, fail-closed Map exclusion, nine
  compatibility dimensions, owner/absent indistinguishability, authorization
  before corrupt-content disclosure, rights rechecks, claim/policy substitution,
  missing slots, version/hash/subject mismatches, deterministic no-write
  preparation and original policy access after supersession.
- `risk-m2-postgres-final.log`: the unchanged Data Center file passed all
  **46/46**, including eight historical and 38 published-reader cases. That
  combined command is **not** labeled PASS: its Risk file had a test-registration
  defect, fixed before the separate final 24-case run above.
  Final scoped PostgreSQL receipts therefore total **70/70** across these two
  successful file-level results, not a claimed successful combined command.
- Dedicated migrated PostgreSQL **17.5**, PostGIS **3.5.2**, **78** completed
  migrations; synthetic fixtures roll back. No production database was used,
  reset or certified; no spatial calculations are performed by Risk.
- Original unsuccessful fixture/check receipts remain saved: initial synthetic
  policy exceeded the existing Data Center content limit; a later fixture lacked
  mandatory `usageIntent`; the first boundary run lacked the narrow adapter
  guard. None was bypassed by changing production constraints.
- The first expanded suite accidentally nested test registration; corrected.
  A subsequent build-concurrent run had transaction-acquisition/test timeouts
  and follow-on fixture-context errors (**16 PASS / 8 FAIL**), retained as failed.
  The test's former 20-second deadline could expire before its 60-second rollback
  transaction: the fixture now surfaces original errors and has an 80-second
  test deadline around a 60-second transaction / 10-second acquisition bound.
  Production's 30-second preparation transaction is unchanged. The final
  dedicated run above passed without weakening assertions.
- TypeScript and scoped zero-warning ESLint passed. Production build's initial
  `risk-m2-build-final.log` failed on the inherited Next.js dependency advisory;
  **unchanged retry** `risk-m2-build-final-retry.log` passed. The failed first
  attempt is not relabeled PASS or dependency remediation.
- `risk-m2-typecheck-postbuild.log`: PASS after restoring only generated
  declaration-path drift. Final scoped ESLint: PASS, zero warnings;
  `git diff --check`: PASS. The owned disposable container was stopped/removed;
  the unrelated PostgreSQL container was not changed.

The M2 implementation SHA is the Risk-branch commit containing this checkpoint;
the final owner report records its full hash and the verified Local/origin/
Desktop archive match after push. No final tag or main/integration merge.

**REAL-DATA RISK & DECISION ACCEPTANCE = BLOCKED / NOT VERIFIED.**
**Historical Full Regression = NOT CLAIMED PASS. Sonar = DEFERRED / PENDING.**
**M3 NOT STARTED. No Final Tag or main/integration merge.**

## 18. M3 checkpoint: interpretation and explainable conditional decision

**JENAN RISK & DECISION ENGINE — M3 CHECKPOINT FOR OWNER REVIEW**

The owner accepted and CLOSED M2 at
`c71bf1f8bccb4dd8fc03cc225182d66a8acd48eb`, including its exact Local/origin/
Desktop match, 325 Risk + 19 global = 344 focused cases, 24 Risk PostgreSQL
and 46 Data Center file-level cases, types/lint/build-retry/diff gates.
M2's rejected attempts are not relabeled. M3 alone is authorized here;
**STOP before M4**. The earlier section 17 stop records the historical M2
checkpoint, not the current milestone.

### Governed interpretation, not caller-authenticated JSON

The existing internal read-only adapter now also exposes
[`interpretRiskRetainedOutputs`](../services/analysis-engines/risk-decision/adapters/retained-reads.ts).
It repeats current authorization and the exact M2 reads on every invocation,
and consumes the resulting selections and policy **inside the same repeatable-read
transaction**. No second latest-policy lookup, caller-supplied prepared snapshot,
upstream run/replay/calculator, source write, audit/usage write or Risk storage
is introduced. No route, UI, worker, schema, dependency or permission change.

The strict optional `interpretation` field in the existing governed read-policy
contains
[`jenan.risk-decision.interpretation-policy/v1`](../services/analysis-engines/risk-decision/interpretation-policy.ts):
versioned method, exact engine applicability declarations, exact approved
scenario declarations, bounded native projections, condition-linked finding
templates, explicit same-measure conflict pairs and explicit scenario claim
mappings. It is governed by the exact original Data Center policy version/hash,
not a new caller assertion. Applicability waivers, scenario approvals, variants
and assumption mappings cannot be changed by the caller without matching that
governed policy. Approval/assessment evidence must resolve retained sources.
The M2 preparation API remains preparation-only with `decision = null` and empty
findings/outcomes; a policy without `interpretation` still works in M2.
The M3 entry instead returns `NOT_SUPPORTED`, `decision = null`, `result = null`
when that explicit approved interpretation policy is absent.

The
[`interpretRiskPreparation`](../services/analysis-engines/risk-decision/interpretation.ts)
core is pure and verifies preparation/request/outcome/output hashes and exact
pin sets. Its exported pure API is **not proof of authorization**: production
server callers must use the adapter, not JSON received from an HTTP client.
There is no new public endpoint. Rejected current authorization, tamper or scope/
compatibility produces no final business decision; the server result is null.

### Native projection, precision and quality

Only selected, authorized native metric values are projected. Value field,
kind and estimated-value treatment are explicit in the approved policy.
Native status, interpretation, original reported/exact values, structured units/
method/basis, confidence components, reasons and assumption IDs are retained.
Evidence cites only the native metric's declared `evidence`/`inputRefs`, resolved
to original retained input/version/checksum, not unrelated context sources.
Selection record IDs bind exact run/pointer identities deterministically.

Existing `exactValue` decimal strings may be compared with M1's bounded exact
base-10 comparator. Financial/shared reported values remain `REPORTED_ONLY`:
they are not promoted to missing exact values. Native JSON numbers retain the
original number in the result, with a reported-only decimal display where it
fits the declared decimal bounds; they may prove presence/state, not an exact
threshold. Exponential/unsupported precision is refused, not rounded or rebuilt.
No upstream formula, conversion, interpolation or binary-floating calculation.

Missing, unavailable, unsupported, coverage-limited and non-computable values
remain null/unknown. PARTIAL evidence does not establish an exact threshold.
ESTIMATED evidence remains unknown unless the governed projection explicitly
allows **conditional** interpretation; it never becomes an observed exposure.
`PLAN_DERIVED`, assumption-based projections and upstream-derived quantities
cannot establish an observed adverse event. `EVIDENCE_GAPS` remains a quality
limitation, not a business exposure. Low confidence is not likelihood or failure
probability. Native confidence is retained, with no invented cross-policy common
band or averaged confidence; M1 confidence-mapping helpers remain unchanged.

### Rules, findings, conflicts and dependencies

The evaluator uses the M1 finite operators only: EQ/NE/GT/GTE/LT/LTE, IN, PRESENT,
STATE and bounded acyclic ALL/ANY. There is no executable/script policy.
Decimal operands require the exact declared basis and native exact precision.
Presence or state rules establish only what they explicitly test: an absent
output's failed completeness condition is an evidence gap, not a confirmed
business risk.

Findings use the approved categories and distinguish `EVIDENCED_EXPOSURE`,
`CONDITIONAL_RISK`, `EVIDENCE_GAP`, `DATA_QUALITY_LIMITATION`,
`CROSS_ENGINE_CONFLICT` and `DEPENDENCY_GAP`. Only failed evidenced conditions
can instantiate a risk template. Observed exposures stay separate from
plan/assumption-derived conditional risks, whose claim/assumption identities
remain attached. Missing data is never zero or a new adverse event.

Impact/likelihood are nullable. Only explicitly retained, approved same-event/
scope/horizon assessments can support severity through the complete M1 approved
lookup matrix. Missing assessments, absent matrix or unmapped bands remain
`NOT_ASSESSABLE`, not LOW. Foreign/future assessments are rejected rather than
repaired. No default likelihood, severity, project success probability or score.

Cross-engine conflicts require an explicit approved same-measure pair from
different engines, identical entity/scope/basis, **full native structured unit,
method and basis**, definite native states and comparable exact values.
HOUR/MINUTE, price-basis, method, horizon, interpretation or precision mismatches
are `NOT_COMPARABLE`, not contradictions or implicit conversions. Both sides
of a real contradiction and their evidence remain visible; affected conditions
are UNKNOWN. There is no majority vote or automatic winner.

Dependency gaps propagate only along the approved acyclic evidenced edges.
An unresolved prerequisite can withdraw a dependent condition's assurance but
cannot invent a downstream adverse event. A separately established failed
condition remains visible and is not erased by another unknown prerequisite.

### Scenarios, mitigations and decision

Only existing exactly pinned, approved scenario mappings are evaluated.
Scenario claim substitutions must preserve native measure/entity/basis/units/
method and have an existing matching run/variant and approved scenario scope.
Invariant reuse needs its own explicit rationale. Missing mappings remain
unknown; a different run or unapproved scenario is never generated/substituted.
Coverage is checked for the scenario's selected runs, not an accidental demand
to reuse every base run as well. Output is side-by-side conditions, conflicts,
findings, coverage and actions. No probability, expected value, ranking, default
winner or newly computed scenario.

Mitigation templates are the M1 approved actions only. Each retains condition
IDs, evidence/policy reference, rationale, owner role and required verification.
They are `PLANNED`, not implemented/verified, and have **no effect on the current
decision**; new verified evidence and a new Risk evaluation are required.
No supplier, staffing, pricing, deadline, efficacy or automatic action is invented.

The result uses `jenan.risk-decision.result/v1`, phase `M3_INTERPRETATION`,
engine version `1.0.0-m3`; M1's foundation builder/version remain unchanged.
The server execution wrapper is `jenan.risk-decision.execution/v1`.
It applies the accepted M1 decision precedence:

1. `NOT_SUPPORTED`
2. `DO_NOT_PROCEED_UNDER_CURRENT_PLAN`
3. `DEFER_PENDING_EVIDENCE`
4. `REVISE_PLAN`
5. `PROCEED_UNDER_DECLARED_CONDITIONS`

Every result retains the exact policy, native pins/source references, projected
claims, original lineage/rights/attribution context, rule definitions/results,
evidence, limitations, unresolved conditions, decision reasons and verification
requirements. Human review is REQUIRED; automatic action is false. No supported
Risk export is exposed; upstream permissions cannot grant policy-derived export
rights implicitly.

All six roles must be covered, except exactly governed evidenced non-applicability,
before a positive conditional decision. Missing roles defer it. The accepted
historical Map gap remains `NOT_SUPPORTED` without output/evidence or substitutes.
Thus the real PostgreSQL fixture intentionally retains a final `NOT_SUPPORTED`
when its Spatial output has unprovable Map lineage, while still reporting any
independently supported Operational condition failure. Pure synthetic cases with
six provable roles exercise all five decision states; they are not production
Map or real-data certification.

M1 JSON/depth/node bounds remain. M3 adds bounded interpretation work within
20,000 units, aggregate findings at most 500, four scenarios, and a final 2 MiB
result/execution-wrapper check. Over-limit evidence is rejected, not truncated
into a deceptively positive report. Hashes bind request, governed preparation,
policy and complete output; no new persistence or historical replay.

### M3 validation and delivery

Saved final receipts:

| Gate | Result |
| --- | --- |
| New M3 interpretation cases | **89/89 PASS** |
| Risk M1-M3 unit cases | **414/414 PASS** |
| Unchanged global engine boundary cases | **19/19 PASS** |
| Focused total, seven files | **433/433 PASS, no skips** |
| Governed retained-read PostgreSQL, one file | **29/29 PASS, no skips** |
| TypeScript | PASS |
| Scoped ESLint | PASS, zero warnings |
| Production Build | Initial inherited advisory failure retained; unchanged retry PASS |

`risk-m3-focused-validated.log`: final 433 cases in **12.72 s**.
`risk-m3-postgres-validated.log`: final 29 cases in **81.17 s**, consisting of
the accepted 24 M2 cases plus five new M3 server integration cases. These prove
actual governed reads, native Operational conditional threshold interpretation,
Map exclusion, null result for absent interpretation policy/access withdrawal,
original policy after supersession, deterministic output and unchanged
Run/Input/Audit/Usage counts. PostgreSQL **17.5**, PostGIS **3.5.2**,
**78 unchanged completed migrations**, isolated synthetic database with rolled-back
fixtures; no real-data or native spatial-computation claim.

`risk-m3-typecheck-validated.log` and `risk-m3-eslint-validated.log`: PASS.
`risk-m3-build.log`: **FAIL**, inherited Next.js dependency-security interruption;
`risk-m3-build-retry.log`: **PASS**, unchanged retry. No upgrade, advisory
remediation or dependency clearance is claimed. Only generated declaration-path
drift is restored before the sequential post-build typecheck.
`risk-m3-typecheck-postbuild.log`: **PASS** after that restoration.
Final `git diff --check`: **PASS**. The owned disposable M3 container was
stopped/removed; the unrelated existing PostgreSQL container remained untouched.

Earlier development failures remain saved, not labeled PASS: an identifier used
a leading JSON-pointer slash; the global guard correctly rejected a type-import
expression and a prohibited legacy product term even in a negative sentence;
two fixture assertions used the wrong sorted claim/index or an unchanged digest.
These were corrected without weakening existing global guards. The first
PostgreSQL M3 run was **27 PASS / 2 FAIL**: the fixture lacked required version
title, and its initial Operational assertion expected an estimate to be definite.
The fixture title was supplied and estimated interpretation was made an explicit
governed `ALLOW_CONDITIONAL` choice, with separate UNKNOWN/conditional unit tests.
No native engine output or calculation was changed to satisfy the assertion.
The diagnostic M3-only run passed five with 24 deselected; only the final
29/29 run above is the no-skips integration acceptance receipt.

Only focused Risk/unit/global-boundary and governed retained-read PostgreSQL tests
were run; no broad historical regression, Sonar or exact-SHA CodeQL claim.
The M2 Data Center 46-case receipt remains its accepted evidence, not a newly
claimed M3 run.

No six-engine, Shared, Map, Data Center source, Prisma, dependency or UI changes
relative to the approved M2 SHA. The M3 implementation SHA is the Risk-branch
commit containing this checkpoint; its full hash and final Local/origin/Desktop
match are reported after push. No tag, deployment or main/integration merge.

**REAL-DATA RISK & DECISION ACCEPTANCE = BLOCKED / NOT VERIFIED.**
**Historical Full Regression = NOT CLAIMED PASS. Sonar = DEFERRED / PENDING.**
Next.js dependency-security remediation remains independent final-campaign debt,
not resolved by build retries or CodeQL.
**M3 awaiting owner review. M4 NOT STARTED. No Final Tag or main/integration merge.**

## 19. M4 checkpoint: atomic history and separate exact reinterpretation

The owner closed M3 at `310c97a23b610898e0562a5ba039b4a63443f1fe` and
authorized M4 only. The preceding section is the historical M3 checkpoint,
not the current milestone status.

### 19.1 Storage and interfaces

Risk-owned `history.ts` defines the strict `jenan.risk-decision.history/v1`
runtime contract, history version **1.0.0-m4**, explicit creation/timing/access
context, and immutable parent hashes. It reuses the unchanged Shared Run/Input
contract. The retained interpreter remains **1.0.0-m3**; decimal comparison
remains `risk-exact-decimal-comparison-v1/1.0.0`, rounding
`NONE_PRESERVE_UPSTREAM`, and confidence
`NATIVE_EVIDENCE_QUALITY_ONLY_NO_COMMON_BAND_OR_PROBABILITY`.

The server-only `adapters/run-history.ts` provides:

- `persistRiskDecision(request, originalEvaluatedAt, context, actor, access)`:
  current-authorized exact policy/native reads, M3 interpretation, full hash/
  contract validation and nested Run/Input creation in **one repeatable-read
  transaction**. No save when the approved interpreter is absent, any pinned
  evidence is unavailable/tampered/incompatible, or the decision is null/rejected.
- `readRiskDecision(runId, actor, access)`: exact owner/admin record selection,
  current authorization of every retained policy/source, version/hash checks,
  reconstruction of the complete original interpretation and metadata, then
  disclosure. **Read writes nothing** to Run/Input/Data Center/Audit/Usage.
- `reinterpretRiskDecision(parentRunId, newContext, actor, access)`: verifies and
  reproduces the original, rereads its exact evidence using its **original
  evaluatedAt**, then appends a separate record. Parent `runId`, `recordHash`
  and `outputHash` are saved both in runtime lineage and an explicit ENGINE_RUN
  parent descriptor. No overwrite, new policy selection, reevaluation at a new
  evidence horizon, or implicit method migration.

The trusted actor is never accepted from request JSON. Original actor metadata
is preserved on historical reads; a child records its own authenticated actor.
Subject/project and original site/geography/sector/period/scenario context remain
in the exact normalized request. Creation timestamps and execution timing are
explicit, canonical and mutually consistent; child creation cannot precede the
parent or change environment. New creation context does not alter business output.
Original specialty/mission/organization access context must be supplied exactly
on reads; it is not silently restored as an authorization grant.

Every record retains the entire M3 result: decision, reasons/explanation, original
policy/approval/method, evidence references and native components, conditions,
constraints/limitations, findings/risks, conflicts, gaps, uncertainty, planned
mitigations, scenarios, upstream pins and lineage. The exact governed
interpretation policy is retained by immutable DC version/checksum plus policy
content hash, not by a latest-version pointer. Unsupported Map descriptors are
references/status only, never hidden native output or fabricated evidence.

### 19.2 Integrity, recovery and fail-closed semantics

- Request hash: canonical normalized original Risk request.
- Input hash: canonical sorted Risk input descriptors, including exact policy,
  pinned native runs and the child parent descriptor where applicable.
- Stored output hash: canonical **entire M3 result**. This deliberately differs
  from the nested M3 `determinism.outputHash`, which hashes that result without
  its `determinism` member. Both are checked; no upstream hash is reinterpreted.
- Record hash: complete Shared RunRecord including actor, timing, context,
  result, descriptors and versioned runtime, excluding only its own
  `runtime.recordHash`. Equal original inputs produce equal business output;
  a separate child has a different identity/record hash.
- Whole history envelope is bounded at **2 MiB**, including JSON overhead;
  existing depth/node and Shared bounds also apply, with no truncation.
- DATA_CENTER_VERSION input columns additionally bind exact source/version,
  raw UTF-8 content SHA-256, original provenance/ownership/rights and use intent.
  They are checked separately on every authorized historical read.
- Existing database append-only triggers protect Run and Input. The existing
  run-ID primary key protects stable retry identities; no new request-hash
  uniqueness rule prevents distinct interpretations of the same evidence.
- Nested input failure rolls back its Run and every Input. A failed child leaves
  its parent and upstream records untouched. Retrying the same explicit run ID
  succeeds after rollback; an already saved ID raises an explicit duplicate error.

Denied and absent records/sources are externally `RISK_HISTORY_UNAVAILABLE`;
current authorization is evaluated before exposing integrity diagnostics.
Authorized tampering raises `RISK_HISTORY_MISMATCH`. Unsupported historical
versions or newly unprovable historical lineage raise
`RISK_HISTORY_NOT_SUPPORTED`; no child or replacement evidence is returned.
An already excluded Map lineage gap remains reproducibly excluded, with the
same explainable `NOT_SUPPORTED` decision, rather than a manufactured risk.
Superseding policy/source publication does not substitute for the original.
Current license/usage changes fail closed rather than silently migrating rights.

No historical reinterpretation executes Engines 1-6, recalculates Map, writes
Data Center, changes the original record, or generates a score/probability or
automatic launch/investment/funding action. The only production modifications
are Risk-owned modules; M2 exact-read behavior is retained while its transaction
executor is reused to avoid a nested transaction during atomic M4 operations.
The read-only adapter guard remains strict. Only the specific new history adapter
is allowed one nested Run/Input create call; SQL/update/delete/upsert and
upstream-runtime imports remain prohibited.

### 19.3 M4 validation and publication

| Gate | M4 result |
| --- | --- |
| New pure history contract/hash/bounds cases | **34/34 PASS** |
| Risk M1-M4 unit cases, including one new own-adapter guard | **449/449 PASS** |
| Global engine boundaries, including one narrow history-adapter guard | **20/20 PASS** |
| Focused total, eight files | **469/469 PASS, no skips** |
| PostgreSQL retained reads/history/recovery, one file | **64/64 PASS, no skips** |
| TypeScript | PASS |
| Scoped ESLint | PASS, zero warnings |
| Production Build | Initial inherited advisory interruption; unchanged retry PASS |
| Sequential post-build TypeScript after generated-path restoration | PASS |
| Final git diff --check | PASS |

`risk-m4-unit-final.log`: 469 focused cases in **11.92 s**. Accepted M1-M3
cases remain in that run; the previously accepted 19 global boundary cases
are preserved and the new history capability has its own narrow twentieth gate.
`risk-m4-pg-validated.log`: 64 cases in **210.82 s**, comprising the accepted
29 M2/M3 cases and **35 new M4 integration cases**. They cover complete atomic
persistence, original policy/native pins, shared-storage compatibility,
read-no-write counts, separate deterministic children, parent immutability,
stable-ID duplicates, nested-input rollback/retry, failed-child recovery,
Run/Input update/delete rejection, current policy and source authorization,
owner/absent indistinguishability, original versions after supersession,
record/result/runtime/input/provenance/content tampering, unknown interpreter
versions, newly unprovable historical lineage, license changes and invalid
creation/environment context. No frozen engine is changed or recalculated.

Environment: **PostgreSQL 17.5 / PostGIS 3.5.2 / 78 unchanged migrations**.
All PostgreSQL fixtures are synthetic and rolled back on an isolated disposable
database. PostGIS installation is an environment receipt, not a claim of native
spatial calculation or real-data acceptance.

`risk-m4-typecheck.log` and `risk-m4-eslint.log`: PASS, zero lint warnings.
`risk-m4-build.log`: initial inherited Next.js advisory interruption **FAIL**;
`risk-m4-build-retry.log`: identical unchanged production-build retry **PASS**.
No advisory remediation, package upgrade or dependency clearance is claimed.
Only generated declaration-path drift was restored before the sequential
`risk-m4-typecheck-postbuild.log` **PASS** receipt. Final `git diff --check`:
**PASS**. No source changes occurred between the two builds.
The owned `jenan-risk-m4-check` container was stopped and removed; the unrelated
existing `jenanbiz-postgres` container was left running and untouched.

Development-only failures remain retained, not relabeled PASS:
the first test fixture used uppercase environment literals and was corrected to
the existing lowercase contract; two intermediate integration runs exposed
misplaced test registration, not a production persistence failure. The first
fully registered run passed **60/60**; the four added lineage/child recovery/
policy-rights/license cases then passed a diagnostic **4 PASS / 60 deselected**
run. Only the final **64/64, no skips** run above is the integration acceptance
receipt. A later optional shell row-count query had a quoting error; it is not
counted as a passing database gate or a fixture-cleanup receipt.

Only targeted Risk and global-boundary tests were rerun. Historical full
regression and the M2 accepted Data Center 46-case suite were not rerun or
relabeled as new M4 results. No performance/load/concurrency or CodeQL claim is
made in M4; these remain M5 acceptance work, not silently claimed PASS here.

Frozen six-engine, Shared, Map, Data Center, Prisma and dependency paths remain
unchanged relative to approved M3. Post-build types/diff-check are PASS. The
final report records exact Local/origin/Desktop synchronization after push. The M4
implementation SHA is the Risk-branch commit containing this checkpoint and is
reported in full after push; no self-referencing substitute SHA or final tag.

**REAL-DATA RISK & DECISION ACCEPTANCE = BLOCKED / NOT VERIFIED.**
**Historical Full Regression = NOT CLAIMED PASS. Sonar = DEFERRED / PENDING.**
No M4 CodeQL claim. Next.js dependency-security advisory remains independent
final-campaign debt, not cleared by CodeQL or a successful build retry.
**M4 awaiting owner review. STOP before M5. No Final Tag or main/integration merge.**

## 20. M5 final technical acceptance

M4 was owner-approved / CLOSED at
`ac3c3afd7370000cfbb08be64a0d7c8933daebc9`. Section 19 remains its original
historical checkpoint. M5 introduces **tests and directly related documentation
only**: no production Risk, upstream-engine, Map, Shared, Data Center, Prisma,
dependency, UI or HTTP change.

### 20.1 Final acceptance method

The full Risk-owned M1-M4 unit suites and global architecture boundaries are
rerun, together with all 64 accepted governed-read/history integration cases
and seven new M5 acceptance cases. The new fixtures use two distinct synthetic
projects, users and organizations, published exact native outputs and approved
interpretation policies. Each non-admin user is an active owner of only its
own organization. All data is synthetic; no production decision is certified.

Earlier cases retain their rollback/savepoint isolation. The M5 cases
deliberately **commit fixtures** on an owned disposable database and set the
test executor override to null. Thus concurrency runs through real independent
production adapter transactions, not multiple callbacks sharing one mock
transaction. Tests do not remove append-only records; the entire owned test
database container is removed after acceptance. Never run these cases on a
shared or production database.

Acceptance exercises:

- Four simultaneous complete writes across two projects/users/organizations,
  validating each actor/subject and all seven input rows.
- Six simultaneous writes to one stable run ID: exactly one complete winner,
  five explicit duplicates, no overwritten history or orphan inputs; subsequent
  retry is also duplicate and the winner remains readable.
- Concurrent cross-user and wrong-organization-context historical reads versus
  nonexistent IDs return the identical public unavailable error.
- Four simultaneous Risk-only children retain the exact original decision and
  business output hash despite distinct child IDs and creation instants.
  Racing Run update/delete and Input update attempts all fail, preserving the
  original record.
- A test-only PostgreSQL trigger rejects one designated run's nested input,
  proving real server-side transaction rollback of both Run and Input. The
  same ID succeeds on retry after removing that scoped test failure hook.
  No production trigger/schema/migration is changed.
- A synthetic bounded load runs 12 reads at concurrency four and eight writes
  at concurrency eight; thresholds are **10 seconds per read**, **30 seconds
  for each read/write batch**, and **256 MiB positive process heap growth**
  over the batch. These are local synthetic acceptance ceilings, **not a
  production SLA or a large-scale capacity certificate**. The test logs only
  counts, elapsed time, memory delta and envelope byte size, never retained
  evidence, project/user/source identifiers or credentials.
- Committed membership withdrawal denies the next historical read and child
  request just like an absent record; restoration permits exact original
  reproduction. A database join verifies zero orphan input rows.

Determinism remains the approved M3 interpretation with original evaluation
instant, policy/method versions, exact retained evidence and canonical hashes.
New child identity/actor/creation metadata intentionally changes its record hash,
not the interpretation or business output. Existing pure-module architecture
tests prohibit hidden clocks/randomness, model/network calls and upstream
runtime imports. Missing/unprovable Map lineage remains `NOT_SUPPORTED`,
never inferred risk or replacement data.

### 20.2 Security scope and deferred items

A read-only security review of accepted Risk production modules and immediate
authorization interfaces found **no confirmed exploitable vulnerability**.
It did not run tests or CodeQL and is not a substitute for their receipts.
No Risk HTTP route/caller exists in the current app/services inventory, so
Risk-specific same-origin/CSRF transport testing is **not applicable** in this
milestone; platform HTTP/auth security is not relabeled as newly certified.
Trusted-principal construction remains the future caller's responsibility.

Risk uses no production logging of retained evidence. The denied/absent and
duplicate acceptance cases assert public error codes/messages without source
content, identifiers, raw SQL or credentials. Forced storage failures are
deliberately propagated to the server caller, not converted into success;
this milestone does not claim a new public HTTP error-mapping layer.

CodeQL must scan the exact tested M5 candidate SHA with the existing
`security-extended` JavaScript/TypeScript and Actions workflow. Existing
dismissed historical alerts are snapshotted before and after the scan, without
reopening, dismissing or relabeling them. Zero new/open Risk alerts is a
separate gate from build and dependency security.

**Sonar = DEFERRED / PENDING**: no subscription, plan, branch-analysis workflow
or billing change is attempted. Branch-analysis availability is not newly
asserted without a fresh service receipt. Next.js/dependency advisory remains
independent final-security-campaign debt; neither CodeQL nor build retry clears it.
**REAL-DATA RISK & DECISION ACCEPTANCE = BLOCKED / NOT VERIFIED.**
**Historical Full Regression = NOT CLAIMED PASS**: this is the full Risk
regression, not the historical repository-wide suite or a rerun/reopening of
the six frozen engines.

### 20.3 Final gate receipts

| Gate | Final M5 result |
| --- | --- |
| Risk M1-M4 contracts/policy/interpretation/history units | **449/449 PASS** |
| Global engine boundaries | **20/20 PASS** |
| Full focused Risk/global unit regression, eight files | **469/469 PASS, no skips** |
| Full PostgreSQL retained reads/history/final acceptance | **71/71 PASS, no skips** |
| New independent-transaction concurrency/isolation/load cases | **7/7 PASS**, included in 71 |
| TypeScript | PASS |
| Scoped ESLint | PASS, zero warnings |
| Production build | PASS on unchanged retry; initial advisory interruption retained |
| Sequential post-build TypeScript | PASS |
| Final git diff --check / frozen-production diff | PASS / unchanged |

`risk-m5-unit.log`: **469/469** in **14.50 s**.
`risk-m5-postgres-final.log`: **71/71** in **399.46 s** on the owned local
synthetic PostgreSQL **17.5 / PostGIS 3.5.2**, with **78 unchanged completed
migrations**. The slower complete run includes the original fixture setup,
all retained-evidence/history gates, and committed concurrent acceptance cases.
No test is skipped in either final receipt.

Final local synthetic measured load:

| Measurement | Observed | Ceiling |
| --- | --- | --- |
| Longest of 12 reads, concurrency four | **2,910 ms** | <10,000 ms/read |
| Complete 12-read batch | **8,038 ms** | <30,000 ms |
| Eight concurrent writes | **4,818 ms** | <30,000 ms |
| Positive end-minus-start process heap delta | **0 bytes** | <256 MiB |
| Complete representative history envelope | **73,219 bytes** | 2 MiB |

The zero positive heap delta means the end heap was not above the start heap;
it does **not** mean zero allocations, zero peak usage or a leak-proof
production-capacity certificate. An earlier seven-case diagnostic recorded
86,289,800 bytes positive heap growth, also below the same bound, with a
1,753 ms slowest read and 2,910 ms eight-write batch. That diagnostic selected
seven and deselected 64; only the final unfiltered 71/71 receipt above is
acceptance. One initial TypeScript fixture check rejected a BigInt literal for
the existing target; the test now uses `BigInt(0)` without changing tsconfig.

`risk-m5-typecheck.log` and `risk-m5-eslint.log`: PASS, zero lint warnings.
`risk-m5-build.log`: initial **FAIL** includes the inherited Next.js
`SecurityFatalError`; `risk-m5-build-retry.log`: **PASS** on the identical
unchanged command. Expected unavailable build-only database diagnostics and
existing Map dynamic-import warnings are not Risk regressions and are not
claimed fixed. No source/dependency modification occurred between attempts.
Only generated Next declaration-path drift was restored before
`risk-m5-typecheck-postbuild.log`: **PASS**. Final `git diff --check`: **PASS**.
All production modules, including Risk itself, remain byte-identical to
approved M4.
The owned `jenan-risk-m5-check` container, including all committed synthetic
history, was stopped and removed after the final database run. The unrelated
existing `jenanbiz-postgres` container stayed running and untouched.

### 20.4 Exact-SHA security acceptance and technical closure

**Tested implementation / exact-SHA CodeQL:**
`80038136f607ef57f50b08b38b3a0387fdaa4012`.

CodeQL run [39896617282](https://github.com/Jenan21/jenanbiz1-git/actions/runs/39896617282)
completed **SUCCESS** on that exact SHA, not on M4 or a later documentation
receipt. Existing `security-extended` workflow, unchanged:

| Uploaded analysis | Category | Commit | Result |
| --- | --- | --- | --- |
| `2010401789` | `/language:javascript-typescript` | `80038136f607ef57f50b08b38b3a0387fdaa4012` | SUCCESS, empty analysis error |
| `2010398274` | `/language:actions` | `80038136f607ef57f50b08b38b3a0387fdaa4012` | SUCCESS, empty analysis error |

The branch-scoped open-alert API returned **[]**: zero open alerts, including
zero Risk & Decision alerts. JavaScript/TypeScript `results_count = 5` is **not**
a zero-results claim: all five are existing dismissed historical findings,
outside Risk, with unchanged dismissal timestamps and reasons. Actions has zero
results. No findings were dismissed/reopened/edited in M5:

| Historical alert | Existing state / reason |
| --- | --- |
| `14` | dismissed / won't fix |
| `10` | dismissed / won't fix |
| `9` | dismissed / false positive |
| `3` | dismissed / false positive |
| `2` | dismissed / false positive |

Before/after alert snapshots, uploaded analysis metadata and the exact workflow
receipt are retained in the session validation evidence. The read-only manual
Risk security review reported no confirmed exploitable findings; it does not
assert whole-platform security or replace dependency remediation.

No production source changed between approved M4 and the tested M5 SHA.
This final receipt is a **documentation-only closure child** of the tested M5
commit; its own commit hash is reported after publication and must never replace
the tested/CodeQL SHA above. The final report verifies:
**Local HEAD = origin Risk branch HEAD = Desktop archive HEAD**, clean.
No final tag, main/integration merge, production deployment or real-data
certification was performed.

**JENAN RISK & DECISION ENGINE = TECHNICALLY COMPLETE — PENDING FINAL SONAR.**
**REAL-DATA RISK & DECISION ACCEPTANCE = BLOCKED / NOT VERIFIED.**
**Historical Full Regression = NOT CLAIMED PASS.**
**Sonar = DEFERRED / PENDING.**
Next.js/dependency advisory remains independent security debt for the final
campaign. No success probability, opaque final score, invented likelihood/
severity, missing-evidence AI fill, latest fallback, source substitution,
Map recalculation or automatic launch/investment/funding action was introduced.
M5 technical acceptance is complete for owner review; no further implementation
stage is started.
