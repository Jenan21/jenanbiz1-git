import type { DataCenterActor } from "@/services/data-center/contracts";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { canonicalize } from "../../shared/canonical";
import { computeDeterminism, deriveRunStatus } from "../../shared/contracts";
import { identifierSchema } from "../../shared/primitives";
import { finalizeMarketSources } from "../data-sources";
import { evaluatePreparedMarket } from "../engine";
import { MARKET_CALCULATION_VERSION, marketM3ResultSchema, type MarketM3Result } from "../result";
import { MarketHistoryMismatch, MarketHistoryUnavailable } from "./historical-data-center";
import { readMarketRun } from "./run-persistence";

/** Exact historical arithmetic at the recorded instant. No discovery, latest-version fallback, writes or new persisted run. */
export async function replayMarketAnalysis(runId: string, actor: DataCenterActor): Promise<MarketM3Result> {
  identifierSchema.parse(runId);
  return db.$transaction(async (tx) => {
    const { record, result } = await readMarketRun(runId, actor, tx);
    if (!result) throw new MarketHistoryUnavailable();
    if (record.engineVersion !== MARKET_CALCULATION_VERSION) throw new MarketHistoryMismatch("ENGINE_VERSION");
    const prepared = finalizeMarketSources(result.sourceEvidence, result.request.normalized, result.evaluatedAt, result.work);
    const calculated = evaluatePreparedMarket(result.request.normalized, prepared);
    const replayed: MarketM3Result = {
      ...result, ...calculated, inputs: prepared.inputs, rights: prepared.rights, attribution: prepared.attribution,
      status: deriveRunStatus(calculated.results.flatMap((entry) => entry.metrics), calculated.gaps),
    };
    replayed.determinism = computeDeterminism(replayed);
    if (replayed.determinism.requestHash !== record.requestHash) throw new MarketHistoryMismatch("REQUEST_HASH");
    if (replayed.determinism.inputsHash !== record.inputsHash) throw new MarketHistoryMismatch("INPUT_HASH");
    if (replayed.determinism.outputHash !== record.outputHash || canonicalize(replayed) !== canonicalize(result)) throw new MarketHistoryMismatch("OUTPUT_HASH");
    return marketM3ResultSchema.parse(replayed);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
}
