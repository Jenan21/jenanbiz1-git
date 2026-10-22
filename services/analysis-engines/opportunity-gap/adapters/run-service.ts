import type { DataCenterActor } from "@/services/data-center/contracts";
import { analyzeOpportunityData, opportunityCalculationContextSchema, type OpportunityCalculationContext } from "../calculations";
import { buildOpportunityRunRecord, captureOpportunityReads, opportunityHistoryAccessSchema, opportunityRecordContextSchema, type OpportunityHistoryAccess } from "../run-history";
import { createOpportunityDataCenterProvider } from "./data-center-provider";
import { persistOpportunityRun } from "./run-persistence";

export interface PersistedOpportunityContext extends OpportunityCalculationContext, OpportunityHistoryAccess {
  createdAt: string; subject?: string;
}
export async function runOpportunityAnalysisPersisted(request: unknown, actor: DataCenterActor, rawContext: PersistedOpportunityContext) {
  const execution = opportunityCalculationContextSchema.parse({
    runId: rawContext.runId, evaluatedAt: rawContext.evaluatedAt, environment: rawContext.environment, timing: rawContext.timing,
  });
  const access = opportunityHistoryAccessSchema.parse({
    ...(rawContext.specialty === undefined ? {} : { specialty: rawContext.specialty }),
    ...(rawContext.missionContext === undefined ? {} : { missionContext: rawContext.missionContext }),
    ...(rawContext.organizationId === undefined ? {} : { organizationId: rawContext.organizationId }),
  });
  const context = opportunityRecordContextSchema.parse({
    actor: { kind: actor.kind === "HUMAN" ? "USER" : "ROBOT", id: actor.id },
    createdAt: rawContext.createdAt, access, ...(rawContext.subject === undefined ? {} : { subject: rawContext.subject }),
  });
  const capture = captureOpportunityReads(createOpportunityDataCenterProvider(actor, { ...execution, ...access }));
  const result = await analyzeOpportunityData(capture.port, request, execution);
  await persistOpportunityRun(buildOpportunityRunRecord(result, context, capture.transcript), actor);
  return result;
}
