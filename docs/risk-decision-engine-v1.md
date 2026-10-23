# JENAN RISK & DECISION ENGINE — M0 ARCHITECTURE REVIEW

## 1. Authority, accepted baseline and mandatory stop

**Owner authorization on 2026-10-23: M0 Architecture & Implementation Plan ONLY.
M0 submitted for review. M1 NOT STARTED. No engine scaffold or runtime changes.**

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
Data Center remains frozen at `04d6148dfb875532404059adb55fcac8ee6913b2`.

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

Proposed folder: `services/analysis-engines/risk-decision`; **not created in M0**.
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
   input/ref kind for it or add an unsupported Shared enum/Prisma foreign key.

Proposed ports: `RiskPolicyPort` for exact governed Data Center policy content,
and `UpstreamRunSnapshotPort` for exact authorized stored Run/Input projections.
A narrow Risk-owned adapter reads existing history tables without writes, engine
imports, upstream replay or upstream calculation. It uses current platform
principal/access policy and existing governed source APIs; never caller-asserted
authorization, run ownership alone, or a privileged unfiltered bulk read.
The approved decision model is a real Data Center input; original run references
and lineage live in the Risk-local result/runtime, alongside original source refs.
Shared generic Run/Input JSON storage is reused unchanged.

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
Propose a Risk-local clone of the existing decimal dependency, precision 34 and
HALF_EVEN, for finite bounded decimal parsing/comparison only; do not mutate the
global context or import Financial/Operational arithmetic. Numeric JSON claims
retain their original representation and precision limitations; conversion to a
decimal comparison value does not create greater measurement accuracy.

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

Owner review must approve the proposed conditional decision vocabulary/precedence,
evidence-only likelihood/severity model, read-only exact upstream adapter boundary,
explicit six-role applicability, supported rule language and bounds before M1.
These are proposed architecture choices, not silently finalized product policy.
If approval changes them, revise M0 before implementation.

**REAL-DATA RISK & DECISION ACCEPTANCE = BLOCKED / NOT VERIFIED.**
**REAL-DATA OPERATIONAL FEASIBILITY ACCEPTANCE = BLOCKED / NOT VERIFIED.**
**Historical Full Regression = NOT CLAIMED PASS. Sonar = DEFERRED / PENDING.**
**M0 ARCHITECTURE REVIEW ONLY. STOP BEFORE M1. No Final Tag or main merge.**
