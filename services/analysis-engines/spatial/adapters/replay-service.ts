import { z } from "zod";
import type { DataCenterActor } from "@/services/data-center/contracts";
import { mapReferenceSchema } from "@/services/data-center/map-contract";
import { dataCenterSelectionTraceSchema, type DataCenterSelectionTrace } from "../../shared/contracts";
import type { RunRecord } from "../../shared/run-record";
import type { SpatialMapPort } from "../map-port";
import { isFeatureRole, isPopulationRole, spatialResultSchema, type SpatialNormalizedRequest, type SpatialResult } from "../contracts";
import type { DataCenterDiscovery, DataCenterSelection, SpatialDataCenterPort } from "../data-center-port";
import { dataSourceRequestsOf } from "../data-sources";
import { runSpatialAnalysis } from "../engine";
import { HistoricalVersionIntegrityError, HistoricalVersionUnavailable, readHistoricalDataCenterVersion } from "./historical-data-center";
import { readAnalysisEngineRunForReplay } from "./run-persistence";

export class SpatialReplayUnavailable extends Error {
  constructor() {
    super("This analysis run is unavailable for replay");
    this.name = "SpatialReplayUnavailable";
  }
}

export class SpatialReplayMismatch extends Error {
  constructor(readonly mismatch: "REQUEST_HASH" | "INPUT_HASH" | "OUTPUT_HASH" | "STORED_PROVENANCE" | "MAP_RELEASE") {
    super(`Historical replay did not reproduce the recorded ${mismatch.toLowerCase().replace("_", " ")}`);
    this.name = "SpatialReplayMismatch";
  }
}

const replayContextSchema = z.object({
  specialty: z.string().min(1).max(80).optional(),
  missionContext: z.string().min(1).max(80).optional(),
}).strict();

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function verifyDataCenterProvenance(input: RunRecord["inputs"][number], value: unknown) {
  const record = recordOf(value);
  const version = recordOf(record?.version);
  const persistedReference = mapReferenceSchema.safeParse(record?.reference);
  const selections = z.array(z.object({
    role: z.string().min(1).max(80),
    trace: dataCenterSelectionTraceSchema,
  }).strict()).safeParse(record?.selections);
  if (!record || record.contract !== "jenan.analysis-engine.data-center-input-provenance/v1" || !persistedReference.success || !selections.success
    || version?.versionId !== input.refId || version.checksum !== input.checksum
    || persistedReference.data.version.versionId !== input.refId
    || persistedReference.data.version.checksum.value !== input.checksum
    || selections.data.length !== input.roles.length
    || new Set(selections.data.map((selection) => selection.role)).size !== input.roles.length
    || selections.data.some((selection) => !input.roles.includes(selection.role) || selection.trace.selectedVersionId !== input.refId)
    || record.publication === null || typeof record.publication !== "object") {
    throw new SpatialReplayMismatch("STORED_PROVENANCE");
  }
  return {
    reference: persistedReference.data,
    selections: new Map(selections.data.map((selection) => [selection.role, selection.trace])),
  };
}

function accessContext(record: RunRecord): z.infer<typeof replayContextSchema> {
  const runtime = recordOf(record.runtime);
  const context = recordOf(runtime?.replayAuthorizationContext) ?? {};
  const parsed = replayContextSchema.safeParse(context);
  if (!parsed.success) throw new SpatialReplayMismatch("STORED_PROVENANCE");
  return parsed.data;
}

function mapPins(record: RunRecord, result: SpatialResult): { mapReleaseId: string | null; mapReleaseByRole: Record<string, string> } {
  const runtime = recordOf(result.engine.runtime);
  const mapReleaseId = runtime?.mapReleaseId;
  if (mapReleaseId !== null && typeof mapReleaseId !== "string") throw new SpatialReplayMismatch("MAP_RELEASE");
  const mapReleaseByRole: Record<string, string> = {};
  for (const input of record.inputs) {
    if (input.kind !== "MAP_LAYER" || input.refSystem !== "JENAN_MAP") continue;
    const releaseId = input.refId.split("/", 1)[0];
    if (!releaseId) throw new SpatialReplayMismatch("MAP_RELEASE");
    for (const role of input.roles) {
      if (mapReleaseByRole[role] !== undefined && mapReleaseByRole[role] !== releaseId) throw new SpatialReplayMismatch("MAP_RELEASE");
      mapReleaseByRole[role] = releaseId;
    }
  }
  return { mapReleaseId: mapReleaseId as string | null, mapReleaseByRole };
}

function replayQueue(request: SpatialNormalizedRequest, record: RunRecord, provenance: ReadonlyMap<string, unknown>) {
  const performsFeatureAnalysis = request.analyses.some((analysis) => analysis === "PROXIMITY" || analysis === "CATCHMENT");
  const roles = performsFeatureAnalysis
    ? [...new Set([
      ...request.parameters.roles.filter(isFeatureRole),
      ...(request.analyses.includes("CATCHMENT") ? request.parameters.roles.filter(isPopulationRole) : []),
    ])].sort()
    : [];
  const selections = Object.fromEntries(Object.entries(request.data.roles).filter(([role, selection]) => roles.includes(role) && selection.source === "DATA_CENTER"));
  const requests = dataSourceRequestsOf(selections);
  const inputsByRole = new Map<string, {
    input: RunRecord["inputs"][number];
    reference: z.infer<typeof mapReferenceSchema>;
    trace: DataCenterSelectionTrace;
  }>();
  for (const role of requests.map((entry) => entry.role)) {
    const input = record.inputs.find((candidate) => candidate.kind === "DATA_CENTER_VERSION" && candidate.roles.includes(role));
    if (!input) throw new SpatialReplayUnavailable();
    const stored = verifyDataCenterProvenance(input, provenance.get(input.inputId));
    const trace = stored.selections.get(role);
    if (!trace) throw new SpatialReplayMismatch("STORED_PROVENANCE");
    inputsByRole.set(role, { input, reference: stored.reference, trace });
  }
  return { requests, inputsByRole };
}

function historicalPort(input: {
  queue: ReturnType<typeof replayQueue>;
  actor: DataCenterActor;
  context: z.infer<typeof replayContextSchema>;
}): SpatialDataCenterPort {
  let position = 0;
  const byVersion = new Map([...input.queue.inputsByRole.values()].map((entry) => [entry.input.refId, entry]));
  return {
    async discover(selection: DataCenterSelection): Promise<DataCenterDiscovery> {
      const request = input.queue.requests[position++];
      if (!request) throw new SpatialReplayMismatch("STORED_PROVENANCE");
      const saved = input.queue.inputsByRole.get(request.role);
      if (!saved) throw new SpatialReplayMismatch("STORED_PROVENANCE");
      const { input: savedInput, reference, trace } = saved;
      const selectionMatches = selection.kind === "EXACT"
        ? trace.mode === "EXACT" && selection.versionId === savedInput.refId
        : trace.mode === "BY_TYPE" && selection.typeKey === reference.dataset.typeKey
          && (selection.asOf === undefined ? !trace.asOfExplicit : trace.asOfExplicit && selection.asOf === trace.asOf);
      if (!selectionMatches || trace.selectedVersionId !== savedInput.refId) {
        throw new SpatialReplayMismatch("STORED_PROVENANCE");
      }
      return {
        mode: trace.mode,
        policy: trace.policy,
        asOf: trace.asOf,
        asOfExplicit: trace.asOfExplicit,
        status: "FOUND",
        selected: reference,
        candidates: [],
        truncated: trace.candidatesTruncated,
        notInForce: trace.notInForce,
        traceSnapshot: trace,
      };
    },
    async readContent(request) {
      const saved = byVersion.get(request.versionId);
      const reference = saved?.reference;
      const savedInput = saved?.input;
      if (!saved || !reference || !savedInput || request.expectedChecksum !== savedInput.checksum || request.expectedChecksum !== reference.version.checksum.value) {
        throw new SpatialReplayMismatch("STORED_PROVENANCE");
      }
      try {
        const historical = await readHistoricalDataCenterVersion({
          versionId: savedInput.refId,
          expectedChecksum: reference.version.checksum.value,
          expectedSourceId: reference.source.sourceId,
          expectedTypeKey: reference.dataset.typeKey,
          actor: input.actor,
          context: input.context,
        });
        return { status: "OK", reference, features: historical.features, checksum: historical.checksum };
      } catch (error) {
        if (error instanceof HistoricalVersionUnavailable) throw new SpatialReplayUnavailable();
        if (error instanceof HistoricalVersionIntegrityError) throw new SpatialReplayMismatch("INPUT_HASH");
        throw error;
      }
    },
    async resolveMapReference() {
      return null;
    },
  };
}

export async function replaySpatialAnalysis(port: SpatialMapPort, runId: string, actor: DataCenterActor, options: {
  clock: () => Date;
  newRunId: () => string;
  requireReadOnlyRole?: boolean;
}): Promise<SpatialResult> {
  const stored = await readAnalysisEngineRunForReplay(runId, actor);
  if (!stored || stored.record.engineKey !== "spatial" || stored.record.result === null || stored.record.status === "FAILED") {
    throw new SpatialReplayUnavailable();
  }
  const parsed = spatialResultSchema.safeParse(stored.record.result);
  if (!parsed.success) throw new SpatialReplayMismatch("STORED_PROVENANCE");
  const original = parsed.data;
  if (stored.record.requestHash !== original.determinism.requestHash || stored.record.inputsHash !== original.determinism.inputsHash
    || stored.record.outputHash !== original.determinism.outputHash) throw new SpatialReplayMismatch("STORED_PROVENANCE");
  const request = original.request.normalized;
  const queue = replayQueue(request, stored.record, stored.provenance);
  const context = accessContext(stored.record);
  const pins = mapPins(stored.record, original);
  const dataCenterPort = historicalPort({ queue, actor, context });
  const replayed = await runSpatialAnalysis(port, {
    ...request,
    mapLayerPolicy: original.request.mapLayerPolicy,
    options: { evaluatedAt: original.evaluatedAt },
  }, {
    environment: original.engine.environment,
    clock: options.clock,
    newRunId: options.newRunId,
    budgetUnits: stored.record.cost.budgetUnits,
    allowEvaluatedAtOverride: true,
    requireReadOnlyRole: options.requireReadOnlyRole ?? original.engine.environment === "production",
    dataCenterPort,
    replay: { ...pins, defaultsApplied: original.request.defaultsApplied },
  });
  if (replayed.determinism.requestHash !== original.determinism.requestHash) throw new SpatialReplayMismatch("REQUEST_HASH");
  if (replayed.determinism.inputsHash !== original.determinism.inputsHash) throw new SpatialReplayMismatch("INPUT_HASH");
  if (replayed.determinism.outputHash !== original.determinism.outputHash) throw new SpatialReplayMismatch("OUTPUT_HASH");
  return replayed;
}
