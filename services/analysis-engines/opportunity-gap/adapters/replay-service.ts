import type { DataCenterActor } from "@/services/data-center/contracts";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { identifierSchema } from "../../shared/primitives";
import { readOpportunityRun } from "./run-persistence";

/** Exact stored transcript and arithmetic at the original instant; no live discovery, fallback or history write. */
export async function replayOpportunityAnalysis(runId: string, actor: DataCenterActor) {
  identifierSchema.parse(runId);
  return db.$transaction(async (tx) => {
    const { replayed } = await readOpportunityRun(runId, actor, tx);
    return replayed;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
}
