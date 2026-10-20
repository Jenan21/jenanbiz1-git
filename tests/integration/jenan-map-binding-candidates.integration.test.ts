import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { describe, expect, it } from "vitest";

const connection = process.env.JENAN_MAP_TEST_DATABASE_URL;
describe.skipIf(!connection)("additive layer-binding candidate import migration", () => {
  it("accepts unreviewed candidate states while preserving reviewed-release and provenance guards", async () => {
    const target = new URL(connection!);
    if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.pathname !== "/jenan_map_test")
      throw new Error("A disposable loopback map test database is required");
    const client = new pg.Client({ connectionString: connection });
    const schema = `candidate_fixture_${randomUUID().replaceAll("-", "")}`;
    const rewrite = (text: string) => text.replaceAll("jenan_map.", `${schema}.`);
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query(`CREATE SCHEMA ${schema};
        CREATE TABLE ${schema}.release (id uuid PRIMARY KEY, status text NOT NULL);`);
      for (const file of [
        "20261017140000_map_layer_catalog", "20261017170000_release_layer_bindings",
        "20261017180000_map_candidate_layer_bindings",
      ]) await client.query(rewrite(await readFile(`prisma/jenan-map/migrations/${file}/migration.sql`, "utf8")));
      for (const status of ["Draft", "Processing", "Ready", "Approved", "Published", "Archived"]) {
        const releaseId = randomUUID();
        await client.query(`INSERT INTO ${schema}.release VALUES ($1,$2)`, [releaseId, status]);
        await client.query("SAVEPOINT candidate_insert");
        const insert = client.query(`INSERT INTO ${schema}.release_layer
          ("releaseId","layerId",visibility,"styleLayerIds") VALUES ($1,'roads','public',ARRAY['road-line'])`, [releaseId]);
        if (["Draft", "Processing", "Ready"].includes(status)) {
          await expect(insert).resolves.toMatchObject({ rowCount: 1 });
        } else {
          await expect(insert).rejects.toThrow("unreviewed");
          await client.query("ROLLBACK TO SAVEPOINT candidate_insert");
        }
        await client.query("RELEASE SAVEPOINT candidate_insert");
      }
      await client.query("SAVEPOINT provenance");
      await expect(client.query(`UPDATE ${schema}.release_layer SET visibility='internal'`)).rejects.toThrow("provenance is immutable");
      await client.query("ROLLBACK TO SAVEPOINT provenance");
      await client.query("RELEASE SAVEPOINT provenance");
      await client.query("SAVEPOINT retention");
      await expect(client.query(`DELETE FROM ${schema}.release_layer`)).rejects.toThrow("must be retained");
      await client.query("ROLLBACK TO SAVEPOINT retention");
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
