import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildReadOnlyRoleStatements, openReadOnlySession, PostgisMapReader, type ReadOnlySession, type SessionPool,
} from "@/services/analysis-engines/spatial/adapters";
import { findMapIndexProblems, MAP_CONTRACT_TABLES } from "@/services/analysis-engines/spatial/map-contract";
import { MapReadError } from "@/services/analysis-engines/spatial/map-read-error";
import {
  createBareDatabase, createMapDatabase, createPostgisOnlyDatabase, dropDatabase, dropRole, postgisTestsEnabled, scratchName, urlFor, withAdmin, withClient,
} from "./support/spatial-engine-db";
import { placeId, point, seedRelease, setRuntime, standardRelease, tile, type SeedFeature } from "./support/synthetic-map";

/**
 * The adapter against a real PostGIS. The Map's schema is built by the Map's own migrations, then seeded through the Map's release state
 * machine. Enable with RUN_SPATIAL_ENGINE_POSTGIS_TESTS=1 and SPATIAL_ENGINE_TEST_ADMIN_URL (a loopback PostgreSQL with PostGIS).
 */
const databases: string[] = [];
const roles: string[] = [];
const readers: PostgisMapReader[] = [];
const sessions: ReadOnlySession[] = [];
const password = () => randomBytes(18).toString("base64url");
const reader = (connectionString: string, over: Record<string, unknown> = {}) => { const made = new PostgisMapReader({ connectionString, ...over }); readers.push(made); return made; };
const session = (connectionString: string, over: Record<string, unknown> = {}) => { const made = openReadOnlySession({ connectionString, ...over }); sessions.push(made); return made; };
const kindOf = async (work: Promise<unknown>) => ((await work.catch((error: unknown) => error)) as MapReadError).kind;
const sqlStateOf = async (work: Promise<unknown>) => ((await work.catch((error: unknown) => error)) as MapReadError).sqlState;

async function newRole(database: string, tables: readonly string[] = MAP_CONTRACT_TABLES) {
  const role = scratchName();
  const secret = password();
  roles.push(role);
  await withAdmin(async (client) => {
    for (const statement of buildReadOnlyRoleStatements({ role, password: secret, database })) {
      // Grant only the tables asked for, so a role that lacks one can be built.
      if (statement.startsWith("GRANT SELECT")) await client.query(`GRANT SELECT ON ${tables.map((table) => `"jenan_map"."${table}"`).join(", ")} TO "${role}"`);
      else await client.query(statement);
    }
  }, database);
  return { role, url: urlFor(database, { user: role, password: secret }) };
}

afterAll(async () => {
  await Promise.allSettled(readers.map((entry) => entry.close()));
  await Promise.allSettled(sessions.map((entry) => entry.close()));
  for (const name of databases) await dropDatabase(name).catch(() => undefined);
  for (const name of roles) await dropRole(name).catch(() => undefined);
}, 120_000);

describe.runIf(postgisTestsEnabled)("PostGIS Map adapter against the Map's real schema", () => {
  let database = "";
  let adminUrl = "";
  let releaseId = "";
  let readOnly: { role: string; url: string };

  beforeAll(async () => {
    database = await createMapDatabase();
    databases.push(database);
    adminUrl = urlFor(database);
    releaseId = await withClient(adminUrl, (client) => seedRelease(client, standardRelease("adapter-1")));
    readOnly = await newRole(database);
  }, 180_000);

  describe("the read contract", () => {
    it("matches the Map's own migrations: every table and column, with its exact type, geometry type and SRID", async () => {
      const capabilities = await reader(adminUrl).capabilities();
      expect(capabilities.contractProblems).toEqual([]);
      expect(capabilities).toMatchObject({ backend: "POSTGIS", readOnly: true, mapSchemaReachable: true });
      expect(capabilities.postgis).toMatch(/^3\.\d+/);
      expect(capabilities.geos).toMatch(/^3\.\d+/);
      expect(capabilities.proj).toMatch(/^\d+\.\d+/);
    });

    it("finds the indexes the queries rely on, including the one on the geography cast", async () => {
      const rows = await withClient(adminUrl, async (client) => (await client.query(
        `SELECT tablename AS "table", indexname AS name, indexdef AS definition FROM pg_indexes WHERE schemaname = 'jenan_map' AND tablename IN ('feature', 'boundary')`,
      )).rows as Array<{ table: string; name: string; definition: string }>);
      expect(findMapIndexProblems(rows)).toEqual([]);
    });

    it("sees the release the Map published, with its boundary and layers, and no more than the contract lists", async () => {
      const description = await reader(adminUrl).describeMap({ layers: ["regions", "governorates", "places", "pois"] });
      expect(description.runtime).toEqual({ status: "enabled", publishedReleaseId: releaseId });
      expect(description.release).toMatchObject({ id: releaseId, version: "adapter-1", status: "Published", license: "ODbL-1.0" });
      expect(description.release?.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
      expect(description.boundary).toMatchObject({ countryCode: "ZZ", official: false, boundingBox: { west: 40, south: 20, east: 50, north: 30 } });
      expect(description.layers.map((layer) => [layer.id, layer.hasFeatures, layer.binding?.status ?? null, layer.provenance !== null])).toEqual([
        ["regions", true, "ready", true], ["governorates", true, null, true], ["places", true, "ready", true], ["pois", false, null, false],
      ]);
    });

    it("reports a release that does not exist, and describes an unpublished one without calling it published", async () => {
      const draftId = await withClient(adminUrl, (client) => seedRelease(client, { ...standardRelease("adapter-ready", "Ready") }));
      const unpublished = await reader(adminUrl).describeMap({ releaseId: draftId, layers: ["places"] });
      expect(unpublished.release).toMatchObject({ id: draftId, status: "Ready", publishedAt: null });
      expect(unpublished.runtime?.publishedReleaseId).toBe(releaseId);
      const missing = await reader(adminUrl).describeMap({ releaseId: "0f3b2c1a-5d4e-4f60-8a9b-1c2d3e4f5a6b", layers: ["places"] });
      expect(missing.release).toBeNull();
      expect(missing.layers).toEqual([]);
    });

    it("answers for every geometry in order and reports an invalid one with PostGIS's own reason", async () => {
      const checks = await reader(adminUrl).checkGeometries([
        { type: "Point", coordinates: [42, 22] }, { type: "Polygon", coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] }, { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      ]);
      expect(checks[0]).toEqual({ valid: true });
      expect(checks[1]).toMatchObject({ valid: false, reason: expect.stringContaining("Self-intersection") });
      expect(checks[2]).toEqual({ valid: true });
    });
  });

  describe("the role the engine reads with", () => {
    it("is read-only by construction: no superuser, no write privilege, SELECT on exactly the contract tables", async () => {
      const capabilities = await reader(readOnly.url).capabilities();
      expect(capabilities).toMatchObject({ roleCanWrite: false, mapSchemaReachable: true, contractProblems: [] });
      const grants = await withAdmin(async (client) => (await client.query(
        `SELECT table_schema AS schema, table_name AS "table", privilege_type AS privilege FROM information_schema.table_privileges WHERE grantee = $1 ORDER BY 1, 2, 3`, [readOnly.role],
      )).rows as Array<{ schema: string; table: string; privilege: string }>, database);
      expect(grants.every((grant) => grant.schema === "jenan_map" && grant.privilege === "SELECT")).toBe(true);
      expect(grants.map((grant) => grant.table).sort()).toEqual([...MAP_CONTRACT_TABLES].sort());
    });

    it("reads everything the engine needs through that role", async () => {
      const made = reader(readOnly.url);
      expect((await made.describeMap({ layers: ["places"] })).release?.id).toBe(releaseId);
      expect((await made.locate({ releaseId, location: point(42.5, 22.5), levels: ["regions", "governorates"] })).coverage?.status).toBe("FULL");
      expect((await made.nearest({ releaseId, layerId: "places", location: point(42.0, 22.01), kind: "neighbourhood", rings: [3000], limit: 1 })).matches).toHaveLength(1);
    });

    it("tells a role that can write from one that cannot: a superuser, a member of pg_write_all_data, and a role with INSERT on a Map table", async () => {
      expect((await reader(adminUrl).capabilities()).roleCanWrite).toBe(true);
      const writer = await newRole(database);
      await withAdmin((client) => client.query(`GRANT pg_write_all_data TO "${writer.role}"`), database);
      expect((await reader(writer.url).capabilities()).roleCanWrite).toBe(true);
      const inserter = await newRole(database);
      await withAdmin((client) => client.query(`GRANT INSERT ON "jenan_map"."feature" TO "${inserter.role}"`), database);
      expect((await reader(inserter.url).capabilities()).roleCanWrite).toBe(true);
      const columnWriter = await newRole(database);
      await withAdmin((client) => client.query(`GRANT UPDATE (label) ON "jenan_map"."feature" TO "${columnWriter.role}"`), database);
      expect((await reader(columnWriter.url).capabilities()).roleCanWrite).toBe(true);
    });

    it("says the Map is not reachable for a role that lacks SELECT on one of its tables", async () => {
      const partial = await newRole(database, MAP_CONTRACT_TABLES.filter((table) => table !== "boundary"));
      expect(await reader(partial.url).capabilities()).toMatchObject({ mapSchemaReachable: false, roleCanWrite: false });
    });

    it("cannot write by any route: every statement is refused, the privilege layer holds even without read-only mode, and nothing in the Map changes", async () => {
      const state = () => withAdmin(async (client) => ({
        runtime: (await client.query(`SELECT status, "publishedReleaseId"::text AS "publishedReleaseId" FROM jenan_map.runtime`)).rows[0],
        audit: Number((await client.query(`SELECT count(*) AS n FROM jenan_map.audit`)).rows[0].n),
        features: Number((await client.query(`SELECT count(*) AS n FROM jenan_map.feature`)).rows[0].n),
        stray: (await client.query(`SELECT to_regclass('public.se_attempt') AS a, to_regclass('jenan_map.se_attempt') AS b`)).rows[0],
      }), database);
      const before = await state();
      const attempts = [
        `INSERT INTO jenan_map.audit (id, "actorId", action, metadata) VALUES (gen_random_uuid(), 'x', 'x', '{}')`,
        `UPDATE jenan_map.runtime SET status = 'disabled'`, `DELETE FROM jenan_map.feature`, `TRUNCATE jenan_map.feature`,
        `UPDATE jenan_map.feature SET label = 'x'`, `INSERT INTO jenan_map.release_layer ("releaseId", "layerId", visibility, "styleLayerIds") VALUES (gen_random_uuid(), 'places', 'public', ARRAY['x'])`,
        `CREATE TABLE public.se_attempt (x int)`, `CREATE TABLE jenan_map.se_attempt (x int)`, `CREATE SCHEMA se_attempt`, `DROP TABLE jenan_map.feature`,
        `ALTER TABLE jenan_map.feature ADD COLUMN x int`, `GRANT SELECT ON jenan_map.audit TO PUBLIC`, `CREATE ROLE se_attempt`,
        `SET default_transaction_read_only = off; INSERT INTO jenan_map.audit (id, "actorId", action, metadata) VALUES (gen_random_uuid(), 'x', 'x', '{}')`,
        `COMMIT; UPDATE jenan_map.runtime SET status = 'disabled'`,
      ];
      await withClient(readOnly.url, async (client) => {
        const refused = async (statement: string) => (await client.query(statement).then(() => null, (error: { code?: string }) => error?.code ?? "no code")) as string | null;
        for (const statement of attempts) expect(["42501", "25006"], statement).toContain(await refused(statement));
        // Leaving read-only mode does not help: the role simply holds no write privilege on anything.
        await client.query("SET default_transaction_read_only = off");
        await client.query("SELECT 1");
        for (const statement of attempts.slice(0, 6)) expect(await refused(statement), `without read-only mode: ${statement}`).toBe("42501");
      });
      expect(await state()).toEqual(before);
    });
  });

  describe("every session is a read-only snapshot, even for a role that could write", () => {
    const attempts: Array<[string, string, "READ_ONLY_VIOLATION"]> = [
      ["an INSERT", `INSERT INTO jenan_map.audit (id, "actorId", action, metadata) VALUES (gen_random_uuid(), 'x', 'x', '{}')`, "READ_ONLY_VIOLATION"],
      ["an UPDATE", `UPDATE jenan_map.runtime SET status = 'disabled'`, "READ_ONLY_VIOLATION"],
      ["a DELETE", `DELETE FROM jenan_map.audit`, "READ_ONLY_VIOLATION"],
      ["a TRUNCATE", `TRUNCATE jenan_map.audit`, "READ_ONLY_VIOLATION"],
      ["CREATE TABLE", `CREATE TABLE public.se_attempt (x int)`, "READ_ONLY_VIOLATION"],
      ["CREATE TEMP TABLE", `CREATE TEMP TABLE se_attempt (x int)`, "READ_ONLY_VIOLATION"],
      ["CREATE EXTENSION", `CREATE EXTENSION IF NOT EXISTS pgcrypto`, "READ_ONLY_VIOLATION"],
      ["SET TRANSACTION READ WRITE", `SET TRANSACTION READ WRITE`, "READ_ONLY_VIOLATION"],
    ];

    it.each(attempts)("refuses %s as a read-only violation", async (_label, statement, kind) => {
      const made = session(adminUrl);
      expect(await kindOf(made.run((query) => query(statement)))).toBe(kind);
    });

    it("leaves the Map exactly as it was after every one of those attempts", async () => {
      const made = session(adminUrl);
      for (const [, statement] of attempts) await made.run((query) => query(statement)).catch(() => undefined);
      const after = await withAdmin(async (client) => ({
        status: (await client.query(`SELECT status FROM jenan_map.runtime`)).rows[0].status,
        audit: Number((await client.query(`SELECT count(*) AS n FROM jenan_map.audit`)).rows[0].n),
        stray: (await client.query(`SELECT to_regclass('public.se_attempt') AS a`)).rows[0].a,
        extension: (await client.query(`SELECT count(*) AS n FROM pg_extension WHERE extname = 'pgcrypto'`)).rows[0].n,
      }), database);
      expect(after).toEqual({ status: "enabled", audit: 0, stray: null, extension: "0" });
    });

    it("opens a new snapshot every time: a transaction is never left open and a connection is reused cleanly", async () => {
      const made = session(adminUrl, { poolMax: 1 });
      for (let round = 0; round < 3; round += 1) {
        const [row] = await made.run((query) => query<{ readonly: string; level: string }>(
          `SELECT current_setting('transaction_read_only') AS readonly, current_setting('transaction_isolation') AS level`,
        ));
        expect(row).toEqual({ readonly: "on", level: "repeatable read" });
      }
      const idle = await withAdmin(async (client) => (await client.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1 AND state = 'idle in transaction'`, [database])).rows[0].n);
      expect(idle).toBe(0);
    });

    it("applies its time limits and search path to the snapshot only, and leaves the connection as it found it", async () => {
      const connection = new Client({ connectionString: adminUrl });
      await connection.connect();
      try {
        const single: SessionPool = { connect: async () => ({ query: (text, values) => connection.query(text, values), release: () => undefined }), end: async () => undefined };
        const made = openReadOnlySession({ connectionString: adminUrl, statementTimeoutMs: 4321, lockTimeoutMs: 1234 }, single);
        const [inside] = await made.run((query) => query<{ statement: string; lock: string; path: string; readonly: string }>(
          `SELECT current_setting('statement_timeout') AS statement, current_setting('lock_timeout') AS lock, current_setting('search_path') AS path, current_setting('transaction_read_only') AS readonly`,
        ));
        expect(inside).toEqual({ statement: "4321ms", lock: "1234ms", path: "pg_catalog, public", readonly: "on" });
        const afterwards = (await connection.query(`SELECT current_setting('statement_timeout') AS statement, current_setting('lock_timeout') AS lock, current_setting('transaction_read_only') AS readonly, current_setting('search_path') AS path`)).rows[0];
        expect(afterwards).toMatchObject({ statement: "0", lock: "0", readonly: "off" });
        expect(afterwards.path).not.toContain("pg_catalog");
      } finally {
        await connection.end();
      }
    });
  });

  describe("time limits", () => {
    it("stops a statement that runs past its limit and reports a timeout", async () => {
      const made = session(adminUrl, { statementTimeoutMs: 100 });
      const started = Date.now();
      expect(await kindOf(made.run((query) => query("SELECT pg_sleep(5)")))).toBe("TIMEOUT");
      expect(Date.now() - started).toBeLessThan(2500);
      expect(await sqlStateOf(made.run((query) => query("SELECT pg_sleep(5)")))).toBe("57014");
    });

    it("keeps working after a timeout: the connection is not left in a failed transaction", async () => {
      const made = session(adminUrl, { statementTimeoutMs: 100, poolMax: 1 });
      await made.run((query) => query("SELECT pg_sleep(5)")).catch(() => undefined);
      expect(await made.run((query) => query<{ n: number }>("SELECT 1 AS n"))).toEqual([{ n: 1 }]);
    });

    it("gives up waiting for a lock after its limit instead of queueing behind an exclusive lock", async () => {
      const locker = new Client({ connectionString: adminUrl });
      await locker.connect();
      try {
        await locker.query("BEGIN");
        await locker.query("LOCK TABLE jenan_map.feature IN ACCESS EXCLUSIVE MODE");
        const made = reader(adminUrl, { lockTimeoutMs: 200, statementTimeoutMs: 5000 });
        const started = Date.now();
        const failure = (await made.locate({ releaseId, location: point(42.5, 22.5), levels: ["regions"] }).catch((error: unknown) => error)) as MapReadError;
        expect(failure.kind).toBe("TIMEOUT");
        expect(failure.sqlState).toBe("55P03");
        expect(Date.now() - started).toBeLessThan(3000);
      } finally {
        await locker.query("ROLLBACK");
        await locker.end();
      }
      expect((await reader(adminUrl).locate({ releaseId, location: point(42.5, 22.5), levels: ["regions"] })).coverage?.status).toBe("FULL");
    });
  });

  describe("when PostGIS or the Map is not there", () => {
    it("reports PostGIS as missing, before anything else is asked of it", async () => {
      const bare = await createBareDatabase();
      databases.push(bare);
      const made = reader(urlFor(bare));
      expect(await kindOf(made.capabilities())).toBe("POSTGIS_MISSING");
      expect(await kindOf(made.checkGeometries([{ type: "Point", coordinates: [1, 1] }]))).toBe("POSTGIS_MISSING");
    });

    it("reports a database with PostGIS but without the Map, listing every table the contract needs", async () => {
      const empty = await createPostgisOnlyDatabase();
      databases.push(empty);
      const capabilities = await reader(urlFor(empty)).capabilities();
      expect(capabilities.mapSchemaReachable).toBe(false);
      expect(capabilities.contractProblems).toEqual(expect.arrayContaining(MAP_CONTRACT_TABLES.map((table) => `jenan_map.${table} is missing`)));
      expect(await kindOf(reader(urlFor(empty)).describeMap({ layers: ["places"] }))).toBe("SCHEMA_MISMATCH");
    });

    it("names each difference when the Map's tables are changed under the engine: a renamed column, a changed type, a dropped table", async () => {
      const drifting = await createMapDatabase();
      databases.push(drifting);
      const url = urlFor(drifting);
      const run = (sql: string) => withClient(url, (client) => client.query(sql));
      expect((await reader(url).capabilities()).contractProblems).toEqual([]);
      await run(`ALTER TABLE jenan_map.feature RENAME COLUMN "sourceId" TO source_id`);
      expect((await reader(url).capabilities()).contractProblems).toEqual(["jenan_map.feature.sourceId is missing"]);
      await run(`ALTER TABLE jenan_map.feature ALTER COLUMN geometry TYPE geometry(Geometry, 3857) USING ST_Transform(geometry, 3857)`);
      expect((await reader(url).capabilities()).contractProblems).toEqual(["jenan_map.feature.sourceId is missing", "jenan_map.feature.geometry is geometry(Geometry,3857), expected geometry(Geometry,4326)"]);
      await run(`DROP TABLE jenan_map.release_layer`);
      const final = await reader(url).capabilities();
      expect(final.mapSchemaReachable).toBe(false);
      expect(final.contractProblems).toContain("jenan_map.release_layer is missing");
      expect(final.contractProblems).toHaveLength(3);
    });
  });

  describe("when the database cannot be reached", () => {
    it("reports a closed port, a wrong password and a database that does not exist as unreachable, quickly and without leaking details", async () => {
      const closed = reader("postgresql://nobody:nothing@127.0.0.1:1/none", { connectionTimeoutMs: 1000 });
      const started = Date.now();
      const failure = (await closed.capabilities().catch((error: unknown) => error)) as MapReadError;
      expect(failure.kind).toBe("UNREACHABLE");
      expect(failure.message).toBe("UNREACHABLE");
      expect(Date.now() - started).toBeLessThan(4000);
      const wrong = await newRole(database);
      const rejected = reader(wrong.url.replace(/:[^:@/]+@/, ":wrong-password-123@"));
      expect(await kindOf(rejected.capabilities())).toBe("UNREACHABLE");
      expect(await kindOf(reader(urlFor("se_no_such_database")).capabilities())).toBe("UNREACHABLE");
    });
  });
});

/** A release with one valid neighbourhood 1.1 km from the target and one feature whose source id has changed shape, 0.55 km away. */
describe.runIf(postgisTestsEnabled)("PostGIS Map adapter: a changed sourceId format fails closed", () => {
  let database = "";
  let adminUrl = "";
  const variants: Array<[string, string | null]> = [
    ["a missing ordinal", `places:neighbourhood:12/100/200`],
    ["an upper-case kind", `places:Neighbourhood:${tile(5)}`],
    ["a suffix after the tile", `${placeId("neighbourhood", 6)}/extra`],
    ["another layer's prefix", `pois:neighbourhood:${tile(7)}`],
    ["no source id at all", null],
    ["an empty source id", ""],
    ["a kind separated by a different character", `places-neighbourhood-${tile(8)}`],
    ["a numeric kind", `places:123:${tile(9)}`],
  ];
  const releases = new Map<string, string>();

  beforeAll(async () => {
    database = await createMapDatabase();
    databases.push(database);
    adminUrl = urlFor(database);
    await withClient(adminUrl, async (client) => {
      for (const [label, brokenSourceId] of variants) {
        const features: SeedFeature[] = [
          { layerId: "places", label: "Valid neighbourhood", sourceId: placeId("neighbourhood", 1), geometry: point(42.0, 22.0) },
          { layerId: "places", label: `Broken: ${label}`, sourceId: brokenSourceId, geometry: point(42.0, 22.005) },
        ];
        releases.set(label, await seedRelease(client, { ...standardRelease(`drift-${label.replace(/\W+/g, "-")}`, "Ready"), features }));
      }
      releases.set("farther", await seedRelease(client, {
        ...standardRelease("drift-farther", "Ready"),
        features: [
          { layerId: "places", label: "Valid neighbourhood", sourceId: placeId("neighbourhood", 1), geometry: point(42.0, 22.0) },
          { layerId: "places", label: "Broken but farther", sourceId: "places:Neighbourhood:bad", geometry: point(42.0, 21.98) },
        ],
      }));
    });
  }, 180_000);

  const target = point(42.0, 22.01);

  it.each(variants.map(([label]) => label))("does not guess the kind of a feature with %s, and stops the search at it", async (label) => {
    const result = await reader(adminUrl).nearest({ releaseId: releases.get(label) as string, layerId: "places", location: target, kind: "neighbourhood", rings: [500, 1000, 3000], limit: 1 });
    expect(result.unrecognized.count).toBe(1);
    expect(result.unrecognized.nearestMeters).toBeGreaterThan(500);
    expect(result.unrecognized.nearestMeters).toBeLessThan(600);
    expect(result.searchedMeters).toBe(1000);
    expect(result.matches).toEqual([]); // the valid neighbourhood is 1.1 km away, beyond the unrecognized feature that stopped the search
  });

  it("still finds the valid neighbourhood when it is nearer than the feature it cannot read, and reports that feature", async () => {
    const result = await reader(adminUrl).nearest({ releaseId: releases.get("farther") as string, layerId: "places", location: target, kind: "neighbourhood", rings: [5000], limit: 1 });
    expect(result.matches.map((match) => [match.label, match.kind])).toEqual([["Valid neighbourhood", "neighbourhood"]]);
    expect(result.unrecognized.count).toBe(1);
    expect(result.matches[0]?.distanceMeters).toBeGreaterThan(1000);
    expect(result.matches[0]?.distanceMeters).toBeLessThan(result.unrecognized.nearestMeters as number);
  });

  it("matches the wanted kind exactly: another kind is neither returned nor counted as unrecognized", async () => {
    const result = await reader(adminUrl).nearest({ releaseId: releases.get("farther") as string, layerId: "places", location: point(42.0, 22.0), kind: "locality", rings: [500], limit: 1 });
    expect(result.matches).toEqual([]);
    expect(result.unrecognized.count).toBe(0);
  });

  it("returns the whole recognized place list when no kind is asked for, without a kind it had to guess", async () => {
    const result = await reader(adminUrl).nearest({ releaseId: releases.get("farther") as string, layerId: "places", location: point(42.0, 22.0), kind: null, rings: [500], limit: 5 });
    expect(result.matches.map((match) => match.kind)).toEqual(["neighbourhood"]);
  });
});

/** The role and runtime states the engine will meet in production. */
describe.runIf(postgisTestsEnabled)("PostGIS Map adapter: the Map's own states", () => {
  it("reads the runtime exactly as the Map has set it", async () => {
    const database = await createMapDatabase();
    databases.push(database);
    const url = urlFor(database);
    const id = await withClient(url, (client) => seedRelease(client, standardRelease("states-1")));
    const made = reader(url);
    for (const status of ["maintenance", "disabled"] as const) {
      await withClient(url, (client) => setRuntime(client, status, id));
      expect((await made.describeMap({ layers: [] })).runtime).toEqual({ status, publishedReleaseId: id });
    }
    await withClient(url, (client) => setRuntime(client, "disabled", null));
    expect(await made.describeMap({ layers: ["places"] })).toEqual({ runtime: { status: "disabled", publishedReleaseId: null }, release: null, boundary: null, layers: [] });
  });
});
