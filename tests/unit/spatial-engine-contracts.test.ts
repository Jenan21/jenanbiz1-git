import { describe, expect, it } from "vitest";
import { MAX_AOI_VERTICES, MAX_CANDIDATES, SPATIAL_REQUEST_CONTRACT } from "@/services/analysis-engines/spatial/constants";
import { isConstraintRole, isFeatureRole, isPopulationRole, locationSchema, ROLE_PATTERN, roleNamespace, roleSchema, spatialRequestSchema } from "@/services/analysis-engines/spatial/contracts";
import { baseRequest, circleRing, riyadh, square } from "./support/spatial-request-fixtures";

const messages = (candidate: unknown) => {
  const result = spatialRequestSchema.safeParse(candidate);
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
};
const accepts = (candidate: unknown) => spatialRequestSchema.safeParse(candidate).success;
const polygon = (ring: Array<[number, number]>) => ({ type: "Polygon" as const, coordinates: [ring] });
const candidates = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `site-${index + 1}`, location: riyadh }));

describe("role grammar", () => {
  it.each(["poi:hospital", "place:locality", "road:major", "competitor:cafe", "constraint:protected_area", "population", "poi", "place", "constraint", "poi:school_2"])("accepts %s", (role) => {
    expect(roleSchema.safeParse(role).success).toBe(true);
    expect(ROLE_PATTERN.test(role)).toBe(true);
  });

  it.each(["admin:region", "admin:country", "POI:hospital", "population:total", "poi:", "poi:Hospital", "poi:hospital:x", ":hospital", "poi hospital", " poi:hospital", "", `poi:${"a".repeat(41)}`, "poi:1hospital", "unknown:thing"])("rejects %j", (role) => {
    expect(roleSchema.safeParse(role).success).toBe(false);
  });

  it("classifies roles by namespace", () => {
    expect(roleNamespace("poi:hospital")).toBe("poi");
    expect(roleNamespace("population")).toBe("population");
    expect(["place:locality", "poi:school", "road:major", "competitor:cafe"].every(isFeatureRole)).toBe(true);
    expect(isFeatureRole("constraint:flood")).toBe(false);
    expect(isFeatureRole("population")).toBe(false);
    expect(isConstraintRole("constraint:flood")).toBe(true);
    expect(isConstraintRole("poi:school")).toBe(false);
    expect(isPopulationRole("population")).toBe(true);
    expect(isPopulationRole("poi:population")).toBe(false);
  });
});

describe("locations", () => {
  it("accepts a point, a polygon with a hole and a multi-polygon", () => {
    expect(locationSchema.safeParse(riyadh).success).toBe(true);
    expect(locationSchema.safeParse({ type: "Polygon", coordinates: [square(46.6, 24.7, 0.1), square(46.62, 24.72, 0.02)] }).success).toBe(true);
    expect(locationSchema.safeParse({ type: "MultiPolygon", coordinates: [[square(46.6, 24.7, 0.05)], [square(46.8, 24.9, 0.05)]] }).success).toBe(true);
  });

  it.each([
    ["a longitude out of range", { type: "Point", coordinates: [181, 24] }],
    ["a latitude out of range", { type: "Point", coordinates: [46, 90.1] }],
    ["a position with an altitude", { type: "Point", coordinates: [46, 24, 600] }],
    ["a position that is not numeric", { type: "Point", coordinates: ["46", "24"] }],
    ["a missing coordinate", { type: "Point", coordinates: [46] }],
    ["an unsupported geometry type", { type: "LineString", coordinates: [[46, 24], [47, 25]] }],
    ["an extra member", { ...riyadh, crs: "EPSG:4326" }],
    ["a ring that is not closed", { type: "Polygon", coordinates: [square(46, 24, 1).slice(0, 4)] }],
    ["a ring with too few positions", { type: "Polygon", coordinates: [[[46, 24], [47, 24], [46, 24]]] }],
    ["an empty polygon", { type: "Polygon", coordinates: [] }],
    ["a ring that crosses the antimeridian", { type: "Polygon", coordinates: [[[179, 0], [-179, 0], [-179, 1], [179, 1], [179, 0]]] }],
    ["an area with no extent", { type: "Polygon", coordinates: [[[46, 24], [47, 24], [48, 24], [46, 24]]] }],
    ["an area above the ceiling", { type: "Polygon", coordinates: [square(0, 0, 5)] }],
    ["a ring with too many positions", { type: "Polygon", coordinates: [circleRing(46.67, 24.71, 0.05, MAX_AOI_VERTICES + 1)] }],
    ["too many positions across rings", { type: "Polygon", coordinates: [circleRing(46.67, 24.71, 0.05, 1500), circleRing(46.67, 24.71, 0.02, 1500)] }],
    ["too many rings", { type: "Polygon", coordinates: Array.from({ length: 101 }, (_, index) => square(46 + index * 0.001, 24, 0.0005)) }],
    ["an empty multi-polygon", { type: "MultiPolygon", coordinates: [] }],
    ["a non-finite coordinate", { type: "Point", coordinates: [Number.NaN, 24] }],
  ])("rejects %s", (_name, location) => {
    expect(locationSchema.safeParse(location).success).toBe(false);
  });

  it("accepts an area exactly at the vertex limit and one just below the area ceiling", () => {
    expect(locationSchema.safeParse({ type: "Polygon", coordinates: [circleRing(46.67, 24.71, 0.05, MAX_AOI_VERTICES)] }).success).toBe(true);
    expect(locationSchema.safeParse(polygon(square(0, 0, 4))).success).toBe(true);
  });

  it("explains why an area is refused", () => {
    const text = (location: unknown) => JSON.stringify(locationSchema.safeParse(location).error?.issues);
    expect(text(polygon(square(46, 24, 1).slice(0, 4)))).toContain("must be closed");
    expect(text(polygon([[179, 0], [-179, 0], [-179, 1], [179, 1], [179, 0]]))).toContain("antimeridian");
    expect(text(polygon(square(0, 0, 5)))).toContain("250000");
    expect(text(polygon([[46, 24], [47, 24], [48, 24], [46, 24]]))).toContain("no extent");
  });
});

describe("request", () => {
  it("accepts the smallest useful request", () => {
    expect(accepts(baseRequest())).toBe(true);
    expect(accepts({ contract: SPATIAL_REQUEST_CONTRACT, analyses: ["LOCATION_CONTEXT"], location: riyadh })).toBe(true);
  });

  it("accepts a request that uses every part of the contract", () => {
    expect(accepts({
      contract: SPATIAL_REQUEST_CONTRACT,
      analyses: ["LOCATION_CONTEXT", "PROXIMITY", "CATCHMENT", "DENSITY", "CONSTRAINT_SCREENING", "SITE_COMPARISON"],
      location: polygon(square(46.6, 24.7, 0.02)),
      candidates: [{ id: "site-a", location: riyadh }, { id: "site-b", location: { type: "Point", coordinates: [46.7, 24.8] } }],
      parameters: {
        radiiMeters: [500, 2500, 7500], roles: ["poi:hospital", "place:locality", "constraint:protected_area", "population"], nearestCount: 5, maxSearchMeters: 10_000,
        cluster: { epsMeters: 300, minPoints: 4 }, grid: { cellMeters: 250 },
      },
      data: { roles: { "poi:hospital": { source: "DATA_CENTER", versionId: "version-1" }, "place:locality": { source: "MAP", layerKey: "places", releaseId: "release-1" } } },
      mapLayerPolicy: "REGISTERED_ONLY",
      options: { requestId: "req-1", evaluatedAt: "2026-10-20T12:00:00.000Z" },
    })).toBe(true);
  });

  it("requires the contract id and at least one known analysis", () => {
    expect(accepts({ ...baseRequest(), contract: "jenan.spatial-analysis.request/v2" })).toBe(false);
    expect(accepts({ analyses: ["PROXIMITY"], location: riyadh, parameters: { roles: ["poi:hospital"] } })).toBe(false);
    expect(accepts(baseRequest({ analyses: [] }))).toBe(false);
    expect(accepts({ ...baseRequest(), analyses: ["ROUTE_TRAVEL_TIME"] })).toBe(false);
    expect(accepts({ ...baseRequest(), analyses: ["GEOCODING"] })).toBe(false);
  });

  it("refuses members it does not define, including anything that would link a request to a project or to the Map schema", () => {
    for (const extra of [{ projectId: "p1" }, { mapReleaseId: "r1" }, { budgetUnits: 1 }, { recommend: true }, { language: "ar" }]) expect(accepts({ ...baseRequest(), ...extra })).toBe(false);
    expect(accepts({ ...baseRequest(), parameters: { roles: ["poi:hospital"], budgetUnits: 5000 } })).toBe(false);
    expect(accepts({ ...baseRequest(), parameters: { roles: ["poi:hospital"], successProbability: 0.9 } })).toBe(false);
    expect(accepts({ ...baseRequest(), options: { requestId: "x", skipChecks: true } })).toBe(false);
  });

  describe("parameters", () => {
    const withParameters = (parameters: Record<string, unknown>) => baseRequest({ parameters: { roles: ["poi:hospital"], ...parameters } as never });

    it.each([[100, true], [99, false], [50_000, true], [50_001, false], [500.5, false], [0, false], [-500, false]])("radius %s is accepted: %s", (radius, accepted) => {
      expect(accepts(withParameters({ radiiMeters: [radius] }))).toBe(accepted);
    });

    it("allows 1 to 8 radii", () => {
      expect(accepts(withParameters({ radiiMeters: [] }))).toBe(false);
      expect(accepts(withParameters({ radiiMeters: [100, 200, 300, 400, 500, 600, 700, 800] }))).toBe(true);
      expect(accepts(withParameters({ radiiMeters: [100, 200, 300, 400, 500, 600, 700, 800, 900] }))).toBe(false);
    });

    it.each([[1, true], [20, true], [0, false], [21, false], [2.5, false]])("nearestCount %s is accepted: %s", (count, accepted) => {
      expect(accepts(withParameters({ nearestCount: count }))).toBe(accepted);
    });

    it("accepts a search limit only from the ladder", () => {
      for (const meters of [500, 1000, 3000, 5000, 10_000, 25_000, 50_000]) expect(accepts(withParameters({ maxSearchMeters: meters }))).toBe(true);
      for (const meters of [0, 499, 2000, 7500, 50_001, 100_000]) expect(accepts(withParameters({ maxSearchMeters: meters }))).toBe(false);
    });

    it("bounds clustering and the grid", () => {
      expect(accepts(withParameters({ cluster: { epsMeters: 50, minPoints: 2 } }))).toBe(true);
      expect(accepts(withParameters({ cluster: { epsMeters: 49, minPoints: 5 } }))).toBe(false);
      expect(accepts(withParameters({ cluster: { epsMeters: 5001, minPoints: 5 } }))).toBe(false);
      expect(accepts(withParameters({ cluster: { epsMeters: 500, minPoints: 1 } }))).toBe(false);
      expect(accepts(withParameters({ cluster: { epsMeters: 500 } }))).toBe(false);
      expect(accepts(withParameters({ grid: { cellMeters: 100 } }))).toBe(true);
      expect(accepts(withParameters({ grid: { cellMeters: 99 } }))).toBe(false);
      expect(accepts(withParameters({ grid: { cellMeters: 5001 } }))).toBe(false);
    });

    it("bounds the number of roles and rejects a malformed one", () => {
      const many = (count: number) => Array.from({ length: count }, (_, index) => `poi:kind_${index}`);
      expect(accepts(baseRequest({ parameters: { roles: many(32) } }))).toBe(true);
      expect(accepts(baseRequest({ parameters: { roles: many(33) } }))).toBe(false);
      expect(accepts(baseRequest({ parameters: { roles: ["admin:region"] } }))).toBe(false);
    });
  });

  describe("rules between analyses and parameters", () => {
    it("needs a feature role for proximity, catchment and density", () => {
      for (const analysis of ["PROXIMITY", "CATCHMENT", "DENSITY"] as const) {
        expect(accepts(baseRequest({ analyses: [analysis], parameters: {} }))).toBe(false);
        expect(accepts(baseRequest({ analyses: [analysis], parameters: { roles: ["constraint:flood"] } }))).toBe(false);
        expect(accepts(baseRequest({ analyses: [analysis], parameters: { roles: ["population"] } }))).toBe(false);
      }
      expect(messages(baseRequest({ analyses: ["DENSITY"], parameters: {} }))[0]).toContain("feature role");
      expect(accepts(baseRequest({ analyses: ["PROXIMITY"], parameters: { roles: ["road:major"] } }))).toBe(true);
    });

    it("needs a constraint role for constraint screening", () => {
      expect(accepts(baseRequest({ analyses: ["CONSTRAINT_SCREENING"], parameters: { roles: ["poi:hospital"] } }))).toBe(false);
      expect(accepts(baseRequest({ analyses: ["CONSTRAINT_SCREENING"], parameters: { roles: ["constraint:protected_area"] } }))).toBe(true);
    });

    it("lets only a catchment use the population role", () => {
      expect(accepts(baseRequest({ analyses: ["PROXIMITY"], parameters: { roles: ["poi:hospital", "population"] } }))).toBe(false);
      expect(accepts(baseRequest({ analyses: ["CATCHMENT"], parameters: { roles: ["poi:hospital", "population"] } }))).toBe(true);
    });

    it("needs candidates and another analysis for a site comparison", () => {
      expect(accepts(baseRequest({ analyses: ["PROXIMITY", "SITE_COMPARISON"] }))).toBe(false);
      expect(accepts(baseRequest({ analyses: ["SITE_COMPARISON"], candidates: candidates(1) }))).toBe(false);
      expect(accepts(baseRequest({ analyses: ["PROXIMITY", "SITE_COMPARISON"], candidates: candidates(1) }))).toBe(true);
    });

    it("keeps candidate ids unique, never `primary`, and at most 20", () => {
      expect(accepts(baseRequest({ candidates: [{ id: "a", location: riyadh }, { id: "a", location: riyadh }] }))).toBe(false);
      expect(accepts(baseRequest({ candidates: [{ id: "primary", location: riyadh }] }))).toBe(false);
      expect(accepts(baseRequest({ candidates: [{ id: "Site A", location: riyadh }] }))).toBe(false);
      expect(accepts(baseRequest({ candidates: candidates(MAX_CANDIDATES) }))).toBe(true);
      expect(accepts(baseRequest({ candidates: candidates(MAX_CANDIDATES + 1) }))).toBe(false);
    });

    it("lets a dataset be pinned only for a requested role, with a valid reference", () => {
      expect(accepts(baseRequest({ data: { roles: { "poi:hospital": { source: "DATA_CENTER", versionId: "v1" } } } }))).toBe(true);
      expect(accepts(baseRequest({ data: { roles: { "poi:school": { source: "DATA_CENTER", versionId: "v1" } } } }))).toBe(false);
      expect(accepts(baseRequest({ data: { roles: { "admin:region": { source: "MAP", layerKey: "regions" } } } }))).toBe(false);
      expect(accepts(baseRequest({ data: { roles: { "poi:hospital": { source: "SQL", query: "select 1" } } } as never }))).toBe(false);
      expect(accepts(baseRequest({ data: { roles: { "poi:hospital": { source: "DATA_CENTER" } } } as never }))).toBe(false);
    });
  });

  it("limits options to a correlation id and a UTC instant", () => {
    expect(accepts(baseRequest({ options: { requestId: "req_1:a-b.c" } }))).toBe(true);
    expect(accepts(baseRequest({ options: { requestId: "has space" } }))).toBe(false);
    expect(accepts(baseRequest({ options: { requestId: "x".repeat(129) } }))).toBe(false);
    expect(accepts(baseRequest({ options: { evaluatedAt: "2026-10-20T12:00:00+02:00" } }))).toBe(false);
    expect(accepts(baseRequest({ options: { evaluatedAt: "yesterday" } }))).toBe(false);
  });
});
