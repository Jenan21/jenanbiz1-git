import { Prisma } from "@/generated/prisma/client";
import { db, type DbExecutor } from "@/lib/db";
import { DataCenterError, type DataCenterActor } from "@/services/data-center/contracts";
import { readHistoricalDataCenterVersionContent } from "@/services/data-center/historical-version";
import { mapReferenceSchema } from "@/services/data-center/map-contract";
import { isDataCenterAdmin, requireDataCenterPrincipal } from "@/services/data-center/policy";
import { z } from "zod";
import { canonicalHash, canonicalize, omitKeys, sha256Hex } from "../../shared/canonical";
import { ENGINE_RUN_RECORD_CONTRACT, runRecordSchema } from "../../shared/run-record";
import { normalizeRiskRequest, riskBounds } from "../request";
import { parseRiskReadPolicy, readRiskPointer, riskNativeCoordinatesMatch, riskReadCompatibility, type RiskReadPolicy } from "../read-policy";
import { ensureRiskJsonSize, inspectRetainedRiskEnvelope, type RiskRunPin } from "../snapshots";
import { interpretRiskPreparation, riskPreparationSchema, type RiskPreparation } from "../interpretation";

const accessSchema = z.object({
  specialty: z.string().trim().min(1).max(80).optional(), missionContext: z.string().trim().min(1).max(80).optional(),
  organizationId: z.string().min(1).max(128).optional(),
}).strict();
type Access = z.infer<typeof accessSchema>;
type Executor = DbExecutor;
type ReadStatus = "AVAILABLE" | "UNAVAILABLE" | "NOT_SUPPORTED" | "INCOMPATIBLE" | "TAMPERED";
type Selection = { id: string; pointer: string; native: unknown; method: unknown };
type Outcome = { runId: string; status: ReadStatus; evidence: null | { pin: RiskRunPin; selections: Selection[]; lineage: unknown[] } };
const same = (left: unknown, right: unknown) => canonicalize(left) === canonicalize(right);

async function exactSource(sourceId: string, versionId: string, checksum: string, actor: DataCenterActor, access: Access, executor: Executor) {
  try {
    return { status: "AVAILABLE" as const, value: await readHistoricalDataCenterVersionContent({
      sourceId, versionId, expectedChecksum: checksum, ...access,
    }, actor, executor) };
  } catch (error) {
    if (error instanceof DataCenterError && error.code === "HISTORICAL_VERSION_NOT_AVAILABLE") return { status: "UNAVAILABLE" as const };
    if (error instanceof DataCenterError && error.code === "HISTORICAL_VERSION_INTEGRITY_MISMATCH") return { status: "TAMPERED" as const };
    throw error;
  }
}
async function readOne(pin: RiskRunPin, binding: RiskReadPolicy["runs"][number], scope: RiskReadPolicy["scope"],
  actor: DataCenterActor, access: Access, executor: Executor, charge: (bytes: number) => void): Promise<Outcome> {
  const finish = (status: ReadStatus): Outcome => ({ runId: pin.runId, status, evidence: null });
  const row = await executor.analysisEngineRun.findFirst({
    where: { runId: pin.runId, engineKey: pin.engineKey,
      ...(isDataCenterAdmin(actor) ? {} : { actorKind: actor.kind === "HUMAN" ? "USER" : "ROBOT", actorId: actor.id }) },
    include: { inputs: { orderBy: { inputId: "asc" } } },
  });
  if (!row) return finish("UNAVAILABLE");
  // Authorize every retained DC source before examining hashes, compatibility or unsupported lineage.
  const sources = new Map<string, Awaited<ReturnType<typeof exactSource>>>();
  for (const input of row.inputs) {
    if (input.kind !== "DATA_CENTER_VERSION") continue;
    if (!input.dataCenterSourceId || !input.dataCenterVersionId || !input.checksum) return finish("UNAVAILABLE");
    const read = await exactSource(input.dataCenterSourceId, input.dataCenterVersionId, input.checksum, actor, access, executor);
    if (read.status === "UNAVAILABLE") return finish("UNAVAILABLE");
    sources.set(input.inputId, read);
  }
  if ([...sources.values()].some((read) => read.status === "TAMPERED")) return finish("TAMPERED");
  // No historical Map proof capability exists here; never substitute current Map content.
  if (row.inputs.some((input) => input.kind !== "DATA_CENTER_VERSION") || row.inputs.length === 0 || row.inputs.length > riskBounds.lineage) return finish("NOT_SUPPORTED");
  let record;
  try {
    const raw = {
      contract: ENGINE_RUN_RECORD_CONTRACT, runId: row.runId, engineKey: row.engineKey, engineVersion: row.engineVersion,
      requestContract: row.requestContract, resultContract: row.resultContract, environment: row.environment,
      status: row.status, requestHash: row.requestHash, inputsHash: row.inputsHash, outputHash: row.outputHash,
      request: row.request, result: row.result, errorCode: row.errorCode, confidence: row.confidence, gaps: row.gaps,
      actor: { kind: row.actorKind, id: row.actorId }, subject: row.subject,
      timing: { startedAt: row.startedAt.toISOString(), finishedAt: row.finishedAt.toISOString(), durationMs: row.durationMs },
      cost: { costUnits: row.costUnits, budgetUnits: row.budgetUnits }, runtime: row.runtime, createdAt: row.createdAt.toISOString(),
      inputs: row.inputs.map((input) => ({
        inputId: input.inputId, roles: input.roles, kind: input.kind, governance: input.governance, completeness: input.completeness,
        refSystem: input.refSystem, refId: input.refId, refVersion: input.refVersion, checksum: input.checksum, snapshot: input.snapshot,
      })),
    };
    ensureRiskJsonSize(raw);
    record = runRecordSchema.parse(raw); inspectRetainedRiskEnvelope(record, pin);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof RangeError) return finish("TAMPERED");
    throw error;
  }
  charge(Buffer.byteLength(canonicalize(record), "utf8"));
  for (const input of row.inputs) {
    const source = sources.get(input.inputId);
    if (!source || source.status !== "AVAILABLE") return finish("UNAVAILABLE");
    const current = source.value;
    if (current.upstreamVersionIds.some((id) => !row.inputs.some((retained) => retained.refId === id))) return finish("NOT_SUPPORTED");
    const provenance = z.looseObject({ reference: mapReferenceSchema.optional(),
      sources: z.array(z.looseObject({ reference: mapReferenceSchema })).max(32).optional(),
    }).safeParse(input.provenance);
    if (!provenance.success) return finish("TAMPERED");
    const references = provenance.data.reference ? [provenance.data.reference] : provenance.data.sources?.map((entry) => entry.reference) ?? [];
    if (!references.length) return finish("NOT_SUPPORTED");
    for (const reference of references) {
      if (reference.source.sourceId !== current.sourceId || reference.dataset.itemId !== current.itemId ||
        reference.dataset.typeKey !== current.typeKey || reference.version.versionId !== input.refId ||
        reference.version.number !== input.refVersion || reference.version.checksum.value !== input.checksum ||
        input.dataCenterVersionId !== input.refId || input.dataCenterTypeKey !== current.typeKey ||
        !same(reference.version.upstreamVersionIds.slice().sort(), current.upstreamVersionIds.slice().sort())) return finish("TAMPERED");
      if (!same(reference.rights, { ...current.rights, attribution: { ...current.rights.attribution, level: reference.rights.attribution.level } }) ||
        reference.ownership.ownership !== current.ownership || reference.ownership.owner !== current.owner) return finish("UNAVAILABLE");
    }
    const descriptor = record.inputs.find((entry) => entry.inputId === input.inputId)!.snapshot;
    if (descriptor.license !== current.rights.license || descriptor.licenseClass !== current.rights.licenseClass ||
      descriptor.usagePolicy !== current.rights.usagePolicy || descriptor.ownership !== current.ownership ||
      descriptor.evidenceStatus !== current.evidenceStatus || descriptor.allowExport !== current.rights.allowExport ||
      !same(descriptor.attribution, current.rights.attribution)) return finish("UNAVAILABLE");
    const contentHash = ["spatial", "market-demand", "competitor-analysis"].includes(pin.engineKey) ? current.checksum : sha256Hex(current.content);
    if (input.contentHash !== contentHash) return finish("TAMPERED");
  }
  if (!riskReadCompatibility(record, binding, scope)) return finish("INCOMPATIBLE");
  if (binding.selections.length === 0) return finish("NOT_SUPPORTED");
  const selections: Selection[] = [];
  for (const selection of binding.selections) {
    const native = readRiskPointer(record.result, selection.pointer); const method = readRiskPointer(record.result, selection.method.pointer);
    if (!native.found || canonicalHash(native.value) !== selection.expectedHash || !method.found ||
      !same(method.value, selection.method.expected)) return finish("INCOMPATIBLE");
    const metric = z.looseObject({ key: z.string(), inputRefs: z.array(z.string()).optional(),
      evidence: z.array(z.looseObject({ inputId: z.string(), checksum: z.string(), versionId: z.string().optional(), refId: z.string().optional() })).optional(),
    }).safeParse(native.value);
    if (!metric.success || metric.data.key !== selection.nativeKey ||
      metric.data.inputRefs?.some((id) => !record.inputs.some((input) => input.inputId === id)) ||
      metric.data.evidence?.some((ref) => !record.inputs.some((input) => input.inputId === ref.inputId &&
        input.checksum === ref.checksum && (ref.versionId === undefined || ref.versionId === input.refId) &&
        (ref.refId === undefined || ref.refId === input.refId)))) return finish("TAMPERED");
    if (!riskNativeCoordinatesMatch(metric.data, selection)) return finish("INCOMPATIBLE");
    selections.push({ id: selection.id, pointer: selection.pointer, native: native.value, method: method.value });
  }
  return { runId: pin.runId, status: "AVAILABLE", evidence: { pin, selections, lineage: record.inputs.map((input) => input.snapshot) } };
}

/** Internal server integration only. Principal comes from trusted authentication, never from request JSON. */
async function withRiskRetainedOutputs<T>(rawRequest: unknown, evaluatedAt: string, actor: DataCenterActor, rawAccess: Access,
  consume: (preparation: RiskPreparation, policy: RiskReadPolicy | null) => T) {
  requireDataCenterPrincipal(actor);
  const request = normalizeRiskRequest(rawRequest, evaluatedAt); const access = accessSchema.parse(rawAccess);
  return db.$transaction(async (tx) => {
    const finish = (status: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" | "TAMPERED" | "INCOMPATIBLE", outcomes: Outcome[] = [], policy: RiskReadPolicy | null = null) => {
      const core = {
        contract: "jenan.risk-decision.preparation/v1", phase: "M2_EXACT_READS", status,
        decision: null, findings: [], conditionOutcomes: [], automaticAction: false, outcomes,
        declaredMissing: request.normalized.engineSlots.filter((slot) => slot.state === "MISSING").map((slot) => slot.engineKey),
        realDataAcceptance: "BLOCKED / NOT VERIFIED",
        limitations: ["Preparation only; no risk evaluation, upstream recalculation, Risk persistence or replay.",
          "Unprovable historical Map lineage is NOT_SUPPORTED and excluded; missing evidence is not confirmed risk."],
      };
      const result = { ...core, determinism: { requestHash: request.requestHash, inputsHash: canonicalHash(outcomes), outputHash: canonicalHash(core) } };
      ensureRiskJsonSize(result);
      return consume(riskPreparationSchema.parse(result), policy);
    };
    const source = request.normalized.policySource;
    const read = await exactSource(source.sourceId, source.versionId, source.checksum, actor, access, tx);
    if (read.status !== "AVAILABLE") return finish(read.status);
    const policySource = read.value;
    if (policySource.evidenceStatus !== "VERIFIED" || policySource.origin === "AI" ||
      policySource.ownership === "AI_GENERATED" || policySource.upstreamVersionIds.length ||
      policySource.layer !== "DATA" || policySource.rights.licenseClass === null || !policySource.rights.usagePolicy.trim() ||
      policySource.publishedAt > evaluatedAt ||
      (policySource.effectiveFrom !== null && policySource.effectiveFrom > evaluatedAt) ||
      [policySource.expiresAt, policySource.effectiveTo].some((date) => date !== null && date <= evaluatedAt)) return finish("INCOMPATIBLE");
    let policy: RiskReadPolicy;
    try { policy = parseRiskReadPolicy(JSON.parse(policySource.content)); }
    catch (error) {
      if (error instanceof SyntaxError || error instanceof z.ZodError || error instanceof RangeError) return finish("INCOMPATIBLE");
      throw error;
    }
    const pins = request.normalized.engineSlots.flatMap((slot) => slot.state === "PINNED" ? slot.runs : []);
    if (!same(policy.scope, request.normalized.scope) || !same(policy.policy, request.normalized.policy) ||
      policy.runs.length !== pins.length || pins.some((pin) => !policy.runs.some((binding) => same(binding.pin, pin)))) return finish("INCOMPATIBLE");
    const selections = policy.runs.flatMap((binding) => binding.selections.map((selection) => ({ ...selection, runId: binding.pin.runId })));
    if (selections.length !== request.normalized.claims.length || request.normalized.claims.some((claim) =>
      !selections.some((selection) => same(omitKeys(selection, ["expectedHash", "method"]), claim)))) return finish("INCOMPATIBLE");
    const outcomes: Outcome[] = []; let bytes = 0;
    const charge = (size: number) => { bytes += size; if (bytes > riskBounds.nativeBytes) throw new RangeError("Risk exact read aggregate exceeds 8 MiB"); };
    for (const pin of pins) {
      const binding = policy.runs.find((candidate) => candidate.pin.runId === pin.runId)!;
      const outcome = await readOne(pin, binding, policy.scope, actor, access, tx, charge);
      outcomes.push(outcome);
    }
    return finish(outcomes.length > 0 && outcomes.every((outcome) => outcome.status === "AVAILABLE") && request.normalized.engineSlots.every((slot) => slot.state !== "MISSING")
      ? "AVAILABLE" : "PARTIAL", outcomes, policy);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
}

export async function prepareRiskRetainedOutputs(rawRequest: unknown, evaluatedAt: string, actor: DataCenterActor, rawAccess: Access = {}) {
  return withRiskRetainedOutputs(rawRequest, evaluatedAt, actor, rawAccess, (preparation) => preparation);
}

/** Reauthorize on every call and interpret only the policy and selections read inside this transaction. */
export async function interpretRiskRetainedOutputs(rawRequest: unknown, evaluatedAt: string, actor: DataCenterActor, rawAccess: Access = {}) {
  return withRiskRetainedOutputs(rawRequest, evaluatedAt, actor, rawAccess, (preparation, policy) => {
    const rejected = !policy || ["UNAVAILABLE", "TAMPERED", "INCOMPATIBLE"].includes(preparation.status) ||
      preparation.outcomes.some((outcome) => ["UNAVAILABLE", "TAMPERED", "INCOMPATIBLE"].includes(outcome.status));
    const result = !rejected && policy?.interpretation
      ? interpretRiskPreparation(rawRequest, preparation, policy.interpretation, evaluatedAt) : null;
    const core = {
      contract: "jenan.risk-decision.execution/v1", phase: "M3_INTERPRETATION",
      status: rejected ? "REJECTED" : result === null ? "NOT_SUPPORTED" : result.status,
      reason: rejected ? "AUTHORIZATION_INTEGRITY_OR_COMPATIBILITY_REJECTED" : result === null ? "APPROVED_INTERPRETATION_POLICY_REQUIRED" : "GOVERNED_INTERPRETATION",
      decision: result?.decision ?? null, result, automaticAction: false, humanReview: "REQUIRED",
      realDataAcceptance: "BLOCKED / NOT VERIFIED",
    };
    const output = { ...core, outputHash: canonicalHash(core) };
    ensureRiskJsonSize(output);
    return output;
  });
}
