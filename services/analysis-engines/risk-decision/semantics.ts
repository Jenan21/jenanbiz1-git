import { z } from "zod";
import { canonicalize, compareText } from "../shared/canonical";
import { identifierSchema, sha256Schema, shortTextSchema, timestampSchema } from "../shared/primitives";

export const riskTimestampSchema = timestampSchema.refine((v) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v), "Risk timestamps require canonical UTC millisecond precision");

export const riskEngineKeys = ["spatial", "market-demand", "competitor-analysis", "opportunity-gap", "financial-feasibility", "operational-feasibility"] as const;
export const riskCategories = ["FINANCIAL", "OPERATIONAL", "MARKET", "COMPETITION", "LOCATION", "OPPORTUNITY_DEPENDENCY", "DATA_QUALITY", "CROSS_ENGINE", "GOVERNANCE"] as const;
export const riskFindingKinds = ["EVIDENCED_EXPOSURE", "CONDITIONAL_RISK", "EVIDENCE_GAP", "DATA_QUALITY_LIMITATION", "CROSS_ENGINE_CONFLICT", "DEPENDENCY_GAP"] as const;
export const riskAssessmentStates = ["SUPPORTED", "CONDITIONAL", "UNKNOWN", "NOT_APPLICABLE", "NOT_COMPARABLE", "NOT_SUPPORTED"] as const;
export const riskConditionStates = ["SATISFIED", "NOT_SATISFIED", "UNKNOWN", "NOT_APPLICABLE", "NOT_SUPPORTED"] as const;
export const riskDecisions = ["NOT_SUPPORTED", "DO_NOT_PROCEED_UNDER_CURRENT_PLAN", "DEFER_PENDING_EVIDENCE", "REVISE_PLAN", "PROCEED_UNDER_DECLARED_CONDITIONS"] as const;
export const riskConfidenceBands = ["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"] as const;
export const riskMethodSchema = z.object({ id: identifierSchema, version: identifierSchema }).strict();
export const riskEvidenceSchema = z.object({
  inputId: identifierSchema, refId: identifierSchema, checksum: sha256Schema, recordId: identifierSchema,
}).strict();
export const riskApprovalSchema = z.object({
  author: identifierSchema, declaredAt: riskTimestampSchema, rationale: shortTextSchema,
  approvedBy: identifierSchema, approvedAt: riskTimestampSchema,
  status: z.literal("OWNER_APPROVED"), evidence: z.array(riskEvidenceSchema).min(1).max(128),
}).strict().superRefine((v, ctx) => {
  if (v.approvedAt < v.declaredAt) ctx.addIssue({ code: "custom", message: "Approval cannot predate declaration" });
  if (new Set(v.evidence.map((e) => `${e.inputId}/${e.refId}/${e.checksum}/${e.recordId}`)).size !== v.evidence.length) ctx.addIssue({ code: "custom", message: "Duplicate approval evidence" });
});
export const riskPeriodSchema = z.object({
  start: riskTimestampSchema, end: riskTimestampSchema, timeZone: z.string().min(1).max(80).refine((v) => {
    try { new Intl.DateTimeFormat("en", { timeZone: v }); return true; } catch (error) { if (error instanceof RangeError) return false; throw error; }
  }, "A supported IANA time zone is required"),
}).strict().refine((v) => v.end > v.start, "A nonempty half-open period is required");
export const riskScopeSchema = z.object({
  subject: identifierSchema, siteId: identifierSchema, geography: riskMethodSchema,
  sector: riskMethodSchema, period: riskPeriodSchema, scenarioId: identifierSchema,
}).strict();
export const riskBasisSchema = z.object({
  unit: identifierSchema, currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  priceBasis: identifierSchema.nullable(), cashFlowBasis: identifierSchema.nullable(),
  timingBasis: identifierSchema, cohort: identifierSchema.nullable(), methodology: riskMethodSchema,
}).strict().superRefine((v, ctx) => {
  if ((v.unit === "MONEY") !== (v.currency !== null)) ctx.addIssue({ code: "custom", message: "MONEY requires currency and nonmonetary units cannot carry currency" });
  if (v.currency !== null && (v.priceBasis === null || v.cashFlowBasis === null)) ctx.addIssue({ code: "custom", message: "Monetary claims require explicit price and cash-flow basis" });
  if (v.currency === null && (v.priceBasis !== null || v.cashFlowBasis !== null)) ctx.addIssue({ code: "custom", message: "Price/cash-flow bases require a monetary currency" });
});

export const riskDecimalPolicy = {
  id: "risk-exact-decimal-comparison-v1", version: "1.0.0", significantDigits: 34,
  maxIntegerDigits: 18, maxScale: 64, arithmetic: "NONE", rounding: "NONE_PRESERVE_UPSTREAM",
} as const;
export const riskDecimalSchema = z.string().max(84).regex(/^-?(0|[1-9]\d{0,17})(\.\d{1,64})?$/)
  .refine((v) => v.replace(/[-.]/g, "").replace(/^0+/, "").replace(/0+$/, "").length <= 34, "At most 34 significant digits");
export function normalizeRiskDecimal(raw: string): string {
  const value = riskDecimalSchema.parse(raw);
  const [integer, fraction = ""] = value.split(".");
  const tail = fraction.replace(/0+$/, "");
  const normalized = `${integer}${tail ? `.${tail}` : ""}`;
  return /^-?0$/.test(normalized) ? "0" : normalized;
}
export function compareRiskDecimals(left: string, right: string): number {
  const a = normalizeRiskDecimal(left); const b = normalizeRiskDecimal(right);
  const negativeA = a.startsWith("-"); const negativeB = b.startsWith("-");
  if (negativeA !== negativeB) return negativeA ? -1 : 1;
  const [ai = "", af = ""] = a.replace(/^-/, "").split(".");
  const [bi = "", bf = ""] = b.replace(/^-/, "").split(".");
  const magnitude = ai.length === bi.length ? compareText(ai, bi) || compareText(af.padEnd(64, "0"), bf.padEnd(64, "0")) : ai.length < bi.length ? -1 : 1;
  return negativeA ? -magnitude : magnitude;
}
export const riskConfidenceSchema = z.object({
  policy: riskMethodSchema, band: z.enum(riskConfidenceBands), isProbability: z.literal(false),
  evidence: z.array(riskEvidenceSchema).min(1).max(128), explanation: shortTextSchema,
}).strict();
export const riskImpactSchema = z.object({
  event: identifierSchema, band: identifierSchema, value: riskDecimalSchema.nullable(), basis: riskBasisSchema,
  nature: z.enum(["OBSERVED", "DECLARED_ASSUMPTION", "UPSTREAM_DERIVED"]),
  scope: riskScopeSchema, method: riskMethodSchema, approval: riskApprovalSchema,
}).strict();
export const riskLikelihoodSchema = z.object({
  event: identifierSchema, horizon: riskPeriodSchema, population: identifierSchema,
  sourceDate: riskTimestampSchema, method: riskMethodSchema, approval: riskApprovalSchema,
  nature: z.enum(["OBSERVED_FREQUENCY", "DECLARED_ASSUMPTION", "SUPPORTED_PROBABILITY", "QUALITATIVE_ASSESSMENT"]),
  band: identifierSchema, value: riskDecimalSchema.nullable(),
  scale: z.enum(["UNIT_INTERVAL", "PERCENT", "QUALITATIVE"]),
  denominator: riskDecimalSchema.nullable(), rationale: shortTextSchema,
}).strict().superRefine((v, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (v.scale === "QUALITATIVE" ? v.value !== null : v.value === null) fail("Likelihood value must match its explicit scale");
  if (v.nature === "QUALITATIVE_ASSESSMENT" && v.scale !== "QUALITATIVE") fail("Qualitative likelihood is not numerical");
  if (["OBSERVED_FREQUENCY", "SUPPORTED_PROBABILITY"].includes(v.nature) && v.scale === "QUALITATIVE") fail("Frequency/probability requires a numerical scale");
  if (v.nature === "OBSERVED_FREQUENCY" && (v.denominator === null || compareRiskDecimals(v.denominator, "0") <= 0)) fail("Observed frequency requires a positive exposed denominator");
  if (v.value !== null && (compareRiskDecimals(v.value, "0") < 0 || compareRiskDecimals(v.value, v.scale === "PERCENT" ? "100" : "1") > 0)) fail("Likelihood outside its declared probability/frequency scale");
  if (v.denominator !== null && compareRiskDecimals(v.denominator, "0") <= 0) fail("Denominator must be positive");
  if (v.sourceDate > v.approval.approvedAt) fail("Likelihood approval must reference already existing evidence");
});
export const riskFindingSchema = z.object({
  id: identifierSchema, category: z.enum(riskCategories), kind: z.enum(riskFindingKinds),
  state: z.enum(riskAssessmentStates), scope: riskScopeSchema, claimIds: z.array(identifierSchema).max(1000),
  evidence: z.array(riskEvidenceSchema).max(128), counterevidence: z.array(riskEvidenceSchema).max(128),
  assumptions: z.array(identifierSchema).max(200), rule: riskMethodSchema,
  impact: riskImpactSchema.nullable(), likelihood: riskLikelihoodSchema.nullable(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).nullable(),
  severityState: z.enum(["ASSESSED", "NOT_ASSESSABLE"]), severityPolicy: riskMethodSchema.nullable(),
  confidence: riskConfidenceSchema.nullable(), rationale: shortTextSchema,
  reasons: z.array(identifierSchema).min(1).max(20), limitations: z.array(shortTextSchema).min(1).max(20),
}).strict().superRefine((v, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  const gap = ["EVIDENCE_GAP", "DATA_QUALITY_LIMITATION", "DEPENDENCY_GAP"].includes(v.kind);
  if (["EVIDENCED_EXPOSURE", "CONDITIONAL_RISK", "CROSS_ENGINE_CONFLICT"].includes(v.kind) && !v.evidence.length) fail("Risk assertions require evidence");
  if (v.kind === "EVIDENCED_EXPOSURE" && v.state !== "SUPPORTED") fail("A confirmed exposure must be supported");
  if (v.kind === "CONDITIONAL_RISK" && (v.state !== "CONDITIONAL" || !v.assumptions.length)) fail("Conditional risk retains its declared assumptions");
  if ((v.severityState === "ASSESSED") !== (v.severity !== null)) fail("Missing severity is NOT_ASSESSABLE, not low");
  if (v.severity !== null && (v.impact === null || v.likelihood === null || v.severityPolicy === null || gap || !["SUPPORTED", "CONDITIONAL"].includes(v.state))) fail("Severity requires supported impact, likelihood and approved policy, not a data gap");
  if (v.impact && v.likelihood && v.impact.event !== v.likelihood.event) fail("Impact and likelihood must assess the same event");
  if (v.impact && canonicalize(v.impact.scope) !== canonicalize(v.scope)) fail("Impact must belong to the finding's exact subject/site/scenario/period");
  if (v.impact && v.likelihood && (v.impact.scope.period.start !== v.likelihood.horizon.start || v.impact.scope.period.end !== v.likelihood.horizon.end || v.impact.scope.period.timeZone !== v.likelihood.horizon.timeZone)) fail("Impact and likelihood must share an assessment horizon");
  if (gap && (v.impact !== null || v.likelihood !== null || v.severity !== null)) fail("Evidence limitations are not adverse-event assessments");
  if (v.kind === "CROSS_ENGINE_CONFLICT" && v.claimIds.length < 2) fail("Conflict needs two identified claims");
});

export function checkRiskComparability(left: unknown, right: unknown) {
  const schema = z.object({ scope: riskScopeSchema, basis: riskBasisSchema }).strict();
  const a = schema.parse(left); const b = schema.parse(right);
  const reasons: string[] = [];
  for (const key of ["subject", "siteId", "geography", "sector", "period", "scenarioId"] as const) {
    if (canonicalize(a.scope[key]) !== canonicalize(b.scope[key])) reasons.push(`SCOPE_${key.toUpperCase()}_MISMATCH`);
  }
  for (const key of ["unit", "currency", "priceBasis", "cashFlowBasis", "timingBasis", "cohort", "methodology"] as const) {
    if (canonicalize(a.basis[key]) !== canonicalize(b.basis[key])) reasons.push(`BASIS_${key.toUpperCase()}_MISMATCH`);
  }
  return { state: reasons.length ? "NOT_COMPARABLE" as const : "COMPATIBLE" as const, reasons };
}
