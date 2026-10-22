import { Prisma } from "@/generated/prisma/client";
import { db, type DbExecutor } from "@/lib/db";
import type { DataCenterActor } from "@/services/data-center/contracts";
import { isDataCenterAdmin, requireDataCenterPrincipal } from "@/services/data-center/policy";
import { canonicalize } from "../../shared/canonical";
import { identifierSchema } from "../../shared/primitives";
import { ENGINE_RUN_RECORD_CONTRACT, runRecordSchema, type RunRecord } from "../../shared/run-record";
import { OperationalHistoryMismatch, OperationalHistoryUnavailable, operationalHistoryRuntimeSchema, operationalInputHistory, validateOperationalRunRecord } from "../run-history";
import { authorizeOperationalHistory } from "./historical-data-center";

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(canonicalize(value)) as Prisma.InputJsonValue;
export async function persistOperationalRun(candidate: RunRecord, actor: DataCenterActor): Promise<void> {
  requireDataCenterPrincipal(actor);
  const { record, result, runtime } = await validateOperationalRunRecord(candidate);
  if (record.actor.id !== actor.id || record.actor.kind !== (actor.kind === "HUMAN" ? "USER" : "ROBOT")) throw new OperationalHistoryUnavailable();
  await db.$transaction(async (tx) => {
    await authorizeOperationalHistory(runtime, actor, tx);
    const inputs = record.inputs.map((input) => {
      const history = operationalInputHistory(result, runtime.transcript, input.inputId);
      return {
        inputId: input.inputId, roles: input.roles, kind: input.kind, governance: input.governance,
        completeness: input.completeness, refSystem: input.refSystem, refId: input.refId,
        refVersion: input.refVersion, checksum: input.checksum, snapshot: json(input.snapshot),
        dataCenterVersionId: history.reference.version.versionId, dataCenterSourceId: history.reference.source.sourceId,
        dataCenterTypeKey: history.reference.dataset.typeKey, contentHash: history.contentHash,
        provenance: json(history.provenance), usageIntent: json(history.usageIntent),
      };
    });
    await tx.analysisEngineRun.create({ data: {
      runId: record.runId, engineKey: record.engineKey, engineVersion: record.engineVersion,
      requestContract: record.requestContract, resultContract: record.resultContract,
      environment: record.environment, status: record.status, requestHash: record.requestHash, inputsHash: record.inputsHash, outputHash: record.outputHash,
      request: json(record.request), result: json(record.result), errorCode: record.errorCode,
      confidence: Prisma.DbNull, gaps: json(record.gaps), actorKind: record.actor.kind, actorId: record.actor.id, subject: record.subject,
      startedAt: new Date(record.timing.startedAt), finishedAt: new Date(record.timing.finishedAt), durationMs: record.timing.durationMs,
      costUnits: record.cost.costUnits, budgetUnits: record.cost.budgetUnits, runtime: json(record.runtime),
      createdAt: new Date(record.createdAt), inputs: { create: inputs },
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
}
async function readInTransaction(runId: string, actor: DataCenterActor, executor: DbExecutor) {
  const row = await executor.analysisEngineRun.findFirst({
    where: { runId, engineKey: "operational-feasibility",
      ...(isDataCenterAdmin(actor) ? {} : { actorKind: actor.kind === "HUMAN" ? "USER" : "ROBOT", actorId: actor.id }) },
    include: { inputs: { orderBy: { inputId: "asc" } } },
  });
  if (!row) throw new OperationalHistoryUnavailable();
  // Reauthorize retained source references before inspecting or returning stored calculations.
  await authorizeOperationalHistory(operationalHistoryRuntimeSchema.parse(row.runtime), actor, executor);
  const record = runRecordSchema.parse({
    contract: ENGINE_RUN_RECORD_CONTRACT, runId: row.runId, engineKey: row.engineKey, engineVersion: row.engineVersion,
    requestContract: row.requestContract, resultContract: row.resultContract, environment: row.environment, status: row.status,
    requestHash: row.requestHash, inputsHash: row.inputsHash, outputHash: row.outputHash, request: row.request,
    result: row.result, errorCode: row.errorCode, confidence: row.confidence, gaps: row.gaps,
    actor: { kind: row.actorKind, id: row.actorId }, subject: row.subject,
    timing: { startedAt: row.startedAt.toISOString(), finishedAt: row.finishedAt.toISOString(), durationMs: row.durationMs },
    cost: { costUnits: row.costUnits, budgetUnits: row.budgetUnits }, runtime: row.runtime, createdAt: row.createdAt.toISOString(),
    inputs: row.inputs.map((input) => ({
      inputId: input.inputId, roles: input.roles, kind: input.kind, governance: input.governance, completeness: input.completeness,
      refSystem: input.refSystem, refId: input.refId, refVersion: input.refVersion, checksum: input.checksum, snapshot: input.snapshot,
    })),
  });
  const parsed = await validateOperationalRunRecord(record);
  for (const input of row.inputs) {
    const history = operationalInputHistory(parsed.result, parsed.runtime.transcript, input.inputId);
    if (input.dataCenterVersionId !== history.reference.version.versionId || input.dataCenterSourceId !== history.reference.source.sourceId
      || input.dataCenterTypeKey !== history.reference.dataset.typeKey || input.contentHash !== history.contentHash
      || canonicalize(input.provenance) !== canonicalize(history.provenance)
      || canonicalize(input.usageIntent) !== canonicalize(history.usageIntent)) throw new OperationalHistoryMismatch("STORED_EVIDENCE");
  }
  return parsed;
}
export async function readOperationalRun(runId: string, actor: DataCenterActor) {
  identifierSchema.parse(runId); requireDataCenterPrincipal(actor);
  return db.$transaction((tx) => readInTransaction(runId, actor, tx), {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000,
  });
}
