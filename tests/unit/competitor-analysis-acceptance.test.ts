import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { runCompetitorAnalysis } from "@/services/analysis-engines/competitor-analysis";
import { canonicalize } from "@/services/analysis-engines/shared/canonical";
import { MAX_RUN_JSON_BYTES } from "@/services/analysis-engines/shared/run-record";
import { competitorPortFixture } from "./support/competitor-data-fixtures";
import { competitorInstant, competitorRequest } from "./support/competitor-analysis-fixtures";

const execution = (index: number) => ({ runId: `competitor:m5-${index}`, evaluatedAt: competitorInstant, environment: "test" as const,
  timing: { startedAt: competitorInstant, finishedAt: competitorInstant, durationMs: 0 } });
describe("Competitor M5 bounded synthetic acceptance", () => {
  it("keeps 32 interleaved complete analyses deterministic and isolates source/result mutation", async () => {
    const request = competitorRequest(); request.data.roles = {}; request.analyses = ["COUNTS", "DISTRIBUTION", "IDENTITY_MATCHING"];
    const unchanged = structuredClone(request); const fixture = competitorPortFixture(15);
    const originalBytes = [...fixture.versions].map(([id, value]) => [id, value.content]);
    const started = performance.now();
    const runs = await Promise.all(Array.from({ length: 32 }, (_, index) => runCompetitorAnalysis(fixture.port, request, execution(index))));
    const totalMs = performance.now() - started;
    for (const run of runs) {
      expect(run.determinism).toEqual(runs[0]!.determinism);
      const totals = run.results.flatMap((entry) => entry.metrics).filter((metric) => metric.operation === "COUNT" && metric.countBasis === "SCOPED_TOTAL");
      expect(Object.fromEntries(totals.map((metric) => [metric.countingUnit!, metric.value]))).toEqual({ COMPETITOR_LOCATIONS: 15, UNIQUE_COMPETITOR_ENTITIES: 1 });
      expect(run.inputs).toHaveLength(4); expect(Buffer.byteLength(canonicalize(run))).toBeLessThanOrEqual(MAX_RUN_JSON_BYTES);
    }
    expect(request).toEqual(unchanged); expect([...fixture.versions].map(([id, value]) => [id, value.content])).toEqual(originalBytes);
    runs[0]!.preparation.current.sources[0]!.reference!.source.name = "Mutated isolated result";
    expect(runs[1]!.preparation.current.sources[0]!.reference!.source.name).not.toBe("Mutated isolated result");
    expect(totalMs).toBeLessThan(15_000);
    console.log(`COMPETITOR_M5_PURE_LOAD=${JSON.stringify({ count: 32, locationsPerRun: 15, totalMs, operationsPerSecond: 32_000 / totalMs })}`);
  }, 30_000);
  it("rejects oversized submitted input before any source read or discovery", async () => {
    const fixture = competitorPortFixture();
    await expect(runCompetitorAnalysis(fixture.port, { content: "x".repeat(MAX_RUN_JSON_BYTES + 1) }, execution(0)))
      .rejects.toMatchObject({ code: "REQUEST_TOO_LARGE" });
    expect(fixture.port.discover).not.toHaveBeenCalled(); expect(fixture.port.read).not.toHaveBeenCalled();
  });
});
