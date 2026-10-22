import type { DataCenterActor } from "@/services/data-center/contracts";
import { requireDataCenterPrincipal } from "@/services/data-center/policy";
import { operationalContextSchema, type OperationalContext } from "../contracts";
import { analyzeOperationalData, buildOperationalRunRecord, captureOperationalReads, operationalHistoryAccessSchema } from "../run-history";
import { createOperationalDataCenterProvider, type OperationalProviderContext } from "./data-center-provider";
import { persistOperationalRun } from "./run-persistence";

export async function runOperationalAnalysisPersisted(
  request: unknown, actor: DataCenterActor, context: OperationalContext & { createdAt: string },
  access: Omit<OperationalProviderContext, "evaluatedAt"> = {},
) {
  requireDataCenterPrincipal(actor);
  const execution = operationalContextSchema.parse({
    runId: context.runId, evaluatedAt: context.evaluatedAt, environment: context.environment, timing: context.timing,
  });
  const trustedAccess = operationalHistoryAccessSchema.parse(access);
  const capture = captureOperationalReads(createOperationalDataCenterProvider(actor, { ...trustedAccess, evaluatedAt: execution.evaluatedAt }));
  const result = await analyzeOperationalData(capture.port, request, execution);
  const record = await buildOperationalRunRecord(result, {
    actor: { kind: actor.kind === "HUMAN" ? "USER" : "ROBOT", id: actor.id },
    createdAt: context.createdAt, access: trustedAccess,
  }, capture.transcript);
  await persistOperationalRun(record, actor);
  return result;
}
