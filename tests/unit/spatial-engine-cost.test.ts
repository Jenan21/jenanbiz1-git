import { describe, expect, it } from "vitest";
import { costEstimateSchema, EngineError } from "@/services/analysis-engines/shared";
import { DEFAULT_BUDGET_UNITS, MAX_BUDGET_UNITS } from "@/services/analysis-engines/spatial/constants";
import { estimateSpatialCost, SPATIAL_COST_POLICY } from "@/services/analysis-engines/spatial/cost";
import { normalizeSpatialRequest } from "@/services/analysis-engines/spatial/normalize";
import { prepareSpatialRequest } from "@/services/analysis-engines/spatial/prepare";
import { baseRequest, circleRing, riyadh, square } from "./support/spatial-request-fixtures";

const clock = () => new Date("2026-10-20T12:00:00.000Z");
const normalized = (request: unknown) => normalizeSpatialRequest(request, { environment: "test", now: clock }).normalized;
const estimate = (request: unknown, budget?: number) => estimateSpatialCost(normalized(request), budget);
const total = (request: unknown) => estimate(request).units;
const lineMap = (request: unknown) => Object.fromEntries(estimate(request).lines.map((line) => [line.key, line.units]));

describe("spatial-cost-v1", () => {
  it("prices a typical request from the request alone and explains it line by line", () => {
    const typical = baseRequest({ analyses: ["LOCATION_CONTEXT", "PROXIMITY", "CATCHMENT", "DENSITY"], parameters: { roles: ["poi:hospital", "poi:school", "place:locality"] } });
    expect(estimate(typical)).toEqual({
      policyId: "spatial-cost-v1", policyVersion: "1.2.0", units: 31.371, budgetUnits: 1000,
      lines: [
        { key: "catchment.radii", units: 4 }, { key: "catchment.roles", units: 3 }, { key: "context", units: 3 }, { key: "context.place:locality", units: 2 },
        { key: "density.place:locality", units: 4.157 }, { key: "density.poi:hospital", units: 4.157 }, { key: "density.poi:school", units: 4.157 },
        { key: "proximity.place:locality", units: 2 }, { key: "proximity.place:locality.nearest", units: 0.3 },
        { key: "proximity.poi:hospital", units: 2 }, { key: "proximity.poi:hospital.nearest", units: 0.3 },
        { key: "proximity.poi:school", units: 2 }, { key: "proximity.poi:school.nearest", units: 0.3 },
      ],
    });
    expect(SPATIAL_COST_POLICY).toEqual({ id: "spatial-cost-v1", version: "1.2.0" });
  });

  it("returns a valid estimate whose units are the sum of its lines", () => {
    const result = estimate(baseRequest({ analyses: ["LOCATION_CONTEXT", "PROXIMITY", "CATCHMENT"], parameters: { roles: ["poi:hospital", "road:major"] } }));
    expect(costEstimateSchema.parse(result)).toEqual(result);
  });

  it("charges only for the analyses that were asked for", () => {
    expect(lineMap(baseRequest({ analyses: ["LOCATION_CONTEXT"], parameters: {} }))).toEqual({ context: 3 });
    expect(Object.keys(lineMap(baseRequest({ analyses: ["PROXIMITY"] }))).every((key) => key.startsWith("proximity."))).toBe(true);
  });

  describe("targets", () => {
    const context = (location: unknown) => lineMap({ ...baseRequest({ analyses: ["LOCATION_CONTEXT"], parameters: {} }), location }).context;

    it("charges an area more than a point, in proportion to its size", () => {
      expect(context(riyadh)).toBe(3);
      expect(context({ type: "Polygon", coordinates: [square(46.6, 24.7, 0.01)] })).toBe(6.03);
      expect(context({ type: "Polygon", coordinates: [circleRing(46.67, 24.71, 0.05, 2000)] })).toBe(18);
      expect(context({ type: "MultiPolygon", coordinates: [[square(46.6, 24.7, 0.01)], [square(46.8, 24.7, 0.01)]] })).toBe(6.06);
    });

    it("runs every analysis for every candidate and prices the comparison per target", () => {
      const request = baseRequest({ analyses: ["LOCATION_CONTEXT", "SITE_COMPARISON"], candidates: [{ id: "a", location: riyadh }, { id: "b", location: riyadh }] });
      expect(lineMap(request)).toEqual({ comparison: 0.6, context: 9 });
      expect(total(request)).toBe(9.6);
      const mixed = baseRequest({ analyses: ["LOCATION_CONTEXT"], candidates: [{ id: "a", location: { type: "Polygon", coordinates: [square(46.6, 24.7, 0.01)] } }] });
      expect(lineMap(mixed).context).toBe(9.03);
    });
  });

  describe("analyses", () => {
    it("prices proximity by the rings searched", () => {
      const proximity = (maxSearchMeters: number) => lineMap(baseRequest({ analyses: ["PROXIMITY"], parameters: { roles: ["poi:hospital"], maxSearchMeters } }))["proximity.poi:hospital"];
      expect([proximity(500), proximity(5000), proximity(10_000), proximity(50_000)]).toEqual([0.5, 2, 2.5, 3.5]);
    });

    it("prices a catchment by roles and radii, more for a radius above 10 km, and for a population", () => {
      expect(lineMap(baseRequest({ analyses: ["CATCHMENT"], parameters: { roles: ["poi:hospital"], radiiMeters: [20_000] } }))).toEqual({ "catchment.radii": 2, "catchment.roles": 1 });
      expect(lineMap(baseRequest({ analyses: ["CATCHMENT"], parameters: { roles: ["poi:hospital", "population"], radiiMeters: [500, 20_000] } }))).toEqual({ "catchment.population": 4, "catchment.radii": 3, "catchment.roles": 1 });
    });

    it("prices density by the number of grid cells, up to a ceiling", () => {
      const density = (radiiMeters: number[], cellMeters: number) => lineMap(baseRequest({ analyses: ["DENSITY"], parameters: { roles: ["poi:hospital"], radiiMeters, grid: { cellMeters } } }))["density.poi:hospital"];
      expect(density([500], 500)).toBe(4.002);
      expect(density([5000], 500)).toBe(4.157);
      expect(density([50_000], 100)).toBe(44);
    });

    it("prices constraint screening per constraint role", () => {
      expect(lineMap(baseRequest({ analyses: ["CONSTRAINT_SCREENING"], parameters: { roles: ["constraint:flood", "constraint:park", "poi:hospital"] } }))).toEqual({ "constraint.constraint:flood": 1.5, "constraint.constraint:park": 1.5 });
    });

    it("does not price what does not change the work", () => {
      const base = baseRequest({ analyses: ["PROXIMITY"], parameters: { roles: ["poi:hospital"] } });
      expect(total({ ...base, options: { requestId: "x" }, mapLayerPolicy: "REGISTERED_ONLY" })).toBe(total(base));
    });
  });

  describe("nearest features", () => {
    const proximity = (nearestCount: number, over: Record<string, unknown> = {}) =>
      baseRequest({ analyses: ["PROXIMITY"], parameters: { roles: ["poi:hospital"], nearestCount, ...over } as never });
    const nearestLine = (request: unknown, role = "poi:hospital") => lineMap(request)[`proximity.${role}.nearest`];

    it("costs more when more nearest features are requested: 20 is dearer than 1", () => {
      expect(total(proximity(20))).toBeGreaterThan(total(proximity(1)));
      expect([nearestLine(proximity(1)), nearestLine(proximity(3)), nearestLine(proximity(20))]).toEqual([0.1, 0.3, 2]);
      expect([total(proximity(1)), total(proximity(20))]).toEqual([2.1, 4]);
    });

    it("grows with every extra nearest feature, over the whole allowed range", () => {
      const totals = Array.from({ length: 20 }, (_, index) => total(proximity(index + 1)));
      for (let index = 1; index < totals.length; index += 1) expect(totals[index]).toBeGreaterThan(totals[index - 1] as number);
    });

    it("grows with the number of feature roles and with the number of targets", () => {
      expect(nearestLine(proximity(5, { roles: ["poi:hospital", "poi:school"] }), "poi:school")).toBe(0.5);
      expect(total(proximity(5, { roles: ["poi:hospital", "poi:school"] }))).toBeGreaterThan(total(proximity(5)));
      const withCandidates = baseRequest({ analyses: ["PROXIMITY"], parameters: { roles: ["poi:hospital"], nearestCount: 5 }, candidates: [{ id: "a", location: riyadh }, { id: "b", location: riyadh }] });
      expect(nearestLine(withCandidates)).toBe(1.5);
      expect(nearestLine({ ...proximity(5), location: { type: "Polygon", coordinates: [square(46.6, 24.7, 0.01)] } })).toBe(1.005);
    });

    it("is priced separately from the search rings, so each part of the cost is visible", () => {
      const lines = estimate(proximity(20, { maxSearchMeters: 10_000 })).lines;
      expect(lines).toEqual([{ key: "proximity.poi:hospital", units: 2.5 }, { key: "proximity.poi:hospital.nearest", units: 2 }]);
    });

    it("only prices roles that are searched for features, and only when proximity is asked for", () => {
      const withConstraint = lineMap(proximity(20, { roles: ["poi:hospital", "constraint:flood"] }));
      expect(Object.keys(withConstraint)).toEqual(["proximity.poi:hospital", "proximity.poi:hospital.nearest"]);
      for (const analysis of ["LOCATION_CONTEXT", "CATCHMENT", "DENSITY"] as const) {
        const request = (nearestCount: number) => baseRequest({ analyses: [analysis], parameters: { roles: ["poi:hospital"], nearestCount } });
        expect(total(request(20))).toBe(total(request(1)));
      }
    });

    it("stays within a valid estimate at the largest size of the request", () => {
      const roles = Array.from({ length: 32 }, (_, index) => `competitor:kind_${index}`);
      const result = estimate(baseRequest({ analyses: ["PROXIMITY"], parameters: { roles, nearestCount: 20 } }), 5000);
      expect(costEstimateSchema.parse(result)).toEqual(result);
      expect(result.lines).toHaveLength(64);
      expect(Math.max(...result.lines.map((line) => line.key.length))).toBeLessThanOrEqual(80);
    });
  });

  describe("place roles in LOCATION_CONTEXT", () => {
    const context = (over: Record<string, unknown> = {}, request: Record<string, unknown> = {}) =>
      baseRequest({ analyses: ["LOCATION_CONTEXT"], parameters: { roles: ["place:locality"], ...over } as never, ...request } as never);
    const line = (request: unknown, role = "place:locality") => lineMap(request)[`context.${role}`];

    it("prices the nearest-place search of each place role by the rings it may search", () => {
      expect([line(context({ maxSearchMeters: 500 })), line(context()), line(context({ maxSearchMeters: 10_000 })), line(context({ maxSearchMeters: 50_000 }))]).toEqual([0.5, 2, 2.5, 3.5]);
      expect(lineMap(context())).toEqual({ context: 3, "context.place:locality": 2 });
    });

    it("grows with every place role and with every target, and an area counts for more than a point", () => {
      const roles = ["place:locality", "place:neighbourhood", "place"];
      expect(total(context({ roles }))).toBeGreaterThan(total(context({ roles: roles.slice(0, 2) })));
      expect(lineMap(context({ roles }))).toEqual({ context: 3, "context.place": 2, "context.place:locality": 2, "context.place:neighbourhood": 2 });
      expect(line(context({}, { candidates: [{ id: "a", location: riyadh }, { id: "b", location: riyadh }] }))).toBe(6);
      expect(line({ ...context(), location: { type: "Polygon", coordinates: [square(46.6, 24.7, 0.01)] } })).toBe(4.02);
    });

    it("prices only place roles: other feature roles belong to PROXIMITY and constraint roles are not read here", () => {
      const lines = lineMap(context({ roles: ["place:locality", "poi:hospital", "road:major", "competitor:cafe", "constraint:flood"] }));
      expect(Object.keys(lines).sort()).toEqual(["context", "context.place:locality"]);
    });

    it("prices nothing for a role when LOCATION_CONTEXT is not asked for, and does not charge twice when PROXIMITY searches the same role", () => {
      expect(lineMap(baseRequest({ analyses: ["PROXIMITY"], parameters: { roles: ["place:locality"] } }))).not.toHaveProperty("context.place:locality");
      const both = lineMap(baseRequest({ analyses: ["LOCATION_CONTEXT", "PROXIMITY"], parameters: { roles: ["place:locality"] } }));
      expect(both["context.place:locality"]).toBe(2);
      expect(both["proximity.place:locality"]).toBe(2);
    });

    it("stays a valid estimate at the largest size of the request", () => {
      const roles = Array.from({ length: 32 }, (_, index) => `place:kind_${index}`);
      const result = estimate(baseRequest({ analyses: ["LOCATION_CONTEXT"], parameters: { roles, maxSearchMeters: 50_000 } }), 5000);
      expect(costEstimateSchema.parse(result)).toEqual(result);
      expect(result.lines).toHaveLength(33);
      expect(Math.max(...result.lines.map((entry) => entry.key.length))).toBeLessThanOrEqual(80);
    });
  });

  it("does not depend on the order in which the request was written", () => {
    const one = baseRequest({ analyses: ["CATCHMENT", "PROXIMITY"], parameters: { roles: ["poi:school", "poi:hospital"], radiiMeters: [3000, 500] } });
    const two = baseRequest({ analyses: ["PROXIMITY", "CATCHMENT"], parameters: { roles: ["poi:hospital", "poi:school"], radiiMeters: [500, 3000] } });
    expect(estimate(one)).toEqual(estimate(two));
  });

  it("takes the budget from the server and refuses a budget outside what the server allows", () => {
    expect(estimate(baseRequest()).budgetUnits).toBe(DEFAULT_BUDGET_UNITS);
    expect(estimate(baseRequest(), 250).budgetUnits).toBe(250);
    expect(estimate(baseRequest(), MAX_BUDGET_UNITS).budgetUnits).toBe(MAX_BUDGET_UNITS);
    for (const budget of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, MAX_BUDGET_UNITS + 1]) expect(() => estimate(baseRequest(), budget)).toThrow(RangeError);
  });
});

describe("prepareSpatialRequest", () => {
  const options = { environment: "test" as const, now: clock };
  const typical = baseRequest({ analyses: ["LOCATION_CONTEXT", "PROXIMITY", "CATCHMENT", "DENSITY"], parameters: { roles: ["poi:hospital", "poi:school", "place:locality"] } });
  const heavy = baseRequest({
    analyses: ["LOCATION_CONTEXT", "PROXIMITY", "CATCHMENT", "DENSITY", "SITE_COMPARISON"],
    location: { type: "Polygon", coordinates: [circleRing(46.67, 24.71, 0.05, 2000)] },
    candidates: Array.from({ length: 20 }, (_, index) => ({ id: `site-${index}`, location: { type: "Polygon" as const, coordinates: [circleRing(46.5 + index * 0.01, 24.6, 0.004, 100)] } })),
    parameters: { roles: Array.from({ length: 10 }, (_, index) => `poi:kind_${index}`) },
  });
  const failure = (action: () => unknown) => { try { action(); } catch (error) { return error as EngineError; } return null; };

  it("returns the normalized request together with its estimated cost", () => {
    const prepared = prepareSpatialRequest(typical, options);
    expect(prepared.cost).toEqual(estimate(typical));
    expect(prepared.normalized.parameters.radiiMeters).toEqual([500, 1000, 3000, 5000]);
    expect(prepared.evaluatedAt).toBe("2026-10-20T12:00:00.000Z");
    expect(prepared.mapLayerPolicy).toBe("ALLOW_UNREGISTERED");
  });

  it("refuses a request whose estimate is above the budget, saying by how much", () => {
    const error = failure(() => prepareSpatialRequest(heavy, options));
    expect(error).toBeInstanceOf(EngineError);
    expect(error).toMatchObject({ code: "REQUEST_TOO_LARGE", status: 422, details: { budgetUnits: 1000 } });
    expect(Number(error?.details.units)).toBeGreaterThan(1000);
  });

  it("accepts a request exactly at the budget and refuses it one thousandth above", () => {
    expect(prepareSpatialRequest(typical, { ...options, budgetUnits: 31.371 }).cost.units).toBe(31.371);
    expect(failure(() => prepareSpatialRequest(typical, { ...options, budgetUnits: 31.37 }))).toMatchObject({ code: "REQUEST_TOO_LARGE" });
  });

  it("accepts the same heavy request when the server allows a larger budget", () => {
    expect(prepareSpatialRequest(heavy, { ...options, budgetUnits: MAX_BUDGET_UNITS }).cost.units).toBeGreaterThan(1000);
  });

  it("rejects an invalid request or a forbidden policy before it prices anything", () => {
    expect(failure(() => prepareSpatialRequest({ nope: true }, options))).toMatchObject({ code: "INVALID_INPUT" });
    expect(failure(() => prepareSpatialRequest(baseRequest({ mapLayerPolicy: "ALLOW_UNREGISTERED" }), { ...options, environment: "production" }))).toMatchObject({ code: "MAP_LAYER_POLICY_VIOLATION" });
  });
});
