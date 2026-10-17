import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";

vi.mock("@/lib/db", () => ({ db: {} }));
import { bindReleaseLayers, readyLayerSearchFilter, releaseManifestLayers, releaseMapLayers } from "@/services/jenan-map/layers";

const databaseUrl = process.env.JENAN_MAP_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("durable release bindings on disposable PostgreSQL", () => {
  let client: pg.Client;
  const schema = `binding_fixture_${randomUUID().replaceAll("-", "")}`;
  const first = randomUUID();
  const second = randomUUID();
  const rewrite = (sql: string) => sql.replaceAll("jenan_map.", `${schema}.`);
  const executor = {
    async $queryRaw(query: Prisma.Sql) {
      return (await client.query(rewrite(query.text), query.values)).rows;
    },
    async $executeRaw(query: Prisma.Sql) {
      return (await client.query(rewrite(query.text), query.values)).rowCount;
    },
  } as unknown as Parameters<typeof bindReleaseLayers>[0];

  async function rejected(sql: string, pattern: RegExp) {
    await client.query("SAVEPOINT expected_binding_rejection");
    try {
      await expect(client.query(rewrite(sql))).rejects.toThrow(pattern);
    } finally {
      await client.query("ROLLBACK TO SAVEPOINT expected_binding_rejection");
      await client.query("RELEASE SAVEPOINT expected_binding_rejection");
    }
  }

  beforeAll(async () => {
    const target = new URL(databaseUrl!);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) || target.pathname !== "/jenan_map_test") {
      throw new Error("Layer fixtures require the disposable loopback jenan_map_test database");
    }
    client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA ${schema};
      CREATE TABLE ${schema}.release (
        id uuid PRIMARY KEY, status text NOT NULL, source text NOT NULL DEFAULT 'Synthetic fixture',
        version text NOT NULL DEFAULT 'test-only', "sourceDate" timestamptz NOT NULL DEFAULT now(),
        license text NOT NULL DEFAULT 'Test fixtures only');
      CREATE TABLE ${schema}.feature ("releaseId" uuid, category text);
    `);
    for (const path of [
      "prisma/jenan-map/migrations/20261017140000_map_layer_catalog/migration.sql",
      "prisma/jenan-map/migrations/20261017170000_release_layer_bindings/migration.sql",
    ]) await client.query(rewrite(await readFile(path, "utf8")));
    await client.query(`INSERT INTO ${schema}.release (id,status) VALUES ($1,'Processing'),($2,'Processing')`, [first, second]);
  });

  afterAll(async () => {
    if (client) {
      await client.query("ROLLBACK");
      await client.end();
    }
  });

  it("persists independently bound renderer IDs per release without altering placeholder provenance", async () => {
    await client.query(`UPDATE ${schema}.layer SET confidence=0.99`);
    await bindReleaseLayers(executor, first, [
      { id: "base", styleLayerIds: ["base-first"], searchCategories: ["city", "address"] },
      { id: "roads", styleLayerIds: ["roads-first"], searchCategories: ["road"], confidence: 0.6 },
      { id: "businesses", styleLayerIds: ["private-first"], searchCategories: ["private"], visibility: "internal" },
    ], ["base-first", "roads-first", "private-first"]);
    await bindReleaseLayers(executor, second, [
      { id: "roads", styleLayerIds: ["roads-second"], searchCategories: ["road"] },
    ], ["roads-second"]);
    expect((await releaseMapLayers(first, executor)).map((row) => [row.id, row.styleLayerIds])).toEqual([
      ["base", ["base-first"]], ["roads", ["roads-first"]],
    ]);
    expect((await releaseMapLayers(second, executor)).map((row) => row.styleLayerIds)).toEqual([["roads-second"]]);
    expect((await releaseMapLayers(first, executor)).map((row) => row.confidence)).toEqual([null, 0.6]);
    expect((await client.query(`SELECT status,source FROM ${schema}.layer WHERE id='roads'`)).rows[0])
      .toEqual({ status: "unavailable", source: null });
  });

  it("uses exactly the same public-ready-enabled bindings for search and excludes internal data", async () => {
    await client.query(`INSERT INTO ${schema}.feature VALUES ($1,'city'),($1,'address'),($1,'road'),($1,'private')`, [first]);
    const filter = readyLayerSearchFilter(first);
    const result = await client.query(rewrite(`SELECT f.category FROM jenan_map.feature f WHERE ${filter.text} ORDER BY f.category`), filter.values);
    expect(result.rows.map((row) => row.category)).toEqual(["address", "city", "road"]);
    const selected = readyLayerSearchFilter(first, []);
    const base = await client.query(rewrite(`SELECT f.category FROM jenan_map.feature f WHERE ${selected.text} ORDER BY f.category`), selected.values);
    expect(base.rows.map((row) => row.category)).toEqual(["address", "city"]);
  });

  it("removes a disabled binding from both manifest readiness and search but not another release", async () => {
    await client.query(`UPDATE ${schema}.release_layer SET enabled=false,revision=revision+1 WHERE "releaseId"=$1 AND "layerId"='roads'`, [first]);
    expect((await releaseMapLayers(first, executor)).map((row) => row.id)).toEqual(["base"]);
    expect((await releaseManifestLayers(first, executor)).map((row) => [row.id, row.available, row.styleLayerIds])).toEqual([
      ["base", true, ["base-first"]], ["roads", false, ["roads-first"]],
    ]);
    expect((await releaseMapLayers(second, executor)).map((row) => row.id)).toEqual(["roads"]);
    const filter = readyLayerSearchFilter(first);
    const result = await client.query(rewrite(`SELECT f.category FROM jenan_map.feature f WHERE ${filter.text} ORDER BY f.category`), filter.values);
    expect(result.rows.map((row) => row.category)).toEqual(["address", "city"]);
  });

  it("retains immutable release binding provenance and rejects inserts outside Processing", async () => {
    await rejected(`UPDATE jenan_map.release_layer SET "styleLayerIds"=ARRAY['changed'] WHERE "releaseId"='${first}'`, /provenance is immutable/);
    await rejected(`UPDATE jenan_map.release_layer SET visibility='public' WHERE "releaseId"='${first}' AND "layerId"='businesses'`, /provenance is immutable/);
    await rejected(`UPDATE jenan_map.release_layer SET confidence=1 WHERE "releaseId"='${first}'`, /provenance is immutable/);
    await rejected(`DELETE FROM jenan_map.release_layer WHERE "releaseId"='${first}'`, /must be retained/);
    await client.query(`UPDATE ${schema}.release SET status='Ready' WHERE id=$1`, [first]);
    await rejected(`INSERT INTO jenan_map.release_layer ("releaseId","layerId",visibility,"styleLayerIds")
      VALUES ('${first}','pois','public',ARRAY['new-pois'])`, /require Processing/);
  });
});
