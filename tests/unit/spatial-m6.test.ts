import { describe, expect, it } from "vitest";
import { runSpatialAnalysis } from "@/services/analysis-engines/spatial";
import type { SpatialLocation } from "@/services/analysis-engines/spatial/contracts";
import { runAdvancedAnalyses } from "@/services/analysis-engines/spatial/advanced-analysis";
import { compareSites } from "@/services/analysis-engines/spatial/site-comparison";
import { buildDataCenterInput } from "@/services/analysis-engines/spatial/data-center-inputs";
import { normalizeSpatialRequest } from "@/services/analysis-engines/spatial/normalize";
import type { AvailableSource } from "@/services/analysis-engines/spatial/feature-analysis";
import type { SpatialMeasureResult } from "@/services/analysis-engines/spatial/map-port";
import { FakeMapPort, PUBLISHED_RELEASE_ID } from "./support/spatial-fake-map-port";
import { DC_VERSION_ID, FakeDataCenterPort, makeReference } from "./support/spatial-fake-dc-port";
import { baseRequest, riyadh } from "./support/spatial-request-fixtures";
import { CLOCK, expectNoVerdictsAndNoPercentages } from "./support/spatial-run";
import { checkDatasetFeatures } from "@/services/analysis-engines/spatial/dataset-features";

const options = { environment: "test" as const, clock: () => new Date(CLOCK), newRunId: () => "run-m6" };
const measured = (over: Partial<SpatialMeasureResult> = {}): SpatialMeasureResult => ({
  valid: true, truncated: false, unrecognized: 0, pointsOnly: true,
  radii: [{ radiusMeters: 500, count: 6, areaKm2: 0.78 }], occupiedCells: 2, maxCellCount: 5,
  clusterCount: 1, largestCluster: 5, noiseCount: 1, intersects: 1, covers: 1, overlapKm2: 0.1, nearestMeters: 0, ...over,
});
const parameters = (roles: string[]) => normalizeSpatialRequest(baseRequest({ analyses: ["DENSITY"], parameters: { roles: [...new Set(["poi:clinic", ...roles])], radiiMeters: [500] } }), {
  environment: "test", now: options.clock,
}).normalized.parameters;
const source = (role = "poi:clinic", completeness: "SAMPLE" | "UNKNOWN" | "INVENTORY" = "UNKNOWN"): AvailableSource => ({
  kind: "DATA_CENTER", role, features: [],
  input: { ...buildDataCenterInput({ reference: makeReference(), roles: [role], evaluatedAt: CLOCK }), completeness },
});
const advanced = (map: FakeMapPort, entry = source(), analysis: "DENSITY" | "CONSTRAINT_SCREENING" = "DENSITY", location = riyadh) => runAdvancedAnalyses({
  port: map, targets: [{ id: "primary", location }], sources: [entry], parameters: parameters([entry.role]),
  analyses: [analysis], evaluatedAt: CLOCK,
});

describe("Spatial M6 analytic guarantees", () => {
  it("rejects a nested legacy CRS instead of relabelling non-WGS84 geometry", () => {
    const geometry = { type: "Point", coordinates: [46, 24], crs: { type: "name", properties: { name: "EPSG:3857" } } };
    expect(checkDatasetFeatures([{
      type: "Feature", properties: null, geometry,
    }])).toMatchObject({ ok: false, code: "GEOMETRY_CRS_NOT_SUPPORTED" });
  });
  it("reads a layer explicitly pinned to the currently published Map release instead of making it unavailable", async () => {
    const map = new FakeMapPort({ measureSpatial: measured() });
    const result = await runSpatialAnalysis(map, baseRequest({
      analyses: ["DENSITY"], parameters: { roles: ["place:neighbourhood"], radiiMeters: [500] },
      data: { roles: { "place:neighbourhood": { source: "MAP", layerKey: "places", releaseId: PUBLISHED_RELEASE_ID } } },
    }), options);
    expect(map.callsOf("describeMap")[0]?.request).toMatchObject({ layers: ["places"] });
    expect(map.callsOf("measureSpatial")).toHaveLength(1);
    expect(result.results[0]!.metrics.find((metric) => metric.key.endsWith("per_km2"))).toMatchObject({ status: "PARTIAL", value: 7.692308 });
  });
  it.each(["SAMPLE", "UNKNOWN"] as const)("keeps %s counts partial and density confidence no higher than LOW", async (completeness) => {
    const result = await advanced(new FakeMapPort({ measureSpatial: measured() }), source("poi:clinic", completeness));
    const metrics = result.results[0]!.metrics;
    expect(metrics).toHaveLength(7);
    expect(metrics.every((metric) => metric.status === "PARTIAL" && metric.confidence?.band !== "HIGH")).toBe(true);
    expect(metrics.find((metric) => metric.key.endsWith("per_km2"))?.value).toBe(7.692308);
    expect(metrics.find((metric) => metric.key.endsWith("cluster.largest"))?.value).toBe(5);
    expect(metrics.every((metric) => metric.method && metric.inputRefs[0] === `dc:${DC_VERSION_ID}`)).toBe(true);
  });
  it.each(["SAMPLE", "UNKNOWN"] as const)("does not replace an unconfirmed %s zero with a number", async (completeness) => {
    const result = await advanced(new FakeMapPort(), source("poi:clinic", completeness));
    expect(result.results[0]!.metrics.every((metric) => metric.value === null && metric.status === "NOT_COMPUTABLE")).toBe(true);
    expect(result.gaps.some((gap) => gap.code === "SPATIAL_MEASUREMENT_UNSUPPORTED")).toBe(true);
  });
  it("reports a confirmed zero only with inventory and full search coverage", async () => {
    const result = await advanced(new FakeMapPort(), source("poi:clinic", "INVENTORY"));
    expect(result.results[0]!.metrics.every((metric) => metric.value === 0 && metric.status === "COMPUTED")).toBe(true);
  });
  it("does not claim a zero when the inventory extent fails to cover the radius", async () => {
    const entry = source("poi:clinic", "INVENTORY");
    entry.input.coverage = { ...entry.input.coverage!, boundingBox: { west: 46.6752, east: 46.6754, south: 24.7135, north: 24.7137 } };
    const result = await advanced(new FakeMapPort(), entry);
    expect(result.results[0]!.metrics.every((metric) => metric.value === null)).toBe(true);
  });
  it("checks an exact pin against each target before calling expensive measurement", async () => {
    const map = new FakeMapPort();
    const result = await runSpatialAnalysis(map, baseRequest({
      analyses: ["PROXIMITY", "CATCHMENT", "DENSITY", "CONSTRAINT_SCREENING"],
      location: { type: "Point", coordinates: [48, 26] }, parameters: { roles: ["poi:clinic", "constraint:zone"], radiiMeters: [500], nearestCount: 1 },
      data: { roles: { "poi:clinic": { source: "DATA_CENTER", versionId: DC_VERSION_ID }, "constraint:zone": { source: "DATA_CENTER", versionId: DC_VERSION_ID } } },
    }), { ...options, dataCenterPort: new FakeDataCenterPort() }).catch((error: unknown) => {
      if (error && typeof error === "object" && "details" in error) throw new Error(JSON.stringify(error.details));
      throw error;
    });
    expect(result.results.flatMap((entry) => entry.metrics).every((metric) => metric.status === "NO_COVERAGE" && metric.value === null)).toBe(true);
    expect(map.callsOf("measureSpatial")).toHaveLength(0);
    expect(map.callsOf("measureDataset")).toHaveLength(0);
    expect(map.callsOf("nearest")).toHaveLength(0);
  });
  it.each([
    { valid: false }, { truncated: true }, { unrecognized: 1 },
  ])("fails closed for invalid/bounded/unknown feature data: %j", async (over) => {
    const result = await advanced(new FakeMapPort({ measureSpatial: measured(over) }));
    expect(result.results[0]!.metrics.every((metric) => metric.status === "NOT_COMPUTABLE" && metric.value === null)).toBe(true);
    expect(result.gaps.length).toBeGreaterThan(0);
  });
  it("counts non-point features but refuses grid and clustering instead of inventing centroids", async () => {
    const result = await advanced(new FakeMapPort({ measureSpatial: measured({ pointsOnly: false }) }));
    expect(result.results[0]!.metrics.filter((metric) => metric.key.includes(".grid.") || metric.key.includes(".cluster.")).every((metric) => metric.status === "NOT_COMPUTABLE")).toBe(true);
    expect(result.results[0]!.metrics.find((metric) => metric.key.endsWith(".count") && metric.key.includes(".r500."))?.value).toBe(6);
    expect(result.gaps.some((gap) => gap.code === "DENSITY_POINTS_REQUIRED")).toBe(true);
  });
  it("returns explicit missing constraints, not a clear-site verdict", async () => {
    const result = await runSpatialAnalysis(new FakeMapPort(), baseRequest({
      analyses: ["CONSTRAINT_SCREENING"], parameters: { roles: ["constraint:zone"], radiiMeters: [500] },
    }), options);
    expect(result.results[0]!.metrics).toHaveLength(5);
    expect(result.results[0]!.metrics.every((metric) => metric.status === "NOT_AVAILABLE" && metric.value === null)).toBe(true);
    expect(result.gaps.some((gap) => gap.code === "DATASET_NOT_AVAILABLE")).toBe(true);
  });
  it("reports spatial intersections, containment and overlap with no legal inference", async () => {
    const location: SpatialLocation = { type: "Polygon", coordinates: [[[46.67, 24.71], [46.68, 24.71], [46.68, 24.72], [46.67, 24.72], [46.67, 24.71]]] };
    const result = await runAdvancedAnalyses({
      port: new FakeMapPort({ measureSpatial: measured() }), targets: [{ id: "primary", location }], sources: [source("constraint:zone")],
      parameters: parameters(["constraint:zone"]), analyses: ["CONSTRAINT_SCREENING"], evaluatedAt: CLOCK,
    });
    expect(result.results[0]!.metrics.find((metric) => metric.key.endsWith("overlap_km2"))).toMatchObject({ value: 0.1, status: "PARTIAL" });
    expect(result.results[0]!.metrics.every((metric) => metric.limitations.some((text) => text.includes("not a legal")))).toBe(true);
  });
  it("bounds total metrics across sites and comparison derivatives before any backend call", async () => {
    const map = new FakeMapPort();
    await expect(runSpatialAnalysis(map, baseRequest({
      analyses: ["DENSITY", "SITE_COMPARISON"], parameters: { roles: ["poi:clinic"] },
      candidates: Array.from({ length: 20 }, (_, index) => ({ id: `site-${index}`, location: riyadh })),
    }), options)).rejects.toMatchObject({ code: "REQUEST_TOO_LARGE", details: { reason: "result_metric_limit" } });
    expect(map.calls).toHaveLength(0);
  });
  it("allows exactly 500 metrics and rejects a larger request at preparation, independently of the work budget", async () => {
    const roles = Array.from({ length: 20 }, (_, index) => `poi:kind${index}`);
    const request = baseRequest({
      analyses: ["CATCHMENT"], parameters: { roles, radiiMeters: [100, 500, 1000, 3000, 5000] },
      candidates: Array.from({ length: 4 }, (_, index) => ({ id: `site${index}`, location: riyadh })),
    });
    const result = await runSpatialAnalysis(new FakeMapPort(), request, options);
    expect(result.results.flatMap((entry) => entry.metrics)).toHaveLength(500);
    const rejected = new FakeMapPort();
    await expect(runSpatialAnalysis(rejected, {
      ...request, parameters: { ...request.parameters, roles: [...roles, "poi:extra"] },
    }, options)).rejects.toMatchObject({ code: "REQUEST_TOO_LARGE", details: { reason: "result_metric_limit" } });
    expect(rejected.calls).toEqual([]);
    const exact501 = new FakeMapPort();
    await expect(runSpatialAnalysis(exact501, baseRequest({
      analyses: ["DENSITY", "CONSTRAINT_SCREENING"],
      parameters: {
        roles: [...Array.from({ length: 21 }, (_, index) => `poi:kind${index}`), ...Array.from({ length: 5 }, (_, index) => `constraint:kind${index}`)],
        radiiMeters: [100, 500, 1000, 3000, 5000, 10000, 25000, 50000],
      },
    }), options)).rejects.toMatchObject({ code: "REQUEST_TOO_LARGE", details: { requested: 501, maximum: 500 } });
    expect(exact501.calls).toEqual([]);
  });
  it("compares twenty candidates with common parameters/data and deterministic tie breaks", async () => {
    const map = new FakeMapPort({ measureSpatial: measured() });
    const request = baseRequest({
      analyses: ["DENSITY", "SITE_COMPARISON"], parameters: { roles: ["poi:clinic"], radiiMeters: [500] },
      candidates: Array.from({ length: 20 }, (_, index) => ({ id: `s${index.toString().padStart(2, "0")}`, location: riyadh })),
      data: { roles: { "poi:clinic": { source: "DATA_CENTER", versionId: DC_VERSION_ID } } },
    });
    const result = await runSpatialAnalysis(map, request, { ...options, dataCenterPort: new FakeDataCenterPort() });
    expect(result.results.filter((entry) => entry.analysis === "SITE_COMPARISON")).toHaveLength(21);
    expect(result.results.flatMap((entry) => entry.metrics)).toHaveLength(441);
    const comparison = result.results.find((entry) => entry.analysis === "SITE_COMPARISON" && entry.target === "primary")!;
    expect(comparison.metrics.find((metric) => metric.key.endsWith("per_km2.rank"))?.value).toBe(1);
    expect(comparison.metrics.find((metric) => metric.key.endsWith("per_km2.normalized"))?.value).toBe(0.5);
    const replay = await runSpatialAnalysis(new FakeMapPort({ measureSpatial: measured() }), request, { ...options, dataCenterPort: new FakeDataCenterPort() });
    expect(replay.determinism).toEqual(result.determinism);
    expect(map.callsOf("measureSpatial").every((call) => JSON.stringify(call.request).includes('"radiiMeters":[500]'))).toBe(true);
    expectNoVerdictsAndNoPercentages(result);
  });
  it("rejects candidate 21 at the contract boundary", async () => {
    await expect(runSpatialAnalysis(new FakeMapPort(), baseRequest({
      analyses: ["DENSITY", "SITE_COMPARISON"], parameters: { roles: ["poi:clinic"], radiiMeters: [500] },
      candidates: Array.from({ length: 21 }, (_, index) => ({ id: `s${index}`, location: riyadh })),
    }), options)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("does not rank a metric when one site is outside the shared source coverage", async () => {
    const result = await runSpatialAnalysis(new FakeMapPort({ measureSpatial: measured() }), baseRequest({
      analyses: ["DENSITY", "SITE_COMPARISON"], parameters: { roles: ["poi:clinic"], radiiMeters: [500] },
      candidates: [{ id: "outside", location: { type: "Point", coordinates: [48, 26] } }],
      data: { roles: { "poi:clinic": { source: "DATA_CENTER", versionId: DC_VERSION_ID } } },
    }), { ...options, dataCenterPort: new FakeDataCenterPort() });
    expect(result.results.filter((entry) => entry.analysis === "SITE_COMPARISON").flatMap((entry) => entry.metrics).every((metric) => metric.value === null)).toBe(true);
    expect(result.gaps.some((gap) => gap.code === "SITE_METRIC_NOT_COMPARABLE")).toBe(true);
  });
  it("min-max normalizes unequal values and preserves the input provenance", async () => {
    const data = await advanced(new FakeMapPort({ measureSpatial: measured() }));
    const first = data.results[0]!;
    const metric = first.metrics.find((entry) => entry.valueKind === "DENSITY")!;
    const result = compareSites([
      { analysis: "DENSITY", target: "a", metrics: [metric] },
      { analysis: "DENSITY", target: "b", metrics: [{ ...metric, value: 2 * Number(metric.value) }] },
    ], ["a", "b"]);
    expect(result.results[0]!.metrics.find((entry) => entry.key.endsWith("normalized"))?.value).toBe(0);
    expect(result.results[1]!.metrics.find((entry) => entry.key.endsWith("normalized"))?.value).toBe(1);
    expect(result.results[1]!.metrics.every((entry) => entry.inputRefs[0] === metric.inputRefs[0])).toBe(true);
  });
});
