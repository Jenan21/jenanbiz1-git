import type { DataCenterActor } from "@/services/data-center/contracts";
import { EngineError } from "../../shared/errors";
import { marketRunContextSchema, type MarketRunContext } from "../result";
import { buildMarketFailureRecord, buildMarketRunRecord, marketHistoryContextSchema, marketRecordContextSchema, type MarketHistoryContext } from "../run-history";
import { runMarketDataCenterAnalysis } from "./data-center-provider";
import { persistMarketRun } from "./run-persistence";

export interface PersistedMarketContext extends MarketRunContext, MarketHistoryContext {
  createdAt: string; subject?: string;
}

/** Returns only after the governed result and all its input/usage evidence have been saved atomically. */
export async function runMarketAnalysisPersisted(request: unknown, actor: DataCenterActor, rawContext: PersistedMarketContext) {
  const execution = marketRunContextSchema.parse({
    runId: rawContext.runId, evaluatedAt: rawContext.evaluatedAt, environment: rawContext.environment, timing: rawContext.timing,
  });
  const access = marketHistoryContextSchema.parse({
    ...(rawContext.specialty === undefined ? {} : { specialty: rawContext.specialty }),
    ...(rawContext.missionContext === undefined ? {} : { missionContext: rawContext.missionContext }),
    ...(rawContext.organizationId === undefined ? {} : { organizationId: rawContext.organizationId }),
  });
  const context = marketRecordContextSchema.parse({
    actor: { kind: actor.kind === "HUMAN" ? "USER" as const : "ROBOT" as const, id: actor.id },
    createdAt: rawContext.createdAt, access, ...(rawContext.subject === undefined ? {} : { subject: rawContext.subject }),
  });
  let result;
  try { result = await runMarketDataCenterAnalysis(request, actor, { ...execution, ...access }); }
  catch (error) {
    if (!(error instanceof EngineError)) throw error;
    try { await persistMarketRun(buildMarketFailureRecord(request, error, execution, context), actor); }
    catch (saveError) { throw new AggregateError([error, saveError], "Market execution failed and its failure history could not be persisted"); }
    throw error;
  }
  await persistMarketRun(buildMarketRunRecord(result, context), actor);
  return result;
}
