import type { DataCenterActor } from "@/services/data-center/contracts";
import { canonicalHash, canonicalize, compareText, sha256Hex } from "../../shared/canonical";
import { EngineError } from "../../shared/errors";
import { DEFAULT_BUDGET_UNITS, SPATIAL_ENGINE_KEY, SPATIAL_ENGINE_VERSION, SPATIAL_REQUEST_CONTRACT, SPATIAL_RESULT_CONTRACT } from "../constants";
import { ENGINE_RUN_RECORD_CONTRACT, MAX_RUN_JSON_BYTES, buildRunRecord, runRecordSchema, type RunRecordContext } from "../../shared/run-record";
import type { SpatialMapPort } from "../map-port";
import { runSpatialAnalysis, type RunSpatialOptions } from "../engine";
import type { SpatialResult } from "../contracts";
import type { DataCenterRunInputProvenance } from "../data-sources";
import type { HistoricalDataCenterContext } from "./historical-data-center";
import { persistAnalysisEngineRun } from "./run-persistence";

export interface PersistedSpatialRunOptions extends Omit<RunSpatialOptions, "captureDataCenterInput"> {
  actor: RunRecordContext["actor"];
  subject?: string | null;
  dataCenterActor?: DataCenterActor;
  dataCenterContext?: HistoricalDataCenterContext;
}

function actorMatchesDataCenter(actor: RunRecordContext["actor"], dataCenterActor: DataCenterActor): boolean {
  return (actor.kind === "USER" && dataCenterActor.kind === "HUMAN" && actor.id === dataCenterActor.id)
    || (actor.kind === "ROBOT" && dataCenterActor.kind === "AI" && actor.id === dataCenterActor.id);
}

/** Runs the pure engine, then persists its complete immutable record and inputs before returning the result. */
export async function runSpatialAnalysisPersisted(port: SpatialMapPort, input: unknown, options: PersistedSpatialRunOptions): Promise<SpatialResult> {
  if (options.dataCenterPort && (!options.dataCenterActor || !actorMatchesDataCenter(options.actor, options.dataCenterActor))) {
    throw new Error("A configured Data Center provider requires the authenticated matching actor");
  }
  const providerContext = options.dataCenterPort?.replayContext;
  if (providerContext && options.dataCenterContext && canonicalize(providerContext) !== canonicalize(options.dataCenterContext)) {
    throw new Error("The persisted replay authorization context does not match the configured Data Center provider");
  }
  let startedAt: Date | null = null;
  let finishedAt: Date | null = null;
  const dataCenterProvenance = new Map<string, DataCenterRunInputProvenance>();
  const captureDataCenterInput = (inputId: string, provenance: DataCenterRunInputProvenance) => {
    const previous = dataCenterProvenance.get(inputId);
    if (!previous) {
      dataCenterProvenance.set(inputId, { reference: provenance.reference, selections: [...provenance.selections] });
      return;
    }
    if (canonicalize(previous.reference) !== canonicalize(provenance.reference)) {
      throw new EngineError("CONTRACT_VIOLATION", { reason: "data_center_reference_changed", inputId });
    }
    previous.selections.push(...provenance.selections);
  };
  const clock = () => {
    const now = options.clock();
    startedAt ??= now;
    finishedAt = now;
    return now;
  };
  let result: SpatialResult;
  try {
    const runOptions: RunSpatialOptions = {
      environment: options.environment,
      clock,
      newRunId: options.newRunId,
      ...(options.budgetUnits === undefined ? {} : { budgetUnits: options.budgetUnits }),
      ...(options.allowEvaluatedAtOverride === undefined ? {} : { allowEvaluatedAtOverride: options.allowEvaluatedAtOverride }),
      ...(options.requireReadOnlyRole === undefined ? {} : { requireReadOnlyRole: options.requireReadOnlyRole }),
      ...(options.dataCenterPort === undefined ? {} : { dataCenterPort: options.dataCenterPort }),
      captureDataCenterInput,
      ...(options.replay === undefined ? {} : { replay: options.replay }),
    };
    result = await runSpatialAnalysis(port, input, runOptions);
  } catch (error) {
    if (!(error instanceof EngineError)) throw error;
    const failedAt = finishedAt ?? options.clock();
    const serialized = canonicalize(input);
    const fullRequest = { submitted: JSON.parse(serialized) as unknown };
    const fullRequestBytes = Buffer.byteLength(canonicalize(fullRequest), "utf8");
    const request = fullRequestBytes <= MAX_RUN_JSON_BYTES
      ? fullRequest
      : { truncated: true, sha256: sha256Hex(serialized), byteLength: Buffer.byteLength(serialized, "utf8") };
    const failureRecord = runRecordSchema.parse({
      contract: ENGINE_RUN_RECORD_CONTRACT,
      runId: options.newRunId(),
      engineKey: SPATIAL_ENGINE_KEY,
      engineVersion: SPATIAL_ENGINE_VERSION,
      requestContract: SPATIAL_REQUEST_CONTRACT,
      resultContract: SPATIAL_RESULT_CONTRACT,
      environment: options.environment,
      status: "FAILED",
      requestHash: fullRequestBytes <= MAX_RUN_JSON_BYTES ? canonicalHash(request) : sha256Hex(serialized),
      inputsHash: null,
      outputHash: null,
      request,
      result: null,
      errorCode: error.code,
      confidence: null,
      gaps: { BLOCKING: 0, WARNING: 0, INFO: 0 },
      actor: options.actor,
      subject: options.subject ?? null,
      timing: {
        startedAt: (startedAt ?? failedAt).toISOString(),
        finishedAt: failedAt.toISOString(),
        durationMs: Math.max(0, failedAt.getTime() - (startedAt ?? failedAt).getTime()),
      },
      cost: { costUnits: 0, budgetUnits: options.budgetUnits ?? DEFAULT_BUDGET_UNITS },
      runtime: { errorDetails: error.details },
      createdAt: failedAt.toISOString(),
      inputs: [],
    });
    try {
      await persistAnalysisEngineRun(failureRecord);
    } catch (persistError) {
      throw new AggregateError([error, persistError], "The Spatial Engine failed and its failure record could not be persisted");
    }
    throw error;
  }
  const dataCenterInputs = result.inputs.filter((entry) => entry.kind === "DATA_CENTER_VERSION");
  if (dataCenterInputs.length > 0 && (!options.dataCenterActor || !actorMatchesDataCenter(options.actor, options.dataCenterActor))) {
    throw new Error("Persisting Data Center inputs requires the authenticated matching Data Center actor");
  }
  const replayAuthorizationContext = providerContext ?? options.dataCenterContext ?? {};
  const context = {
    actor: options.actor,
    ...(options.subject === undefined ? {} : { subject: options.subject }),
    createdAt: options.clock().toISOString(),
    ...(dataCenterInputs.length === 0 ? {} : {
      runtime: {
        replayAuthorizationContext,
      },
    }),
  } satisfies RunRecordContext;
  for (const provenance of dataCenterProvenance.values()) {
    provenance.selections.sort((first, second) => compareText(first.role, second.role));
  }
  await persistAnalysisEngineRun(buildRunRecord(result, context), dataCenterProvenance);
  return result;
}
