import type { DataCenterActor } from "@/services/data-center/contracts";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { canonicalize } from "../../shared/canonical";
import { identifierSchema } from "../../shared/primitives";
import { runPreparedCompetitorAnalysis } from "../engine";
import { CompetitorHistoryMismatch, CompetitorHistoryUnavailable } from "./historical-data-center";
import { readCompetitorRun } from "./run-persistence";

/** Replays captured identity/matching/arithmetic at the original instant; no discovery or history write. */
export async function replayCompetitorAnalysis(runId: string, actor: DataCenterActor) {
  identifierSchema.parse(runId);
  return db.$transaction(async (tx) => {
    const { record, result } = await readCompetitorRun(runId, actor, tx);
    if (!result) throw new CompetitorHistoryUnavailable();
    const replayed = runPreparedCompetitorAnalysis(result.preparation.current, result.preparation.baseline, {
      runId: result.runId, evaluatedAt: result.evaluatedAt, environment: result.engine.environment, timing: result.timing,
    });
    if (replayed.determinism.requestHash !== record.requestHash) throw new CompetitorHistoryMismatch("REQUEST_HASH");
    if (replayed.determinism.inputsHash !== record.inputsHash) throw new CompetitorHistoryMismatch("INPUT_HASH");
    if (replayed.determinism.outputHash !== record.outputHash || canonicalize(replayed) !== canonicalize(result)) throw new CompetitorHistoryMismatch("OUTPUT_HASH");
    return replayed;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
}
