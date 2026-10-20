import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUDGET_UNITS, DEFAULT_CLUSTER, DEFAULT_GRID, DEFAULT_MAX_SEARCH_METERS, DEFAULT_NEAREST_COUNT, DEFAULT_RADII_METERS, MAX_AOI_AREA_KM2, MAX_AOI_VERTICES, MAX_BUDGET_UNITS, MAX_CANDIDATES,
  MAX_NEAREST_COUNT, MAX_RADII, MAX_RADIUS_METERS, MIN_RADIUS_METERS, PRIMARY_TARGET_ID, SEARCH_LADDER_METERS, SPATIAL_ENGINE_KEY, SPATIAL_ENGINE_VERSION, SPATIAL_REQUEST_CONTRACT,
  SPATIAL_RESULT_CONTRACT, spatialAnalyses, spatialExclusions,
} from "@/services/analysis-engines/spatial/constants";
import {
  approxAreaKm2, boundingBoxOf, boxContainsPoint, countVertices, crossesAntimeridian, EARTH_RADIUS_KM, polygonsOf, ringAreaKm2, ringIsClosed, ringsOf, type AreaGeometry,
} from "@/services/analysis-engines/spatial/geometry-precheck";
import { square } from "./support/spatial-request-fixtures";

describe("Spatial Engine constants", () => {
  it("analyses by default at 500 m, 1 km, 3 km and 5 km, as decided by the owner", () => {
    expect([...DEFAULT_RADII_METERS]).toEqual([500, 1000, 3000, 5000]);
    expect([...DEFAULT_RADII_METERS]).not.toEqual([1000, 3000, 5000, 10_000]);
    expect(DEFAULT_RADII_METERS.every((radius) => radius >= MIN_RADIUS_METERS && radius <= MAX_RADIUS_METERS)).toBe(true);
    expect(DEFAULT_RADII_METERS.length).toBeLessThanOrEqual(MAX_RADII);
  });

  it("offers exactly the six v1 analyses and states what v1 leaves out", () => {
    expect([...spatialAnalyses]).toEqual(["LOCATION_CONTEXT", "PROXIMITY", "CATCHMENT", "DENSITY", "CONSTRAINT_SCREENING", "SITE_COMPARISON"]);
    expect([...spatialExclusions].sort()).toEqual(["AI_RECOMMENDATION", "BUSINESS_RECOMMENDATION", "DRIVING_DISTANCE", "GEOCODING", "ROUTE_TRAVEL_TIME", "TERRAIN"]);
    for (const analysis of spatialAnalyses) expect(spatialExclusions as readonly string[]).not.toContain(analysis);
  });

  it("keeps the search ladder ascending and within the maximum radius, with the default limit on it", () => {
    expect([...SEARCH_LADDER_METERS]).toEqual([...SEARCH_LADDER_METERS].sort((first, second) => first - second));
    expect(SEARCH_LADDER_METERS[SEARCH_LADDER_METERS.length - 1]).toBe(MAX_RADIUS_METERS);
    expect(SEARCH_LADDER_METERS as readonly number[]).toContain(DEFAULT_MAX_SEARCH_METERS);
    expect(DEFAULT_RADII_METERS.every((radius) => (SEARCH_LADDER_METERS as readonly number[]).includes(radius))).toBe(true);
  });

  it("bounds every dimension of a request and keeps the budget on the server", () => {
    expect({ MAX_CANDIDATES, MAX_AOI_VERTICES, MAX_AOI_AREA_KM2, MAX_NEAREST_COUNT, DEFAULT_NEAREST_COUNT, DEFAULT_BUDGET_UNITS, MAX_BUDGET_UNITS }).toEqual({
      MAX_CANDIDATES: 20, MAX_AOI_VERTICES: 2000, MAX_AOI_AREA_KM2: 250_000, MAX_NEAREST_COUNT: 20, DEFAULT_NEAREST_COUNT: 3, DEFAULT_BUDGET_UNITS: 1000, MAX_BUDGET_UNITS: 5000,
    });
    expect(DEFAULT_BUDGET_UNITS).toBeLessThanOrEqual(MAX_BUDGET_UNITS);
    expect(DEFAULT_CLUSTER).toEqual({ epsMeters: 500, minPoints: 5 });
    expect(DEFAULT_GRID).toEqual({ cellMeters: 500 });
  });

  it("names the engine and its contracts", () => {
    expect(SPATIAL_ENGINE_KEY).toBe("spatial");
    expect(SPATIAL_ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/);
    expect(SPATIAL_REQUEST_CONTRACT).toBe("jenan.spatial-analysis.request/v1");
    expect(SPATIAL_RESULT_CONTRACT).toBe("jenan.spatial-analysis.result/v1");
    expect(PRIMARY_TARGET_ID).toBe("primary");
  });
});

describe("geometry pre-checks", () => {
  const radians = Math.PI / 180;
  // A cell bounded by parallels and meridians has the exact area R² · Δλ · (sin φ2 − sin φ1).
  const cellArea = (south: number, north: number, widthDegrees: number) => EARTH_RADIUS_KM ** 2 * widthDegrees * radians * (Math.sin(north * radians) - Math.sin(south * radians));
  const polygon = (ring: Array<[number, number]>): AreaGeometry => ({ type: "Polygon", coordinates: [ring] });

  it("measures a one degree cell at the equator as about 12,364 km²", () => {
    const area = approxAreaKm2(polygon(square(0, 0, 1)));
    expect(area).toBeCloseTo(cellArea(0, 1, 1), 3);
    expect(area).toBeGreaterThan(12_360);
    expect(area).toBeLessThan(12_370);
  });

  it("measures a cell near Riyadh and a one-kilometre square to within one percent", () => {
    expect(approxAreaKm2(polygon(square(46.6, 24.7, 0.01)))).toBeCloseTo(cellArea(24.7, 24.71, 0.01), 5);
    const latitude = 24.7136;
    const height = 1 / 110.574;
    const width = 1 / (111.32 * Math.cos(latitude * radians));
    const ring: Array<[number, number]> = [[46.6753, latitude], [46.6753 + width, latitude], [46.6753 + width, latitude + height], [46.6753, latitude + height], [46.6753, latitude]];
    expect(approxAreaKm2(polygon(ring))).toBeGreaterThan(0.99);
    expect(approxAreaKm2(polygon(ring))).toBeLessThan(1.01);
  });

  it("shrinks with latitude, as a degree cell does", () => {
    expect(approxAreaKm2(polygon(square(0, 60, 1))) / approxAreaKm2(polygon(square(0, 0, 1)))).toBeCloseTo(0.5, 1);
  });

  it("does not depend on ring direction or hemisphere", () => {
    const ring = square(10, 10, 1);
    expect(approxAreaKm2(polygon([...ring].reverse()))).toBe(approxAreaKm2(polygon(ring)));
    expect(approxAreaKm2(polygon(square(10, -11, 1)))).toBeCloseTo(approxAreaKm2(polygon(square(10, 10, 1))), 3);
  });

  it("subtracts holes and adds the parts of a multi-polygon", () => {
    const outer = square(0, 0, 2);
    const hole = square(0.5, 0.5, 1);
    const holed: AreaGeometry = { type: "Polygon", coordinates: [outer, hole] };
    expect(approxAreaKm2(holed)).toBeCloseTo(approxAreaKm2(polygon(outer)) - approxAreaKm2(polygon(hole)), 3);
    const parts: AreaGeometry = { type: "MultiPolygon", coordinates: [[square(0, 0, 1)], [square(5, 5, 1)]] };
    expect(approxAreaKm2(parts)).toBeCloseTo(approxAreaKm2(polygon(square(0, 0, 1))) + approxAreaKm2(polygon(square(5, 5, 1))), 3);
  });

  it("measures a degenerate ring as nothing and never returns a negative area", () => {
    expect(ringAreaKm2([[0, 0], [1, 0], [2, 0], [0, 0]])).toBe(0);
    expect(approxAreaKm2({ type: "Polygon", coordinates: [square(0, 0, 1), square(-1, -1, 5)] })).toBe(0);
    expect(approxAreaKm2({ type: "Polygon", coordinates: [] })).toBe(0);
  });

  it("counts positions across rings and parts", () => {
    expect(countVertices(polygon(square(0, 0, 1)))).toBe(5);
    expect(countVertices({ type: "Polygon", coordinates: [square(0, 0, 2), square(0.5, 0.5, 1)] })).toBe(10);
    expect(countVertices({ type: "MultiPolygon", coordinates: [[square(0, 0, 1)], [square(5, 5, 1), square(5.2, 5.2, 0.5)]] })).toBe(15);
    expect(ringsOf({ type: "MultiPolygon", coordinates: [[square(0, 0, 1)], [square(5, 5, 1)]] })).toHaveLength(2);
    expect(polygonsOf(polygon(square(0, 0, 1)))).toHaveLength(1);
  });

  it("recognizes closed rings", () => {
    expect(ringIsClosed(square(0, 0, 1))).toBe(true);
    expect(ringIsClosed(square(0, 0, 1).slice(0, 4))).toBe(false);
    expect(ringIsClosed([])).toBe(false);
  });

  it("detects an edge that crosses the antimeridian in any part", () => {
    expect(crossesAntimeridian(polygon([[179, 0], [-179, 0], [-179, 1], [179, 1], [179, 0]]))).toBe(true);
    expect(crossesAntimeridian(polygon(square(46, 24, 1)))).toBe(false);
    expect(crossesAntimeridian(polygon(square(-180, 0, 1)))).toBe(false);
    expect(crossesAntimeridian({ type: "MultiPolygon", coordinates: [[square(0, 0, 1)], [[[179, 0], [-179, 0], [-179, 1], [179, 0]]]] })).toBe(true);
  });

  it("computes bounding boxes and containment, inclusive of the edges", () => {
    expect(boundingBoxOf({ type: "Point", coordinates: [46.6, 24.7] })).toEqual({ west: 46.6, south: 24.7, east: 46.6, north: 24.7 });
    const box = boundingBoxOf({ type: "MultiPolygon", coordinates: [[square(0, 0, 1)], [square(5, 6, 2)]] });
    expect(box).toEqual({ west: 0, south: 0, east: 7, north: 8 });
    expect(boxContainsPoint(box, [0, 0])).toBe(true);
    expect(boxContainsPoint(box, [7, 8])).toBe(true);
    expect(boxContainsPoint(box, [7.0001, 8])).toBe(false);
    expect(boxContainsPoint(box, [3, -0.0001])).toBe(false);
  });
});
