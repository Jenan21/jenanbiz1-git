import { describe, expect, it } from "vitest";
import { bindOpportunityDataset, opportunityDatasetSchema, prepareOpportunityData, type OpportunityDataset } from "@/services/analysis-engines/opportunity-gap";
import { evaluatedAt } from "./support/analysis-engine-fixtures";
import { opportunityRequest } from "./support/opportunity-gap-fixtures";
import { opportunityDataset, opportunityPortFixture, opportunityReference } from "./support/opportunity-data-fixtures";

describe("Opportunity M2 exact read and source validation, synthetic fixtures only", () => {
  it("reads exact pins, binds local provenance, preserves metadata/rights and does no analytics", async () => {
    const fixture = opportunityPortFixture(); const request = opportunityRequest();
    const result = await prepareOpportunityData(fixture.port, request, evaluatedAt);
    expect(result.ready).toBe(true); expect(result.current.facts).toHaveLength(2);
    expect(result.current.inputs[0]!.checksum?.value).toBe("b".repeat(64));
    expect(result.sources.every((source) => source.status === "AVAILABLE" && source.contentHash?.length === 64)).toBe(true);
    expect(fixture.discover).toHaveBeenCalledWith({ versionIds: ["need-v1"] });
    expect(fixture.read).toHaveBeenCalledWith({ versionId: "need-v1", expectedChecksum: "a".repeat(64) });
    expect(result.rights.allowExport).toBe(false); expect(result.attribution).toHaveLength(1);
    expect(result.realDataAcceptance).toBe("BLOCKED / NOT VERIFIED");
    expect(result).not.toHaveProperty("results"); expect(result).not.toHaveProperty("opportunityScore");
  });
  it("is deterministic under pin order permutations and does not mutate caller state", async () => {
    const fixture = opportunityPortFixture(); const request = opportunityRequest(); const original = structuredClone(request);
    const first = await prepareOpportunityData(fixture.port, request, evaluatedAt);
    expect(request).toEqual(original); request.data.roles.reverse(); request.analyses.reverse();
    expect((await prepareOpportunityData(fixture.port, request, evaluatedAt)).determinism).toEqual(first.determinism);
  });
  it("does not discover by type or fallback when a pin is absent", async () => {
    const fixture = opportunityPortFixture(); fixture.versions.delete("need-v1");
    const result = await prepareOpportunityData(fixture.port, opportunityRequest(), evaluatedAt);
    expect(result.sources.find((source) => source.role === "need.observations")).toMatchObject({ status: "NOT_AVAILABLE", reason: "SOURCE_UNAVAILABLE", reference: null });
    expect(fixture.read.mock.calls.some(([query]) => query.versionId === "need-v1")).toBe(false);
    expect(fixture.discover.mock.calls.every(([query]) => Object.keys(query).join() === "versionIds")).toBe(true);
  });
  it("requires exact pins for missing essential roles without guessing a source", async () => {
    const fixture = opportunityPortFixture(); const request = opportunityRequest(); request.data.roles = [];
    const result = await prepareOpportunityData(fixture.port, request, evaluatedAt);
    expect(result.sources.map((source) => source.reason)).toEqual(["EXACT_PIN_REQUIRED", "EXACT_PIN_REQUIRED"]);
    expect(fixture.discover).not.toHaveBeenCalled(); expect(fixture.read).not.toHaveBeenCalled();
  });
  it("reports an explicit unavailable reason and fail-closed rights when no sources are requested", async () => {
    const fixture = opportunityPortFixture(); const request = opportunityRequest();
    request.analyses = ["DATA_COVERAGE"]; request.data.roles = [];
    expect(await prepareOpportunityData(fixture.port, request, evaluatedAt)).toMatchObject({
      ready: false, status: "NOT_AVAILABLE", reason: "NO_EXACT_SOURCES_REQUESTED", rights: { allowExport: false },
    });
    expect(fixture.discover).not.toHaveBeenCalled();
  });
  it.each(["checksum", "type", "source", "license", "usage", "expired", "future", "conflicted", "estimated", "geography", "quality-future"])("rejects invalid %s metadata", async (condition) => {
    const fixture = opportunityPortFixture(); const entry = fixture.versions.get("need-v1")!;
    switch (condition) {
      case "checksum": entry.reference.version.checksum.value = "c".repeat(64); break;
      case "type": entry.reference.dataset.typeKey = "competitor-locations"; break;
      case "source": entry.reference.source.sourceId = "foreign"; break;
      case "license": entry.reference.rights.license = " "; break;
      case "usage": entry.reference.rights.usagePolicy = " "; break;
      case "expired": entry.reference.freshness.expiresAt = evaluatedAt; break;
      case "future": entry.reference.version.createdAt = "2027-01-01T00:00:00.000Z"; break;
      case "conflicted": entry.reference.version.evidenceStatus = "CONFLICTED"; break;
      case "estimated": entry.reference.version.evidenceStatus = "ESTIMATED"; break;
      case "geography": entry.reference.coverage!.countryCodes = ["US"]; break;
      case "quality-future": if (entry.reference.quality.status === "MEASURED") entry.reference.quality.measuredAt = "2027-01-01T00:00:00.000Z"; break;
    }
    const result = await prepareOpportunityData(fixture.port, opportunityRequest(), evaluatedAt);
    expect(result.sources.find((source) => source.role === "need.observations")?.status).toBe("NOT_COMPUTABLE");
    expect(result.ready).toBe(false);
  });
  it.each(["malformed", "contract", "sourceRecord", "role", "unit", "period", "sector", "method", "futureRecord", "boundary", "benchmark"])("validates dataset %s", async (condition) => {
    const fixture = opportunityPortFixture(); const entry = fixture.versions.get("need-v1")!; const dataset = opportunityDataset();
    switch (condition) {
      case "malformed": entry.content = "{bad-json"; break;
      case "contract": entry.content = JSON.stringify({ contract: "legacy", rows: [] }); break;
      case "sourceRecord": dataset.rows[0]!.evidence = ["missing"]; break;
      case "role": dataset.role = "supply.capacity"; break;
      case "unit": dataset.definition.unit.entity = "seats"; dataset.rows[0]!.semantics.unit.entity = "seats"; break;
      case "period": dataset.scope.time.id = "different"; dataset.rows[0]!.semantics.time.id = "different"; break;
      case "sector": dataset.scope.dimensions.sector.code = "other"; dataset.rows[0]!.semantics.dimensions.sector.code = "other"; break;
      case "method": dataset.scope.dimensions.methodology.version = "2"; dataset.rows[0]!.semantics.dimensions.methodology.version = "2"; dataset.rows[0]!.method.version = "2"; break;
      case "futureRecord": dataset.sourceRecords[0]!.recordedAt = "2027-01-01T00:00:00.000Z"; break;
      case "boundary": dataset.rows[0]!.measurementBoundary = "CONTEXT_ONLY"; break;
      case "benchmark": dataset.rows[0]!.benchmark = opportunityDataset("benchmarks.targets").rows[0]!.benchmark; break;
    }
    if (!["malformed", "contract"].includes(condition)) entry.content = JSON.stringify(dataset);
    const result = await prepareOpportunityData(fixture.port, opportunityRequest(), evaluatedAt);
    const source = result.sources.find((source) => source.role === "need.observations")!;
    expect(source.status).toBe(["period", "sector"].includes(condition) ? "NO_COVERAGE" : "NOT_COMPUTABLE");
    expect(result.current.facts.every((fact) => fact.role !== "need.observations")).toBe(true);
  });
  it.each(["PARTIAL", "UNKNOWN", "NONE"] as const)("retains %s coverage explicitly rather than proving zero", async (coverage) => {
    const fixture = opportunityPortFixture(); const dataset = opportunityDataset();
    dataset.coverage.status = coverage; dataset.coverage.completeness = "UNKNOWN"; dataset.rows[0]!.coverage = coverage;
    dataset.rows[0]!.limitations = ["Partial evidence"]; if (coverage === "NONE") dataset.rows[0]!.value = null;
    fixture.versions.get("need-v1")!.content = JSON.stringify(dataset);
    const result = await prepareOpportunityData(fixture.port, opportunityRequest(), evaluatedAt);
    expect(result.sources.find((source) => source.role === "need.observations")?.status).toBe(coverage === "NONE" ? "NO_COVERAGE" : "PARTIAL");
    expect(result.ready).toBe(false);
    expect(result.current.facts.some((fact) => fact.value === 0)).toBe(false);
  });
  it("does not let a row upgrade partial coverage or a benchmark become observed demand", () => {
    const dataset = opportunityDataset(); dataset.coverage.status = "PARTIAL";
    expect(opportunityDatasetSchema.safeParse(dataset).success).toBe(false);
    const target = opportunityDataset("benchmarks.targets"); target.rows[0]!.evidenceClass = "OBSERVED";
    expect(() => bindOpportunityDataset(target, opportunityReference("benchmarks.targets", "target"))).toThrow("Evidence class must reflect");
  });
  it("rejects duplicate source/fact identities and unresolved coverage provenance", () => {
    const dataset = opportunityDataset(); dataset.sourceRecords.push(dataset.sourceRecords[0]!);
    expect(opportunityDatasetSchema.safeParse(dataset).success).toBe(false);
    const duplicate = opportunityDataset(); duplicate.rows.push(duplicate.rows[0]!);
    expect(opportunityDatasetSchema.safeParse(duplicate).success).toBe(false);
    const coverage = opportunityDataset(); coverage.coverage.evidence = ["absent"];
    expect(opportunityDatasetSchema.safeParse(coverage).success).toBe(false);
  });
  it("keeps current and historical exact pins independent; never fetches latest", async () => {
    const fixture = opportunityPortFixture(); const request = opportunityRequest();
    request.analyses.push("HISTORICAL_CHANGE"); request.historical = { scope: structuredClone(request.scope), versions: [{ role: "need.observations", versionId: "baseline", checksum: "a".repeat(64) }] };
    fixture.versions.set("baseline", { reference: opportunityReference("need.observations", "baseline"), content: JSON.stringify(opportunityDataset()) });
    const result = await prepareOpportunityData(fixture.port, request, evaluatedAt);
    expect(result.historical.facts[0]!.evidence[0]!.versionId).toBe("baseline");
    expect(result.sources.find((source) => source.phase === "HISTORICAL" && source.role === "supply.capacity")?.reason).toBe("EXACT_PIN_REQUIRED");
    expect(result.ready).toBe(false);
    expect(fixture.read.mock.calls.map(([query]) => query.versionId)).toEqual(["need-v1", "capacity-v1", "baseline"]);
  });
  it("cannot upgrade stale or undated metadata to complete ready evidence", async () => {
    const fixture = opportunityPortFixture(); fixture.versions.get("need-v1")!.reference.freshness.freshnessDays = 1;
    const result = await prepareOpportunityData(fixture.port, opportunityRequest(), evaluatedAt);
    expect(result.sources[0]!.status).toBe("PARTIAL"); expect(result.ready).toBe(false);
  });
  it("enforces a single declared benchmark policy before accepting targets", async () => {
    const fixture = opportunityPortFixture(); const request = opportunityRequest();
    request.analyses = ["BENCHMARK_GAP"]; request.benchmarkPolicy = { id: "test-benchmark", version: "1" };
    request.data.roles = [
      { role: "provision.observations", versionId: "provision", checksum: "a".repeat(64) },
      { role: "benchmarks.targets", versionId: "target", checksum: "a".repeat(64) },
    ];
    for (const pin of request.data.roles) fixture.versions.set(pin.versionId, { reference: opportunityReference(pin.role, pin.versionId), content: JSON.stringify(opportunityDataset(pin.role)) });
    expect((await prepareOpportunityData(fixture.port, request, evaluatedAt)).ready).toBe(true);
    const target = opportunityDataset("benchmarks.targets"); target.rows[0]!.benchmark!.policy.version = "2";
    fixture.versions.get("target")!.content = JSON.stringify(target);
    expect((await prepareOpportunityData(fixture.port, request, evaluatedAt)).sources[0]!.reason).toBe("BENCHMARK_POLICY_OR_VALIDITY_INVALID");
  });
  it("rejects checksum failures, discovery/read drift and unexpected faults without fallback", async () => {
    const fixture = opportunityPortFixture();
    fixture.read.mockResolvedValueOnce({ status: "INTEGRITY_ERROR" });
    expect((await prepareOpportunityData(fixture.port, opportunityRequest(), evaluatedAt)).sources[0]!.reason).toBe("CHECKSUM_MISMATCH");
    const drift = opportunityPortFixture(); const original = drift.read.getMockImplementation()!;
    drift.read.mockImplementation(async (query) => {
      const result = await original(query);
      if (result.status === "AVAILABLE") result.reference.rights.usagePolicy = "Changed";
      return result;
    });
    expect((await prepareOpportunityData(drift.port, opportunityRequest(), evaluatedAt)).sources[0]!.reason).toBe("REFERENCE_OR_INTEGRITY_MISMATCH");
    fixture.discover.mockRejectedValue(new Error("backend offline"));
    await expect(prepareOpportunityData(fixture.port, opportunityRequest(), evaluatedAt)).rejects.toThrow("backend offline");
  });
  it("rejects oversized requests before I/O and validates combined row cost", async () => {
    const fixture = opportunityPortFixture();
    await expect(prepareOpportunityData(fixture.port, { payload: "x".repeat(2 * 1024 * 1024) }, evaluatedAt)).rejects.toThrow("2 MiB");
    expect(fixture.discover).not.toHaveBeenCalled();
    const dataset: OpportunityDataset = opportunityDataset();
    dataset.sourceRecords = Array.from({ length: 6000 }, (_, i) => ({ ...dataset.sourceRecords[0]!, id: `row-${i}` }));
    dataset.coverage.evidence = ["row-0"]; dataset.rows[0]!.evidence = ["row-0"];
    fixture.versions.get("need-v1")!.content = JSON.stringify(dataset);
    expect(fixture.versions.get("need-v1")!.content.length).toBeGreaterThan(200_000);
    expect((await prepareOpportunityData(fixture.port, opportunityRequest(), evaluatedAt)).sources[0]!.reason).toBe("READ_CONTRACT_INVALID");
  });
  it("accepts exactly 10000 combined records/rows and rejects 10001 without truncation", async () => {
    const fixture = opportunityPortFixture(); fixture.versions.clear();
    const request = opportunityRequest(); request.analyses = ["DATA_COVERAGE"]; request.data.roles = [];
    for (let i = 0; i < 20; i++) {
      const id = `pin${i}`; const dataset = opportunityDataset();
      dataset.sourceRecords = Array.from({ length: 499 }, (_, index) => ({ id: `r${index}`, reference: "s", description: "s", recordedAt: "2026-10-01T00:00:00.000Z" }));
      dataset.coverage.evidence = ["r0"]; dataset.rows[0]!.evidence = ["r0"];
      fixture.versions.set(id, { reference: opportunityReference("need.observations", id), content: JSON.stringify(dataset) });
      request.data.roles.push({ role: "need.observations", versionId: id, checksum: "a".repeat(64) });
    }
    expect((await prepareOpportunityData(fixture.port, request, evaluatedAt)).work.parsedRows).toBe(10000);
    const extra = fixture.versions.get("pin0")!;
    const parsed: OpportunityDataset = opportunityDatasetSchema.parse(JSON.parse(extra.content));
    parsed.sourceRecords.push({ id: "extra", reference: "s", description: "s", recordedAt: "2026-10-01T00:00:00.000Z" });
    extra.content = JSON.stringify(parsed);
    await expect(prepareOpportunityData(fixture.port, request, evaluatedAt)).rejects.toThrow("10000");
  });
});
