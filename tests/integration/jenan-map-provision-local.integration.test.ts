import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MapCommand } from "@/services/jenan-map/contracts";
import { assertDisposableDatabase, createRealRelease, realArchive } from "./support/real-saudi-release";

// Provisions a PERSISTENT local map environment from REAL Saudi data, for the browser acceptance (tests/e2e/jenan-map-real.spec.ts) and for
// manual review in a browser. Release A (Jenan PRO Map Light) is approved, published and enabled; release B (Jenan PRO Map Dark) is built and
// left Ready, so the browser suite can approve, publish and roll it back through the administrator screens.
//   RUN_JENAN_MAP_PROVISION=1 DATABASE_URL=postgresql://.../jenan_map_e2e JENAN_MAP_LOCAL_RUN=<new absolute folder> \
//     node ./node_modules/vitest/vitest.mjs run tests/integration/jenan-map-provision-local.integration.test.ts
// It writes <JENAN_MAP_LOCAL_RUN>/state.json; the application server then runs with JENAN_MAP_STORAGE_ROOT and JENAN_MAP_BACKUP_ROOT pointing
// into the same folder (see docs/jenan-map.md).
const enabled = process.env.RUN_JENAN_MAP_PROVISION === "1";
const home = process.env.JENAN_MAP_LOCAL_RUN ?? "";
const staging = path.join(home, "staging"), storage = path.join(home, "storage"), backups = path.join(home, "backups");

describe.skipIf(!enabled)("provision a local real-data Jenan PRO Map environment", () => {
  let database: typeof import("@/lib/db");
  let service: typeof import("@/services/jenan-map/service");
  let adminId: string;

  beforeAll(async () => {
    assertDisposableDatabase(process.env.DATABASE_URL);
    if (!path.isAbsolute(home)) throw new Error("JENAN_MAP_LOCAL_RUN must be an absolute folder");
    await mkdir(home, { recursive: true, mode: 0o700 });
    // The storage must belong to this database: a folder that already holds artifacts would not match the releases created here.
    if ((await readdir(home)).length) throw new Error("JENAN_MAP_LOCAL_RUN must be empty: provision into a new folder");
    for (const folder of [staging, storage, backups]) await mkdir(folder, { mode: 0o700 });
    database = await import("@/lib/db");
    service = await import("@/services/jenan-map/service");
    adminId = (await database.db.user.create({ data: { email: `provision-admin-${randomUUID()}@example.invalid`, status: "ACTIVE", systemRole: "ADMIN" } })).id;
    Object.assign(process.env, { JENAN_MAP_BUILD_ACTOR: adminId, JENAN_MAP_STAGING_ROOT: staging, JENAN_MAP_STORAGE_ROOT: storage, JENAN_MAP_BACKUP_ROOT: backups });
  });
  afterAll(async () => { await database?.db.$disconnect(); });

  const execute = async (input: MapCommand) => service.command(input, adminId, await service.preverifyCommand(input));

  it("builds A (Light), publishes and enables it, and builds B (Dark) ready for review", async () => {
    const archive = await realArchive("saudi");
    const started = Date.now();
    const a = await createRealRelease({ label: "provisionA", archive, actor: adminId, staging, theme: "light" });
    console.log(`release A built in ${Math.round((Date.now() - started) / 1000)} s`);
    await execute({ action: "approve", releaseId: a, confirmation: "APPROVE", reason: "Local provisioning: real Saudi data, Light style" });
    const before = await service.runtime();
    await execute({ action: "publish", releaseId: a, expectedRevision: before.revision, expectedPublishedReleaseId: before.publishedReleaseId, confirmation: "PUBLISH", reason: "Local provisioning publish" });
    const published = await service.runtime();
    await execute({ action: "runtime", status: "enabled", expectedRevision: published.revision, expectedPublishedReleaseId: a, confirmation: "CHANGE RUNTIME", reason: "Local provisioning enable" });
    expect(await service.runtime()).toMatchObject({ status: "enabled", publishedReleaseId: a });

    const b = await createRealRelease({ label: "provisionB", archive, actor: adminId, staging, theme: "dark" });
    const versions = Object.fromEntries((await database.db.$queryRaw<Array<{ id: string; version: string; status: string }>>`
      SELECT id::text AS id, version, status FROM jenan_map.release WHERE id::text = ANY(${[a, b]})`).map((row) => [row.id, row]));
    expect([versions[a].status, versions[b].status]).toEqual(["Published", "Ready"]);
    await writeFile(path.join(home, "state.json"), JSON.stringify({
      createdAt: new Date().toISOString(), a: { id: a, version: versions[a].version, theme: "light" }, b: { id: b, version: versions[b].version, theme: "dark" },
      source: archive.manifest.source, storage, backups,
    }, null, 2));
    console.log(`provisioned: A=${versions[a].version} (published), B=${versions[b].version} (ready) in ${Math.round((Date.now() - started) / 1000)} s`);
  }, 3_600_000);
});
