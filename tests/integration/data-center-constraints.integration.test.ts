import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { DbExecutor } from "@/lib/db";

// Constraint tests run against a real, migrated PostgreSQL database inside a transaction that is always rolled back.
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
import { createDataCenterItem, createDataCenterSource, linkDataCenterEvidence, reviewDataCenterItem, transitionDataCenterItem } from "@/services/data-center/service";
import { recordDataCenterQualityAssessment } from "@/services/data-center/quality";
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
  }, { timeout: 60_000 })).rejects.toBe(rollback);
}
// A failed statement aborts a PostgreSQL transaction, so every expected violation runs inside its own savepoint.
async function rejected(tx: DbExecutor, work: () => Promise<unknown>, pattern: RegExp, label?: string) {
  await tx.$executeRawUnsafe("SAVEPOINT dc_expected_failure");
  try { await expect(work(), label).rejects.toThrow(pattern); } finally {
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT dc_expected_failure");
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT dc_expected_failure");
  }
}
const dataset = (sourceId: string, title: string, content: string, extra: Record<string, unknown> = {}) =>
  ({ sourceId, title, typeKey: "dataset", layer: "DATA" as const, content, evidenceStatus: "ESTIMATED" as const, ...extra });
const platformSource = (admin: DataCenterActor, name: string) =>
  createDataCenterSource({ name, kind: "OFFICIAL", scope: "PLATFORM", owner: "Authority", license: "Open" }, admin);
async function publish(itemId: string, actor: DataCenterActor) {
  await transitionDataCenterItem({ itemId, status: "IN_REVIEW", reason: "Submit reviewed source" }, actor);
  await reviewDataCenterItem({ itemId, decision: "APPROVED", notes: "Methodology reviewed; evidence label retained" }, actor);
  await transitionDataCenterItem({ itemId, status: "APPROVED", reason: "Approval recorded" }, actor);
  await transitionDataCenterItem({ itemId, status: "PUBLISHED", reason: "Release labelled estimate" }, actor);
}
afterAll(async () => { if (enabled) await (context.actual as typeof db).$disconnect(); });

describe.skipIf(!enabled)("Data Center retained database constraints on real PostgreSQL (always rolled back)", () => {
  it("links evidence through the service, enforces the evidence-link constraints and keeps links append-only", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin, "Evidence source");
      const provenance = [{ label: "Official table", reference: "https://authority.example.test/table", kind: "SOURCE" as const }];
      const item = await createDataCenterItem(dataset(source.id, "Evidence-backed dataset", "evidence backed rows", { provenance }), admin);
      expect(await tx.dataCenterEvidenceLink.findMany({ where: { versionId: item.version.id } })).toMatchObject([{ kind: "SOURCE", reference: provenance[0].reference, label: "Official table", evidenceId: null, linkedById: admin.id }]);

      const robot = await tx.robot.create({ data: { name: "Evidence robot", slug: `evidence-${randomUUID()}` } });
      const evidence = await tx.evidence.create({ data: { robotId: robot.id, type: "DOCUMENT", description: "Signed field report" } });
      const revision = async () => (await tx.dataCenterItem.findUniqueOrThrow({ where: { id: item.id } })).revision;
      const before = await revision();
      const existing = { versionId: item.version.id, kind: "EXISTING_EVIDENCE", evidenceId: evidence.id, reference: `evidence:${evidence.id}`, label: "Field report" };
      const link = await linkDataCenterEvidence(existing, admin);
      expect(link).toMatchObject({ kind: "EXISTING_EVIDENCE", evidenceId: evidence.id, linkedById: admin.id, notes: null });
      expect(await revision()).toBe(before + 1);
      expect(await tx.auditLog.count({ where: { action: "data-center.evidence.linked", entityId: link.id } })).toBe(1);
      expect(await tx.dataCenterEvidenceLink.count({ where: { evidenceId: evidence.id } })).toBe(1);

      await expect(linkDataCenterEvidence({ ...existing, evidenceId: undefined, reference: "r1" }, admin)).rejects.toMatchObject({ code: "EVIDENCE_REFERENCE_MISMATCH" });
      await expect(linkDataCenterEvidence({ ...existing, kind: "SOURCE", reference: "r2" }, admin)).rejects.toMatchObject({ code: "EVIDENCE_REFERENCE_MISMATCH" });
      await expect(linkDataCenterEvidence({ ...existing, evidenceId: "missing", reference: "r3" }, admin)).rejects.toMatchObject({ code: "EVIDENCE_NOT_FOUND", status: 404 });
      await expect(linkDataCenterEvidence({ ...existing, versionId: "missing" }, admin)).rejects.toMatchObject({ code: "VERSION_NOT_FOUND", status: 404 });
      await expect(linkDataCenterEvidence({ ...existing, reference: "r4" }, { id: admin.id, systemRole: "USER", kind: "HUMAN" })).rejects.toMatchObject({ code: "ADMIN_REQUIRED", status: 403 });
      await rejected(tx, () => linkDataCenterEvidence(existing, admin), /Unique constraint|DataCenterEvidenceLink_versionId_kind_reference_key/);
      expect(await revision()).toBe(before + 1);

      const raw = (over: Record<string, unknown>) => () => tx.dataCenterEvidenceLink.create({ data: { versionId: item.version.id, kind: "SOURCE", reference: `ref-${randomUUID()}`, label: "Raw link", linkedById: admin.id, ...over } as never });
      await rejected(tx, raw({ kind: "OTHER" }), /DataCenterEvidenceLink_kind_check/);
      await rejected(tx, raw({ kind: "EXISTING_EVIDENCE" }), /DataCenterEvidenceLink_existing_evidence_check/);
      await rejected(tx, raw({ kind: "SOURCE", evidenceId: evidence.id }), /DataCenterEvidenceLink_existing_evidence_check/);
      await rejected(tx, raw({ kind: "EXISTING_EVIDENCE", evidenceId: "missing" }), /DataCenterEvidenceLink_evidenceId_fkey/);
      await rejected(tx, raw({ versionId: "missing" }), /DataCenterEvidenceLink_versionId_fkey/);
      await rejected(tx, raw({ linkedById: "missing" }), /DataCenterEvidenceLink_linkedById_fkey/);
      for (const kind of ["SOURCE", "DOCUMENT", "CALCULATION", "HUMAN_REVIEW"]) expect((await raw({ kind })()).kind).toBe(kind);
      await rejected(tx, () => tx.dataCenterEvidenceLink.update({ where: { id: link.id }, data: { label: "Edited" } }), /immutable/i);
      await rejected(tx, () => tx.dataCenterEvidenceLink.delete({ where: { id: link.id } }), /immutable/i);
      await rejected(tx, () => tx.evidence.delete({ where: { id: evidence.id } }), /DataCenterEvidenceLink_evidenceId_fkey/);
    });
  });

  it("enforces the original CHECKs, unique keys and the deferrable version foreign keys at the database boundary", async () => {
    await isolated(async (tx, admin) => {
      const organization = await tx.organization.create({ data: { name: "Constraint org", slug: `constraints-${randomUUID()}` } });
      const reviewer = await tx.user.create({ data: { email: `reviewer-${randomUUID()}@example.test`, status: "ACTIVE" } });
      const source = await platformSource(admin, "Constraint source");
      const item = await createDataCenterItem(dataset(source.id, "Constrained dataset", "constrained rows"), admin);
      const second = await createDataCenterItem(dataset(source.id, "Second constrained dataset", "second constrained rows"), admin);

      const sourceRow = (over: Record<string, unknown>) => () => tx.dataCenterSource.create({ data: { name: `S-${randomUUID()}`, kind: "MANUAL", scope: "PLATFORM", ownerId: admin.id, owner: "Owner", license: "Open", ...over } as never });
      await rejected(tx, sourceRow({ scope: "ORGANIZATION" }), /DataCenterSource_scope_check/);
      await rejected(tx, sourceRow({ scope: "PLATFORM", organizationId: organization.id }), /DataCenterSource_scope_check/);
      await rejected(tx, sourceRow({ scope: "PRIVATE", organizationId: organization.id }), /DataCenterSource_scope_check/);
      await rejected(tx, sourceRow({ freshnessDays: 0 }), /DataCenterSource_freshness_check/);
      await rejected(tx, sourceRow({ freshnessDays: 3651 }), /DataCenterSource_freshness_check/);
      await rejected(tx, sourceRow({ organizationId: "missing", scope: "ORGANIZATION" }), /DataCenterSource_organizationId_fkey/);
      await rejected(tx, sourceRow({ ownerId: "missing" }), /DataCenterSource_ownerId_fkey/);
      expect((await sourceRow({ scope: "ORGANIZATION", organizationId: organization.id, freshnessDays: 3650 })()).freshnessDays).toBe(3650);
      expect((await sourceRow({ freshnessDays: 1 })()).freshnessDays).toBe(1);

      const itemRow = (over: Record<string, unknown>) => () => tx.dataCenterItem.create({ data: { sourceId: source.id, typeKey: "dataset", layer: "DATA", title: "Raw item", createdById: admin.id, ...over } as never });
      await rejected(tx, itemRow({ currentVersion: 0 }), /DataCenterItem_version_check/);
      await rejected(tx, itemRow({ createdById: "missing" }), /DataCenterItem_createdById_fkey/);
      await rejected(tx, itemRow({ typeKey: "missing-type" }), /DataCenterItem_typeKey_fkey/);
      // The composite version foreign keys are DEFERRABLE INITIALLY DEFERRED, so they are checked at COMMIT. These tests never commit,
      // therefore the check is forced here; without it a dangling version pointer would go unnoticed.
      const forced = (constraint: string) => `SET CONSTRAINTS "${constraint}" IMMEDIATE`;
      await rejected(tx, async () => { await itemRow({ currentVersion: 5 })(); await tx.$executeRawUnsafe(forced("DataCenterItem_current_version_fkey")); }, /DataCenterItem_current_version_fkey/);
      await rejected(tx, async () => { await itemRow({ publishedVersion: 7 })(); await tx.$executeRawUnsafe(forced("DataCenterItem_published_version_fkey")); }, /DataCenterItem_published_version_fkey/);
      await rejected(tx, async () => { await tx.dataCenterItem.update({ where: { id: item.id }, data: { currentVersion: 9 } }); await tx.$executeRawUnsafe(forced("DataCenterItem_current_version_fkey")); }, /DataCenterItem_current_version_fkey/);

      const versionRow = (over: Record<string, unknown>) => () => tx.dataCenterVersion.create({ data: { itemId: second.id, number: 50, title: "Raw version", content: "raw", provenance: [], confidence: {}, checksum: "x", createdById: admin.id, specialties: [], missionContexts: [], ...over } as never });
      await rejected(tx, versionRow({ number: 0 }), /DataCenterVersion_number_check/);
      await rejected(tx, versionRow({ content: "" }), /DataCenterVersion_content_check/);
      await rejected(tx, versionRow({ content: "x".repeat(200_001) }), /DataCenterVersion_content_check/);
      await rejected(tx, versionRow({ origin: "ROBOT" }), /DataCenterVersion_origin_check/);
      await rejected(tx, versionRow({ origin: "AI", evidenceStatus: "VERIFIED" }), /DataCenterVersion_ai_not_verified/);
      await rejected(tx, versionRow({ number: 1 }), /Unique constraint|DataCenterVersion_itemId_number_key/);
      await rejected(tx, versionRow({ effectiveFrom: new Date("2026-02-01T00:00:00Z"), effectiveTo: new Date("2026-01-01T00:00:00Z") }), /DataCenterVersion_effective_dates_check/);
      await rejected(tx, versionRow({ effectiveFrom: new Date("2026-02-01T00:00:00Z"), effectiveTo: new Date("2026-02-01T00:00:00Z") }), /DataCenterVersion_effective_dates_check/);
      await rejected(tx, versionRow({ createdById: "missing" }), /DataCenterVersion_createdById_fkey/);
      await rejected(tx, versionRow({ itemId: "missing" }), /DataCenterVersion_itemId_fkey/);
      for (const origin of ["HUMAN", "AI", "IMPORT", "CALCULATION", "ACADEMY"]) expect((await versionRow({ number: 60 + ["HUMAN", "AI", "IMPORT", "CALCULATION", "ACADEMY"].indexOf(origin), origin, evidenceStatus: "ESTIMATED" })()).origin).toBe(origin);
      expect((await versionRow({ number: 70, effectiveFrom: new Date("2026-01-01T00:00:00Z"), effectiveTo: new Date("2026-02-01T00:00:00Z"), content: "x".repeat(200_000) })()).number).toBe(70);

      const reviewRow = (over: Record<string, unknown>) => () => tx.dataCenterReview.create({ data: { versionId: item.version.id, reviewerId: reviewer.id, decision: "APPROVED", notes: "Reviewed", ...over } as never });
      await rejected(tx, reviewRow({ decision: "MAYBE" }), /DataCenterReview_decision_check/);
      await rejected(tx, reviewRow({ reviewerId: "missing" }), /DataCenterReview_reviewerId_fkey/);
      expect((await reviewRow({})()).decision).toBe("APPROVED");
      await rejected(tx, reviewRow({ decision: "REJECTED" }), /Unique constraint|DataCenterReview_versionId_reviewerId_key/);
      expect((await reviewRow({ reviewerId: admin.id, decision: "REJECTED" })()).decision).toBe("REJECTED");

      const conflictRow = (over: Record<string, unknown>) => () => tx.dataCenterConflict.create({ data: { itemId: item.id, otherItemId: second.id, itemVersion: 1, otherVersion: 1, reason: "Figures disagree", ...over } as never });
      const resolved = { resolvedAt: new Date(), resolution: "KEEP_BOTH", resolvedById: admin.id, notes: "Different methodologies" };
      await rejected(tx, conflictRow({ otherItemId: item.id }), /DataCenterConflict_distinct_check/);
      await rejected(tx, conflictRow({ resolvedAt: new Date() }), /DataCenterConflict_resolution_check/);
      await rejected(tx, conflictRow({ resolution: "KEEP_BOTH" }), /DataCenterConflict_resolution_check/);
      await rejected(tx, conflictRow({ ...resolved, resolution: "DISCARD" }), /DataCenterConflict_resolution_check/);
      await rejected(tx, conflictRow({ ...resolved, notes: null }), /DataCenterConflict_resolution_check/);
      await rejected(tx, conflictRow({ ...resolved, resolvedById: null }), /DataCenterConflict_resolution_check/);
      await rejected(tx, conflictRow({ resolvedById: admin.id }), /DataCenterConflict_resolution_check/);
      await rejected(tx, conflictRow({ ...resolved, resolvedById: "missing" }), /DataCenterConflict_resolvedById_fkey/);
      const open = await conflictRow({})();
      expect(open).toMatchObject({ resolvedAt: null, resolution: null });
      for (const resolution of ["KEEP_FIRST", "KEEP_SECOND", "KEEP_BOTH", "SUPERSEDED"]) expect((await conflictRow({ ...resolved, resolution })()).resolution).toBe(resolution);

      const importRow = (over: Record<string, unknown>) => () => tx.dataCenterImport.create({ data: { sourceId: source.id, versionId: item.version.id, actorId: admin.id, fileName: "data.csv", mimeType: "text/csv", sizeBytes: 10,
        checksum: "x", storageKey: `key-${randomUUID()}`, adapter: "csv-v1", scanEngine: "test", ...over } as never });
      await rejected(tx, importRow({ sizeBytes: 0 }), /DataCenterImport_sizeBytes_check/);
      await rejected(tx, importRow({ sizeBytes: 10_485_761 }), /DataCenterImport_sizeBytes_check/);
      await rejected(tx, importRow({ actorId: "missing" }), /DataCenterImport_actorId_fkey/);
      const storageKey = `key-${randomUUID()}`;
      expect((await importRow({ storageKey, sizeBytes: 10_485_760 })()).sizeBytes).toBe(10_485_760);
      await rejected(tx, importRow({ storageKey }), /Unique constraint|DataCenterImport_storageKey_key/);

      const releaseRow = (over: Record<string, unknown>) => () => tx.dataCenterAcademyRelease.create({ data: { versionId: item.version.id, targetKind: "ROBOT", targetId: "robot-1", requestedById: admin.id, notes: "Training release", ...over } as never });
      await rejected(tx, releaseRow({ targetKind: "TEAM" }), /DataCenterAcademyRelease_targetKind_check/);
      await rejected(tx, releaseRow({ status: "REJECTED" }), /DataCenterAcademyRelease_status_check/);
      await rejected(tx, releaseRow({ approvedById: admin.id }), /DataCenterAcademyRelease_independent_check/);
      await rejected(tx, releaseRow({ requestedById: "missing" }), /DataCenterAcademyRelease_requestedById_fkey/);
      await rejected(tx, releaseRow({ approvedById: "missing" }), /DataCenterAcademyRelease_approvedById_fkey/);
      const pending = await releaseRow({})();
      expect(pending).toMatchObject({ status: "PENDING", parentRevision: null });
      expect((await releaseRow({ targetKind: "COURSE", approvedById: reviewer.id, status: "APPROVED", approvedAt: new Date() })()).approvedById).toBe(reviewer.id);

      const usageRow = (over: Record<string, unknown>) => () => tx.dataCenterUsage.create({ data: { versionId: item.version.id, actorId: admin.id, consumer: "constraint-test", purpose: "Check foreign keys", ...over } as never });
      await rejected(tx, usageRow({ missionId: "missing" }), /DataCenterUsage_missionId_fkey/);
      await rejected(tx, usageRow({ actorId: "missing" }), /DataCenterUsage_actorId_fkey/);
      const eventRow = (over: Record<string, unknown>) => () => tx.dataCenterEvent.create({ data: { itemId: item.id, version: 1, toStatus: "DRAFT", actorId: admin.id, reason: "Check foreign keys", ...over } as never });
      await rejected(tx, eventRow({ actorId: "missing" }), /DataCenterEvent_actorId_fkey/);

      // Normal flows must leave every deferrable pointer valid, which COMMIT would otherwise be the first to prove.
      const lifecycle = await createDataCenterItem(dataset(source.id, "Lifecycle dataset", "lifecycle rows"), admin);
      await publish(lifecycle.id, admin);
      expect((await tx.dataCenterItem.findUniqueOrThrow({ where: { id: lifecycle.id } })).publishedVersion).toBe(1);
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");
    });
  });

  it("keeps versions, reviews, events, usage, imports, evidence links, lineage and quality assessments immutable while other tables stay editable", async () => {
    await isolated(async (tx, admin) => {
      const reviewer = await tx.user.create({ data: { email: `reviewer-${randomUUID()}@example.test`, status: "ACTIVE" } });
      const source = await platformSource(admin, "Immutable source");
      const upstream = await createDataCenterItem(dataset(source.id, "Upstream dataset", "upstream rows"), admin);
      const item = await createDataCenterItem(dataset(source.id, "Immutable dataset", "immutable rows", { upstreamVersionIds: [upstream.version.id],
        provenance: [{ label: "Official table", reference: "https://authority.example.test/table", kind: "SOURCE" }] }), admin);
      const second = await createDataCenterItem(dataset(source.id, "Editable dataset", "editable rows"), admin);
      const review = await tx.dataCenterReview.create({ data: { versionId: item.version.id, reviewerId: reviewer.id, decision: "APPROVED", notes: "Reviewed" } });
      const event = await tx.dataCenterEvent.findFirstOrThrow({ where: { itemId: item.id } });
      const usage = await tx.dataCenterUsage.create({ data: { versionId: item.version.id, actorId: admin.id, consumer: "constraint-test", purpose: "Immutability" } });
      const imported = await tx.dataCenterImport.create({ data: { sourceId: source.id, versionId: item.version.id, actorId: admin.id, fileName: "data.csv", mimeType: "text/csv", sizeBytes: 10, checksum: "x", storageKey: `key-${randomUUID()}`, adapter: "csv-v1", scanEngine: "test" } });
      const link = await tx.dataCenterEvidenceLink.findFirstOrThrow({ where: { versionId: item.version.id } });
      const edge = await tx.dataCenterVersionLineage.findFirstOrThrow({ where: { versionId: item.version.id } });
      const quality = await recordDataCenterQualityAssessment({ versionId: item.version.id, status: "MEASURED", score: 0.7, method: "manual-review", methodVersion: "1", measuredAt: "2026-10-01T09:00:00.000Z", explanation: "Sampled rows" }, admin);

      const cases: [string, () => Promise<unknown>, () => Promise<unknown>][] = [
        ["version", () => tx.dataCenterVersion.update({ where: { id: item.version.id }, data: { title: "Edited" } }), () => tx.dataCenterVersion.delete({ where: { id: item.version.id } })],
        ["review", () => tx.dataCenterReview.update({ where: { id: review.id }, data: { notes: "Edited" } }), () => tx.dataCenterReview.delete({ where: { id: review.id } })],
        ["event", () => tx.dataCenterEvent.update({ where: { id: event.id }, data: { reason: "Edited" } }), () => tx.dataCenterEvent.delete({ where: { id: event.id } })],
        ["usage", () => tx.dataCenterUsage.update({ where: { id: usage.id }, data: { purpose: "Edited" } }), () => tx.dataCenterUsage.delete({ where: { id: usage.id } })],
        ["import", () => tx.dataCenterImport.update({ where: { id: imported.id }, data: { fileName: "edited.csv" } }), () => tx.dataCenterImport.delete({ where: { id: imported.id } })],
        ["evidence link", () => tx.dataCenterEvidenceLink.update({ where: { id: link.id }, data: { label: "Edited" } }), () => tx.dataCenterEvidenceLink.delete({ where: { id: link.id } })],
        ["lineage", () => tx.dataCenterVersionLineage.update({ where: { id: edge.id }, data: { upstreamVersionId: second.version.id } }), () => tx.dataCenterVersionLineage.delete({ where: { id: edge.id } })],
        ["quality assessment", () => tx.dataCenterQualityAssessment.update({ where: { id: quality.id }, data: { score: 1 } }), () => tx.dataCenterQualityAssessment.delete({ where: { id: quality.id } })],
      ];
      for (const [name, update, remove] of cases) {
        await rejected(tx, update, /immutable/i, `${name} update`);
        await rejected(tx, remove, /immutable/i, `${name} delete`);
      }
      expect((await tx.dataCenterVersion.findUniqueOrThrow({ where: { id: item.version.id } })).title).toBe("Immutable dataset");

      // Governance tables that legitimately change stay editable, so the triggers are not over-broad.
      expect((await tx.dataCenterSource.update({ where: { id: source.id }, data: { allowExport: true } })).allowExport).toBe(true);
      expect((await tx.dataCenterItem.update({ where: { id: second.id }, data: { title: "Renamed editable dataset" } })).title).toBe("Renamed editable dataset");
      const conflict = await tx.dataCenterConflict.create({ data: { itemId: item.id, otherItemId: second.id, itemVersion: 1, otherVersion: 1, reason: "Figures disagree" } });
      expect((await tx.dataCenterConflict.update({ where: { id: conflict.id }, data: { resolvedAt: new Date(), resolution: "KEEP_BOTH", resolvedById: admin.id, notes: "Different methodologies" } })).resolution).toBe("KEEP_BOTH");
      const release = await tx.dataCenterAcademyRelease.create({ data: { versionId: item.version.id, targetKind: "ROBOT", targetId: "robot-1", requestedById: admin.id, notes: "Training release" } });
      expect((await tx.dataCenterAcademyRelease.update({ where: { id: release.id }, data: { status: "APPROVED", approvedById: reviewer.id, approvedAt: new Date() } })).status).toBe("APPROVED");
      expect((await tx.dataCenterType.update({ where: { key: "dataset" }, data: { label: "Structured dataset" } })).key).toBe("dataset");
    });
  });

  it("documents every database-only object, keeps the expected foreign keys and exposes new undocumented ones", async () => {
    await isolated(async (tx) => {
      const root = process.cwd();
      const doc = readFileSync(join(root, "docs", "data-center-v1.md"), "utf8");
      const objects = await tx.$queryRaw<{ kind: string; name: string }[]>`
        SELECT 'CHECK' AS kind, con.conname::text AS name FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
         WHERE con.contype = 'c' AND rel.relnamespace = 'public'::regnamespace AND rel.relname LIKE 'DataCenter%'
        UNION ALL SELECT 'TRIGGER', trg.tgname::text FROM pg_trigger trg JOIN pg_class rel ON rel.oid = trg.tgrelid
         WHERE NOT trg.tgisinternal AND rel.relnamespace = 'public'::regnamespace AND rel.relname LIKE 'DataCenter%'
        UNION ALL SELECT 'FUNCTION', proc.proname::text FROM pg_proc proc WHERE proc.pronamespace = 'public'::regnamespace AND proc.proname LIKE 'data_center_%'
        UNION ALL SELECT 'INDEX', idx.indexname::text FROM pg_indexes idx WHERE idx.schemaname = 'public' AND idx.indexname = 'DataCenterVersion_search_idx'
        UNION ALL SELECT 'FOREIGN KEY', con.conname::text FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
         WHERE con.contype = 'f' AND rel.relnamespace = 'public'::regnamespace AND rel.relname LIKE 'DataCenter%'
        ORDER BY 1, 2`;
      const names = (kind: string) => objects.filter((object) => object.kind === kind).map((object) => object.name);
      expect(names("CHECK").length).toBeGreaterThanOrEqual(35);
      expect(names("TRIGGER")).toEqual(expect.arrayContaining(["DataCenterVersion_immutable", "DataCenterEvidenceLink_immutable", "DataCenterRobotGrant_guard", "DataCenterVersionLineage_acyclic"]));
      expect(names("FUNCTION")).toEqual(expect.arrayContaining(["data_center_immutable", "data_center_robot_grant_guard", "data_center_lineage_acyclic", "data_center_codes_match", "data_center_regions_within"]));
      expect(names("INDEX")).toEqual(["DataCenterVersion_search_idx"]);
      for (const kind of ["CHECK", "TRIGGER", "FUNCTION", "INDEX"]) {
        const missing = names(kind).filter((name) => !doc.includes(name));
        expect(missing, `${kind} objects missing from docs/data-center-v1.md`).toEqual([]);
      }

      // Foreign keys that Prisma models appear in schema.prisma; everything else is database-only and must be listed and documented.
      const schema = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");
      const modelled = new Set<string>();
      for (const block of schema.match(/^model DataCenter\w+ \{[\s\S]*?^\}/gm) ?? []) {
        const model = /^model (\w+)/.exec(block)![1];
        for (const match of block.matchAll(/@relation\([^)]*fields:\s*\[(\w+)\]/g)) modelled.add(`${model}_${match[1]}_fkey`);
      }
      expect(modelled.size).toBeGreaterThanOrEqual(19);
      const databaseOnly = names("FOREIGN KEY").filter((name) => !modelled.has(name)).sort();
      expect(databaseOnly).toEqual([
        "DataCenterAcademyRelease_approvedById_fkey", "DataCenterAcademyRelease_requestedById_fkey", "DataCenterConflict_resolvedById_fkey", "DataCenterEvent_actorId_fkey",
        "DataCenterEvidenceLink_linkedById_fkey", "DataCenterImport_actorId_fkey", "DataCenterItem_createdById_fkey", "DataCenterItem_current_version_fkey",
        "DataCenterItem_published_version_fkey", "DataCenterQualityAssessment_assessedById_fkey", "DataCenterReview_reviewerId_fkey", "DataCenterRobotGrant_grantedById_fkey",
        "DataCenterRobotGrant_missionId_fkey", "DataCenterRobotGrant_principalId_fkey", "DataCenterRobotGrant_revokedById_fkey", "DataCenterRobotGrant_robotId_fkey",
        "DataCenterSource_organizationId_fkey", "DataCenterSource_ownerId_fkey", "DataCenterUsage_actorId_fkey", "DataCenterUsage_missionId_fkey", "DataCenterVersion_createdById_fkey",
      ]);
      expect(databaseOnly.filter((name) => !doc.includes(name)), "database-only foreign keys missing from docs/data-center-v1.md").toEqual([]);
      expect([...modelled].filter((name) => !names("FOREIGN KEY").includes(name)), "modelled foreign keys that do not exist").toEqual([]);
    });
  });
});
