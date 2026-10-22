import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { DbExecutor } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
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
import { type DataCenterActor } from "@/services/data-center/contracts";
import { createDataCenterItem, createDataCenterSource, createDataCenterVersion, registerDataCenterType, reviewDataCenterItem, transitionDataCenterItem } from "@/services/data-center/service";
import { grantDataCenterRobotAccess, revokeDataCenterRobotAccess } from "@/services/data-center/robot-grants";
import { createCompetitorDataCenterProvider, prepareCompetitorDataCenterInputs, runCompetitorDataCenterAnalysis } from "@/services/analysis-engines/competitor-analysis/adapters/data-center-provider";
import { assertCompetitorAnalyticsResult, assessCompetitorCount, typeKeyByCompetitorRole, type CompetitorDatasetRole } from "@/services/analysis-engines/competitor-analysis";
import { competitorDataset } from "../unit/support/competitor-data-fixtures";
import { competitorInstant, competitorRequest } from "../unit/support/competitor-analysis-fixtures";
import { buildCompetitorRunRecord } from "@/services/analysis-engines/competitor-analysis/run-history";
import { runCompetitorAnalysisPersisted } from "@/services/analysis-engines/competitor-analysis/adapters/run-service";
import { persistCompetitorRun, readCompetitorRun } from "@/services/analysis-engines/competitor-analysis/adapters/run-persistence";
import { replayCompetitorAnalysis } from "@/services/analysis-engines/competitor-analysis/adapters/replay-service";
import { CompetitorHistoryUnavailable } from "@/services/analysis-engines/competitor-analysis/adapters/historical-data-center";
import { recordDataCenterQualityAssessment } from "@/services/data-center/quality";

const enabled = process.env.DATA_CENTER_DATABASE_TESTS === "1";
const rollback = new Error("ROLLBACK_COMPETITOR_M2_SYNTHETIC_FIXTURES");
const trusted = () => ({ evaluatedAt: new Date(Math.max(Date.now(), Date.parse(competitorInstant))).toISOString() });
const execution = () => {
  const context = trusted(); return { ...context, runId: `competitor:m3-${randomUUID()}`, environment: "test" as const,
    timing: { startedAt: context.evaluatedAt, finishedAt: context.evaluatedAt, durationMs: 0 } };
};
async function isolated(run: (tx: DbExecutor, actor: DataCenterActor) => Promise<void>) {
  const actual = context.actual as typeof db;
  try { await actual.$transaction(async (tx) => {
    context.tx = tx;
    try {
      const user = await tx.user.create({ data: { email: `competitor-m2-${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
      const actor: DataCenterActor = { id: user.id, systemRole: "ADMIN", kind: "HUMAN" };
      // Registration is test-only inside a disposable rolled-back transaction, never in the frozen registry.
      for (const key of Object.values(typeKeyByCompetitorRole)) if (!await tx.dataCenterType.findUnique({ where: { key } })) {
        await registerDataCenterType({ key, label: "Synthetic Competitor fixture", layer: "DATA", requiresIndependentReview: false }, actor);
      }
      await run(tx, actor); throw rollback;
    } finally { context.tx = null; }
  }, { timeout: 90_000, maxWait: 30_000 }); } catch (error) { if (error !== rollback) throw error; }
}
const source = (actor: DataCenterActor, extra: Partial<Parameters<typeof createDataCenterSource>[0]> = {}) => createDataCenterSource({
  name: `Synthetic Competitor ${randomUUID()}`, kind: "OFFICIAL", scope: "PLATFORM", owner: "Synthetic test authority",
  license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", ownership: "THIRD_PARTY", allowExport: false,
  freshnessDays: 365, usagePolicy: "Credit required; synthetic only", attribution: "Synthetic Competitor fixture", attributionRequired: true, ...extra,
}, actor);
async function publish(itemId: string, actor: DataCenterActor) {
  await transitionDataCenterItem({ itemId, status: "IN_REVIEW", reason: "Synthetic submission" }, actor);
  await reviewDataCenterItem({ itemId, decision: "APPROVED", notes: "Synthetic integration fixture, not real competitors" }, actor);
  await transitionDataCenterItem({ itemId, status: "APPROVED", reason: "Synthetic approval" }, actor);
  await transitionDataCenterItem({ itemId, status: "PUBLISHED", reason: "Synthetic publication" }, actor);
}
async function dataset(actor: DataCenterActor, sourceId: string, role: CompetitorDatasetRole = "competitor.locations", size = 1, extra: Partial<Parameters<typeof createDataCenterItem>[0]> = {}) {
  const content = competitorDataset(role, size); content.sourceId = sourceId;
  const item = await createDataCenterItem({
    sourceId, title: "Synthetic competitor fixture, not real-data acceptance", typeKey: typeKeyByCompetitorRole[role], layer: "DATA",
    content: JSON.stringify(content), evidenceStatus: "VERIFIED", sourcePublishedAt: "2026-10-01T00:00:00.000Z",
    provenance: [{ kind: "DOCUMENT", reference: "fixture:competitor-m2", label: "Synthetic integration evidence" }],
    coverage: { countryCodes: ["SA"], regionCodes: [] }, ...extra,
  }, actor);
  await publish(item.id, actor); return item;
}
async function bundle(actor: DataCenterActor, size = 1) {
  const s = await source(actor); const req = competitorRequest(); req.data.roles = {};
  const items = [];
  for (const role of ["competitor.entities", "competitor.locations", "competitor.matching-rules", "competitor.dimensions"] as const) {
    const item = await dataset(actor, s.id, role, size); items.push(item);
    req.data.roles[role] = [{ versionId: item.version.id, expectedChecksum: item.version.checksum }];
  }
  return { s, req, items };
}
const counts = async (tx: DbExecutor) => ({
  sources: await tx.dataCenterSource.count(), items: await tx.dataCenterItem.count(), versions: await tx.dataCenterVersion.count(),
  types: await tx.dataCenterType.count(), audits: await tx.auditLog.count(), events: await tx.dataCenterEvent.count(),
  usages: await tx.dataCenterUsage.count(), runs: await tx.analysisEngineRun.count(), inputs: await tx.analysisEngineRunInput.count(),
});
const historyContext = () => { const ctx = execution(); return { ...ctx, createdAt: ctx.evaluatedAt }; };
async function historyFixture(tx: DbExecutor, admin: DataCenterActor) {
  const fixture = await bundle(admin, 15);
  const user = await tx.user.create({ data: { email: `competitor-m4-${randomUUID()}@example.test`, status: "ACTIVE" } });
  const owner: DataCenterActor = { id: user.id, kind: "HUMAN", systemRole: "USER" };
  const ctx = historyContext(); const result = await runCompetitorAnalysisPersisted(fixture.req, owner, ctx);
  return { ...fixture, owner, ctx, result };
}
async function mutableHistory(tx: DbExecutor, table: "AnalysisEngineRun" | "AnalysisEngineRunInput", work: () => Promise<unknown>) {
  await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${table}_append_only"`);
  try { await work(); } finally { await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER "${table}_append_only"`); }
}
async function expectedDatabaseFailure(tx: DbExecutor, work: () => Promise<unknown>) {
  await tx.$executeRawUnsafe("SAVEPOINT competitor_m4_expected_failure");
  await expect(work()).rejects.toThrow();
  await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT competitor_m4_expected_failure");
  await tx.$executeRawUnsafe("RELEASE SAVEPOINT competitor_m4_expected_failure");
}
afterAll(async () => { if (enabled) await (context.actual as typeof db).$disconnect(); });
describe.skipIf(!enabled)("Competitor M4 shared persistence and exact historical replay (synthetic PostgreSQL)", () => {
  it("commits history durably and reads/replays it in separate real transactions", async () => {
    const actual = context.actual as typeof db;
    const user = await actual.user.create({ data: { email: `competitor-durable-${randomUUID()}@example.test`, status: "ACTIVE" } });
    const actor: DataCenterActor = { id: user.id, kind: "HUMAN", systemRole: "USER" };
    const ctx = historyContext();
    try {
      const req = competitorRequest(); req.data.roles = Object.fromEntries(
        ["competitor.entities", "competitor.locations", "competitor.matching-rules", "competitor.dimensions"].map((role) => [role, [{ versionId: `absent-${randomUUID()}` }]]));
      const result = await runCompetitorAnalysisPersisted(req, actor, ctx);
      expect(result.inputs).toEqual([]); expect(context.tx).toBeNull();
      const row = await actual.$transaction((tx) => tx.analysisEngineRun.findUniqueOrThrow({ where: { runId: result.runId } }));
      expect(row.outputHash).toBe(result.determinism.outputHash);
      expect(await replayCompetitorAnalysis(result.runId, actor)).toEqual(result);
    } finally {
      await actual.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('ALTER TABLE "AnalysisEngineRun" DISABLE TRIGGER "AnalysisEngineRun_append_only"');
        await tx.analysisEngineRun.deleteMany({ where: { runId: ctx.runId, actorId: user.id } });
        await tx.$executeRawUnsafe('ALTER TABLE "AnalysisEngineRun" ENABLE TRIGGER "AnalysisEngineRun_append_only"');
        await tx.user.delete({ where: { id: user.id } });
      });
    }
  });
  it("atomically stores full entity/location/matching decisions and exact Shared input/provenance/usage rows only", async () => {
    await isolated(async (tx, admin) => {
      const { result, owner, ctx } = await historyFixture(tx, admin); const before = await counts(tx);
      const rows = await tx.analysisEngineRunInput.findMany({ where: { runId: result.runId } });
      expect(rows).toHaveLength(4);
      for (const row of rows) expect(row).toMatchObject({ dataCenterVersionId: row.refId, contentHash: row.checksum,
        provenance: { contract: "jenan.competitor-analysis.input-provenance/v1" },
        usageIntent: { contract: "jenan.competitor-analysis.input-usage/v1", versionId: row.refId } });
      expect((await readCompetitorRun(result.runId, owner)).result).toEqual(result);
      const copy = { ...result, runId: `${result.runId}-copy` };
      await persistCompetitorRun(buildCompetitorRunRecord(copy, { actor: { kind: "USER", id: owner.id }, access: {}, createdAt: ctx.createdAt }), owner);
      expect(await counts(tx)).toEqual({ ...before, runs: before.runs + 1, inputs: before.inputs + 4 });
    });
  });
  it("replays exact inventory, confidence, rights and all hashes without any writes", async () => {
    await isolated(async (tx, admin) => {
      const { result, owner } = await historyFixture(tx, admin); const before = await counts(tx); const start = performance.now();
      expect(await replayCompetitorAnalysis(result.runId, owner)).toEqual(result);
      console.log(`COMPETITOR_M4_EXACT_REPLAY_MS=${(performance.now() - start).toFixed(2)}`);
      expect(await replayCompetitorAnalysis(result.runId, admin)).toEqual(result); expect(await counts(tx)).toEqual(before);
    });
  });
  it("does not rediscover or upgrade a stored by-type selection when newer content is published", async () => {
    await isolated(async (tx, admin) => {
      const { req, s, items, owner } = await historyFixture(tx, admin); req.data.roles = {};
      const result = await runCompetitorAnalysisPersisted(req, owner, historyContext());
      const changed = competitorDataset("competitor.locations", 2); changed.sourceId = s.id;
      await createDataCenterVersion({ itemId: items[1]!.id, title: "Later synthetic locations", reason: "Synthetic exact replay",
        content: JSON.stringify(changed), evidenceStatus: "VERIFIED", sourcePublishedAt: "2026-10-01T00:00:00.000Z",
        provenance: [{ kind: "DOCUMENT", reference: "fixture:m4-new", label: "Synthetic later version" }], coverage: { countryCodes: ["SA"], regionCodes: [] } }, admin);
      await publish(items[1]!.id, admin);
      expect(await replayCompetitorAnalysis(result.runId, owner)).toEqual(result);
      expect(result.inventory).toHaveLength(15);
    });
  });
    it("persists and replays both snapshots and eight exact input versions for historical count comparisons", async () => {
      await isolated(async (tx, admin) => {
        const { req, s } = await bundle(admin, 15); req.analyses = ["COUNTS", "HISTORICAL_CHANGE"];
        const asOf = "2026-10-15T12:00:00.000Z"; req.parameters = { historical: { asOf, roles: {} } };
        for (const role of ["competitor.entities", "competitor.locations", "competitor.matching-rules", "competitor.dimensions"] as const) {
          const content = competitorDataset(role, 10); content.sourceId = s.id;
          if (content.role === "competitor.locations") content.inventory.scope.asOf = asOf;
          const item = await dataset(admin, s.id, role, 10, { content: JSON.stringify(content) });
          req.parameters.historical!.roles[role] = [{ versionId: item.version.id }];
        }
        const result = await runCompetitorAnalysisPersisted(req, admin, historyContext());
        expect(result.inputs).toHaveLength(8);
        expect(await tx.analysisEngineRunInput.count({ where: { runId: result.runId } })).toBe(8);
        const before = await counts(tx);
        expect(await replayCompetitorAnalysis(result.runId, admin)).toEqual(result);
        expect(await counts(tx)).toEqual(before);
        const changes = result.results.flatMap((entry) => entry.metrics).filter((metric) => metric.analysis === "HISTORICAL_CHANGE" && metric.countingUnit === "COMPETITOR_LOCATIONS");
        expect(Object.fromEntries(changes.map((metric) => [metric.operation, metric.value]))).toEqual({ ABSOLUTE_CHANGE: 5, PERCENT_CHANGE: 50, INDEX: 150 });
      });
    });
    it("reauthorizes unselected discovery candidates before returning their cached metadata", async () => {
      await isolated(async (tx, admin) => {
        const extra = await source(admin); await dataset(admin, extra.id, "competitor.locations", 1, { sourcePublishedAt: "2026-09-01T00:00:00.000Z" });
        const { req, owner } = await historyFixture(tx, admin); req.data.roles = {};
        const result = await runCompetitorAnalysisPersisted(req, owner, historyContext());
        const selected = result.preparation.current.sources.find((entry) => entry.role === "competitor.locations")!;
        expect(selected.reference?.source.sourceId).not.toBe(extra.id);
        expect(selected.selection?.candidates.some((entry) => entry.reference.source.sourceId === extra.id)).toBe(true);
        await tx.dataCenterSource.update({ where: { id: extra.id }, data: { scope: "PRIVATE" } });
        await expect(readCompetitorRun(result.runId, owner)).rejects.toBeInstanceOf(CompetitorHistoryUnavailable);
      });
    });
    it("retains recorded specialty/mission restrictions on exact replay", async () => {
      await isolated(async (tx, admin) => {
        const s = await source(admin); const req = competitorRequest(); req.data.roles = {};
        for (const role of ["competitor.entities", "competitor.locations", "competitor.matching-rules", "competitor.dimensions"] as const) {
          const item = await dataset(admin, s.id, role, 2, { specialties: ["competitor"], missionContexts: ["study"] });
          req.data.roles[role] = [{ versionId: item.version.id }];
        }
        const result = await runCompetitorAnalysisPersisted(req, admin, { ...historyContext(), specialty: "competitor", missionContext: "study" });
        expect(await replayCompetitorAnalysis(result.runId, admin)).toEqual(result);
        await mutableHistory(tx, "AnalysisEngineRun", () => tx.analysisEngineRun.update({ where: { runId: result.runId },
          data: { runtime: { contract: "jenan.competitor-analysis.run-history/v1", replayAuthorizationContext: {} } } }));
        await expect(replayCompetitorAnalysis(result.runId, admin)).rejects.toBeInstanceOf(CompetitorHistoryUnavailable);
      });
    });
    it("blocks archived items without selecting an alternative", async () => {
      await isolated(async (tx, admin) => {
        const { result, owner, items } = await historyFixture(tx, admin);
        await transitionDataCenterItem({ itemId: items[1]!.id, status: "ARCHIVED", reason: "Synthetic M4 archive" }, admin);
        await expect(replayCompetitorAnalysis(result.runId, owner)).rejects.toBeInstanceOf(CompetitorHistoryUnavailable);
      });
    });
    it("reconstructs canonical input ordering independently of database row order", async () => {
      await isolated(async (tx, admin) => {
        const { result, owner } = await historyFixture(tx, admin);
        const row = await tx.analysisEngineRun.findUniqueOrThrow({ where: { runId: result.runId }, include: { inputs: true } });
        const reversed = { ...row, inputs: [...row.inputs].reverse() };
        const lookup = vi.spyOn(tx.analysisEngineRun, "findFirst").mockResolvedValueOnce(reversed);
        try { expect((await readCompetitorRun(result.runId, owner)).result).toEqual(result); }
        finally { lookup.mockRestore(); }
      });
    });
  it("keeps historical confidence and quality unchanged after later source assessments/freshness changes", async () => {
    await isolated(async (tx, admin) => {
      const { result, owner, items, s } = await historyFixture(tx, admin);
      await recordDataCenterQualityAssessment({ versionId: items[1]!.version.id, status: "MEASURED", score: 0.1,
        measuredAt: new Date().toISOString(), method: "synthetic-later", methodVersion: "1", explanation: "Synthetic new quality" }, admin);
      await tx.dataCenterSource.update({ where: { id: s.id }, data: { freshnessDays: 1 } });
      expect(await replayCompetitorAnalysis(result.runId, owner)).toEqual(result);
    });
  });
    it("replays originally valid exact versions after temporal expiry without using current discovery", async () => {
      await isolated(async (_tx, admin) => {
        const { req, s } = await bundle(admin, 2);
        const expiresAt = new Date(Date.parse(competitorInstant) + 86_400_000).toISOString();
        const item = await dataset(admin, s.id, "competitor.locations", 2, { expiresAt });
        req.data.roles["competitor.locations"] = [{ versionId: item.version.id }];
        const result = await runCompetitorAnalysisPersisted(req, admin, historyContext());
        vi.useFakeTimers({ toFake: ["Date"] });
        try {
          vi.setSystemTime(new Date(Date.parse(expiresAt) + 86_400_000));
          expect(await replayCompetitorAnalysis(result.runId, admin)).toEqual(result);
        } finally { vi.useRealTimers(); }
      });
    });
    it("reauthorizes retained out-of-force trace ids as well as selected input versions", async () => {
      await isolated(async (tx, admin) => {
        const extra = await source(admin);
        const excluded = await dataset(admin, extra.id, "competitor.locations", 1, { effectiveTo: competitorInstant });
        const { req, owner } = await historyFixture(tx, admin); req.data.roles = {};
        const result = await runCompetitorAnalysisPersisted(req, owner, historyContext());
        expect(result.preparation.current.sources.find((entry) => entry.role === "competitor.locations")!.selection?.notInForce.some((entry) => entry.versionId === excluded.version.id)).toBe(true);
        await tx.dataCenterSource.update({ where: { id: extra.id }, data: { scope: "PRIVATE" } });
        await expect(readCompetitorRun(result.runId, owner)).rejects.toBeInstanceOf(CompetitorHistoryUnavailable);
      });
    });
  it("preserves missing pins/gaps rather than filling them from later data", async () => {
    await isolated(async (tx, admin) => {
      const { req, owner, s } = await historyFixture(tx, admin); req.data.roles["competitor.locations"] = [{ versionId: "missing-exact" }];
      const result = await runCompetitorAnalysisPersisted(req, owner, historyContext());
      await dataset(admin, s.id);
      expect(await replayCompetitorAnalysis(result.runId, owner)).toEqual(result);
      expect(result.results.flatMap((entry) => entry.metrics).every((metric) => metric.value === null)).toBe(true);
    });
  });
  it("hides a foreign run identically to an absent run", async () => {
    await isolated(async (tx, admin) => {
      const { result } = await historyFixture(tx, admin);
      const user = await tx.user.create({ data: { email: `competitor-foreign-${randomUUID()}@example.test` } });
      const foreign: DataCenterActor = { id: user.id, kind: "HUMAN", systemRole: "USER" };
      for (const id of [result.runId, "missing-run"]) {
        await expect(readCompetitorRun(id, foreign)).rejects.toEqual(new CompetitorHistoryUnavailable());
        await expect(replayCompetitorAnalysis(id, foreign)).rejects.toEqual(new CompetitorHistoryUnavailable());
      }
    });
  });
  it.each([
    ["retrieval", { allowRetrieval: false }], ["private scope", { scope: "PRIVATE" as const }],
    ["license", { license: "changed" }], ["license class", { licenseClass: "RESTRICTED" as const }],
    ["usage", { usagePolicy: "changed" }], ["export", { allowExport: true }],
    ["attribution", { attribution: "changed" }], ["required attribution", { attributionRequired: false }],
    ["owner", { owner: "changed" }], ["ownership", { ownership: "PLATFORM_OWNED" as const }],
  ])("blocks cached lookup/replay after current %s changes without any fallback/write", async (_label, changes) => {
    await isolated(async (tx, admin) => {
      const { result, owner, s } = await historyFixture(tx, admin);
      await tx.dataCenterSource.update({ where: { id: s.id }, data: changes }); const before = await counts(tx);
      await expect(replayCompetitorAnalysis(result.runId, owner)).rejects.toBeInstanceOf(CompetitorHistoryUnavailable);
      await expect(readCompetitorRun(result.runId, owner)).rejects.toBeInstanceOf(CompetitorHistoryUnavailable);
      expect(await counts(tx)).toEqual(before);
    });
  });
  it("rechecks organization membership and captured scope on historical reads", async () => {
    await isolated(async (tx, admin) => {
      const { req, owner, s } = await historyFixture(tx, admin);
      const org = await tx.organization.create({ data: { name: "Synthetic Competitor org", slug: `competitor-${randomUUID()}` } });
      const member = await tx.organizationMember.create({ data: { userId: owner.id, organizationId: org.id, isOwner: true, status: "ACTIVE" } });
      await tx.dataCenterSource.update({ where: { id: s.id }, data: { scope: "ORGANIZATION", organizationId: org.id } });
      const result = await runCompetitorAnalysisPersisted(req, owner, { ...historyContext(), organizationId: org.id });
      expect(await replayCompetitorAnalysis(result.runId, owner)).toEqual(result);
      await tx.organizationMember.update({ where: { id: member.id }, data: { status: "SUSPENDED" } });
      await expect(replayCompetitorAnalysis(result.runId, owner)).rejects.toBeInstanceOf(CompetitorHistoryUnavailable);
    });
  });
  it("rechecks robot grants and mission assignment instead of trusting saved access", async () => {
    await isolated(async (tx, admin) => {
      const { req, s } = await bundle(admin, 2);
      const robot = await tx.robot.create({ data: { slug: `competitor-m4-${randomUUID()}`, name: "Synthetic Competitor robot" } });
      const mission = await tx.mission.create({ data: { name: "Synthetic replay mission", assignedRobots: { connect: { id: robot.id } } } });
      const user = await tx.user.create({ data: { email: `competitor-m4-robot-${randomUUID()}@example.test`, status: "ACTIVE" } });
      const actor: DataCenterActor = { id: user.id, kind: "AI", systemRole: "USER", robotId: robot.id, roleKey: "analyst", specialty: "competitor", missionId: mission.id };
      const grant = await grantDataCenterRobotAccess({ sourceId: s.id, robotId: robot.id, principalId: user.id, roleKey: "analyst", specialty: "competitor",
        missionId: mission.id, access: "READ", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), reason: "Synthetic M4" }, admin);
      const result = await runCompetitorAnalysisPersisted(req, actor, historyContext());
      expect((await readCompetitorRun(result.runId, actor)).record.actor).toEqual({ kind: "ROBOT", id: user.id });
      expect(await replayCompetitorAnalysis(result.runId, actor)).toEqual(result);
      await revokeDataCenterRobotAccess({ grantId: grant.id, reason: "Synthetic revocation" }, admin);
      await expect(replayCompetitorAnalysis(result.runId, actor)).rejects.toBeInstanceOf(CompetitorHistoryUnavailable);
    });
  });
  it("rejects altered exact content even when a newer dataset exists", async () => {
    await isolated(async (tx, admin) => {
      const { result, owner, items } = await historyFixture(tx, admin);
      await tx.$executeRawUnsafe('ALTER TABLE "DataCenterVersion" DISABLE TRIGGER "DataCenterVersion_immutable"');
      try { await tx.dataCenterVersion.update({ where: { id: items[1]!.version.id }, data: { content: "{}" } }); }
      finally { await tx.$executeRawUnsafe('ALTER TABLE "DataCenterVersion" ENABLE TRIGGER "DataCenterVersion_immutable"'); }
      await expect(replayCompetitorAnalysis(result.runId, owner)).rejects.toMatchObject({ reason: "VERSION_CHECKSUM" });
    });
  });
  it.each(["contentHash", "provenance", "usageIntent", "snapshot"] as const)("rejects corrupted stored input %s", async (field) => {
    await isolated(async (tx, admin) => {
      const { result, owner } = await historyFixture(tx, admin);
      await mutableHistory(tx, "AnalysisEngineRunInput", () => tx.analysisEngineRunInput.updateMany({
        where: { runId: result.runId }, data: field === "contentHash" ? { contentHash: "0".repeat(64) } : { [field]: {} },
      }));
      await expect(replayCompetitorAnalysis(result.runId, owner)).rejects.toThrow();
    });
  });
  it("refuses permission withdrawal between calculation and persistence with no partial history", async () => {
    await isolated(async (tx, admin) => {
      const { req, s } = await bundle(admin, 2); const ctx = historyContext();
      const result = await runCompetitorDataCenterAnalysis(req, admin, ctx);
      const record = buildCompetitorRunRecord(result, { actor: { kind: "USER", id: admin.id }, createdAt: ctx.createdAt, access: {} });
      await tx.dataCenterSource.update({ where: { id: s.id }, data: { allowRetrieval: false } });
      const before = await counts(tx); await expect(persistCompetitorRun(record, admin)).rejects.toBeInstanceOf(CompetitorHistoryUnavailable);
      expect(await counts(tx)).toEqual(before);
    });
  });
  it("rejects a forged persistence actor before writing", async () => {
    await isolated(async (tx, admin) => {
      const { result, owner, ctx } = await historyFixture(tx, admin); const before = await counts(tx);
      const record = buildCompetitorRunRecord({ ...result, runId: `${result.runId}-forged` }, { actor: { kind: "USER", id: owner.id }, createdAt: ctx.createdAt, access: {} });
      await expect(persistCompetitorRun(record, admin)).rejects.toBeInstanceOf(CompetitorHistoryUnavailable);
      expect(await counts(tx)).toEqual(before);
    });
  });
  it("keeps failed execution history explicit and non-replayable", async () => {
    await isolated(async (tx, admin) => {
      const ctx = historyContext();
      await expect(runCompetitorAnalysisPersisted({}, admin, ctx)).rejects.toThrow();
      expect((await readCompetitorRun(ctx.runId, admin)).record).toMatchObject({ status: "FAILED", result: null, outputHash: null, inputs: [] });
      await expect(replayCompetitorAnalysis(ctx.runId, admin)).rejects.toBeInstanceOf(CompetitorHistoryUnavailable);
      expect(await tx.analysisEngineRunInput.count({ where: { runId: ctx.runId } })).toBe(0);
    });
  });
  it("does not overwrite an existing run and atomically rejects duplicate nested input rows", async () => {
    await isolated(async (tx, admin) => {
      const { result, owner, ctx } = await historyFixture(tx, admin); const before = await counts(tx);
      const record = buildCompetitorRunRecord(result, { actor: { kind: "USER", id: owner.id }, createdAt: ctx.createdAt, access: {} });
      await expectedDatabaseFailure(tx, () => persistCompetitorRun(record, owner));
      expect(await counts(tx)).toEqual(before);
      const row = await tx.analysisEngineRun.findUniqueOrThrow({ where: { runId: result.runId }, include: { inputs: true } });
      const { inputs, ...data } = row;
      const input = inputs[0]!;
      const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
      const child = { inputId: input.inputId, kind: input.kind, completeness: input.completeness, roles: input.roles,
        governance: input.governance, refSystem: input.refSystem, refId: input.refId, refVersion: input.refVersion,
        checksum: input.checksum, snapshot: json(input.snapshot), provenance: json(input.provenance), usageIntent: json(input.usageIntent) };
      await expectedDatabaseFailure(tx, () => tx.analysisEngineRun.create({ data: {
        ...data, runId: `${row.runId}-atomic`, request: json(record.request), result: json(result),
        confidence: json(record.confidence), gaps: json(record.gaps), runtime: json(record.runtime),
        inputs: { create: [child, child] },
      } }));
      expect(await counts(tx)).toEqual(before);
    });
  });
  it.each(["AnalysisEngineRun", "AnalysisEngineRunInput"] as const)("retains database append-only protection for %s", async (table) => {
    await isolated(async (tx, admin) => {
      const { result } = await historyFixture(tx, admin);
      for (const operation of ["UPDATE", "DELETE"] as const) await expectedDatabaseFailure(tx, () =>
        tx.$executeRawUnsafe(operation === "UPDATE"
          ? `UPDATE "${table}" SET "runId" = "runId" WHERE "runId" = $1`
          : `DELETE FROM "${table}" WHERE "runId" = $1`, result.runId));
    });
  });
});
describe.skipIf(!enabled)("Competitor M2 real PostgreSQL / synthetic Data Center fixtures (always rolled back)", () => {
  it("uses exact published versions with real checksum verification, rights/provenance and no writes", async () => {
    await isolated(async (tx, actor) => {
      const { req, items } = await bundle(actor, 15); const before = await counts(tx); const start = performance.now();
      const result = await prepareCompetitorDataCenterInputs(req, actor, trusted());
      const elapsedMs = performance.now() - start;
      expect(result.status, JSON.stringify(result.sources.map((s) => [s.role, s.status, s.reason])) + result.validationReason).toBe("AVAILABLE");
      expect(result.inputs.map((input) => input.checksum?.value).sort()).toEqual(items.map((item) => item.version.checksum).sort());
      expect(result.rights.allowExport).toBe(false); expect(result.attribution[0]?.required).toBe(true);
      expect(result.matches).toHaveLength(15); expect(result.matches.every((match) => match.relationship === "DIRECT")).toBe(true);
      expect(assessCompetitorCount(result.evidence, result.request, result.coverage, "UNIQUE_COMPETITOR_ENTITIES", result.evaluatedAt).value).toBe(1);
      expect(assessCompetitorCount(result.evidence, result.request, result.coverage, "COMPETITOR_LOCATIONS", result.evaluatedAt).value).toBe(15);
      expect(await counts(tx)).toEqual(before);
      console.log(`COMPETITOR_M2_PG_PREPARATION=${JSON.stringify({ size: 15, sources: 4, elapsedMs, synthetic: true })}`);
    });
  });
    describe.skipIf(!enabled)("Competitor M3 PostgreSQL descriptive execution (synthetic data only)", () => {
      it("runs exact source validation before entity/location analytics, shares and hashes, with zero writes", async () => {
        await isolated(async (tx, actor) => {
          const { req } = await bundle(actor, 15); req.analyses = ["COUNTS", "DISTRIBUTION"];
          const context = execution(); const before = await counts(tx); const start = performance.now();
          const result = await runCompetitorDataCenterAnalysis(req, actor, context);
          const elapsedMs = performance.now() - start;
          const metrics = result.results.flatMap((section) => section.metrics);
          expect(metrics.find((metric) => metric.operation === "COUNT" && metric.countingUnit === "UNIQUE_COMPETITOR_ENTITIES")?.value).toBe(1);
          expect(metrics.find((metric) => metric.operation === "COUNT" && metric.countingUnit === "COMPETITOR_LOCATIONS")?.value).toBe(15);
          expect(metrics.find((metric) => metric.distribution)?.distribution).toEqual({ denominator: 15, share: 1, population: "SCOPED_COMPETITOR_LOCATIONS" });
          expect(() => assertCompetitorAnalyticsResult(result)).not.toThrow();
          const second = await runCompetitorDataCenterAnalysis(req, actor, { ...context, runId: `competitor:repeat-${randomUUID()}` });
          expect(second.determinism).toEqual(result.determinism); expect(await counts(tx)).toEqual(before);
          console.log(`COMPETITOR_M3_PG_ANALYTICS=${JSON.stringify({ elapsedMs, locations: 15, sources: 4, synthetic: true })}`);
        });
      });
      it("has identical missing/private metric outcomes without an existence leak", async () => {
        await isolated(async (tx, admin) => {
          const { req, items } = await bundle(admin);
          await tx.dataCenterSource.update({ where: { id: items[1]!.sourceId }, data: { scope: "PRIVATE" } });
          const user = await tx.user.create({ data: { email: `m3-private-${randomUUID()}@example.test`, status: "ACTIVE" } });
          const actor: DataCenterActor = { id: user.id, kind: "HUMAN", systemRole: "USER" };
          const context = execution();
          const hidden = await runCompetitorDataCenterAnalysis(req, actor, context);
          req.data.roles["competitor.locations"] = [{ versionId: "missing-competitor-m3" }];
          const missing = await runCompetitorDataCenterAnalysis(req, actor, context);
          expect(hidden.results).toEqual(missing.results);
          expect(hidden.preparation.current.evidence).toBeNull(); expect(missing.preparation.current.evidence).toBeNull();
        });
      });
      it("keeps uncovered and malformed exact PostgreSQL versions null without fallback or writes", async () => {
        await isolated(async (tx, actor) => {
          const { req, s } = await bundle(actor);
          const invalid = await dataset(actor, s.id, "competitor.locations", 1, { content: '{"inventedStrength":87}' });
          req.data.roles["competitor.locations"] = [{ versionId: invalid.version.id }];
          const before = await counts(tx); const result = await runCompetitorDataCenterAnalysis(req, actor, execution());
          expect(result.results.flatMap((section) => section.metrics).every((metric) => metric.value === null)).toBe(true);
          expect(await counts(tx)).toEqual(before);
        });
      });
      it("returns explicit conditional spatial gaps without Map or Spatial capabilities", async () => {
        await isolated(async (tx, actor) => {
          const { req } = await bundle(actor); req.analyses = ["PROXIMITY_DENSITY", "CANDIDATE_COMPARISON"];
          const before = await counts(tx); const result = await runCompetitorDataCenterAnalysis(req, actor, execution());
          expect(result.results.flatMap((section) => section.metrics)).toHaveLength(3);
          expect(result.results.flatMap((section) => section.metrics).every((metric) => metric.status === "NOT_COMPUTABLE" && metric.value === null)).toBe(true);
          expect(await counts(tx)).toEqual(before);
        });
      });
      it("computes comparable historical counts from eight exact published versions without storing or replaying a run", async () => {
        await isolated(async (tx, actor) => {
          const { req, s } = await bundle(actor, 15); req.analyses = ["COUNTS", "HISTORICAL_CHANGE"];
          const asOf = "2026-10-15T12:00:00.000Z"; req.parameters = { historical: { asOf, roles: {} } };
          for (const role of ["competitor.entities", "competitor.locations", "competitor.matching-rules", "competitor.dimensions"] as const) {
            const content = competitorDataset(role, 10); content.sourceId = s.id;
            if (content.role === "competitor.locations") content.inventory.scope.asOf = asOf;
            const item = await dataset(actor, s.id, role, 10, { content: JSON.stringify(content) });
            req.parameters.historical!.roles[role] = [{ versionId: item.version.id, expectedChecksum: item.version.checksum }];
          }
          const before = await counts(tx); const result = await runCompetitorDataCenterAnalysis(req, actor, execution());
          const changes = result.results.flatMap((section) => section.metrics).filter((metric) => metric.analysis === "HISTORICAL_CHANGE" && metric.countingUnit === "COMPETITOR_LOCATIONS");
          expect(Object.fromEntries(changes.map((metric) => [metric.operation, metric.value]))).toEqual({ ABSOLUTE_CHANGE: 5, PERCENT_CHANGE: 50, INDEX: 150 });
          expect(result.inputs).toHaveLength(8); expect(await counts(tx)).toEqual(before);
        });
      });
      it("compares compatible observed dimensions with exact definitions, units, sample missingness and no writes", async () => {
        await isolated(async (tx, actor) => {
          const { req, s } = await bundle(actor, 4); req.analyses = ["DIMENSION_COMPARISON"];
          const content = competitorDataset("competitor.attributes", 4); content.sourceId = s.id;
          if (content.role !== "competitor.attributes") throw new Error("Fixture role");
          const basis = {
            product: { id: "observed-seating", version: "1" }, quantityBasis: { id: "per-location", version: "1" },
            currency: null, taxBasis: { id: "not-applicable", version: "1" }, deliveryBasis: { id: "on-site", version: "1" },
            observationWindow: { start: "2026-10-01T00:00:00.000Z", end: competitorInstant },
          };
          content.rows[0]!.comparisonBasis = basis;
          const attributes = await dataset(actor, s.id, "competitor.attributes", 4, { content: JSON.stringify(content) });
          const dictionary = competitorDataset("competitor.dimensions", 4); dictionary.sourceId = s.id;
          if (dictionary.role !== "competitor.dimensions") throw new Error("Fixture role");
          dictionary.rows.push({ kind: "ATTRIBUTE", definition: content.rows[0]!.definition }, { kind: "UNIT", definition: content.rows[0]!.unit });
          const dimensions = await dataset(actor, s.id, "competitor.dimensions", 4, { content: JSON.stringify(dictionary) });
          req.data.roles["competitor.attributes"] = [{ versionId: attributes.version.id }];
          req.data.roles["competitor.dimensions"] = [{ versionId: dimensions.version.id }];
          req.parameters = { attributes: [{ id: "seating", subjectKind: "LOCATION", definition: content.rows[0]!.definition, unit: content.rows[0]!.unit, basis }] };
          const before = await counts(tx); const result = await runCompetitorDataCenterAnalysis(req, actor, execution());
          const median = result.results.flatMap((section) => section.metrics).find((metric) => metric.operation === "MEDIAN");
          expect(median).toMatchObject({ value: 10, status: "PARTIAL", sample: { eligible: 4, observed: 1, missing: 3 } });
          expect(await counts(tx)).toEqual(before);
        });
      });
    });
  it("uses Data Center deterministic type/asOf selection without registering runtime types", async () => {
    await isolated(async (_tx, actor) => {
      await bundle(actor); const req = competitorRequest(); req.data.roles = {};
      const ctx = trusted(); const first = await prepareCompetitorDataCenterInputs(req, actor, ctx); const second = await prepareCompetitorDataCenterInputs(req, actor, ctx);
      expect(first.status).toBe("AVAILABLE"); expect(second).toEqual(first);
      expect(first.sources.every((s) => s.selection?.policy === "dc-version-selection-v1")).toBe(true);
    });
  });
  it("keeps nonexistent and private exact versions indistinguishable without fallback", async () => {
    await isolated(async (tx, admin) => {
      const s = await source(admin, { scope: "PRIVATE" }); const item = await dataset(admin, s.id);
      const user = await tx.user.create({ data: { email: `competitor-reader-${randomUUID()}@example.test`, status: "ACTIVE" } });
      const actor: DataCenterActor = { id: user.id, kind: "HUMAN", systemRole: "USER" };
      const provider = createCompetitorDataCenterProvider(actor, trusted());
      const hidden = await provider.read({ versionId: item.version.id, expectedChecksum: item.version.checksum });
      const missing = await provider.read({ versionId: "missing-competitor-version", expectedChecksum: item.version.checksum });
      expect(hidden).toEqual(missing); expect(hidden).toEqual({ status: "NOT_AVAILABLE" });
      const hiddenDiscovery = await provider.discover({ versionIds: [item.version.id] });
      const missingDiscovery = await provider.discover({ versionIds: ["missing-competitor-version"] });
      expect(hiddenDiscovery.candidates).toEqual([]); expect(missingDiscovery.candidates).toEqual([]);
      expect(hiddenDiscovery.status).toBe(missingDiscovery.status);
    });
  });
  it("checks content checksum recomputation, not just a stored checksum string", async () => {
    await isolated(async (tx, actor) => {
      const { req, items } = await bundle(actor); const location = items[1]!;
      // Corruption injection is restricted to this rolled-back synthetic fixture transaction.
      await tx.$executeRawUnsafe('ALTER TABLE "DataCenterVersion" DISABLE TRIGGER "DataCenterVersion_immutable"');
      try { await tx.dataCenterVersion.update({ where: { id: location.version.id }, data: { content: '{"tampered":true}' } }); }
      finally { await tx.$executeRawUnsafe('ALTER TABLE "DataCenterVersion" ENABLE TRIGGER "DataCenterVersion_immutable"'); }
      const result = await prepareCompetitorDataCenterInputs(req, actor, trusted());
      expect(result).toMatchObject({ status: "NOT_COMPUTABLE", evidence: null });
      expect(result.sources.find((s) => s.role === "competitor.locations")?.reason).toBe("CHECKSUM_MISMATCH");
    });
  });
  it("rejects an incorrect expected checksum without substituting another version", async () => {
    await isolated(async (_tx, actor) => {
      const { req, items } = await bundle(actor); req.data.roles["competitor.locations"] = [{ versionId: items[1]!.version.id, expectedChecksum: "b".repeat(64) }];
      expect(await prepareCompetitorDataCenterInputs(req, actor, trusted())).toMatchObject({ status: "NOT_COMPUTABLE", evidence: null });
    });
  });
  it("superseded exact versions become unavailable; the new publication is never silently substituted", async () => {
    await isolated(async (_tx, actor) => {
      const { req, items, s } = await bundle(actor); const old = items[1]!;
      const content = competitorDataset("competitor.locations"); content.sourceId = s.id;
      await createDataCenterVersion({ itemId: old.id, title: "Synthetic replacement version", reason: "Synthetic no-fallback check", content: JSON.stringify(content), evidenceStatus: "VERIFIED",
        provenance: [{ kind: "DOCUMENT", reference: "fixture:updated", label: "Synthetic new version" }], sourcePublishedAt: "2026-10-01T00:00:00.000Z", coverage: { countryCodes: ["SA"], regionCodes: [] } }, actor);
      await publish(old.id, actor);
      const result = await prepareCompetitorDataCenterInputs(req, actor, trusted());
      expect(result).toMatchObject({ status: "NOT_AVAILABLE", evidence: null });
    });
  });
  it("rejects malformed content after valid publication instead of repairing it", async () => {
    await isolated(async (_tx, actor) => {
      const { req, s } = await bundle(actor); const invalid = await dataset(actor, s.id, "competitor.locations", 1, { content: '{"rows":[]}' });
      req.data.roles["competitor.locations"] = [{ versionId: invalid.version.id }];
      expect(await prepareCompetitorDataCenterInputs(req, actor, trusted())).toMatchObject({ status: "NOT_COMPUTABLE", evidence: null });
    });
  });
  it("withdrawn retrieval rights block an otherwise exact published version", async () => {
    await isolated(async (tx, actor) => {
      const { req, s } = await bundle(actor);
      await tx.dataCenterSource.update({ where: { id: s.id }, data: { allowRetrieval: false } });
      expect(await prepareCompetitorDataCenterInputs(req, actor, trusted())).toMatchObject({ status: "NOT_AVAILABLE", evidence: null });
    });
  });
  it("organization context cannot read another organization's version", async () => {
    await isolated(async (_tx, actor) => {
      const s = await source(actor); const item = await dataset(actor, s.id);
      const result = await createCompetitorDataCenterProvider(actor, { ...trusted(), organizationId: "other-organization" }).read({ versionId: item.version.id, expectedChecksum: item.version.checksum });
      expect(result).toEqual({ status: "NOT_AVAILABLE" });
    });
  });
  it("robot grants are enforced and rechecked after revocation", async () => {
    await isolated(async (tx, actor) => {
      const s = await source(actor); const item = await dataset(actor, s.id);
      const robot = await tx.robot.create({ data: { slug: `competitor-m2-${randomUUID()}`, name: "Synthetic Competitor robot" } });
      const mission = await tx.mission.create({ data: { name: "Synthetic Competitor study", assignedRobots: { connect: { id: robot.id } } } });
      const user = await tx.user.create({ data: { email: `competitor-robot-${randomUUID()}@example.test`, status: "ACTIVE" } });
      const robotActor: DataCenterActor = { id: user.id, kind: "AI", systemRole: "USER", robotId: robot.id, roleKey: "analyst", specialty: "competitor", missionId: mission.id };
      const provider = createCompetitorDataCenterProvider(robotActor, trusted());
      await expect(provider.read({ versionId: item.version.id, expectedChecksum: item.version.checksum })).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED" });
      const grant = await grantDataCenterRobotAccess({ robotId: robot.id, sourceId: s.id, principalId: user.id, roleKey: "analyst", specialty: "competitor",
        missionId: mission.id, access: "READ", reason: "Synthetic M2 verification", expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() }, actor);
      expect(await provider.read({ versionId: item.version.id, expectedChecksum: item.version.checksum })).toMatchObject({ status: "AVAILABLE" });
      await revokeDataCenterRobotAccess({ grantId: grant.id, reason: "Synthetic revocation" }, actor);
      await expect(provider.read({ versionId: item.version.id, expectedChecksum: item.version.checksum })).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED" });
    });
  });
});
