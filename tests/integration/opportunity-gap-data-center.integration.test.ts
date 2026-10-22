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
import {
  createDataCenterItem, createDataCenterSource, createDataCenterVersion, registerDataCenterType, reviewDataCenterItem, transitionDataCenterItem,
} from "@/services/data-center/service";
import { grantDataCenterRobotAccess, revokeDataCenterRobotAccess } from "@/services/data-center/robot-grants";
import { analyzeOpportunityDataCenterInputs, createOpportunityDataCenterProvider, prepareOpportunityDataCenterInputs } from "@/services/analysis-engines/opportunity-gap/adapters/data-center-provider";
import { findOpportunityCalculationProblems, opportunitySignalRule, OpportunityHistoryUnavailable, type OpportunityDatasetRole, typeKeyByOpportunityRole } from "@/services/analysis-engines/opportunity-gap";
import { runOpportunityAnalysisPersisted } from "@/services/analysis-engines/opportunity-gap/adapters/run-service";
import { readOpportunityRun } from "@/services/analysis-engines/opportunity-gap/adapters/run-persistence";
import { replayOpportunityAnalysis } from "@/services/analysis-engines/opportunity-gap/adapters/replay-service";
import { opportunityDataset } from "../unit/support/opportunity-data-fixtures";
import { opportunityRequest } from "../unit/support/opportunity-gap-fixtures";

const enabled = process.env.DATA_CENTER_DATABASE_TESTS === "1";
const rollback = new Error("ROLLBACK_OPPORTUNITY_M2_SYNTHETIC_TEST_ONLY");
const trusted = () => ({ evaluatedAt: new Date(Math.max(Date.now(), Date.parse("2026-10-20T12:00:00.000Z"))).toISOString() });
async function isolated(run: (tx: DbExecutor, actor: DataCenterActor) => Promise<void>) {
  try {
    await (context.actual as typeof db).$transaction(async (tx) => {
      context.tx = tx;
      try {
        const admin = await tx.user.create({ data: { email: `opportunity-m2-${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
        const actor: DataCenterActor = { id: admin.id, systemRole: "ADMIN", kind: "HUMAN" };
        for (const key of Object.values(typeKeyByOpportunityRole)) if (!await tx.dataCenterType.findUnique({ where: { key } })) {
          await registerDataCenterType({ key, label: "Synthetic Opportunity test type", layer: "DATA", requiresIndependentReview: false }, actor);
        }
        await run(tx, actor); throw rollback;
      } finally { context.tx = null; }
    }, { timeout: 90_000, maxWait: 30_000 });
  } catch (error) { if (error !== rollback) throw error; }
}
const source = (actor: DataCenterActor, extra: Partial<Parameters<typeof createDataCenterSource>[0]> = {}) => createDataCenterSource({
  name: `Synthetic Opportunity ${randomUUID()}`, kind: "OFFICIAL", scope: "PLATFORM", owner: "Synthetic test authority",
  license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", ownership: "THIRD_PARTY", allowExport: false, freshnessDays: 365,
  usagePolicy: "Synthetic only; credit required", attribution: "Synthetic Opportunity fixture", attributionRequired: true, ...extra,
}, actor);
async function publish(itemId: string, actor: DataCenterActor) {
  await transitionDataCenterItem({ itemId, status: "IN_REVIEW", reason: "Synthetic submission" }, actor);
  await reviewDataCenterItem({ itemId, decision: "APPROVED", notes: "Synthetic fixture, not real opportunity data" }, actor);
  await transitionDataCenterItem({ itemId, status: "APPROVED", reason: "Synthetic approval" }, actor);
  await transitionDataCenterItem({ itemId, status: "PUBLISHED", reason: "Synthetic publication" }, actor);
}
async function dataset(actor: DataCenterActor, sourceId: string, role: OpportunityDatasetRole = "need.observations", extra: Partial<Parameters<typeof createDataCenterItem>[0]> = {}) {
  const content = opportunityDataset(role); content.sourceId = sourceId;
  const item = await createDataCenterItem({
    sourceId, title: "Synthetic Opportunity M2, not real-data acceptance", typeKey: typeKeyByOpportunityRole[role], layer: "DATA",
    content: JSON.stringify(content), evidenceStatus: "VERIFIED", sourcePublishedAt: "2026-10-01T00:00:00.000Z",
    provenance: [{ kind: "DOCUMENT", reference: "fixture:opportunity-m2", label: "Synthetic test evidence" }],
    coverage: { countryCodes: ["SA"], regionCodes: [] }, ...extra,
  }, actor);
  await publish(item.id, actor); return item;
}
async function fixture(actor: DataCenterActor) {
  const s = await source(actor); const req = opportunityRequest(); req.data.roles = [];
  const items = [];
  for (const role of ["need.observations", "supply.capacity"] as const) {
    const item = await dataset(actor, s.id, role); items.push(item);
    req.data.roles.push({ role, versionId: item.version.id, checksum: item.version.checksum });
  }
  return { s, req, items };
}
const counts = async (tx: DbExecutor) => ({
  sources: await tx.dataCenterSource.count(), types: await tx.dataCenterType.count(), items: await tx.dataCenterItem.count(),
  versions: await tx.dataCenterVersion.count(), audits: await tx.auditLog.count(), events: await tx.dataCenterEvent.count(),
  usage: await tx.dataCenterUsage.count(), runs: await tx.analysisEngineRun.count(), inputs: await tx.analysisEngineRunInput.count(),
});
const user = async (tx: DbExecutor): Promise<DataCenterActor> => {
  const row = await tx.user.create({ data: { email: `opportunity-reader-${randomUUID()}@example.test`, status: "ACTIVE" } });
  return { id: row.id, kind: "HUMAN", systemRole: "USER" };
};
function historyContext() {
  const { evaluatedAt } = trusted();
  return {
    runId: `opportunity-m4-${randomUUID()}`, evaluatedAt, createdAt: evaluatedAt, environment: "test" as const,
    timing: { startedAt: evaluatedAt, finishedAt: evaluatedAt, durationMs: 0 },
  };
}
describe.skipIf(!enabled)("Opportunity M4 persistence and exact replay, synthetic PostgreSQL evidence only", () => {
  it("commits Run/Input/Output and replays durably in a separate real transaction", async () => {
    const actual = context.actual as typeof db;
    const setup = await actual.$transaction(async (tx) => {
      context.tx = tx;
      try {
        const row = await tx.user.create({ data: { email: `m4-durable-${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
        const actor: DataCenterActor = { id: row.id, systemRole: "ADMIN", kind: "HUMAN" };
        for (const key of Object.values(typeKeyByOpportunityRole)) if (!await tx.dataCenterType.findUnique({ where: { key } })) {
          await registerDataCenterType({ key, label: "Synthetic Opportunity", layer: "DATA", requiresIndependentReview: false }, actor);
        }
        return { actor, ...await fixture(actor) };
      } finally { context.tx = null; }
    }, { timeout: 90_000 });
    const result = await runOpportunityAnalysisPersisted(setup.req, setup.actor, historyContext());
    const row = await actual.analysisEngineRun.findUniqueOrThrow({ where: { runId: result.runId }, include: { inputs: true } });
    expect(row.result).toEqual(result); expect(row.inputs).toHaveLength(2);
    expect(row.inputs.map((input) => input.dataCenterVersionId).sort()).toEqual(setup.req.data.roles.map((pin) => pin.versionId).sort());
    expect(row.inputs.every((input) => input.contentHash?.length === 64 && input.dataCenterSourceId === setup.s.id)).toBe(true);
    expect(await replayOpportunityAnalysis(result.runId, setup.actor)).toEqual(result);
  });
  it("saves exact hashes, provenance and rights and replays without writes", async () => {
    await isolated(async (tx, actor) => {
      const { req } = await fixture(actor); const before = await counts(tx);
      const result = await runOpportunityAnalysisPersisted(req, actor, historyContext());
      expect(await counts(tx)).toEqual({ ...before, runs: before.runs + 1, inputs: before.inputs + 2 });
      const stored = await readOpportunityRun(result.runId, actor);
      expect(stored.record.outputHash).toBe(result.determinism.outputHash);
      expect(stored.record.inputsHash).toBe(result.determinism.inputsHash);
      expect(stored.record.requestHash).toBe(result.determinism.requestHash);
      const afterSave = await counts(tx);
      expect(await replayOpportunityAnalysis(result.runId, actor)).toEqual(result);
      expect(await counts(tx)).toEqual(afterSave);
    });
  });
  it("replays exact old bytes after a newer publication and temporal expiry; no latest fallback", async () => {
    await isolated(async (tx, actor) => {
      const { req, items, s } = await fixture(actor);
      const result = await runOpportunityAnalysisPersisted(req, actor, historyContext());
      const revised = opportunityDataset(); revised.sourceId = s.id; revised.rows[0]!.value = 500;
      const next = await createDataCenterVersion({ itemId: items[0]!.id, title: "Newer synthetic value", content: JSON.stringify(revised),
        evidenceStatus: "VERIFIED", reason: "Synthetic historical replay", provenance: [{ kind: "DOCUMENT", reference: "fixture:m4-new", label: "Synthetic only" }] }, actor);
      await publish(items[0]!.id, actor);
      await tx.dataCenterSource.update({ where: { id: s.id }, data: { freshnessDays: 1 } });
      const before = await counts(tx);
      expect(await replayOpportunityAnalysis(result.runId, actor)).toEqual(result);
      expect((await readOpportunityRun(result.runId, actor)).record.inputs.some((input) => input.refId === next.id)).toBe(false);
      expect(await counts(tx)).toEqual(before);
    });
  });
  it("replays independent historical periods and all four exact versions", async () => {
    await isolated(async (tx, actor) => {
      const { req, s } = await fixture(actor);
      req.analyses.push("HISTORICAL_CHANGE"); const scope = structuredClone(req.scope);
      scope.time = { kind: "INTERVAL", id: "2026-08", startDate: "2026-08-01", endDate: "2026-09-01", frequency: "MONTHLY", calendar: "GREGORIAN", timeZone: "Asia/Riyadh" };
      req.historical = { scope, versions: [] };
      for (const role of ["need.observations", "supply.capacity"] as const) {
        const content = opportunityDataset(role); content.sourceId = s.id; content.scope = structuredClone(scope);
        content.rows[0]!.semantics.time = structuredClone(scope.time);
        if (role === "need.observations") content.rows[0]!.value = 80;
        const item = await dataset(actor, s.id, role, { content: JSON.stringify(content) });
        req.historical.versions.push({ role, versionId: item.version.id, checksum: item.version.checksum });
      }
      const result = await runOpportunityAnalysisPersisted(req, actor, historyContext());
      expect(result.results[0]!.metrics.find((metric) => metric.key === "historical_change.demand_supply_gap")?.value).toBe(20);
      expect((await readOpportunityRun(result.runId, actor)).record.inputs).toHaveLength(4);
      const before = await counts(tx);
      expect(await replayOpportunityAnalysis(result.runId, actor)).toEqual(result);
      expect(await counts(tx)).toEqual(before);
    });
  });
  it("does not replace originally absent evidence when it becomes available later", async () => {
    await isolated(async (_tx, actor) => {
      const { req, items } = await fixture(actor);
      const next = await createDataCenterVersion({ itemId: items[1]!.id, title: "Unpublished capacity", content: items[1]!.version.content,
        evidenceStatus: "VERIFIED", reason: "Synthetic missing snapshot", provenance: [{ kind: "DOCUMENT", reference: "fixture:missing", label: "Synthetic only" }] }, actor);
      req.data.roles[1] = { role: "supply.capacity", versionId: next.id, checksum: next.checksum };
      const result = await runOpportunityAnalysisPersisted(req, actor, historyContext());
      await publish(items[1]!.id, actor);
      expect(await replayOpportunityAnalysis(result.runId, actor)).toEqual(result);
      expect(result.results[0]!.metrics.find((metric) => metric.key === "current.demand_supply_gap")?.value).toBeNull();
    });
  });
  it("hides foreign history exactly like missing history even when inputs are public", async () => {
    await isolated(async (tx, admin) => {
      const { req } = await fixture(admin); const owner = await user(tx); const foreign = await user(tx);
      const result = await runOpportunityAnalysisPersisted(req, owner, historyContext());
      expect(await replayOpportunityAnalysis(result.runId, owner)).toEqual(result);
      for (const id of [result.runId, "absent-opportunity-run"]) {
        await expect(readOpportunityRun(id, foreign)).rejects.toEqual(new OpportunityHistoryUnavailable());
        await expect(replayOpportunityAnalysis(id, foreign)).rejects.toEqual(new OpportunityHistoryUnavailable());
      }
    });
  });
  it.each(["retrieval", "license", "usage", "export", "attribution", "private"] as const)("blocks cached history after current %s rights change", async (variant) => {
    await isolated(async (tx, admin) => {
      const { req, s } = await fixture(admin); const owner = await user(tx);
      const result = await runOpportunityAnalysisPersisted(req, owner, historyContext());
      const changes = variant === "retrieval" ? { allowRetrieval: false } : variant === "license" ? { license: "Changed license" }
        : variant === "usage" ? { usagePolicy: "Changed usage" } : variant === "export" ? { allowExport: true }
        : variant === "attribution" ? { attribution: "Changed attribution" } : { scope: "PRIVATE" as const };
      await tx.dataCenterSource.update({ where: { id: s.id }, data: changes });
      await expect(readOpportunityRun(result.runId, owner)).rejects.toBeInstanceOf(OpportunityHistoryUnavailable);
      await expect(replayOpportunityAnalysis(result.runId, owner)).rejects.toBeInstanceOf(OpportunityHistoryUnavailable);
    });
  });
  it("rechecks archive status", async () => {
    await isolated(async (_tx, actor) => {
      const { req, items } = await fixture(actor); const result = await runOpportunityAnalysisPersisted(req, actor, historyContext());
      await transitionDataCenterItem({ itemId: items[0]!.id, status: "ARCHIVED", reason: "Synthetic historical archive" }, actor);
      await expect(replayOpportunityAnalysis(result.runId, actor)).rejects.toBeInstanceOf(OpportunityHistoryUnavailable);
    });
  });
  it("retains specialty/mission authorization context for historical versions", async () => {
    await isolated(async (_tx, actor) => {
      const s = await source(actor); const req = opportunityRequest(); req.data.roles = [];
      for (const role of ["need.observations", "supply.capacity"] as const) {
        const item = await dataset(actor, s.id, role, { specialties: ["clinic"], missionContexts: ["study"] });
        req.data.roles.push({ role, versionId: item.version.id, checksum: item.version.checksum });
      }
      const result = await runOpportunityAnalysisPersisted(req, actor, { ...historyContext(), specialty: "clinic", missionContext: "study" });
      expect(result.inputs).toHaveLength(2);
      expect((await readOpportunityRun(result.runId, actor)).runtime.replayAuthorizationContext).toEqual({ specialty: "clinic", missionContext: "study" });
      expect(await replayOpportunityAnalysis(result.runId, actor)).toEqual(result);
    });
  });
  it("reauthorizes retained source metadata even when malformed data was excluded from calculation", async () => {
    await isolated(async (tx, admin) => {
      const { req, s } = await fixture(admin); const owner = await user(tx);
      const invalid = await dataset(admin, s.id, "need.observations", { content: '{"notAnOpportunityDataset":true}' });
      req.data.roles[0] = { role: "need.observations", versionId: invalid.version.id, checksum: invalid.version.checksum };
      const result = await runOpportunityAnalysisPersisted(req, owner, historyContext());
      expect(result.inputs).toHaveLength(1);
      expect(await replayOpportunityAnalysis(result.runId, owner)).toEqual(result);
      await tx.dataCenterSource.update({ where: { id: s.id }, data: { allowRetrieval: false } });
      await expect(replayOpportunityAnalysis(result.runId, owner)).rejects.toBeInstanceOf(OpportunityHistoryUnavailable);
    });
  });
  it("propagates invalid execution without inventing a successful run or partial history", async () => {
    await isolated(async (tx, actor) => {
      const before = await counts(tx);
      await expect(runOpportunityAnalysisPersisted({ invented: true }, actor, historyContext())).rejects.toThrow();
      expect(await counts(tx)).toEqual(before);
    });
  });
  it("rechecks organization membership and required permission for historical inputs", async () => {
    await isolated(async (tx, admin) => {
      const { req, s } = await fixture(admin); const owner = await user(tx);
      const org = await tx.organization.create({ data: { name: "Synthetic historical org", slug: `opportunity-m4-${randomUUID()}` } });
      const member = await tx.organizationMember.create({ data: { userId: owner.id, organizationId: org.id, isOwner: true, status: "ACTIVE" } });
      await tx.dataCenterSource.update({ where: { id: s.id }, data: { scope: "ORGANIZATION", organizationId: org.id } });
      const result = await runOpportunityAnalysisPersisted(req, owner, { ...historyContext(), organizationId: org.id });
      expect(await replayOpportunityAnalysis(result.runId, owner)).toEqual(result);
      await tx.organizationMember.update({ where: { id: member.id }, data: { status: "SUSPENDED" } });
      await expect(replayOpportunityAnalysis(result.runId, owner)).rejects.toBeInstanceOf(OpportunityHistoryUnavailable);
    });
  });
  it("rechecks current robot grant and assignment on historical replay", async () => {
    await isolated(async (tx, admin) => {
      const { req, s } = await fixture(admin);
      const robot = await tx.robot.create({ data: { slug: `m4-${randomUUID()}`, name: "Synthetic M4 robot" } });
      const mission = await tx.mission.create({ data: { name: "Synthetic M4 mission", assignedRobots: { connect: { id: robot.id } } } });
      const principal = await user(tx);
      const actor: DataCenterActor = { id: principal.id, kind: "AI", systemRole: "ADMIN", robotId: robot.id, roleKey: "analyst", specialty: "opportunity", missionId: mission.id };
      const grant = await grantDataCenterRobotAccess({ robotId: robot.id, sourceId: s.id, principalId: principal.id, roleKey: "analyst", specialty: "opportunity", missionId: mission.id,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(), reason: "Synthetic M4 grant" }, admin);
      const result = await runOpportunityAnalysisPersisted(req, actor, historyContext());
      expect(await replayOpportunityAnalysis(result.runId, actor)).toEqual(result);
      await revokeDataCenterRobotAccess({ grantId: grant.id, reason: "Synthetic M4 revoke" }, admin);
      await expect(replayOpportunityAnalysis(result.runId, actor)).rejects.toBeInstanceOf(OpportunityHistoryUnavailable);
    });
  });
  it("detects changed historical source bytes without falling back", async () => {
    await isolated(async (tx, actor) => {
      const { req, items } = await fixture(actor); const result = await runOpportunityAnalysisPersisted(req, actor, historyContext());
      await tx.$executeRaw`ALTER TABLE "DataCenterVersion" DISABLE TRIGGER "DataCenterVersion_immutable"`;
      try { await tx.dataCenterVersion.update({ where: { id: items[0]!.version.id }, data: { content: "tampered" } }); }
      finally { await tx.$executeRaw`ALTER TABLE "DataCenterVersion" ENABLE TRIGGER "DataCenterVersion_immutable"`; }
      await expect(replayOpportunityAnalysis(result.runId, actor)).rejects.toMatchObject({ reason: "VERSION_CHECKSUM" });
    });
  });
  it.each(["output", "transcript", "input-column"] as const)("detects stored %s corruption", async (variant) => {
    await isolated(async (tx, actor) => {
      const { req } = await fixture(actor); const result = await runOpportunityAnalysisPersisted(req, actor, historyContext());
      if (variant === "input-column") {
        await tx.$executeRaw`ALTER TABLE "AnalysisEngineRunInput" DISABLE TRIGGER "AnalysisEngineRunInput_append_only"`;
        try { await tx.analysisEngineRunInput.updateMany({ where: { runId: result.runId }, data: { contentHash: "c".repeat(64) } }); }
        finally { await tx.$executeRaw`ALTER TABLE "AnalysisEngineRunInput" ENABLE TRIGGER "AnalysisEngineRunInput_append_only"`; }
      } else {
        await tx.$executeRaw`ALTER TABLE "AnalysisEngineRun" DISABLE TRIGGER "AnalysisEngineRun_append_only"`;
        try {
          if (variant === "output") await tx.analysisEngineRun.update({ where: { runId: result.runId }, data: { outputHash: "c".repeat(64) } });
          else await tx.analysisEngineRun.update({ where: { runId: result.runId }, data: { runtime: { contract: "jenan.opportunity-gap.run-history/v1", replayAuthorizationContext: {}, transcript: [] } } });
        } finally { await tx.$executeRaw`ALTER TABLE "AnalysisEngineRun" ENABLE TRIGGER "AnalysisEngineRun_append_only"`; }
      }
      await expect(replayOpportunityAnalysis(result.runId, actor)).rejects.toThrow();
    });
  });
  it("rejects duplicate Run IDs without overwriting an accepted run", async () => {
    await isolated(async (tx, actor) => {
      const { req } = await fixture(actor); const ctx = historyContext(); const result = await runOpportunityAnalysisPersisted(req, actor, ctx);
      const before = await counts(tx);
      await tx.$executeRawUnsafe("SAVEPOINT opportunity_duplicate");
      await expect(runOpportunityAnalysisPersisted(req, actor, ctx)).rejects.toThrow();
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT opportunity_duplicate");
      expect(await counts(tx)).toEqual(before);
      expect(await replayOpportunityAnalysis(result.runId, actor)).toEqual(result);
    });
  });
  it("rolls back a failed nested Input insertion and allows a clean retry", async () => {
    await isolated(async (tx, actor) => {
      const { req } = await fixture(actor); const ctx = historyContext(); const before = await counts(tx);
      await tx.$executeRawUnsafe("SAVEPOINT opportunity_atomic");
      await tx.$executeRawUnsafe(`CREATE FUNCTION opportunity_m4_reject_input() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic M4 input failure'; END $$`);
      await tx.$executeRawUnsafe(`CREATE TRIGGER opportunity_m4_reject_input BEFORE INSERT ON "AnalysisEngineRunInput" FOR EACH ROW EXECUTE FUNCTION opportunity_m4_reject_input()`);
      await expect(runOpportunityAnalysisPersisted(req, actor, ctx)).rejects.toThrow();
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT opportunity_atomic");
      expect(await counts(tx)).toEqual(before);
      const result = await runOpportunityAnalysisPersisted(req, actor, ctx);
      expect(await replayOpportunityAnalysis(result.runId, actor)).toEqual(result);
    });
  });
  it.each(["AnalysisEngineRun", "AnalysisEngineRunInput"] as const)("keeps %s append-only at the database boundary", async (table) => {
    await isolated(async (tx, actor) => {
      const { req } = await fixture(actor); const result = await runOpportunityAnalysisPersisted(req, actor, historyContext());
      await tx.$executeRawUnsafe("SAVEPOINT opportunity_append");
      await expect(tx.$executeRawUnsafe(`UPDATE "${table}" SET "runId" = "runId" WHERE "runId" = $1`, result.runId)).rejects.toThrow();
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT opportunity_append");
      await expect(tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "runId" = $1`, result.runId)).rejects.toThrow();
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT opportunity_append");
      expect(await replayOpportunityAnalysis(result.runId, actor)).toEqual(result);
    });
  });
});
afterAll(async () => { if (enabled) await (context.actual as typeof db).$disconnect(); });
describe.skipIf(!enabled)("Opportunity M2 real PostgreSQL, disposable rollback fixtures only", () => {
  it("M3 computes exact governed differences/signals without writes or history persistence", async () => {
    await isolated(async (tx, admin) => {
      const { req } = await fixture(admin);
      req.analyses.push("OPPORTUNITY_SIGNALS"); req.signalPolicy = { ...opportunitySignalRule };
      const before = await counts(tx); const { evaluatedAt } = trusted();
      const ctx = { evaluatedAt, runId: "opportunity-m3-postgres", environment: "test" as const, timing: { startedAt: evaluatedAt, finishedAt: evaluatedAt, durationMs: 0 } };
      const result = await analyzeOpportunityDataCenterInputs(req, admin, ctx);
      expect(result.results[0]!.metrics.find((metric) => metric.key === "current.demand_supply_gap")?.value).toBe(40);
      expect(result.findings.find((finding) => finding.kind === "OPPORTUNITY_SIGNAL")?.signalState).toBe("SUPPORTED");
      expect(findOpportunityCalculationProblems(result)).toEqual([]);
      expect(await counts(tx)).toEqual(before);
      req.data.roles.reverse();
      expect((await analyzeOpportunityDataCenterInputs(req, admin, ctx)).determinism).toEqual(result.determinism);
      expect(await counts(tx)).toEqual(before);
    });
  });
  it("reads exact versions with Data Center-recomputed checksum and performs no writes", async () => {
    await isolated(async (tx, admin) => {
      const { req, items } = await fixture(admin); const before = await counts(tx); const ctx = trusted();
      const result = await prepareOpportunityDataCenterInputs(req, admin, ctx);
      expect(result.ready).toBe(true); expect(result.current.facts).toHaveLength(2);
      expect(result.sources.map((entry) => entry.reference?.version.versionId)).toEqual(items.map((item) => item.version.id));
      expect(result.sources.every((entry) => entry.reference?.source.sourceId && entry.dataset?.sourceRecords[0]?.reference)).toBe(true);
      expect(result.realDataAcceptance).toBe("BLOCKED / NOT VERIFIED");
      expect(await counts(tx)).toEqual(before);
      req.data.roles.reverse();
      expect((await prepareOpportunityDataCenterInputs(req, admin, ctx)).determinism).toEqual(result.determinism);
      expect(await counts(tx)).toEqual(before);
    });
  });
  it("rejects a wrong caller hash and detects tampered stored bytes", async () => {
    await isolated(async (tx, admin) => {
      const { req, items } = await fixture(admin); const ctx = trusted(); const provider = createOpportunityDataCenterProvider(admin, ctx);
      expect(await provider.read({ versionId: items[0]!.version.id, expectedChecksum: "c".repeat(64) })).toEqual({ status: "INTEGRITY_ERROR" });
      // Corruption injection is confined to this rolled-back disposable database transaction.
      await tx.$executeRaw`ALTER TABLE "DataCenterVersion" DISABLE TRIGGER "DataCenterVersion_immutable"`;
      try { await tx.dataCenterVersion.update({ where: { id: items[0]!.version.id }, data: { content: "tampered" } }); }
      finally { await tx.$executeRaw`ALTER TABLE "DataCenterVersion" ENABLE TRIGGER "DataCenterVersion_immutable"`; }
      expect(await provider.read({ versionId: items[0]!.version.id, expectedChecksum: req.data.roles[0]!.checksum })).toEqual({ status: "INTEGRITY_ERROR" });
    });
  });
  it("never falls back from a superseded or unpublished exact version", async () => {
    await isolated(async (_tx, admin) => {
      const { req, items } = await fixture(admin);
      const draft = await createDataCenterVersion({ itemId: items[0]!.id, title: "Synthetic v2", content: items[0]!.version.content,
        evidenceStatus: "VERIFIED", reason: "Synthetic revision",
        provenance: [{ kind: "DOCUMENT", reference: "fixture:revision", label: "Synthetic revised evidence" }] }, admin);
      const provider = createOpportunityDataCenterProvider(admin, trusted());
      expect(await provider.read({ versionId: draft.id, expectedChecksum: draft.checksum })).toEqual({ status: "NOT_AVAILABLE" });
      await publish(items[0]!.id, admin);
      const result = await prepareOpportunityDataCenterInputs(req, admin, trusted());
      expect(result.sources[0]).toMatchObject({ status: "NOT_AVAILABLE", reference: null, reason: "SOURCE_UNAVAILABLE" });
      expect(result.current.facts.every((fact) => fact.evidence.every((ref) => ref.versionId !== draft.id))).toBe(true);
    });
  });
  it("gives identical read/discovery outcomes for private and nonexistent IDs", async () => {
    await isolated(async (tx, admin) => {
      const owner = await user(tx); const stranger = await user(tx);
      const s = await source(owner, { scope: "PRIVATE" }); const item = await dataset(admin, s.id);
      const provider = createOpportunityDataCenterProvider(stranger, trusted());
      const hidden = await provider.read({ versionId: item.version.id, expectedChecksum: item.version.checksum });
      const missing = await provider.read({ versionId: "absent-opportunity-version", expectedChecksum: item.version.checksum });
      expect(hidden).toEqual(missing); expect(hidden).toEqual({ status: "NOT_AVAILABLE" });
      for (const id of [item.version.id, "absent-opportunity-version"]) {
        const discovery = await provider.discover({ versionIds: [id] });
        expect(discovery.candidates).toEqual([]); expect(discovery.status).toBe("NOT_AVAILABLE");
        expect(Object.keys(discovery)).not.toContain("reason");
      }
    });
  });
  it("rechecks retrieval rights and archives without metadata leakage", async () => {
    await isolated(async (tx, admin) => {
      const { req, items, s } = await fixture(admin); const reader = await user(tx); const provider = createOpportunityDataCenterProvider(reader, trusted());
      await tx.dataCenterSource.update({ where: { id: s.id }, data: { allowRetrieval: false } });
      expect(await provider.read({ versionId: items[0]!.version.id, expectedChecksum: req.data.roles[0]!.checksum })).toEqual({ status: "NOT_AVAILABLE" });
      await tx.dataCenterSource.update({ where: { id: s.id }, data: { allowRetrieval: true } });
      await transitionDataCenterItem({ itemId: items[0]!.id, status: "ARCHIVED", reason: "Synthetic archive" }, admin);
      expect((await prepareOpportunityDataCenterInputs(req, reader, trusted())).sources[0]!.status).toBe("NOT_AVAILABLE");
    });
  });
  it("respects specialty and mission restrictions on exact reads", async () => {
    await isolated(async (_tx, admin) => {
      const s = await source(admin); const item = await dataset(admin, s.id, "need.observations", { specialties: ["clinic"], missionContexts: ["study"] });
      const pin = { versionId: item.version.id, expectedChecksum: item.version.checksum };
      expect(await createOpportunityDataCenterProvider(admin, trusted()).read(pin)).toEqual({ status: "NOT_AVAILABLE" });
      expect(await createOpportunityDataCenterProvider(admin, { ...trusted(), specialty: "clinic", missionContext: "study" }).read(pin)).toMatchObject({ status: "AVAILABLE" });
    });
  });
  it("enforces trusted organization scope and current organization membership", async () => {
    await isolated(async (tx, admin) => {
      const { req, s, items } = await fixture(admin); const reader = await user(tx);
      const org = await tx.organization.create({ data: { name: "Synthetic Opportunity org", slug: `opportunity-${randomUUID()}` } });
      const member = await tx.organizationMember.create({ data: { userId: reader.id, organizationId: org.id, isOwner: true, status: "ACTIVE" } });
      await tx.dataCenterSource.update({ where: { id: s.id }, data: { scope: "ORGANIZATION", organizationId: org.id } });
      const ctx = { ...trusted(), organizationId: org.id };
      expect((await prepareOpportunityDataCenterInputs(req, reader, ctx)).ready).toBe(true);
      const pin = { versionId: items[0]!.version.id, expectedChecksum: items[0]!.version.checksum };
      expect(await createOpportunityDataCenterProvider(admin, { ...trusted(), organizationId: "different-org" }).read(pin)).toEqual({ status: "NOT_AVAILABLE" });
      await tx.organizationMember.update({ where: { id: member.id }, data: { status: "SUSPENDED" } });
      expect(await createOpportunityDataCenterProvider(reader, ctx).read(pin)).toEqual({ status: "NOT_AVAILABLE" });
    });
  });
  it("uses current robot grants and rejects revoked capability", async () => {
    await isolated(async (tx, admin) => {
      const { s, items } = await fixture(admin);
      const robot = await tx.robot.create({ data: { slug: `opportunity-${randomUUID()}`, name: "Synthetic Opportunity robot" } });
      const mission = await tx.mission.create({ data: { name: "Synthetic Opportunity study", assignedRobots: { connect: { id: robot.id } } } });
      const principal = await user(tx);
      const actor: DataCenterActor = { id: principal.id, kind: "AI", systemRole: "USER", robotId: robot.id, roleKey: "analyst", specialty: "opportunity", missionId: mission.id };
      const provider = createOpportunityDataCenterProvider(actor, trusted()); const pin = { versionId: items[0]!.version.id, expectedChecksum: items[0]!.version.checksum };
      await expect(provider.read(pin)).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED" });
      const grant = await grantDataCenterRobotAccess({ robotId: robot.id, sourceId: s.id, principalId: principal.id, roleKey: "analyst", specialty: "opportunity", missionId: mission.id,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(), reason: "Synthetic exact read grant" }, admin);
      expect(await provider.read(pin)).toMatchObject({ status: "AVAILABLE" });
      await revokeDataCenterRobotAccess({ grantId: grant.id, reason: "Synthetic revoke" }, admin);
      await expect(provider.read(pin)).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED" });
    });
  });
  it.each(["malformed", "wrong-source", "unit", "coverage", "partial"] as const)("validates published %s payload rather than trusting its publication", async (variant) => {
    await isolated(async (_tx, admin) => {
      const s = await source(admin); const content = opportunityDataset(); content.sourceId = s.id;
      if (variant === "wrong-source") content.sourceId = "other-source";
      if (variant === "unit") { content.definition.unit.entity = "seats"; content.rows[0]!.semantics.unit.entity = "seats"; }
      if (variant === "coverage") { content.scope.dimensions.geography.code = "other-city"; content.rows[0]!.semantics.dimensions.geography.code = "other-city"; }
      if (variant === "partial") { content.coverage.status = "PARTIAL"; content.coverage.completeness = "SAMPLE"; content.rows[0]!.coverage = "PARTIAL"; content.rows[0]!.limitations = ["Subset only"]; }
      const item = await dataset(admin, s.id, "need.observations", { content: variant === "malformed" ? "{bad" : JSON.stringify(content) });
      const req = opportunityRequest(); req.data.roles = [{ role: "need.observations", versionId: item.version.id, checksum: item.version.checksum }];
      const result = await prepareOpportunityDataCenterInputs(req, admin, trusted());
      expect(result.sources[0]!.status).toBe(variant === "partial" ? "PARTIAL" : variant === "coverage" ? "NO_COVERAGE" : "NOT_COMPUTABLE");
      expect(result.ready).toBe(false);
    });
  });
  it("propagates restricted license, provenance and attribution without broadening export rights", async () => {
    await isolated(async (_tx, admin) => {
      const s = await source(admin, { licenseClass: "RESTRICTED", allowExport: false }); const item = await dataset(admin, s.id);
      const req = opportunityRequest(); req.analyses = ["DATA_COVERAGE"]; req.data.roles = [{ role: "need.observations", versionId: item.version.id, checksum: item.version.checksum }];
      const result = await prepareOpportunityDataCenterInputs(req, admin, trusted());
      expect(result.ready).toBe(true); expect(result.rights.allowExport).toBe(false);
      expect(result.current.inputs[0]!.licenseClass).toBe("RESTRICTED");
      expect(result.current.facts[0]!.evidence[0]).toMatchObject({ versionId: item.version.id, checksum: item.version.checksum, sourceRecordId: "row-1" });
      expect(result.sources[0]!.dataset!.sourceRecords[0]!.reference).toContain("synthetic:");
      expect(result.attribution[0]!.text).toBe("Synthetic Opportunity fixture");
    });
  });
});
