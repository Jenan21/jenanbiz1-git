import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { DbExecutor } from "@/lib/db";

const context = vi.hoisted(() => ({ tx: null as unknown, actual: null as unknown, stored: new Map<string, Uint8Array>() }));
vi.mock("@/lib/storage/document-storage", () => ({ documentStorage: {
  async upload(key: string, bytes: Uint8Array) { context.stored.set(key, bytes); },
  async download(key: string) { return context.stored.get(key); },
  async delete(key: string) { context.stored.delete(key); },
} }));
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
import { createDataCenterSource, createDataCenterItem, createDataCenterVersion, transitionDataCenterItem, reviewDataCenterItem, createDataCenterConflict, resolveDataCenterConflict } from "@/services/data-center/service";
import { approveAcademyDataCenterRelease, configureDataCenterSemanticAdapter, exportDataCenter, importAcademyDataCenterSource, recordDataCenterUsage, requestAcademyDataCenterRelease, retrieveAcademyDataCenterRelease, retrieveDataCenterContext } from "@/services/data-center/retrieval";
import type { DataCenterActor } from "@/services/data-center/contracts";
import { configureDataCenterScanner, downloadDataCenterOriginal, ingestDataCenterFile } from "@/services/data-center/imports";

const enabled = process.env.DATA_CENTER_DATABASE_TESTS === "1";
const rollback = new Error("ROLLBACK_DATA_CENTER_TEST");
async function isolated(run: (tx: DbExecutor, admin: DataCenterActor) => Promise<void>) {
  const actual = context.actual as typeof db;
  await expect(actual.$transaction(async (tx) => {
    context.tx = tx;
    try {
      const user = await tx.user.create({ data: { email: `data-center-${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
      await run(tx, { id: user.id, systemRole: "ADMIN" });
      throw rollback;
    } finally { context.tx = null; configureDataCenterSemanticAdapter(); configureDataCenterScanner(); context.stored.clear(); }
  }, { timeout: 30_000 })).rejects.toBe(rollback);
}
async function publish(itemId: string, actor: DataCenterActor) {
  await transitionDataCenterItem({ itemId, status: "IN_REVIEW", reason: "Submit reviewed source" }, actor);
  await reviewDataCenterItem({ itemId, decision: "APPROVED", notes: "Estimate methodology reviewed; evidence label retained" }, actor);
  await transitionDataCenterItem({ itemId, status: "APPROVED", reason: "Approval recorded" }, actor);
  await transitionDataCenterItem({ itemId, status: "PUBLISHED", reason: "Release labelled estimate" }, actor);
}
afterAll(async () => { if (enabled) await (context.actual as typeof db).$disconnect(); });
describe.skipIf(!enabled)("Data Center real PostgreSQL transactions (always rolled back)", () => {
  it("runs draft → review → publish → indexed search → exact-version usage → new draft", async () => {
    await isolated(async (tx, admin) => {
      const source = await createDataCenterSource({ name: "Official statistics", kind: "OFFICIAL", scope: "PLATFORM", owner: "Authority", license: "Open", allowExport: true }, admin);
      const item = await createDataCenterItem({ sourceId: source.id, title: "Riyadh demographic estimate", typeKey: "dataset", layer: "DATA", content: "Estimated residents 2026", evidenceStatus: "ESTIMATED" }, admin);
      expect((await retrieveDataCenterContext({ query: "demographic" }, admin)).rows).toHaveLength(0);
      await publish(item.id, admin);
      const search = await retrieveDataCenterContext({ query: "demographic" }, admin);
      expect(search.rows.find((r) => r.itemId === item.id)).toMatchObject({ versionId: item.version.id, evidenceStatus: "ESTIMATED" });
      const usage = await recordDataCenterUsage({ versionId: item.version.id, consumer: "integration-test", purpose: "Test exact version metadata" }, admin);
      expect(usage.versionId).toBe(item.version.id);
      const exported = await exportDataCenter({ query: "demographic", format: "json" }, admin);
      expect(JSON.parse(exported.body).rows.some((r: { versionId: string }) => r.versionId === item.version.id)).toBe(true);
      await createDataCenterVersion({ itemId: item.id, title: "Revised demographic estimate", content: "Revised estimate", evidenceStatus: "ESTIMATED", reason: "New evidence" }, admin);
      expect((await retrieveDataCenterContext({ query: "demographic" }, admin)).rows.some((r) => r.itemId === item.id)).toBe(false);
      expect(await tx.dataCenterVersion.count({ where: { itemId: item.id } })).toBe(2);
      expect(await tx.auditLog.count({ where: { actorId: admin.id, action: { startsWith: "data-center." } } })).toBeGreaterThan(7);
    });
  });
  it("isolates private and organization data and does not send hidden IDs to semantic adapters", async () => {
    await isolated(async (tx, admin) => {
      const viewer = await tx.user.create({ data: { email: `viewer-${randomUUID()}@example.test`, status: "ACTIVE" } });
      const other = { id: viewer.id, systemRole: "USER" };
      const privateSource = await createDataCenterSource({ name: "Confidential source", kind: "MANUAL", scope: "PRIVATE", owner: "Private owner", license: "Restricted" }, admin);
      const privateItem = await createDataCenterItem({ sourceId: privateSource.id, title: "Confidential balance", typeKey: "dataset", layer: "DATA", content: "Sensitive", evidenceStatus: "UNVERIFIED" }, admin);
      await publish(privateItem.id, admin);
      const organization = await tx.organization.create({ data: { name: "Restricted org", slug: `hub-${randomUUID()}` } });
      const orgSource = await createDataCenterSource({ name: "Organization source", kind: "MANUAL", scope: "ORGANIZATION", organizationId: organization.id, owner: "Org", license: "Internal" }, admin);
      const orgItem = await createDataCenterItem({ sourceId: orgSource.id, title: "Organization balance", typeKey: "dataset", layer: "DATA", content: "Internal", evidenceStatus: "UNVERIFIED" }, admin);
      await publish(orgItem.id, admin);
      let result = await retrieveDataCenterContext({}, other);
      expect(result.rows.some((r) => [privateItem.id, orgItem.id].includes(r.itemId))).toBe(false);
      const adapter = { name: "scoped-test", search: vi.fn(async ({ candidateVersionIds }: { candidateVersionIds: string[] }) => [...candidateVersionIds, privateItem.version.id]) };
      configureDataCenterSemanticAdapter(adapter);
      result = await retrieveDataCenterContext({ query: "balance", mode: "semantic" }, other);
      expect(result.rows.some((r) => r.itemId === privateItem.id)).toBe(false);
      await tx.organizationMember.create({ data: { organizationId: organization.id, userId: viewer.id, isOwner: true, status: "ACTIVE" } });
      result = await retrieveDataCenterContext({}, other);
      expect(result.rows.some((r) => r.itemId === orgItem.id)).toBe(true);
      await tx.organizationMember.update({ where: { organizationId_userId: { organizationId: organization.id, userId: viewer.id } }, data: { status: "SUSPENDED" } });
      expect((await retrieveDataCenterContext({}, other)).rows.some((r) => r.itemId === orgItem.id)).toBe(false);
    });
  });
  it("excludes open conflicts and applies the audited winner resolution", async () => {
    await isolated(async (tx, admin) => {
      const source = await createDataCenterSource({ name: "Different methodologies", kind: "MANUAL", scope: "PLATFORM", owner: "Owner", license: "Internal" }, admin);
      const first = await createDataCenterItem({ sourceId: source.id, title: "First conflict estimate", typeKey: "dataset", layer: "DATA", content: "10", evidenceStatus: "ESTIMATED" }, admin);
      const second = await createDataCenterItem({ sourceId: source.id, title: "Second conflict estimate", typeKey: "dataset", layer: "DATA", content: "20", evidenceStatus: "ESTIMATED" }, admin);
      await publish(first.id, admin); await publish(second.id, admin);
      const conflict = await createDataCenterConflict({ itemId: first.id, otherItemId: second.id, reason: "Same metric disagrees" }, admin);
      expect((await retrieveDataCenterContext({ query: "conflict" }, admin)).rows.some((r) => [first.id, second.id].includes(r.itemId))).toBe(false);
      await resolveDataCenterConflict({ conflictId: conflict.id, resolution: "KEEP_FIRST", notes: "Newer official methodology takes precedence" }, admin);
      expect((await tx.dataCenterItem.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("ARCHIVED");
      const result = await retrieveDataCenterContext({ query: "conflict" }, admin);
      expect(result.rows.some((r) => r.itemId === first.id)).toBe(true);
      expect(result.rows.some((r) => r.itemId === second.id)).toBe(false);
    });
  });
  it("enforces immutability at the PostgreSQL boundary", async () => {
    await isolated(async (tx, admin) => {
      const source = await createDataCenterSource({ name: "Immutable", kind: "MANUAL", scope: "PLATFORM", owner: "Owner", license: "Private" }, admin);
      const item = await createDataCenterItem({ sourceId: source.id, title: "Immutable evidence", typeKey: "dataset", layer: "DATA", content: "Original", evidenceStatus: "UNVERIFIED" }, admin);
      await expect(tx.dataCenterVersion.update({ where: { id: item.version.id }, data: { content: "Tampered" } })).rejects.toThrow(/immutable/i);
    });
  });
  it("stores scanned originals using the storage adapter and retains truthful unverified imported evidence", async () => {
    await isolated(async (tx, admin) => {
      configureDataCenterScanner({ name: "test-clean-scanner", scan: async () => "CLEAN" });
      const source = await createDataCenterSource({ name: "Imported data", kind: "FILE", scope: "PLATFORM", owner: "Owner", license: "Internal" }, admin);
      const original = '{"city":"Riyadh","value":123}';
      const result = await ingestDataCenterFile({ sourceId: source.id, title: "Imported original", typeKey: "dataset", layer: "DATA", evidenceStatus: "VERIFIED" }, new File([original], "data.json", { type: "application/json" }), admin);
      expect(result.item.version.evidenceStatus).toBe("UNVERIFIED");
      expect("storageKey" in result.import).toBe(false);
      const download = await downloadDataCenterOriginal(result.import.id, admin);
      expect(new TextDecoder().decode(download.bytes)).toBe(original);
      await expect(downloadDataCenterOriginal(result.import.id, { id: admin.id, systemRole: "USER" })).rejects.toThrow("ADMIN_REQUIRED");
      expect(await tx.dataCenterImport.count({ where: { actorId: admin.id } })).toBe(1);
    });
  });
  it("releases only approved Academy source versions to a real target after explicit second-admin approval", async () => {
    await isolated(async (tx, admin) => {
      const second = await tx.user.create({ data: { email: `reviewer-${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
      const reviewer = { id: second.id, systemRole: "ADMIN" };
      const source = await createDataCenterSource({ name: "Academy source", kind: "ACADEMY", scope: "PLATFORM", owner: "Academy", license: "Internal training" }, admin);
      const resource = await tx.academyResource.create({ data: { kind: "STUDY", slug: `study-${randomUUID()}`, title: "Approved study", approvalState: "APPROVED" } });
      const resourceVersion = await tx.academyResourceVersion.create({ data: { resourceId: resource.id, version: 1, title: resource.title, content: { text: "Approved factual study source" }, approvalState: "APPROVED" } });
      const robot = await tx.robot.create({ data: { name: "Target test robot", slug: `robot-${randomUUID()}` } });
      const item = await importAcademyDataCenterSource({ sourceId: source.id, resourceVersionId: resourceVersion.id }, admin);
      expect(item.version.origin).toBe("ACADEMY");
      expect(item.status).toBe("DRAFT");
      await expect(requestAcademyDataCenterRelease({ versionId: item.version.id, targetKind: "ROBOT", targetId: robot.id, notes: "Explicit training release" }, admin)).rejects.toThrow("APPROVED_ACADEMY_SOURCE_REQUIRED");
      await publish(item.id, admin);
      const release = await requestAcademyDataCenterRelease({ versionId: item.version.id, targetKind: "ROBOT", targetId: robot.id, notes: "Explicit training release" }, admin);
      expect(release.status).toBe("PENDING");
      expect(await retrieveAcademyDataCenterRelease("ROBOT", robot.id, admin)).toHaveLength(0);
      await expect(approveAcademyDataCenterRelease({ releaseId: release.id, notes: "Self approval prohibited" }, admin)).rejects.toThrow("INDEPENDENT_RELEASE_APPROVAL_REQUIRED");
      await approveAcademyDataCenterRelease({ releaseId: release.id, notes: "Independent administrator approved source and target" }, reviewer);
      expect(await retrieveAcademyDataCenterRelease("ROBOT", robot.id, admin)).toMatchObject([{ versionId: item.version.id }]);
      await tx.academyResource.update({ where: { id: resource.id }, data: { approvalState: "ARCHIVED" } });
      expect(await retrieveAcademyDataCenterRelease("ROBOT", robot.id, admin)).toHaveLength(0);
    });
  });
});
