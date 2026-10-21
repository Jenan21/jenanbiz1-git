import { describe, expect, it } from "vitest";
import {
  classifyMarketEvidence, marketDatasetSchema, normalizeMarketRequest, prepareMarketData,
  type MarketDataset, type MarketDatasetRole, type MarketRequest,
} from "@/services/analysis-engines/market-demand";
import { marketDataset, marketPortFixture, marketReference } from "./support/market-data-fixtures";
import { marketInstant, marketRequest } from "./support/market-demand-fixtures";

const normalize = (request: MarketRequest = marketRequest()) => normalizeMarketRequest(request, { evaluatedAt: marketInstant }).normalized;
const demand = (result: Awaited<ReturnType<typeof prepareMarketData>>) => result.sources.find((source) => source.role === "demand.observations")!;
function changeDataset(fixture: ReturnType<typeof marketPortFixture>, edit: (dataset: Extract<MarketDataset, { role: "demand.observations" }>) => void) {
  const dataset = marketDataset("demand.observations");
  if (dataset.role !== "demand.observations") throw new Error("Fixture role");
  edit(dataset);
  fixture.versions.get("version-1")!.content = JSON.stringify(dataset);
}
describe("Market M2 dataset contracts (synthetic, not real-data acceptance)", () => {
  it.each(["demand.observations", "context.indicators", "demand.assumptions", "dimensions.dictionary"] as MarketDatasetRole[])("validates %s without GeoJSON or self-checksum circularity", (role) => {
    expect(marketDatasetSchema.safeParse(marketDataset(role)).success).toBe(true);
  });
  it.each([
    ["unknown field", (data: Record<string, unknown>) => { data.revenue = 100; }],
    ["wrong contract", (data: Record<string, unknown>) => { data.contract = "other/v1"; }],
    ["implicit demand declaration", (data: Record<string, unknown>) => { delete data.declares; }],
  ] as const)("rejects %s", (_name, edit) => {
    const data = JSON.parse(JSON.stringify(marketDataset()));
    edit(data);
    expect(marketDatasetSchema.safeParse(data).success).toBe(false);
  });
  it.each(["population_count", "business_count", "competitor_count", "poi_count"])("never accepts %s as an observed demand subject", (subject) => {
    const dataset = marketDataset();
    if (dataset.role !== "demand.observations") throw new Error("Fixture role");
    dataset.rows[0]!.subject = subject as typeof dataset.rows[number]["subject"];
    expect(marketDatasetSchema.safeParse(dataset).success).toBe(false);
  });
});
describe("Market M2 governed source preparation", () => {
  it("binds source/version/hash/rights/quality and observation lineage from the authorized read", async () => {
    const f = marketPortFixture();
    const result = await prepareMarketData(f.port, normalize(), marketInstant);
    expect(demand(result).status).toBe("AVAILABLE");
    expect(demand(result).observations[0]!.ref).toEqual({ inputId: "dc:version-1", observationId: "obs-august" });
    expect(demand(result).matches.map((match) => match.status)).toEqual(["AVAILABLE", "AVAILABLE"]);
    expect(demand(result).reference).toEqual(f.versions.get("version-1")!.reference);
    expect(result.rights.allowExport).toBe(false);
    expect(result.attribution).toEqual(expect.arrayContaining([expect.objectContaining({ text: "Synthetic fixture credit" })]));
    expect(result.work).toEqual({ discoveries: 2, reads: 2, parsedRows: 3 });
    expect(f.read).toHaveBeenCalledWith({ versionId: "version-1", expectedChecksum: "a".repeat(64) });
    expect(classifyMarketEvidence(demand(result).observations[0]!)).toBe("OBSERVED");
  });
  it("exact pin X is used or fails; it never substitutes Y", async () => {
    const f = marketPortFixture();
    const req = marketRequest({ data: { roles: { "demand.observations": [{ source: "DATA_CENTER", versionId: "missing-X" }] } } });
    const result = await prepareMarketData(f.port, normalize(req), marketInstant);
    expect(demand(result).status).toBe("NOT_AVAILABLE");
    expect(f.read.mock.calls.map(([query]) => query.versionId)).not.toContain("version-1");
    expect(demand(result).selection!.unavailableVersionIds).toEqual(["missing-X"]);
  });
  it("type/asOf delegates deterministic selection once; malformed chosen data cannot fall back", async () => {
    const f = marketPortFixture();
    f.versions.set("valid-alternate", { reference: marketReference("valid-alternate"), content: JSON.stringify(marketDataset()) });
    f.versions.get("version-1")!.content = "{";
    const req = marketRequest({ data: { roles: { "demand.observations": { source: "DATA_CENTER", typeKey: "market-demand-observations" } } } });
    const result = await prepareMarketData(f.port, normalize(req), marketInstant);
    expect(demand(result).gaps.map((gap) => gap.code)).toContain("MARKET_DATASET_INVALID");
    expect(f.discover).toHaveBeenCalledWith({ typeKeys: ["market-demand-observations"], asOf: marketInstant, limit: 100 });
    expect(f.read.mock.calls.map(([query]) => query.versionId)).not.toContain("valid-alternate");
  });
  it("never accepts a similar dataset name in place of an explicit type", async () => {
    const f = marketPortFixture();
    f.versions.get("version-1")!.reference.dataset.typeKey = "population";
    const result = await prepareMarketData(f.port, normalize(), marketInstant);
    expect(demand(result).gaps[0]!.code).toBe("MARKET_SOURCE_TYPE_INVALID");
    expect(f.read.mock.calls.map(([query]) => query.versionId)).not.toContain("version-1");
  });
  it("rejects the wrong requested typeKey before source discovery for that role", async () => {
    const f = marketPortFixture();
    const req = marketRequest({ data: { roles: { "demand.observations": { source: "DATA_CENTER", typeKey: "geojson" } } } });
    expect(demand(await prepareMarketData(f.port, normalize(req), marketInstant)).status).toBe("NOT_COMPUTABLE");
    expect(f.discover.mock.calls).toHaveLength(1);
  });
  it("rejects a pinned checksum mismatch before reading the content", async () => {
    const f = marketPortFixture();
    const req = marketRequest({ data: { roles: { "demand.observations": [{ source: "DATA_CENTER", versionId: "version-1", expectedChecksum: "b".repeat(64) }] } } });
    expect(demand(await prepareMarketData(f.port, normalize(req), marketInstant)).gaps[0]!.code).toBe("MARKET_SOURCE_INTEGRITY");
    expect(f.read.mock.calls.map(([query]) => query.versionId)).not.toContain("version-1");
  });
  it("treats reader checksum errors as explicit non-computable gaps", async () => {
    const f = marketPortFixture();
    f.read.mockResolvedValueOnce({ status: "INTEGRITY_ERROR" });
    expect(demand(await prepareMarketData(f.port, normalize(), marketInstant)).gaps[0]!.code).toBe("MARKET_SOURCE_INTEGRITY");
  });
  it("refuses metadata/rights drift between discovery and exact read", async () => {
    const f = marketPortFixture();
    const actual = f.port.read;
    f.port.read = async (query) => {
      const result = await actual(query);
      if (result.status === "AVAILABLE" && query.versionId === "version-1") result.reference.rights.allowExport = true;
      return result;
    };
    expect(demand(await prepareMarketData(f.port, normalize(), marketInstant)).gaps[0]!.code).toBe("MARKET_SOURCE_INTEGRITY");
  });
  it.each([
    ["negative value", (data: Extract<MarketDataset, { role: "demand.observations" }>) => { data.rows[0]!.value = -1; }],
    ["duplicate row", (data: Extract<MarketDataset, { role: "demand.observations" }>) => { data.rows.push(structuredClone(data.rows[0]!)); }],
    ["wrong dimension", (data: Extract<MarketDataset, { role: "demand.observations" }>) => { data.rows[0]!.semantics.unit.dimension = "PEOPLE"; }],
    ["missing self lineage", (data: Extract<MarketDataset, { role: "demand.observations" }>) => { data.rows[0]!.sourceRefs[0]!.observationId = "missing"; }],
    ["undeclared estimate", (data: Extract<MarketDataset, { role: "demand.observations" }>) => { data.rows[0]!.semantics.evidenceNature = "ESTIMATE"; }],
    ["false coverage", (data: Extract<MarketDataset, { role: "demand.observations" }>) => { data.rows[0]!.semantics.dimensions.sector.code = "not-in-header"; }],
  ] as const)("rejects malformed dataset: %s, without repairing it", async (_name, edit) => {
    const f = marketPortFixture();
    changeDataset(f, edit);
    expect(demand(await prepareMarketData(f.port, normalize(), marketInstant)).gaps[0]!.code).toBe("MARKET_DATASET_INVALID");
  });
  it.each(["geography", "sector", "period"] as const)("outside %s is NO_COVERAGE, never zero", async (dimension) => {
    const f = marketPortFixture();
    const req = marketRequest();
    if (dimension === "geography") req.scope.geography.code = "another-city";
    if (dimension === "sector") req.scope.sector.code = "another-sector";
    if (dimension === "period") {
      req.series[0]!.timeWindow.startDate = "2026-07-01";
      req.series[0]!.periods[0] = { kind: "INTERVAL", id: "2026-07", startDate: "2026-07-01", endDate: "2026-08-01", frequency: "MONTHLY", calendar: "GREGORIAN", timeZone: "Asia/Riyadh" };
    }
    const source = demand(await prepareMarketData(f.port, normalize(req), marketInstant));
    if (dimension === "period") expect(source.matches[0]!.status).toBe("NO_COVERAGE");
    else expect(source.status).toBe("NO_COVERAGE");
    expect(source.gaps.map((gap) => gap.code)).toContain("MARKET_NO_COVERAGE");
  });
  it("missing measurement in declared coverage is NOT_AVAILABLE", async () => {
    const f = marketPortFixture();
    changeDataset(f, (data) => { data.rows.pop(); });
    const source = demand(await prepareMarketData(f.port, normalize(), marketInstant));
    expect(source.matches[1]!.status).toBe("NOT_AVAILABLE");
    expect(source.matches[0]!.status).toBe("AVAILABLE");
  });
  it("incompatible requested units are NOT_COMPUTABLE", async () => {
    const f = marketPortFixture();
    const req = marketRequest();
    req.series[0]!.unit.id = "different-unit";
    expect(demand(await prepareMarketData(f.port, normalize(req), marketInstant)).status).toBe("NOT_COMPUTABLE");
  });
  it("unknown coverage is explicit NOT_COMPUTABLE, not global coverage", async () => {
    const f = marketPortFixture();
    changeDataset(f, (data) => { data.coverage.sectors = null; });
    expect(demand(await prepareMarketData(f.port, normalize(), marketInstant)).status).toBe("NOT_COMPUTABLE");
  });
  it("known sector non-coverage remains NO_COVERAGE even when geography is unknown", async () => {
    const f = marketPortFixture(); changeDataset(f, (data) => { data.coverage.geographies = null; });
    const req = marketRequest(); req.scope.sector.code = "outside";
    expect(demand(await prepareMarketData(f.port, normalize(req), marketInstant)).status).toBe("NO_COVERAGE");
  });
  it("the same geography code with a different boundary version is not comparable, rather than another area", async () => {
    const f = marketPortFixture(); const req = marketRequest(); req.scope.geography.version = "2";
    expect(demand(await prepareMarketData(f.port, normalize(req), marketInstant)).status).toBe("NOT_COMPUTABLE");
  });
  it("overlapping time coverage with an incompatible period identity is NOT_COMPUTABLE", async () => {
    const f = marketPortFixture(); const req = marketRequest(); req.series[0]!.periods[0]!.id = "another-period-definition";
    expect(demand(await prepareMarketData(f.port, normalize(req), marketInstant)).matches[0]!.status).toBe("NOT_COMPUTABLE");
  });
  it("counts automatically required sources toward the run budget before any reads", async () => {
    const f = marketPortFixture();
    const req = marketRequest({ data: { roles: { "demand.observations": Array.from({ length: 32 }, (_, index) => ({ source: "DATA_CENTER" as const, versionId: `v-${index}` })) } } });
    await expect(prepareMarketData(f.port, normalize(req), marketInstant)).rejects.toMatchObject({ code: "REQUEST_TOO_LARGE" });
    expect(f.discover).not.toHaveBeenCalled(); expect(f.read).not.toHaveBeenCalled();
  });
  it("missing dimension dictionary does not authorize an unverified metric definition", async () => {
    const f = marketPortFixture();
    f.versions.delete("dictionary-1");
    expect(demand(await prepareMarketData(f.port, normalize(), marketInstant)).matches.every((match) => match.status === "NOT_AVAILABLE")).toBe(true);
  });
  it("estimated Data Center source cannot be relabelled as an observed dataset", async () => {
    const f = marketPortFixture();
    f.versions.get("version-1")!.reference.version.evidenceStatus = "ESTIMATED";
    const source = demand(await prepareMarketData(f.port, normalize(), marketInstant));
    expect(source.status).toBe("NOT_COMPUTABLE");
    expect(source.observations).toEqual([]);
  });
  it("does not treat unreadable and nonexistent sources differently", async () => {
    const f = marketPortFixture();
    f.read.mockResolvedValueOnce({ status: "NOT_AVAILABLE" });
    const source = demand(await prepareMarketData(f.port, normalize(), marketInstant));
    expect(source.status).toBe("NOT_AVAILABLE");
    expect(source.gaps.map((gap) => gap.code)).toEqual(["MARKET_NOT_AVAILABLE"]);
  });
  it("unselected external lineage is NOT_COMPUTABLE, without implicit reads", async () => {
    const f = marketPortFixture();
    changeDataset(f, (data) => { data.rows[0]!.sourceRefs[0]!.versionId = "hidden-upstream"; });
    const source = demand(await prepareMarketData(f.port, normalize(), marketInstant));
    expect(source.matches[0]!.status).toBe("NOT_COMPUTABLE");
    expect(f.read.mock.calls.map(([query]) => query.versionId)).not.toContain("hidden-upstream");
  });
  it("distinct upstream versions may legitimately reuse an observation id without a false duplicate error", () => {
    const dataset = marketDataset();
    if (dataset.role !== "demand.observations") throw new Error("Fixture role");
    dataset.rows[0]!.sourceRefs = [{ versionId: "upstream-A", observationId: "same-row" }, { versionId: "upstream-B", observationId: "same-row" }];
    expect(marketDatasetSchema.safeParse(dataset).success).toBe(true);
  });
  it("binding explicit/self aliases into duplicate evidence produces an invalid-dataset gap, not an exception", async () => {
    const f = marketPortFixture();
    changeDataset(f, (data) => {
      data.rows[0]!.sourceRefs = [{ observationId: data.rows[0]!.id }, { versionId: "version-1", observationId: data.rows[0]!.id }];
    });
    expect(demand(await prepareMarketData(f.port, normalize(), marketInstant)).gaps[0]!.code).toBe("MARKET_DATASET_INVALID");
  });
  it("returns deterministic input hashes for identical exact snapshots", async () => {
    const f = marketPortFixture();
    const first = await prepareMarketData(f.port, normalize(), marketInstant);
    const second = await prepareMarketData(f.port, normalize(), marketInstant);
    expect(first).toEqual(second);
  });
  it("surfaces infrastructure failure instead of disguising it as missing data", async () => {
    const f = marketPortFixture();
    f.read.mockRejectedValueOnce(new Error("infrastructure unavailable"));
    await expect(prepareMarketData(f.port, normalize(), marketInstant)).rejects.toThrow("infrastructure unavailable");
  });
  it.each([
    ["non-finite value", (data: Extract<MarketDataset, { role: "demand.observations" }>) => { data.rows[0]!.value = Number.NaN; }],
    ["duplicate coverage", (data: Extract<MarketDataset, { role: "demand.observations" }>) => { data.coverage.sectors!.push(structuredClone(data.coverage.sectors![0]!)); }],
    ["fractional event count", (data: Extract<MarketDataset, { role: "demand.observations" }>) => { data.rows[0]!.value = 1.5; }],
    ["wrong temporal frequency", (data: Extract<MarketDataset, { role: "demand.observations" }>) => {
      if (data.rows[0]!.semantics.time.kind === "INTERVAL") data.rows[0]!.semantics.time.frequency = "ANNUAL";
    }],
  ] as const)("fails closed for %s", async (_name, edit) => {
    const f = marketPortFixture(); changeDataset(f, edit);
    expect(demand(await prepareMarketData(f.port, normalize(), marketInstant)).gaps[0]!.code).toBe("MARKET_DATASET_INVALID");
  });
  it("suppressed measurements are unavailable, never zero or repaired", async () => {
    const f = marketPortFixture();
    changeDataset(f, (data) => { data.rows[0]!.status = "SUPPRESSED"; data.rows[0]!.value = null; });
    const source = demand(await prepareMarketData(f.port, normalize(), marketInstant));
    expect(source.matches[0]!.status).toBe("NOT_AVAILABLE");
    expect(source.observations[0]!.value).toBeNull();
  });
  it("incompatible methods block comparison only, not the independently valid period levels", async () => {
    const f = marketPortFixture();
    changeDataset(f, (data) => { data.rows[1]!.method = "A different documented measurement method"; });
    const req = marketRequest({ analyses: ["DEMAND_TREND"], parameters: { comparisons: [{ seriesId: "transactions", fromPeriodId: "2026-08", toPeriodId: "2026-09", measures: ["ABSOLUTE_CHANGE"] }] } });
    const result = await prepareMarketData(f.port, normalize(req), marketInstant);
    expect(demand(result).matches.map((match) => match.status)).toEqual(["AVAILABLE", "AVAILABLE"]);
    expect(result.comparisonAvailability[0]!.status).toBe("NOT_COMPUTABLE");
    expect(result.gaps.map((gap) => gap.code)).toContain("MARKET_NOT_COMPARABLE");
  });
  it("compares compatible periods without calculating any trend in M2", async () => {
    const f = marketPortFixture();
    const req = marketRequest({ analyses: ["DEMAND_TREND"], parameters: { comparisons: [{ seriesId: "transactions", fromPeriodId: "2026-08", toPeriodId: "2026-09", measures: ["PERCENT_CHANGE"] }] } });
    const result = await prepareMarketData(f.port, normalize(req), marketInstant);
    expect(result.comparisonAvailability[0]!.status).toBe("AVAILABLE");
    expect(result).not.toHaveProperty("results");
    expect(result.comparisonAvailability[0]).not.toHaveProperty("value");
  });
  it("refuses unsupported lineage cycles instead of resolving them with invented evidence", async () => {
    const f = marketPortFixture();
    changeDataset(f, (data) => {
      data.rows[0]!.sourceRefs = [{ observationId: data.rows[1]!.id }];
      data.rows[1]!.sourceRefs = [{ observationId: data.rows[0]!.id }];
    });
    expect(demand(await prepareMarketData(f.port, normalize(), marketInstant)).matches.every((match) => match.status === "NOT_COMPUTABLE")).toBe(true);
  });
  it("propagates unavailable lineage transitively and independently of row ordering", async () => {
    const f = marketPortFixture();
    changeDataset(f, (data) => {
      data.rows[0]!.sourceRefs = [{ observationId: data.rows[1]!.id }];
      data.rows[1]!.sourceRefs = [{ versionId: "unselected", observationId: "missing" }];
      data.rows.reverse();
    });
    expect(demand(await prepareMarketData(f.port, normalize(), marketInstant)).matches.every((match) => match.status === "NOT_COMPUTABLE")).toBe(true);
  });
  it("does not invent a missing coverage period even though the dataset has other observations", async () => {
    const f = marketPortFixture();
    changeDataset(f, (data) => { data.rows.pop(); data.coverage.periods!.pop(); });
    expect(demand(await prepareMarketData(f.port, normalize(), marketInstant)).matches[1]!.status).toBe("NO_COVERAGE");
  });
  it("fails explicitly when discovery refuses its candidate budget", async () => {
    const f = marketPortFixture();
    f.port.discover = async (query) => ({ ...await f.discover(query), status: "TOO_MANY_CANDIDATES", candidates: [], selected: null });
    expect(demand(await prepareMarketData(f.port, normalize(), marketInstant)).gaps[0]!.code).toBe("MARKET_SOURCE_LIMIT");
    expect(f.read).not.toHaveBeenCalled();
  });
  it("candidate-list truncation does not replace the policy-selected version", async () => {
    const f = marketPortFixture();
    f.port.discover = async (query) => ({ ...await f.discover(query), truncated: true });
    const req = marketRequest({ data: { roles: { "demand.observations": { source: "DATA_CENTER", typeKey: "market-demand-observations" } } } });
    const source = demand(await prepareMarketData(f.port, normalize(req), marketInstant));
    expect(source.status).toBe("AVAILABLE"); expect(source.selection!.truncated).toBe(true);
  });
  it("does not accept a provider's divergent by-type policy", async () => {
    const f = marketPortFixture();
    f.port.discover = async (query) => ({ ...await f.discover(query), policy: "some-new-policy" });
    const req = marketRequest({ data: { roles: { "demand.observations": { source: "DATA_CENTER", typeKey: "market-demand-observations" } } } });
    await expect(prepareMarketData(f.port, normalize(req), marketInstant)).rejects.toMatchObject({ code: "CONTRACT_VIOLATION" });
  });
  it("rejects more than 2000 rows in a single dataset without truncation", async () => {
    const data = marketDataset();
    if (data.role !== "demand.observations") throw new Error("Fixture role");
    const row = data.rows[0]!;
    data.rows = Array.from({ length: 2001 }, (_, index) => ({ ...row, id: `row-${index}`, sourceRefs: [{ observationId: `row-${index}` }] }));
    expect(marketDatasetSchema.safeParse(data).success).toBe(false);
  });
  it.each(["EXPIRED", "future-publication", "future-effective", "wrong-source-geography", "derived-as-observed"] as const)("refuses %s source evidence", async (condition) => {
    const f = marketPortFixture(); const ref = f.versions.get("version-1")!.reference;
    if (condition === "EXPIRED") ref.freshness.status = "EXPIRED";
    if (condition === "future-publication") ref.publication.publishedAt = "2026-11-01T00:00:00.000Z";
    if (condition === "future-effective") ref.freshness.effectiveFrom = "2026-11-01T00:00:00.000Z";
    if (condition === "wrong-source-geography") ref.coverage!.countryCodes = ["AE"];
    if (condition === "derived-as-observed") ref.version.evidenceStatus = "DERIVED";
    expect(demand(await prepareMarketData(f.port, normalize(), marketInstant)).status).toBe("NOT_COMPUTABLE");
  });
  it("a missing source role uses only its exact proposed typeKey, never title discovery or GeoJSON", async () => {
    const f = marketPortFixture();
    const req = marketRequest({ data: { roles: {} } });
    await prepareMarketData(f.port, normalize(req), marketInstant);
    expect(f.discover.mock.calls.map(([query]) => query.typeKeys)).toEqual([["market-demand-observations"], ["market-dimensions"]]);
  });
  it("binds declared assumption operands, but performs no estimate or hidden frequency default", async () => {
    const f = marketPortFixture();
    const assumptions = marketDataset("demand.assumptions");
    const context = marketDataset("context.indicators");
    if (assumptions.role !== "demand.assumptions" || context.role !== "context.indicators") throw new Error("Fixture role");
    const adoption = assumptions.rows[0]!;
    assumptions.rows.push({
      ...adoption, id: "frequency", kind: "CONSUMPTION_FREQUENCY", value: 2,
      unit: { id: "uses-per-person-month", version: "1", dimension: "FREQUENCY", entity: "service_use", per: { entity: "population_count", frequency: "MONTHLY" } },
      sourceRefs: [{ observationId: "frequency" }], assumptions: [{ id: "frequency-basis", description: "Explicit synthetic frequency basis", sourceRefs: [{ observationId: "frequency" }] }],
    });
    f.versions.set("context-1", { reference: marketReference("context-1", "context.indicators"), content: JSON.stringify(context) });
    f.versions.set("assumptions-1", { reference: marketReference("assumptions-1", "demand.assumptions"), content: JSON.stringify(assumptions) });
    const req = marketRequest({
      analyses: ["ASSUMPTION_BASED_DEMAND"],
      data: { roles: {
        "context.indicators": [{ source: "DATA_CENTER", versionId: "context-1" }],
        "demand.assumptions": [{ source: "DATA_CENTER", versionId: "assumptions-1" }],
      } },
      parameters: { estimates: [{
        id: "estimate-1", seriesId: "transactions", cohortObservationRef: { inputId: "dc:context-1", observationId: context.rows[0]!.id },
        adoptionObservationRef: { inputId: "dc:assumptions-1", observationId: "adoption" }, frequencyObservationRef: { inputId: "dc:assumptions-1", observationId: "frequency" },
        outputUnit: marketRequest().series[0]!.unit, periodId: "2026-08",
      }] },
    });
    const result = await prepareMarketData(f.port, normalize(req), marketInstant);
    expect(result.operandAvailability.map((operand) => operand.status)).toEqual(["AVAILABLE", "AVAILABLE", "AVAILABLE"]);
    expect(result.sources.find((source) => source.role === "demand.assumptions")!.assumptionInputs).toHaveLength(2);
    expect(result).not.toHaveProperty("results");
    req.parameters!.estimates![0]!.frequencyObservationRef.observationId = "missing";
    expect((await prepareMarketData(f.port, normalize(req), marketInstant)).operandAvailability[2]!.status).toBe("NOT_AVAILABLE");
  });
  it("keeps contextual population classified CONTEXTUAL, never OBSERVED demand", async () => {
    const f = marketPortFixture();
    const context = marketDataset("context.indicators");
    if (context.role !== "context.indicators") throw new Error("Fixture role");
    f.versions.set("context-1", { reference: marketReference("context-1", "context.indicators"), content: JSON.stringify(context) });
    const dictionary = marketDataset("dimensions.dictionary");
    if (dictionary.role !== "dimensions.dictionary") throw new Error("Fixture role");
    const row = context.rows[0]!;
    dictionary.definitions = [{ metricDefinition: row.semantics.dimensions.metricDefinition, subject: row.subject, unit: row.semantics.unit, measureKind: row.semantics.measureKind, methodology: row.semantics.dimensions.methodology }];
    f.versions.get("dictionary-1")!.content = JSON.stringify(dictionary);
    const req = marketRequest({
      analyses: ["MARKET_CONTEXT"], data: { roles: { "context.indicators": [{ source: "DATA_CENTER", versionId: "context-1" }] } },
      series: [{ ...marketRequest().series[0]!, unit: row.semantics.unit, periods: [row.semantics.time] }],
    });
    const source = (await prepareMarketData(f.port, normalize(req), marketInstant)).sources.find((entry) => entry.role === "context.indicators")!;
    expect(source.status).toBe("AVAILABLE");
    expect(classifyMarketEvidence(source.observations[0]!)).toBe("CONTEXTUAL");
  });
});
