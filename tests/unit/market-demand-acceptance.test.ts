import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { runMarketAnalysis } from "@/services/analysis-engines/market-demand";
import { marketPortFixture } from "./support/market-data-fixtures";
import { marketInstant, marketRequest } from "./support/market-demand-fixtures";

describe("Market M5 deterministic synthetic bounded-load acceptance", () => {
  it("keeps 32 independent interleaved calculations deterministic without shared mutable evidence", async () => {
    const started = performance.now(); const submitted = marketRequest(); const unchanged = structuredClone(submitted);
    const runs = await Promise.all(Array.from({ length: 32 }, (_, index) => {
      const fixture = marketPortFixture();
      return runMarketAnalysis(submitted, fixture.port, { runId: `m5-${index}`, evaluatedAt: marketInstant, environment: "test",
        timing: { startedAt: marketInstant, finishedAt: marketInstant, durationMs: 0 } });
    }));
    for (const run of runs) {
      expect(run.determinism).toEqual(runs[0]!.determinism);
      expect(run.outcomes.map((outcome) => outcome.value)).toEqual([100, 80]);
      expect(run.inputs).toHaveLength(2);
    }
    expect(submitted).toEqual(unchanged);
    runs[0]!.sourceEvidence[0]!.reference!.source.name = "Changed isolated result";
    expect(runs[1]!.sourceEvidence[0]!.reference!.source.name).not.toBe("Changed isolated result");
    const totalMs = performance.now() - started;
    expect(totalMs).toBeLessThan(15_000);
    console.log(`MARKET_M5_PURE_LOAD=${JSON.stringify({ count: 32, totalMs, operationsPerSecond: 32_000 / totalMs })}`);
  });
});
