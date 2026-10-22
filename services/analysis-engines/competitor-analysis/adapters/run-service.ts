import type { DataCenterActor } from "@/services/data-center/contracts";
import { EngineError } from "../../shared/errors";
import { competitorExecutionSchema, type CompetitorExecution } from "../engine";
import {
  buildCompetitorFailureRecord, buildCompetitorRunRecord, competitorHistoryContextSchema, competitorRecordContextSchema, type CompetitorHistoryContext,
} from "../run-history";
import { runCompetitorDataCenterAnalysis } from "./data-center-provider";
import { persistCompetitorRun } from "./run-persistence";

export interface PersistedCompetitorContext extends CompetitorExecution, CompetitorHistoryContext {
  createdAt: string; subject?: string;
}
export async function runCompetitorAnalysisPersisted(request: unknown, actor: DataCenterActor, rawContext: PersistedCompetitorContext) {
  const execution = competitorExecutionSchema.parse({
    runId: rawContext.runId, evaluatedAt: rawContext.evaluatedAt, environment: rawContext.environment, timing: rawContext.timing,
  });
  const access = competitorHistoryContextSchema.parse({
    ...(rawContext.specialty === undefined ? {} : { specialty: rawContext.specialty }),
    ...(rawContext.missionContext === undefined ? {} : { missionContext: rawContext.missionContext }),
    ...(rawContext.organizationId === undefined ? {} : { organizationId: rawContext.organizationId }),
  });
  const context = competitorRecordContextSchema.parse({
    actor: { kind: actor.kind === "HUMAN" ? "USER" : "ROBOT", id: actor.id },
    createdAt: rawContext.createdAt, access, ...(rawContext.subject === undefined ? {} : { subject: rawContext.subject }),
  });
  let result;
  try { result = await runCompetitorDataCenterAnalysis(request, actor, { ...execution, ...access }); }
  catch (error) {
    if (!(error instanceof EngineError)) throw error;
    try { await persistCompetitorRun(buildCompetitorFailureRecord(request, error, execution, context), actor); }
    catch (saveError) { throw new AggregateError([error, saveError], "Competitor execution failed and its failure history could not be persisted"); }
    throw error;
  }
  await persistCompetitorRun(buildCompetitorRunRecord(result, context), actor);
  return result;
}
