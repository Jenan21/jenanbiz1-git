import type { DataCenterActor } from "@/services/data-center/contracts";
import { readOperationalRun } from "./run-persistence";

/** Reauthorization and exact original-byte recomputation are read-only, never latest-version resolution. */
export async function replayOperationalAnalysis(runId: string, actor: DataCenterActor) {
  return (await readOperationalRun(runId, actor)).result;
}
