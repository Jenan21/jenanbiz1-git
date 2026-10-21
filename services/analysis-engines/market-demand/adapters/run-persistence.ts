import { Prisma } from "@/generated/prisma/client";
import { db, type DbExecutor } from "@/lib/db";
import type { DataCenterActor } from "@/services/data-center/contracts";
import { isDataCenterAdmin, requireDataCenterPrincipal } from "@/services/data-center/policy";
import { canonicalize, compareText } from "../../shared/canonical";
import { ENGINE_RUN_RECORD_CONTRACT, type RunRecord } from "../../shared/run-record";
import { marketUsageIntent, validateMarketRunRecord } from "../run-history";
import { MarketHistoryMismatch, MarketHistoryUnavailable, readMarketHistoricalVersion } from "./historical-data-center";

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(canonicalize(value)) as Prisma.InputJsonValue;
function inputProvenance(result: NonNullable<ReturnType<typeof validateMarketRunRecord>["result"]>, inputId: string) {
  const sources = result.sourceEvidence.filter((source) => source.input?.id === inputId);
  return {
    contract: "jenan.market-demand.input-provenance/v1",
    sources: sources.map((source) => ({ role: source.role, reference: source.reference, selection: source.selection })),
  };
}

/** Uses only the existing shared append-only run/input tables; one nested create is atomic. */
export async function persistMarketRun(candidate: RunRecord, actor: DataCenterActor): Promise<void> {
  requireDataCenterPrincipal(actor);
  const { record, result, access } = validateMarketRunRecord(candidate);
  if (record.actor.id !== actor.id || record.actor.kind !== (actor.kind === "HUMAN" ? "USER" : "ROBOT")) throw new MarketHistoryUnavailable();
  await db.$transaction(async (tx) => {
    const inputs = [];
    for (const input of record.inputs) {
      const sources = result!.sourceEvidence.filter((source) => source.input?.id === input.inputId);
      if (!sources.length) throw new MarketHistoryMismatch("STORED_EVIDENCE");
      for (const source of sources) await readMarketHistoricalVersion(source, actor, access, tx);
      const reference = sources[0]!.reference!;
      inputs.push({
        inputId: input.inputId, roles: input.roles, kind: input.kind, governance: input.governance,
        completeness: input.completeness, refSystem: input.refSystem, refId: input.refId,
        refVersion: input.refVersion, checksum: input.checksum, snapshot: json(input.snapshot),
        dataCenterVersionId: input.refId, dataCenterSourceId: reference.source.sourceId,
        dataCenterTypeKey: reference.dataset.typeKey, contentHash: input.checksum,
        provenance: json(inputProvenance(result!, input.inputId)), usageIntent: json(marketUsageIntent(result!, input.inputId)),
      });
    }
    await tx.analysisEngineRun.create({ data: {
      runId: record.runId, engineKey: record.engineKey, engineVersion: record.engineVersion,
      requestContract: record.requestContract, resultContract: record.resultContract,
      environment: record.environment, status: record.status,
      requestHash: record.requestHash, inputsHash: record.inputsHash, outputHash: record.outputHash,
      request: json(record.request), result: record.result === null ? Prisma.DbNull : json(record.result),
      errorCode: record.errorCode, confidence: record.confidence === null ? Prisma.DbNull : json(record.confidence),
      gaps: json(record.gaps), actorKind: record.actor.kind, actorId: record.actor.id, subject: record.subject,
      startedAt: new Date(record.timing.startedAt), finishedAt: new Date(record.timing.finishedAt), durationMs: record.timing.durationMs,
      costUnits: record.cost.costUnits, budgetUnits: record.cost.budgetUnits, runtime: json(record.runtime),
      createdAt: new Date(record.createdAt), inputs: { create: inputs },
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
}

/** Internal owner/admin lookup. No unfiltered lookup is used to distinguish hidden from absent run ids. */
export async function readMarketRun(runId: string, actor: DataCenterActor, executor: DbExecutor = db) {
  requireDataCenterPrincipal(actor);
  const row = await executor.analysisEngineRun.findFirst({
    where: { runId, engineKey: "market-demand",
      ...(isDataCenterAdmin(actor) ? {} : { actorKind: actor.kind === "HUMAN" ? "USER" : "ROBOT", actorId: actor.id }) },
    include: { inputs: { orderBy: { inputId: "asc" } } },
  });
  if (!row) throw new MarketHistoryUnavailable();
  row.inputs.sort((a, b) => compareText(a.inputId, b.inputId));
  const parsed = validateMarketRunRecord({
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
  if (parsed.result) for (const input of row.inputs) {
    const sources = parsed.result.sourceEvidence.filter((source) => source.input?.id === input.inputId);
    const reference = sources[0]?.reference;
    if (!reference || input.dataCenterVersionId !== input.refId || input.dataCenterSourceId !== reference.source.sourceId
      || input.dataCenterTypeKey !== reference.dataset.typeKey || input.contentHash !== input.checksum
      || canonicalize(input.provenance) !== canonicalize(inputProvenance(parsed.result, input.inputId))
      || canonicalize(input.usageIntent) !== canonicalize(marketUsageIntent(parsed.result, input.inputId))) throw new MarketHistoryMismatch("STORED_EVIDENCE");
  }
  if (parsed.result) for (const source of parsed.result.sourceEvidence) if (source.input) await readMarketHistoricalVersion(source, actor, parsed.access, executor);
  return parsed;
}
