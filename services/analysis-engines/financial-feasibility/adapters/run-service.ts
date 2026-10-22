import type { DataCenterActor } from "@/services/data-center/contracts";
import { requireDataCenterPrincipal } from "@/services/data-center/policy";
import { financialContextSchema, type FinancialContext } from "../contracts";
import { analyzeFinancialData, buildFinancialRunRecord, captureFinancialReads, financialHistoryAccessSchema } from "../run-history";
import { createFinancialDataCenterProvider, type FinancialProviderContext } from "./data-center-provider";
import { persistFinancialRun } from "./run-persistence";

export async function runFinancialAnalysisPersisted(
  request: unknown, actor: DataCenterActor, context: FinancialContext & { createdAt: string }, access: Omit<FinancialProviderContext, "evaluatedAt"> = {},
) {
  requireDataCenterPrincipal(actor);
  const execution = financialContextSchema.parse({
    runId: context.runId, evaluatedAt: context.evaluatedAt, environment: context.environment, timing: context.timing,
  });
  const trustedAccess = financialHistoryAccessSchema.parse(access);
  const capture = captureFinancialReads(createFinancialDataCenterProvider(actor, { ...trustedAccess, evaluatedAt: execution.evaluatedAt }));
  const result = await analyzeFinancialData(capture.port, request, execution);
  const record = await buildFinancialRunRecord(result, {
    actor: { kind: actor.kind === "HUMAN" ? "USER" : "ROBOT", id: actor.id },
    createdAt: context.createdAt, access: trustedAccess,
  }, capture.transcript);
  await persistFinancialRun(record, actor);
  return result;
}
