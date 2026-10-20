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
import { createDataCenterItem, createDataCenterSource, reviewDataCenterItem, transitionDataCenterItem } from "@/services/data-center/service";
import { retrieveDataCenterContext } from "@/services/data-center/retrieval";
import { grantDataCenterRobotAccess, revokeDataCenterRobotAccess } from "@/services/data-center/robot-grants";
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
async function publish(itemId: string, actor: DataCenterActor) {
  await transitionDataCenterItem({ itemId, status: "IN_REVIEW", reason: "Submit reviewed source" }, actor);
  await reviewDataCenterItem({ itemId, decision: "APPROVED", notes: "Methodology reviewed; evidence label retained" }, actor);
  await transitionDataCenterItem({ itemId, status: "APPROVED", reason: "Approval recorded" }, actor);
  await transitionDataCenterItem({ itemId, status: "PUBLISHED", reason: "Release labelled estimate" }, actor);
}
const dataset = (sourceId: string, title: string, content: string, extra: Record<string, unknown> = {}) =>
  ({ sourceId, title, typeKey: "dataset", layer: "DATA" as const, content, evidenceStatus: "ESTIMATED" as const, ...extra });
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
  it("gives robots no implicit access: grants are explicit, expiring, revocable and protected by the database", async () => {
    await isolated(async (tx, admin) => {
      const robot = await tx.robot.create({ data: { name: "Analyst", slug: `analyst-${randomUUID()}` } });
      const stranger = await tx.robot.create({ data: { name: "Unassigned", slug: `stranger-${randomUUID()}` } });
      const mission = await tx.mission.create({ data: { name: "Demography study", assignedRobots: { connect: { id: robot.id } } } });
      const principal = await tx.user.create({ data: { email: `robot-${randomUUID()}@example.test`, status: "ACTIVE" } });
      const identity: DataCenterActor = { id: principal.id, systemRole: "ADMIN", kind: "AI", robotId: robot.id, roleKey: "analyst", specialty: "demography", missionId: mission.id };
      const granted = await createDataCenterSource({ name: "Granted source", kind: "OFFICIAL", scope: "PLATFORM", owner: "Authority", license: "Open" }, admin);
      const other = await createDataCenterSource({ name: "Other source", kind: "OFFICIAL", scope: "PLATFORM", owner: "Authority", license: "Open" }, admin);
      const grantedItem = await createDataCenterItem(dataset(granted.id, "Granted census", "census figures granted"), admin);
      const otherItem = await createDataCenterItem(dataset(other.id, "Other census", "census figures other"), admin);
      await publish(grantedItem.id, admin);
      await publish(otherItem.id, admin);
      expect((await retrieveDataCenterContext({ query: "census" }, admin)).rows).toHaveLength(2);
      await expect(retrieveDataCenterContext({ query: "census" }, identity)).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED", status: 403 });

      const base = { sourceId: granted.id, robotId: robot.id, principalId: principal.id, roleKey: "analyst", specialty: "demography", missionId: mission.id, reason: "The demography study needs census figures" };
      const soon = new Date(Date.now() + 3_600_000).toISOString();
      await expect(grantDataCenterRobotAccess({ ...base, expiresAt: soon }, identity)).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
      await expect(grantDataCenterRobotAccess({ ...base, expiresAt: new Date(Date.now() - 1000).toISOString() }, admin)).rejects.toMatchObject({ code: "GRANT_EXPIRY_MUST_BE_FUTURE" });
      await expect(grantDataCenterRobotAccess({ ...base, expiresAt: new Date(Date.now() + 400 * 86_400_000).toISOString() }, admin)).rejects.toMatchObject({ code: "GRANT_EXPIRY_TOO_FAR" });
      await expect(grantDataCenterRobotAccess({ ...base, sourceId: "missing", expiresAt: soon }, admin)).rejects.toMatchObject({ code: "SOURCE_NOT_FOUND" });
      await expect(grantDataCenterRobotAccess({ ...base, robotId: "missing", expiresAt: soon }, admin)).rejects.toMatchObject({ code: "ROBOT_NOT_FOUND" });
      await expect(grantDataCenterRobotAccess({ ...base, principalId: "missing", expiresAt: soon }, admin)).rejects.toMatchObject({ code: "PRINCIPAL_NOT_FOUND" });
      await expect(grantDataCenterRobotAccess({ ...base, robotId: stranger.id, expiresAt: soon }, admin)).rejects.toMatchObject({ code: "ROBOT_MISSION_ASSIGNMENT_REQUIRED", status: 409 });

      const read = await grantDataCenterRobotAccess({ ...base, expiresAt: soon }, admin);
      expect(read).toMatchObject({ access: "READ", revokedAt: null, grantedById: admin.id, sourceId: granted.id });
      await expect(grantDataCenterRobotAccess({ ...base, expiresAt: soon }, admin)).rejects.toMatchObject({ code: "ROBOT_GRANT_ALREADY_ACTIVE" });
      expect((await retrieveDataCenterContext({ query: "census" }, identity)).rows.map((row) => row.itemId)).toEqual([grantedItem.id]);
      await expect(createDataCenterItem(dataset(granted.id, "Robot idea", "unreviewed idea"), identity)).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED" });

      await revokeDataCenterRobotAccess({ grantId: read.id, reason: "Upgrading to proposal access" }, admin);
      const propose = await grantDataCenterRobotAccess({ ...base, access: "PROPOSE", expiresAt: soon }, admin);
      const proposal = await createDataCenterItem(dataset(granted.id, "Robot idea", "unreviewed idea", { origin: "HUMAN" }), identity);
      expect(proposal.status).toBe("DRAFT");
      expect(proposal.version.origin).toBe("AI");
      await expect(createDataCenterItem(dataset(other.id, "Outside grant", "not allowed"), identity)).rejects.toMatchObject({ code: "SOURCE_NOT_FOUND" });
      await expect(createDataCenterSource({ name: "Self registered", kind: "MANUAL", scope: "PRIVATE", owner: "Robot", license: "Unknown" }, identity)).rejects.toMatchObject({ code: "HUMAN_OPERATION_REQUIRED" });

      await tx.mission.update({ where: { id: mission.id }, data: { assignedRobots: { disconnect: { id: robot.id } } } });
      await expect(retrieveDataCenterContext({ query: "census" }, identity)).rejects.toMatchObject({ code: "ROBOT_MISSION_ASSIGNMENT_REQUIRED" });
      await tx.mission.update({ where: { id: mission.id }, data: { assignedRobots: { connect: { id: robot.id } } } });
      await expect(retrieveDataCenterContext({ query: "census" }, { ...identity, specialty: "finance" })).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED" });
      await expect(retrieveDataCenterContext({ query: "census" }, { ...identity, id: admin.id })).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED" });

      const revoked = await revokeDataCenterRobotAccess({ grantId: propose.id, reason: "Mission completed" }, admin);
      expect(revoked.revokedAt).toBeInstanceOf(Date);
      expect(revoked).toMatchObject({ revokedById: admin.id, revokeReason: "Mission completed" });
      await expect(revokeDataCenterRobotAccess({ grantId: propose.id, reason: "Again" }, admin)).rejects.toMatchObject({ code: "ROBOT_GRANT_ALREADY_REVOKED", status: 409 });
      await expect(revokeDataCenterRobotAccess({ grantId: "missing", reason: "Missing" }, admin)).rejects.toMatchObject({ code: "ROBOT_GRANT_NOT_FOUND", status: 404 });
      await expect(revokeDataCenterRobotAccess({ grantId: propose.id, reason: "Not an admin" }, identity)).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
      await expect(retrieveDataCenterContext({ query: "census" }, identity)).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED" });

      const expired = await tx.dataCenterRobotGrant.create({ data: { ...base, grantedById: admin.id, createdAt: new Date(Date.now() - 7_200_000), expiresAt: new Date(Date.now() - 3_600_000) } });
      await expect(retrieveDataCenterContext({ query: "census" }, identity)).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED" });

      // The database protects grants even from callers that bypass the service layer.
      const fresh = await tx.dataCenterRobotGrant.create({ data: { ...base, grantedById: admin.id, expiresAt: new Date(Date.now() + 3_600_000) } });
      await rejected(tx, () => tx.dataCenterRobotGrant.update({ where: { id: fresh.id }, data: { reason: "Rewritten history" } }), /can only be revoked/);
      await rejected(tx, () => tx.dataCenterRobotGrant.update({ where: { id: fresh.id }, data: { expiresAt: new Date(Date.now() + 86_400_000) } }), /can only be revoked/);
      await rejected(tx, () => tx.dataCenterRobotGrant.update({ where: { id: fresh.id }, data: { revokedAt: new Date() } }), /DataCenterRobotGrant_revocation_check/);
      await rejected(tx, () => tx.dataCenterRobotGrant.update({ where: { id: expired.id }, data: { revokedAt: null } }), /can only be revoked/);
      await rejected(tx, () => tx.dataCenterRobotGrant.update({ where: { id: revoked.id }, data: { revokeReason: "Edited later" } }), /already revoked/);
      await rejected(tx, () => tx.dataCenterRobotGrant.delete({ where: { id: fresh.id } }), /append-only/);
      await rejected(tx, () => tx.dataCenterSource.delete({ where: { id: granted.id } }), /DataCenterRobotGrant_sourceId_fkey|DataCenterItem_sourceId_fkey/);
      for (const [column, pattern] of [["robotId", /DataCenterRobotGrant_robotId_fkey/], ["principalId", /DataCenterRobotGrant_principalId_fkey/], ["missionId", /DataCenterRobotGrant_missionId_fkey/], ["grantedById", /DataCenterRobotGrant_grantedById_fkey/]] as const)
        await rejected(tx, () => tx.dataCenterRobotGrant.create({ data: { ...base, grantedById: admin.id, expiresAt: new Date(Date.now() + 3_600_000), [column]: "missing" } }), pattern);
      await rejected(tx, () => tx.dataCenterRobotGrant.create({ data: { ...base, grantedById: admin.id, expiresAt: new Date(Date.now() - 1000), createdAt: new Date() } }), /DataCenterRobotGrant_validity_check/);
      await rejected(tx, () => tx.dataCenterRobotGrant.create({ data: { ...base, grantedById: admin.id, expiresAt: new Date(Date.now() + 3_600_000), roleKey: "  " } }), /DataCenterRobotGrant_text_check/);
    });
  });
});
