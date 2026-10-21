import { describe, expect, it } from "vitest";
import { computeRequestHash, EngineError } from "@/services/analysis-engines/shared";
import { SPATIAL_REQUEST_CONTRACT } from "@/services/analysis-engines/spatial/constants";
import { normalizedSpatialRequestSchema } from "@/services/analysis-engines/spatial/contracts";
import { normalizeSpatialRequest } from "@/services/analysis-engines/spatial/normalize";
import { defaultMapLayerPolicy, governanceAllowedBy, resolveMapLayerPolicy } from "@/services/analysis-engines/spatial/policy";
import { baseRequest, riyadh, square } from "./support/spatial-request-fixtures";

const clock = () => new Date("2026-10-20T12:00:00.000Z");
const normalize = (input: unknown, environment: "production" | "development" | "test" = "test", extra: { allowEvaluatedAtOverride?: boolean } = {}) => normalizeSpatialRequest(input, { environment, now: clock, ...extra });
const requestHash = (result: ReturnType<typeof normalize>) => computeRequestHash({ normalized: result.normalized, defaultsApplied: result.defaultsApplied, mapLayerPolicy: result.mapLayerPolicy });
const failure = (action: () => unknown) => { try { action(); } catch (error) { return error as EngineError; } return null; };

describe("defaults", () => {
  it("fills in the owner's radii (500 m, 1 km, 3 km, 5 km) and the other defaults, and says what it filled in", () => {
    const result = normalize(baseRequest());
    expect(result.normalized.parameters).toEqual({
      radiiMeters: [500, 1000, 3000, 5000], roles: ["poi:hospital"], nearestCount: 3, maxSearchMeters: 5000, cluster: { epsMeters: 500, minPoints: 5 }, grid: { cellMeters: 500 },
    });
    expect(result.normalized.candidates).toEqual([]);
    expect(result.normalized.data).toEqual({ roles: {} });
    expect(result.defaultsApplied).toEqual(["mapLayerPolicy", "parameters.cluster", "parameters.grid", "parameters.maxSearchMeters", "parameters.nearestCount", "parameters.radiiMeters"]);
    expect(result.requestId).toBeNull();
    expect(result.evaluatedAt).toBe("2026-10-20T12:00:00.000Z");
  });

  it("lists nothing as defaulted when everything was stated", () => {
    const result = normalize({
      ...baseRequest(),
      parameters: { radiiMeters: [500, 1000, 3000, 5000], roles: ["poi:hospital"], nearestCount: 3, maxSearchMeters: 5000, cluster: { epsMeters: 500, minPoints: 5 }, grid: { cellMeters: 500 } },
      mapLayerPolicy: "ALLOW_UNREGISTERED",
    });
    expect(result.defaultsApplied).toEqual([]);
  });

  it("gives an explicit default and an omitted one the same analysis and the same hash", () => {
    const omitted = normalize(baseRequest());
    const explicit = normalize(baseRequest({
      parameters: { roles: ["poi:hospital"], radiiMeters: [500, 1000, 3000, 5000], nearestCount: 3, maxSearchMeters: 5000, cluster: { epsMeters: 500, minPoints: 5 }, grid: { cellMeters: 500 } }, mapLayerPolicy: "ALLOW_UNREGISTERED",
    }));
    expect(explicit.normalized).toEqual(omitted.normalized);
    expect(explicit.defaultsApplied).not.toEqual(omitted.defaultsApplied);
    expect(requestHash(explicit)).toBe(requestHash(omitted));
  });

  it("supports any other radius on explicit request, up to the maximum", () => {
    expect(normalize(baseRequest({ parameters: { roles: ["poi:hospital"], radiiMeters: [250, 10_000, 50_000] } })).normalized.parameters.radiiMeters).toEqual([250, 10_000, 50_000]);
  });
});

describe("canonical form", () => {
  it("sorts and de-duplicates radii, roles and analyses, and orders candidates by id", () => {
    const result = normalize({
      contract: SPATIAL_REQUEST_CONTRACT, analyses: ["CATCHMENT", "PROXIMITY", "LOCATION_CONTEXT", "PROXIMITY"], location: riyadh,
      candidates: [{ id: "site-b", location: riyadh }, { id: "site-a", location: riyadh }],
      parameters: { radiiMeters: [3000, 500, 3000, 1000], roles: ["poi:school", "place:locality", "poi:hospital", "poi:school"] },
    });
    expect(result.normalized.analyses).toEqual(["LOCATION_CONTEXT", "PROXIMITY", "CATCHMENT"]);
    expect(result.normalized.parameters.radiiMeters).toEqual([500, 1000, 3000]);
    expect(result.normalized.parameters.roles).toEqual(["place:locality", "poi:hospital", "poi:school"]);
    expect(result.normalized.candidates.map((candidate) => candidate.id)).toEqual(["site-a", "site-b"]);
  });

  it("gives equivalent requests the same hash and different analyses different hashes", () => {
    const one = normalize(baseRequest({ analyses: ["PROXIMITY", "CATCHMENT"], parameters: { roles: ["poi:school", "poi:hospital"], radiiMeters: [1000, 500] } }));
    const two = normalize(baseRequest({ analyses: ["CATCHMENT", "PROXIMITY"], parameters: { roles: ["poi:hospital", "poi:school"], radiiMeters: [500, 1000] } }));
    expect(requestHash(one)).toBe(requestHash(two));
    expect(requestHash(normalize(baseRequest({ analyses: ["PROXIMITY", "CATCHMENT"], parameters: { roles: ["poi:hospital", "poi:school"], radiiMeters: [500, 3000] } })))).not.toBe(requestHash(one));
    expect(requestHash(normalize(baseRequest({ location: { type: "Point", coordinates: [46.6754, 24.7136] } })))).not.toBe(requestHash(normalize(baseRequest())));
  });

  it("does not let the request id or the pinned instant change the analysis", () => {
    const plain = normalize(baseRequest());
    const tagged = normalize(baseRequest({ options: { requestId: "req-7" } }));
    expect(tagged.requestId).toBe("req-7");
    expect(requestHash(tagged)).toBe(requestHash(plain));
  });

  it("produces a form that is itself a valid request and normalizes to itself", () => {
    const first = normalize(baseRequest({ analyses: ["PROXIMITY", "SITE_COMPARISON"], candidates: [{ id: "site-a", location: { type: "Polygon", coordinates: [square(46.6, 24.7, 0.01)] } }], data: { roles: { "poi:hospital": { source: "DATA_CENTER", versionId: "v1" } } } }));
    expect(normalizedSpatialRequestSchema.safeParse(first.normalized).success).toBe(true);
    const again = normalize(first.normalized);
    expect(again.normalized).toEqual(first.normalized);
    expect(again.defaultsApplied).toEqual(["mapLayerPolicy"]);
  });

  it("does not modify the request it was given", () => {
    const input = baseRequest({ analyses: ["PROXIMITY", "CATCHMENT"], parameters: { roles: ["poi:school", "poi:hospital"], radiiMeters: [1000, 500] } });
    const before = structuredClone(input);
    normalize(input);
    expect(input).toEqual(before);
  });
});

describe("Data Center selections", () => {
  const select = (selection: unknown, extra: Record<string, unknown> = {}) => baseRequest({ data: { roles: { "poi:hospital": selection } }, ...extra } as never);
  const selectionOf = (result: ReturnType<typeof normalize>) => result.normalized.data.roles["poi:hospital"];

  it("writes the instant a type is selected as of in one canonical form, so two spellings are the same request", () => {
    const short = normalize(select({ source: "DATA_CENTER", typeKey: "geojson", asOf: "2026-06-01T00:00:00Z" }));
    const long = normalize(select({ source: "DATA_CENTER", typeKey: "geojson", asOf: "2026-06-01T00:00:00.000000Z" }));
    expect(selectionOf(short)).toEqual({ source: "DATA_CENTER", typeKey: "geojson", asOf: "2026-06-01T00:00:00.000Z" });
    expect(selectionOf(long)).toEqual(selectionOf(short));
    expect(requestHash(long)).toBe(requestHash(short));
    expect(requestHash(normalize(select({ source: "DATA_CENTER", typeKey: "geojson", asOf: "2026-06-02T00:00:00Z" })))).not.toBe(requestHash(short));
  });

  it("keeps an exact version and a type without an instant as they were given, and tells them apart in the hash", () => {
    const exact = normalize(select({ source: "DATA_CENTER", versionId: "cmvgpaznv0081j0t6fpqxjtqv" }));
    const byType = normalize(select({ source: "DATA_CENTER", typeKey: "geojson" }));
    expect(selectionOf(exact)).toEqual({ source: "DATA_CENTER", versionId: "cmvgpaznv0081j0t6fpqxjtqv" });
    expect(selectionOf(byType)).toEqual({ source: "DATA_CENTER", typeKey: "geojson" });
    expect(requestHash(exact)).not.toBe(requestHash(byType));
    expect(requestHash(byType)).not.toBe(requestHash(normalize(select({ source: "DATA_CENTER", typeKey: "geojson", asOf: "2026-06-01T00:00:00Z" }))));
  });

  it("refuses an instant later than the evaluation instant, with the clock's own minute of tolerance", () => {
    const at = (asOf: string, extra: Record<string, unknown> = {}, allow = false) => normalize(select({ source: "DATA_CENTER", typeKey: "geojson", asOf }, extra), "test", { allowEvaluatedAtOverride: allow });
    expect(selectionOf(at("2026-10-20T12:00:00.000Z"))).toMatchObject({ asOf: "2026-10-20T12:00:00.000Z" });
    expect(selectionOf(at("2026-10-20T12:01:00.000Z"))).toMatchObject({ asOf: "2026-10-20T12:01:00.000Z" });
    const error = failure(() => at("2026-10-20T12:01:00.001Z"));
    expect(error).toMatchObject({ code: "INVALID_INPUT", status: 400 });
    expect(String((error?.details as { first?: string }).first)).toContain("data.roles.poi:hospital.asOf: cannot be later than the evaluation instant");
    // A replay that pins an earlier evaluation instant holds the selection to that instant, not to the clock.
    const pinned = { options: { evaluatedAt: "2026-06-01T00:00:00.000Z" } };
    expect(selectionOf(at("2026-06-01T00:00:00.000Z", pinned, true))).toMatchObject({ asOf: "2026-06-01T00:00:00.000Z" });
    expect(failure(() => at("2026-06-02T00:00:00.000Z", pinned, true))).toMatchObject({ code: "INVALID_INPUT" });
  });

  it("normalizes to itself", () => {
    const first = normalize(select({ source: "DATA_CENTER", typeKey: "geojson", asOf: "2026-06-01T00:00:00Z" }));
    expect(normalizedSpatialRequestSchema.safeParse(first.normalized).success).toBe(true);
    expect(normalize(first.normalized).normalized).toEqual(first.normalized);
  });

  it("does not modify the request it was given", () => {
    const input = select({ source: "DATA_CENTER", typeKey: "geojson", asOf: "2026-06-01T00:00:00Z" });
    const before = structuredClone(input);
    normalize(input);
    expect(input).toEqual(before);
  });
});

describe("map layer policy", () => {
  it("is registered-only in production and allows unregistered layers elsewhere, by default", () => {
    expect(defaultMapLayerPolicy("production")).toBe("REGISTERED_ONLY");
    expect(defaultMapLayerPolicy("development")).toBe("ALLOW_UNREGISTERED");
    expect(defaultMapLayerPolicy("test")).toBe("ALLOW_UNREGISTERED");
    expect(normalize(baseRequest(), "production").mapLayerPolicy).toBe("REGISTERED_ONLY");
    expect(normalize(baseRequest(), "development").mapLayerPolicy).toBe("ALLOW_UNREGISTERED");
    expect(normalize(baseRequest(), "test").mapLayerPolicy).toBe("ALLOW_UNREGISTERED");
  });

  it("lets a caller choose the stricter policy anywhere and refuses the looser one in production", () => {
    for (const environment of ["production", "development", "test"] as const) expect(resolveMapLayerPolicy(environment, "REGISTERED_ONLY")).toBe("REGISTERED_ONLY");
    expect(resolveMapLayerPolicy("development", "ALLOW_UNREGISTERED")).toBe("ALLOW_UNREGISTERED");
    const error = failure(() => normalize(baseRequest({ mapLayerPolicy: "ALLOW_UNREGISTERED" }), "production"));
    expect(error).toBeInstanceOf(EngineError);
    expect(error).toMatchObject({ code: "MAP_LAYER_POLICY_VIOLATION", status: 403, details: { requested: "ALLOW_UNREGISTERED", environment: "production" } });
  });

  it("allows an unregistered layer only under ALLOW_UNREGISTERED", () => {
    expect(governanceAllowedBy("ALLOW_UNREGISTERED", "MAP_UNREGISTERED")).toBe(true);
    expect(governanceAllowedBy("REGISTERED_ONLY", "MAP_UNREGISTERED")).toBe(false);
    for (const policy of ["REGISTERED_ONLY", "ALLOW_UNREGISTERED"] as const) {
      for (const governance of ["DC_PUBLISHED", "MAP_REGISTERED", "ENGINE_OUTPUT"] as const) expect(governanceAllowedBy(policy, governance)).toBe(true);
    }
  });

  it("records the policy that was applied, with the request hash depending on it", () => {
    const strict = normalize(baseRequest({ mapLayerPolicy: "REGISTERED_ONLY" }));
    const loose = normalize(baseRequest({ mapLayerPolicy: "ALLOW_UNREGISTERED" }));
    expect(requestHash(strict)).not.toBe(requestHash(loose));
  });
});

describe("evaluation instant", () => {
  it("uses the clock it is given and never the pinned instant by default", () => {
    expect(normalize(baseRequest()).evaluatedAt).toBe("2026-10-20T12:00:00.000Z");
    const error = failure(() => normalize(baseRequest({ options: { evaluatedAt: "2026-01-01T00:00:00.000Z" } })));
    expect(error).toMatchObject({ code: "INVALID_INPUT", status: 400 });
    expect(String(error?.details.first)).toContain("options.evaluatedAt");
  });

  it("lets a replay pin an earlier instant but never one in the future", () => {
    expect(normalize(baseRequest({ options: { evaluatedAt: "2026-01-01T00:00:00.000Z" } }), "test", { allowEvaluatedAtOverride: true }).evaluatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(normalize(baseRequest({ options: { evaluatedAt: "2026-10-20T12:00:59.000Z" } }), "test", { allowEvaluatedAtOverride: true }).evaluatedAt).toBe("2026-10-20T12:00:59.000Z");
    expect(failure(() => normalize(baseRequest({ options: { evaluatedAt: "2026-10-20T12:01:01.000Z" } }), "test", { allowEvaluatedAtOverride: true }))).toMatchObject({ code: "INVALID_INPUT" });
  });

  it("falls back to the system clock when none is injected", () => {
    const before = Date.now();
    const result = normalizeSpatialRequest(baseRequest(), { environment: "test" });
    expect(Date.parse(result.evaluatedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(result.evaluatedAt)).toBeLessThanOrEqual(Date.now());
  });
});

describe("invalid input", () => {
  it("fails with INVALID_INPUT, naming the first problem and counting them", () => {
    const error = failure(() => normalize({ ...baseRequest(), analyses: [], parameters: { radiiMeters: [5] } }));
    expect(error).toMatchObject({ code: "INVALID_INPUT", status: 400 });
    expect(error?.details.issues).toBeGreaterThanOrEqual(2);
    expect(typeof error?.details.first).toBe("string");
  });

  it.each([[null], [undefined], ["text"], [42], [[]], [{}]])("rejects %j as INVALID_INPUT", (input) => {
    expect(failure(() => normalize(input))).toMatchObject({ code: "INVALID_INPUT" });
  });

  it("reports the rule that was broken, with its path", () => {
    const error = failure(() => normalize(baseRequest({ analyses: ["CATCHMENT"], parameters: {} })));
    expect(String(error?.details.first)).toContain("parameters.roles");
  });

  it("keeps the details short even when the offending key was chosen by the caller", () => {
    const error = failure(() => normalize(baseRequest({ data: { roles: { [`poi:${"x".repeat(5000)}`]: { source: "DATA_CENTER", versionId: "v1" } } } })));
    expect(error).toMatchObject({ code: "INVALID_INPUT" });
    expect(String(error?.details.first).length).toBeLessThanOrEqual(300);
  });
});
