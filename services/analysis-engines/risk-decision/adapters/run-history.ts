import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db, type DbExecutor } from "@/lib/db";
import type { DataCenterActor } from "@/services/data-center/contracts";
import { isDataCenterAdmin, requireDataCenterPrincipal } from "@/services/data-center/policy";
import { canonicalHash, canonicalize, sha256Hex } from "../../shared/canonical";
import { engineInputSchema } from "../../shared/contracts";
import { identifierSchema } from "../../shared/primitives";
import { ENGINE_RUN_RECORD_CONTRACT, runRecordSchema, toRunInputRecord, type RunRecord } from "../../shared/run-record";
import {
  RISK_HISTORY_VERSION, RiskHistoryError, riskHistoryAccessSchema, riskHistoryContextSchema, riskHistoryRecordHash,
  riskHistoryRuntimeSchema, validateRiskHistoryRecord, type RiskHistoryContext, type RiskHistoryParent,
} from "../history";
import { interpretRiskPreparation, RISK_INTERPRETATION_VERSION } from "../interpretation";
import { normalizeRiskRequest } from "../request";
import { ensureRiskJsonSize } from "../snapshots";
import { withRiskRetainedOutputs } from "./retained-reads";

type Access = z.infer<typeof riskHistoryAccessSchema>;
type Receipt = NonNullable<Parameters<Parameters<typeof withRiskRetainedOutputs>[4]>[2]>;
type Prepared = Parameters<Parameters<typeof withRiskRetainedOutputs>[4]>[0];
type Policy = NonNullable<Parameters<Parameters<typeof withRiskRetainedOutputs>[4]>[1]>;
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(canonicalize(value));
const same = (left: unknown, right: unknown) => canonicalize(left) === canonicalize(right);

function historyInputs(request: ReturnType<typeof normalizeRiskRequest>["normalized"], preparation: Prepared, source: Receipt, parent: RiskHistoryParent) {
  const common = {
    source: { name: "Jenan PRO governed Risk history", organization: null, url: null },
    ownership: "PLATFORM_OWNED", license: "Internal governed derived evidence", licenseClass: "RESTRICTED",
    usagePolicy: "No export; current authorization required at every read", attribution: { required: false, text: null },
    allowExport: false, completeness: "INVENTORY", evidenceStatus: "DERIVED",
    quality: { status: "UNAVAILABLE" }, freshness: { status: "UNKNOWN", sourcePublishedAt: null, freshnessDays: null, expiresAt: null },
    coverage: null, limitations: ["Exact retained reference only; no upstream execution or substitute evidence."],
  };
  const policy = engineInputSchema.parse({
    ...common, id: request.policySource.inputId, roles: ["risk.decision-policy"],
    kind: "DATA_CENTER_VERSION", governance: "DC_PUBLISHED",
    ref: { system: "DATA_CENTER", id: source.versionId, version: source.number, label: "Exact approved Risk decision policy" },
    checksum: { algorithm: "SHA-256", value: source.checksum }, ownership: source.ownership,
    license: source.rights.license, licenseClass: source.rights.licenseClass, usagePolicy: source.rights.usagePolicy,
    attribution: source.rights.attribution, evidenceStatus: source.evidenceStatus,
  });
  const inputs = [policy, ...request.engineSlots.flatMap((slot) => slot.state === "PINNED" ? slot.runs.map((pin) => engineInputSchema.parse({
    ...common, id: `risk:pin:${canonicalHash(pin.runId)}`, roles: [`risk.upstream.${pin.engineKey}`],
    kind: "ENGINE_RUN", governance: "ENGINE_OUTPUT",
    ref: { system: "ANALYSIS_ENGINE", id: pin.runId, version: null, label: `Exact ${pin.engineKey} retained output` },
    checksum: { algorithm: "SHA-256", value: pin.outputHash },
    limitations: [`Read outcome: ${preparation.outcomes.find((outcome) => outcome.runId === pin.runId)?.status ?? "NOT_SUPPORTED"}. No unproved evidence is retained as a value.`],
  })) : [])];
  if (parent) inputs.push(engineInputSchema.parse({
    ...common, id: "risk:parent", roles: ["risk.reinterpretation-parent"], kind: "ENGINE_RUN", governance: "ENGINE_OUTPUT",
    ref: { system: "ANALYSIS_ENGINE", id: parent.runId, version: null, label: "Original immutable Risk interpretation" },
    checksum: { algorithm: "SHA-256", value: parent.outputHash },
  }));
  if (new Set(inputs.map((input) => input.id)).size !== inputs.length) throw new RiskHistoryError("RISK_HISTORY_MISMATCH");
  return inputs.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function buildRecord(rawRequest: unknown, evaluatedAt: string, preparation: Prepared, policy: Policy, source: Receipt,
  actor: RunRecord["actor"], context: RiskHistoryContext, access: Access, parent: RiskHistoryParent) {
  if (!policy.interpretation || preparation.outcomes.some((outcome) => ["UNAVAILABLE", "TAMPERED", "INCOMPATIBLE"].includes(outcome.status))) {
    throw new RiskHistoryError("RISK_HISTORY_NOT_SUPPORTED");
  }
  const request = normalizeRiskRequest(rawRequest, evaluatedAt);
  const result = interpretRiskPreparation(rawRequest, preparation, policy.interpretation, evaluatedAt);
  if (result.decision === null || result.status === "REJECTED") throw new RiskHistoryError("RISK_HISTORY_NOT_SUPPORTED");
  const inputs = historyInputs(request.normalized, preparation, source, parent);
  const record = runRecordSchema.parse({
    contract: ENGINE_RUN_RECORD_CONTRACT, runId: context.runId, engineKey: "risk-decision", engineVersion: RISK_HISTORY_VERSION,
    requestContract: request.normalized.contract, resultContract: result.contract, environment: context.environment,
    status: "COMPLETED_WITH_GAPS", requestHash: request.requestHash, inputsHash: canonicalHash(inputs),
    outputHash: canonicalHash(result), request: request.normalized, result, errorCode: null, confidence: null,
    gaps: { BLOCKING: result.conditionOutcomes.filter((outcome) => outcome.state !== "SATISFIED" && outcome.state !== "NOT_APPLICABLE").length,
      WARNING: result.projectionGaps.length, INFO: result.findings.length },
    actor, subject: request.normalized.scope.subject,
    timing: context.timing, cost: result.limits, createdAt: context.createdAt,
    runtime: {
      contract: "jenan.risk-decision.history/v1", historyVersion: RISK_HISTORY_VERSION, interpreterVersion: RISK_INTERPRETATION_VERSION,
      decimal: "risk-exact-decimal-comparison-v1/1.0.0", rounding: "NONE_PRESERVE_UPSTREAM",
      confidence: "NATIVE_EVIDENCE_QUALITY_ONLY_NO_COMMON_BAND_OR_PROBABILITY",
      access, evaluatedAt, policyHash: canonicalHash(policy), preparationHash: canonicalHash(preparation), parent, recordHash: "0".repeat(64),
    },
    inputs: inputs.map(toRunInputRecord),
  });
  record.runtime.recordHash = riskHistoryRecordHash(record);
  validateRiskHistoryRecord(record);
  return record;
}
function policyColumns(source: Receipt, request: RunRecord["request"]) {
  return {
    dataCenterVersionId: source.versionId, dataCenterSourceId: source.sourceId, dataCenterTypeKey: source.typeKey,
    contentHash: sha256Hex(source.content), provenance: json({ contract: source.contract, itemId: source.itemId,
      versionId: source.versionId, number: source.number, checksum: source.checksum, upstreamVersionIds: source.upstreamVersionIds,
      ownership: source.ownership, owner: source.owner, rights: source.rights }),
    usageIntent: json({ contract: "jenan.risk-decision.history-policy-use/v1", policySource: request.policySource }),
  };
}
async function insertRecord(record: RunRecord, source: Receipt, executor: DbExecutor) {
  const inputs = record.inputs.map((input) => ({
    ...input, snapshot: json(input.snapshot),
    ...(input.kind === "DATA_CENTER_VERSION" ? policyColumns(source, record.request) : {}),
  }));
  await executor.analysisEngineRun.create({ data: {
    runId: record.runId, engineKey: record.engineKey, engineVersion: record.engineVersion,
    requestContract: record.requestContract, resultContract: record.resultContract, environment: record.environment,
    status: record.status, requestHash: record.requestHash, inputsHash: record.inputsHash, outputHash: record.outputHash,
    request: json(record.request), result: json(record.result), errorCode: null, confidence: Prisma.DbNull, gaps: json(record.gaps),
    actorKind: record.actor.kind, actorId: record.actor.id, subject: record.subject,
    startedAt: new Date(record.timing.startedAt), finishedAt: new Date(record.timing.finishedAt), durationMs: record.timing.durationMs,
    costUnits: record.cost.costUnits, budgetUnits: record.cost.budgetUnits, createdAt: new Date(record.createdAt),
    runtime: json(record.runtime), inputs: { create: inputs },
  } });
}
async function atomic<T>(work: (executor: DbExecutor) => Promise<T>) {
  try {
    return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new RiskHistoryError("RISK_HISTORY_DUPLICATE");
    throw error;
  }
}
export async function persistRiskDecision(rawRequest: unknown, evaluatedAt: string, rawContext: RiskHistoryContext,
  actor: DataCenterActor, rawAccess: Access = {}) {
  requireDataCenterPrincipal(actor);
  const context = riskHistoryContextSchema.parse(rawContext); const access = riskHistoryAccessSchema.parse(rawAccess);
  return atomic((tx) => withRiskRetainedOutputs(rawRequest, evaluatedAt, actor, access, async (preparation, policy, source) => {
    if (!policy || !source) throw new RiskHistoryError("RISK_HISTORY_UNAVAILABLE");
    const record = buildRecord(rawRequest, evaluatedAt, preparation, policy, source,
      { kind: actor.kind === "HUMAN" ? "USER" : "ROBOT", id: actor.id }, context, access, null);
    await insertRecord(record, source, tx); return record;
  }, tx));
}

async function readHistory(runId: string, actor: DataCenterActor, access: Access, executor: DbExecutor) {
  const row = await executor.analysisEngineRun.findFirst({
    where: { runId, engineKey: "risk-decision",
      ...(isDataCenterAdmin(actor) ? {} : { actorKind: actor.kind === "HUMAN" ? "USER" : "ROBOT", actorId: actor.id }) },
    include: { inputs: { orderBy: { inputId: "asc" } } },
  });
  if (!row) throw new RiskHistoryError("RISK_HISTORY_UNAVAILABLE");
  // A parseable exact request is needed to authorize; never disclose stored result/metadata before that authorization.
  const header = z.looseObject({ evaluatedAt: z.string() }).safeParse(row.runtime);
  if (!header.success) throw new RiskHistoryError("RISK_HISTORY_UNAVAILABLE");
  let request;
  try {
    ensureRiskJsonSize(row.request); ensureRiskJsonSize(row.runtime);
    request = normalizeRiskRequest(row.request, header.data.evaluatedAt);
  }
  catch (error) {
    if (error instanceof z.ZodError || error instanceof RangeError) throw new RiskHistoryError("RISK_HISTORY_UNAVAILABLE");
    throw error;
  }
  return withRiskRetainedOutputs(request.normalized, header.data.evaluatedAt, actor, access, (preparation, policy, source) => {
    if (!policy || !source || preparation.outcomes.some((outcome) => outcome.status === "UNAVAILABLE")) throw new RiskHistoryError("RISK_HISTORY_UNAVAILABLE");
    if (preparation.outcomes.some((outcome) => outcome.status === "TAMPERED" || outcome.status === "INCOMPATIBLE")) throw new RiskHistoryError("RISK_HISTORY_MISMATCH");
    const version = riskHistoryRuntimeSchema.pick({ contract: true, historyVersion: true, interpreterVersion: true,
      decimal: true, rounding: true, confidence: true }).loose().safeParse(row.runtime);
    if (!version.success || row.engineVersion !== RISK_HISTORY_VERSION) throw new RiskHistoryError("RISK_HISTORY_NOT_SUPPORTED");
    const runtimeValidation = riskHistoryRuntimeSchema.safeParse(row.runtime);
    if (!runtimeValidation.success) throw new RiskHistoryError("RISK_HISTORY_MISMATCH");
    const runtime = runtimeValidation.data;
    if (!same(runtime.access, access)) throw new RiskHistoryError("RISK_HISTORY_UNAVAILABLE");
    const candidate = {
      contract: ENGINE_RUN_RECORD_CONTRACT, runId: row.runId, engineKey: row.engineKey, engineVersion: row.engineVersion,
      requestContract: row.requestContract, resultContract: row.resultContract, environment: row.environment, status: row.status,
      requestHash: row.requestHash, inputsHash: row.inputsHash, outputHash: row.outputHash, request: row.request,
      result: row.result, errorCode: row.errorCode, confidence: row.confidence, gaps: row.gaps,
      actor: { kind: row.actorKind, id: row.actorId }, subject: row.subject,
      timing: { startedAt: row.startedAt.toISOString(), finishedAt: row.finishedAt.toISOString(), durationMs: row.durationMs },
      cost: { costUnits: row.costUnits, budgetUnits: row.budgetUnits }, runtime: row.runtime, createdAt: row.createdAt.toISOString(),
      inputs: row.inputs.map((input) => ({ inputId: input.inputId, roles: input.roles, kind: input.kind, governance: input.governance,
        completeness: input.completeness, refSystem: input.refSystem, refId: input.refId, refVersion: input.refVersion,
        checksum: input.checksum, snapshot: input.snapshot })),
    };
    const { record } = validateRiskHistoryRecord(candidate);
    if (preparation.outcomes.some((outcome) => outcome.status === "NOT_SUPPORTED") &&
      runtime.preparationHash !== canonicalHash(preparation)) {
      throw new RiskHistoryError("RISK_HISTORY_NOT_SUPPORTED");
    }
    const current = buildRecord(request.normalized, runtime.evaluatedAt, preparation, policy, source,
      record.actor, { runId: record.runId, environment: record.environment,
        timing: record.timing, createdAt: record.createdAt }, access, runtime.parent);
    const columns = policyColumns(source, record.request);
    for (const input of row.inputs) {
      if (input.kind === "DATA_CENTER_VERSION" && Object.entries(columns).some(([key, value]) => !same(input[key as keyof typeof input], value)) ||
        input.kind !== "DATA_CENTER_VERSION" && [input.dataCenterVersionId, input.dataCenterSourceId, input.dataCenterTypeKey,
          input.contentHash, input.provenance, input.usageIntent].some((value) => value !== null)) throw new RiskHistoryError("RISK_HISTORY_MISMATCH");
    }
    if (!same(record, current)) throw new RiskHistoryError("RISK_HISTORY_MISMATCH");
    return { record, runtime };
  }, executor);
}
export async function readRiskDecision(runId: string, actor: DataCenterActor, rawAccess: Access = {}) {
  identifierSchema.parse(runId); requireDataCenterPrincipal(actor);
  const access = riskHistoryAccessSchema.parse(rawAccess);
  return atomic((tx) => readHistory(runId, actor, access, tx));
}

/** Appends a distinct deterministic Risk-only reinterpretation; the original run and every upstream engine stay immutable. */
export async function reinterpretRiskDecision(runId: string, rawContext: RiskHistoryContext, actor: DataCenterActor, rawAccess: Access = {}) {
  identifierSchema.parse(runId); requireDataCenterPrincipal(actor);
  const context = riskHistoryContextSchema.parse(rawContext); const access = riskHistoryAccessSchema.parse(rawAccess);
  if (context.runId === runId) throw new RiskHistoryError("RISK_HISTORY_DUPLICATE");
  return atomic(async (tx) => {
    const { record: original, runtime } = await readHistory(runId, actor, access, tx);
    if (context.createdAt < original.createdAt || context.environment !== original.environment) throw new RiskHistoryError("RISK_HISTORY_MISMATCH");
    return withRiskRetainedOutputs(original.request, runtime.evaluatedAt, actor, access, async (preparation, policy, source) => {
      if (!policy || !source) throw new RiskHistoryError("RISK_HISTORY_UNAVAILABLE");
      const parent = { runId: original.runId, outputHash: original.outputHash!, recordHash: runtime.recordHash };
      const record = buildRecord(original.request, runtime.evaluatedAt, preparation, policy, source,
        { kind: actor.kind === "HUMAN" ? "USER" : "ROBOT", id: actor.id }, context, access, parent);
      await insertRecord(record, source, tx); return record;
    }, tx);
  });
}
