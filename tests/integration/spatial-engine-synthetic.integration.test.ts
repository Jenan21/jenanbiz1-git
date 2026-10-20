import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildRunRecord, runRecordSchema, type EngineError } from "@/services/analysis-engines/shared";
import { runSpatialAnalysis, type RunSpatialOptions, type SpatialResult } from "@/services/analysis-engines/spatial";
import { buildReadOnlyRoleStatements, PostgisMapReader } from "@/services/analysis-engines/spatial/adapters";
import { parseMapFeatureRef } from "@/services/analysis-engines/spatial/map-contract";
import { contextRequest, expectNoVerdictsAndNoPercentages, failureOf, gapCodes, gapsOf, metricsOf, statuses } from "../unit/support/spatial-run";
import {
  createMapDatabase, dropDatabase, dropRole, postgisTestsEnabled, scratchName, urlFor, withAdmin, withClient,
} from "./support/spatial-engine-db";
import { placeId, point, rect, seedRelease, setRuntime, standardFeatures, standardRelease } from "./support/synthetic-map";

const CLOCK = "2026-10-20T12:00:00.000Z";
const EARTH_RADIUS = 6_371_008.8;
const rad = (degrees: number) => (degrees * Math.PI) / 180;
/** Independent of PostGIS: the great-circle distance between two positions on a sphere. */
const haversine = (from: [number, number], to: [number, number]) => {
  const dLat = rad(to[1] - from[1]);
  const dLon = rad(to[0] - from[0]);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from[1])) * Math.cos(rad(to[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(a));
};
/** Independent of PostGIS: the shortest distance from a position to a meridian, on a sphere. */
const toMeridian = (latitude: number, degreesFromMeridian: number) => EARTH_RADIUS * Math.asin(Math.cos(rad(latitude)) * Math.sin(rad(degreesFromMeridian)));
const within = (actual: number | string | boolean | null | undefined, expected: number, tolerance: number) => {
  expect(typeof actual).toBe("number");
  expect(Math.abs((actual as number) - expected) / expected).toBeLessThan(tolerance);
};

const databases: string[] = [];
const roles: string[] = [];
const readers: PostgisMapReader[] = [];
afterAll(async () => {
  await Promise.allSettled(readers.map((entry) => entry.close()));
  for (const name of databases) await dropDatabase(name).catch(() => undefined);
  for (const name of roles) await dropRole(name).catch(() => undefined);
}, 120_000);

describe.runIf(postgisTestsEnabled)("LOCATION_CONTEXT over a real PostGIS: the synthetic Map", () => {
  let database = "";
  let adminUrl = "";
  let readOnlyUrl = "";
  let publishedId = "";

  const engine = async (request: unknown, options: Partial<RunSpatialOptions> & { url?: string } = {}) => {
    const { url = adminUrl, ...rest } = options;
    const reader = new PostgisMapReader({ connectionString: url });
    try {
      return await runSpatialAnalysis(reader, request, { environment: "test", clock: () => new Date(CLOCK), newRunId: () => "run-1", ...rest });
    } finally {
      await reader.close(); // one pool per run, closed with it, so the server's connections are never left to pile up
    }
  };
  const analyse = (location: unknown, roles: string[] = [], extra: Record<string, unknown> = {}) => engine(contextRequest({ location, ...extra }, roles));

  beforeAll(async () => {
    database = await createMapDatabase();
    databases.push(database);
    adminUrl = urlFor(database);
    publishedId = await withClient(adminUrl, (client) => seedRelease(client, standardRelease("synthetic-1")));
    const role = scratchName();
    roles.push(role);
    const secret = "Zx9_qT7.rL2~vB4-nM8kP3wY5";
    await withAdmin(async (client) => { for (const statement of buildReadOnlyRoleStatements({ role, password: secret, database })) await client.query(statement); }, database);
    readOnlyUrl = urlFor(database, { user: role, password: secret });
  }, 180_000);

  describe("M4 feature measurements over a real PostGIS", () => {
    it("counts only the requested Map kind within each radius", async () => {
      const reader = new PostgisMapReader({ connectionString: adminUrl });
      try {
        const result = await reader.countFeatures({
          releaseId: publishedId, layerId: "places", location: point(42, 22), kind: "neighbourhood", radiiMeters: [100, 5000],
        });
        expect(result.radii).toEqual([
          { radiusMeters: 100, count: 1, unrecognized: 0 },
          { radiusMeters: 5000, count: 1, unrecognized: 0 },
        ]);
      } finally {
        await reader.close();
      }
    });

    it("measures Data Center feature proximity and area-weighted population using PostGIS", async () => {
      const reader = new PostgisMapReader({ connectionString: adminUrl });
      try {
        const result = await reader.measureDataset({
          features: [{
            type: "Feature", id: "population-zone", properties: { name: "Population zone", population: 1000 },
            geometry: rect(42.4, 22.4, 42.6, 22.6),
          }],
          location: point(42.5, 22.5), radiiMeters: [500], maxSearchMeters: 5000, nearestCount: 2, includePopulation: true,
        });
        expect(result.valid).toBe(true);
        expect(result.nearest[0]).toMatchObject({ id: "population-zone", name: "Population zone", distanceMeters: 0 });
        expect(result.radii[0]?.count).toBe(1);
        expect(result.radii[0]?.populationEstimate).toBeGreaterThan(0);
        expect(result.radii[0]?.populationEstimate).toBeLessThan(1000);
      } finally {
        await reader.close();
      }
    });

    it("returns invalid geometry without evaluating distance or population operations", async () => {
      const reader = new PostgisMapReader({ connectionString: adminUrl });
      try {
        const result = await reader.measureDataset({
          features: [{
            type: "Feature", properties: { population: 1000 },
            geometry: { type: "Polygon", coordinates: [[[42.4, 22.4], [42.6, 22.6], [42.6, 22.4], [42.4, 22.6], [42.4, 22.4]]] },
          }],
          location: point(42.5, 22.5), radiiMeters: [500], maxSearchMeters: 5000, nearestCount: 2, includePopulation: true,
        });
        expect(result).toEqual({
          valid: false, nearest: [], radii: [{ radiusMeters: 500, count: 0, populationEstimate: null }],
        });
      } finally {
        await reader.close();
      }
    });
  });

  describe("administrative context, worked out by hand", () => {
    it("places a point in the interior of one region and one governorate, and measures the geodesic distance to their edges", async () => {
      const result = await analyse(point(42.5, 22.5));
      const m = metricsOf(result);
      expect(m["context.country"]).toMatchObject({ status: "COMPUTED", value: "ZZ" });
      expect(m["context.within_boundary"]).toMatchObject({ status: "COMPUTED", value: true });
      expect(m["context.region"]).toMatchObject({ status: "COMPUTED", value: "West Region" });
      expect(m["context.governorate"]).toMatchObject({ status: "COMPUTED", value: "Alpha" });
      within(m["context.region.boundary_distance"]?.value, toMeridian(22.5, 2.5), 0.006);
      within(m["context.governorate.boundary_distance"]?.value, toMeridian(22.5, 2.5), 0.006);
      expect(result.status).toBe("COMPLETED_WITH_GAPS");
      expect(gapsOf(result, "ADMIN_NEAR_BOUNDARY")).toEqual([]);
      expectNoVerdictsAndNoPercentages(result);
    });

    it("flags a point 925 m from an edge, with the distance a hand calculation gives, and grades its assignment lower than an interior one", async () => {
      const near = await analyse(point(44.991, 22.5));
      const interior = await analyse(point(42.5, 22.5));
      const m = metricsOf(near);
      within(m["context.governorate.boundary_distance"]?.value, toMeridian(22.5, 0.009), 0.005);
      expect(m["context.governorate.boundary_distance"]?.value).toBeLessThan(1000);
      expect(gapsOf(near, "ADMIN_NEAR_BOUNDARY").map((gap) => gap.subject).sort()).toEqual(["primary/context.governorate", "primary/context.region"]);
      expect(m["context.governorate"]?.confidence?.score).toBeLessThan(metricsOf(interior)["context.governorate"]?.confidence?.score as number);
    });

    it("states no single region or governorate for a point on the edge they share, lists the candidates, and does not choose", async () => {
      const result = await analyse(point(45.0, 22.0));
      const m = metricsOf(result);
      for (const key of ["context.region", "context.region.boundary_distance", "context.governorate", "context.governorate.boundary_distance"]) {
        expect(m[key], key).toMatchObject({ status: "NOT_COMPUTABLE", value: null, confidence: null });
      }
      expect(m["context.region.intersecting_units"]?.value).toBe("East Region | West Region");
      expect(m["context.governorate.intersecting_units"]?.value).toBe("Alpha | Gamma");
      expect(gapsOf(result, "ADMIN_AMBIGUOUS_ON_BOUNDARY")).toHaveLength(2);
      expect(m["context.within_boundary"]).toMatchObject({ status: "COMPUTED", value: true });
    });

    it("keeps the region but not the governorate for a point on the edge two governorates share", async () => {
      const m = metricsOf(await analyse(point(42.0, 25.0)));
      expect(m["context.region"]).toMatchObject({ status: "COMPUTED", value: "West Region" });
      expect(m["context.governorate"]).toMatchObject({ status: "NOT_COMPUTABLE", value: null });
      expect(m["context.governorate.intersecting_units"]?.value).toBe("Alpha | Beta");
    });

    it("does not choose between overlapping polygons either", async () => {
      const m = metricsOf(await analyse(point(46.5, 22.5)));
      expect(m["context.region"]?.value).toBe("East Region");
      expect(m["context.governorate"]).toMatchObject({ status: "NOT_COMPUTABLE", value: null });
      expect(m["context.governorate.intersecting_units"]?.value).toBe("Delta | Gamma");
    });

    it("reports a hole in the boundary data as a gap, inside the country: a region but no governorate", async () => {
      const result = await analyse(point(49.5, 27.0));
      const m = metricsOf(result);
      expect(m["context.region"]).toMatchObject({ status: "COMPUTED", value: "East Region" });
      expect(m["context.governorate"]).toMatchObject({ status: "NOT_FOUND_WITHIN_RADIUS", value: null, platformState: "UNAVAILABLE" });
      expect(gapsOf(result, "ADMIN_UNIT_NOT_FOUND")).toHaveLength(1);
    });

    it("says nothing about a point outside the national boundary except that it is outside, and treats a point on the boundary as inside", async () => {
      const outside = await analyse(point(52, 25), ["place:neighbourhood"]);
      const m = metricsOf(outside);
      expect(m["context.within_boundary"]).toMatchObject({ status: "COMPUTED", value: false });
      for (const key of ["context.country", "context.region", "context.governorate", "context.place:neighbourhood.nearest.distance"]) expect(m[key], key).toMatchObject({ status: "NO_COVERAGE", value: null });
      expect(outside.dataAvailability.filter((entry) => entry.status === "NO_COVERAGE").map((entry) => entry.role)).toEqual(["admin:governorate", "admin:region", "place:neighbourhood"]);
      const onEdge = metricsOf(await analyse(point(50.0, 25.0)));
      expect(onEdge["context.within_boundary"]).toMatchObject({ status: "COMPUTED", value: true });
      expect(onEdge["context.region"]).toMatchObject({ status: "COMPUTED", value: "East Region" });
      expect(onEdge["context.region.boundary_distance"]?.value).toBe(0);
    });

    it("assigns an area to the unit of its representative point, says it also touches another, and that the unit does not contain it all", async () => {
      const result = await analyse(rect(41, 23, 43, 26));
      const m = metricsOf(result);
      expect(m["context.governorate"]?.value).toBe("Alpha");
      expect(m["context.governorate.contains_target"]).toMatchObject({ status: "COMPUTED", value: false });
      expect(m["context.governorate.boundary_distance"]?.value).toBe(0);
      expect(m["context.governorate.intersecting_units"]?.value).toBe("Alpha | Beta");
      expect(m["context.region.contains_target"]).toMatchObject({ status: "COMPUTED", value: true });
      expect(gapsOf(result, "ADMIN_TARGET_SPANS_UNITS")).toHaveLength(1);
      expect(m["context.governorate"]?.limitations).toContain("For an area the unit is stated for its representative point (42.000000, 24.500000).");
    });

    it("grades an area half inside the national boundary as partial, with the covered share close to a half", async () => {
      const result = await analyse(rect(49, 24, 51, 26));
      const m = metricsOf(result);
      expect(m["context.within_boundary"]).toMatchObject({ status: "COMPUTED", value: false });
      expect(m["context.region"]).toMatchObject({ status: "PARTIAL", value: "East Region" });
      expect(m["context.region"]?.platformState).toBe("COMPUTED");
      const points = m["context.region"]?.confidence?.factors.find((factor) => factor.key === "coverage")?.points as number;
      expect(points).toBeGreaterThanOrEqual(12); // 25 x a covered share of about one half
      expect(points).toBeLessThanOrEqual(13);
      expect(gapsOf(result, "COVERAGE_PARTIAL").length).toBeGreaterThanOrEqual(2);
    });

    it("analyses a main location and its candidates against the same data, each with its own answer", async () => {
      const result = await analyse(point(45.0, 22.0), [], { candidates: [{ id: "site-a", location: point(42.5, 22.5) }, { id: "site-b", location: point(52, 25) }] });
      expect(result.results.map((entry) => entry.target)).toEqual(["primary", "site-a", "site-b"]);
      expect(statuses(result, "primary")["context.region"]).toBe("NOT_COMPUTABLE");
      expect(statuses(result, "site-a")["context.region"]).toBe("COMPUTED");
      expect(statuses(result, "site-b")["context.region"]).toBe("NO_COVERAGE");
      expect(result.dataAvailability.find((entry) => entry.role === "admin:region")?.status).toBe("AVAILABLE");
    });
  });

  describe("the nearest place, worked out by hand", () => {
    it("finds the nearest neighbourhood by geodesic distance and stops at the first ring that holds it", async () => {
      const result = await analyse(point(42.0, 22.01), ["place:neighbourhood"]);
      const m = metricsOf(result);
      const distance = m["context.place:neighbourhood.nearest.distance"];
      expect(distance).toMatchObject({ status: "COMPUTED", unit: "m" });
      within(distance?.value, haversine([42.0, 22.01], [42.0, 22.0]), 0.005);
      expect(m["context.place:neighbourhood.nearest.name"]?.value).toBe("Hayy Alpha");
      expect(distance?.confidence?.band).toBe("MEDIUM");
    });

    it("reports nothing found within the searched distance as exactly that, at the limit the request sets", async () => {
      for (const [roles, limit] of [[["place:locality"], 5000], [["place:neighbourhood"], 1000]] as const) {
        const result = await analyse(point(42.0, 22.01), [...roles], { parameters: { roles: [...roles], maxSearchMeters: limit } });
        const m = metricsOf(result);
        const distance = m[`context.${roles[0]}.nearest.distance`];
        expect(distance, roles[0]).toMatchObject({ status: "NOT_FOUND_WITHIN_RADIUS", value: null, platformState: "UNAVAILABLE" });
        expect(distance?.limitations).toContain(`Nothing mapped of this kind was found within ${limit} m.`);
      }
    });

    it("reads the nearest place of any kind for the role `place`, and says which kind it is", async () => {
      const m = metricsOf(await analyse(point(47.5, 26.99), ["place"]));
      expect(m["context.place.nearest.kind"]).toMatchObject({ status: "COMPUTED", value: "locality" });
      expect(m["context.place.nearest.name"]?.value).toBe("Qarya East");
    });

    it("measures to the nearest place of a kind, not the nearest place", async () => {
      const m = metricsOf(await analyse(point(47.0, 21.02), ["place:locality", "place:neighbourhood"]));
      expect(m["context.place:locality.nearest.name"]?.value).toBe("Qarya Gamma");
      expect(m["context.place:neighbourhood.nearest.distance"]?.status).toBe("NOT_FOUND_WITHIN_RADIUS");
    });
  });

  describe("two places that share a name are told apart by their reference", () => {
    const featureOf = (id: string) => withClient(adminUrl, async (client) => (await client.query(
      `SELECT label, "layerId", "releaseId"::text AS release, ST_X(geometry) AS lon, ST_Y(geometry) AS lat FROM jenan_map.feature WHERE id = $1::uuid`, [id],
    )).rows[0] as { label: string; layerId: string; release: string; lon: number; lat: number } | undefined);
    const KEY = "context.place:neighbourhood.nearest.feature_ref";

    it("names the nearest place of the published release by the id of its own feature, scoped to that release", async () => {
      const result = await analyse(point(42.0, 22.01), ["place:neighbourhood"]);
      const reference = metricsOf(result)[KEY]?.value as string;
      const parsed = parseMapFeatureRef(reference);
      expect(parsed?.releaseId).toBe(publishedId);
      expect(await featureOf(parsed?.featureId as string)).toMatchObject({ label: "Hayy Alpha", layerId: "places", release: publishedId, lon: 42, lat: 22 });
      expect(result.inputs.some((input) => input.id === `map:${publishedId}:places`)).toBe(true);
    });

    it("gives two neighbourhoods with one name, one kind and the same distance two references, each resolving to its own feature", async () => {
      // A release holding two neighbourhoods with the very same name, as the real Map does, read as a pinned release in development.
      const twinsId = await withClient(adminUrl, (client) => seedRelease(client, {
        ...standardRelease("synthetic-twins", "Ready"),
        features: [...standardFeatures().filter((entry) => entry.layerId !== "places"),
          { layerId: "places", label: "Hayy Twin", sourceId: placeId("neighbourhood", 11), geometry: point(41.0, 21.0) },
          { layerId: "places", label: "Hayy Twin", sourceId: placeId("neighbourhood", 12), geometry: point(48.0, 28.0) }],
      }));
      const data = { roles: { "place:neighbourhood": { source: "MAP", layerKey: "places", releaseId: twinsId } } };
      const west = await analyse(point(41.0, 21.01), ["place:neighbourhood"], { data });
      const east = await analyse(point(48.0, 28.01), ["place:neighbourhood"], { data });
      const [a, b] = [metricsOf(west), metricsOf(east)];
      // By name the two answers are the same answer ...
      expect(a["context.place:neighbourhood.nearest.name"]?.value).toBe("Hayy Twin");
      expect(b["context.place:neighbourhood.nearest.name"]?.value).toBe("Hayy Twin");
      within(a["context.place:neighbourhood.nearest.distance"]?.value, haversine([41.0, 21.01], [41.0, 21.0]), 0.005);
      within(b["context.place:neighbourhood.nearest.distance"]?.value, haversine([48.0, 28.01], [48.0, 28.0]), 0.005);
      // ... by reference they are not, and each reference leads to its own feature.
      const [westRef, eastRef] = [parseMapFeatureRef(a[KEY]?.value as string), parseMapFeatureRef(b[KEY]?.value as string)];
      expect(westRef?.releaseId).toBe(twinsId);
      expect(eastRef?.releaseId).toBe(twinsId);
      expect(westRef?.featureId).not.toBe(eastRef?.featureId);
      expect(await featureOf(westRef?.featureId as string)).toMatchObject({ label: "Hayy Twin", release: twinsId, lon: 41, lat: 21 });
      expect(await featureOf(eastRef?.featureId as string)).toMatchObject({ label: "Hayy Twin", release: twinsId, lon: 48, lat: 28 });
      expect(west.determinism.outputHash).not.toBe(east.determinism.outputHash);
    });

    it("tells them apart inside one run too, for a main location and a candidate", async () => {
      const twinsId = await withClient(adminUrl, (client) => seedRelease(client, {
        ...standardRelease("synthetic-twins-2", "Ready"),
        features: [...standardFeatures().filter((entry) => entry.layerId !== "places"),
          { layerId: "places", label: "Hayy Twin", sourceId: placeId("neighbourhood", 21), geometry: point(41.0, 21.0) },
          { layerId: "places", label: "Hayy Twin", sourceId: placeId("neighbourhood", 22), geometry: point(48.0, 28.0) }],
      }));
      const data = { roles: { "place:neighbourhood": { source: "MAP", layerKey: "places", releaseId: twinsId } } };
      const result = await engine(contextRequest({ location: point(41.0, 21.01), data, candidates: [{ id: "site-east", location: point(48.0, 28.01) }] }, ["place:neighbourhood"]));
      const primary = metricsOf(result, "primary");
      const candidate = metricsOf(result, "site-east");
      expect(primary["context.place:neighbourhood.nearest.name"]?.value).toBe(candidate["context.place:neighbourhood.nearest.name"]?.value);
      expect(primary[KEY]?.value).not.toBe(candidate[KEY]?.value);
      expect(await featureOf(parseMapFeatureRef(primary[KEY]?.value as string)?.featureId as string)).toMatchObject({ lon: 41, lat: 21 });
      expect(await featureOf(parseMapFeatureRef(candidate[KEY]?.value as string)?.featureId as string)).toMatchObject({ lon: 48, lat: 28 });
    });

    it("gives no reference where it gives no place", async () => {
      const result = await analyse(point(42.0, 22.01), ["place:locality"], { parameters: { roles: ["place:locality"], maxSearchMeters: 1000 } });
      expect(metricsOf(result)["context.place:locality.nearest.feature_ref"]).toMatchObject({ status: "NOT_FOUND_WITHIN_RADIUS", value: null, confidence: null });
    });
  });

  describe("a changed Map format makes the answer unavailable, not wrong", () => {
    it("refuses to name the nearest neighbourhood when a feature of unknown kind is nearer, and says so, for a release pinned in development", async () => {
      const brokenId = await withClient(adminUrl, (client) => seedRelease(client, {
        ...standardRelease("synthetic-broken", "Ready"),
        features: [...standardFeatures().filter((entry) => entry.layerId !== "places"),
          { layerId: "places", label: "Hayy Alpha", sourceId: placeId("neighbourhood", 1), geometry: point(42.0, 22.0) },
          { layerId: "places", label: "Hayy Broken", sourceId: "places:neighbourhood:12/100/200", geometry: point(42.0, 22.005) }],
      }));
      const pin = { "place:neighbourhood": { source: "MAP", layerKey: "places", releaseId: brokenId } };
      const result = await analyse(point(42.0, 22.01), ["place:neighbourhood"], { data: { roles: pin } });
      const m = metricsOf(result);
      expect(m["context.place:neighbourhood.nearest.distance"]).toMatchObject({ status: "NOT_COMPUTABLE", value: null });
      expect(gapsOf(result, "MAP_SOURCE_ID_UNRECOGNIZED")).toHaveLength(1);
      expect(result.inputs.find((input) => input.id.includes(brokenId))?.governance).toBe("MAP_UNREGISTERED");
      expect(m["context.region"]?.status).toBe("COMPUTED");
      const excluded = await engine(contextRequest({ location: point(42.0, 22.01), data: { roles: pin } }, ["place:neighbourhood"]), { environment: "production", url: readOnlyUrl });
      expect(metricsOf(excluded)["context.place:neighbourhood.nearest.distance"]).toMatchObject({ status: "NOT_AVAILABLE", value: null });
      expect(gapCodes(excluded)).toEqual(expect.arrayContaining(["DATASET_NOT_AVAILABLE", "UNREGISTERED_LAYERS_EXCLUDED"]));
    });

    it("refuses to run at all against a Map whose tables have changed under the engine", async () => {
      const drifting = await createMapDatabase();
      databases.push(drifting);
      await withClient(urlFor(drifting), (client) => client.query(`ALTER TABLE jenan_map.feature RENAME COLUMN "sourceId" TO source_id`));
      const error: EngineError = await failureOf(engine(contextRequest({}, ["place:neighbourhood"]), { url: urlFor(drifting) }));
      expect(error).toMatchObject({ code: "BACKEND_UNAVAILABLE", details: { backend: "POSTGIS", reason: "MAP_CONTRACT_MISMATCH" } });
    });
  });

  describe("production", () => {
    it("runs through the read-only role, reads registered layers only, and says so", async () => {
      const result = await engine(contextRequest({ location: point(42.0, 22.01) }, ["place:neighbourhood"]), { environment: "production", url: readOnlyUrl });
      expect(result.engine).toMatchObject({ environment: "production", runtime: { backend: "POSTGIS", placement: "DEDICATED_CONNECTION" } });
      expect(result.request.mapLayerPolicy).toBe("REGISTERED_ONLY");
      expect(result.inputs.every((input) => input.governance === "MAP_REGISTERED")).toBe(true);
      expect(statuses(result)["context.place:neighbourhood.nearest.distance"]).toBe("COMPUTED");
      expect(result.engine.runtime.postgis).toMatch(/^3\./);
    });

    it("refuses a role that could write to the Map, however the request is written", async () => {
      const error = await failureOf(engine(contextRequest({}, ["place:neighbourhood"]), { environment: "production" }));
      expect(error).toMatchObject({ code: "BACKEND_UNAVAILABLE", details: { reason: "ROLE_CAN_WRITE" } });
    });

    it("refuses a production request for unregistered layers before it reads the Map", async () => {
      const error = await failureOf(engine(contextRequest({ mapLayerPolicy: "ALLOW_UNREGISTERED" }, []), { environment: "production", url: readOnlyUrl }));
      expect(error).toMatchObject({ code: "MAP_LAYER_POLICY_VIOLATION", status: 403 });
    });

    it("leaves a layer whose binding the Map disabled out of a production run, and uses it, labelled, in development", async () => {
      await withAdmin((client) => client.query(`UPDATE jenan_map.release_layer SET enabled = false WHERE "layerId" = 'places'`), database);
      try {
        const production = await engine(contextRequest({ location: point(42.0, 22.01) }, ["place:neighbourhood"]), { environment: "production", url: readOnlyUrl });
        expect(metricsOf(production)["context.place:neighbourhood.nearest.distance"]).toMatchObject({ status: "NOT_AVAILABLE", value: null });
        expect(gapCodes(production)).toEqual(expect.arrayContaining(["DATASET_NOT_AVAILABLE", "UNREGISTERED_LAYERS_EXCLUDED"]));
        const development = await analyse(point(42.0, 22.01), ["place:neighbourhood"]);
        expect(development.inputs.find((input) => input.id.endsWith(":places"))?.governance).toBe("MAP_UNREGISTERED");
        expect(gapCodes(development)).toContain("MAP_LAYER_UNREGISTERED");
        expect(metricsOf(development)["context.place:neighbourhood.nearest.distance"]?.confidence?.caps.map((cap) => cap.code)).toContain("MAP_LAYER_UNREGISTERED");
      } finally {
        await withAdmin((client) => client.query(`UPDATE jenan_map.release_layer SET enabled = true WHERE "layerId" = 'places'`), database);
      }
    });

    it("follows the Map's own state: in maintenance or disabled it has no registered data, and the result says why", async () => {
      try {
        for (const [status, release] of [["maintenance", publishedId], ["disabled", null]] as const) {
          await withClient(adminUrl, (client) => setRuntime(client, status, release));
          const production = await engine(contextRequest({}, ["place:neighbourhood"]), { environment: "production", url: readOnlyUrl });
          expect(Object.values(statuses(production)).every((value) => value === "NOT_AVAILABLE")).toBe(true);
          expect(gapsOf(production, "MAP_NOT_PUBLISHED")[0]?.message.en).toContain(`(state: ${release === null ? "disabled" : status})`);
          expect(production.inputs).toEqual([]);
          expect(production.rights).toEqual({ allowExport: false, denials: [{ reason: "NO_INPUTS" }] });
        }
        await withClient(adminUrl, (client) => setRuntime(client, "maintenance", publishedId));
        const development = await analyse(point(42.5, 22.5), []);
        expect(gapCodes(development)).toContain("MAP_NOT_PUBLISHED");
        expect(statuses(development)["context.region"]).toBe("COMPUTED");
        expect(development.inputs.every((input) => input.governance === "MAP_UNREGISTERED")).toBe(true);
      } finally {
        await withClient(adminUrl, (client) => setRuntime(client, "enabled", publishedId));
      }
    });
  });

  describe("what a run leaves behind", () => {
    const fingerprint = () => withAdmin(async (client) => {
      const parts: string[] = [];
      for (const table of ["release", "boundary", "feature", "release_layer", "runtime", "layer", "audit", "artifact"]) {
        const row = (await client.query(`SELECT count(*)::text AS n, coalesce(md5(string_agg(xmin::text || ':' || ctid::text, ',' ORDER BY ctid)), '') AS h FROM jenan_map."${table}"`)).rows[0];
        parts.push(`${table}=${row.n}/${row.h}`);
      }
      return parts.join("|");
    }, database);

    it("changes nothing in the Map, even when the connection is a role that could write", async () => {
      const before = await fingerprint();
      await engine(contextRequest({ location: point(42.0, 22.01), candidates: [{ id: "site-a", location: rect(41, 23, 43, 26) }] }, ["place:neighbourhood", "place"]));
      await engine(contextRequest({ location: point(52, 25) }, ["place:neighbourhood"]));
      await engine(contextRequest({ location: point(45, 22) }, []));
      expect(await fingerprint()).toBe(before);
    });

    it("is reproducible: the same request against the same Map gives the same hashes and the same result", async () => {
      const request = contextRequest({ location: point(42.0, 22.01) }, ["place:neighbourhood"]);
      const first = await engine(request);
      const second = await engine(request, { newRunId: () => "run-2" });
      expect(second.determinism).toEqual(first.determinism);
      expect({ ...second, runId: "" }).toEqual({ ...first, runId: "" });
    });

    it("produces a result the shared run record accepts, ready to be stored append-only", async () => {
      const result: SpatialResult = await engine(contextRequest({ location: point(42.0, 22.01) }, ["place:neighbourhood"]));
      const record = buildRunRecord(result, { actor: { kind: "SYSTEM", id: null }, createdAt: CLOCK });
      expect(runRecordSchema.parse(record)).toEqual(record);
      expect(record.inputs.map((row) => row.refSystem)).toEqual(["JENAN_MAP", "JENAN_MAP", "JENAN_MAP", "JENAN_MAP"]);
    });
  });
});
