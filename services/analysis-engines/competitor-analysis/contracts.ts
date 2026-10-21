import { z } from "zod";
import { canonicalize } from "../shared/canonical";
import { attributionEntrySchema, computeRequestHash, dataAvailabilitySchema, determinismSchema, engineIdentityShape, engineMetricSchema, findEnvelopeViolations, limitsShape, rightsSchema, timingSchema } from "../shared/contracts";
import { combineGapCatalogs, gapSchema, sharedGapCatalog, defineGapCatalog } from "../shared/gaps";
import { identifierSchema } from "../shared/primitives";
import { COMPETITOR_REQUEST_CONTRACT, COMPETITOR_RESULT_CONTRACT, COMPETITOR_VERSION, activeAt, competitorEvidenceSchema, competitorTimestampSchema, countingUnits, ensureSize, measurementMethodFor, normalizeCompetitorEvidence, recordReference, refKey, scopeSchema, sortedText, sourceRecordRefSchema } from "./model";
import { calculateCompetitorConfidence, competitorConfidencePolicy } from "./confidence";
import { classifyCompetitorLocations, competitorMatchSchema } from "./matching";
import { assessCompetitorCount, competitorCoverageSchema } from "./counts";
import { EngineError } from "../shared/errors";
import { competitorRequestSchema, normalizeCompetitorRequest } from "./request";

const ownGaps = defineGapCatalog({
  COMPETITOR_IDENTITY_UNRESOLVED: {
    severity: "BLOCKING",
    message: { ar: "هوية الكيان أو الموقع غير مثبتة؛ العدد غير معروف.", en: "Entity or location identity is not established; the count is unknown." },
    remedy: { ar: "وفر دليل هوية صريحًا، دون دمج تخميني.", en: "Supply explicit identity evidence without speculative merging." },
  },
  COMPETITOR_MATCH_UNKNOWN: {
    severity: "BLOCKING",
    message: { ar: "لا يوجد دليل مطابقة كافٍ؛ التصنيف غير معروف.", en: "Matching evidence is insufficient; classification is unknown." },
    remedy: { ar: "وفر قاعدة موثقة للنشاط والبدائل مع مصدرها.", en: "Supply a documented activity/substitution rule and its source." },
  },
  COMPETITOR_COVERAGE_INCOMPLETE: {
    severity: "WARNING",
    message: { ar: "التغطية غير مكتملة؛ المشاهدات ليست إجمالي السوق.", en: "Coverage is incomplete; observations are not the market total." },
    remedy: { ar: "وفر حصرًا موثقًا ومكتملًا للنطاق والفترة.", en: "Supply a documented complete inventory for the scope and time." },
  },
});
export const competitorGapCatalog = combineGapCatalogs(sharedGapCatalog, ownGaps);
export const competitorMetricSchema = engineMetricSchema.safeExtend({
  contract: z.literal("jenan.competitor-analysis.metric/v1"),
  evidenceClass: z.enum(["OBSERVED", "DERIVED", "CONTEXTUAL"]),
  countingUnit: z.enum(countingUnits).nullable(),
  countBasis: z.enum(["SCOPED_TOTAL", "OBSERVED_SUBSET"]).nullable(),
  scope: scopeSchema,
  coverageStatus: z.enum(["COMPLETE", "PARTIAL", "NONE", "UNKNOWN"]),
  entityRefs: z.array(identifierSchema).max(2_000), locationRefs: z.array(identifierSchema).max(2_000),
  sourceRecordRefs: z.array(sourceRecordRefSchema).max(2_000),
  trace: z.object({
    method: z.object({ id: identifierSchema, version: identifierSchema }).strict(),
    requiredInputIds: z.array(identifierSchema).min(1).max(32),
  }).strict(),
}).superRefine((metric, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  if ((metric.countingUnit === null) !== (metric.countBasis === null)) fail("Counting unit and basis must be declared together");
  if (metric.status === "ESTIMATED" || metric.interpretation === "ESTIMATE") fail("No estimates in Competitor v1");
  if (metric.countingUnit !== null) {
    if (metric.evidenceClass !== "DERIVED") fail("Distinct counts are deterministic derived quantities, not original observations or estimates");
    if (metric.valueKind !== "QUANTITY" || metric.semantics?.unit.dimension !== "ENTITIES"
      || metric.semantics.unit.entity !== metric.countingUnit || metric.semantics.unit.per !== null) fail("Counts require explicit entity-versus-location quantity units");
    if (metric.value !== null && metric.coverageStatus !== "COMPLETE" && metric.status !== "PARTIAL") fail("Incomplete coverage cannot establish an exact total");
    if (metric.value === 0 && metric.coverageStatus !== "COMPLETE") fail("No zero from incomplete coverage");
    if (metric.value !== null && metric.platformState !== "COMPUTED") fail("A computed count does not certify verified real-world competitors");
  }
  if (canonicalize(metric.inputRefs) !== canonicalize(metric.trace.requiredInputIds)) fail("Calculation trace must retain every necessary input");
  if (metric.value !== null && !metric.sourceRecordRefs.length) fail("A value requires source record evidence");
  if (metric.evidenceClass === "OBSERVED" && metric.interpretation !== "SOURCE_OBSERVATION"
    || metric.evidenceClass === "DERIVED" && metric.interpretation !== "DERIVED_QUANTITY") fail("Evidence class must agree with quantity semantics");
  if (metric.coverageStatus !== "COMPLETE" && metric.confidence && !["LOW", "INSUFFICIENT"].includes(metric.confidence.band)) fail("Subset confidence is capped at LOW");
  for (const refs of [metric.entityRefs, metric.locationRefs]) if (canonicalize(refs) !== canonicalize(sortedText(refs))) fail("Identity references must be sorted and unique");
});
export const competitorResultSchema = z.object({
  contract: z.literal(COMPETITOR_RESULT_CONTRACT),
  runId: identifierSchema, evaluatedAt: competitorTimestampSchema,
  engine: z.object({ ...engineIdentityShape, key: z.literal("competitor-analysis"), version: z.literal(COMPETITOR_VERSION) }).strict(),
  request: z.object({ normalized: competitorRequestSchema, evaluatedAt: competitorTimestampSchema }).strict(),
  inputs: competitorEvidenceSchema.shape.inputs,
  evidence: competitorEvidenceSchema,
  coverage: competitorCoverageSchema.nullable(),
  matches: z.array(competitorMatchSchema).max(2_000),
  results: z.array(z.object({ key: identifierSchema, metrics: z.array(competitorMetricSchema).max(500) }).strict()).max(7),
  dataAvailability: z.array(dataAvailabilitySchema).max(6),
  status: z.enum(["COMPLETED", "COMPLETED_WITH_GAPS", "FAILED"]),
  gaps: z.array(gapSchema).max(2_000),
  attribution: z.array(attributionEntrySchema).max(32), rights: rightsSchema,
  determinism: determinismSchema, limits: z.object(limitsShape).strict(), timing: timingSchema,
}).strict();
export type CompetitorResult = z.infer<typeof competitorResultSchema>;

export function findCompetitorResultProblems(raw: unknown): string[] {
  ensureSize(raw);
  const parsed = competitorResultSchema.safeParse(raw);
  if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  const result = parsed.data; const problems = findEnvelopeViolations(result, { catalog: competitorGapCatalog }).map((issue) => `${issue.code}: ${issue.detail}`);
  const normalized = normalizeCompetitorRequest(result.request.normalized, result.evaluatedAt).normalized;
  if (canonicalize(normalized) !== canonicalize(result.request.normalized) || result.request.evaluatedAt !== result.evaluatedAt) problems.push("Request/evaluation time is not normalized");
  if (normalizeCompetitorRequest(normalized, result.evaluatedAt).requestHash !== computeRequestHash(result.request)) problems.push("Request hash must include the explicit evaluation instant");
  const evidence = normalizeCompetitorEvidence(result.evidence);
  if (canonicalize(evidence) !== canonicalize(result.evidence)) problems.push("Evidence is not normalized");
  if (canonicalize(result.inputs) !== canonicalize(evidence.inputs)) problems.push("Input descriptors disagree with evidence");
  if (result.engine.contracts.request !== COMPETITOR_REQUEST_CONTRACT || result.engine.contracts.result !== COMPETITOR_RESULT_CONTRACT
    || canonicalize(result.engine.policies) !== canonicalize([competitorConfidencePolicy])) problems.push("Contract/policy declaration differs from the independent Competitor policy");
  const metrics = result.results.flatMap((section) => section.metrics);
  if (metrics.length && !normalized.analyses.includes("COUNTS")) problems.push("Count metrics were not requested");
  if (normalized.analyses.includes("COUNTS")) for (const unit of normalized.countingUnits) {
    if (metrics.filter((metric) => metric.countingUnit === unit && metric.countBasis === "SCOPED_TOTAL").length !== 1) problems.push("Every requested counting unit needs exactly one explicit scoped-total slot");
  }
  if (new Set(metrics.map((metric) => `${metric.countingUnit}:${metric.countBasis}`)).size !== metrics.length) problems.push("Repeated counting-unit/basis outcomes are invalid");
  if (metrics.length > 500) problems.push("At most 500 metrics across the complete envelope");
  if (new Set(result.results.map((section) => section.key)).size !== result.results.length
    || canonicalize(result.results.map((section) => section.key)) !== canonicalize(sortedText(result.results.map((section) => section.key)))) problems.push("Result sections must be unique and sorted");
  const expectedMatches = classifyCompetitorLocations(evidence, normalized.scope, result.evaluatedAt);
  if (canonicalize(expectedMatches) !== canonicalize(result.matches)) problems.push("Matching decisions differ from the exact evidence/rules/scope");
  const outcomes = new Map(normalized.countingUnits.map((unit) => [unit, assessCompetitorCount(evidence, normalized, result.coverage, unit, result.evaluatedAt)]));
  const entities = new Set(evidence.entities.map((row) => row.competitorEntityId)); const locations = new Set(evidence.locations.map((row) => row.locationId));
  const records = new Set(evidence.sourceRecords.map(refKey));
  for (const metric of metrics) {
    if (metric.entityRefs.some((id) => !entities.has(id)) || metric.locationRefs.some((id) => !locations.has(id))
      || metric.sourceRecordRefs.some((ref) => !records.has(refKey(ref)))) problems.push("Metric evidence identity reference is unresolved");
    if (metric.sourceRecordRefs.some((ref) => !metric.inputRefs.includes(ref.inputId))) problems.push("Metric record provenance omits a required source input");
    if (canonicalize(metric.scope) !== canonicalize(normalized.scope)
      || metric.semantics && canonicalize(metric.semantics.dimensions.geography) !== canonicalize(normalized.scope.geography)) problems.push("Metric scope differs from the request");
    if (metric.semantics && (canonicalize(metric.semantics.dimensions.sector) !== canonicalize({
      taxonomy: normalized.scope.activity.taxonomy, code: normalized.scope.activity.id, version: normalized.scope.activity.version,
    }) || metric.semantics.time.kind !== "SNAPSHOT" || metric.semantics.time.date !== normalized.scope.asOf.slice(0, 10)
      || canonicalize(metric.semantics.dimensions.methodology) !== canonicalize(metric.trace.method)
      || result.coverage && canonicalize(metric.semantics.dimensions.universe) !== canonicalize(result.coverage.inventoryDefinition))) problems.push("Count time/classification/method/universe semantics disagree with the exact scope and inventory");
    if (metric.countingUnit !== null && metric.semantics?.measuredSubject !== metric.countingUnit) problems.push("Count measured subject differs from its explicit counting unit");
    if (metric.countingUnit && !normalized.countingUnits.includes(metric.countingUnit)) problems.push("Metric uses an unrequested counting unit");
    if (!metric.countingUnit || metric.trace.method.id !== "competitor-count-semantics" || metric.trace.method.version !== "1") {
      problems.push("M1 validates count semantics only; full analytics methods are not implemented");
      continue;
    }
    const outcome = outcomes.get(metric.countingUnit);
    if (!outcome) continue;
    const subset = metric.countBasis === "OBSERVED_SUBSET";
    const expectedValue = subset ? outcome.status === "COMPUTED" ? outcome.value : outcome.observedSubset : outcome.value;
    const expectedStatus = subset && outcome.status === "PARTIAL" ? "PARTIAL" : outcome.status === "PARTIAL" ? "NOT_AVAILABLE" : outcome.status;
    if (metric.value !== expectedValue || metric.status !== expectedStatus || metric.coverageStatus !== outcome.coverageStatus) problems.push("Count value/status/coverage differs from the deterministic semantic guard");
    if (metric.value !== null) {
      const memberIds = metric.countingUnit === "UNIQUE_COMPETITOR_ENTITIES" ? metric.entityRefs : metric.locationRefs;
      if (canonicalize(memberIds) !== canonicalize(outcome.memberIds)) problems.push("Count members disagree with the evidenced identities");
      const expectedConfidence = calculateCompetitorConfidence(evidence.inputs.map((input) => ({
        input, analysisUsage: evidence.permissions.find((permission) => permission.inputId === input.id && activeAt(permission.validity, result.evaluatedAt))?.analysisUsage ?? "NOT_VERIFIED",
        identity: "RESOLVED", match: "SUPPORTED", coverage: outcome.status === "PARTIAL" ? "PARTIAL" : "COMPLETE",
        method: measurementMethodFor(evidence.sourceRecords.filter((record) => record.inputId === input.id)),
        provenance: "DOCUMENTED", upstreamConfidence: null,
      })), result.evaluatedAt).confidence;
      if (canonicalize(metric.confidence) !== canonicalize(expectedConfidence)) problems.push("Count confidence differs from the independent weakest-input policy");
      if (canonicalize(metric.inputRefs) !== canonicalize(evidence.inputs.map((input) => input.id))) problems.push("Count trace omits necessary inventory or matching evidence");
      if (canonicalize(metric.sourceRecordRefs) !== canonicalize(evidence.sourceRecords.map(recordReference))) problems.push("Count trace must preserve the complete bounded source-record inventory");
    }
    if ((metric.value === null || metric.status === "PARTIAL") && !result.gaps.some((gap) => gap.subject === metric.key)) problems.push("Missing/partial count needs an explicit subject gap");
  }
  return problems;
}
export function assertCompetitorResult(raw: unknown): asserts raw is CompetitorResult {
  const problems = findCompetitorResultProblems(raw);
  if (problems.length) throw new EngineError("CONTRACT_VIOLATION", { first: problems[0]!, count: problems.length });
}
