import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { EngineError } from "@/services/analysis-engines/shared";
import { runSpatialAnalysis, type RunSpatialOptions, type SpatialResult } from "@/services/analysis-engines/spatial";
import { buildReadOnlyRoleStatements, PostgisMapReader } from "@/services/analysis-engines/spatial/adapters";
import { findMapIndexProblems, parseMapFeatureRef, parseMapSourceId, sourceIdPattern } from "@/services/analysis-engines/spatial/map-contract";
import { contextRequest, expectNoVerdictsAndNoPercentages, gapCodes, gapsOf, metricsOf, statuses } from "../unit/support/spatial-run";
import { baseRequest } from "../unit/support/spatial-request-fixtures";
import { emptyDiscovery, FakeDataCenterPort } from "../unit/support/spatial-fake-dc-port";
import { copyDatabase, dropDatabase, dropRole, postgisTestsEnabled, realMapTemplate, scratchName, urlFor, withAdmin } from "./support/spatial-engine-db";
import { point, rect } from "./support/synthetic-map";

/**
 * Acceptance on the REAL Saudi release (the published release of the local Map database). The database is copied with the server's
 * template mechanism, so the original is never written; the engine runs in production mode through a read-only role of the copy.
 * The engine's answers are checked against SQL written independently in this file, on real points, so a mistake in the engine's own
 * queries cannot agree with itself.
 */
const CLOCK = "2026-10-20T12:00:00.000Z";
/** A failed run explains itself in the test report: the error code and the details the engine put on it, which are safe to print. */
const withDetails = (error: unknown) => (error instanceof EngineError ? new Error(`${error.code} ${JSON.stringify(error.details)}`) : error);
const databases: string[] = [];
const roles: string[] = [];
const readers: PostgisMapReader[] = [];
afterAll(async () => {
  await Promise.allSettled(readers.map((entry) => entry.close()));
  for (const name of databases) await dropDatabase(name).catch(() => undefined);
  for (const name of roles) await dropRole(name).catch(() => undefined);
}, 180_000);

const CITIES: Array<[string, number, number]> = [
  ["Riyadh", 46.6753, 24.7136], ["Jeddah", 39.1925, 21.4858], ["Makkah", 39.8579, 21.3891], ["Madinah", 39.6142, 24.5247], ["Dammam", 50.1033, 26.4207],
  ["Khobar", 50.2083, 26.2794], ["Tabuk", 36.5662, 28.3835], ["Abha", 42.5053, 18.2164], ["Buraydah", 43.975, 26.326], ["Hail", 41.6907, 27.5114],
  ["Najran", 44.1277, 17.4924], ["Jazan", 42.5511, 16.8892], ["AlUla", 37.9157, 26.6085], ["Arar", 41.0213, 30.9753], ["Sakaka", 40.2064, 29.9697],
  ["Yanbu", 38.0618, 24.0895], ["Taif", 40.4128, 21.2703], ["Hofuf", 49.5883, 25.3648], ["Khafji", 48.5009, 28.4167], ["Rafha", 43.4969, 29.6264],
];
const OUTSIDE: Array<[string, number, number]> = [
  ["Dubai", 55.2708, 25.2048], ["Manama", 50.586, 26.2235], ["Kuwait City", 47.9774, 29.3759], ["Cairo", 31.2357, 30.0444], ["the Gulf", 50.0, 27.6], ["the Red Sea", 37.0, 21.0],
];

describe.runIf(postgisTestsEnabled && realMapTemplate !== "")("LOCATION_CONTEXT on the real Saudi release", () => {
  let database = "";
  let adminUrl = "";
  let readOnlyUrl = "";
  let releaseId = "";
  let reference: Client;
  const timings: Record<string, number[]> = {};
  const examples: Record<string, unknown> = {};

  const engine = async (request: unknown, options: Partial<RunSpatialOptions> = {}) => {
    const reader = new PostgisMapReader({ connectionString: readOnlyUrl });
    try {
      return await runSpatialAnalysis(reader, request, { environment: "production", clock: () => new Date(CLOCK), newRunId: () => "run-real", ...options });
    } catch (error) {
      throw withDetails(error);
    } finally {
      await reader.close();
    }
  };
  /** A reader that stays open, for timing repeated runs on one pool. */
  const sharedEngine = () => {
    const reader = new PostgisMapReader({ connectionString: readOnlyUrl });
    readers.push(reader);
    return (request: unknown) => runSpatialAnalysis(reader, request, { environment: "production", clock: () => new Date(CLOCK), newRunId: () => "run-real" }).catch((error: unknown) => { throw withDetails(error); });
  };
  const timed = async (name: string, work: () => Promise<SpatialResult>) => {
    const started = performance.now();
    const result = await work();
    (timings[name] ??= []).push(Math.round(performance.now() - started));
    return result;
  };
  const summary = (result: SpatialResult) => Object.fromEntries(Object.entries(metricsOf(result)).map(([key, metric]) => [key, { status: metric.status, value: metric.value, band: metric.confidence?.band ?? null }]));

  beforeAll(async () => {
    database = await copyDatabase(realMapTemplate);
    databases.push(database);
    adminUrl = urlFor(database);
    const role = scratchName();
    roles.push(role);
    const secret = "Qm4_vT8.hD6~xN2-kR7wL9cB3";
    await withAdmin(async (client) => { for (const statement of buildReadOnlyRoleStatements({ role, password: secret, database })) await client.query(statement); }, database);
    readOnlyUrl = urlFor(database, { user: role, password: secret });
    reference = new Client({ connectionString: adminUrl });
    await reference.connect();
    await reference.query("SET default_transaction_read_only = on");
    releaseId = (await reference.query(`SELECT "publishedReleaseId"::text AS id FROM jenan_map.runtime WHERE id = 1`)).rows[0].id;
  }, 240_000);

  afterAll(async () => {
    await reference?.end().catch(() => undefined);
    if (process.env.SPATIAL_ENGINE_PERF_OUT) writeFileSync(process.env.SPATIAL_ENGINE_PERF_OUT, JSON.stringify({ timingsMs: timings, examples }, null, 1));
  });

  // ---------------------------------------------------------------------------------------------------- independent reference
  interface Reference {
    covered: boolean;
    regions: Array<{ label: string; edge: number }>;
    governorates: Array<{ label: string; edge: number }>;
    neighbourhood: { id: string; label: string; distance: number } | null;
  }
  async function referenceAt(longitude: number, latitude: number): Promise<Reference> {
    const here = `ST_SetSRID(ST_MakePoint($2::float8, $3::float8), 4326)`;
    const covered = (await reference.query(`SELECT ST_Within(${here}, b.geometry) OR ST_Intersects(${here}, b.geometry) AS covered FROM jenan_map.boundary b WHERE b."releaseId" = $1::uuid`, [releaseId, longitude, latitude])).rows[0].covered as boolean;
    const level = async (layer: string) => (await reference.query(
      `SELECT f.label, ST_Distance(ST_Boundary(f.geometry)::geography, ${here}::geography) AS edge FROM jenan_map.feature f
       WHERE f."releaseId" = $1::uuid AND f."layerId" = '${layer}' AND ST_Covers(f.geometry, ${here}) ORDER BY f.label COLLATE "C"`, [releaseId, longitude, latitude],
    )).rows.map((row: { label: string; edge: number }) => ({ label: row.label, edge: Number(row.edge) }));
    const near = (await reference.query(
      `SELECT f.id::text AS id, f.label, ST_Distance(f.geometry::geography, ${here}::geography) AS distance FROM jenan_map.feature f
       WHERE f."releaseId" = $1::uuid AND f."layerId" = 'places' AND f."sourceId" LIKE 'places:neighbourhood:%' ORDER BY distance, f.id LIMIT 1`, [releaseId, longitude, latitude],
    )).rows[0] as { id: string; label: string; distance: number } | undefined;
    return { covered, regions: await level("regions"), governorates: await level("governorates"), neighbourhood: near ? { id: near.id, label: near.label, distance: Number(near.distance) } : null };
  }
  const close = (actual: unknown, expected: number) => { expect(typeof actual).toBe("number"); expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(0.06); };

  function expectAgrees(name: string, result: SpatialResult, expected: Reference) {
    const m = metricsOf(result);
    expect(m["context.within_boundary"], `${name} within_boundary`).toMatchObject({ status: "COMPUTED", value: expected.covered });
    for (const [layer, key, rows] of [["regions", "context.region", expected.regions], ["governorates", "context.governorate", expected.governorates]] as const) {
      const label = `${name} ${layer}`;
      if (!expected.covered) { expect(m[key], label).toMatchObject({ status: "NO_COVERAGE", value: null }); continue; }
      if (rows.length === 1) {
        expect(m[key], label).toMatchObject({ status: "COMPUTED", value: rows[0]?.label });
        close(m[`${key}.boundary_distance`]?.value, rows[0]?.edge as number);
      } else if (rows.length === 0) expect(m[key], label).toMatchObject({ status: "NOT_FOUND_WITHIN_RADIUS", value: null });
      else {
        expect(m[key], label).toMatchObject({ status: "NOT_COMPUTABLE", value: null });
        expect(m[`${key}.intersecting_units`]?.value, label).toBe(rows.map((row) => row.label).join(" | "));
      }
    }
    const place = m["context.place:neighbourhood.nearest.distance"];
    if (!expected.covered) expect(place, `${name} place`).toMatchObject({ status: "NO_COVERAGE", value: null });
    else if (expected.neighbourhood !== null && expected.neighbourhood.distance <= 5000) {
      expect(place, `${name} place`).toMatchObject({ status: "COMPUTED" });
      close(place?.value, expected.neighbourhood.distance);
      expect(m["context.place:neighbourhood.nearest.name"]?.value, `${name} place name`).toBe(expected.neighbourhood.label);
      expect(m["context.place:neighbourhood.nearest.feature_ref"]?.value, `${name} place reference`).toBe(`map:${releaseId}:feature:${expected.neighbourhood.id}`);
    } else expect(place, `${name} place`).toMatchObject({ status: "NOT_FOUND_WITHIN_RADIUS", value: null });
  }

  it("accepts Riyadh PROXIMITY and 500 m / 1 km / 3 km / 5 km CATCHMENT against independent SQL, and reports unavailable population honestly", async () => {
    const longitude = 46.6753;
    const latitude = 24.7136;
    const radii = [500, 1000, 3000, 5000];
    const poiPattern = sourceIdPattern("pois", "hospital");
    const here = "ST_SetSRID(ST_MakePoint($3::float8, $4::float8), 4326)::geography";
    const expectedCounts = (await reference.query(
      `SELECT r.radius_meters, count(f.id)::int AS count
       FROM unnest($5::int[]) AS r(radius_meters)
       LEFT JOIN jenan_map.feature f ON f."releaseId" = $1::uuid AND f."layerId" = 'pois'
         AND f."sourceId" ~ $2 AND ST_DWithin(f.geometry::geography, ${here}, r.radius_meters)
       GROUP BY r.radius_meters ORDER BY r.radius_meters`,
      [releaseId, poiPattern, longitude, latitude, radii],
    )).rows as Array<{ radius_meters: number; count: number }>;
    const expectedNearest = (await reference.query(
      `SELECT f.id::text AS id, f.label, ST_Distance(f.geometry::geography, ${here}) AS distance
       FROM jenan_map.feature f
       WHERE f."releaseId" = $1::uuid AND f."layerId" = 'pois' AND f."sourceId" ~ $2
         AND ST_DWithin(f.geometry::geography, ${here}, 5000)
       ORDER BY distance, f.id LIMIT 1`,
      [releaseId, poiPattern, longitude, latitude],
    )).rows[0] as { id: string; label: string; distance: number } | undefined;

    const request = baseRequest({
      analyses: ["PROXIMITY", "CATCHMENT"], location: point(longitude, latitude),
      parameters: { roles: ["poi:hospital"], radiiMeters: radii, nearestCount: 3 },
    });
    const result = await timed("m4.riyadh.proximity-catchment", () => engine(request));
    const m = Object.fromEntries(result.results.flatMap((entry) => entry.metrics.map((metric) => [metric.key, metric])));
    expect(result.status).toBe("COMPLETED_WITH_GAPS");
    expect(result.dataAvailability).toContainEqual(expect.objectContaining({ role: "poi:hospital", status: "AVAILABLE" }));
    expect(expectedNearest).toBeDefined();
    const nearest = expectedNearest as { id: string; label: string; distance: number };
    expect(nearest.label).toBe("مركز الرثوية الطبي");
    close(m["proximity.poi:hospital.n1.distance"]?.value, Number(nearest.distance));
    expect(m["proximity.poi:hospital.n1.name"]?.value).toBe(nearest.label);
    expect(m["proximity.poi:hospital.n1.feature_ref"]?.value).toBe(`map:${releaseId}:feature:${nearest.id}`);
    expect(parseMapFeatureRef(String(m["proximity.poi:hospital.n1.feature_ref"]?.value))).toEqual({ releaseId, featureId: nearest.id });
    expect(["LOW", "MEDIUM"]).toContain(m["proximity.poi:hospital.n1.distance"]?.confidence?.band);
    expect(m["proximity.poi:hospital.n1.distance"]?.limitations.join(" ")).toMatch(/straight-line|mapped|inventory/i);

    for (const { radius_meters: radius, count } of expectedCounts) {
      const metric = m[`catchment.r${radius}.count.poi:hospital`];
      expect(metric, `${radius} m count; available metrics: ${Object.keys(m).join(", ")}`).toBeDefined();
      if (count === 0) expect(metric).toMatchObject({ status: "NOT_FOUND_WITHIN_RADIUS", value: null });
      else expect(metric).toMatchObject({ status: "COMPUTED", value: count });
    }
    expect(m["catchment.r500.count.poi:hospital"]?.value).not.toBe(0);

    const poiInput = result.inputs.find((input) => input.id === `map:${releaseId}:pois`);
    if (poiInput === undefined) throw new Error("The real POI Map input was not included in the result.");
    expect(poiInput).toMatchObject({
      kind: "MAP_LAYER", governance: "MAP_REGISTERED", ref: { system: "JENAN_MAP", id: `${releaseId}/pois` },
      source: { name: expect.any(String), organization: expect.any(String), url: expect.stringMatching(/^https?:\/\//) },
      quality: { status: "UNAVAILABLE" }, completeness: "UNKNOWN", allowExport: false, licenseClass: null,
    });
    expect(poiInput.ref.label).toMatch(/Map release /);
    expect(poiInput.freshness.sourcePublishedAt).toEqual(expect.any(String));
    expect(poiInput.attribution).toMatchObject({ required: true, text: expect.any(String) });
    expect(poiInput.limitations.join(" ")).toMatch(/completeness|checksum|freshness/i);
    expect(result.attribution.map((entry) => entry.text).join(" ")).toMatch(/OpenStreetMap contributors/);

    const outside = await timed("m4.outside-coverage", () => engine(baseRequest({
      analyses: ["PROXIMITY", "CATCHMENT"], location: point(31.2357, 30.0444),
      parameters: { roles: ["poi:hospital"], radiiMeters: radii, nearestCount: 1 },
    })));
    const outsideMetrics = outside.results.flatMap((entry) => entry.metrics);
    expect(outsideMetrics.length).toBeGreaterThan(0);
    expect(outsideMetrics.every((metric) => metric.status === "NO_COVERAGE" && metric.value === null)).toBe(true);
    expect(outside.dataAvailability).toContainEqual(expect.objectContaining({ role: "poi:hospital", status: "NO_COVERAGE" }));
    expect(gapCodes(outside)).toContain("NO_COVERAGE");

    const populationReader = new PostgisMapReader({ connectionString: readOnlyUrl });
    let mapHasPopulationFeatures = false;
    try {
      mapHasPopulationFeatures = (await populationReader.describeMap({ layers: ["population"] })).layers.find((layer) => layer.id === "population")?.hasFeatures ?? false;
    } finally {
      await populationReader.close();
    }
    expect(mapHasPopulationFeatures).toBe(false);

    const noPopulationData = new FakeDataCenterPort({ discover: () => emptyDiscovery("NOT_AVAILABLE") });
    const population = await timed("m4.riyadh.population-unavailable", () => engine(baseRequest({
      analyses: ["CATCHMENT"], location: point(longitude, latitude),
      parameters: { roles: ["poi:hospital", "population"], radiiMeters: radii },
      data: { roles: { population: { source: "DATA_CENTER", typeKey: "geojson" } } },
    }), { dataCenterPort: noPopulationData }));
    expect(population.dataAvailability).toContainEqual(expect.objectContaining({ role: "population", status: "NOT_AVAILABLE" }));
    expect(metricsOf(population)).toMatchObject({
      "catchment.r500.population": { status: "NOT_AVAILABLE", value: null },
      "catchment.r1000.population": { status: "NOT_AVAILABLE", value: null },
      "catchment.r3000.population": { status: "NOT_AVAILABLE", value: null },
      "catchment.r5000.population": { status: "NOT_AVAILABLE", value: null },
    });
    expect(gapCodes(population)).toContain("DATASET_NOT_AVAILABLE");
    expectNoVerdictsAndNoPercentages(population);
    examples.m4Riyadh = {
      proximity: {
        name: m["proximity.poi:hospital.n1.name"]?.value,
        distanceMeters: m["proximity.poi:hospital.n1.distance"]?.value,
        featureRef: m["proximity.poi:hospital.n1.feature_ref"]?.value,
        confidence: m["proximity.poi:hospital.n1.distance"]?.confidence?.band,
      },
      catchmentCounts: Object.fromEntries(expectedCounts.map(({ radius_meters: radius, count }) => [radius, { referenceCount: count, engine: m[`catchment.r${radius}.count.poi:hospital`]?.status }])),
      outsideCoverage: "NO_COVERAGE",
      population: "NOT_AVAILABLE",
    };
  }, 120_000);

  it("M6 real-data acceptance: Riyadh density, factual comparison and unavailable constraints without synthetic inputs", async () => {
    const locations = [
      { id: "primary", longitude: 46.6753, latitude: 24.7136 },
      { id: "riyadh-east", longitude: 46.69, latitude: 24.72 },
      { id: "riyadh-west", longitude: 46.66, latitude: 24.70 },
    ];
    const radii = [500, 1000, 3000, 5000];
    const request = baseRequest({
      analyses: ["DENSITY", "CONSTRAINT_SCREENING", "SITE_COMPARISON"],
      location: point(locations[0]!.longitude, locations[0]!.latitude),
      candidates: locations.slice(1).map((entry) => ({ id: entry.id, location: point(entry.longitude, entry.latitude) })),
      parameters: { roles: ["poi:hospital", "constraint:protected_area"], radiiMeters: radii },
      data: { roles: { "poi:hospital": { source: "MAP", layerKey: "pois", releaseId } } },
    });
    const result = await timed("m6.riyadh.three-site-density-constraints-comparison", () => engine(request));
    const counts: Record<string, unknown> = {};
    for (const location of locations) {
      const expected = (await reference.query(
        `SELECT r.radius, count(f.id)::int AS count,
          ST_Area(ST_Buffer(ST_SetSRID(ST_MakePoint($2, $3),4326)::geography,r.radius)::geography)/1000000 AS area
         FROM unnest($4::float8[]) AS r(radius)
         LEFT JOIN jenan_map.feature f ON f."releaseId"=$1::uuid AND f."layerId"='pois'
           AND f."sourceId" LIKE 'pois:hospital:%'
           AND ST_DWithin(f.geometry::geography,ST_SetSRID(ST_MakePoint($2,$3),4326)::geography,r.radius)
         GROUP BY r.radius ORDER BY r.radius`, [releaseId, location.longitude, location.latitude, radii],
      )).rows as Array<{ radius: number; count: number; area: number }>;
      const metrics = result.results.find((entry) => entry.analysis === "DENSITY" && entry.target === location.id)!.metrics;
      for (const row of expected) {
        const count = metrics.find((metric) => metric.key === `density.poi:hospital.r${row.radius}.count`)!;
        const density = metrics.find((metric) => metric.key === `density.poi:hospital.r${row.radius}.per_km2`)!;
        if (row.count === 0) {
          expect(count).toMatchObject({ value: null, status: "NOT_COMPUTABLE" });
          expect(density.value).toBeNull();
        } else {
          expect(count).toMatchObject({ value: row.count, status: "PARTIAL" });
          expect(density.value).toBeCloseTo(row.count / row.area, 6);
          expect(count.confidence?.band).toBe("LOW");
          expect(density.confidence?.band).toBe("LOW");
        }
      }
      counts[location.id] = expected.map(({ radius, count }) => ({ radius, observedCount: count }));
      const constraints = result.results.find((entry) => entry.analysis === "CONSTRAINT_SCREENING" && entry.target === location.id)!.metrics;
      expect(constraints.every((metric) => metric.value === null && metric.status === "NOT_AVAILABLE")).toBe(true);
    }
    const clusterReference = (await reference.query(
      `WITH points AS (
        SELECT f.id,ST_Transform(f.geometry,32638) AS geom FROM jenan_map.feature f
        WHERE f."releaseId"=$1::uuid AND f."layerId"='pois' AND f."sourceId" LIKE 'pois:hospital:%'
          AND ST_DWithin(f.geometry::geography,ST_SetSRID(ST_MakePoint(46.6753,24.7136),4326)::geography,5000)
      ), memberships AS (
        SELECT ST_ClusterDBSCAN(p.geom,500,5) OVER (ORDER BY p.id) AS cluster_id FROM points p
      ), sizes AS (
        SELECT cluster_id,count(*)::int AS n FROM memberships WHERE cluster_id IS NOT NULL GROUP BY cluster_id
      )
      SELECT (SELECT count(*)::int FROM sizes) AS clusters,COALESCE((SELECT max(n) FROM sizes),0) AS largest,
        (SELECT count(*)::int FROM memberships WHERE cluster_id IS NULL) AS noise`, [releaseId],
    )).rows[0] as { clusters: number; largest: number; noise: number };
    const primary = result.results.find((entry) => entry.analysis === "DENSITY" && entry.target === "primary")!.metrics;
    for (const [suffix, expected] of [["count", clusterReference.clusters], ["largest", clusterReference.largest], ["noise", clusterReference.noise]] as const) {
      expect(primary.find((metric) => metric.key === `density.poi:hospital.cluster.${suffix}`)?.value).toBe(expected === 0 ? null : expected);
    }
    const replay = await timed("m6.riyadh.identical-request-repeat", () => engine(request));
    expect(replay.determinism).toEqual(result.determinism);
    expect(result.results.flatMap((entry) => entry.metrics).length).toBeLessThanOrEqual(500);
    expect(result.inputs.some((input) => input.ref.system === "JENAN_MAP" && input.ref.id.includes(releaseId))).toBe(true);
    expect(result.attribution.map((entry) => entry.text).join(" ")).toMatch(/OpenStreetMap contributors/);
    expect(gapCodes(result)).toContain("DATASET_NOT_AVAILABLE");
    expectNoVerdictsAndNoPercentages(result);
    examples.m6Riyadh = {
      releaseId, counts, clusterReference,
      metrics: Object.fromEntries(result.results.map((entry) => [`${entry.analysis}/${entry.target}`,
        entry.metrics.map((metric) => ({ key: metric.key, state: metric.status, value: metric.value, confidence: metric.confidence?.band ?? null }))])),
      realDataGaps: ["No governed constraint input is supplied by the current Map contract; real constraint geometry acceptance remains unavailable.",
        "No actual population dataset supplied; no real population estimate claimed."],
    };
  }, 120_000);

  // ---------------------------------------------------------------------------------------------------------------- Riyadh
  it("describes Riyadh as the published release does: region, governorate, nearest neighbourhood, with their sources and limits", async () => {
    const result = await timed("riyadh.cold", () => engine(contextRequest({ location: point(46.6753, 24.7136) }, ["place:neighbourhood"])));
    const m = metricsOf(result);
    expect(m["context.country"]).toMatchObject({ status: "COMPUTED", value: "SA" });
    expect(m["context.within_boundary"]).toMatchObject({ status: "COMPUTED", value: true });
    expect(m["context.region"]).toMatchObject({ status: "COMPUTED", value: "Riyadh Region" });
    expect(m["context.governorate"]).toMatchObject({ status: "COMPUTED", value: "Riyadh" });
    close(m["context.region.boundary_distance"]?.value, 82_849.5);
    close(m["context.governorate.boundary_distance"]?.value, 6059.5);
    close(m["context.place:neighbourhood.nearest.distance"]?.value, 1236.2);
    expect(m["context.place:neighbourhood.nearest.name"]?.value).toBe("الورود");
    expect(result.engine.environment).toBe("production");
    expect(result.request.mapLayerPolicy).toBe("REGISTERED_ONLY");
    expect(result.inputs.map((input) => [input.id.split(":").pop(), input.governance, input.freshness.status])).toEqual([
      ["boundary", "MAP_REGISTERED", "STALE"], ["governorates", "MAP_REGISTERED", "STALE"], ["places", "MAP_REGISTERED", "FRESH"], ["regions", "MAP_REGISTERED", "STALE"],
    ]);
    expect(result.inputs.every((input) => input.licenseClass === null && !input.allowExport && input.completeness === "UNKNOWN" && input.quality.status === "UNAVAILABLE")).toBe(true);
    expect(result.rights.allowExport).toBe(false);
    expect(result.status).toBe("COMPLETED_WITH_GAPS");
    examples.riyadh = summary(result);
    examples.riyadhGaps = [...new Set(result.gaps.map((gap) => `${gap.severity} ${gap.code}`))];
  });

  it("grades the confidence by the documented rules on the real data: 2017 boundaries are LOW, fresh places MEDIUM, never HIGH", async () => {
    const m = metricsOf(await engine(contextRequest({ location: point(46.6753, 24.7136) }, ["place:neighbourhood"])));
    expect(["context.region", "context.governorate", "context.country", "context.within_boundary"].map((key) => m[key]?.confidence?.band)).toEqual(["LOW", "LOW", "LOW", "LOW"]);
    expect(m["context.place:neighbourhood.nearest.distance"]?.confidence?.band).toBe("MEDIUM");
    expect(m["context.region"]?.confidence?.score).toBe(43);
    expect(m["context.place:neighbourhood.nearest.distance"]?.confidence?.score).toBe(66);
    expect(Object.values(m).some((metric) => metric.confidence?.band === "HIGH")).toBe(false);
  });

  it("states the sources and limits in plain facts: unofficial boundaries, stale source, no license class, no export, attribution, straight-line distances", async () => {
    const result = await engine(contextRequest({ location: point(46.6753, 24.7136) }, ["place:neighbourhood"]));
    expect(gapCodes(result)).toEqual(expect.arrayContaining(["BOUNDARY_UNOFFICIAL", "DATA_STALE", "LICENSE_CLASS_UNDECLARED", "EXPORT_NOT_PERMITTED", "COMPLETENESS_UNKNOWN", "QUALITY_UNAVAILABLE", "ATTRIBUTION_REQUIRED", "NETWORK_ANALYSIS_NOT_SUPPORTED"]));
    expect(gapsOf(result, "BOUNDARY_UNOFFICIAL").every((gap) => gap.severity === "WARNING")).toBe(true);
    expect(result.attribution.map((entry) => entry.text).join(" ")).toMatch(/OpenStreetMap contributors/);
    expect(result.attribution.map((entry) => entry.text).join(" ")).toMatch(/geoBoundaries/);
    expect(metricsOf(result)["context.region"]?.limitations).toContain("Based on unofficial boundaries that no government authority issued.");
    expectNoVerdictsAndNoPercentages(result);
  });

  // ----------------------------------------------------------------------------------------------------- differential check
  it.each(CITIES)("agrees with independent SQL for %s", async (name, longitude, latitude) => {
    const [result, expected] = await Promise.all([engine(contextRequest({ location: point(longitude, latitude) }, ["place:neighbourhood"])), referenceAt(longitude, latitude)]);
    expectAgrees(name, result, expected);
  });

  it.each(OUTSIDE)("says nothing about %s except that it lies outside the mapped country", async (name, longitude, latitude) => {
    const [result, expected] = await Promise.all([engine(contextRequest({ location: point(longitude, latitude) }, ["place:neighbourhood"])), referenceAt(longitude, latitude)]);
    expect(expected.covered, `${name} is outside the boundary`).toBe(false);
    expectAgrees(name, result, expected);
    for (const metric of Object.values(metricsOf(result)).filter((entry) => entry.key !== "context.within_boundary")) expect(metric.value, metric.key).toBeNull();
    expect(result.dataAvailability.filter((entry) => entry.status === "NO_COVERAGE").map((entry) => entry.role)).toEqual(["admin:governorate", "admin:region", "place:neighbourhood"]);
    expect(result.rights.allowExport).toBe(false);
    expect(result.rights.denials.length).toBeGreaterThan(0);
    if (name === "Dubai") examples.dubai = summary(result);
  });

  // --------------------------------------------------------------------------------------------------------- on and near boundaries
  it("handles points on and near a real shared governorate edge, and agrees with independent SQL at each", async () => {
    // Vertices of the edge Riyadh shares with Ad Diriyah, and points 300 m from them toward the inside of Riyadh.
    const vertices = (await reference.query(
      `WITH a AS (SELECT geometry FROM jenan_map.feature WHERE "releaseId" = $1::uuid AND "layerId" = 'governorates' AND label = 'Riyadh'),
            b AS (SELECT geometry FROM jenan_map.feature WHERE "releaseId" = $1::uuid AND "layerId" = 'governorates' AND label = 'Ad Diriyah'),
            shared AS (SELECT (ST_DumpPoints(ST_CollectionExtract(ST_Intersection(a.geometry, b.geometry), 2))).geom AS p, a.geometry AS inside FROM a, b)
       SELECT ST_X(p) AS lon, ST_Y(p) AS lat,
              ST_X(ST_Project(p::geography, 300, ST_Azimuth(p::geography, ST_PointOnSurface(inside)::geography))::geometry) AS near_lon,
              ST_Y(ST_Project(p::geography, 300, ST_Azimuth(p::geography, ST_PointOnSurface(inside)::geography))::geometry) AS near_lat
       FROM shared LIMIT 12`, [releaseId],
    )).rows as Array<{ lon: number; lat: number; near_lon: number; near_lat: number }>;
    expect(vertices.length, "the shared edge of Riyadh and Ad Diriyah has vertices").toBeGreaterThan(0);

    let onEdge = 0;
    let nearEdge = 0;
    for (const vertex of vertices) {
      const edgeRef = await referenceAt(vertex.lon, vertex.lat);
      const edgeResult = await engine(contextRequest({ location: point(vertex.lon, vertex.lat) }, ["place:neighbourhood"]));
      expectAgrees("edge vertex", edgeResult, edgeRef);
      if (edgeRef.governorates.length > 1) {
        onEdge += 1;
        expect(statuses(edgeResult)["context.governorate"]).toBe("NOT_COMPUTABLE");
        expect(gapCodes(edgeResult)).toContain("ADMIN_AMBIGUOUS_ON_BOUNDARY");
        if (onEdge === 1) examples.onSharedEdge = summary(edgeResult);
      }
      const nearRef = await referenceAt(vertex.near_lon, vertex.near_lat);
      const nearResult = await engine(contextRequest({ location: point(vertex.near_lon, vertex.near_lat) }, ["place:neighbourhood"]));
      expectAgrees("near-edge point", nearResult, nearRef);
      const governorate = nearRef.governorates[0];
      if (nearRef.governorates.length === 1 && governorate !== undefined && governorate.edge <= 1000) {
        nearEdge += 1;
        expect(gapsOf(nearResult, "ADMIN_NEAR_BOUNDARY").some((gap) => gap.subject === "primary/context.governorate")).toBe(true);
        expect(metricsOf(nearResult)["context.governorate"]?.confidence?.factors.find((factor) => factor.key === "geometryFidelity")?.points).toBe(5);
        if (nearEdge === 1) examples.nearEdge = { edgeDistanceMeters: governorate.edge, ...summary(nearResult) };
      }
    }
    expect(onEdge, "at least one vertex of the shared edge is covered by both governorates").toBeGreaterThan(0);
    expect(nearEdge, "at least one point 300 m from the edge is a near-boundary assignment").toBeGreaterThan(0);
  }, 180_000);

  // ----------------------------------------------------------------------------------------------------------------- areas
  it("grades the real Jeddah coastal box as partly covered, with the covered share the independent SQL gives", async () => {
    const box = rect(39.0, 21.4, 39.3, 21.7);
    const result = await engine(contextRequest({ location: box }, ["place:neighbourhood"]));
    const share = Number((await reference.query(
      `SELECT ST_Area(ST_Intersection(b.geometry, g.geom)::geography) / ST_Area(g.geom::geography) AS share FROM jenan_map.boundary b, (SELECT ST_SetSRID(ST_GeomFromGeoJSON($2), 4326) AS geom) g WHERE b."releaseId" = $1::uuid`,
      [releaseId, JSON.stringify(box)],
    )).rows[0].share);
    const m = metricsOf(result);
    expect(m["context.within_boundary"]).toMatchObject({ status: "COMPUTED", value: false });
    expect(m["context.region"]).toMatchObject({ status: "PARTIAL", value: "Makkah Region" });
    expect(m["context.governorate"]?.status).toBe("PARTIAL");
    const coveragePoints = m["context.region"]?.confidence?.factors.find((factor) => factor.key === "coverage")?.points;
    expect(coveragePoints).toBe(Math.round(25 * share));
    expect(share).toBeGreaterThan(0.5);
    expect(share).toBeLessThan(0.6);
    expect(gapsOf(result, "COVERAGE_PARTIAL").length).toBeGreaterThanOrEqual(3);
    examples.jeddahCoast = { coveredShare: share, ...summary(result) };
  }, 60_000);

  it("says a real area spans governorates, and keeps ten of the eleven it touches when it is large, saying the list was cut", async () => {
    const downtown = await engine(contextRequest({ location: rect(46.6, 24.6, 46.8, 24.8) }, []));
    expect(metricsOf(downtown)["context.governorate"]).toMatchObject({ status: "COMPUTED", value: "Riyadh" });
    expect(metricsOf(downtown)["context.governorate.contains_target"]?.value).toBe(false);
    expect(metricsOf(downtown)["context.governorate.intersecting_units"]?.value).toBe("Ad Diriyah | Riyadh");
    expect(gapsOf(downtown, "ADMIN_TARGET_SPANS_UNITS")).toHaveLength(1);
    const large = await engine(contextRequest({ location: rect(46.0, 24.0, 48.0, 26.0) }, []));
    const listed = String(metricsOf(large)["context.governorate.intersecting_units"]?.value).split(" | ");
    expect(listed).toHaveLength(10);
    expect(gapsOf(large, "RESULT_TRUNCATED")).toHaveLength(1);
    examples.largeBoxGovernorates = listed;
  });

  // ----------------------------------------------------------------------------------------------------------------- nothing found
  it("tells apart real neighbourhoods that share a name: each reference resolves to its own feature in the published release", async () => {
    // The real Map holds many neighbourhoods called «الورود». Ask at the position of several of them, far apart from one another.
    const twins = (await reference.query(
      `SELECT f.id::text AS id, ST_X(f.geometry) AS lon, ST_Y(f.geometry) AS lat FROM jenan_map.feature f
       WHERE f."releaseId" = $1::uuid AND f."layerId" = 'places' AND f."sourceId" LIKE 'places:neighbourhood:%' AND f.label = 'الورود' ORDER BY f.id`, [releaseId],
    )).rows as Array<{ id: string; lon: number; lat: number }>;
    expect(twins.length, "the real Map holds several neighbourhoods with the same name").toBeGreaterThanOrEqual(2);
    const chosen: typeof twins = [];
    for (const candidate of twins) {
      if (chosen.every((other) => Math.hypot(other.lon - candidate.lon, other.lat - candidate.lat) > 1)) chosen.push(candidate);
      if (chosen.length === 3) break;
    }
    expect(chosen.length, "at least two of them lie more than a degree apart").toBeGreaterThanOrEqual(2);

    const answers: Array<{ name: unknown; reference: unknown; distance: unknown }> = [];
    for (const twin of chosen) {
      const expected = await referenceAt(twin.lon, twin.lat);
      const m = metricsOf(await engine(contextRequest({ location: point(twin.lon, twin.lat) }, ["place:neighbourhood"])));
      expect(m["context.place:neighbourhood.nearest.feature_ref"]?.value, `the neighbourhood at ${twin.lon},${twin.lat}`).toBe(`map:${releaseId}:feature:${expected.neighbourhood?.id}`);
      answers.push({ name: m["context.place:neighbourhood.nearest.name"]?.value, reference: m["context.place:neighbourhood.nearest.feature_ref"]?.value, distance: m["context.place:neighbourhood.nearest.distance"]?.value });
    }
    // Everything an answer says by name is the same, and the references are not: they are different places.
    expect(answers.every((answer) => answer.name === "الورود")).toBe(true);
    expect(new Set(answers.map((answer) => answer.reference)).size).toBe(answers.length);
    // Each reference points at a real feature of this release, with that very name.
    for (const answer of answers) {
      const parsed = parseMapFeatureRef(answer.reference as string);
      expect(parsed?.releaseId).toBe(releaseId);
      const row = (await reference.query(`SELECT label, "layerId", "releaseId"::text AS release FROM jenan_map.feature WHERE id = $1::uuid`, [parsed?.featureId])).rows[0];
      expect(row).toMatchObject({ label: "الورود", layerId: "places", release: releaseId });
    }
    examples.sameNameNeighbourhoods = answers;
  });

  // ----------------------------------------------------------------------------------------------------------------- nothing found
  it("does not turn a remote place with nothing mapped nearby into a zero or a verdict", async () => {
    const candidates: Array<[number, number]> = [[51.0, 21.0], [47.0, 21.0], [44.0, 21.5], [45.0, 28.0], [42.0, 19.5]];
    let chosen: [number, number] | null = null;
    for (const [longitude, latitude] of candidates) {
      const expected = await referenceAt(longitude, latitude);
      if (expected.covered && (expected.neighbourhood === null || expected.neighbourhood.distance > 5000)) { chosen = [longitude, latitude]; break; }
    }
    expect(chosen, "a covered place with no neighbourhood within 5 km").not.toBeNull();
    const result = await engine(contextRequest({ location: point(...(chosen as [number, number])) }, ["place:neighbourhood"]));
    const distance = metricsOf(result)["context.place:neighbourhood.nearest.distance"];
    expect(distance).toMatchObject({ status: "NOT_FOUND_WITHIN_RADIUS", value: null, platformState: "UNAVAILABLE", confidence: null });
    expect(distance?.limitations).toContain("Nothing mapped of this kind was found within 5000 m.");
    expect(metricsOf(result)["context.region"]?.status).toBe("COMPUTED");
    examples.remote = { location: chosen, ...summary(result) };
  });

  // ------------------------------------------------------------------------------------------- the contract on the real data
  it("satisfies the read contract: every table and column with its exact type, the role that cannot write, and the indexes the queries rely on", async () => {
    const reader = new PostgisMapReader({ connectionString: readOnlyUrl });
    readers.push(reader);
    expect(await reader.capabilities()).toMatchObject({ roleCanWrite: false, mapSchemaReachable: true, contractProblems: [] });
    const indexes = (await reference.query(`SELECT tablename AS "table", indexname AS name, indexdef AS definition FROM pg_indexes WHERE schemaname = 'jenan_map' AND tablename IN ('feature', 'boundary')`)).rows;
    expect(findMapIndexProblems(indexes)).toEqual([]);
  });

  it("holds a source id the strict parser reads for every place, point of interest and road: 100% conformance, on the real data", async () => {
    const kinds: Record<string, string[]> = {};
    for (const layer of ["places", "pois", "roads"] as const) {
      const total = Number((await reference.query(`SELECT count(*) AS n FROM jenan_map.feature WHERE "releaseId" = $1::uuid AND "layerId" = $2`, [releaseId, layer])).rows[0].n);
      const matching = Number((await reference.query(`SELECT count(*) AS n FROM jenan_map.feature WHERE "releaseId" = $1::uuid AND "layerId" = $2 AND "sourceId" ~ $3`, [releaseId, layer, sourceIdPattern(layer)])).rows[0].n);
      expect(total, `${layer} features`).toBeGreaterThan(0);
      expect(matching, `${layer} source ids that match the strict pattern`).toBe(total);
      const seen = new Set<string>();
      let unparsed = 0;
      for (const row of (await reference.query(`SELECT "sourceId" FROM jenan_map.feature WHERE "releaseId" = $1::uuid AND "layerId" = $2`, [releaseId, layer])).rows as Array<{ sourceId: string }>) {
        const parsed = parseMapSourceId(layer, row.sourceId);
        if (parsed.ok) seen.add(parsed.kind); else unparsed += 1;
      }
      expect(unparsed, `${layer} source ids the parser rejects`).toBe(0);
      kinds[layer] = [...seen].sort();
    }
    expect(kinds.places).toEqual(["locality", "neighbourhood"]);
    examples.sourceIdKinds = kinds;
  }, 120_000);

  it("never leaves a layer id empty, keeps it equal to the category, and holds the geometry types the engine measures against", async () => {
    const rows = (await reference.query(
      `SELECT "layerId", count(*)::int AS total, count(*) FILTER (WHERE "layerId" IS NULL OR "layerId" <> category)::int AS inconsistent, array_agg(DISTINCT GeometryType(geometry)) AS types
       FROM jenan_map.feature WHERE "releaseId" = $1::uuid GROUP BY "layerId" ORDER BY 1`, [releaseId],
    )).rows as Array<{ layerId: string; total: number; inconsistent: number; types: string[] }>;
    expect(rows.every((row) => row.layerId !== null && row.inconsistent === 0)).toBe(true);
    const types = Object.fromEntries(rows.map((row) => [row.layerId, [...row.types].sort()]));
    expect(types.places).toEqual(["POINT"]);
    expect(types.regions?.every((type) => type.includes("POLYGON"))).toBe(true);
    expect(types.governorates?.every((type) => type.includes("POLYGON"))).toBe(true);
    expect(rows.find((row) => row.layerId === "regions")?.total).toBe(13);
  });

  it("lists reviewed provenance for every layer the engine reads, describes the boundary as unofficial, and records the governorates as a data-only layer", async () => {
    const reader = new PostgisMapReader({ connectionString: readOnlyUrl });
    readers.push(reader);
    const description = await reader.describeMap({ layers: ["regions", "governorates", "places", "pois", "roads"] });
    expect(description.runtime).toEqual({ status: "enabled", publishedReleaseId: releaseId });
    expect(description.release?.status).toBe("Published");
    expect(description.layers.map((layer) => [layer.id, layer.provenance !== null, layer.hasFeatures])).toEqual([
      ["regions", true, true], ["governorates", true, true], ["places", true, true], ["pois", true, true], ["roads", true, true],
    ]);
    expect(description.layers.find((layer) => layer.id === "governorates")?.binding).toBeNull();
    expect(description.layers.filter((layer) => layer.id !== "governorates").every((layer) => layer.binding?.status === "ready")).toBe(true);
    expect(description.boundary).toMatchObject({ countryCode: "SA", official: false, authorityText: expect.stringContaining("not a Saudi government authority") });
    expect(description.boundary?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when a real place's source id changes shape: the answer for Riyadh becomes unavailable, not a different neighbourhood", async () => {
    const target = (await reference.query(
      `SELECT id::text AS id, "sourceId" AS "sourceId" FROM jenan_map.feature
       WHERE "releaseId" = $1::uuid AND "layerId" = 'places' AND "sourceId" LIKE 'places:neighbourhood:%'
       ORDER BY ST_Distance(geometry::geography, ST_SetSRID(ST_MakePoint(46.6753, 24.7136), 4326)::geography), id LIMIT 1`, [releaseId],
    )).rows as Array<{ id: string; sourceId: string }>;
    expect(target).toHaveLength(1);
    const broken = (target[0] as { id: string; sourceId: string });
    const asAdmin = new Client({ connectionString: adminUrl });
    await asAdmin.connect();
    try {
      // This is the scratch copy: the Map's own guard against editing published data is lifted here, for this test only.
      await asAdmin.query("ALTER TABLE jenan_map.feature DISABLE TRIGGER guard_feature");
      await asAdmin.query(`UPDATE jenan_map.feature SET "sourceId" = $2 WHERE id = $1::uuid`, [broken.id, broken.sourceId.replace("places:neighbourhood:", "places:Neighbourhood:")]);
      const result = await engine(contextRequest({ location: point(46.6753, 24.7136) }, ["place:neighbourhood"]));
      const m = metricsOf(result);
      expect(m["context.place:neighbourhood.nearest.distance"]).toMatchObject({ status: "NOT_COMPUTABLE", value: null, confidence: null });
      expect(m["context.place:neighbourhood.nearest.name"]).toMatchObject({ status: "NOT_COMPUTABLE", value: null });
      expect(gapsOf(result, "MAP_SOURCE_ID_UNRECOGNIZED")).toHaveLength(1);
      expect(m["context.region"]).toMatchObject({ status: "COMPUTED", value: "Riyadh Region" });
      examples.changedSourceId = summary(result);
    } finally {
      await asAdmin.query(`UPDATE jenan_map.feature SET "sourceId" = $2 WHERE id = $1::uuid`, [broken.id, broken.sourceId]);
      await asAdmin.query("ALTER TABLE jenan_map.feature ENABLE TRIGGER guard_feature");
      await asAdmin.end();
    }
    const restored = await engine(contextRequest({ location: point(46.6753, 24.7136) }, ["place:neighbourhood"]));
    close(metricsOf(restored)["context.place:neighbourhood.nearest.distance"]?.value, 1236.2);
  }, 120_000);

  // ------------------------------------------------------------------------------------------------------------- performance
  it("answers quickly on real data: repeated runs of the main scenarios, on one pool", async () => {
    const run = sharedEngine();
    const scenarios: Array<[string, unknown]> = [
      ["point.admin", contextRequest({ location: point(46.6753, 24.7136) }, [])],
      ["point.admin+places", contextRequest({ location: point(46.6753, 24.7136) }, ["place:neighbourhood", "place:locality", "place"])],
      ["area.downtown", contextRequest({ location: rect(46.6, 24.6, 46.8, 24.8) }, ["place:neighbourhood"])],
      ["area.large", contextRequest({ location: rect(46.0, 24.0, 48.0, 26.0) }, ["place:neighbourhood"])],
      ["candidates.6", contextRequest({ location: point(46.6753, 24.7136), candidates: CITIES.slice(1, 6).map(([name, longitude, latitude]) => ({ id: name.toLowerCase(), location: point(longitude, latitude) })) }, ["place:neighbourhood"])],
    ];
    for (const [name, request] of scenarios) {
      await timed(`${name}.warmup`, () => run(request));
      for (let round = 0; round < 5; round += 1) await timed(name, () => run(request));
    }
    const median = (values: number[]) => [...values].sort((first, second) => first - second)[Math.floor(values.length / 2)] as number;
    expect(median(timings["point.admin"] as number[])).toBeLessThan(1000);
    expect(median(timings["point.admin+places"] as number[])).toBeLessThan(1500);
    expect(Math.max(...(timings["area.large"] as number[]))).toBeLessThan(5000);
    expect(median(timings["candidates.6"] as number[])).toBeLessThan(4000);
  }, 240_000);

  it("changes nothing in the Map copy", async () => {
    const fingerprint = async () => (await reference.query(
      `SELECT (SELECT count(*) FROM jenan_map.feature)::text || '/' || (SELECT count(*) FROM jenan_map.release)::text || '/' ||
              (SELECT md5(string_agg(xmin::text, ',' ORDER BY id)) FROM jenan_map.runtime) || '/' || (SELECT count(*) FROM jenan_map.audit)::text AS value`,
    )).rows[0].value as string;
    const before = await fingerprint();
    await engine(contextRequest({ location: point(46.6753, 24.7136) }, ["place:neighbourhood"]));
    expect(await fingerprint()).toBe(before);
  });
});
