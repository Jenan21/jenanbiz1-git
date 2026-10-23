import { z } from "zod";
import { canonicalHash, canonicalize, compareText, omitKeys } from "../shared/canonical";
import { attributionEntrySchema, deriveAttribution, deriveRights, engineInputSchema, rightsSchema, timingSchema } from "../shared/contracts";
import { identifierSchema, sha256Schema, timestampSchema } from "../shared/primitives";
import { ENGINE_RUN_RECORD_CONTRACT, runRecordSchema, toRunInputRecord, type RunRecordContext } from "../shared/run-record";
import { engineEnvironments } from "../shared/states";
import { normalizeRiskRequest, riskBounds, riskRequestSchema } from "./request";
import {
  riskBasisSchema, riskConfidenceSchema, riskDecimalPolicy, riskDecimalSchema, riskEvidenceSchema, riskScopeSchema, riskTimestampSchema,
} from "./semantics";
import { ensureRiskJsonSize, riskRunPinSchema } from "./snapshots";

export const RISK_VERSION = "1.0.0-m1";
export const riskClaimSchema = z.object({
  id: identifierSchema, runId: identifierSchema, pointer: z.string().min(1).max(500),
  nativeKey: identifierSchema, variant: identifierSchema, entityId: identifierSchema,
  scope: riskScopeSchema, basis: riskBasisSchema,
  nativeStatus: z.enum(["COMPUTED", "PARTIAL", "ESTIMATED", "NOT_AVAILABLE", "NOT_COMPUTABLE", "NOT_SUPPORTED", "NO_COVERAGE", "NOT_FOUND_WITHIN_RADIUS"]),
  interpretation: z.enum(["OBSERVED", "DECLARED_ASSUMPTION", "UPSTREAM_DERIVED", "UNAVAILABLE"]),
  value: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("DECIMAL"), value: riskDecimalSchema, precision: z.enum(["NATIVE_EXACT", "REPORTED_ONLY"]) }).strict(),
    z.object({ kind: z.literal("TEXT"), value: identifierSchema }).strict(),
    z.object({ kind: z.literal("BOOLEAN"), value: z.boolean() }).strict(),
  ]).nullable(),
  evidence: z.array(riskEvidenceSchema).max(128), confidence: riskConfidenceSchema.nullable(),
  limitations: z.array(z.string().min(1).max(500)).min(1).max(20),
}).strict().superRefine((v, ctx) => {
  const valued = ["COMPUTED", "PARTIAL", "ESTIMATED"].includes(v.nativeStatus);
  if (valued !== (v.value !== null) || valued === (v.interpretation === "UNAVAILABLE")) ctx.addIssue({ code: "custom", message: "Native missing state preserves null, never zero" });
  if (!valued && v.confidence !== null) ctx.addIssue({ code: "custom", message: "Unavailable claims carry no confidence" });
  if (valued && !v.evidence.length) ctx.addIssue({ code: "custom", message: "Valued claims retain their exact evidence" });
  if (v.nativeStatus === "ESTIMATED" && v.interpretation === "OBSERVED") ctx.addIssue({ code: "custom", message: "Estimates cannot become observations" });
});
export const riskSnapshotSchema = z.object({
  contract: z.literal("jenan.risk-decision.upstream-snapshot/v1"),
  pin: riskRunPinSchema, projectionVersion: z.literal("risk-native-projection-v1/1.0.0"),
  claims: z.array(riskClaimSchema).max(1000), lineage: z.array(engineInputSchema).max(128),
  rights: rightsSchema, attribution: z.array(attributionEntrySchema).max(200),
  realDataAcceptance: z.literal("BLOCKED / NOT VERIFIED"),
}).strict().superRefine((v, ctx) => {
  if (v.rights.allowExport && !deriveRights(v.lineage).allowExport) ctx.addIssue({ code: "custom", message: "Snapshot export rights cannot exceed original lineage rights" });
  if (v.claims.some((c) => c.runId !== v.pin.runId) || new Set(v.claims.map((c) => c.id)).size !== v.claims.length ||
    new Set(v.lineage.map((i) => i.id)).size !== v.lineage.length) ctx.addIssue({ code: "custom", message: "Snapshot claim/run/lineage identity mismatch" });
  for (const claim of v.claims) {
    const refs = [...claim.evidence, ...(claim.confidence?.evidence ?? [])];
    if (refs.some((ref) => !v.lineage.some((input) => input.id === ref.inputId && input.ref.id === ref.refId && input.checksum?.value === ref.checksum))) ctx.addIssue({ code: "custom", message: "Snapshot evidence must resolve exact lineage/checksum" });
  }
});
export const riskContextSchema = z.object({
  runId: identifierSchema, evaluatedAt: riskTimestampSchema, environment: z.enum(engineEnvironments), timing: timingSchema,
}).strict();
export type RiskContext = z.infer<typeof riskContextSchema>;
export const riskFoundationResultSchema = z.object({
  contract: z.literal("jenan.risk-decision.result/v1"), phase: z.literal("M1_FOUNDATION"),
  engine: z.object({ key: z.literal("risk-decision"), version: z.literal(RISK_VERSION), environment: z.enum(engineEnvironments) }).strict(),
  runId: identifierSchema, evaluatedAt: timestampSchema, timing: timingSchema,
  request: z.object({ normalized: riskRequestSchema, evaluatedAt: timestampSchema }).strict(),
  inputs: z.array(engineInputSchema).max(200), snapshots: z.array(riskSnapshotSchema).max(24),
  currentAuthorization: z.literal("NOT_CHECKED_M1"), sourceValidation: z.literal("DEFERRED_M2"),
  decision: z.null(), humanReview: z.literal("NOT_REQUESTED"), automaticAction: z.literal(false),
  findings: z.array(z.never()).length(0), conditionOutcomes: z.array(z.never()).length(0),
  reasons: z.tuple([z.literal("M1_INTERPRETATION_DEFERRED"), z.literal("M2_AUTHORIZATION_NOT_STARTED")]),
  policies: z.object({
    foundation: z.literal("risk-policy-foundation-v1/1.0.0"), decimal: z.literal("risk-exact-decimal-comparison-v1/1.0.0"),
    confidence: z.literal("EVIDENCE_QUALITY_ONLY_NO_PROBABILITY"),
  }).strict(),
  rights: rightsSchema, attribution: z.array(attributionEntrySchema).max(200),
  status: z.literal("COMPLETED_WITH_GAPS"), realDataAcceptance: z.literal("BLOCKED / NOT VERIFIED"),
  determinism: z.object({ requestHash: sha256Schema, inputsHash: sha256Schema, outputHash: sha256Schema }).strict(),
  limits: z.object({ costUnits: z.number().int().nonnegative().max(20_000), budgetUnits: z.literal(20_000) }).strict(),
}).strict();
export type RiskFoundationResult = z.infer<typeof riskFoundationResultSchema>;
export function buildRiskFoundation(rawRequest: unknown, rawInputs: unknown, rawSnapshots: unknown, rawContext: RiskContext): RiskFoundationResult {
  const context = riskContextSchema.parse(rawContext);
  const request = normalizeRiskRequest(rawRequest, context.evaluatedAt);
  ensureRiskJsonSize(rawInputs); ensureRiskJsonSize(rawSnapshots);
  const inputs = z.array(engineInputSchema).max(200).parse(rawInputs).sort((a, b) => compareText(a.id, b.id));
  const snapshots = z.array(riskSnapshotSchema).max(riskBounds.runs).parse(rawSnapshots).sort((a, b) => compareText(a.pin.runId, b.pin.runId));
  if (new Set(inputs.map((i) => i.id)).size !== inputs.length || new Set(snapshots.map((s) => s.pin.runId)).size !== snapshots.length) throw new RangeError("Duplicate Risk input/snapshot identity");
  const source = request.normalized.policySource;
  const policyInput = inputs.find((i) => i.id === source.inputId);
  if (!policyInput || policyInput.kind !== "DATA_CENTER_VERSION" || policyInput.governance !== "DC_PUBLISHED" ||
    policyInput.ref.id !== source.versionId || policyInput.checksum?.value !== source.checksum || canonicalize(policyInput.roles) !== canonicalize(["risk.decision-policy"])) throw new RangeError("Exact decision-policy descriptor required");
  const pins = request.normalized.engineSlots.flatMap((s) => s.state === "PINNED" ? s.runs : []);
  if (snapshots.length !== pins.length || snapshots.some((s) => !pins.some((p) => canonicalize(p) === canonicalize(s.pin)))) throw new RangeError("Exactly the pinned Risk snapshot set is required");
  const descriptors = inputs.filter((i) => i.kind === "ENGINE_RUN");
  if (descriptors.length !== snapshots.length || inputs.length !== snapshots.length + 1) throw new RangeError("Only decision policy and exact ENGINE_RUN descriptors are accepted");
  for (const snapshot of snapshots) {
    const descriptor = descriptors.find((i) => i.ref.id === snapshot.pin.runId);
    if (!descriptor || descriptor.checksum?.value !== snapshot.pin.outputHash ||
      canonicalize(descriptor.roles) !== canonicalize([`risk.upstream.${snapshot.pin.engineKey}`]) ||
      descriptor.allowExport && (!snapshot.rights.allowExport || !deriveRights(snapshot.lineage).allowExport)) throw new RangeError("ENGINE_RUN descriptor/pin/rights mismatch");
    const claims = request.normalized.claims.filter((c) => c.runId === snapshot.pin.runId);
    if (claims.length !== snapshot.claims.length || snapshot.claims.some((c) => !claims.some((selector) => selector.id === c.id &&
      selector.pointer === c.pointer && selector.nativeKey === c.nativeKey && selector.variant === c.variant && selector.entityId === c.entityId &&
      canonicalize(selector.scope) === canonicalize(c.scope) && canonicalize(selector.basis) === canonicalize(c.basis)))) throw new RangeError("Snapshot differs from exact selected claim scope/basis");
  }
  const lineage = snapshots.flatMap((s) => s.lineage);
  const uniqueLineage = new Map<string, typeof inputs[number]>();
  const lineageIds = new Map<string, string>();
  for (const input of lineage) {
    const identity = canonicalize([input.ref.system, input.ref.id, input.ref.version, input.checksum]);
    const existing = uniqueLineage.get(identity);
    if (existing && canonicalize(existing) !== canonicalize(input)) throw new RangeError("Conflicting retained lineage descriptors");
    if (lineageIds.has(input.id) && lineageIds.get(input.id) !== identity) throw new RangeError("Lineage input ID resolves to multiple native identities");
    lineageIds.set(input.id, identity);
    uniqueLineage.set(identity, input);
  }
  if (uniqueLineage.size > riskBounds.lineage) throw new RangeError("Risk transitive lineage bound exceeded");
  const allEvidence = [
    ...request.normalized.policy.approval.evidence,
    ...request.normalized.engineSlots.flatMap((s) => s.state === "NOT_APPLICABLE" ? s.approval.evidence : []),
    ...request.normalized.scenarios.flatMap((s) => s.approval.evidence),
    ...request.normalized.policy.conditions.flatMap((c) => c.applicability.state === "NOT_APPLICABLE" ? c.applicability.approval.evidence : []),
    ...request.normalized.policy.dependencyEdges.flatMap((e) => e.evidence),
    ...(request.normalized.policy.severityMatrix?.approval.evidence ?? []),
  ];
  const evidenceInputs = [...inputs, ...lineage];
  if (allEvidence.some((ref) => !evidenceInputs.some((i) => i.id === ref.inputId && i.ref.id === ref.refId && i.checksum?.value === ref.checksum))) throw new RangeError("Policy approval/dependency evidence does not resolve exact retained inputs");
  const core = {
    contract: "jenan.risk-decision.result/v1" as const, phase: "M1_FOUNDATION" as const,
    engine: { key: "risk-decision" as const, version: RISK_VERSION, environment: context.environment },
    runId: context.runId, evaluatedAt: context.evaluatedAt, timing: context.timing,
    request: { normalized: request.normalized, evaluatedAt: context.evaluatedAt }, inputs, snapshots,
    currentAuthorization: "NOT_CHECKED_M1" as const, sourceValidation: "DEFERRED_M2" as const,
    decision: null, humanReview: "NOT_REQUESTED" as const, automaticAction: false as const,
    findings: [], conditionOutcomes: [], reasons: ["M1_INTERPRETATION_DEFERRED", "M2_AUTHORIZATION_NOT_STARTED"],
    policies: { foundation: "risk-policy-foundation-v1/1.0.0", decimal: `${riskDecimalPolicy.id}/${riskDecimalPolicy.version}`, confidence: "EVIDENCE_QUALITY_ONLY_NO_PROBABILITY" },
    rights: deriveRights(inputs), attribution: deriveAttribution([...inputs, ...uniqueLineage.values()]),
    status: "COMPLETED_WITH_GAPS" as const, realDataAcceptance: "BLOCKED / NOT VERIFIED" as const,
    limits: { costUnits: request.workUnits + lineage.length + snapshots.reduce((n, s) => n + s.claims.length, 0), budgetUnits: 20_000 as const },
  };
  const result = riskFoundationResultSchema.parse({
    ...core, determinism: {
      requestHash: request.requestHash, inputsHash: canonicalHash({ inputs, snapshots }),
      outputHash: canonicalHash(omitKeys(core, ["runId", "timing"])),
    },
  });
  ensureRiskJsonSize(result); return result;
}
export function validateRiskFoundation(raw: unknown) {
  ensureRiskJsonSize(raw);
  const result = riskFoundationResultSchema.parse(raw);
  const expected = buildRiskFoundation(result.request.normalized, result.inputs, result.snapshots, {
    runId: result.runId, evaluatedAt: result.evaluatedAt, environment: result.engine.environment, timing: result.timing,
  });
  if (canonicalize(expected) !== canonicalize(result)) throw new RangeError("Risk foundation semantics/hash mismatch");
  return expected;
}
export function buildRiskFoundationRecord(rawResult: unknown, context: RunRecordContext) {
  const result = validateRiskFoundation(rawResult);
  if (timestampSchema.parse(context.createdAt) < result.evaluatedAt) throw new RangeError("Risk history cannot predate evaluation");
  const record = runRecordSchema.parse({
    contract: ENGINE_RUN_RECORD_CONTRACT, runId: result.runId, engineKey: result.engine.key, engineVersion: result.engine.version,
    requestContract: "jenan.risk-decision.request/v1", resultContract: result.contract, environment: result.engine.environment,
    status: result.status, ...result.determinism, request: result.request, result, errorCode: null,
    confidence: null, gaps: { BLOCKING: result.reasons.length, WARNING: 0, INFO: 0 },
    actor: context.actor, subject: context.subject ?? null, timing: result.timing, cost: result.limits,
    runtime: { contract: "jenan.risk-decision.run-history/v1", phase: "M1_STORAGE_COMPATIBILITY_ONLY", policies: result.policies },
    createdAt: context.createdAt, inputs: result.inputs.map(toRunInputRecord),
  });
  ensureRiskJsonSize(record);
  ensureRiskJsonSize({ record, inputHistory: result.snapshots });
  return record;
}
