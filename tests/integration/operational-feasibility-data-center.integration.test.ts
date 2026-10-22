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
import { bindOperationalDataset, OPERATIONAL_MODEL_TYPE_KEY } from "@/services/analysis-engines/operational-feasibility";
import { createOperationalDataCenterProvider, prepareOperationalDataCenterInputs } from "@/services/analysis-engines/operational-feasibility/adapters/data-center-provider";
import { operationalDataset, operationalReference } from "../unit/support/operational-data-fixtures";

const enabled = process.env.OPERATIONAL_DATABASE_TESTS === "1";
const rollback = new Error("ROLLBACK_OPERATIONAL_M2_SCRATCH_ONLY");
const trusted = () => ({ evaluatedAt: new Date(Math.max(Date.now(), Date.parse("2026-10-22T12:00:00.000Z"))).toISOString() });
async function isolated(run: (tx: DbExecutor, actor: DataCenterActor) => Promise<void>) {
  try {
    await (context.actual as typeof db).$transaction(async (tx) => {
      const identity = await tx.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
      if (!/^se_operational_m2_[a-f0-9]{12}$/.test(identity[0]?.name ?? "")) throw new Error("Operational M2 requires its own disposable migrated database");
      context.tx = tx;
      try {
        const user = await tx.user.create({ data: { email: `operational-m2-${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
        const actor: DataCenterActor = { id: user.id, kind: "HUMAN", systemRole: "ADMIN" };
        if (!await tx.dataCenterType.findUnique({ where: { key: OPERATIONAL_MODEL_TYPE_KEY } })) {
          await registerDataCenterType({ key: OPERATIONAL_MODEL_TYPE_KEY, label: "Synthetic operational model only", layer: "DATA", requiresIndependentReview: false }, actor);
        }
        await run(tx, actor); throw rollback;
      } finally { context.tx = null; }
    }, { timeout: 90_000, maxWait: 30_000 });
  } catch (error) { if (error !== rollback) throw error; }
}
const source = (actor: DataCenterActor, extra: Partial<Parameters<typeof createDataCenterSource>[0]> = {}) => createDataCenterSource({
  name: `Synthetic operational ${randomUUID()}`, kind: "OFFICIAL", scope: "PLATFORM", owner: "Synthetic owner",
  license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", ownership: "THIRD_PARTY", allowExport: false, freshnessDays: 365,
  usagePolicy: "Synthetic only; attribution required", attribution: "Synthetic operational evidence", attributionRequired: true, ...extra,
}, actor);
async function publish(itemId: string, actor: DataCenterActor) {
  await transitionDataCenterItem({ itemId, status: "IN_REVIEW", reason: "Synthetic submission" }, actor);
  await reviewDataCenterItem({ itemId, decision: "APPROVED", notes: "Synthetic operational plan only" }, actor);
  await transitionDataCenterItem({ itemId, status: "APPROVED", reason: "Synthetic approval" }, actor);
  await transitionDataCenterItem({ itemId, status: "PUBLISHED", reason: "Synthetic publication" }, actor);
}
async function fixture(actor: DataCenterActor, options: {
  source?: Awaited<ReturnType<typeof source>>;
  change?: (dataset: ReturnType<typeof operationalDataset>) => void;
  item?: Partial<Parameters<typeof createDataCenterItem>[0]>;
} = {}) {
  const s = options.source ?? await source(actor);
  const content = operationalDataset(); content.sourceId = s.id; options.change?.(content);
  const item = await createDataCenterItem({
    sourceId: s.id, title: "Synthetic operational M2 model", typeKey: OPERATIONAL_MODEL_TYPE_KEY, layer: "DATA",
    content: JSON.stringify(content), evidenceStatus: "VERIFIED", sourcePublishedAt: "2026-10-03T00:00:00.000Z",
    provenance: [{ kind: "DOCUMENT", reference: "fixture:operational-m2", label: "Synthetic operational plan evidence" }],
    coverage: { countryCodes: ["SA"], regionCodes: [] }, ...options.item,
  }, actor);
  await publish(item.id, actor);
  const reference = operationalReference(); reference.source.sourceId = s.id;
  reference.version.versionId = item.version.id; reference.version.checksum.value = item.version.checksum;
  const request = bindOperationalDataset(content, reference, trusted().evaluatedAt);
  return { s, item, request, content };
}
const user = async (tx: DbExecutor): Promise<DataCenterActor> => {
  const row = await tx.user.create({ data: { email: `operational-reader-${randomUUID()}@example.test`, status: "ACTIVE" } });
  return { id: row.id, kind: "HUMAN", systemRole: "USER" };
};
const counts = async (tx: DbExecutor) => ({
  sources: await tx.dataCenterSource.count(), types: await tx.dataCenterType.count(), items: await tx.dataCenterItem.count(),
  versions: await tx.dataCenterVersion.count(), audits: await tx.auditLog.count(), events: await tx.dataCenterEvent.count(),
  usages: await tx.dataCenterUsage.count(), runs: await tx.analysisEngineRun.count(), inputs: await tx.analysisEngineRunInput.count(),
});
describe.skipIf(!enabled)("Operational M2 governed reads on owned scratch PostgreSQL, no operational calculations", () => {
  afterAll(async () => { if (enabled) await (context.actual as typeof db).$disconnect(); });
  it("validates exact source/version/checksum, local provenance and rights without writes", async () => {
    await isolated(async (tx, admin) => {
      const { request, item } = await fixture(admin); const reader = await user(tx); const before = await counts(tx);
      const result = await prepareOperationalDataCenterInputs(request, reader, trusted());
      expect(result.status).toBe("AVAILABLE"); expect(result.ready).toBe(true);
      expect(result.validated!.model).toEqual(request.model);
      expect(result.inputs[0]!.checksum!.value).toBe(item.version.checksum);
      expect(result.validated!.model.values[0]!.evidence[0]).toMatchObject({ versionId: item.version.id, checksum: item.version.checksum, sourceRecordId: "model-record" });
      expect(result.rights.allowExport).toBe(false); expect(result.attribution[0]!.required).toBe(true);
      expect(result.validated!.contentHash).toMatch(/^[a-f0-9]{64}$/); expect(result).not.toHaveProperty("metrics");
      expect(result.realDataAcceptance).toBe("BLOCKED / NOT VERIFIED"); expect(await counts(tx)).toEqual(before);
    });
  });
  it("rejects caller checksum mismatch before any content read", async () => {
    await isolated(async (_tx, admin) => {
      const { request } = await fixture(admin); request.source.checksum = "b".repeat(64);
      const result = await prepareOperationalDataCenterInputs(request, admin, trusted());
      expect(result.reason).toBe("CHECKSUM_MISMATCH"); expect(result.work.reads).toBe(0);
    });
  });
  it("detects immutable stored-byte tampering using the existing Data Center checksum", async () => {
    await isolated(async (tx, admin) => {
      const { request, item } = await fixture(admin);
      await tx.$executeRawUnsafe('ALTER TABLE "DataCenterVersion" DISABLE TRIGGER "DataCenterVersion_immutable"');
      try { await tx.dataCenterVersion.update({ where: { id: item.version.id }, data: { content: "tampered" } }); }
      finally { await tx.$executeRawUnsafe('ALTER TABLE "DataCenterVersion" ENABLE TRIGGER "DataCenterVersion_immutable"'); }
      const result = await prepareOperationalDataCenterInputs(request, admin, trusted());
      expect(result.reason).toBe("CHECKSUM_MISMATCH"); expect(result.validated).toBeNull();
    });
  });
  it("never falls forward to latest or backwards to an arbitrary old version", async () => {
    await isolated(async (_tx, admin) => {
      const { request, item, content } = await fixture(admin);
      const next = await createDataCenterVersion({ itemId: item.id, title: "Synthetic next operational model", reason: "Synthetic version policy",
        content: JSON.stringify(content), evidenceStatus: "VERIFIED", sourcePublishedAt: "2026-10-03T00:00:00.000Z",
        provenance: [{ kind: "DOCUMENT", reference: "fixture:operational-next", label: "Synthetic next version" }], coverage: { countryCodes: ["SA"], regionCodes: [] } }, admin);
      await publish(item.id, admin);
      expect((await prepareOperationalDataCenterInputs(request, admin, trusted())).status).toBe("NOT_AVAILABLE");
      request.source.versionId = "missing-operational-version"; request.source.checksum = next.checksum;
      const result = await prepareOperationalDataCenterInputs(request, admin, trusted());
      expect(result.status).toBe("NOT_AVAILABLE"); expect(result.work.reads).toBe(0);
    });
  });
  it("keeps private and absent exact versions indistinguishable for discovery and read", async () => {
    await isolated(async (tx, admin) => {
      const owner = await user(tx); const s = await source(owner, { scope: "PRIVATE" });
      const { item } = await fixture(admin, { source: s }); const reader = await user(tx);
      const port = createOperationalDataCenterProvider(reader, trusted());
      for (const versionId of [item.version.id, "missing-operational-version"]) {
        expect(await port.read({ versionId, expectedChecksum: item.version.checksum })).toEqual({ status: "NOT_AVAILABLE" });
        const discovery = await port.discover({ versionIds: [versionId] });
        expect(discovery.status).toBe("NOT_AVAILABLE"); expect(discovery.candidates).toEqual([]);
      }
    });
  });
  it.each(["retrieval", "archive"] as const)("rechecks current %s even with a previously constructed provider", async (kind) => {
    await isolated(async (tx, admin) => {
      const { s, item } = await fixture(admin); const reader = await user(tx);
      const port = createOperationalDataCenterProvider(reader, trusted()); const pin = { versionId: item.version.id, expectedChecksum: item.version.checksum };
      expect(await port.read(pin)).toMatchObject({ status: "AVAILABLE" });
      if (kind === "retrieval") await tx.dataCenterSource.update({ where: { id: s.id }, data: { allowRetrieval: false } });
      else await transitionDataCenterItem({ itemId: item.id, status: "ARCHIVED", reason: "Synthetic archive" }, admin);
      expect(await port.read(pin)).toEqual({ status: "NOT_AVAILABLE" });
    });
  });
  it("enforces required permission before exposing metadata or bytes", async () => {
    await isolated(async (tx, admin) => {
      const { item } = await fixture(admin, { item: { requiredPermission: "data_center:manage" } });
      const port = createOperationalDataCenterProvider(await user(tx), trusted());
      expect(await port.read({ versionId: item.version.id, expectedChecksum: item.version.checksum })).toEqual({ status: "NOT_AVAILABLE" });
      expect((await port.discover({ versionIds: [item.version.id] })).candidates).toEqual([]);
    });
  });
  it("requires matching trusted specialty and mission context", async () => {
    await isolated(async (tx, admin) => {
      const { item } = await fixture(admin, { item: { specialties: ["operational"], missionContexts: ["study"] } });
      const reader = await user(tx); const pin = { versionId: item.version.id, expectedChecksum: item.version.checksum };
      expect(await createOperationalDataCenterProvider(reader, trusted()).read(pin)).toEqual({ status: "NOT_AVAILABLE" });
      expect(await createOperationalDataCenterProvider(reader, { ...trusted(), specialty: "operational", missionContext: "study" }).read(pin)).toMatchObject({ status: "AVAILABLE" });
    });
  });
  it("enforces trusted org scope and current membership revocation", async () => {
    await isolated(async (tx, admin) => {
      const { request, s, item } = await fixture(admin); const reader = await user(tx);
      const org = await tx.organization.create({ data: { name: "Synthetic operations", slug: `operational-${randomUUID()}` } });
      const member = await tx.organizationMember.create({ data: { userId: reader.id, organizationId: org.id, isOwner: true, status: "ACTIVE" } });
      await tx.dataCenterSource.update({ where: { id: s.id }, data: { scope: "ORGANIZATION", organizationId: org.id } });
      expect((await prepareOperationalDataCenterInputs(request, reader, { ...trusted(), organizationId: org.id })).ready).toBe(true);
      const pin = { versionId: item.version.id, expectedChecksum: item.version.checksum };
      expect(await createOperationalDataCenterProvider(admin, { ...trusted(), organizationId: "wrong-org" }).read(pin)).toEqual({ status: "NOT_AVAILABLE" });
      await tx.organizationMember.update({ where: { id: member.id }, data: { status: "SUSPENDED" } });
      expect(await createOperationalDataCenterProvider(reader, { ...trusted(), organizationId: org.id }).read(pin)).toEqual({ status: "NOT_AVAILABLE" });
    });
  });
  it("enforces live explicit robot grants and revocation", async () => {
    await isolated(async (tx, admin) => {
      const { s, item } = await fixture(admin); const principal = await user(tx);
      const robot = await tx.robot.create({ data: { slug: `operational-${randomUUID()}`, name: "Synthetic operational reader" } });
      const mission = await tx.mission.create({ data: { name: "Synthetic operational mission", assignedRobots: { connect: { id: robot.id } } } });
      const actor: DataCenterActor = { id: principal.id, kind: "AI", systemRole: "USER", robotId: robot.id, roleKey: "analyst", specialty: "operational", missionId: mission.id };
      const port = createOperationalDataCenterProvider(actor, trusted()); const pin = { versionId: item.version.id, expectedChecksum: item.version.checksum };
      await expect(port.read(pin)).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED" });
      const grant = await grantDataCenterRobotAccess({ robotId: robot.id, sourceId: s.id, principalId: principal.id, roleKey: "analyst",
        specialty: "operational", missionId: mission.id, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), reason: "Synthetic explicit access" }, admin);
      expect(await port.read(pin)).toMatchObject({ status: "AVAILABLE" });
      await revokeDataCenterRobotAccess({ grantId: grant.id, reason: "Synthetic revoke" }, admin);
      await expect(port.read(pin)).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED" });
    });
  });
  it.each(["unreviewed", "partial", "missing", "site", "geography", "source"] as const)("does not trust publication alone for %s", async (kind) => {
    await isolated(async (_tx, admin) => {
      const { request } = await fixture(admin, { change: (d) => {
        if (kind === "unreviewed") d.approval.status = "UNREVIEWED";
        if (kind === "partial") { d.coverage.status = "PARTIAL"; d.coverage.completeness = "SAMPLE"; }
        if (kind === "missing") d.model.values[0]!.value = null;
        if (kind === "site") d.coverage.siteIds = ["other-site"];
        if (kind === "source") d.sourceId = "other-source";
      }, item: kind === "geography" ? { coverage: { countryCodes: ["AE"], regionCodes: [] } } : undefined });
      const result = await prepareOperationalDataCenterInputs(request, admin, trusted());
      expect(result.ready).toBe(false);
      expect(result.status).toBe(["partial", "missing"].includes(kind) ? "PARTIAL" : ["site", "geography"].includes(kind) ? "NO_COVERAGE" : "NOT_COMPUTABLE");
    });
  });
  it.each(["period", "unit", "methodology", "sector", "value"] as const)("rejects caller %s substitution", async (kind) => {
    await isolated(async (_tx, admin) => {
      const { request } = await fixture(admin);
      if (kind === "period") { request.model.periods[0]!.startDate = "2026-11-01"; request.model.periods[0]!.endDate = "2026-12-01"; }
      if (kind === "unit") request.model.values.find((v) => v.id === "time")!.unit = { kind: "RESOURCE_TIME", poolId: "pool-1", basis: "HOUR" };
      if (kind === "methodology") request.model.values[0]!.method.version = "other-method";
      if (kind === "sector") request.model.scope.sector.code = "other-sector";
      if (kind === "value") request.model.values[0]!.value = "999";
      const result = await prepareOperationalDataCenterInputs(request, admin, trusted());
      expect(result.ready).toBe(false); expect(result.validated).toBeNull();
    });
  });
  it("retains restrictive ownership/license/usage/attribution without allowing export", async () => {
    await isolated(async (_tx, admin) => {
      const s = await source(admin, { licenseClass: "RESTRICTED", allowExport: false });
      const { request } = await fixture(admin, { source: s });
      const result = await prepareOperationalDataCenterInputs(request, admin, trusted());
      expect(result.ready).toBe(true); expect(result.inputs[0]!.licenseClass).toBe("RESTRICTED");
      expect(result.rights.allowExport).toBe(false); expect(result.attribution[0]!.text).toBe("Synthetic operational evidence");
    });
  });
});
