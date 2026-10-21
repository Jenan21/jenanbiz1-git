import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { DbExecutor } from "@/lib/db";

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
import { createDataCenterItem, createDataCenterSource, createDataCenterVersion, registerDataCenterType, reviewDataCenterItem, transitionDataCenterItem } from "@/services/data-center/service";
import { grantDataCenterRobotAccess, revokeDataCenterRobotAccess } from "@/services/data-center/robot-grants";
import { recordDataCenterQualityAssessment } from "@/services/data-center/quality";
import { type DataCenterActor, DataCenterError } from "@/services/data-center/contracts";
import { createMarketDataCenterProvider, prepareMarketDataCenterInputs, runMarketDataCenterAnalysis } from "@/services/analysis-engines/market-demand/adapters/data-center-provider";
import { proposedMarketTypeKeys, type MarketDataset, type MarketDatasetRole } from "@/services/analysis-engines/market-demand";
import { marketDataset } from "../unit/support/market-data-fixtures";
import { marketRequest } from "../unit/support/market-demand-fixtures";
import { runMarketAnalysisPersisted } from "@/services/analysis-engines/market-demand/adapters/run-service";
import { persistMarketRun, readMarketRun } from "@/services/analysis-engines/market-demand/adapters/run-persistence";
import { replayMarketAnalysis } from "@/services/analysis-engines/market-demand/adapters/replay-service";
import { MarketHistoryMismatch, MarketHistoryUnavailable } from "@/services/analysis-engines/market-demand/adapters/historical-data-center";
import { buildMarketRunRecord } from "@/services/analysis-engines/market-demand/run-history";

const enabled = process.env.DATA_CENTER_DATABASE_TESTS === "1";
const rollback = new Error("ROLLBACK_MARKET_M2_TEST_FIXTURES");
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const trustedContext = () => ({ evaluatedAt: new Date().toISOString() });
async function isolated(run: (tx: DbExecutor, actor: DataCenterActor) => Promise<void>) {
  const actual = context.actual as typeof db;
  await expect(actual.$transaction(async (tx) => {
    context.tx = tx;
    try {
      const admin = await tx.user.create({ data: { email: `market-m2-${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
      const actor: DataCenterActor = { id: admin.id, systemRole: "ADMIN", kind: "HUMAN" };
      // Proposed types exist only in this disposable database's rolled-back fixture transaction, never in the frozen production registry.
      for (const key of proposedMarketTypeKeys) if (!await tx.dataCenterType.findUnique({ where: { key } })) {
        await registerDataCenterType({ key, label: "Synthetic Market integration fixture", layer: "DATA", requiresIndependentReview: false }, actor);
      }
      await run(tx, actor);
      throw rollback;
    } finally { context.tx = null; }
  }, { timeout: 90_000 })).rejects.toBe(rollback);
}
const source = (actor: DataCenterActor, extra: Partial<Parameters<typeof createDataCenterSource>[0]> = {}) => createDataCenterSource({
  name: `Synthetic Market source ${randomUUID()}`, kind: "OFFICIAL", scope: "PLATFORM", owner: "Synthetic test authority",
  license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", ownership: "THIRD_PARTY", allowExport: false,
  freshnessDays: 365, usagePolicy: "No redistribution without credit", attribution: "Synthetic Market fixture credit", attributionRequired: true, ...extra,
}, actor);
async function publish(itemId: string, actor: DataCenterActor) {
  await transitionDataCenterItem({ itemId, status: "IN_REVIEW", reason: "Synthetic review submission" }, actor);
  await reviewDataCenterItem({ itemId, decision: "APPROVED", notes: "Synthetic fixture review, not actual market data" }, actor);
  await transitionDataCenterItem({ itemId, status: "APPROVED", reason: "Synthetic approved" }, actor);
  await transitionDataCenterItem({ itemId, status: "PUBLISHED", reason: "Synthetic governed integration test" }, actor);
}
async function dataset(actor: DataCenterActor, sourceId: string, extra: Partial<Parameters<typeof createDataCenterItem>[0]> = {}) {
  const item = await createDataCenterItem({
    sourceId, title: "Synthetic Market M2 fixture, not real demand", typeKey: "market-demand-observations", layer: "DATA",
    content: JSON.stringify(marketDataset()), evidenceStatus: "VERIFIED", sourcePublishedAt: ago(30),
    provenance: [{ kind: "DOCUMENT", reference: "fixture:market-m2", label: "Synthetic evidence, not production" }],
    coverage: { countryCodes: ["SA"], regionCodes: [] }, ...extra,
  }, actor);
  await publish(item.id, actor);
  return item;
}
async function withDictionary(actor: DataCenterActor, sourceId: string) {
  return dataset(actor, sourceId, { typeKey: "market-dimensions", content: JSON.stringify(marketDataset("dimensions.dictionary")) });
}
const demand = (result: Awaited<ReturnType<typeof prepareMarketDataCenterInputs>>) => result.sources.find((entry) => entry.role === "demand.observations")!;
const pinRequest = (versionId: string, checksum?: string) => marketRequest({ data: { roles: { "demand.observations": [{ source: "DATA_CENTER", versionId, ...(checksum ? { expectedChecksum: checksum } : {}) }] } } });
const counts = async (tx: DbExecutor) => ({
  sources: await tx.dataCenterSource.count(), items: await tx.dataCenterItem.count(), versions: await tx.dataCenterVersion.count(),
  types: await tx.dataCenterType.count(), usages: await tx.dataCenterUsage.count(), audits: await tx.auditLog.count(), events: await tx.dataCenterEvent.count(),
  inputs: await tx.analysisEngineRunInput.count(), runs: await tx.analysisEngineRun.count(),
});

const historyContext = () => {
  const instant = new Date().toISOString();
  return { evaluatedAt: instant, runId: `market-m4-${randomUUID()}`, environment: "test" as const, createdAt: instant,
    timing: { startedAt: instant, finishedAt: instant, durationMs: 0 } };
};
async function marketHistoryFixture(tx: DbExecutor, admin: DataCenterActor) {
  const s = await source(admin); const item = await dataset(admin, s.id); await withDictionary(admin, s.id);
  const user = await tx.user.create({ data: { email: `m4-owner-${randomUUID()}@example.test`, status: "ACTIVE" } });
  const owner: DataCenterActor = { id: user.id, kind: "HUMAN", systemRole: "USER" };
  const request = pinRequest(item.version.id, item.version.checksum);
  const runContext = historyContext();
  const result = await runMarketAnalysisPersisted(request, owner, runContext);
  return { s, item, owner, request, runContext, result };
}
async function mutableHistory(tx: DbExecutor, table: "AnalysisEngineRun" | "AnalysisEngineRunInput", work: () => Promise<unknown>) {
  await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${table}_append_only"`);
  try { await work(); } finally { await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER "${table}_append_only"`); }
}
async function expectedDatabaseFailure(tx: DbExecutor, work: () => Promise<unknown>) {
  await tx.$executeRawUnsafe("SAVEPOINT market_m4_expected_failure");
  await expect(work()).rejects.toThrow();
  await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT market_m4_expected_failure");
  await tx.$executeRawUnsafe("RELEASE SAVEPOINT market_m4_expected_failure");
}
describe.skipIf(!enabled)("Market M4 existing shared persistence and exact replay (synthetic PostgreSQL fixtures)", () => {
  it("commits a run durably and reloads/replays it in a separate real transaction, not only the fixture transaction proxy", async () => {
    const actual = context.actual as typeof db;
    const user = await actual.user.create({ data: { email: `m4-durability-${randomUUID()}@example.test`, status: "ACTIVE" } });
    const actor: DataCenterActor = { id: user.id, kind: "HUMAN", systemRole: "USER" };
    const runContext = historyContext();
    try {
      const missing = () => ({ source: "DATA_CENTER" as const, versionId: `absent-${randomUUID()}` });
      const request = marketRequest({ data: { roles: { "demand.observations": [missing()], "dimensions.dictionary": [missing()] } } });
      const result = await runMarketAnalysisPersisted(request, actor, runContext);
      expect(context.tx).toBeNull();
      expect(result.inputs).toEqual([]);
      const committed = await actual.$transaction(async (tx) => tx.analysisEngineRun.findUniqueOrThrow({ where: { runId: runContext.runId } }));
      expect(committed.outputHash).toBe(result.determinism.outputHash);
      expect(await replayMarketAnalysis(result.runId, actor)).toEqual(result);
    } finally {
      // Remove only this test's committed record/user; production code never disables append-only guards.
      await actual.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('ALTER TABLE "AnalysisEngineRun" DISABLE TRIGGER "AnalysisEngineRun_append_only"');
        await tx.analysisEngineRun.deleteMany({ where: { runId: runContext.runId, actorId: user.id } });
        await tx.$executeRawUnsafe('ALTER TABLE "AnalysisEngineRun" ENABLE TRIGGER "AnalysisEngineRun_append_only"');
        await tx.user.delete({ where: { id: user.id } });
      });
    }
  });
  it("atomically saves the full result and exact version/rights/provenance/usage evidence only to shared run/input tables", async () => {
    await isolated(async (tx, admin) => {
      const before = await counts(tx);
      const { result, owner, runContext } = await marketHistoryFixture(tx, admin);
      const after = await counts(tx);
      expect(after.runs - before.runs).toBe(1);
      expect(after.inputs - before.inputs).toBe(result.inputs.length);
      const rows = await tx.analysisEngineRunInput.findMany({ where: { runId: result.runId } });
      for (const row of rows) {
        const input = result.inputs.find((entry) => entry.id === row.inputId)!;
        expect(row).toMatchObject({ refId: input.ref.id, dataCenterVersionId: input.ref.id, contentHash: input.checksum!.value,
          provenance: { contract: "jenan.market-demand.input-provenance/v1" }, usageIntent: { contract: "jenan.market-demand.input-usage/v1", versionId: input.ref.id } });
      }
      expect((await readMarketRun(result.runId, owner)).result).toEqual(result);
      const baseline = await counts(tx);
      await persistMarketRun(buildMarketRunRecord({ ...result, runId: `${result.runId}-copy` }, {
        actor: { kind: "USER", id: owner.id }, access: {}, createdAt: runContext.createdAt,
      }), owner);
      expect(await counts(tx)).toEqual({ ...baseline, runs: baseline.runs + 1, inputs: baseline.inputs + result.inputs.length });
    });
  });
  it("replays with identical full result/hashes and no run/input/Data Center/usage writes", async () => {
    await isolated(async (tx, admin) => {
      const { result, owner } = await marketHistoryFixture(tx, admin); const before = await counts(tx);
      const start = performance.now();
      expect(await replayMarketAnalysis(result.runId, owner)).toEqual(result);
      console.log(`MARKET_M4_POSTGRES_EXACT_REPLAY_MS=${(performance.now() - start).toFixed(2)}`);
      expect(await counts(tx)).toEqual(before);
      expect(await replayMarketAnalysis(result.runId, admin)).toEqual(result);
    });
  });
  it("reconstructs canonical input order independently of database collation or row return order", async () => {
    await isolated(async (tx, admin) => {
      const { result, owner } = await marketHistoryFixture(tx, admin);
      const row = await tx.analysisEngineRun.findUniqueOrThrow({ where: { runId: result.runId }, include: { inputs: { orderBy: { inputId: "asc" } } } });
      expect(row.inputs.length).toBeGreaterThan(1);
      const reversed = { ...row, inputs: [...row.inputs].reverse() };
      const lookup = vi.spyOn(tx.analysisEngineRun, "findFirst").mockResolvedValueOnce(reversed);
      try { expect((await readMarketRun(result.runId, owner)).result).toEqual(result); }
      finally { lookup.mockRestore(); }
    });
  });
  it("retains exact by-type discovery decisions after a newer version is published, without rediscovery", async () => {
    await isolated(async (tx, admin) => {
      const { item, owner } = await marketHistoryFixture(tx, admin);
      const original = await runMarketAnalysisPersisted(marketRequest(), owner, historyContext());
      await createDataCenterVersion({ itemId: item.id, title: "Newer synthetic version", content: JSON.stringify(marketDataset()), evidenceStatus: "VERIFIED",
        provenance: [{ kind: "DOCUMENT", reference: "fixture:m4-later", label: "Later synthetic fixture" }], sourcePublishedAt: ago(1), reason: "Synthetic newer publication" }, admin);
      await publish(item.id, admin);
      const published = await tx.dataCenterItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(published.publishedVersion).toBe(2);
      expect(await replayMarketAnalysis(original.runId, owner)).toEqual(original);
    });
  });
  it("does not rewrite historical confidence, quality or freshness when later quality arrives", async () => {
    await isolated(async (tx, admin) => {
      const { result, owner, item, s } = await marketHistoryFixture(tx, admin);
      await recordDataCenterQualityAssessment({ versionId: item.version.id, status: "MEASURED", measuredAt: new Date().toISOString(),
        method: "later-synthetic-measurement", methodVersion: "1", score: 0.1, explanation: "Later synthetic metadata" }, admin);
      await tx.dataCenterSource.update({ where: { id: s.id }, data: { freshnessDays: 1 } });
      expect(await replayMarketAnalysis(result.runId, owner)).toEqual(result);
    });
  });
  it("keeps originally missing pins/gaps even if matching data become available later", async () => {
    await isolated(async (tx, admin) => {
      const { owner, s } = await marketHistoryFixture(tx, admin);
      const missing = await runMarketAnalysisPersisted(pinRequest("missing-exact-version"), owner, historyContext());
      await dataset(admin, s.id);
      expect(await replayMarketAnalysis(missing.runId, owner)).toEqual(missing);
      expect(missing.outcomes.every((outcome) => outcome.value === null)).toBe(true);
    });
  });
  it("hides a foreign run identically to a missing run, while the platform administrator remains authorized", async () => {
    await isolated(async (tx, admin) => {
      const { result } = await marketHistoryFixture(tx, admin);
      const user = await tx.user.create({ data: { email: `foreign-${randomUUID()}@example.test` } });
      const foreign: DataCenterActor = { id: user.id, kind: "HUMAN", systemRole: "USER" };
      for (const id of [result.runId, "not-an-existing-run"]) {
        await expect(replayMarketAnalysis(id, foreign)).rejects.toEqual(new MarketHistoryUnavailable());
      }
      expect(await replayMarketAnalysis(result.runId, admin)).toEqual(result);
    });
  });
  it.each([
    ["retrieval revoked", { allowRetrieval: false }],
    ["private scope", { scope: "PRIVATE" as const }],
    ["license", { license: "Changed license" }],
    ["license class", { licenseClass: "RESTRICTED" as const }],
    ["usage policy", { usagePolicy: "Changed usage restrictions" }],
    ["export policy", { allowExport: true }],
    ["attribution text", { attribution: "Changed credit" }],
    ["required attribution", { attributionRequired: false }],
    ["owner", { owner: "Changed owner" }],
    ["ownership", { ownership: "PLATFORM_OWNED" as const }],
  ])("blocks historical result/lookup rather than widen access after current %s changes", async (_label, changes) => {
    await isolated(async (tx, admin) => {
      const { result, owner, s } = await marketHistoryFixture(tx, admin);
      await tx.dataCenterSource.update({ where: { id: s.id }, data: changes });
      const before = await counts(tx);
      await expect(replayMarketAnalysis(result.runId, owner)).rejects.toBeInstanceOf(MarketHistoryUnavailable);
      await expect(readMarketRun(result.runId, owner)).rejects.toBeInstanceOf(MarketHistoryUnavailable);
      expect(await counts(tx)).toEqual(before);
    });
  });
  it("blocks an archived historical item rather than reading another eligible dataset", async () => {
    await isolated(async (tx, admin) => {
      const { item, result, owner, s } = await marketHistoryFixture(tx, admin);
      await dataset(admin, s.id);
      await transitionDataCenterItem({ itemId: item.id, status: "ARCHIVED", reason: "Synthetic archival" }, admin);
      await expect(replayMarketAnalysis(result.runId, owner)).rejects.toBeInstanceOf(MarketHistoryUnavailable);
    });
  });
  it("detects altered immutable content even when another current dataset is available", async () => {
    await isolated(async (tx, admin) => {
      const { result, owner, item, s } = await marketHistoryFixture(tx, admin); await dataset(admin, s.id);
      await mutableVersion(tx, () => tx.dataCenterVersion.update({ where: { id: item.version.id }, data: { content: "{}" } }));
      await expect(replayMarketAnalysis(result.runId, owner)).rejects.toMatchObject({ reason: "VERSION_CHECKSUM" });
    });
  });
  it("requires the captured organization/specialty/mission authorization context at replay", async () => {
    await isolated(async (tx, admin) => {
      const s = await source(admin);
      const item = await dataset(admin, s.id, { specialties: ["market"], missionContexts: ["study"] });
      await dataset(admin, s.id, { typeKey: "market-dimensions", content: JSON.stringify(marketDataset("dimensions.dictionary")), specialties: ["market"], missionContexts: ["study"] });
      const result = await runMarketAnalysisPersisted(pinRequest(item.version.id), admin, { ...historyContext(), specialty: "market", missionContext: "study" });
      expect(await replayMarketAnalysis(result.runId, admin)).toEqual(result);
      await mutableHistory(tx, "AnalysisEngineRun", () => tx.analysisEngineRun.update({ where: { runId: result.runId },
        data: { runtime: { contract: "jenan.market-demand.run-history/v1", replayAuthorizationContext: {} } } }));
      await expect(replayMarketAnalysis(result.runId, admin)).rejects.toBeInstanceOf(MarketHistoryUnavailable);
    });
  });
  it("rechecks live organization membership instead of trusting the stored owner's old membership", async () => {
    await isolated(async (tx, admin) => {
      const { owner, s, request } = await marketHistoryFixture(tx, admin);
      const organization = await tx.organization.create({ data: { name: "M4 synthetic organization", slug: `m4-${randomUUID()}` } });
      const member = await tx.organizationMember.create({ data: { organizationId: organization.id, userId: owner.id, isOwner: true, status: "ACTIVE" } });
      await tx.dataCenterSource.update({ where: { id: s.id }, data: { scope: "ORGANIZATION", organizationId: organization.id } });
      const result = await runMarketAnalysisPersisted(request, owner, { ...historyContext(), organizationId: organization.id });
      expect(await replayMarketAnalysis(result.runId, owner)).toEqual(result);
      await tx.organizationMember.update({ where: { id: member.id }, data: { status: "SUSPENDED" } });
      await expect(replayMarketAnalysis(result.runId, owner)).rejects.toBeInstanceOf(MarketHistoryUnavailable);
    });
  });
  it("records robot identity from the trusted actor and rejects replay after its live grant is revoked", async () => {
    await isolated(async (tx, admin) => {
      const { s, request } = await marketHistoryFixture(tx, admin);
      const robot = await tx.robot.create({ data: { name: "Synthetic market analyst", slug: `m4-${randomUUID()}` } });
      const mission = await tx.mission.create({ data: { name: "Synthetic market study", assignedRobots: { connect: { id: robot.id } } } });
      const user = await tx.user.create({ data: { email: `m4-robot-${randomUUID()}@example.test`, status: "ACTIVE" } });
      const actor: DataCenterActor = { id: user.id, kind: "AI", systemRole: "USER", robotId: robot.id, roleKey: "analyst", specialty: "market", missionId: mission.id };
      const grant = await grantDataCenterRobotAccess({ sourceId: s.id, robotId: robot.id, principalId: user.id, roleKey: "analyst", specialty: "market",
        missionId: mission.id, access: "READ", reason: "Synthetic M4 test", expiresAt: new Date(Date.now() + 86_400_000).toISOString() }, admin);
      const result = await runMarketAnalysisPersisted(request, actor, historyContext());
      expect((await readMarketRun(result.runId, actor)).record.actor).toEqual({ kind: "ROBOT", id: user.id });
      expect(await replayMarketAnalysis(result.runId, actor)).toEqual(result);
      await revokeDataCenterRobotAccess({ grantId: grant.id, reason: "Synthetic revocation" }, admin);
      await expect(replayMarketAnalysis(result.runId, actor)).rejects.toBeInstanceOf(MarketHistoryUnavailable);
    });
  });
  it.each([
    ["provenance", { provenance: {} }], ["usage intent", { usageIntent: {} }],
    ["version id", { dataCenterVersionId: "wrong" }], ["source id", { dataCenterSourceId: "wrong" }],
    ["type key", { dataCenterTypeKey: "wrong" }], ["content hash", { contentHash: "0".repeat(64) }],
  ])("rejects tampered stored input %s", async (_label, changes) => {
    await isolated(async (tx, admin) => {
      const { result, owner } = await marketHistoryFixture(tx, admin);
      await mutableHistory(tx, "AnalysisEngineRunInput", () => tx.analysisEngineRunInput.updateMany({ where: { runId: result.runId }, data: changes }));
      await expect(replayMarketAnalysis(result.runId, owner)).rejects.toBeInstanceOf(MarketHistoryMismatch);
    });
  });
  it.each([
    ["request hash", { requestHash: "0".repeat(64) }], ["output hash", { outputHash: "0".repeat(64) }],
    ["engine version", { engineVersion: "1.0.0-future" }], ["request snapshot", { request: {} }],
  ])("rejects tampered stored run %s without silently upgrading historical arithmetic", async (_label, changes) => {
    await isolated(async (tx, admin) => {
      const { result, owner } = await marketHistoryFixture(tx, admin);
      await mutableHistory(tx, "AnalysisEngineRun", () => tx.analysisEngineRun.update({ where: { runId: result.runId }, data: changes }));
      await expect(replayMarketAnalysis(result.runId, owner)).rejects.toThrow();
    });
  });
  it.each(["AnalysisEngineRun", "AnalysisEngineRunInput"] as const)("keeps %s append-only against update and delete", async (table) => {
    await isolated(async (tx, admin) => {
      const { result } = await marketHistoryFixture(tx, admin); const before = await counts(tx);
      await expectedDatabaseFailure(tx, () => tx.$executeRawUnsafe(`UPDATE "${table}" SET "runId" = "runId" WHERE "runId" = $1`, result.runId));
      await expectedDatabaseFailure(tx, () => tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "runId" = $1`, result.runId));
      expect(await counts(tx)).toEqual(before);
    });
  });
  it("does not create orphan/duplicate input rows on a duplicate run failure", async () => {
    await isolated(async (tx, admin) => {
      const { result, owner, request, runContext } = await marketHistoryFixture(tx, admin); const before = await counts(tx);
      await expectedDatabaseFailure(tx, () => runMarketAnalysisPersisted(request, owner, runContext));
      expect(await counts(tx)).toEqual(before);
      expect((await readMarketRun(result.runId, owner)).result).toEqual(result);
    });
  });
  it("refuses an unsaved result if source permission is revoked after calculation but before persistence", async () => {
    await isolated(async (tx, admin) => {
      const { result, owner, s, runContext } = await marketHistoryFixture(tx, admin);
      const record = buildMarketRunRecord({ ...result, runId: `${result.runId}-revoked` }, { actor: { kind: "USER", id: owner.id }, access: {}, createdAt: runContext.createdAt });
      await tx.dataCenterSource.update({ where: { id: s.id }, data: { allowRetrieval: false } });
      const before = await counts(tx);
      await expect(persistMarketRun(record, owner)).rejects.toBeInstanceOf(MarketHistoryUnavailable);
      expect(await counts(tx)).toEqual(before);
    });
  });
  it("does not choose a replacement when the captured exact historical version is no longer readable", async () => {
    await isolated(async (tx, admin) => {
      const { result, owner, s } = await marketHistoryFixture(tx, admin); await dataset(admin, s.id);
      const lookup = vi.spyOn(tx.dataCenterVersion, "findFirst").mockResolvedValueOnce(null);
      try {
        await expect(replayMarketAnalysis(result.runId, owner)).rejects.toBeInstanceOf(MarketHistoryUnavailable);
        expect(lookup).toHaveBeenCalledOnce();
      } finally { lookup.mockRestore(); }
    });
  });
  it("can reproduce a historically valid version after its original measurement freshness/expiry passes", async () => {
    await isolated(async (_tx, admin) => {
      const s = await source(admin);
      const item = await dataset(admin, s.id, { expiresAt: new Date(Date.now() + 86_400_000).toISOString() }); await withDictionary(admin, s.id);
      const result = await runMarketAnalysisPersisted(pinRequest(item.version.id), admin, historyContext());
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        vi.setSystemTime(new Date(Date.now() + 10 * 86_400_000));
        expect(await replayMarketAnalysis(result.runId, admin)).toEqual(result);
      } finally { vi.useRealTimers(); }
    });
  });
  it("persists a failed contract evaluation explicitly with no fake result/inputs and does not replay it", async () => {
    await isolated(async (tx, admin) => {
      const runContext = historyContext(); const before = await counts(tx);
      await expect(runMarketAnalysisPersisted({ contract: "invalid" }, admin, runContext)).rejects.toThrow();
      const row = await tx.analysisEngineRun.findUniqueOrThrow({ where: { runId: runContext.runId } });
      expect(row).toMatchObject({ status: "FAILED", result: null, inputsHash: null, outputHash: null, confidence: null, errorCode: "INVALID_INPUT" });
      expect(await counts(tx)).toEqual({ ...before, runs: before.runs + 1 });
      await expect(replayMarketAnalysis(runContext.runId, admin)).rejects.toBeInstanceOf(MarketHistoryUnavailable);
    });
  });
  it("rejects a forged persistence actor before any shared table write", async () => {
    await isolated(async (tx, admin) => {
      const { result, owner, runContext } = await marketHistoryFixture(tx, admin);
      const before = await counts(tx);
      const record = buildMarketRunRecord(result, { actor: { kind: "USER", id: owner.id }, access: {}, createdAt: runContext.createdAt });
      await expect(persistMarketRun(record, admin)).rejects.toBeInstanceOf(MarketHistoryUnavailable);
      expect(await counts(tx)).toEqual(before);
    });
  });
});
async function mutableVersion(tx: DbExecutor, work: () => Promise<unknown>) {
  await tx.$executeRawUnsafe('ALTER TABLE "DataCenterVersion" DISABLE TRIGGER "DataCenterVersion_immutable"');
  try { await work(); } finally { await tx.$executeRawUnsafe('ALTER TABLE "DataCenterVersion" ENABLE TRIGGER "DataCenterVersion_immutable"'); }
}
afterAll(async () => { if (enabled) await (context.actual as typeof db).$disconnect(); });

describe.skipIf(!enabled)("Market M2 real PostgreSQL governed integration (synthetic data, always rolled back)", () => {
  it("M3 calculates from exact PostgreSQL versions without writing runs, inputs, usages or any Data Center row", async () => {
    await isolated(async (tx, admin) => {
      const s = await source(admin); const item = await dataset(admin, s.id); await withDictionary(admin, s.id);
      await recordDataCenterQualityAssessment({ versionId: item.version.id, status: "MEASURED", measuredAt: ago(1), method: "synthetic-contract-check", methodVersion: "1", score: 0.9, explanation: "Synthetic calculation integration evidence, not real demand acceptance" }, admin);
      const before = await counts(tx); const instant = trustedContext().evaluatedAt;
      const runContext = { evaluatedAt: instant, runId: "market-m3-postgres", environment: "test" as const,
        timing: { startedAt: instant, finishedAt: instant, durationMs: 0 } };
      const started = performance.now();
      const first = await runMarketDataCenterAnalysis(pinRequest(item.version.id, item.version.checksum), admin, runContext);
      const durationMs = performance.now() - started;
      expect(first.outcomes.map((outcome) => outcome.value).sort((a, b) => a! - b!)).toEqual([80, 100]);
      expect(first.outcomes.every((outcome) => outcome.resultClass === "OBSERVED")).toBe(true);
      expect(first.rights.allowExport).toBe(false);
      expect(first.sourceEvidence.find((entry) => entry.role === "demand.observations")?.reference?.version.checksum.value).toBe(item.version.checksum);
      const second = await runMarketDataCenterAnalysis(pinRequest(item.version.id, item.version.checksum), admin, { ...runContext, runId: "market-m3-second-run" });
      expect(second.determinism).toEqual(first.determinism);
      expect(await counts(tx)).toEqual(before);
      console.log(`MARKET_M3_POSTGRES_EXACT_CALCULATION_MS=${durationMs.toFixed(2)}`);
    });
  });
  it("M3 missing and inaccessible PostgreSQL source pins have identical public metric outcomes", async () => {
    await isolated(async (tx, admin) => {
      const s = await source(admin, { scope: "PRIVATE" }); const item = await dataset(admin, s.id);
      const user = await tx.user.create({ data: { email: `m3-${randomUUID()}@example.test`, status: "ACTIVE" } });
      const actor: DataCenterActor = { id: user.id, kind: "HUMAN", systemRole: "USER" };
      const instant = trustedContext().evaluatedAt;
      const runContext = { evaluatedAt: instant, runId: "market-m3-access", environment: "test" as const,
        timing: { startedAt: instant, finishedAt: instant, durationMs: 0 } };
      const before = await counts(tx);
      const inaccessible = await runMarketDataCenterAnalysis(pinRequest(item.version.id), actor, runContext);
      const missing = await runMarketDataCenterAnalysis(pinRequest("unavailable-pin"), actor, runContext);
      expect(inaccessible.outcomes).toEqual(missing.outcomes);
      expect(inaccessible.inputs).toEqual([]); expect(missing.inputs).toEqual([]);
      expect(await counts(tx)).toEqual(before);
    });
  });
  it("reads an exact non-GeoJSON dataset and dictionary, verifies their stored checksums, and performs zero writes", async () => {
    await isolated(async (tx, admin) => {
      const s = await source(admin);
      const item = await dataset(admin, s.id);
      await withDictionary(admin, s.id);
      const before = await counts(tx);
      const started = performance.now();
      const result = await prepareMarketDataCenterInputs(pinRequest(item.version.id, item.version.checksum), admin, trustedContext());
      const durationMs = performance.now() - started;
      expect(demand(result).status).toBe("AVAILABLE");
      expect(demand(result).matches.map((match) => match.status)).toEqual(["AVAILABLE", "AVAILABLE"]);
      expect(demand(result).input!.checksum!.value).toBe(item.version.checksum);
      expect(demand(result).observations[0]!.ref.inputId).toBe(`dc:${item.version.id}`);
      expect(result.rights.allowExport).toBe(false);
      expect(result.work).toEqual({ discoveries: 2, reads: 2, parsedRows: 3 });
      expect(await counts(tx)).toEqual(before);
      console.log(`MARKET_M2_POSTGRES_EXACT_PREPARATION_MS=${durationMs.toFixed(2)}`);
    });
  });
  it("uses Data Center's deterministic type/asOf policy and retains its exact trace", async () => {
    await isolated(async (_tx, admin) => {
      const s = await source(admin);
      const old = await dataset(admin, s.id, { sourcePublishedAt: ago(60) });
      const latest = await dataset(admin, s.id, { sourcePublishedAt: ago(10) });
      await withDictionary(admin, s.id);
      const request = marketRequest({ data: { roles: { "demand.observations": { source: "DATA_CENTER", typeKey: "market-demand-observations" } } } });
      const instant = trustedContext();
      const result = await prepareMarketDataCenterInputs(request, admin, instant);
      expect(demand(result).requestedVersionId).toBe(latest.version.id);
      expect(demand(result).selection).toMatchObject({ policy: "dc-version-selection-v1", asOf: instant.evaluatedAt, asOfExplicit: true });
      expect(demand(result).selection!.candidates.map((candidate) => candidate.reference.version.versionId)).toEqual([latest.version.id, old.version.id]);
      expect((await prepareMarketDataCenterInputs(request, admin, instant)).inputsHash).toBe(result.inputsHash);
    });
  });
  it("an exact pin does not fall back when an alternate published dataset exists", async () => {
    await isolated(async (_tx, admin) => {
      const s = await source(admin);
      await dataset(admin, s.id); await withDictionary(admin, s.id);
      expect(demand(await prepareMarketDataCenterInputs(pinRequest("missing-pin"), admin, trustedContext())).status).toBe("NOT_AVAILABLE");
    });
  });
  it("a malformed preferred by-type dataset does not fall back to a valid older dataset", async () => {
    await isolated(async (_tx, admin) => {
      const s = await source(admin);
      await dataset(admin, s.id, { sourcePublishedAt: ago(60) });
      const broken = await dataset(admin, s.id, { content: "{", sourcePublishedAt: ago(10) });
      const result = await prepareMarketDataCenterInputs(marketRequest({ data: { roles: { "demand.observations": { source: "DATA_CENTER", typeKey: "market-demand-observations" } } } }), admin, trustedContext());
      expect(demand(result).requestedVersionId).toBe(broken.version.id);
      expect(demand(result).gaps[0]!.code).toBe("MARKET_DATASET_INVALID");
    });
  });
  it("wrong type is rejected even when the title resembles demand", async () => {
    await isolated(async (_tx, admin) => {
      const s = await source(admin);
      const wrong = await dataset(admin, s.id, { typeKey: "dataset" });
      expect(demand(await prepareMarketDataCenterInputs(pinRequest(wrong.version.id), admin, trustedContext())).gaps[0]!.code).toBe("MARKET_SOURCE_TYPE_INVALID");
    });
  });
  it("enforces the expected checksum and reports actual stored-content tampering", async () => {
    await isolated(async (tx, admin) => {
      const s = await source(admin); const item = await dataset(admin, s.id);
      const provider = createMarketDataCenterProvider(admin, trustedContext());
      expect(await provider.read({ versionId: item.version.id, expectedChecksum: "0".repeat(64) })).toEqual({ status: "INTEGRITY_ERROR" });
      await mutableVersion(tx, () => tx.$executeRaw`UPDATE "DataCenterVersion" SET "content" = 'corrupted' WHERE "id" = ${item.version.id}`);
      expect(await provider.read({ versionId: item.version.id, expectedChecksum: item.version.checksum })).toEqual({ status: "INTEGRITY_ERROR" });
    });
  });
  it("unauthorized private data and missing data have exactly the same external read result", async () => {
    await isolated(async (tx, admin) => {
      const s = await source(admin, { scope: "PRIVATE" }); const item = await dataset(admin, s.id);
      const user = await tx.user.create({ data: { email: `${randomUUID()}@example.test`, status: "ACTIVE" } });
      const actor: DataCenterActor = { id: user.id, kind: "HUMAN", systemRole: "USER" };
      const provider = createMarketDataCenterProvider(actor, trustedContext());
      const secret = await provider.read({ versionId: item.version.id, expectedChecksum: item.version.checksum });
      const missing = await provider.read({ versionId: "nonexistent-version", expectedChecksum: item.version.checksum });
      expect(secret).toEqual({ status: "NOT_AVAILABLE" }); expect(secret).toEqual(missing);
      const selection = await provider.discover({ versionIds: [item.version.id, "nonexistent-version"] });
      expect(selection.candidates).toEqual([]);
      expect(selection.unavailableVersionIds).toEqual([item.version.id, "nonexistent-version"]);
      expect(await createMarketDataCenterProvider(admin, trustedContext()).read({ versionId: item.version.id, expectedChecksum: item.version.checksum })).toMatchObject({ status: "AVAILABLE" });
    });
  });
  it("robot actors without explicit mission/grant fail explicitly, not as a successful empty inventory", async () => {
    await isolated(async (_tx, admin) => {
      const actor: DataCenterActor = { id: admin.id, kind: "AI", systemRole: "ADMIN" };
      await expect(createMarketDataCenterProvider(actor, trustedContext()).discover({ typeKeys: ["market-demand-observations"] })).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED", status: 403 });
    });
  });
  it("read permission cannot be bypassed using a pinned version", async () => {
    await isolated(async (tx, admin) => {
      const s = await source(admin); const item = await dataset(admin, s.id, { requiredPermission: "market.m2.restricted" });
      const user = await tx.user.create({ data: { email: `${randomUUID()}@example.test`, status: "ACTIVE" } });
      const actor: DataCenterActor = { id: user.id, kind: "HUMAN", systemRole: "USER" };
      expect(demand(await prepareMarketDataCenterInputs(pinRequest(item.version.id), actor, trustedContext())).status).toBe("NOT_AVAILABLE");
    });
  });
  it("source retrieval disabling is respected on discovery and on exact read", async () => {
    await isolated(async (tx, admin) => {
      const s = await source(admin); const item = await dataset(admin, s.id);
      await tx.dataCenterSource.update({ where: { id: s.id }, data: { allowRetrieval: false } });
      const provider = createMarketDataCenterProvider(admin, trustedContext());
      expect((await provider.discover({ versionIds: [item.version.id] })).candidates).toEqual([]);
      expect(await provider.read({ versionId: item.version.id, expectedChecksum: item.version.checksum })).toEqual({ status: "NOT_AVAILABLE" });
    });
  });
  it("specialty and mission context are carried consistently to discovery and exact read", async () => {
    await isolated(async (_tx, admin) => {
      const s = await source(admin); const item = await dataset(admin, s.id, { specialties: ["market"], missionContexts: ["m2-acceptance"] });
      expect((await createMarketDataCenterProvider(admin, trustedContext()).discover({ versionIds: [item.version.id] })).candidates).toEqual([]);
      const provider = createMarketDataCenterProvider(admin, { ...trustedContext(), specialty: "market", missionContext: "m2-acceptance" });
      expect((await provider.discover({ versionIds: [item.version.id] })).candidates).toHaveLength(1);
      expect(await provider.read({ versionId: item.version.id, expectedChecksum: item.version.checksum })).toMatchObject({ status: "AVAILABLE" });
    });
  });
  it.each(["geography", "sector", "period"] as const)("structured %s coverage is checked after the exact read", async (dimension) => {
    await isolated(async (_tx, admin) => {
      const s = await source(admin); const item = await dataset(admin, s.id); await withDictionary(admin, s.id);
      const request = pinRequest(item.version.id);
      if (dimension === "geography") request.scope.geography.code = "outside";
      if (dimension === "sector") request.scope.sector.code = "outside";
      if (dimension === "period") {
        request.series[0]!.timeWindow.startDate = "2026-07-01";
        request.series[0]!.periods = [{ kind: "INTERVAL", id: "2026-07", startDate: "2026-07-01", endDate: "2026-08-01", frequency: "MONTHLY", calendar: "GREGORIAN", timeZone: "Asia/Riyadh" }];
      }
      const result = await prepareMarketDataCenterInputs(request, admin, trustedContext());
      expect(demand(result).status).toBe("NO_COVERAGE");
      expect(demand(result).gaps.map((gap) => gap.code)).toContain("MARKET_NO_COVERAGE");
    });
  });
  it("retains measured quality, dates, ownership, license, usage and version-level attribution without broadening rights", async () => {
    await isolated(async (_tx, admin) => {
      const s = await source(admin, { licenseClass: "RESTRICTED", license: "Restricted test contract", allowExport: false });
      const item = await dataset(admin, s.id, { attribution: "Version-specific Market fixture credit" });
      await withDictionary(admin, s.id);
      await recordDataCenterQualityAssessment({ versionId: item.version.id, status: "MEASURED", score: 0.87, method: "Synthetic completeness audit", methodVersion: "1", measuredAt: ago(1), explanation: "Synthetic fixture quality evidence" }, admin);
      const result = await prepareMarketDataCenterInputs(pinRequest(item.version.id), admin, trustedContext());
      const reference = demand(result).reference!;
      expect(reference.quality).toMatchObject({ status: "MEASURED", score: 0.87 });
      expect(reference.ownership).toEqual({ ownership: "THIRD_PARTY", owner: "Synthetic test authority" });
      expect(reference.rights.attribution).toEqual({ text: "Version-specific Market fixture credit", required: true, level: "VERSION" });
      expect(reference.publication.publishedAt).not.toBeNull();
      expect(reference.freshness.sourcePublishedAt).not.toBeNull();
      expect(result.rights.allowExport).toBe(false);
      expect(result.rights.denials).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "LICENSE_CLASS_RESTRICTED" })]));
    });
  });
  it.each(["population_count", "business_count", "competitor_count", "poi_count"])("cannot publish %s content as engine-accepted OBSERVED demand", async (subject) => {
    await isolated(async (_tx, admin) => {
      const s = await source(admin);
      const content = JSON.parse(JSON.stringify(marketDataset()));
      content.rows[0].subject = subject;
      const item = await dataset(admin, s.id, { content: JSON.stringify(content) });
      expect(demand(await prepareMarketDataCenterInputs(pinRequest(item.version.id), admin, trustedContext())).gaps[0]!.code).toBe("MARKET_DATASET_INVALID");
    });
  });
  it("correctly typed contextual population remains CONTEXTUAL and is never routed to observations", async () => {
    await isolated(async (_tx, admin) => {
      const s = await source(admin);
      const content = marketDataset("context.indicators");
      if (content.role !== "context.indicators") throw new Error("Fixture role");
      const item = await dataset(admin, s.id, { typeKey: "market-context-indicators", content: JSON.stringify(content) });
      const dictionary = marketDataset("dimensions.dictionary");
      if (dictionary.role !== "dimensions.dictionary") throw new Error("Fixture role");
      const row = content.rows[0]!;
      dictionary.definitions = [{ metricDefinition: row.semantics.dimensions.metricDefinition, subject: row.subject, unit: row.semantics.unit, measureKind: row.semantics.measureKind, methodology: row.semantics.dimensions.methodology }];
      await dataset(admin, s.id, { typeKey: "market-dimensions", content: JSON.stringify(dictionary) });
      const request = marketRequest({
        analyses: ["MARKET_CONTEXT"], data: { roles: { "context.indicators": [{ source: "DATA_CENTER", versionId: item.version.id }] } },
        series: [{ ...marketRequest().series[0]!, unit: row.semantics.unit, periods: [row.semantics.time] }],
      });
      const result = await prepareMarketDataCenterInputs(request, admin, trustedContext());
      expect(result.sources.find((entry) => entry.role === "context.indicators")!.status).toBe("AVAILABLE");
      expect(result.sources.map((entry) => entry.role)).not.toContain("demand.observations");
    });
  });
  it("provider snapshots trusted actor/context and does not mutate source metadata", async () => {
    await isolated(async (_tx, admin) => {
      const actor = { ...admin }; const ctx = trustedContext();
      const provider = createMarketDataCenterProvider(actor, ctx);
      actor.kind = "AI"; ctx.evaluatedAt = "invalid";
      expect((await provider.discover({ typeKeys: ["market-demand-observations"] })).status).toBe("NOT_AVAILABLE");
    });
  });
  it("keeps organization context on direct exact reads, not only on discovery", async () => {
    await isolated(async (_tx, admin) => {
      const s = await source(admin); const item = await dataset(admin, s.id);
      const provider = createMarketDataCenterProvider(admin, { ...trustedContext(), organizationId: "unmatched-organization" });
      expect(await provider.read({ versionId: item.version.id, expectedChecksum: item.version.checksum })).toEqual({ status: "NOT_AVAILABLE" });
    });
  });
  it("keeps unexpected server authorization errors explicit", async () => {
    await isolated(async (_tx, admin) => {
      const fake = createMarketDataCenterProvider({ ...admin, kind: "AI" }, trustedContext());
      await expect(fake.read({ versionId: "hidden", expectedChecksum: "a".repeat(64) })).rejects.toBeInstanceOf(DataCenterError);
    });
  });
  it.each(["demand.assumptions", "dimensions.dictionary"] as MarketDatasetRole[])("can exact-read the %s contract without creating an engine datastore", async (role) => {
    await isolated(async (tx, admin) => {
      const s = await source(admin);
      const content: MarketDataset = marketDataset(role);
      const key = role === "demand.assumptions" ? "market-demand-assumptions" : "market-dimensions";
      const item = await dataset(admin, s.id, { typeKey: key, content: JSON.stringify(content) });
      const before = await counts(tx);
      expect(await createMarketDataCenterProvider(admin, trustedContext()).read({ versionId: item.version.id, expectedChecksum: item.version.checksum })).toMatchObject({ status: "AVAILABLE", contentKind: "OTHER" });
      expect(await counts(tx)).toEqual(before);
    });
  });
});
