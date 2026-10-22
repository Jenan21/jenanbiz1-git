import { z } from "zod";
import { canonicalize, compareText } from "../shared/canonical";
import {
  attributionEntrySchema, computeDeterminism, dataAvailabilitySchema, deriveAttribution, deriveInputGaps, deriveRights, deriveRunStatus,
  determinismSchema, engineIdentityShape, engineMetricSchema, findEnvelopeViolations, rightsSchema, timingSchema,
} from "../shared/contracts";
import { combineGapCatalogs, createGap, gapSchema, normalizeGaps, sharedGapCatalog } from "../shared/gaps";
import { bilingualSchema, identifierSchema } from "../shared/primitives";
import { engineEnvironments } from "../shared/states";
import { opportunityConfidencePolicy } from "./confidence";
import {
  findingKinds, isSortedUnique, methodSchema, OPPORTUNITY_REQUEST_CONTRACT, OPPORTUNITY_RESULT_CONTRACT, OPPORTUNITY_VERSION,
  opportunityEvidenceSchema, opportunityInputSchema, opportunityStates, scopeSchema, signalStates, sourceRecordSchema,
  textListSchema, timestamp, versionRefSchema,
} from "./model";
import { ensureOpportunitySize, normalizeOpportunityEvidence, normalizeOpportunityRequest, opportunityRequestSchema } from "./request";

const label = { ar: "التحليل مؤجل حتى اعتماد مرحلة الحسابات", en: "Analytics deferred until the calculation phase is approved" };
export const opportunityGapCatalog = combineGapCatalogs(sharedGapCatalog, {
  OPPORTUNITY_ANALYTICS_DEFERRED: {
    severity: "BLOCKING", message: label,
    remedy: { ar: "اعتمد ربط البيانات والحسابات في المراحل التالية؛ لا تستنتج فرصة من غياب الحساب.", en: "Approve data integration and calculations in later phases; absent calculations do not establish an opportunity." },
  },
});
export const opportunityMetricSchema = engineMetricSchema.safeExtend({
  contract: z.literal("jenan.opportunity-gap.metric/v1"),
  status: z.enum(opportunityStates), method: z.string().min(1).max(500),
  factRefs: z.array(identifierSchema).max(10_000), evidence: z.array(sourceRecordSchema).max(10_000),
  scope: scopeSchema,
}).superRefine((metric, context) => {
  if (metric.interpretation === "ESTIMATE") context.addIssue({ code: "custom", message: "Estimates are outside initial v1" });
  if (!isSortedUnique(metric.factRefs)) context.addIssue({ code: "custom", message: "Fact references must be sorted and unique" });
});
export const opportunityFindingSchema = z.object({
  contract: z.literal("jenan.opportunity-gap.finding/v1"), id: identifierSchema,
  kind: z.enum(findingKinds), status: z.enum(opportunityStates),
  label: bilingualSchema, scope: scopeSchema,
  metricKeys: z.array(identifierSchema).max(500), factRefs: z.array(identifierSchema).max(10_000),
  inputRefs: z.array(identifierSchema).max(32), evidence: z.array(sourceRecordSchema).max(10_000),
  method: methodSchema, benchmarkPolicy: versionRefSchema.nullable(), rulePolicy: versionRefSchema.nullable(),
  signalState: z.enum(signalStates).nullable(),
  limitations: textListSchema, confidence: z.null(),
  provenance: z.array(sourceRecordSchema).max(10_000), rights: rightsSchema,
}).strict().superRefine((finding, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  if ((finding.kind === "OPPORTUNITY_SIGNAL") !== (finding.signalState !== null)) fail("Only a signal has a signal state");
  if (finding.kind === "BENCHMARK_GAP" && finding.benchmarkPolicy === null) fail("Benchmark gaps require an explicit target policy");
  if (finding.kind === "OPPORTUNITY_SIGNAL" && finding.rulePolicy === null) fail("Signals require an explicit approved rule policy");
  if (finding.kind === "DATA_GAP" && (finding.benchmarkPolicy !== null || finding.rulePolicy !== null || finding.signalState !== null)) fail("Missing data is not a market opportunity");
  if (!finding.limitations.length) fail("Every finding requires explicit limitations");
  for (const refs of [finding.metricKeys, finding.factRefs, finding.inputRefs]) if (!isSortedUnique(refs)) fail("References must be sorted and unique");
});
export const opportunityResultSchema = z.object({
  contract: z.literal(OPPORTUNITY_RESULT_CONTRACT), runId: identifierSchema, evaluatedAt: timestamp,
  engine: z.object({ ...engineIdentityShape, key: z.literal("opportunity-gap"), version: z.literal(OPPORTUNITY_VERSION) }).strict(),
  request: z.object({ normalized: opportunityRequestSchema, evaluatedAt: timestamp }).strict(),
  inputs: z.array(opportunityInputSchema).max(32), evidence: opportunityEvidenceSchema,
  results: z.array(z.object({ key: identifierSchema, metrics: z.array(opportunityMetricSchema).max(500) }).strict()).max(5),
  findings: z.array(opportunityFindingSchema).max(500),
  dataAvailability: z.array(dataAvailabilitySchema).max(6), gaps: z.array(gapSchema).max(1000),
  attribution: z.array(attributionEntrySchema).max(32), rights: rightsSchema,
  status: z.enum(["COMPLETED", "COMPLETED_WITH_GAPS", "FAILED"]),
  determinism: determinismSchema,
  limits: z.object({ costUnits: z.number().int().min(0).max(20_000), budgetUnits: z.literal(20_000) }).strict(),
  timing: timingSchema,
}).strict();
export type OpportunityResult = z.infer<typeof opportunityResultSchema>;
const contextSchema = z.object({
  runId: identifierSchema, evaluatedAt: timestamp, environment: z.enum(engineEnvironments), timing: timingSchema,
}).strict();

/** M1 diagnostic envelope only. It deliberately cannot compute a market gap or evaluate a business signal. */
function assembleFoundationResult(rawRequest: unknown, rawEvidence: unknown, rawContext: z.infer<typeof contextSchema>) {
  const context = contextSchema.parse(rawContext);
  const request = normalizeOpportunityRequest(rawRequest, context.evaluatedAt);
  const evidence = normalizeOpportunityEvidence(rawEvidence);
  const inputIds = evidence.inputs.map((input) => input.id);
  const refs = evidence.facts.flatMap((fact) => fact.evidence);
  const sourceRefs = [...new Map(refs.map((ref) => [canonicalize(ref), ref])).values()].sort((a, b) => compareText(canonicalize(a), canonicalize(b)));
  const rights = deriveRights(evidence.inputs);
  const results = request.normalized.analyses.map((analysis) => ({
    key: analysis,
    metrics: [{
      contract: "jenan.opportunity-gap.metric/v1" as const, key: `readiness.${analysis.toLowerCase()}`, label,
      status: "NOT_COMPUTABLE" as const, platformState: "UNAVAILABLE" as const, valueKind: "BOOLEAN" as const, unit: "none" as const,
      value: null, interpretation: "MAPPED_FEATURES_ONLY" as const, inputRefs: inputIds,
      confidence: null, limitations: [label.en], method: "opportunity-m1-foundation/1",
      factRefs: evidence.facts.map((fact) => fact.id), evidence: sourceRefs, scope: request.normalized.scope,
    }],
  }));
  const findings = results.map((section) => ({
    contract: "jenan.opportunity-gap.finding/v1" as const, id: `deferred:${section.key}`, kind: "DATA_GAP" as const,
    status: "NOT_COMPUTABLE" as const, label, scope: request.normalized.scope,
    metricKeys: section.metrics.map((metric) => metric.key), factRefs: evidence.facts.map((fact) => fact.id),
    inputRefs: inputIds, evidence: sourceRefs,
    method: { id: "opportunity-m1-foundation", version: "1", description: label.en },
    benchmarkPolicy: null, rulePolicy: null, signalState: null, limitations: [label.en], confidence: null,
    provenance: sourceRefs, rights,
  }));
  const gaps = normalizeGaps([...evidence.inputs.flatMap(deriveInputGaps), createGap(opportunityGapCatalog, "OPPORTUNITY_ANALYTICS_DEFERRED")]);
  const roles = [...new Set(request.normalized.data.roles.map((pin) => pin.role))].sort(compareText);
  const envelope = {
    contract: OPPORTUNITY_RESULT_CONTRACT, runId: context.runId, evaluatedAt: context.evaluatedAt, timing: context.timing,
    engine: {
      key: "opportunity-gap", version: OPPORTUNITY_VERSION,
      contracts: { request: OPPORTUNITY_REQUEST_CONTRACT, result: OPPORTUNITY_RESULT_CONTRACT },
      environment: context.environment, policies: [opportunityConfidencePolicy],
    },
    request: { normalized: request.normalized, evaluatedAt: context.evaluatedAt },
    inputs: evidence.inputs, evidence, results, findings,
    dataAvailability: roles.map((role) => {
      const ids = evidence.inputs.filter((input) => input.roles.includes(role)).map((input) => input.id);
      return { role, status: ids.length ? "AVAILABLE" as const : "NOT_AVAILABLE" as const, inputIds: ids };
    }),
    gaps, attribution: deriveAttribution(evidence.inputs), rights,
    status: deriveRunStatus(results.flatMap((section) => section.metrics), gaps),
    limits: { costUnits: evidence.facts.length + evidence.inputs.length + results.length, budgetUnits: 20_000 as const },
  };
  return { ...envelope, determinism: computeDeterminism(envelope) };
}
export function buildOpportunityFoundationResult(rawRequest: unknown, rawEvidence: unknown, rawContext: z.infer<typeof contextSchema>): OpportunityResult {
  const result = assembleFoundationResult(rawRequest, rawEvidence, rawContext);
  const problems = findOpportunityResultProblems(result);
  if (problems.length) throw new Error(`Invalid Opportunity M1 result: ${problems.join("; ")}`);
  return opportunityResultSchema.parse(result);
}

export function findOpportunityResultProblems(raw: unknown): string[] {
  ensureOpportunitySize(raw);
  const parsed = opportunityResultSchema.safeParse(raw);
  if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  const result = parsed.data;
  const problems = findEnvelopeViolations(result, { catalog: opportunityGapCatalog }).map((problem) => `${problem.code}: ${problem.detail}`);
  const normalized = normalizeOpportunityRequest(result.request.normalized, result.evaluatedAt);
  const evidence = normalizeOpportunityEvidence(result.evidence);
  const same = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
  if (!same(result.request, { normalized: normalized.normalized, evaluatedAt: result.evaluatedAt })) problems.push("Request/evaluation instant must be normalized");
  if (!same(result.inputs, evidence.inputs) || !same(result.evidence, evidence)) problems.push("Evidence and input descriptors must be normalized and identical");
  const pins = [...normalized.normalized.data.roles, ...(normalized.normalized.historical?.versions ?? [])];
  for (const input of result.inputs) {
    if (!pins.some((pin) => pin.versionId === input.ref.id && pin.checksum === input.checksum?.value)) problems.push("Input must match an explicitly pinned version/hash");
    for (const role of input.roles) if (!pins.some((pin) => pin.versionId === input.ref.id && pin.role === role)) problems.push("Every retained role must be requested and pinned");
  }
  const metrics = result.results.flatMap((section) => section.metrics);
  if (metrics.length + result.findings.length > 500) problems.push("Combined output bound is 500");
  const expected = assembleFoundationResult(normalized.normalized, evidence, {
    runId: result.runId, evaluatedAt: result.evaluatedAt, environment: result.engine.environment, timing: result.timing,
  });
  if (expected.determinism.outputHash !== result.determinism.outputHash) problems.push("M1 diagnostic fields, policies, scope, lineage, rights and deferred states must be exactly reproducible; rehashing cannot authorize M3 analytics");
  return problems;
}
