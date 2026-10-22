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
import { analyzeOperationalData, bindOperationalDataset, buildOperationalRunRecord, captureOperationalReads, OPERATIONAL_MODEL_TYPE_KEY, OperationalHistoryMismatch, OperationalHistoryUnavailable } from "@/services/analysis-engines/operational-feasibility";
import { createOperationalDataCenterProvider } from "@/services/analysis-engines/operational-feasibility/adapters/data-center-provider";
import { runOperationalAnalysisPersisted } from "@/services/analysis-engines/operational-feasibility/adapters/run-service";
import { persistOperationalRun, readOperationalRun } from "@/services/analysis-engines/operational-feasibility/adapters/run-persistence";
import { replayOperationalAnalysis } from "@/services/analysis-engines/operational-feasibility/adapters/replay-service";
import { operationalReference } from "../unit/support/operational-data-fixtures";
import { operationalCalculationDataset } from "../unit/support/operational-calculation-fixtures";

const enabled = process.env.OPERATIONAL_HISTORY_DATABASE_TESTS === "1";
const rollback = new Error("ROLLBACK_OPERATIONAL_M4_SCRATCH_ONLY");
const actual = () => context.actual as typeof db;
function execution() {
  const evaluatedAt = new Date(Math.max(Date.now(), Date.parse("2026-10-23T00:00:00.000Z"))).toISOString();
  return { runId: `operational-m4-${randomUUID()}`, evaluatedAt, createdAt: evaluatedAt, environment: "test" as const,
    timing: { startedAt: evaluatedAt, finishedAt: evaluatedAt, durationMs: 0 } };
}
async function assertOwned(tx: DbExecutor) {
  const rows = await tx.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (!/^se_operational_m4_[a-f0-9]{12}$/.test(rows[0]?.name ?? "")) throw new Error("Operational M4 requires its own disposable migrated database");
}
async function setup(tx: DbExecutor) {
  const row = await tx.user.create({ data: { email: `operational-m4-admin-${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
  const actor: DataCenterActor = { id: row.id, kind: "HUMAN", systemRole: "ADMIN" };
  if (!await tx.dataCenterType.findUnique({ where: { key: OPERATIONAL_MODEL_TYPE_KEY } })) {
    await registerDataCenterType({ key: OPERATIONAL_MODEL_TYPE_KEY, label: "Synthetic Operational M4", layer: "DATA", requiresIndependentReview: false }, actor);
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
  await transitionDataCenterItem({ itemId, status: "IN_REVIEW", reason: "Synthetic Operational submission" }, actor);
  await reviewDataCenterItem({ itemId, decision: "APPROVED", notes: "Synthetic Operational M4 only" }, actor);
  await transitionDataCenterItem({ itemId, status: "APPROVED", reason: "Synthetic approval" }, actor);
  await transitionDataCenterItem({ itemId, status: "PUBLISHED", reason: "Synthetic publication" }, actor);
}
async function fixture(actor: DataCenterActor, itemOptions: Partial<Parameters<typeof createDataCenterItem>[0]> = {}) {
  const source = await createDataCenterSource({
    name: `Synthetic Operational M4 ${randomUUID()}`, kind: "OFFICIAL", scope: "PLATFORM", owner: "Synthetic owner",
    license: "ODbL-1.0", licenseClass: "RESTRICTED", ownership: "THIRD_PARTY", allowExport: false, freshnessDays: 365,
    usagePolicy: "Synthetic Operational history only", attribution: "Synthetic Operational evidence", attributionRequired: true,
  }, actor);
  const dataset = operationalCalculationDataset(); dataset.sourceId = source.id;
  const item = await createDataCenterItem({
    sourceId: source.id, title: "Synthetic Operational M4 model", typeKey: OPERATIONAL_MODEL_TYPE_KEY, layer: "DATA",
    content: JSON.stringify(dataset), evidenceStatus: "VERIFIED", sourcePublishedAt: "2026-10-03T00:00:00.000Z",
    provenance: [{ kind: "DOCUMENT", reference: "fixture:operational-m4", label: "Synthetic Operational M4" }],
    coverage: { countryCodes: ["SA"], regionCodes: [] }, ...itemOptions,
  }, actor);
  await publish(item.id, actor);
  const reference = operationalReference();
  reference.source.sourceId = source.id; reference.version.versionId = item.version.id; reference.version.checksum.value = item.version.checksum;
  return { source, dataset, item, request: bindOperationalDataset(dataset, reference, execution().evaluatedAt) };
}
async function reader(tx: DbExecutor): Promise<DataCenterActor> {
  const row = await tx.user.create({ data: { email: `operational-reader-${randomUUID()}@example.test`, status: "ACTIVE" } });
  return { id: row.id, kind: "HUMAN", systemRole: "USER" };
}
const counts = async (tx: DbExecutor) => ({
  runs: await tx.analysisEngineRun.count(), inputs: await tx.analysisEngineRunInput.count(),
  sources: await tx.dataCenterSource.count(), items: await tx.dataCenterItem.count(), versions: await tx.dataCenterVersion.count(),
  usages: await tx.dataCenterUsage.count(), audits: await tx.auditLog.count(), events: await tx.dataCenterEvent.count(),
});
async function committedFixture() {
  return actual().$transaction(async (tx) => {
    await assertOwned(tx); context.tx = tx;
    try { const actor = await setup(tx); return { actor, ...await fixture(actor) }; }
    finally { context.tx = null; }
  }, { timeout: 90_000 });
}
describe.skipIf(!enabled)("Operational M4 atomic history and exact replay on owned scratch PostgreSQL", () => {
  afterAll(async () => { if (enabled) await actual().$disconnect(); });
  it("commits durable Run/Input/Output and replays identically in a separate read-only transaction", async () => {
    const f = await committedFixture();
    const result = await runOperationalAnalysisPersisted(f.request, f.actor, execution());
    const row = await actual().analysisEngineRun.findUniqueOrThrow({ where: { runId: result.runId }, include: { inputs: true } });
    expect(row.result).toEqual(result); expect(row.inputs).toHaveLength(1);
    expect(row.inputs[0]).toMatchObject({ dataCenterVersionId: f.item.version.id, dataCenterSourceId: f.source.id,
      dataCenterTypeKey: OPERATIONAL_MODEL_TYPE_KEY, checksum: f.item.version.checksum });
    expect(row.inputs[0]!.provenance).toMatchObject({ model: result.request.normalized });
    expect(row.requestHash).toBe(result.determinism.requestHash);
    expect(row.inputsHash).toBe(result.determinism.inputsHash); expect(row.outputHash).toBe(result.determinism.outputHash);
    const before = await counts(actual());
    expect(await replayOperationalAnalysis(result.runId, f.actor)).toEqual(result);
    expect((await readOperationalRun(result.runId, f.actor)).runtime.policies.rounding).toContain("HALF_EVEN");
    expect(await counts(actual())).toEqual(before);
  });
  it("rolls back a nested input failure without orphans, retries the same ID, and rejects subsequent duplicates", async () => {
    const f = await committedFixture(); const ctx = execution(); const before = await counts(actual());
    await actual().$executeRawUnsafe(`CREATE FUNCTION operational_m4_reject_input() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected Operational M4 nested input failure'; END; $$`);
    await actual().$executeRawUnsafe(`CREATE TRIGGER operational_m4_failure BEFORE INSERT ON "AnalysisEngineRunInput" FOR EACH ROW EXECUTE FUNCTION operational_m4_reject_input()`);
    try {
      await expect(runOperationalAnalysisPersisted(f.request, f.actor, ctx)).rejects.toThrow(/Injected Operational M4/);
      expect(await counts(actual())).toEqual(before);
      expect(await actual().analysisEngineRun.findUnique({ where: { runId: ctx.runId } })).toBeNull();
    } finally {
      await actual().$executeRawUnsafe(`DROP TRIGGER operational_m4_failure ON "AnalysisEngineRunInput"`);
      await actual().$executeRawUnsafe(`DROP FUNCTION operational_m4_reject_input()`);
    }
    const result = await runOperationalAnalysisPersisted(f.request, f.actor, ctx);
    expect(await replayOperationalAnalysis(result.runId, f.actor)).toEqual(result);
    const after = await counts(actual()); expect(after.runs).toBe(before.runs + 1); expect(after.inputs).toBe(before.inputs + 1);
    await expect(runOperationalAnalysisPersisted(f.request, f.actor, ctx)).rejects.toThrow();
    expect(await counts(actual())).toEqual(after);
  });
  it("allows exactly one winner in a concurrent duplicate-ID race without orphan inputs", async () => {
    const f = await committedFixture(); const ctx = execution(); const before = await counts(actual());
    const attempts = await Promise.allSettled(Array.from({ length: 3 }, () => runOperationalAnalysisPersisted(f.request, f.actor, ctx)));
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((a) => a.status === "rejected")).toHaveLength(2);
    const after = await counts(actual()); expect(after.runs).toBe(before.runs + 1); expect(after.inputs).toBe(before.inputs + 1);
    expect((await replayOperationalAnalysis(ctx.runId, f.actor)).runId).toBe(ctx.runId);
  });
  it("replays the original model and version after newer operational assumptions are published", async () => {
    await isolated(async (tx, actor) => {
      const f = await fixture(actor); const result = await runOperationalAnalysisPersisted(f.request, actor, execution());
      f.dataset.model.values.find((v) => v.id === "target")!.value = "999";
      const next = await createDataCenterVersion({
        itemId: f.item.id, title: "Synthetic newer operational assumptions", content: JSON.stringify(f.dataset),
        evidenceStatus: "VERIFIED", reason: "Synthetic version replacement",
        provenance: [{ kind: "DOCUMENT", reference: "fixture:new-operational", label: "Synthetic newer model" }],
      }, actor);
      await publish(f.item.id, actor);
      await tx.dataCenterSource.update({ where: { id: f.source.id }, data: { freshnessDays: 1 } });
      const before = await counts(tx);
      expect(await replayOperationalAnalysis(result.runId, actor)).toEqual(result);
      const stored = await readOperationalRun(result.runId, actor);
      expect(stored.record.inputs[0]!.refId).toBe(f.item.version.id); expect(stored.record.inputs[0]!.refId).not.toBe(next.id);
      expect(stored.result.metrics.find((m) => m.key === "capacity_gap")!.value).toBe("20");
      expect(await counts(tx)).toEqual(before);
    });
  });
  it("filters foreign and missing history identically for reads and replay", async () => {
    await isolated(async (tx, admin) => {
      const f = await fixture(admin); const owner = await reader(tx); const foreign = await reader(tx);
      const result = await runOperationalAnalysisPersisted(f.request, owner, execution());
      expect(await replayOperationalAnalysis(result.runId, owner)).toEqual(result);
      expect(await replayOperationalAnalysis(result.runId, admin)).toEqual(result);
      for (const id of [result.runId, "missing-operational-run"]) {
        await expect(readOperationalRun(id, foreign)).rejects.toEqual(new OperationalHistoryUnavailable());
        await expect(replayOperationalAnalysis(id, foreign)).rejects.toEqual(new OperationalHistoryUnavailable());
      }
    });
  });
  it.each(["retrieval", "license", "usage", "export", "attribution", "private", "ownership"] as const)("rejects replay after current %s rights change", async (variant) => {
    await isolated(async (tx, admin) => {
      const f = await fixture(admin); const owner = await reader(tx);
      const result = await runOperationalAnalysisPersisted(f.request, owner, execution());
      const data = variant === "retrieval" ? { allowRetrieval: false } : variant === "license" ? { license: "Changed license" }
        : variant === "usage" ? { usagePolicy: "Changed usage" } : variant === "export" ? { licenseClass: "OPEN_LICENSE" as const, allowExport: true }
        : variant === "attribution" ? { attribution: "Changed attribution" } : variant === "ownership" ? { owner: "Changed owner" } : { scope: "PRIVATE" as const };
      await tx.dataCenterSource.update({ where: { id: f.source.id }, data });
      await expect(readOperationalRun(result.runId, owner)).rejects.toBeInstanceOf(OperationalHistoryUnavailable);
      await expect(replayOperationalAnalysis(result.runId, owner)).rejects.toBeInstanceOf(OperationalHistoryUnavailable);
    });
  });
  it("rejects archived inputs rather than returning cached results", async () => {
    await isolated(async (_tx, actor) => {
      const f = await fixture(actor); const result = await runOperationalAnalysisPersisted(f.request, actor, execution());
      await transitionDataCenterItem({ itemId: f.item.id, status: "ARCHIVED", reason: "Synthetic archive" }, actor);
      await expect(replayOperationalAnalysis(result.runId, actor)).rejects.toBeInstanceOf(OperationalHistoryUnavailable);
    });
  });
  it("checks current authorization before recomputing corrupted cached calculations", async () => {
    await isolated(async (tx, admin) => {
      const f = await fixture(admin); const owner = await reader(tx);
      const result = await runOperationalAnalysisPersisted(f.request, owner, execution());
      await tx.$executeRawUnsafe(`ALTER TABLE "AnalysisEngineRun" DISABLE TRIGGER "AnalysisEngineRun_append_only"`);
      try { await tx.$executeRaw`UPDATE "AnalysisEngineRun" SET "result" = '{}'::jsonb WHERE "runId" = ${result.runId}`; }
      finally { await tx.$executeRawUnsafe(`ALTER TABLE "AnalysisEngineRun" ENABLE TRIGGER "AnalysisEngineRun_append_only"`); }
      await tx.dataCenterSource.update({ where: { id: f.source.id }, data: { allowRetrieval: false } });
      await expect(replayOperationalAnalysis(result.runId, owner)).rejects.toEqual(new OperationalHistoryUnavailable());
    });
  });
  it("retains server specialty/mission context and does not grant access from model fields", async () => {
    await isolated(async (_tx, actor) => {
      const f = await fixture(actor, { specialties: ["operational"], missionContexts: ["study"] });
      await expect(runOperationalAnalysisPersisted(f.request, actor, execution())).rejects.toBeInstanceOf(OperationalHistoryUnavailable);
      const result = await runOperationalAnalysisPersisted(f.request, actor, execution(), { specialty: "operational", missionContext: "study" });
      expect((await readOperationalRun(result.runId, actor)).runtime.replayAuthorizationContext).toEqual({ specialty: "operational", missionContext: "study" });
      expect(await replayOperationalAnalysis(result.runId, actor)).toEqual(result);
    });
  });
  it("reauthorizes current organization membership and trusted organization scope", async () => {
    await isolated(async (tx, admin) => {
      const f = await fixture(admin); const owner = await reader(tx);
      const org = await tx.organization.create({ data: { name: "Synthetic Operational M4 org", slug: `operational-m4-${randomUUID()}` } });
      const membership = await tx.organizationMember.create({ data: { userId: owner.id, organizationId: org.id, isOwner: true, status: "ACTIVE" } });
      await tx.dataCenterSource.update({ where: { id: f.source.id }, data: { scope: "ORGANIZATION", organizationId: org.id } });
      await expect(runOperationalAnalysisPersisted(f.request, admin, execution(), { organizationId: "another-org" })).rejects.toBeInstanceOf(OperationalHistoryUnavailable);
      const result = await runOperationalAnalysisPersisted(f.request, owner, execution(), { organizationId: org.id });
      expect(await replayOperationalAnalysis(result.runId, owner)).toEqual(result);
      await tx.organizationMember.update({ where: { id: membership.id }, data: { status: "SUSPENDED" } });
      await expect(replayOperationalAnalysis(result.runId, owner)).rejects.toBeInstanceOf(OperationalHistoryUnavailable);
    });
  });
  it.each(["grant", "mission", "expiry"] as const)("reauthorizes current robot %s before replay", async (variant) => {
    await isolated(async (tx, admin) => {
      const f = await fixture(admin); const principal = await reader(tx);
      const robot = await tx.robot.create({ data: { slug: `operational-m4-${randomUUID()}`, name: "Synthetic Operational reader" } });
      const mission = await tx.mission.create({ data: { name: "Synthetic Operational study", assignedRobots: { connect: { id: robot.id } } } });
      const actor: DataCenterActor = { id: principal.id, kind: "AI", systemRole: "USER", robotId: robot.id, roleKey: "analyst", specialty: "operational", missionId: mission.id };
      const grant = await grantDataCenterRobotAccess({
        robotId: robot.id, sourceId: f.source.id, principalId: principal.id, roleKey: "analyst", specialty: "operational", missionId: mission.id,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(), reason: "Synthetic Operational M4 grant",
      }, admin);
      const result = await runOperationalAnalysisPersisted(f.request, actor, execution());
      expect(await replayOperationalAnalysis(result.runId, actor)).toEqual(result);
      if (variant === "grant") await revokeDataCenterRobotAccess({ grantId: grant.id, reason: "Synthetic grant revocation" }, admin);
      else if (variant === "mission") await tx.mission.update({ where: { id: mission.id }, data: { assignedRobots: { disconnect: { id: robot.id } } } });
      else {
        const future = new Date(Date.now() + 2 * 86_400_000);
        vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(future);
      }
      try { await expect(replayOperationalAnalysis(result.runId, actor)).rejects.toBeInstanceOf(OperationalHistoryUnavailable); }
      finally { if (variant === "expiry") vi.useRealTimers(); }
    });
  });
  it("reauthorizes version-specific required permissions", async () => {
    await isolated(async (tx, admin) => {
      const f = await fixture(admin, { requiredPermission: "operational.read" }); const owner = await reader(tx);
      const org = await tx.organization.create({ data: { name: "Synthetic Operational permission org", slug: `operational-perm-${randomUUID()}` } });
      const read = await tx.permission.upsert({ where: { key: "data-center.read" }, create: { key: "data-center.read", description: "Read" }, update: {} });
      const specific = await tx.permission.upsert({ where: { key: "operational.read" }, create: { key: "operational.read", description: "Read Operational" }, update: {} });
      const role = await tx.role.create({ data: { key: `operational-reader-${randomUUID()}`, name: "Synthetic Operational reader", organizationId: org.id,
        permissions: { create: [{ permissionId: read.id }, { permissionId: specific.id }] } } });
      await tx.organizationMember.create({ data: { userId: owner.id, organizationId: org.id, status: "ACTIVE", roleId: role.id } });
      await tx.dataCenterSource.update({ where: { id: f.source.id }, data: { scope: "ORGANIZATION", organizationId: org.id } });
      const result = await runOperationalAnalysisPersisted(f.request, owner, execution(), { organizationId: org.id });
      expect(await replayOperationalAnalysis(result.runId, owner)).toEqual(result);
      await tx.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: specific.id } } });
      await expect(replayOperationalAnalysis(result.runId, owner)).rejects.toBeInstanceOf(OperationalHistoryUnavailable);
    });
  });
  it.each(["run-update", "run-delete", "input-update", "input-delete"] as const)("enforces append-only %s in PostgreSQL", async (variant) => {
    await isolated(async (tx, actor) => {
      const f = await fixture(actor); const result = await runOperationalAnalysisPersisted(f.request, actor, execution());
      await tx.$executeRawUnsafe("SAVEPOINT operational_m4_append_only");
      if (variant === "run-update") await expect(tx.analysisEngineRun.update({ where: { runId: result.runId }, data: { subject: "tamper" } })).rejects.toThrow(/append-only/);
      if (variant === "run-delete") await expect(tx.analysisEngineRun.delete({ where: { runId: result.runId } })).rejects.toThrow(/append-only/);
      if (variant === "input-update") await expect(tx.analysisEngineRunInput.updateMany({ where: { runId: result.runId }, data: { contentHash: "0".repeat(64) } })).rejects.toThrow(/append-only/);
      if (variant === "input-delete") await expect(tx.analysisEngineRunInput.deleteMany({ where: { runId: result.runId } })).rejects.toThrow(/append-only/);
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT operational_m4_append_only");
      expect(await replayOperationalAnalysis(result.runId, actor)).toEqual(result);
    });
  });
  it.each(["result", "requestHash", "inputHash", "provenance", "usageIntent", "sourcePin", "source-bytes", "missing-version"] as const)("detects %s corruption without fallback", async (variant) => {
    await isolated(async (tx, actor) => {
      const f = await fixture(actor); const result = await runOperationalAnalysisPersisted(f.request, actor, execution());
      if (variant === "result" || variant === "requestHash") {
        await tx.$executeRawUnsafe(`ALTER TABLE "AnalysisEngineRun" DISABLE TRIGGER "AnalysisEngineRun_append_only"`);
        try {
          if (variant === "result") await tx.$executeRaw`UPDATE "AnalysisEngineRun" SET "result" = jsonb_set("result", '{metrics,0,value}', '"99999"') WHERE "runId" = ${result.runId}`;
          else await tx.$executeRaw`UPDATE "AnalysisEngineRun" SET "requestHash" = ${"0".repeat(64)} WHERE "runId" = ${result.runId}`;
        } finally { await tx.$executeRawUnsafe(`ALTER TABLE "AnalysisEngineRun" ENABLE TRIGGER "AnalysisEngineRun_append_only"`); }
      } else if (variant === "inputHash" || variant === "provenance" || variant === "usageIntent" || variant === "sourcePin") {
        await tx.$executeRawUnsafe(`ALTER TABLE "AnalysisEngineRunInput" DISABLE TRIGGER "AnalysisEngineRunInput_append_only"`);
        try {
          if (variant === "inputHash") await tx.$executeRaw`UPDATE "AnalysisEngineRunInput" SET "contentHash" = ${"0".repeat(64)} WHERE "runId" = ${result.runId}`;
          else if (variant === "provenance") await tx.$executeRaw`UPDATE "AnalysisEngineRunInput" SET "provenance" = '{}'::jsonb WHERE "runId" = ${result.runId}`;
          else if (variant === "usageIntent") await tx.$executeRaw`UPDATE "AnalysisEngineRunInput" SET "usageIntent" = '{}'::jsonb WHERE "runId" = ${result.runId}`;
          else await tx.$executeRaw`UPDATE "AnalysisEngineRunInput" SET "dataCenterSourceId" = 'wrong-source' WHERE "runId" = ${result.runId}`;
        } finally { await tx.$executeRawUnsafe(`ALTER TABLE "AnalysisEngineRunInput" ENABLE TRIGGER "AnalysisEngineRunInput_append_only"`); }
      } else {
        if (variant === "missing-version") {
          await createDataCenterVersion({
            itemId: f.item.id, title: "Synthetic replacement, not replay fallback", content: JSON.stringify(f.dataset),
            evidenceStatus: "VERIFIED", reason: "Synthetic missing historical version",
            provenance: [{ kind: "DOCUMENT", reference: "fixture:operational-m4-missing", label: "Synthetic replacement" }],
          }, actor);
          await publish(f.item.id, actor);
        }
        await tx.$executeRawUnsafe(`ALTER TABLE "DataCenterVersion" DISABLE TRIGGER "DataCenterVersion_immutable"`);
        try {
          if (variant === "source-bytes") await tx.$executeRaw`UPDATE "DataCenterVersion" SET "content" = '{}' WHERE "id" = ${f.item.version.id}`;
          else {
            for (const table of ["DataCenterReview", "DataCenterEvidenceLink"]) {
              await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${table}_immutable"`);
              try {
                if (table === "DataCenterReview") await tx.$executeRaw`DELETE FROM "DataCenterReview" WHERE "versionId" = ${f.item.version.id}`;
                else await tx.$executeRaw`DELETE FROM "DataCenterEvidenceLink" WHERE "versionId" = ${f.item.version.id}`;
              } finally { await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER "${table}_immutable"`); }
            }
            await tx.$executeRaw`DELETE FROM "DataCenterVersion" WHERE "id" = ${f.item.version.id}`;
            await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
          }
        } finally { await tx.$executeRawUnsafe(`ALTER TABLE "DataCenterVersion" ENABLE TRIGGER "DataCenterVersion_immutable"`); }
      }
      if (variant === "source-bytes") await expect(replayOperationalAnalysis(result.runId, actor)).rejects.toBeInstanceOf(OperationalHistoryMismatch);
      else if (variant === "missing-version") await expect(replayOperationalAnalysis(result.runId, actor)).rejects.toBeInstanceOf(OperationalHistoryUnavailable);
      else await expect(replayOperationalAnalysis(result.runId, actor)).rejects.toThrow();
    });
  });
  it("does not persist caller overrides that disagree with the original approved model", async () => {
    await isolated(async (tx, actor) => {
      const f = await fixture(actor); const before = await counts(tx);
      f.request.model.values.find((v) => v.id === "target")!.value = "999";
      await expect(runOperationalAnalysisPersisted(f.request, actor, execution())).rejects.toThrow("PUBLISHED_MODEL_REQUEST_MISMATCH");
      expect(await counts(tx)).toEqual(before);
    });
  });
  it("reauthorizes between preparation and atomic persistence and refuses actor substitution", async () => {
    await isolated(async (tx, admin) => {
      const f = await fixture(admin); const owner = await reader(tx); const other = await reader(tx); const run = execution();
      const capture = captureOperationalReads(createOperationalDataCenterProvider(owner, { evaluatedAt: run.evaluatedAt }));
      const result = await analyzeOperationalData(capture.port, f.request, {
        runId: run.runId, evaluatedAt: run.evaluatedAt, environment: run.environment, timing: run.timing,
      });
      const record = await buildOperationalRunRecord(result, {
        actor: { kind: "USER", id: owner.id }, createdAt: run.createdAt, access: {},
      }, capture.transcript);
      const before = await counts(tx);
      await expect(persistOperationalRun(record, other)).rejects.toBeInstanceOf(OperationalHistoryUnavailable);
      await tx.dataCenterSource.update({ where: { id: f.source.id }, data: { allowRetrieval: false } });
      await expect(persistOperationalRun(record, owner)).rejects.toBeInstanceOf(OperationalHistoryUnavailable);
      expect(await counts(tx)).toEqual(before);
    });
  });
  it("blocks unresolved current source conflicts before returning stored results", async () => {
    await isolated(async (tx, actor) => {
      const f = await fixture(actor); const result = await runOperationalAnalysisPersisted(f.request, actor, execution());
      const other = await fixture(actor);
      await tx.dataCenterConflict.create({ data: {
        itemId: f.item.id, otherItemId: other.item.id, itemVersion: 1, otherVersion: 1, reason: "Synthetic unresolved Operational conflict",
      } });
      await expect(replayOperationalAnalysis(result.runId, actor)).rejects.toBeInstanceOf(OperationalHistoryUnavailable);
    });
  });
});
