import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { DbExecutor } from "@/lib/db";
const context = vi.hoisted(() => ({ tx: null as unknown, actual: null as unknown }));
vi.mock("@/lib/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db")>(); context.actual = original.db;
  return { ...original, db: new Proxy(original.db, {
    get(target, key) {
      const tx = context.tx as Record<string | symbol, unknown> | null;
      if (tx) { const value = tx[key]; return typeof value === "function" ? value.bind(tx) : value; }
      return Reflect.get(target, key);
    },
  }) };
});
import { db } from "@/lib/db";
import type { DataCenterActor } from "@/services/data-center/contracts";
import { createDataCenterItem, createDataCenterSource, createDataCenterVersion, registerDataCenterType, reviewDataCenterItem, transitionDataCenterItem } from "@/services/data-center/service";
import { grantDataCenterRobotAccess, revokeDataCenterRobotAccess } from "@/services/data-center/robot-grants";
import { bindFinancialDataset, FINANCIAL_MODEL_TYPE_KEY } from "@/services/analysis-engines/financial-feasibility";
import { createFinancialDataCenterProvider, prepareFinancialDataCenterInputs } from "@/services/analysis-engines/financial-feasibility/adapters/data-center-provider";
import { financialDataset, financialReference } from "../unit/support/financial-data-fixtures";

const enabled = process.env.DATA_CENTER_DATABASE_TESTS === "1";
const rollback = new Error("ROLLBACK_FINANCIAL_M2_SYNTHETIC_ONLY");
const trusted = () => ({ evaluatedAt: new Date(Math.max(Date.now(), Date.parse("2026-10-22T12:00:00.000Z"))).toISOString() });
async function isolated(run: (tx: DbExecutor, actor: DataCenterActor) => Promise<void>) {
  try {
    await (context.actual as typeof db).$transaction(async (tx) => {
      const identity = await tx.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
      if (!/^se_financial_m2_[a-f0-9]{12}$/.test(identity[0]?.name ?? "")) throw new Error("Financial M2 requires its own disposable migrated database");
      context.tx = tx;
      try {
        const user = await tx.user.create({ data: { email: `financial-m2-${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
        const actor: DataCenterActor = { id: user.id, kind: "HUMAN", systemRole: "ADMIN" };
        if (!await tx.dataCenterType.findUnique({ where: { key: FINANCIAL_MODEL_TYPE_KEY } })) {
          await registerDataCenterType({ key: FINANCIAL_MODEL_TYPE_KEY, label: "Synthetic financial model only", layer: "DATA", requiresIndependentReview: false }, actor);
        }
        await run(tx, actor); throw rollback;
      } finally { context.tx = null; }
    }, { timeout: 90_000, maxWait: 30_000 });
  } catch (error) { if (error !== rollback) throw error; }
}
const source = (actor: DataCenterActor, extra: Partial<Parameters<typeof createDataCenterSource>[0]> = {}) => createDataCenterSource({
  name: `Synthetic financial ${randomUUID()}`, kind: "OFFICIAL", scope: "PLATFORM", owner: "Synthetic owner",
  license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", ownership: "THIRD_PARTY", allowExport: false, freshnessDays: 365,
  usagePolicy: "Synthetic only; attribution required", attribution: "Synthetic financial evidence", attributionRequired: true, ...extra,
}, actor);
async function publish(itemId: string, actor: DataCenterActor) {
  await transitionDataCenterItem({ itemId, status: "IN_REVIEW", reason: "Synthetic submission" }, actor);
  await reviewDataCenterItem({ itemId, decision: "APPROVED", notes: "Synthetic model, not real financial acceptance" }, actor);
  await transitionDataCenterItem({ itemId, status: "APPROVED", reason: "Synthetic approval" }, actor);
  await transitionDataCenterItem({ itemId, status: "PUBLISHED", reason: "Synthetic publication" }, actor);
}
async function fixture(actor: DataCenterActor, options: {
  source?: Awaited<ReturnType<typeof source>>;
  change?: (dataset: ReturnType<typeof financialDataset>) => void;
  item?: Partial<Parameters<typeof createDataCenterItem>[0]>;
} = {}) {
  const s = options.source ?? await source(actor);
  const content = financialDataset(); content.sourceId = s.id; options.change?.(content);
  const item = await createDataCenterItem({
    sourceId: s.id, title: "Synthetic financial M2 model", typeKey: FINANCIAL_MODEL_TYPE_KEY, layer: "DATA",
    content: JSON.stringify(content), evidenceStatus: "VERIFIED", sourcePublishedAt: "2026-10-02T00:00:00.000Z",
    provenance: [{ kind: "DOCUMENT", reference: "fixture:financial-m2", label: "Synthetic declared model" }],
    coverage: { countryCodes: ["SA"], regionCodes: [] }, ...options.item,
  }, actor);
  await publish(item.id, actor);
  const reference = financialReference(); reference.source.sourceId = s.id; reference.version.versionId = item.version.id; reference.version.checksum.value = item.version.checksum;
  const req = bindFinancialDataset(content, reference, trusted().evaluatedAt);
  return { s, item, req, content };
}
const user = async (tx: DbExecutor): Promise<DataCenterActor> => {
  const row = await tx.user.create({ data: { email: `financial-reader-${randomUUID()}@example.test`, status: "ACTIVE" } });
  return { id: row.id, kind: "HUMAN", systemRole: "USER" };
};
const counts = async (tx: DbExecutor) => ({
  sources: await tx.dataCenterSource.count(), types: await tx.dataCenterType.count(), items: await tx.dataCenterItem.count(),
  versions: await tx.dataCenterVersion.count(), audits: await tx.auditLog.count(), events: await tx.dataCenterEvent.count(),
  usages: await tx.dataCenterUsage.count(), runs: await tx.analysisEngineRun.count(), inputs: await tx.analysisEngineRunInput.count(),
});

describe.skipIf(!enabled)("Financial M2 exact source validation, synthetic disposable PostgreSQL only", () => {
  afterAll(async () => { if (enabled) await (context.actual as typeof db).$disconnect(); });
  it("validates exact financial model and byte checksum without any DB/source/usage/audit/run writes", async () => {
    await isolated(async (tx, admin) => {
      const { req, item } = await fixture(admin); const reader = await user(tx); const before = await counts(tx);
      const result = await prepareFinancialDataCenterInputs(req, reader, trusted());
      expect(result.status).toBe("AVAILABLE"); expect(result.ready).toBe(true);
      expect(result.validated!.model).toEqual(req);
      expect(result.inputs[0]!.checksum!.value).toBe(item.version.checksum);
      expect(result.validated!.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.validated!.model.assumptions[0]!.evidence[0]!.versionId).toBe(item.version.id);
      expect(result.rights.allowExport).toBe(false); expect(result.attribution[0]!.required).toBe(true);
      expect(result).not.toHaveProperty("metrics"); expect(result.realDataAcceptance).toBe("BLOCKED / NOT VERIFIED");
      expect(await counts(tx)).toEqual(before);
    });
  });
  it("rejects caller checksum mismatch without substituting another version", async () => {
    await isolated(async (_tx, admin) => {
      const { req } = await fixture(admin); req.data.versions[0]!.checksum = "b".repeat(64);
      req.assumptions.forEach((a) => a.evidence.forEach((ref) => { ref.checksum = "b".repeat(64); }));
      req.schedules.forEach((s) => s.evidence.forEach((ref) => { ref.checksum = "b".repeat(64); }));
      const result = await prepareFinancialDataCenterInputs(req, admin, trusted());
      expect(result.reason).toBe("CHECKSUM_MISMATCH"); expect(result.work.reads).toBe(0);
    });
  });
  it("detects stored byte tampering using the unchanged full Data Center checksum", async () => {
    await isolated(async (tx, admin) => {
      const { req, item } = await fixture(admin);
      await tx.$executeRawUnsafe('ALTER TABLE "DataCenterVersion" DISABLE TRIGGER "DataCenterVersion_immutable"');
      try { await tx.dataCenterVersion.update({ where: { id: item.version.id }, data: { content: "tampered" } }); }
      finally { await tx.$executeRawUnsafe('ALTER TABLE "DataCenterVersion" ENABLE TRIGGER "DataCenterVersion_immutable"'); }
      const result = await prepareFinancialDataCenterInputs(req, admin, trusted());
      expect(result.reason).toBe("CHECKSUM_MISMATCH"); expect(result.validated).toBeNull();
    });
  });
  it("does not fall back to a newly published model when the exact pin is superseded", async () => {
    await isolated(async (_tx, admin) => {
      const { req, item, content } = await fixture(admin);
      await createDataCenterVersion({ itemId: item.id, title: "Synthetic next financial model", reason: "Synthetic next-version acceptance",
        content: JSON.stringify(content), evidenceStatus: "VERIFIED", sourcePublishedAt: "2026-10-02T00:00:00.000Z",
        provenance: [{ kind: "DOCUMENT", reference: "fixture:financial-m2-new", label: "Synthetic next version" }], coverage: { countryCodes: ["SA"], regionCodes: [] } }, admin);
      await publish(item.id, admin);
      const result = await prepareFinancialDataCenterInputs(req, admin, trusted());
      expect(result.status).toBe("NOT_AVAILABLE"); expect(result.reason).toBe("SOURCE_UNAVAILABLE"); expect(result.work.reads).toBe(0);
    });
  });
  it("makes private and absent versions indistinguishable in direct discovery/read", async () => {
    await isolated(async (tx, admin) => {
      const owner = await user(tx); const s = await source(owner, { scope: "PRIVATE" });
      const { item } = await fixture(admin, { source: s }); const reader = await user(tx);
      const provider = createFinancialDataCenterProvider(reader, trusted());
      for (const id of [item.version.id, "absent-financial-version"]) {
        expect(await provider.read({ versionId: id, expectedChecksum: item.version.checksum })).toEqual({ status: "NOT_AVAILABLE" });
        const discovery = await provider.discover({ versionIds: [id] });
        expect(discovery.status).toBe("NOT_AVAILABLE"); expect(discovery.candidates).toEqual([]);
      }
    });
  });
  it.each(["retrieval", "archive"] as const)("reauthorizes current %s policy", async (kind) => {
    await isolated(async (tx, admin) => {
      const { s, req, item } = await fixture(admin); const reader = await user(tx);
      const provider = createFinancialDataCenterProvider(reader, trusted());
      const pin = { versionId: item.version.id, expectedChecksum: item.version.checksum };
      expect(await provider.read(pin)).toMatchObject({ status: "AVAILABLE" });
      if (kind === "retrieval") await tx.dataCenterSource.update({ where: { id: s.id }, data: { allowRetrieval: false } });
      else await transitionDataCenterItem({ itemId: item.id, status: "ARCHIVED", reason: "Synthetic archive" }, admin);
      expect(await provider.read(pin)).toEqual({ status: "NOT_AVAILABLE" });
      expect((await prepareFinancialDataCenterInputs(req, reader, trusted())).status).toBe("NOT_AVAILABLE");
    });
  });
  it("checks specialty/mission restrictions without weakening the governed reader", async () => {
    await isolated(async (_tx, admin) => {
      const { item } = await fixture(admin, { item: { specialties: ["financial"], missionContexts: ["study"] } });
      const pin = { versionId: item.version.id, expectedChecksum: item.version.checksum };
      expect(await createFinancialDataCenterProvider(admin, trusted()).read(pin)).toEqual({ status: "NOT_AVAILABLE" });
      expect(await createFinancialDataCenterProvider(admin, { ...trusted(), specialty: "financial", missionContext: "study" }).read(pin)).toMatchObject({ status: "AVAILABLE" });
    });
  });
  it("honors a required permission before exposing exact metadata or bytes", async () => {
    await isolated(async (tx, admin) => {
      const { item } = await fixture(admin, { item: { requiredPermission: "data_center:manage" } });
      const reader = await user(tx); const provider = createFinancialDataCenterProvider(reader, trusted());
      expect(await provider.read({ versionId: item.version.id, expectedChecksum: item.version.checksum })).toEqual({ status: "NOT_AVAILABLE" });
      expect((await provider.discover({ versionIds: [item.version.id] })).candidates).toEqual([]);
    });
  });
  it("does not interpret out-of-coverage source metadata as zero financial activity", async () => {
    await isolated(async (_tx, admin) => {
      const { req } = await fixture(admin, { item: { coverage: { countryCodes: ["AE"], regionCodes: [] } } });
      const result = await prepareFinancialDataCenterInputs(req, admin, trusted());
      expect(result.status).toBe("NO_COVERAGE"); expect(result.ready).toBe(false); expect(result.validated).toBeNull();
    });
  });
  it("checks trusted org scope and revoked current organization membership", async () => {
    await isolated(async (tx, admin) => {
      const { req, s, item } = await fixture(admin); const reader = await user(tx);
      const org = await tx.organization.create({ data: { name: "Synthetic financial org", slug: `financial-${randomUUID()}` } });
      const membership = await tx.organizationMember.create({ data: { userId: reader.id, organizationId: org.id, isOwner: true, status: "ACTIVE" } });
      await tx.dataCenterSource.update({ where: { id: s.id }, data: { scope: "ORGANIZATION", organizationId: org.id } });
      const ctx = { ...trusted(), organizationId: org.id };
      expect((await prepareFinancialDataCenterInputs(req, reader, ctx)).ready).toBe(true);
      const pin = { versionId: item.version.id, expectedChecksum: item.version.checksum };
      expect(await createFinancialDataCenterProvider(admin, { ...trusted(), organizationId: "other-org" }).read(pin)).toEqual({ status: "NOT_AVAILABLE" });
      await tx.organizationMember.update({ where: { id: membership.id }, data: { status: "SUSPENDED" } });
      expect(await createFinancialDataCenterProvider(reader, ctx).read(pin)).toEqual({ status: "NOT_AVAILABLE" });
    });
  });
  it("checks live robot grants and rejects revoked grants", async () => {
    await isolated(async (tx, admin) => {
      const { s, item } = await fixture(admin); const principal = await user(tx);
      const robot = await tx.robot.create({ data: { slug: `financial-${randomUUID()}`, name: "Synthetic financial reader" } });
      const mission = await tx.mission.create({ data: { name: "Synthetic financial study", assignedRobots: { connect: { id: robot.id } } } });
      const actor: DataCenterActor = { id: principal.id, kind: "AI", systemRole: "USER", robotId: robot.id, roleKey: "analyst", specialty: "financial", missionId: mission.id };
      const provider = createFinancialDataCenterProvider(actor, trusted()); const pin = { versionId: item.version.id, expectedChecksum: item.version.checksum };
      await expect(provider.read(pin)).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED" });
      const grant = await grantDataCenterRobotAccess({ robotId: robot.id, sourceId: s.id, principalId: principal.id, roleKey: "analyst", specialty: "financial", missionId: mission.id,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(), reason: "Synthetic exact read permission" }, admin);
      expect(await provider.read(pin)).toMatchObject({ status: "AVAILABLE" });
      await revokeDataCenterRobotAccess({ grantId: grant.id, reason: "Synthetic revoke" }, admin);
      await expect(provider.read(pin)).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED" });
    });
  });
  it.each(["model-unreviewed", "assumption-unreviewed", "partial", "missing", "wrong-source"] as const)("does not trust publication alone for %s", async (kind) => {
    await isolated(async (_tx, admin) => {
      const { req } = await fixture(admin, { change: (d) => {
        if (kind === "model-unreviewed") d.approval.status = "UNREVIEWED";
        if (kind === "assumption-unreviewed") d.model.assumptions[0]!.approval = "UNREVIEWED";
        if (kind === "partial") { d.coverage.status = "PARTIAL"; d.coverage.completeness = "SAMPLE"; }
        if (kind === "missing") d.model.assumptions[0]!.value = null;
        if (kind === "wrong-source") d.sourceId = "different-source";
      } });
      const result = await prepareFinancialDataCenterInputs(req, admin, trusted());
      expect(result.ready).toBe(false);
      expect(result.status).toBe(["missing", "partial"].includes(kind) ? "PARTIAL" : "NOT_COMPUTABLE");
    });
  });
  it.each(["currency", "period", "sector", "caller-override"] as const)("rejects submitted %s incompatible with published assumptions", async (kind) => {
    await isolated(async (_tx, admin) => {
      const { req } = await fixture(admin);
      if (kind === "currency") {
        req.basis.currency = "USD"; for (const a of req.assumptions) if ("currency" in a.unit) a.unit.currency = "USD";
      }
      if (kind === "period") { req.basis.t0.date = "2026-11-01"; req.basis.periods[0]!.startDate = "2026-11-01"; req.basis.periods[0]!.endDate = "2026-12-01"; }
      if (kind === "sector") req.scope.sector.code = "other";
      if (kind === "caller-override") req.assumptions[0]!.value = "999";
      const result = await prepareFinancialDataCenterInputs(req, admin, trusted());
      expect(result.ready).toBe(false);
      expect(result.reason).toBe(kind === "sector" ? "GEOGRAPHY_OR_SECTOR_MISMATCH" : kind === "caller-override" ? "PUBLISHED_MODEL_REQUEST_MISMATCH" : "PERIOD_CURRENCY_OR_TIMING_MISMATCH");
    });
  });
  it("retains restricted rights, attribution and exact record provenance without broadening export", async () => {
    await isolated(async (_tx, admin) => {
      const s = await source(admin, { licenseClass: "RESTRICTED", allowExport: false });
      const { req, item } = await fixture(admin, { source: s });
      const result = await prepareFinancialDataCenterInputs(req, admin, trusted());
      expect(result.ready).toBe(true); expect(result.inputs[0]!.licenseClass).toBe("RESTRICTED"); expect(result.rights.allowExport).toBe(false);
      expect(result.attribution[0]!.text).toBe("Synthetic financial evidence");
      expect(result.validated!.model.assumptions[0]!.evidence[0]!).toMatchObject({ versionId: item.version.id, checksum: item.version.checksum, sourceRecordId: "model-record" });
    });
  });
});
