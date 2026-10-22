import type { DataCenterActor } from "@/services/data-center/contracts";
import { readFinancialRun } from "./run-persistence";

/** Reuses the original model, source bytes and calculation version; replay never creates a new run or discovers latest. */
export async function replayFinancialAnalysis(runId: string, actor: DataCenterActor) {
  return (await readFinancialRun(runId, actor)).result;
}
