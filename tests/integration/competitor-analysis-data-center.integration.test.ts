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
import { type DataCenterActor } from "@/services/data-center/contracts";
import { createDataCenterItem, createDataCenterSource, createDataCenterVersion, registerDataCenterType, reviewDataCenterItem, transitionDataCenterItem } from "@/services/data-center/service";
import { grantDataCenterRobotAccess, revokeDataCenterRobotAccess } from "@/services/data-center/robot-grants";
import { createCompetitorDataCenterProvider, prepareCompetitorDataCenterInputs, runCompetitorDataCenterAnalysis } from "@/services/analysis-engines/competitor-analysis/adapters/data-center-provider";
import { assertCompetitorAnalyticsResult, assessCompetitorCount, typeKeyByCompetitorRole, type CompetitorDatasetRole } from "@/services/analysis-engines/competitor-analysis";
import { competitorDataset } from "../unit/support/competitor-data-fixtures";
import { competitorInstant, competitorRequest } from "../unit/support/competitor-analysis-fixtures";

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
afterAll(async () => { if (enabled) await (context.actual as typeof db).$disconnect(); });
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
