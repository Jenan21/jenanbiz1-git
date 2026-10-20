import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { canonicalize } from "../../shared/canonical";
import { dataCenterSelectionTraceSchema } from "../../shared/contracts";
import { ENGINE_RUN_RECORD_CONTRACT, runRecordSchema, type RunRecord } from "../../shared/run-record";
import { buildDataCenterUsageIntents } from "../usage-intents";
import type { DataCenterRunInputProvenance } from "../data-sources";
import type { DataCenterActor } from "@/services/data-center/contracts";
import { isDataCenterAdmin } from "@/services/data-center/policy";
import { mapReferenceSchema } from "@/services/data-center/map-contract";

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(canonicalize(value)) as Prisma.InputJsonValue;

async function dataCenterSnapshot(input: RunRecord["inputs"][number], captured: DataCenterRunInputProvenance | undefined) {
  if (input.kind !== "DATA_CENTER_VERSION") return null;
  const referenceResult = mapReferenceSchema.safeParse(captured?.reference);
  const selections = captured?.selections ?? [];
  if (!referenceResult.success || selections.length !== input.roles.length
    || new Set(selections.map((selection) => selection.role)).size !== input.roles.length
    || selections.some((selection) => !input.roles.includes(selection.role)
      || !dataCenterSelectionTraceSchema.safeParse(selection.trace).success
      || selection.trace.selectedVersionId !== input.refId)) {
    throw new Error(`Run input ${input.inputId} is missing consistent Data Center selection provenance`);
  }
  const reference = referenceResult.data;
  if (reference.version.versionId !== input.refId || reference.version.number !== input.refVersion
    || reference.version.checksum.value !== input.checksum || reference.source.sourceId.length === 0) {
    throw new Error(`Run input ${input.inputId} is missing consistent Data Center provenance`);
  }
  const version = await db.dataCenterVersion.findUnique({
    where: { id: input.refId },
    select: {
      id: true, itemId: true, number: true, title: true, checksum: true, evidenceStatus: true, origin: true,
      provenance: true, confidence: true, specialties: true, missionContexts: true, requiredPermission: true,
      sourcePublishedAt: true, expiresAt: true, effectiveFrom: true, effectiveTo: true, createdAt: true, attribution: true,
      upstream: { select: { upstreamVersionId: true } },
      item: { select: { sourceId: true, typeKey: true } },
    },
  });
  if (!version || version.checksum !== input.checksum || version.item.sourceId !== reference.source.sourceId || version.item.typeKey !== reference.dataset.typeKey) {
    throw new Error(`Data Center provenance changed while persisting run input ${input.inputId}`);
  }
  return {
    contract: "jenan.analysis-engine.data-center-input-provenance/v1",
    reference,
    selections,
    version: {
      versionId: version.id, itemId: version.itemId, number: version.number, title: version.title, checksum: version.checksum,
      evidenceStatus: version.evidenceStatus, origin: version.origin, provenance: version.provenance, confidence: version.confidence,
      specialties: version.specialties, missionContexts: version.missionContexts, requiredPermission: version.requiredPermission,
      sourcePublishedAt: version.sourcePublishedAt, expiresAt: version.expiresAt, effectiveFrom: version.effectiveFrom, effectiveTo: version.effectiveTo,
      createdAt: version.createdAt, attribution: version.attribution,
      upstreamVersionIds: version.upstream.map((edge) => edge.upstreamVersionId),
    },
    publication: { status: reference.publication.status, publishedVersionAtRun: reference.publication.publishedVersion, publishedAt: reference.publication.publishedAt },
    quality: reference.quality,
  };
}

/**
 * Persists one complete run and its inputs in a single nested create. This adapter exposes no update or delete operation; the migration
 * also protects the history tables with append-only triggers.
 */
export async function persistAnalysisEngineRun(candidate: RunRecord, capturedProvenance: ReadonlyMap<string, DataCenterRunInputProvenance> = new Map()): Promise<void> {
  const record = runRecordSchema.parse(candidate);
  const normalized = record.request.normalized;
  const requestedAnalyses = normalized && typeof normalized === "object" && !Array.isArray(normalized)
    && Array.isArray((normalized as Record<string, unknown>).analyses)
    ? ((normalized as Record<string, unknown>).analyses as string[]) : [];
  const usageIntents = new Map(buildDataCenterUsageIntents(record.inputs.map((input) => input.snapshot), requestedAnalyses).map((intent) => [intent.versionId, intent]));
  const inputs = [];
  for (const input of record.inputs) {
    const provenance = await dataCenterSnapshot(input, capturedProvenance.get(input.inputId));
    const intent = input.kind === "DATA_CENTER_VERSION" ? usageIntents.get(input.refId) : undefined;
    if (input.kind === "DATA_CENTER_VERSION" && (!provenance || !intent)) throw new Error(`Run input ${input.inputId} has no persistable usage intent`);
    inputs.push({
      inputId: input.inputId,
      roles: input.roles,
      kind: input.kind,
      governance: input.governance,
      completeness: input.completeness,
      refSystem: input.refSystem,
      refId: input.refId,
      refVersion: input.refVersion,
      checksum: input.checksum,
      dataCenterVersionId: provenance ? input.refId : null,
      dataCenterSourceId: provenance?.reference.source.sourceId ?? null,
      dataCenterTypeKey: provenance?.reference.dataset.typeKey ?? null,
      contentHash: provenance?.reference.version.checksum.value ?? null,
      provenance: provenance === null ? undefined : json(provenance),
      usageIntent: intent === undefined ? undefined : json(intent),
      snapshot: json(input.snapshot),
    });
  }

  await db.analysisEngineRun.create({
    data: {
      runId: record.runId,
      engineKey: record.engineKey,
      engineVersion: record.engineVersion,
      requestContract: record.requestContract,
      resultContract: record.resultContract,
      environment: record.environment,
      status: record.status,
      requestHash: record.requestHash,
      inputsHash: record.inputsHash,
      outputHash: record.outputHash,
      request: json(record.request),
      result: record.result === null ? Prisma.DbNull : json(record.result),
      errorCode: record.errorCode,
      confidence: record.confidence === null ? Prisma.DbNull : json(record.confidence),
      gaps: json(record.gaps),
      actorKind: record.actor.kind,
      actorId: record.actor.id,
      subject: record.subject,
      startedAt: new Date(record.timing.startedAt),
      finishedAt: new Date(record.timing.finishedAt),
      durationMs: record.timing.durationMs,
      costUnits: record.cost.costUnits,
      budgetUnits: record.cost.budgetUnits,
      runtime: json(record.runtime),
      createdAt: new Date(record.createdAt),
      inputs: { create: inputs },
    },
  });
}

export async function readAnalysisEngineRunForReplay(runId: string, actor: DataCenterActor): Promise<{ record: RunRecord; provenance: Map<string, unknown> } | null> {
  const row = await db.analysisEngineRun.findFirst({
    where: { runId, ...(isDataCenterAdmin(actor) ? {} : { actorKind: actor.kind === "HUMAN" ? "USER" : "ROBOT", actorId: actor.id }) },
    include: { inputs: { orderBy: { inputId: "asc" } } },
  });
  if (!row) return null;
  const record = runRecordSchema.parse({
    contract: ENGINE_RUN_RECORD_CONTRACT,
    runId: row.runId,
    engineKey: row.engineKey,
    engineVersion: row.engineVersion,
    requestContract: row.requestContract,
    resultContract: row.resultContract,
    environment: row.environment,
    status: row.status,
    requestHash: row.requestHash,
    inputsHash: row.inputsHash,
    outputHash: row.outputHash,
    request: row.request,
    result: row.result,
    errorCode: row.errorCode,
    confidence: row.confidence,
    gaps: row.gaps,
    actor: { kind: row.actorKind, id: row.actorId },
    subject: row.subject,
    timing: { startedAt: row.startedAt.toISOString(), finishedAt: row.finishedAt.toISOString(), durationMs: row.durationMs },
    cost: { costUnits: row.costUnits, budgetUnits: row.budgetUnits },
    runtime: row.runtime,
    createdAt: row.createdAt.toISOString(),
    inputs: row.inputs.map((input) => ({
      inputId: input.inputId,
      roles: input.roles,
      kind: input.kind,
      governance: input.governance,
      completeness: input.completeness,
      refSystem: input.refSystem,
      refId: input.refId,
      refVersion: input.refVersion,
      checksum: input.checksum,
      snapshot: input.snapshot,
    })),
  });
  return { record, provenance: new Map(row.inputs.filter((input) => input.provenance !== null).map((input) => [input.inputId, input.provenance])) };
}
