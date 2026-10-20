import { describe, expect, it } from "vitest";
import { EngineError } from "@/services/analysis-engines/shared";
import { runSpatialAnalysis } from "@/services/analysis-engines/spatial";
import type { MapDescription } from "@/services/analysis-engines/spatial/map-contract";
import { FakeDataCenterPort, DC_SHA, DC_VERSION_ID, emptyDiscovery, makeReference, okContent } from "./support/spatial-fake-dc-port";
import { osmProvenance, realDescription } from "./support/spatial-map-fixtures";
import { FakeMapPort, nearestPlace, nothingNearby } from "./support/spatial-fake-map-port";
import { CLOCK } from "./support/spatial-run";
import { baseRequest, riyadh } from "./support/spatial-request-fixtures";

const runOptions = { environment: "test" as const, clock: () => new Date(CLOCK), newRunId: () => "run-1" };
const readyPois = (): MapDescription => {
  const description = realDescription();
  return {
    ...description,
    layers: [
      ...description.layers,
      { id: "pois", provenance: osmProvenance, binding: { enabled: true, status: "ready", visibility: "public" }, hasFeatures: true },
    ],
  };
};

describe("Spatial M4 feature analyses", () => {
  it("runs Map-backed proximity without invoking LOCATION_CONTEXT", async () => {
    const map = new FakeMapPort({
      describeMap: ({ layers }) => {
        const description = readyPois();
        return { ...description, layers: layers.map((id) => description.layers.find((layer) => layer.id === id) ?? { id, provenance: null, binding: null, hasFeatures: false }) };
      },
      nearest: nearestPlace(),
    });
    const dataCenter = new FakeDataCenterPort();
    const result = await runSpatialAnalysis(map, baseRequest({
      analyses: ["PROXIMITY"], parameters: { roles: ["poi:hospital"], nearestCount: 1 },
    }), { ...runOptions, dataCenterPort: dataCenter });

    expect(result.results.map(({ analysis }) => analysis)).toEqual(["PROXIMITY"]);
    expect(result.results[0]?.metrics.map(({ key }) => key)).toEqual([
      "proximity.poi:hospital.n1.distance", "proximity.poi:hospital.n1.feature_ref", "proximity.poi:hospital.n1.name",
    ]);
    expect(map.callsOf("nearest")).toHaveLength(1);
    expect(map.callsOf("locate")).toEqual([]);
    expect(dataCenter.calls).toEqual([]);
    expect(result.inputs).toEqual(expect.arrayContaining([expect.objectContaining({ roles: ["poi:hospital"] })]));
  });

  it("does not present an empty nearest search as proof that no real-world feature exists", async () => {
    const map = new FakeMapPort({
      describeMap: ({ layers }) => {
        const description = readyPois();
        return { ...description, layers: layers.map((id) => description.layers.find((layer) => layer.id === id) ?? { id, provenance: null, binding: null, hasFeatures: false }) };
      },
      nearest: nothingNearby(),
    });
    const result = await runSpatialAnalysis(map, baseRequest({
      analyses: ["PROXIMITY"], parameters: { roles: ["poi:hospital"], nearestCount: 1 },
    }), runOptions);

    const distance = result.results[0]?.metrics.find(({ key }) => key.endsWith(".distance"));
    expect(distance).toMatchObject({ status: "NOT_FOUND_WITHIN_RADIUS" });
    expect(distance?.limitations[0]).toContain("not a complete real-world inventory");
  });

  it("uses a Data Center polygon for an explicitly labeled area-weighted population estimate", async () => {
    const populationFeature = {
      type: "Feature" as const,
      properties: { population: 1000 },
      geometry: {
        type: "Polygon" as const,
        coordinates: [[[46.6, 24.6], [46.8, 24.6], [46.8, 24.8], [46.6, 24.8], [46.6, 24.6]]],
      },
    };
    const dataCenter = new FakeDataCenterPort({
      readContent: ({ versionId }) => okContent(makeReference({ version: { versionId, checksum: DC_SHA } }), [populationFeature]),
    });
    const map = new FakeMapPort({
      measureDataset: ({ radiiMeters }) => ({
        valid: true, nearest: [], radii: radiiMeters.map((radiusMeters) => ({ radiusMeters, count: 0, populationEstimate: 400.3 })),
      }),
    });
    const result = await runSpatialAnalysis(map, baseRequest({
      analyses: ["CATCHMENT"], parameters: { roles: ["poi:clinic", "population"], radiiMeters: [500] },
      data: { roles: { population: { source: "DATA_CENTER", versionId: DC_VERSION_ID } } },
    }), { ...runOptions, dataCenterPort: dataCenter });

    const population = result.results[0]?.metrics.find(({ key }) => key === "catchment.r500.population");
    expect(population).toMatchObject({
      status: "ESTIMATED", value: 400, interpretation: "ESTIMATE",
      limitations: [expect.stringContaining("evenly distributed")],
    });
    expect(result.gaps.map(({ code }) => code)).toContain("POPULATION_AREA_WEIGHTED_ESTIMATE");
    expect(dataCenter.callsOf("discover")).toHaveLength(1);
    expect(map.callsOf("measureDataset")[0]?.request).toMatchObject({ includePopulation: true, location: riyadh });
    expect(map.callsOf("locate")).toEqual([]);
  });

  it("does not fall back to Map data when the selected Data Center dataset is unavailable", async () => {
    const dataCenter = new FakeDataCenterPort({
      discover: emptyDiscovery("NOT_AVAILABLE", { mode: "EXACT", policy: "exact-version", asOf: null }),
    });
    const map = new FakeMapPort();
    const result = await runSpatialAnalysis(map, baseRequest({
      analyses: ["PROXIMITY"], parameters: { roles: ["poi:hospital"], nearestCount: 1 },
      data: { roles: { "poi:hospital": { source: "DATA_CENTER", versionId: DC_VERSION_ID } } },
    }), { ...runOptions, dataCenterPort: dataCenter });

    expect(result.results[0]?.metrics.every(({ status }) => status === "NOT_AVAILABLE")).toBe(true);
    expect(result.gaps.map(({ code }) => code)).toContain("DATASET_NOT_AVAILABLE");
    expect(map.callsOf("nearest")).toEqual([]);
    expect(dataCenter.callsOf("readContent")).toEqual([]);
    expect(result.inputs).toEqual([]);
  });

  it("reports declared coverage gaps in both metrics and role availability", async () => {
    const dataCenter = new FakeDataCenterPort({
      readContent: ({ versionId }) => okContent(makeReference({
        version: { versionId },
        coverage: { crs: "WGS84", countryCodes: ["SA"], regionCodes: [], boundingBox: { west: 46, south: 24, east: 47, north: 25 } },
      })),
    });
    const map = new FakeMapPort({
      measureDataset: () => ({
        valid: true, nearest: [{ index: 0, id: null, name: "Hospital", distanceMeters: 100 }], radii: [{ radiusMeters: 500, count: 1, populationEstimate: null }],
      }),
    });
    const result = await runSpatialAnalysis(map, baseRequest({
      analyses: ["PROXIMITY", "CATCHMENT"], location: { type: "Point", coordinates: [48, 26] },
      parameters: { roles: ["poi:hospital"], nearestCount: 1, radiiMeters: [500] },
      data: { roles: { "poi:hospital": { source: "DATA_CENTER", versionId: DC_VERSION_ID } } },
    }), { ...runOptions, dataCenterPort: dataCenter });

    expect(result.results.flatMap(({ metrics }) => metrics).every(({ status, value }) => status === "NO_COVERAGE" && value === null)).toBe(true);
    expect(result.dataAvailability).toContainEqual({ role: "poi:hospital", status: "NO_COVERAGE", inputIds: [`dc:${DC_VERSION_ID}`] });
  });

  it("rejects a request that would exceed the result metric ceiling before reading a backend", async () => {
    const map = new FakeMapPort();
    const roles = Array.from({ length: 10 }, (_unused, index) => `poi:kind${index}`);
    const error = await runSpatialAnalysis(map, baseRequest({
      analyses: ["PROXIMITY"], parameters: { roles, nearestCount: 20 },
    }), { ...runOptions, budgetUnits: 5000 }).then(() => null, (thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(EngineError);
    expect(error).toMatchObject({ code: "REQUEST_TOO_LARGE", details: { reason: "result_metric_limit", maximum: 500, requested: 600 } });
    expect(map.calls).toEqual([]);
  });
});
