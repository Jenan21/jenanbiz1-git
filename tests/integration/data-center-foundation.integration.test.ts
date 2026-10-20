import { randomUUID, createHash } from "node:crypto";
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
import { createDataCenterItem, createDataCenterSource, createDataCenterVersion, getDataCenterItem, reviewDataCenterItem, transitionDataCenterItem } from "@/services/data-center/service";
import { exportDataCenter, retrieveDataCenterContext } from "@/services/data-center/retrieval";
import { grantDataCenterRobotAccess, revokeDataCenterRobotAccess } from "@/services/data-center/robot-grants";
import { latestDataCenterQuality, recordDataCenterQualityAssessment } from "@/services/data-center/quality";
import { assessMapBinding, assessMapReferenceUse, MAP_BINDING_CONTRACT, mapBindingSchema, mapReferenceSchema } from "@/services/data-center/map-contract";
import { resolveDataCenterMapReference } from "@/services/data-center/map-resolver";
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
async function rejected(tx: DbExecutor, work: () => Promise<unknown>, pattern: RegExp, label?: string) {
  await tx.$executeRawUnsafe("SAVEPOINT dc_expected_failure");
  try { await expect(work(), label).rejects.toThrow(pattern); } finally {
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT dc_expected_failure");
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT dc_expected_failure");
  }
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
  it("stores version lineage as real foreign keys, hashes it, hides unreadable upstreams and keeps edges acyclic and immutable", async () => {
    await isolated(async (tx, admin) => {
      const source = await createDataCenterSource({ name: "Survey source", kind: "OFFICIAL", scope: "PLATFORM", owner: "Authority", license: "Open" }, admin);
      const raw = await createDataCenterItem(dataset(source.id, "Raw survey", "raw survey rows"), admin);
      const second = await createDataCenterItem(dataset(source.id, "Second input", "second input rows"), admin);
      const derived = await createDataCenterItem(dataset(source.id, "Cleaned survey", "cleaned rows", { upstreamVersionIds: [raw.version.id, raw.version.id] }), admin);
      const plain = await createDataCenterItem(dataset(source.id, "Cleaned survey", "cleaned rows"), admin);
      expect((await tx.dataCenterVersionLineage.findMany({ where: { versionId: derived.version.id } })).map((edge) => edge.upstreamVersionId)).toEqual([raw.version.id]);
      expect(await tx.dataCenterVersionLineage.count({ where: { versionId: plain.version.id } })).toBe(0);
      expect(derived.version.checksum).not.toBe(plain.version.checksum);

      const next = await createDataCenterVersion({ itemId: derived.id, title: "Cleaned survey v2", content: "cleaned rows v2", evidenceStatus: "ESTIMATED", reason: "Adds the second input", upstreamVersionIds: [second.version.id, raw.version.id] }, admin);
      expect((await tx.dataCenterVersionLineage.findMany({ where: { versionId: next.id } })).map((edge) => edge.upstreamVersionId).sort()).toEqual([raw.version.id, second.version.id].sort());
      const details = await getDataCenterItem(derived.id, admin);
      expect(details.versions.find((version) => version.id === next.id)?.upstream).toHaveLength(2);
      expect(await tx.auditLog.count({ where: { action: "data-center.version.created", entityId: derived.id } })).toBe(1);

      await expect(createDataCenterItem(dataset(source.id, "Orphan", "x", { upstreamVersionIds: ["missing-version"] }), admin)).rejects.toMatchObject({ code: "UPSTREAM_VERSION_NOT_FOUND", status: 404 });
      const viewer = await tx.user.create({ data: { email: `lineage-${randomUUID()}@example.test`, status: "ACTIVE" } });
      const member: DataCenterActor = { id: viewer.id, systemRole: "USER", kind: "HUMAN" };
      const hidden = await createDataCenterSource({ name: "Admin only", kind: "MANUAL", scope: "PRIVATE", owner: "Admin", license: "Internal" }, admin);
      const hiddenItem = await createDataCenterItem(dataset(hidden.id, "Hidden input", "hidden rows"), admin);
      const own = await createDataCenterSource({ name: "Member source", kind: "MANUAL", scope: "PRIVATE", owner: "Member", license: "Internal" }, member);
      await expect(createDataCenterItem(dataset(own.id, "Leaky", "x", { upstreamVersionIds: [hiddenItem.version.id] }), member)).rejects.toMatchObject({ code: "SOURCE_NOT_FOUND" });
      expect((await createDataCenterItem(dataset(own.id, "Allowed", "x", { upstreamVersionIds: [raw.version.id] }), member)).version.id).toBeTruthy();

      const edge = (versionId: string, upstreamVersionId: string) => () => tx.dataCenterVersionLineage.create({ data: { versionId, upstreamVersionId } });
      await rejected(tx, edge(plain.version.id, plain.version.id), /DataCenterVersionLineage_distinct_check/);
      await rejected(tx, edge(derived.version.id, raw.version.id), /Unique constraint|DataCenterVersionLineage_versionId_upstreamVersionId_key/);
      await rejected(tx, edge(plain.version.id, "missing-version"), /DataCenterVersionLineage_upstreamVersionId_fkey/);
      await rejected(tx, edge("missing-version", raw.version.id), /DataCenterVersionLineage_versionId_fkey/);
      await rejected(tx, edge(raw.version.id, derived.version.id), /lineage is fixed when a version is created/);
      const stored = await tx.dataCenterVersionLineage.findFirstOrThrow({ where: { versionId: derived.version.id } });
      await rejected(tx, () => tx.dataCenterVersionLineage.update({ where: { id: stored.id }, data: { upstreamVersionId: second.version.id } }), /immutable/i);
      await rejected(tx, () => tx.dataCenterVersionLineage.delete({ where: { id: stored.id } }), /immutable/i);
    });
  });
  it("stores structured coverage and attribution per version, covers them with the checksum and enforces them in the database", async () => {
    await isolated(async (tx, admin) => {
      const source = await createDataCenterSource({ name: "Atlas", kind: "OFFICIAL", scope: "PLATFORM", owner: "Authority", license: "ODbL-1.0", allowExport: true, ownership: "THIRD_PARTY",
        licenseClass: "OPEN_LICENSE", usagePolicy: "Share-alike; credit required", attribution: "© Atlas contributors", attributionRequired: true }, admin);
      const box = { west: 34.5, south: 16, east: 55.7, north: 32.2 };
      const coverage = { countryCodes: ["SA", "AE"], regionCodes: ["SA-01", "SA-02"], boundingBox: box };
      const covered = await createDataCenterItem(dataset(source.id, "Atlas layer", "atlas layer content", { coverage, attribution: "© Atlas 2026" }), admin);
      expect(covered.version).toMatchObject({ coverageCountries: ["AE", "SA"], coverageRegions: ["SA-01", "SA-02"], bboxWest: 34.5, bboxSouth: 16, bboxEast: 55.7, bboxNorth: 32.2, attribution: "© Atlas 2026" });
      const bare = await createDataCenterItem(dataset(source.id, "Atlas notes", "atlas notes content"), admin);
      expect(bare.version).toMatchObject({ coverageCountries: [], coverageRegions: [], bboxWest: null, bboxNorth: null, attribution: null });

      const reordered = await createDataCenterItem(dataset(source.id, "Atlas layer", "atlas layer content", { coverage: { ...coverage, countryCodes: ["AE", "SA"], regionCodes: ["SA-02", "SA-01"] }, attribution: "© Atlas 2026" }), admin);
      expect(reordered.version.checksum).toBe(covered.version.checksum);
      const moved = await createDataCenterItem(dataset(source.id, "Atlas layer", "atlas layer content", { coverage: { ...coverage, boundingBox: { ...box, east: 56 } }, attribution: "© Atlas 2026" }), admin);
      expect(moved.version.checksum).not.toBe(covered.version.checksum);
      const credited = await createDataCenterItem(dataset(source.id, "Atlas layer", "atlas layer content", { coverage, attribution: "© Someone else" }), admin);
      expect(credited.version.checksum).not.toBe(covered.version.checksum);
      // Versions without optional fields keep the checksum of the original algorithm.
      const original = { title: "Atlas notes", content: "atlas notes content", evidenceStatus: "ESTIMATED", origin: "HUMAN", provenance: [], specialties: [], missionContexts: [],
        requiredPermission: null, sourcePublishedAt: null, expiresAt: null, effectiveFrom: null, effectiveTo: null };
      expect(bare.version.checksum).toBe(createHash("sha256").update(JSON.stringify(original)).digest("hex"));

      await publish(covered.id, admin);
      await publish(bare.id, admin);
      const rows = (await retrieveDataCenterContext({ query: "atlas" }, admin)).rows;
      expect(rows.find((row) => row.itemId === covered.id)).toMatchObject({ ownership: "THIRD_PARTY", licenseClass: "OPEN_LICENSE", usagePolicy: "Share-alike; credit required", allowExport: true,
        attribution: "© Atlas 2026", attributionRequired: true, coverage: { crs: "WGS84", countryCodes: ["AE", "SA"], regionCodes: ["SA-01", "SA-02"], boundingBox: box } });
      expect(rows.find((row) => row.itemId === bare.id)).toMatchObject({ attribution: "© Atlas contributors", coverage: null });
      const csv = (await exportDataCenter({ query: "atlas", format: "csv" }, admin)).body;
      expect(csv.split("\r\n")[0]).toBe("itemId,versionId,version,title,content,evidenceStatus,source,license,checksum,ownership,usagePolicy,attribution");
      expect(csv).toContain("© Atlas 2026");
      expect(csv).toContain("© Atlas contributors");
      expect(JSON.parse((await exportDataCenter({ query: "atlas", format: "json" }, admin)).body).rows.find((row: { itemId: string }) => row.itemId === covered.id)).toMatchObject({ attribution: "© Atlas 2026", ownership: "THIRD_PARTY" });

      const row = (over: Record<string, unknown>) => () => tx.dataCenterVersion.create({ data: { itemId: bare.id, number: 99, title: "Raw", content: "raw", provenance: [], confidence: {}, checksum: "x", createdById: admin.id, specialties: [], missionContexts: [], ...over } });
      await rejected(tx, row({ coverageCountries: ["sa"] }), /DataCenterVersion_coverage_countries_check/);
      await rejected(tx, row({ coverageCountries: ["SAU"] }), /DataCenterVersion_coverage_countries_check/);
      await rejected(tx, row({ coverageCountries: Array.from({ length: 251 }, () => "SA") }), /DataCenterVersion_coverage_countries_check/);
      await rejected(tx, row({ coverageRegions: ["SA-01"] }), /DataCenterVersion_coverage_regions_check/);
      await rejected(tx, row({ coverageCountries: ["SA"], coverageRegions: ["sa-01"] }), /DataCenterVersion_coverage_regions_check/);
      await rejected(tx, row({ coverageCountries: ["AE"], coverageRegions: ["SA-01"] }), /DataCenterVersion_coverage_regions_check/);
      await rejected(tx, row({ bboxWest: 10 }), /DataCenterVersion_coverage_bbox_check/);
      await rejected(tx, row({ bboxWest: 10, bboxSouth: 10, bboxEast: 20 }), /DataCenterVersion_coverage_bbox_check/);
      await rejected(tx, row({ bboxWest: 30, bboxSouth: 10, bboxEast: 20, bboxNorth: 20 }), /DataCenterVersion_coverage_bbox_check/);
      await rejected(tx, row({ bboxWest: 10, bboxSouth: 30, bboxEast: 20, bboxNorth: 20 }), /DataCenterVersion_coverage_bbox_check/);
      await rejected(tx, row({ bboxWest: -181, bboxSouth: 0, bboxEast: 0, bboxNorth: 1 }), /DataCenterVersion_coverage_bbox_check/);
      await rejected(tx, row({ bboxWest: 0, bboxSouth: 0, bboxEast: 181, bboxNorth: 1 }), /DataCenterVersion_coverage_bbox_check/);
      await rejected(tx, row({ bboxWest: 0, bboxSouth: -91, bboxEast: 1, bboxNorth: 1 }), /DataCenterVersion_coverage_bbox_check/);
      await rejected(tx, row({ bboxWest: Number.NaN, bboxSouth: 0, bboxEast: 1, bboxNorth: 1 }), /DataCenterVersion_coverage_bbox_check/);
      await rejected(tx, row({ attribution: "   " }), /DataCenterVersion_attribution_check/);
      expect((await row({ number: 98, coverageCountries: ["SA"], coverageRegions: ["SA-01"], bboxWest: -180, bboxSouth: -90, bboxEast: 180, bboxNorth: 90, attribution: "Valid" })()).number).toBe(98);
    });
  });
  it("records explainable, append-only quality assessments, never invents a score and enforces the rules in the database", async () => {
    await isolated(async (tx, admin) => {
      const source = await createDataCenterSource({ name: "Quality source", kind: "OFFICIAL", scope: "PLATFORM", owner: "Authority", license: "Open" }, admin);
      const item = await createDataCenterItem(dataset(source.id, "Rated dataset", "rated dataset rows"), admin);
      expect(await latestDataCenterQuality(tx, item.version.id)).toBeNull();
      expect((await getDataCenterItem(item.id, admin)).versions[0].qualityAssessments).toEqual([]);
      const revisionBefore = (await tx.dataCenterItem.findUniqueOrThrow({ where: { id: item.id } })).revision;

      const method = { method: "manual-completeness-review", methodVersion: "2026.10" };
      const measured = await recordDataCenterQualityAssessment({ versionId: item.version.id, status: "MEASURED", score: 0.82, ...method, measuredAt: "2026-10-01T09:00:00.000Z",
        explanation: "Checked 200 sampled rows against the source document.", metrics: { completeness: 0.9, formatErrors: 3 } }, admin);
      expect(measured).toMatchObject({ status: "MEASURED", score: 0.82, method: "manual-completeness-review", methodVersion: "2026.10", assessedById: admin.id, metrics: { completeness: 0.9, formatErrors: 3 } });
      expect((await tx.dataCenterItem.findUniqueOrThrow({ where: { id: item.id } })).revision).toBe(revisionBefore + 1);
      expect(await tx.auditLog.count({ where: { action: "data-center.quality.recorded", entityId: measured.id } })).toBe(1);

      const insufficient = await recordDataCenterQualityAssessment({ versionId: item.version.id, status: "INSUFFICIENT_DATA", ...method, measuredAt: "2026-10-05T09:00:00.000Z",
        explanation: "The source document no longer matches any sampled row." }, admin);
      expect(insufficient).toMatchObject({ status: "INSUFFICIENT_DATA", score: null, metrics: {} });
      // A later entry about an earlier measurement does not replace the most recent measurement.
      await recordDataCenterQualityAssessment({ versionId: item.version.id, status: "MEASURED", score: 0.4, ...method, measuredAt: "2026-09-01T09:00:00.000Z", explanation: "Back-filled earlier measurement." }, admin);
      expect(await latestDataCenterQuality(tx, item.version.id)).toMatchObject({ id: insufficient.id, status: "INSUFFICIENT_DATA", score: null });
      expect((await getDataCenterItem(item.id, admin)).versions[0].qualityAssessments.map((entry) => entry.measuredAt.toISOString())).toEqual(["2026-10-05T09:00:00.000Z", "2026-10-01T09:00:00.000Z", "2026-09-01T09:00:00.000Z"]);

      const record = (over: Record<string, unknown>) => recordDataCenterQualityAssessment({ versionId: item.version.id, status: "MEASURED", score: 0.5, ...method, measuredAt: "2026-10-02T09:00:00.000Z", explanation: "Reviewed", ...over } as never, admin);
      await expect(record({ versionId: "missing" })).rejects.toMatchObject({ code: "VERSION_NOT_FOUND", status: 404 });
      await expect(record({ score: undefined })).rejects.toThrow();
      await expect(record({ measuredAt: new Date(Date.now() + 86_400_000).toISOString() })).rejects.toMatchObject({ code: "FUTURE_MEASUREMENT_DATE" });
      await expect(recordDataCenterQualityAssessment({ versionId: item.version.id, status: "MEASURED", score: 0.5, ...method, measuredAt: "2026-10-02T09:00:00.000Z", explanation: "x" }, { id: admin.id, systemRole: "USER", kind: "HUMAN" })).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });

      const raw = (over: Record<string, unknown>) => () => tx.dataCenterQualityAssessment.create({ data: { versionId: item.version.id, status: "MEASURED", score: 0.5, ...method, measuredAt: new Date(), explanation: "Reviewed", assessedById: admin.id, ...over } as never });
      await rejected(tx, raw({ score: null }), /DataCenterQualityAssessment_score_check/);
      await rejected(tx, raw({ status: "INSUFFICIENT_DATA" }), /DataCenterQualityAssessment_score_check/);
      for (const score of [1.5, -0.1, Number.NaN]) await rejected(tx, raw({ score }), /DataCenterQualityAssessment_score_range_check/);
      for (const blank of ["method", "methodVersion", "explanation"]) await rejected(tx, raw({ [blank]: "  " }), /DataCenterQualityAssessment_method_check/);
      await rejected(tx, raw({ metrics: [] }), /DataCenterQualityAssessment_metrics_check/);
      await rejected(tx, raw({ metrics: { note: "x".repeat(9000) } }), /DataCenterQualityAssessment_metrics_check/);
      await rejected(tx, raw({ assessedById: "missing" }), /DataCenterQualityAssessment_assessedById_fkey/);
      await rejected(tx, raw({ versionId: "missing" }), /DataCenterQualityAssessment_versionId_fkey/);
      await rejected(tx, () => tx.dataCenterQualityAssessment.update({ where: { id: measured.id }, data: { score: 1 } }), /immutable/i);
      await rejected(tx, () => tx.dataCenterQualityAssessment.delete({ where: { id: measured.id } }), /immutable/i);
      expect(await tx.dataCenterQualityAssessment.count({ where: { versionId: item.version.id } })).toBe(3);
    });
  });
  it("grants organization-scoped access to a role only through explicit Data Center permission rows, and read access never allows writing", async () => {
    await isolated(async (tx, admin) => {
      const organization = await tx.organization.create({ data: { name: "Role org", slug: `role-${randomUUID()}` } });
      const user = await tx.user.create({ data: { email: `analyst-${randomUUID()}@example.test`, status: "ACTIVE" } });
      const member: DataCenterActor = { id: user.id, systemRole: "USER", kind: "HUMAN" };
      const source = await createDataCenterSource({ name: "Org source", kind: "MANUAL", scope: "ORGANIZATION", organizationId: organization.id, owner: "Org", license: "Internal" }, admin);
      const published = await createDataCenterItem(dataset(source.id, "Org balance sheet", "org balance sheet rows"), admin);
      await publish(published.id, admin);
      const visible = async () => (await retrieveDataCenterContext({ query: "balance" }, member)).rows.some((row) => row.itemId === published.id);
      const draft = () => createDataCenterItem(dataset(source.id, "Analyst draft", "analyst draft rows"), member);

      const role = await tx.role.create({ data: { organizationId: organization.id, name: "Analyst", key: `analyst-${randomUUID()}` } });
      await tx.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, roleId: role.id, status: "ACTIVE" } });
      expect(await visible()).toBe(false);
      await expect(draft()).rejects.toMatchObject({ code: "SOURCE_NOT_FOUND", status: 404 });

      const grant = async (key: string) => {
        const permission = await tx.permission.upsert({ where: { key }, update: {}, create: { key } });
        await tx.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
      };
      await grant("data-center.read");
      expect(await visible()).toBe(true);
      await expect(draft()).rejects.toMatchObject({ code: "SOURCE_NOT_FOUND", status: 404 });

      await grant("data-center.write");
      const created = await draft();
      expect(created).toMatchObject({ status: "DRAFT", sourceId: source.id });
      expect(created.version).toMatchObject({ origin: "HUMAN", evidenceStatus: "ESTIMATED" });
      await expect(createDataCenterItem(dataset(source.id, "Self-verified", "self verified rows", { evidenceStatus: "VERIFIED", provenance: [{ label: "x", reference: "x", kind: "SOURCE" }] }), member)).rejects.toMatchObject({ code: "VERIFICATION_REQUIRES_HUMAN_ADMIN_AND_EVIDENCE" });
      await expect(transitionDataCenterItem({ itemId: created.id, status: "IN_REVIEW", reason: "Submit" }, member)).resolves.toMatchObject({ status: "IN_REVIEW" });
      await expect(transitionDataCenterItem({ itemId: created.id, status: "APPROVED", reason: "Self approval" }, member)).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });

      await tx.organizationMember.update({ where: { organizationId_userId: { organizationId: organization.id, userId: user.id } }, data: { status: "SUSPENDED" } });
      expect(await visible()).toBe(false);
      await expect(draft()).rejects.toMatchObject({ code: "SOURCE_NOT_FOUND" });
    });
  });
  it("resolves Map references only for published, readable versions and lets a stored snapshot be checked against the Data Center", async () => {
    await isolated(async (tx, admin) => {
      const source = await createDataCenterSource({ name: "Atlas", kind: "OFFICIAL", scope: "PLATFORM", owner: "Authority", license: "ODbL-1.0", allowExport: true, ownership: "THIRD_PARTY", licenseClass: "OPEN_LICENSE",
        usagePolicy: "Share-alike; credit required", attribution: "© Atlas contributors", attributionRequired: true, sourceOrganization: "Atlas Authority", sourceUrl: "https://atlas.example.test", freshnessDays: 365 }, admin);
      const raw = await createDataCenterItem(dataset(source.id, "Raw atlas", "raw atlas rows"), admin);
      const box = { west: 34.5, south: 16, east: 55.7, north: 32.2 };
      const layer = await createDataCenterItem(dataset(source.id, "Atlas layer", "atlas layer rows", { attribution: "© Atlas 2026", coverage: { countryCodes: ["SA"], regionCodes: ["SA-01"], boundingBox: box },
        sourcePublishedAt: new Date(Date.now() - 10 * 86_400_000).toISOString(), upstreamVersionIds: [raw.version.id] }), admin);
      await expect(resolveDataCenterMapReference(layer.version.id, admin)).rejects.toMatchObject({ code: "PUBLISHED_VERSION_NOT_FOUND", status: 404 });
      await publish(layer.id, admin);

      const reference = await resolveDataCenterMapReference(layer.version.id, admin);
      expect(reference).toMatchObject({
        dataset: { itemId: layer.id, title: "Atlas layer", layer: "DATA" },
        version: { versionId: layer.version.id, number: 1, checksum: { algorithm: "SHA-256", value: layer.version.checksum }, upstreamVersionIds: [raw.version.id] },
        source: { sourceId: source.id, organization: "Atlas Authority", url: "https://atlas.example.test" }, ownership: { ownership: "THIRD_PARTY", owner: "Authority" },
        rights: { license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", usagePolicy: "Share-alike; credit required", allowRetrieval: true, allowExport: true, attribution: { text: "© Atlas 2026", required: true, level: "VERSION" } },
        coverage: { crs: "WGS84", countryCodes: ["SA"], regionCodes: ["SA-01"], boundingBox: box }, quality: { status: "UNAVAILABLE" },
        freshness: { status: "FRESH", freshnessDays: 365 }, publication: { status: "PUBLISHED", publishedVersion: 1 },
      });
      expect(reference.publication.publishedAt).toMatch(/Z$/);
      expect(reference.confidence).toMatchObject({ heuristic: true, policyVersion: "dc-confidence-v2-seven-factors" });
      expect(mapReferenceSchema.safeParse(reference).success).toBe(true);
      expect(assessMapReferenceUse(reference, "EXPORT").allowed).toBe(true);

      await recordDataCenterQualityAssessment({ versionId: layer.version.id, status: "MEASURED", score: 0.9, method: "manual-review", methodVersion: "1", measuredAt: new Date(Date.now() - 3_600_000).toISOString(), explanation: "Sampled 200 rows" }, admin);
      const snapshot = await resolveDataCenterMapReference(layer.version.id, admin);
      expect(snapshot.quality).toMatchObject({ status: "MEASURED", score: 0.9, method: "manual-review", methodVersion: "1" });

      // A draft edit neither removes the published reference nor makes the draft referenceable.
      const draft = await createDataCenterVersion({ itemId: layer.id, title: "Atlas layer v2", content: "atlas layer rows v2", evidenceStatus: "ESTIMATED", reason: "Revision" }, admin);
      await expect(resolveDataCenterMapReference(draft.id, admin)).rejects.toMatchObject({ code: "PUBLISHED_VERSION_NOT_FOUND" });
      expect((await resolveDataCenterMapReference(layer.version.id, admin)).version.versionId).toBe(layer.version.id);

      const closed = await createDataCenterSource({ name: "Not retrievable", kind: "OFFICIAL", scope: "PLATFORM", owner: "Authority", license: "Internal", allowRetrieval: false }, admin);
      const closedItem = await createDataCenterItem(dataset(closed.id, "Closed layer", "closed rows"), admin);
      const scoped = await createDataCenterItem(dataset(source.id, "Finance only", "finance rows", { specialties: ["finance"] }), admin);
      const hidden = await createDataCenterSource({ name: "Admin only", kind: "MANUAL", scope: "PRIVATE", owner: "Admin", license: "Internal" }, admin);
      const hiddenItem = await createDataCenterItem(dataset(hidden.id, "Hidden layer", "hidden rows"), admin);
      for (const entry of [closedItem, scoped, hiddenItem]) await publish(entry.id, admin);
      expect((await resolveDataCenterMapReference(hiddenItem.version.id, admin)).source.scope).toBe("PRIVATE");
      await expect(resolveDataCenterMapReference(closedItem.version.id, admin)).rejects.toMatchObject({ code: "PUBLISHED_VERSION_NOT_FOUND" });
      await expect(resolveDataCenterMapReference(scoped.version.id, admin)).rejects.toMatchObject({ code: "PUBLISHED_VERSION_NOT_FOUND" });
      const viewer = await tx.user.create({ data: { email: `viewer-${randomUUID()}@example.test`, status: "ACTIVE" } });
      const member: DataCenterActor = { id: viewer.id, systemRole: "USER", kind: "HUMAN" };
      await expect(resolveDataCenterMapReference(hiddenItem.version.id, member)).rejects.toMatchObject({ code: "PUBLISHED_VERSION_NOT_FOUND" });
      expect((await resolveDataCenterMapReference(layer.version.id, member)).version.versionId).toBe(layer.version.id);
      await expect(resolveDataCenterMapReference(layer.version.id, { id: admin.id, systemRole: "ADMIN", kind: "AI" })).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED" });
      await expect(resolveDataCenterMapReference("missing", admin)).rejects.toMatchObject({ code: "PUBLISHED_VERSION_NOT_FOUND", status: 404 });
      await expect(resolveDataCenterMapReference("", admin)).rejects.toMatchObject({ code: "PUBLISHED_VERSION_NOT_FOUND" });

      // The Map keeps only its identifiers and this snapshot; the Data Center remains the truth.
      const binding = mapBindingSchema.parse({ contract: MAP_BINDING_CONTRACT, map: { releaseId: "release-1", layerKey: "atlas", exportsArtifact: true, artifactSha256: "d".repeat(64) }, reference: snapshot });
      expect(assessMapBinding(binding, await resolveDataCenterMapReference(layer.version.id, admin))).toEqual({ consistent: true, findings: [] });
      await tx.dataCenterSource.update({ where: { id: source.id }, data: { allowExport: false, attribution: "© Atlas contributors (updated)" } });
      const after = assessMapBinding(binding, await resolveDataCenterMapReference(layer.version.id, admin));
      expect(after.consistent).toBe(false);
      expect(after.findings.map((finding) => finding.code)).toEqual(["EXPORT_NO_LONGER_PERMITTED"]);
      await transitionDataCenterItem({ itemId: layer.id, status: "ARCHIVED", reason: "Withdrawn by the owner" }, admin);
      await expect(resolveDataCenterMapReference(layer.version.id, admin)).rejects.toMatchObject({ code: "PUBLISHED_VERSION_NOT_FOUND" });
      expect(assessMapBinding(binding, null)).toMatchObject({ consistent: false, findings: [{ code: "DATA_CENTER_VERSION_UNAVAILABLE" }] });
    });
  });
});
