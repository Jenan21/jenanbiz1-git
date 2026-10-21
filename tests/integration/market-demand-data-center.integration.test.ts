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
import { createDataCenterItem, createDataCenterSource, registerDataCenterType, reviewDataCenterItem, transitionDataCenterItem } from "@/services/data-center/service";
import { recordDataCenterQualityAssessment } from "@/services/data-center/quality";
import { type DataCenterActor, DataCenterError } from "@/services/data-center/contracts";
import { createMarketDataCenterProvider, prepareMarketDataCenterInputs } from "@/services/analysis-engines/market-demand/adapters/data-center-provider";
import { proposedMarketTypeKeys, type MarketDataset, type MarketDatasetRole } from "@/services/analysis-engines/market-demand";
import { marketDataset } from "../unit/support/market-data-fixtures";
import { marketRequest } from "../unit/support/market-demand-fixtures";

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
async function mutableVersion(tx: DbExecutor, work: () => Promise<unknown>) {
  await tx.$executeRawUnsafe('ALTER TABLE "DataCenterVersion" DISABLE TRIGGER "DataCenterVersion_immutable"');
  try { await work(); } finally { await tx.$executeRawUnsafe('ALTER TABLE "DataCenterVersion" ENABLE TRIGGER "DataCenterVersion_immutable"'); }
}
afterAll(async () => { if (enabled) await (context.actual as typeof db).$disconnect(); });

describe.skipIf(!enabled)("Market M2 real PostgreSQL governed integration (synthetic data, always rolled back)", () => {
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
