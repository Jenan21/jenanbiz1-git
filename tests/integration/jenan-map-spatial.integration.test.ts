import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.JENAN_MAP_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("Jenan Map isolated synthetic PostGIS geometry", () => {
  let client: pg.Client;

  beforeAll(async () => {
    const target = new URL(databaseUrl!);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
        target.pathname !== "/jenan_map_test") {
      throw new Error("Spatial fixtures require the disposable loopback jenan_map_test database");
    }
    client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`
      CREATE TEMP TABLE jenan_map_spatial_fixture (id integer, geometry geometry(Point,4326));
      CREATE INDEX ON jenan_map_spatial_fixture USING gist ((geometry::geography));
      INSERT INTO jenan_map_spatial_fixture
        SELECT 1, ST_Project(ST_SetSRID(ST_MakePoint(46,24),4326)::geography,100,0)::geometry
        UNION ALL
        SELECT 2, ST_Project(ST_SetSRID(ST_MakePoint(46,24),4326)::geography,600,0)::geometry;
      ANALYZE jenan_map_spatial_fixture;
    `);
  });

  afterAll(async () => { await client?.end(); });

  it.each([500, 1000, 3000, 5000])("uses meters, not geometry degrees, at radius %i", async (radius) => {
    const result = await client.query<{ id: number }>(`
      SELECT id FROM jenan_map_spatial_fixture
      WHERE ST_DWithin(geometry::geography,
        ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3) ORDER BY id
    `, [46, 24, radius]);
    expect(result.rows.map((row) => row.id)).toEqual(radius === 500 ? [1] : [1, 2]);
  });

  it("makes geography distance eligible for a GiST index scan", async () => {
    await client.query("SET enable_seqscan = off");
    try {
      const result = await client.query<{ "QUERY PLAN": string }>(`
        EXPLAIN SELECT id FROM jenan_map_spatial_fixture
        WHERE ST_DWithin(geometry::geography,
          ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,$3)
      `, [46, 24, 500]);
      expect(result.rows.map((row) => row["QUERY PLAN"]).join("\n")).toMatch(/Index Scan|Bitmap Index Scan/);
    } finally { await client.query("RESET enable_seqscan"); }
  });

  it("does not mistake a polygon bounding box for border coverage", async () => {
    const result = await client.query<{ bbox: boolean; covered: boolean }>(`
      SELECT polygon && point AS bbox, ST_Covers(polygon,point) AS covered
      FROM (SELECT ST_GeomFromText($1,4326) AS polygon,
        ST_SetSRID(ST_MakePoint($2,$3),4326) AS point) fixture
    `, ["POLYGON((0 0,2 0,0 2,0 0))", 1.5, 1.5]);
    expect(result.rows[0]).toEqual({ bbox: true, covered: false });
  });
});
