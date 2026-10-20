import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { DbExecutor } from "@/lib/db";

// Foundation tests run against a real, migrated PostgreSQL database inside a transaction that is always rolled back.
const context = vi.hoisted(() => ({ tx: null as unknown, actual: null as unknown }));
vi.mock("@/lib/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db")>();
  context.actual = original.db;
  return { ...original, db: new Proxy(original.db, {
    get(target, key) {
      const tx = context.tx as Record<string | symbol, unknown> | null;
      if (tx && key === "$transaction") return async (callback: (executor: unknown) => Promise<unknown>) => callback(tx);
      if (tx) { const value = tx[key]; return typeof value === "function" ? value.bind(tx) : value; }
      return Reflect.get(target, key);
    },
  }) };
});
import { db } from "@/lib/db";
import { createDataCenterSource } from "@/services/data-center/service";
import type { DataCenterActor } from "@/services/data-center/contracts";

const enabled = process.env.DATA_CENTER_DATABASE_TESTS === "1";
const rollback = new Error("ROLLBACK_DATA_CENTER_TEST");
async function isolated(run: (tx: DbExecutor, admin: DataCenterActor) => Promise<void>) {
  const actual = context.actual as typeof db;
  await expect(actual.$transaction(async (tx) => {
    context.tx = tx;
    try {
      const user = await tx.user.create({ data: { email: `data-center-${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
      await run(tx, { id: user.id, systemRole: "ADMIN", kind: "HUMAN" });
      throw rollback;
    } finally { context.tx = null; }
  }, { timeout: 30_000 })).rejects.toBe(rollback);
}
// A failed statement aborts a PostgreSQL transaction, so every expected violation runs inside its own savepoint.
async function rejected(tx: DbExecutor, work: () => Promise<unknown>, pattern: RegExp) {
  await tx.$executeRawUnsafe("SAVEPOINT dc_expected_failure");
  try { await expect(work()).rejects.toThrow(pattern); } finally { await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT dc_expected_failure"); }
}
const sourceRow = (admin: DataCenterActor, over: Record<string, unknown> = {}) => ({ name: `S-${randomUUID()}`, kind: "MANUAL", scope: "PLATFORM" as const, ownerId: admin.id, owner: "Owner", license: "Open", ...over });
afterAll(async () => { if (enabled) await (context.actual as typeof db).$disconnect(); });

describe.skipIf(!enabled)("Data Center foundation on real PostgreSQL (always rolled back)", () => {
  it("stores source rights separately and enforces their invariants at the database boundary", async () => {
    await isolated(async (tx, admin) => {
      const owned = await createDataCenterSource({ name: "Jenan styles", kind: "MANUAL", scope: "PLATFORM", owner: "Jenan PRO", license: "Proprietary", ownership: "PLATFORM_OWNED", licenseClass: "JENAN_OWNED",
        usagePolicy: "Internal and published map use", attribution: "Jenan PRO", attributionRequired: true, sourceUrl: "https://jenanpro.sa" }, admin);
      expect(owned).toMatchObject({ ownership: "PLATFORM_OWNED", licenseClass: "JENAN_OWNED", license: "Proprietary", attributionRequired: true, sourceUrl: "https://jenanpro.sa" });
      const defaults = await createDataCenterSource({ name: "Unclassified", kind: "MANUAL", scope: "PLATFORM", owner: "Someone", license: "Unknown" }, admin);
      expect(defaults).toMatchObject({ ownership: "THIRD_PARTY", licenseClass: null, attribution: null, attributionRequired: false, allowExport: false });
      expect(defaults.usagePolicy).toMatch(/redistribution requires explicit permission/);
      const generated = await createDataCenterSource({ name: "Model output", kind: "GENERATED", scope: "PLATFORM", owner: "Jenan PRO", license: "Generated" }, admin);
      expect(generated.ownership).toBe("AI_GENERATED");

      await rejected(tx, () => tx.dataCenterSource.create({ data: sourceRow(admin, { kind: "GENERATED", ownership: "THIRD_PARTY" }) }), /DataCenterSource_ownership_kind_check/);
      await rejected(tx, () => tx.dataCenterSource.create({ data: sourceRow(admin, { kind: "MANUAL", ownership: "AI_GENERATED" }) }), /DataCenterSource_ownership_kind_check/);
      await rejected(tx, () => tx.dataCenterSource.create({ data: sourceRow(admin, { attributionRequired: true }) }), /DataCenterSource_attribution_required_check/);
      await rejected(tx, () => tx.dataCenterSource.create({ data: sourceRow(admin, { attribution: "   " }) }), /DataCenterSource_attribution_check/);
      await rejected(tx, () => tx.dataCenterSource.create({ data: sourceRow(admin, { usagePolicy: "  " }) }), /DataCenterSource_usagePolicy_check/);
      for (const sourceUrl of ["javascript:alert(1)", "ftp://example.test/x", "https://example.test/a b"])
        await rejected(tx, () => tx.dataCenterSource.create({ data: sourceRow(admin, { sourceUrl }) }), /DataCenterSource_sourceUrl_check/);
      await rejected(tx, () => tx.dataCenterSource.create({ data: sourceRow(admin, { licenseClass: "JENAN_OWNED", ownership: "THIRD_PARTY" }) }), /DataCenterSource_license_class_check/);
      await rejected(tx, () => tx.dataCenterSource.create({ data: sourceRow(admin, { licenseClass: "RESTRICTED", allowExport: true }) }), /DataCenterSource_license_class_check/);
      expect(await tx.dataCenterSource.count({ where: { ownerId: admin.id } })).toBe(3);
    });
  });
});
