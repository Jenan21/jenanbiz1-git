import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { DbExecutor } from "@/lib/db";
const context = vi.hoisted(() => ({ tx: null as unknown, actual: null as unknown }));
vi.mock("@/lib/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db")>(); context.actual = original.db;
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
import type { DataCenterActor } from "@/services/data-center/contracts";
import { createDataCenterItem, createDataCenterSource, createDataCenterVersion, registerDataCenterType, reviewDataCenterItem, transitionDataCenterItem } from "@/services/data-center/service";
import { grantDataCenterRobotAccess, revokeDataCenterRobotAccess } from "@/services/data-center/robot-grants";
import { bindFinancialDataset, FINANCIAL_MODEL_TYPE_KEY, FinancialHistoryMismatch, FinancialHistoryUnavailable } from "@/services/analysis-engines/financial-feasibility";
import { runFinancialAnalysisPersisted } from "@/services/analysis-engines/financial-feasibility/adapters/run-service";
import { readFinancialRun } from "@/services/analysis-engines/financial-feasibility/adapters/run-persistence";
import { replayFinancialAnalysis } from "@/services/analysis-engines/financial-feasibility/adapters/replay-service";
import { financialDataset, financialReference } from "../unit/support/financial-data-fixtures";

const enabled = process.env.DATA_CENTER_DATABASE_TESTS === "1";
const rollback = new Error("ROLLBACK_FINANCIAL_M4_SYNTHETIC_ONLY");
const actual = () => context.actual as typeof db;
function execution() {
  const evaluatedAt = new Date(Math.max(Date.now(), Date.parse("2026-10-22T12:00:00.000Z"))).toISOString();
  return {
    runId: `financial-m4-${randomUUID()}`, evaluatedAt, createdAt: evaluatedAt, environment: "test" as const,
    timing: { startedAt: evaluatedAt, finishedAt: evaluatedAt, durationMs: 0 },
  };
}
async function assertOwned(tx: DbExecutor) {
  const rows = await tx.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (!/^se_financial_m[24]_[a-f0-9]{12}$/.test(rows[0]?.name ?? "")) throw new Error("Financial M4 requires its own disposable migrated database");
}
async function setup(tx: DbExecutor) {
  const row = await tx.user.create({ data: { email: `financial-m4-admin-${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
  const actor: DataCenterActor = { id: row.id, kind: "HUMAN", systemRole: "ADMIN" };
  if (!await tx.dataCenterType.findUnique({ where: { key: FINANCIAL_MODEL_TYPE_KEY } })) {
    await registerDataCenterType({ key: FINANCIAL_MODEL_TYPE_KEY, label: "Synthetic financial M4 only", layer: "DATA", requiresIndependentReview: false }, actor);
  }
  return actor;
}
async function isolated(run: (tx: DbExecutor, actor: DataCenterActor) => Promise<void>) {
  try {
    await actual().$transaction(async (tx) => {
      await assertOwned(tx); context.tx = tx;
      try { await run(tx, await setup(tx)); throw rollback; }
      finally { context.tx = null; }
    }, { timeout: 90_000, maxWait: 30_000 });
  } catch (error) { if (error !== rollback) throw error; }
}
async function publish(itemId: string, actor: DataCenterActor) {
  await transitionDataCenterItem({ itemId, status: "IN_REVIEW", reason: "Synthetic financial submission" }, actor);
  await reviewDataCenterItem({ itemId, decision: "APPROVED", notes: "Synthetic financial M4, not real data" }, actor);
  await transitionDataCenterItem({ itemId, status: "APPROVED", reason: "Synthetic approval" }, actor);
  await transitionDataCenterItem({ itemId, status: "PUBLISHED", reason: "Synthetic publication" }, actor);
}
async function fixture(actor: DataCenterActor, itemOptions: Partial<Parameters<typeof createDataCenterItem>[0]> = {}) {
  const source = await createDataCenterSource({
    name: `Synthetic financial M4 ${randomUUID()}`, kind: "OFFICIAL", scope: "PLATFORM", owner: "Synthetic owner",
    license: "ODbL-1.0", licenseClass: "RESTRICTED", ownership: "THIRD_PARTY", allowExport: false, freshnessDays: 365,
    usagePolicy: "Synthetic financial history only", attribution: "Synthetic financial evidence", attributionRequired: true,
  }, actor);
  const dataset = financialDataset(); dataset.sourceId = source.id;
  const item = await createDataCenterItem({
    sourceId: source.id, title: "Synthetic financial M4 model", typeKey: FINANCIAL_MODEL_TYPE_KEY, layer: "DATA",
    content: JSON.stringify(dataset), evidenceStatus: "VERIFIED", sourcePublishedAt: "2026-10-02T00:00:00.000Z",
    provenance: [{ kind: "DOCUMENT", reference: "fixture:financial-m4", label: "Synthetic financial M4" }],
    coverage: { countryCodes: ["SA"], regionCodes: [] }, ...itemOptions,
  }, actor);
  await publish(item.id, actor);
  const reference = financialReference();
  reference.source.sourceId = source.id; reference.version.versionId = item.version.id; reference.version.checksum.value = item.version.checksum;
  return { source, dataset, item, request: bindFinancialDataset(dataset, reference, execution().evaluatedAt) };
}
async function reader(tx: DbExecutor): Promise<DataCenterActor> {
  const row = await tx.user.create({ data: { email: `financial-reader-${randomUUID()}@example.test`, status: "ACTIVE" } });
  return { id: row.id, kind: "HUMAN", systemRole: "USER" };
}
const counts = async (tx: DbExecutor) => ({
  runs: await tx.analysisEngineRun.count(), inputs: await tx.analysisEngineRunInput.count(),
  sources: await tx.dataCenterSource.count(), items: await tx.dataCenterItem.count(), versions: await tx.dataCenterVersion.count(),
  usages: await tx.dataCenterUsage.count(), audits: await tx.auditLog.count(), events: await tx.dataCenterEvent.count(),
});

describe.skipIf(!enabled)("Financial M4 atomic persistence and exact replay on disposable PostgreSQL", () => {
  afterAll(async () => { if (enabled) await actual().$disconnect(); });
  it("commits a durable Run/Input/Output and replays it in a new transaction", async () => {
    const f = await actual().$transaction(async (tx) => {
      await assertOwned(tx); context.tx = tx;
      try { const actor = await setup(tx); return { actor, ...await fixture(actor) }; }
      finally { context.tx = null; }
    }, { timeout: 90_000 });
    const result = await runFinancialAnalysisPersisted(f.request, f.actor, execution());
    const row = await actual().analysisEngineRun.findUniqueOrThrow({ where: { runId: result.runId }, include: { inputs: true } });
    expect(row.result).toEqual(result); expect(row.inputs).toHaveLength(1);
    expect(row.inputs[0]).toMatchObject({
      dataCenterVersionId: f.item.version.id, dataCenterSourceId: f.source.id, dataCenterTypeKey: FINANCIAL_MODEL_TYPE_KEY,
      checksum: f.item.version.checksum,
    });
    expect(row.inputs[0]!.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.requestHash).toBe(result.determinism.requestHash);
    expect(row.inputsHash).toBe(result.determinism.inputsHash); expect(row.outputHash).toBe(result.determinism.outputHash);
    expect(row.inputs[0]!.provenance).toMatchObject({ assumptions: result.request.normalized.assumptions });
    const before = await counts(actual());
    expect(await replayFinancialAnalysis(result.runId, f.actor)).toEqual(result);
    expect((await readFinancialRun(result.runId, f.actor)).runtime.policies.rounding).toContain("HALF_EVEN");
    expect(await counts(actual())).toEqual(before);
  });
  it("rolls back a nested-input failure without orphans, then retries the same run ID once successfully", async () => {
    const f = await actual().$transaction(async (tx) => {
      await assertOwned(tx); context.tx = tx;
      try { const actor = await setup(tx); return { actor, ...await fixture(actor) }; }
      finally { context.tx = null; }
    }, { timeout: 90_000 });
    const ctx = execution(); const before = await counts(actual());
    await actual().$executeRawUnsafe(`CREATE FUNCTION financial_m4_reject_input() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected Financial M4 nested input failure'; END; $$`);
    await actual().$executeRawUnsafe(`CREATE TRIGGER financial_m4_failure BEFORE INSERT ON "AnalysisEngineRunInput" FOR EACH ROW EXECUTE FUNCTION financial_m4_reject_input()`);
    try {
      await expect(runFinancialAnalysisPersisted(f.request, f.actor, ctx)).rejects.toThrow(/Injected Financial M4/);
      expect(await counts(actual())).toEqual(before);
      expect(await actual().analysisEngineRun.findUnique({ where: { runId: ctx.runId } })).toBeNull();
    } finally {
      await actual().$executeRawUnsafe(`DROP TRIGGER financial_m4_failure ON "AnalysisEngineRunInput"`);
      await actual().$executeRawUnsafe(`DROP FUNCTION financial_m4_reject_input()`);
    }
    const result = await runFinancialAnalysisPersisted(f.request, f.actor, ctx);
    expect(await replayFinancialAnalysis(result.runId, f.actor)).toEqual(result);
    const after = await counts(actual());
    expect(after.runs).toBe(before.runs + 1); expect(after.inputs).toBe(before.inputs + 1);
    await expect(runFinancialAnalysisPersisted(f.request, f.actor, ctx)).rejects.toThrow();
    expect(await counts(actual())).toEqual(after);
  });
  it("replays original assumptions and version after a different price/revenue model is published", async () => {
    await isolated(async (tx, actor) => {
      const f = await fixture(actor); const result = await runFinancialAnalysisPersisted(f.request, actor, execution());
      f.dataset.model.assumptions.find((entry) => entry.id === "net-sales")!.value = "99999";
      const next = await createDataCenterVersion({
        itemId: f.item.id, title: "Synthetic newer financial assumptions", content: JSON.stringify(f.dataset),
        evidenceStatus: "VERIFIED", reason: "Synthetic version replacement",
        provenance: [{ kind: "DOCUMENT", reference: "fixture:new-financial", label: "Synthetic newer model" }],
      }, actor);
      await publish(f.item.id, actor);
      await tx.dataCenterSource.update({ where: { id: f.source.id }, data: { freshnessDays: 1 } });
      const before = await counts(tx);
      expect(await replayFinancialAnalysis(result.runId, actor)).toEqual(result);
      const stored = await readFinancialRun(result.runId, actor);
      expect(stored.record.inputs[0]!.refId).toBe(f.item.version.id); expect(stored.record.inputs[0]!.refId).not.toBe(next.id);
      expect(stored.result.metrics.find((metric) => metric.key === "revenue.p1")!.value).toBe("120.00");
      expect(await counts(tx)).toEqual(before);
    });
  });
  it("filters foreign and missing history identically, including replay", async () => {
    await isolated(async (tx, admin) => {
      const f = await fixture(admin); const owner = await reader(tx); const foreign = await reader(tx);
      const result = await runFinancialAnalysisPersisted(f.request, owner, execution());
      expect(await replayFinancialAnalysis(result.runId, owner)).toEqual(result);
      expect(await replayFinancialAnalysis(result.runId, admin)).toEqual(result);
      for (const id of [result.runId, "missing-financial-run"]) {
        await expect(readFinancialRun(id, foreign)).rejects.toEqual(new FinancialHistoryUnavailable());
        await expect(replayFinancialAnalysis(id, foreign)).rejects.toEqual(new FinancialHistoryUnavailable());
      }
    });
  });
  it.each(["retrieval", "license", "usage", "export", "attribution", "private"] as const)("rejects replay after current %s rights change", async (variant) => {
    await isolated(async (tx, admin) => {
      const f = await fixture(admin); const owner = await reader(tx);
      const result = await runFinancialAnalysisPersisted(f.request, owner, execution());
      const data = variant === "retrieval" ? { allowRetrieval: false } : variant === "license" ? { license: "Changed license" }
        : variant === "usage" ? { usagePolicy: "Changed usage" } : variant === "export" ? { licenseClass: "OPEN_LICENSE" as const, allowExport: true }
        : variant === "attribution" ? { attribution: "Changed attribution" } : { scope: "PRIVATE" as const };
      await tx.dataCenterSource.update({ where: { id: f.source.id }, data });
      await expect(readFinancialRun(result.runId, owner)).rejects.toBeInstanceOf(FinancialHistoryUnavailable);
      await expect(replayFinancialAnalysis(result.runId, owner)).rejects.toBeInstanceOf(FinancialHistoryUnavailable);
    });
  });
  it("rejects archived historical inputs rather than returning cached financial results", async () => {
    await isolated(async (_tx, actor) => {
      const f = await fixture(actor); const result = await runFinancialAnalysisPersisted(f.request, actor, execution());
      await transitionDataCenterItem({ itemId: f.item.id, status: "ARCHIVED", reason: "Synthetic financial archive" }, actor);
      await expect(replayFinancialAnalysis(result.runId, actor)).rejects.toBeInstanceOf(FinancialHistoryUnavailable);
    });
  });
  it("checks current authorization before recomputing even corrupted cached calculations", async () => {
    await isolated(async (tx, admin) => {
      const f = await fixture(admin); const owner = await reader(tx);
      const result = await runFinancialAnalysisPersisted(f.request, owner, execution());
      await tx.$executeRawUnsafe(`ALTER TABLE "AnalysisEngineRun" DISABLE TRIGGER "AnalysisEngineRun_append_only"`);
      await tx.$executeRaw`UPDATE "AnalysisEngineRun" SET "result" = '{}'::jsonb WHERE "runId" = ${result.runId}`;
      await tx.$executeRawUnsafe(`ALTER TABLE "AnalysisEngineRun" ENABLE TRIGGER "AnalysisEngineRun_append_only"`);
      await tx.dataCenterSource.update({ where: { id: f.source.id }, data: { allowRetrieval: false } });
      await expect(replayFinancialAnalysis(result.runId, owner)).rejects.toEqual(new FinancialHistoryUnavailable());
    });
  });
  it("retains trusted specialty/mission context without allowing caller model access fields", async () => {
    await isolated(async (_tx, actor) => {
      const f = await fixture(actor, { specialties: ["financial"], missionContexts: ["study"] });
      await expect(runFinancialAnalysisPersisted(f.request, actor, execution())).rejects.toBeInstanceOf(FinancialHistoryUnavailable);
      const result = await runFinancialAnalysisPersisted(f.request, actor, execution(), { specialty: "financial", missionContext: "study" });
      expect((await readFinancialRun(result.runId, actor)).runtime.replayAuthorizationContext).toEqual({ specialty: "financial", missionContext: "study" });
      expect(await replayFinancialAnalysis(result.runId, actor)).toEqual(result);
    });
  });
  it("reauthorizes current organization membership and trusted organization scope", async () => {
    await isolated(async (tx, admin) => {
      const f = await fixture(admin); const owner = await reader(tx);
      const org = await tx.organization.create({ data: { name: "Synthetic financial M4 org", slug: `financial-m4-${randomUUID()}` } });
      const membership = await tx.organizationMember.create({ data: { userId: owner.id, organizationId: org.id, isOwner: true, status: "ACTIVE" } });
      await tx.dataCenterSource.update({ where: { id: f.source.id }, data: { scope: "ORGANIZATION", organizationId: org.id } });
      await expect(runFinancialAnalysisPersisted(f.request, admin, execution(), { organizationId: "another-org" })).rejects.toBeInstanceOf(FinancialHistoryUnavailable);
      const result = await runFinancialAnalysisPersisted(f.request, owner, execution(), { organizationId: org.id });
      expect(await replayFinancialAnalysis(result.runId, owner)).toEqual(result);
      await tx.organizationMember.update({ where: { id: membership.id }, data: { status: "SUSPENDED" } });
      await expect(replayFinancialAnalysis(result.runId, owner)).rejects.toBeInstanceOf(FinancialHistoryUnavailable);
    });
  });
  it("reauthorizes current robot grants before replay", async () => {
    await isolated(async (tx, admin) => {
      const f = await fixture(admin); const principal = await reader(tx);
      const robot = await tx.robot.create({ data: { slug: `financial-m4-${randomUUID()}`, name: "Synthetic financial reader" } });
      const mission = await tx.mission.create({ data: { name: "Synthetic financial study", assignedRobots: { connect: { id: robot.id } } } });
      const actor: DataCenterActor = { id: principal.id, kind: "AI", systemRole: "USER", robotId: robot.id, roleKey: "analyst", specialty: "financial", missionId: mission.id };
      const grant = await grantDataCenterRobotAccess({
        robotId: robot.id, sourceId: f.source.id, principalId: principal.id, roleKey: "analyst", specialty: "financial", missionId: mission.id,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(), reason: "Synthetic Financial M4 grant",
      }, admin);
      const result = await runFinancialAnalysisPersisted(f.request, actor, execution());
      expect(await replayFinancialAnalysis(result.runId, actor)).toEqual(result);
      await revokeDataCenterRobotAccess({ grantId: grant.id, reason: "Synthetic Financial M4 revoke" }, admin);
      await expect(replayFinancialAnalysis(result.runId, actor)).rejects.toBeInstanceOf(FinancialHistoryUnavailable);
    });
  });
  it("reauthorizes a required version permission even while organization read access remains active", async () => {
    await isolated(async (tx, admin) => {
      const f = await fixture(admin, { requiredPermission: "finance.read" }); const owner = await reader(tx);
      const org = await tx.organization.create({ data: { name: "Synthetic financial role", slug: `financial-role-${randomUUID()}` } });
      const read = await tx.permission.upsert({ where: { key: "data-center.read" }, create: { key: "data-center.read" }, update: {} });
      const financial = await tx.permission.upsert({ where: { key: "finance.read" }, create: { key: "finance.read" }, update: {} });
      const role = await tx.role.create({ data: {
        organizationId: org.id, key: `financial-${randomUUID()}`, name: "Synthetic financial role",
        permissions: { create: [{ permissionId: read.id }, { permissionId: financial.id }] },
      } });
      await tx.organizationMember.create({ data: { userId: owner.id, organizationId: org.id, status: "ACTIVE", roleId: role.id } });
      await tx.dataCenterSource.update({ where: { id: f.source.id }, data: { scope: "ORGANIZATION", organizationId: org.id } });
      const result = await runFinancialAnalysisPersisted(f.request, owner, execution(), { organizationId: org.id });
      expect(await replayFinancialAnalysis(result.runId, owner)).toEqual(result);
      await tx.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: financial.id } } });
      await expect(replayFinancialAnalysis(result.runId, owner)).rejects.toBeInstanceOf(FinancialHistoryUnavailable);
    });
  });
  it.each(["run-update", "run-delete", "input-update", "input-delete"] as const)("enforces append-only %s at the database boundary", async (variant) => {
    await isolated(async (tx, actor) => {
      const f = await fixture(actor); const result = await runFinancialAnalysisPersisted(f.request, actor, execution());
      await tx.$executeRawUnsafe("SAVEPOINT financial_m4_append_only");
      if (variant === "run-update") await expect(tx.analysisEngineRun.update({ where: { runId: result.runId }, data: { subject: "tamper" } })).rejects.toThrow(/append-only/);
      if (variant === "run-delete") await expect(tx.analysisEngineRun.delete({ where: { runId: result.runId } })).rejects.toThrow(/append-only/);
      if (variant === "input-update") await expect(tx.analysisEngineRunInput.updateMany({ where: { runId: result.runId }, data: { contentHash: "0".repeat(64) } })).rejects.toThrow(/append-only/);
      if (variant === "input-delete") await expect(tx.analysisEngineRunInput.deleteMany({ where: { runId: result.runId } })).rejects.toThrow(/append-only/);
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT financial_m4_append_only");
      expect(await replayFinancialAnalysis(result.runId, actor)).toEqual(result);
    });
  });
  it.each(["result", "requestHash", "inputHash", "provenance", "source-bytes", "missing-version"] as const)("detects %s corruption and never falls back", async (variant) => {
    await isolated(async (tx, actor) => {
      const f = await fixture(actor); const result = await runFinancialAnalysisPersisted(f.request, actor, execution());
      if (variant === "result" || variant === "requestHash") {
        await tx.$executeRawUnsafe(`ALTER TABLE "AnalysisEngineRun" DISABLE TRIGGER "AnalysisEngineRun_append_only"`);
        if (variant === "result") await tx.$executeRaw`UPDATE "AnalysisEngineRun" SET "result" = jsonb_set("result", '{metrics,0,value}', '"99999.00"') WHERE "runId" = ${result.runId}`;
        else await tx.$executeRaw`UPDATE "AnalysisEngineRun" SET "requestHash" = ${"0".repeat(64)} WHERE "runId" = ${result.runId}`;
        await tx.$executeRawUnsafe(`ALTER TABLE "AnalysisEngineRun" ENABLE TRIGGER "AnalysisEngineRun_append_only"`);
      } else if (variant === "inputHash" || variant === "provenance") {
        await tx.$executeRawUnsafe(`ALTER TABLE "AnalysisEngineRunInput" DISABLE TRIGGER "AnalysisEngineRunInput_append_only"`);
        if (variant === "inputHash") await tx.$executeRaw`UPDATE "AnalysisEngineRunInput" SET "contentHash" = ${"0".repeat(64)} WHERE "runId" = ${result.runId}`;
        else await tx.$executeRaw`UPDATE "AnalysisEngineRunInput" SET "provenance" = '{}'::jsonb WHERE "runId" = ${result.runId}`;
        await tx.$executeRawUnsafe(`ALTER TABLE "AnalysisEngineRunInput" ENABLE TRIGGER "AnalysisEngineRunInput_append_only"`);
      } else {
        if (variant === "missing-version") {
          await createDataCenterVersion({
            itemId: f.item.id, title: "Synthetic replacement, never a replay fallback", content: JSON.stringify(f.dataset),
            evidenceStatus: "VERIFIED", reason: "Synthetic missing historical version",
            provenance: [{ kind: "DOCUMENT", reference: "fixture:financial-m4-missing", label: "Synthetic replacement" }],
          }, actor);
          await publish(f.item.id, actor);
        }
        await tx.$executeRawUnsafe(`ALTER TABLE "DataCenterVersion" DISABLE TRIGGER "DataCenterVersion_immutable"`);
        if (variant === "source-bytes") await tx.$executeRaw`UPDATE "DataCenterVersion" SET "content" = '{}' WHERE "id" = ${f.item.version.id}`;
        else {
          await tx.$executeRawUnsafe(`ALTER TABLE "DataCenterReview" DISABLE TRIGGER "DataCenterReview_immutable"`);
          await tx.$executeRaw`DELETE FROM "DataCenterReview" WHERE "versionId" = ${f.item.version.id}`;
          await tx.$executeRawUnsafe(`ALTER TABLE "DataCenterReview" ENABLE TRIGGER "DataCenterReview_immutable"`);
          await tx.$executeRawUnsafe(`ALTER TABLE "DataCenterEvidenceLink" DISABLE TRIGGER "DataCenterEvidenceLink_immutable"`);
          await tx.$executeRaw`DELETE FROM "DataCenterEvidenceLink" WHERE "versionId" = ${f.item.version.id}`;
          await tx.$executeRawUnsafe(`ALTER TABLE "DataCenterEvidenceLink" ENABLE TRIGGER "DataCenterEvidenceLink_immutable"`);
          await tx.$executeRaw`DELETE FROM "DataCenterVersion" WHERE "id" = ${f.item.version.id}`;
          await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
        }
        await tx.$executeRawUnsafe(`ALTER TABLE "DataCenterVersion" ENABLE TRIGGER "DataCenterVersion_immutable"`);
      }
      if (variant === "source-bytes") await expect(replayFinancialAnalysis(result.runId, actor)).rejects.toBeInstanceOf(FinancialHistoryMismatch);
      else if (variant === "missing-version") await expect(replayFinancialAnalysis(result.runId, actor)).rejects.toBeInstanceOf(FinancialHistoryUnavailable);
      else await expect(replayFinancialAnalysis(result.runId, actor)).rejects.toThrow();
    });
  });
  it("does not persist rejected caller assumptions or unavailable exact models", async () => {
    await isolated(async (tx, actor) => {
      const f = await fixture(actor); const before = await counts(tx);
      f.request.assumptions.find((entry) => entry.id === "net-sales")!.value = "99999";
      await expect(runFinancialAnalysisPersisted(f.request, actor, execution())).rejects.toThrow(/PUBLISHED_MODEL_REQUEST_MISMATCH/);
      expect(await counts(tx)).toEqual(before);
    });
  });
});
