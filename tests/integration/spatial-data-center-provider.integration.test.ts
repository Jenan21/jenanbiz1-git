import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { DbExecutor } from "@/lib/db";

// Real, migrated PostgreSQL, inside a transaction that is always rolled back (the same harness as the other Data Center integration tests).
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
import { createDataCenterItem, createDataCenterSource, createDataCenterVersion, reviewDataCenterItem, transitionDataCenterItem } from "@/services/data-center/service";
import { grantDataCenterRobotAccess, revokeDataCenterRobotAccess } from "@/services/data-center/robot-grants";
import { recordDataCenterQualityAssessment } from "@/services/data-center/quality";
import type { DataCenterActor } from "@/services/data-center/contracts";
import { createDataCenterProvider } from "@/services/analysis-engines/spatial/adapters/data-center-provider";
import { SPATIAL_REQUEST_CONTRACT } from "@/services/analysis-engines/spatial/constants";
import { targetGeography } from "@/services/analysis-engines/spatial/dataset-features";
import { dataSourceRequestsOf, resolveSpatialDataSources, type DataSourceRequest } from "@/services/analysis-engines/spatial/data-sources";
import { applyMapBinding, reconcileMapBinding } from "@/services/analysis-engines/spatial/map-data-center";
import { buildMapLayerInput } from "@/services/analysis-engines/spatial/map-inputs";
import { normalizeSpatialRequest } from "@/services/analysis-engines/spatial/normalize";
import { MAP_BINDING_CONTRACT } from "@/services/data-center/map-contract";
import { resolveDataCenterMapReference } from "@/services/data-center/map-resolver";
import { engineInputSchema } from "@/services/analysis-engines/shared/contracts";
import { osmProvenance, publishedRelease, realBoundary, RELEASE_ID } from "../unit/support/spatial-map-fixtures";

const enabled = process.env.DATA_CENTER_DATABASE_TESTS === "1";
const rollback = new Error("ROLLBACK_DATA_CENTER_TEST");
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const NOW = new Date();
const EVALUATED_AT = NOW.toISOString();

async function isolated(run: (tx: DbExecutor, admin: DataCenterActor) => Promise<void>) {
  const actual = context.actual as typeof db;
  await expect(actual.$transaction(async (tx) => {
    context.tx = tx;
    try {
      const user = await tx.user.create({ data: { email: `data-center-${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
      await run(tx, { id: user.id, systemRole: "ADMIN", kind: "HUMAN" });
      throw rollback;
    } finally { context.tx = null; }
  }, { timeout: 120_000 })).rejects.toBe(rollback);
}
async function publish(itemId: string, actor: DataCenterActor) {
  await transitionDataCenterItem({ itemId, status: "IN_REVIEW", reason: "Submit reviewed source" }, actor);
  await reviewDataCenterItem({ itemId, decision: "APPROVED", notes: "Methodology reviewed; evidence label retained" }, actor);
  await transitionDataCenterItem({ itemId, status: "APPROVED", reason: "Approval recorded" }, actor);
  await transitionDataCenterItem({ itemId, status: "PUBLISHED", reason: "Release labelled estimate" }, actor);
}
/** Test-only: the Data Center's tables are append-only, so backdating a publication or tampering with a stored version needs the immutability trigger off for a moment, inside the rolled-back transaction. */
async function withoutImmutability(tx: DbExecutor, table: "DataCenterEvent" | "DataCenterVersion", work: () => Promise<unknown>) {
  await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${table}_immutable"`);
  try { await work(); } finally { await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER "${table}_immutable"`); }
}
const backdatePublication = (tx: DbExecutor, itemId: string, when: Date) => withoutImmutability(tx, "DataCenterEvent", () =>
  tx.$executeRaw`UPDATE "DataCenterEvent" SET "createdAt" = ${when} WHERE "itemId" = ${itemId} AND "toStatus" = 'PUBLISHED'::"DataCenterLifecycle"`);

const geojson = (...names: string[]) => JSON.stringify({ type: "FeatureCollection", features: names.map((name, index) => ({ type: "Feature", properties: { name }, geometry: { type: "Point", coordinates: [46.67 + index * 0.01, 24.71] } })) });
const riyadhBox = { west: 46.0, south: 24.3, east: 47.3, north: 25.1 };
const dubaiBox = { west: 54.9, south: 24.7, east: 55.7, north: 25.4 };
const jeddahBox = { west: 39.0, south: 21.3, east: 39.4, north: 21.8 };
const platformSource = (admin: DataCenterActor, over: Record<string, unknown> = {}) => createDataCenterSource({
  name: `Source ${randomUUID()}`, kind: "OFFICIAL", scope: "PLATFORM", owner: "Authority", license: "ODbL-1.0", allowExport: false, freshnessDays: 365,
  ownership: "THIRD_PARTY", licenseClass: "OPEN_LICENSE", usagePolicy: "Share-alike; credit required", attribution: "© Authority", attributionRequired: true, ...over,
} as Parameters<typeof createDataCenterSource>[0], admin);

interface DatasetOptions {
  title?: string; typeKey?: string; content?: string; sourcePublishedAt?: Date; publishedAt?: Date; coverage?: Record<string, unknown>;
  expiresAt?: Date; effectiveFrom?: Date; specialties?: string[]; attribution?: string;
}
async function dataset(tx: DbExecutor, admin: DataCenterActor, sourceId: string, over: DatasetOptions = {}) {
  const item = await createDataCenterItem({
    sourceId, title: over.title ?? `Hospitals ${randomUUID().slice(0, 8)}`, typeKey: over.typeKey ?? "geojson", layer: "DATA", content: over.content ?? geojson("a"), evidenceStatus: "ESTIMATED",
    sourcePublishedAt: (over.sourcePublishedAt ?? ago(30)).toISOString(),
    ...(over.expiresAt ? { expiresAt: over.expiresAt.toISOString() } : {}), ...(over.effectiveFrom ? { effectiveFrom: over.effectiveFrom.toISOString() } : {}),
    ...(over.coverage ? { coverage: over.coverage } : {}), ...(over.specialties ? { specialties: over.specialties } : {}), ...(over.attribution ? { attribution: over.attribution } : {}),
  } as Parameters<typeof createDataCenterItem>[0], admin);
  await publish(item.id, admin);
  if (over.publishedAt) await backdatePublication(tx, item.id, over.publishedAt);
  return item;
}
const user = async (tx: DbExecutor, label = "user"): Promise<DataCenterActor> => {
  const created = await tx.user.create({ data: { email: `${label}-${randomUUID()}@example.test`, status: "ACTIVE" } });
  return { id: created.id, systemRole: "USER", kind: "HUMAN" };
};
async function robot(tx: DbExecutor, admin: DataCenterActor, sourceIds: string[]) {
  const record = await tx.robot.create({ data: { name: "Analyst", slug: `analyst-${randomUUID()}` } });
  const mission = await tx.mission.create({ data: { name: "Site study", assignedRobots: { connect: { id: record.id } } } });
  const principal = await tx.user.create({ data: { email: `robot-${randomUUID()}@example.test`, status: "ACTIVE" } });
  const identity: DataCenterActor = { id: principal.id, systemRole: "USER", kind: "AI", robotId: record.id, roleKey: "analyst", specialty: "demography", missionId: mission.id };
  const grants = [];
  for (const sourceId of sourceIds) {
    grants.push(await grantDataCenterRobotAccess({
      sourceId, robotId: record.id, principalId: principal.id, roleKey: "analyst", specialty: "demography", missionId: mission.id, access: "READ", reason: "Site study", expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
    }, admin));
  }
  return { identity, mission, robotId: record.id, grants };
}

const providerFor = (actor: DataCenterActor, over: { specialty?: string; missionContext?: string } = {}) => createDataCenterProvider({ actor, now: NOW, ...over });
interface Geography { countryCodes?: string[]; regionCodes?: string[]; boundingBox?: typeof riyadhBox }
const exact = (versionId: string) => ({ kind: "EXACT", versionId }) as const;
const byType = (over: { typeKey?: string; asOf?: string; geography?: Geography } = {}) => ({ kind: "BY_TYPE", typeKey: over.typeKey ?? "geojson", ...(over.asOf ? { asOf: over.asOf } : {}), ...(over.geography ? { geography: over.geography } : {}) }) as const;
const idsOf = (discovery: { candidates: Array<{ version: { versionId: string } }> }) => discovery.candidates.map((candidate) => candidate.version.versionId);
const counts = async (tx: DbExecutor) => ({
  usage: await tx.dataCenterUsage.count(), audit: await tx.auditLog.count(), events: await tx.dataCenterEvent.count(), versions: await tx.dataCenterVersion.count(), items: await tx.dataCenterItem.count(),
});

afterAll(async () => { if (enabled) await (context.actual as typeof db).$disconnect(); });

describe.skipIf(!enabled)("the Spatial Engine's Data Center provider on real PostgreSQL (always rolled back)", () => {
  // ------------------------------------------------------------------------------------------------------------------ exact pin
  it("serves an exact pin: the reference the Data Center states, the validated features, and the checksum it recomputed", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const item = await dataset(tx, admin, source.id, { title: "Riyadh hospitals", content: geojson("A", "B", "C"), attribution: "© Authority, Riyadh 2026", coverage: { countryCodes: ["SA"], regionCodes: ["SA-01"], boundingBox: riyadhBox } });
      const port = providerFor(admin);
      const discovery = await port.discover(exact(item.version.id));
      expect(discovery).toMatchObject({ mode: "EXACT", policy: "exact-version", asOf: null, asOfExplicit: false, status: "FOUND", truncated: false, notInForce: [] });
      expect(idsOf(discovery)).toEqual([item.version.id]);
      expect(discovery.selected).toMatchObject({
        dataset: { title: "Riyadh hospitals", typeKey: "geojson" }, version: { versionId: item.version.id, checksum: { algorithm: "SHA-256", value: item.version.checksum } },
        ownership: { ownership: "THIRD_PARTY" }, rights: { license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", usagePolicy: "Share-alike; credit required", attribution: { text: "© Authority, Riyadh 2026", level: "VERSION" } },
        coverage: { countryCodes: ["SA"], regionCodes: ["SA-01"], boundingBox: riyadhBox },
      });
      const outcome = await port.readContent({ versionId: item.version.id, expectedChecksum: item.version.checksum });
      expect(outcome.status).toBe("OK");
      if (outcome.status !== "OK") return;
      expect(outcome.checksum).toBe(item.version.checksum);
      expect(outcome.features.map((feature) => feature.properties)).toEqual([{ name: "A" }, { name: "B" }, { name: "C" }]);
      // Both services state a version the same way.
      expect(outcome.reference).toEqual(discovery.selected);
    });
  });

  it("reads without a pinned checksum too, and refuses a pinned checksum that is not the version's, without reading it", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const item = await dataset(tx, admin, source.id);
      const port = providerFor(admin);
      expect((await port.readContent({ versionId: item.version.id })).status).toBe("OK");
      expect(await port.readContent({ versionId: item.version.id, expectedChecksum: "0".repeat(64) })).toEqual({ status: "PIN_CONTENT_CHANGED" });
    });
  });

  // ---------------------------------------------------------------------------------------------------------------- not reachable
  it("answers one and the same for a version that is forbidden, hidden, unpublished, superseded, expired, archived, not yet effective or does not exist", async () => {
    await isolated(async (tx, admin) => {
      const owner = await user(tx, "owner");
      const stranger = await user(tx, "stranger");
      const privateSource = await createDataCenterSource({ name: "Private", kind: "MANUAL", scope: "PRIVATE", owner: "Owner", license: "Internal" }, owner);
      const platform = await platformSource(admin);
      const hidden = await dataset(tx, admin, privateSource.id);
      const unpublished = await createDataCenterItem({ sourceId: platform.id, title: "Draft", typeKey: "geojson", layer: "DATA", content: geojson("d"), evidenceStatus: "ESTIMATED" }, admin);
      const superseded = await dataset(tx, admin, platform.id);
      await createDataCenterVersion({ itemId: superseded.id, title: "Revised", content: geojson("b"), evidenceStatus: "ESTIMATED", reason: "New evidence" }, admin);
      await publish(superseded.id, admin);
      const expired = await dataset(tx, admin, platform.id, { expiresAt: new Date(Date.now() + DAY) });
      await withoutImmutability(tx, "DataCenterVersion", () => tx.$executeRaw`UPDATE "DataCenterVersion" SET "expiresAt" = ${ago(1)} WHERE "id" = ${expired.version.id}`);
      const archived = await dataset(tx, admin, platform.id);
      await transitionDataCenterItem({ itemId: archived.id, status: "ARCHIVED", reason: "Withdrawn" }, admin);
      const future = await dataset(tx, admin, platform.id, { effectiveFrom: new Date(Date.now() + 5 * DAY) });
      const ids = { hidden: hidden.version.id, unpublished: unpublished.version.id, superseded: superseded.version.id, expired: expired.version.id, archived: archived.version.id, future: future.version.id, missing: "cmissing000000000000000000" };

      const port = providerFor(stranger);
      const missingDiscovery = await port.discover(exact(ids.missing));
      for (const [name, id] of Object.entries(ids)) {
        expect(await port.discover(exact(id)), `${name} discovery`).toEqual(missingDiscovery);
        expect(await port.readContent({ versionId: id }), `${name} content`).toEqual({ status: "NOT_AVAILABLE" });
      }
      expect(missingDiscovery).toMatchObject({ status: "NOT_AVAILABLE", selected: null, candidates: [] });
      // The owner reads the private version; even an administrator is not served what is unpublished, superseded, expired, archived or not yet effective.
      expect((await providerFor(owner).readContent({ versionId: ids.hidden })).status).toBe("OK");
      expect((await providerFor(admin).readContent({ versionId: ids.hidden })).status).toBe("OK");
      for (const name of ["unpublished", "superseded", "expired", "archived", "future"] as const) expect(await providerFor(admin).readContent({ versionId: ids[name] }), `${name} for an administrator`).toEqual({ status: "NOT_AVAILABLE" });
    });
  });

  it("applies the Data Center's access policy to people: platform data to everyone, private data to its owner, organization data to members who may read it", async () => {
    await isolated(async (tx, admin) => {
      const owner = await user(tx, "owner");
      const other = await user(tx, "other");
      const organization = await tx.organization.create({ data: { name: "Org", slug: `org-${randomUUID()}` } });
      const read = await tx.permission.upsert({ where: { key: "data-center.read" }, update: {}, create: { key: "data-center.read" } });
      const readerRole = await tx.role.create({ data: { name: "Reader", key: `reader-${randomUUID()}`, organizationId: organization.id, permissions: { create: [{ permissionId: read.id }] } } });
      const member = async (label: string, over: { isOwner?: boolean; roleId?: string; status?: "ACTIVE" | "SUSPENDED" }) => {
        const actor = await user(tx, label);
        await tx.organizationMember.create({ data: { organizationId: organization.id, userId: actor.id, isOwner: over.isOwner ?? false, roleId: over.roleId ?? null, status: over.status ?? "ACTIVE" } });
        return actor;
      };
      const [orgOwner, reader, noRole, suspended] = [await member("orgowner", { isOwner: true }), await member("reader", { roleId: readerRole.id }), await member("norole", {}), await member("suspended", { isOwner: true, status: "SUSPENDED" })];
      const platform = await platformSource(admin);
      const mine = await createDataCenterSource({ name: "Mine", kind: "MANUAL", scope: "PRIVATE", owner: "Owner", license: "Internal" }, owner);
      const orgSource = await createDataCenterSource({ name: "Org data", kind: "MANUAL", scope: "ORGANIZATION", organizationId: organization.id, owner: "Org", license: "Internal" }, admin);
      const shared = await dataset(tx, admin, platform.id);
      const privateOne = await dataset(tx, admin, mine.id);
      const orgOne = await dataset(tx, admin, orgSource.id);

      const seen = async (actor: DataCenterActor) => idsOf(await providerFor(actor).discover(byType())).sort();
      expect(await seen(admin)).toEqual([shared.version.id, privateOne.version.id, orgOne.version.id].sort());
      expect(await seen(owner)).toEqual([shared.version.id, privateOne.version.id].sort());
      expect(await seen(other)).toEqual([shared.version.id]);
      expect(await seen(orgOwner)).toEqual([shared.version.id, orgOne.version.id].sort());
      expect(await seen(reader)).toEqual([shared.version.id, orgOne.version.id].sort());
      for (const outsider of [noRole, suspended]) expect(await seen(outsider)).toEqual([shared.version.id]);
      // An exact pin follows the same policy, and an organization version is read by the members the policy admits.
      expect((await providerFor(reader).readContent({ versionId: orgOne.version.id })).status).toBe("OK");
      for (const outsider of [other, noRole, suspended]) expect(await providerFor(outsider).readContent({ versionId: orgOne.version.id })).toEqual({ status: "NOT_AVAILABLE" });
      expect(await providerFor(other).readContent({ versionId: privateOne.version.id })).toEqual({ status: "NOT_AVAILABLE" });
    });
  });

  it("gives a robot no implicit access: without a grant it is told nothing is available, whatever it asks for and whether or not anything exists", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const item = await dataset(tx, admin, source.id);
      // A real robot, assigned to a real mission, that holds no grant at all.
      const { identity } = await robot(tx, admin, []);
      const port = providerFor(identity);
      const asked = [exact(item.version.id), exact("cmissing000000000000000000"), byType(), byType({ asOf: ago(1).toISOString() })] as const;
      const withoutGrant = [];
      for (const selection of asked) withoutGrant.push(await port.discover(selection));
      for (const discovery of withoutGrant) expect(discovery).toMatchObject({ status: "NOT_AVAILABLE", selected: null, candidates: [], notInForce: [], truncated: false });
      expect(await port.readContent({ versionId: item.version.id })).toEqual({ status: "NOT_AVAILABLE" });
      // It is also the very shape a person with access to nothing is given.
      const nobody = await user(tx, "nobody");
      expect(withoutGrant[2]).toEqual(await providerFor(nobody).discover(byType({ typeKey: "knowledge" })));
    });
  });

  it("serves a robot with a READ grant only the sources it was granted, and stops serving it when the grant is revoked or its mission assignment ends", async () => {
    await isolated(async (tx, admin) => {
      const granted = await platformSource(admin);
      const other = await platformSource(admin);
      const reachable = await dataset(tx, admin, granted.id);
      const unreachable = await dataset(tx, admin, other.id);
      const { identity, grants } = await robot(tx, admin, [granted.id]);
      const port = providerFor(identity);

      expect(idsOf(await port.discover(byType()))).toEqual([reachable.version.id]);
      expect((await port.discover(exact(reachable.version.id))).status).toBe("FOUND");
      expect((await port.readContent({ versionId: reachable.version.id })).status).toBe("OK");
      // A source it has no grant for is indistinguishable from a version that does not exist.
      expect(await port.discover(exact(unreachable.version.id))).toEqual(await port.discover(exact("cmissing000000000000000000")));
      expect(await port.readContent({ versionId: unreachable.version.id })).toEqual({ status: "NOT_AVAILABLE" });
      // A different specialty than the grant's has no access.
      expect(await providerFor({ ...identity, specialty: "logistics" }).discover(byType())).toMatchObject({ status: "NOT_AVAILABLE", candidates: [] });

      await revokeDataCenterRobotAccess({ grantId: grants[0]!.id, reason: "Study finished" }, admin);
      expect(await port.discover(byType())).toMatchObject({ status: "NOT_AVAILABLE", candidates: [] });
      expect(await port.readContent({ versionId: reachable.version.id })).toEqual({ status: "NOT_AVAILABLE" });

      const second = await robot(tx, admin, [granted.id]);
      expect((await providerFor(second.identity).discover(byType())).status).toBe("FOUND");
      await tx.mission.update({ where: { id: second.mission.id }, data: { assignedRobots: { disconnect: { id: second.robotId } } } });
      expect(await providerFor(second.identity).discover(byType())).toMatchObject({ status: "NOT_AVAILABLE", candidates: [] });
    });
  });

  it("serves a version restricted to a specialty only to a provider that names it, as retrieval does", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const general = await dataset(tx, admin, source.id);
      const restricted = await dataset(tx, admin, source.id, { specialties: ["demography"] });
      expect(idsOf(await providerFor(admin).discover(byType()))).toEqual([general.version.id]);
      expect(idsOf(await providerFor(admin, { specialty: "demography" }).discover(byType()))).toEqual([restricted.version.id]);
      expect(await providerFor(admin).readContent({ versionId: restricted.version.id })).toEqual({ status: "NOT_AVAILABLE" });
      expect((await providerFor(admin, { specialty: "demography" }).readContent({ versionId: restricted.version.id })).status).toBe("OK");
    });
  });

  it("treats a principal of an untrusted kind as having nothing available", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const item = await dataset(tx, admin, source.id);
      const port = providerFor({ ...admin, kind: "SYSTEM" } as unknown as DataCenterActor);
      expect(await port.discover(exact(item.version.id))).toMatchObject({ status: "NOT_AVAILABLE", candidates: [] });
      expect(await port.readContent({ versionId: item.version.id })).toEqual({ status: "NOT_AVAILABLE" });
    });
  });

  // --------------------------------------------------------------------------------------------------------------------- selection
  it("selects by type as of an instant, and never the latest now when an instant is given", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const january = await dataset(tx, admin, source.id, { title: "January", sourcePublishedAt: ago(120), publishedAt: ago(100) });
      const march = await dataset(tx, admin, source.id, { title: "March", sourcePublishedAt: ago(70), publishedAt: ago(50) });
      const port = providerFor(admin);
      const at = (asOf: string) => port.discover(byType({ asOf }));
      const [t200, t80] = [ago(200).toISOString(), ago(80).toISOString()];

      const latest = await port.discover(byType());
      expect(latest).toMatchObject({ mode: "BY_TYPE", policy: "dc-version-selection-v1", asOfExplicit: false, status: "FOUND" });
      expect(latest.selected?.version.versionId).toBe(march.version.id);
      expect(idsOf(latest)).toEqual([march.version.id, january.version.id]);

      const between = await at(t80);
      expect(between).toMatchObject({ status: "FOUND", asOfExplicit: true, asOf: t80 });
      expect(between.selected?.version.versionId).toBe(january.version.id);
      expect(between.notInForce).toEqual([{ versionId: march.version.id, reason: "NOT_PUBLISHED_AT_AS_OF" }]);
      expect(await at(t200)).toMatchObject({ status: "NOT_IN_FORCE", selected: null, candidates: [] });
      // The same request, instant and versions give the same answer.
      expect(await at(t80)).toEqual(between);
    });
  });

  it("chooses among competing versions by the written policy, lists them all with the preferred first, and breaks a tie by the smaller id", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const older = await dataset(tx, admin, source.id, { sourcePublishedAt: ago(40) });
      const newer = await dataset(tx, admin, source.id, { sourcePublishedAt: ago(10) });
      const port = providerFor(admin);
      const competing = await port.discover(byType());
      expect(idsOf(competing)).toEqual([newer.version.id, older.version.id]);
      expect(competing.selected?.version.versionId).toBe(newer.version.id);

      const sourceDate = ago(5);
      const tied = [await dataset(tx, admin, source.id, { sourcePublishedAt: sourceDate }), await dataset(tx, admin, source.id, { sourcePublishedAt: sourceDate }), await dataset(tx, admin, source.id, { sourcePublishedAt: sourceDate })];
      // The same source date and the same publication instant: only the id can decide.
      await withoutImmutability(tx, "DataCenterEvent", () => tx.$executeRaw`UPDATE "DataCenterEvent" SET "createdAt" = ${ago(2)} WHERE "toStatus" = 'PUBLISHED'::"DataCenterLifecycle" AND "itemId" IN (${tied[0]!.id}, ${tied[1]!.id}, ${tied[2]!.id})`);
      const expected = tied.map((item) => item.version.id).sort();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await port.discover(byType());
        expect(idsOf(result).slice(0, 3)).toEqual(expected);
        expect(result.selected?.version.versionId).toBe(expected[0]);
      }
    });
  });

  it("says when the listing of versions in force was cut, and still selects the preferred of all of them", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const created = [];
      for (let index = 0; index < 21; index += 1) created.push(await dataset(tx, admin, source.id, { sourcePublishedAt: ago(100 - index) }));
      const result = await providerFor(admin).discover(byType());
      expect(result).toMatchObject({ status: "FOUND", truncated: true });
      expect(result.candidates).toHaveLength(20);
      expect(result.selected?.version.versionId).toBe(created[20]!.version.id);
    });
  });

  // ------------------------------------------------------------------------------------------------------------------- geography
  it("narrows a selection by the structured coverage the Data Center stores, and tells no coverage apart from nothing available", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const riyadh = await dataset(tx, admin, source.id, { title: "Riyadh", coverage: { countryCodes: ["SA"], regionCodes: ["SA-01"], boundingBox: riyadhBox } });
      const dubai = await dataset(tx, admin, source.id, { title: "Dubai", coverage: { countryCodes: ["AE"], regionCodes: ["AE-DU"], boundingBox: dubaiBox } });
      await dataset(tx, admin, source.id, { title: "Undeclared" });
      const port = providerFor(admin);
      const selectedBy = async (geography: Geography) => {
        const discovery = await port.discover(byType({ geography }));
        return { status: discovery.status, ids: idsOf(discovery).sort() };
      };

      expect(await selectedBy({ countryCodes: ["SA"] })).toEqual({ status: "FOUND", ids: [riyadh.version.id] });
      expect(await selectedBy({ countryCodes: ["SA", "AE"] })).toEqual({ status: "FOUND", ids: [riyadh.version.id, dubai.version.id].sort() });
      expect(await selectedBy({ regionCodes: ["AE-DU"] })).toEqual({ status: "FOUND", ids: [dubai.version.id] });
      expect(await selectedBy({ boundingBox: { west: 46.5, south: 24.6, east: 46.9, north: 24.8 } })).toEqual({ status: "FOUND", ids: [riyadh.version.id] });
      // Every filter given must hold, and boxes that touch intersect.
      expect(await selectedBy({ countryCodes: ["SA"], regionCodes: ["AE-DU"] })).toEqual({ status: "NO_COVERAGE", ids: [] });
      expect(await selectedBy({ boundingBox: { west: 47.3, south: 25.1, east: 48.0, north: 26.0 } })).toEqual({ status: "FOUND", ids: [riyadh.version.id] });
      // A dataset that never declared its coverage matches no place; the Data Center never turns "unknown" into "everywhere".
      expect(await selectedBy({ boundingBox: jeddahBox })).toEqual({ status: "NO_COVERAGE", ids: [] });
      expect(await selectedBy({ countryCodes: ["EG"] })).toEqual({ status: "NO_COVERAGE", ids: [] });
      expect(await port.discover(byType({ typeKey: "knowledge", geography: { countryCodes: ["SA"] } }))).toMatchObject({ status: "NOT_AVAILABLE", candidates: [] });
    });
  });

  // ---------------------------------------------------------------------------------------------------------------------- content
  it.each<[string, string, string]>([
    ["text that is not JSON", "this is not json", "INVALID_GEOJSON"],
    ["an empty collection", JSON.stringify({ type: "FeatureCollection", features: [] }), "INVALID_GEOJSON"],
    ["a CRS member: only WGS84 is accepted", JSON.stringify({ type: "FeatureCollection", crs: { type: "name", properties: { name: "EPSG:32638" } }, features: [{ type: "Feature", properties: {}, geometry: null }] }), "GEOJSON_WGS84_REQUIRED"],
    ["a longitude out of range", JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [466.7, 24.7] } }] }), "INVALID_GEOJSON_COORDINATES"],
    ["a polygon ring that is not closed", JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] } }] }), "INVALID_GEOJSON_COORDINATES"],
    ["an element that is not a feature", JSON.stringify({ type: "FeatureCollection", features: [{ type: "Point", coordinates: [0, 0] }] }), "INVALID_GEOJSON_FEATURE"],
  ])("refuses %s as its own outcome with the Data Center's code, and repairs nothing", async (_name, content, code) => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const item = await dataset(tx, admin, source.id, { content });
      expect(await providerFor(admin).readContent({ versionId: item.version.id, expectedChecksum: item.version.checksum })).toEqual({ status: "CONTENT_INVALID", code });
    });
  });

  it("refuses a dataset that is not spatial, and a version whose stored content no longer matches its checksum, and returns nothing of either", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const table = await dataset(tx, admin, source.id, { typeKey: "dataset", content: "name,count\nA,1" });
      const tampered = await dataset(tx, admin, source.id, { content: geojson("original") });
      await withoutImmutability(tx, "DataCenterVersion", () => tx.$executeRaw`UPDATE "DataCenterVersion" SET "content" = ${geojson("tampered")} WHERE "id" = ${tampered.version.id}`);
      const port = providerFor(admin);
      expect(await port.readContent({ versionId: table.version.id })).toEqual({ status: "NOT_SPATIAL" });
      const outcome = await port.readContent({ versionId: tampered.version.id, expectedChecksum: tampered.version.checksum });
      expect(outcome).toEqual({ status: "INTEGRITY_FAILED" });
      expect(JSON.stringify(outcome)).not.toContain("tampered");
    });
  });

  // ------------------------------------------------------------------------------------------------------------ no silent fallback
  it("never substitutes another version: a superseded pin is not available, and the newer version is not returned in its place", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const item = await dataset(tx, admin, source.id, { content: geojson("first") });
      const draft = await createDataCenterVersion({ itemId: item.id, title: "Revised", content: geojson("second"), evidenceStatus: "ESTIMATED", reason: "New evidence" }, admin);
      await publish(item.id, admin);
      const port = providerFor(admin);
      expect(await port.discover(exact(item.version.id))).toMatchObject({ status: "NOT_AVAILABLE", selected: null, candidates: [] });
      expect(await port.readContent({ versionId: item.version.id })).toEqual({ status: "NOT_AVAILABLE" });
      expect((await port.readContent({ versionId: draft.id })).status).toBe("OK");
      // A pin on the newer version with the older version's checksum is refused, not served.
      expect(await port.readContent({ versionId: draft.id, expectedChecksum: item.version.checksum })).toEqual({ status: "PIN_CONTENT_CHANGED" });
      // By type, the newer version is the one in force now.
      expect((await port.discover(byType())).selected?.version.versionId).toBe(draft.id);
    });
  });

  // ---------------------------------------------------------------------------------------------------------- the whole resolution
  it("resolves exact pins and selections by type into engine inputs with the Data Center's own statements, and uses no fallback when one cannot be used", async () => {
    await isolated(async (tx, admin) => {
      const open = await platformSource(admin, { licenseClass: "OPEN_LICENSE", allowExport: true, attribution: "© Open Authority" });
      const restricted = await platformSource(admin, { licenseClass: "RESTRICTED", allowExport: false, ownership: "PLATFORM_OWNED", usagePolicy: "Internal analysis only" });
      const hospitals = await dataset(tx, admin, open.id, { title: "Riyadh hospitals", content: geojson("H1", "H2"), sourcePublishedAt: ago(20), coverage: { countryCodes: ["SA"], regionCodes: ["SA-01"], boundingBox: riyadhBox } });
      const schools = await dataset(tx, admin, restricted.id, { title: "Riyadh schools", typeKey: "geojson", content: geojson("S1"), sourcePublishedAt: ago(10), coverage: { countryCodes: ["SA"], boundingBox: riyadhBox } });
      await recordDataCenterQualityAssessment({ versionId: hospitals.version.id, status: "MEASURED", score: 0.82, method: "register-check", methodVersion: "2", measuredAt: ago(10).toISOString(), explanation: "Compared with the official register" }, admin);

      const requests: DataSourceRequest[] = [
        { role: "poi:hospital", selection: exact(hospitals.version.id) },
        { role: "poi:school", selection: byType({ geography: { boundingBox: { west: 46.5, south: 24.6, east: 46.9, north: 24.8 } } }) },
        { role: "poi:missing", selection: exact("cmissing000000000000000000") },
      ];
      const result = await resolveSpatialDataSources({ requests, port: providerFor(admin), evaluatedAt: EVALUATED_AT });

      expect(result.sources.map((source) => [source.role, source.status])).toEqual([["poi:hospital", "RESOLVED"], ["poi:missing", "NOT_AVAILABLE"], ["poi:school", "RESOLVED"]]);
      expect(result.gaps.map((gap) => [gap.code, gap.subject])).toEqual(expect.arrayContaining([["DATASET_NOT_AVAILABLE", "poi:missing"]]));
      expect(result.inputs).toHaveLength(2);
      for (const input of result.inputs) expect(engineInputSchema.safeParse(input).success).toBe(true);
      const hospital = result.inputs.find((input) => input.ref.id === hospitals.version.id)!;
      expect(hospital).toMatchObject({
        id: `dc:${hospitals.version.id}`, roles: ["poi:hospital"], governance: "DC_PUBLISHED", checksum: { algorithm: "SHA-256", value: hospitals.version.checksum }, ownership: "THIRD_PARTY",
        license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", allowExport: true, attribution: { text: "© Open Authority", required: true }, completeness: "UNKNOWN",
        quality: { status: "MEASURED", score: 0.82, method: "register-check", methodVersion: "2" },
        coverage: { crs: "WGS84", countryCodes: ["SA"], regionCodes: ["SA-01"], boundingBox: riyadhBox }, freshness: { status: "FRESH" },
      });
      const school = result.inputs.find((input) => input.ref.id === schools.version.id)!;
      expect(school).toMatchObject({ roles: ["poi:school"], licenseClass: "RESTRICTED", allowExport: false, ownership: "PLATFORM_OWNED", usagePolicy: "Internal analysis only", quality: { status: "UNAVAILABLE" } });
      const schoolSource = result.sources.find((source) => source.role === "poi:school");
      expect(schoolSource).toMatchObject({ status: "RESOLVED", trace: { mode: "BY_TYPE", policy: "dc-version-selection-v1", selectedVersionId: schools.version.id } });
    });
  });

  it("uses no fallback to the runner-up when the preferred version cannot be used: it reports the reason and selects nothing else", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const sound = await dataset(tx, admin, source.id, { title: "Older but sound", sourcePublishedAt: ago(40) });
      const invalid = await dataset(tx, admin, source.id, { title: "Newer but invalid", sourcePublishedAt: ago(5), content: "this is not json" });
      const request: DataSourceRequest = { role: "poi:hospital", selection: byType() };
      const result = await resolveSpatialDataSources({ requests: [request], port: providerFor(admin), evaluatedAt: EVALUATED_AT });
      expect(result.sources[0]).toMatchObject({ status: "CONTENT_INVALID", trace: { selectedVersionId: invalid.version.id } });
      expect(result.inputs).toEqual([]);
      expect(result.gaps.map((gap) => gap.code)).toEqual(["DATA_CENTER_CONTENT_INVALID"]);

      // A pin on the sound version reads it: the choice was the policy's, and the soundness of the older version is not in doubt.
      const pinned = await resolveSpatialDataSources({ requests: [{ role: "poi:hospital", selection: exact(sound.version.id) }], port: providerFor(admin), evaluatedAt: EVALUATED_AT });
      expect(pinned.inputs.map((input) => input.ref.id)).toEqual([sound.version.id]);
    });
  });

  it("reports the datasets it chose among, and states a tampered version as an integrity failure rather than reading its neighbour", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const older = await dataset(tx, admin, source.id, { sourcePublishedAt: ago(40) });
      const newer = await dataset(tx, admin, source.id, { sourcePublishedAt: ago(5) });
      const competing = await resolveSpatialDataSources({ requests: [{ role: "poi:hospital", selection: byType() }], port: providerFor(admin), evaluatedAt: EVALUATED_AT });
      expect(competing.sources[0]).toMatchObject({ status: "RESOLVED", trace: { selectedVersionId: newer.version.id, candidateVersionIds: [newer.version.id, older.version.id], candidatesTruncated: false } });
      expect(competing.gaps.map((gap) => [gap.code, gap.severity])).toEqual([["DATA_CENTER_COMPETING_DATASETS", "INFO"]]);

      await withoutImmutability(tx, "DataCenterVersion", () => tx.$executeRaw`UPDATE "DataCenterVersion" SET "content" = ${geojson("tampered")} WHERE "id" = ${newer.version.id}`);
      const tampered = await resolveSpatialDataSources({ requests: [{ role: "poi:hospital", selection: byType() }], port: providerFor(admin), evaluatedAt: EVALUATED_AT });
      expect(tampered.sources[0]).toMatchObject({ status: "INTEGRITY_FAILED" });
      expect(tampered.inputs).toEqual([]);
      expect(tampered.gaps.map((gap) => gap.code)).toEqual(["DATA_CENTER_INTEGRITY_FAILED"]);
    });
  });

  it("reports no coverage, nothing in force and an unavailable type as their own gaps through the whole resolution", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      await dataset(tx, admin, source.id, { sourcePublishedAt: ago(20), publishedAt: ago(10), coverage: { countryCodes: ["SA"], boundingBox: riyadhBox } });
      const requests: DataSourceRequest[] = [
        { role: "a:coverage", selection: byType({ geography: { boundingBox: jeddahBox } }) },
        { role: "b:in-force", selection: byType({ asOf: ago(100).toISOString() }) },
        { role: "c:type", selection: byType({ typeKey: "knowledge" }) },
      ];
      const result = await resolveSpatialDataSources({ requests, port: providerFor(admin), evaluatedAt: EVALUATED_AT });
      expect(result.sources.map((entry) => entry.status)).toEqual(["NO_COVERAGE", "NOT_IN_FORCE", "NOT_AVAILABLE"]);
      expect(result.gaps.map((gap) => gap.code).sort()).toEqual(["DATASET_NOT_AVAILABLE", "DATA_CENTER_NOT_IN_FORCE", "NO_COVERAGE"]);
      expect(result.inputs).toEqual([]);
    });
  });

  // ------------------------------------------------------------------------------------------------- the selections of a request
  const requestFor = (location: unknown, selections: Record<string, unknown>) => normalizeSpatialRequest({
    contract: SPATIAL_REQUEST_CONTRACT, analyses: ["LOCATION_CONTEXT"], location, parameters: { roles: Object.keys(selections) }, data: { roles: selections },
  }, { environment: "test", now: () => NOW }).normalized;

  it("serves the selections of a request: an exact version, a type as of an instant, and a type narrowed to the place the request is about", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const older = await dataset(tx, admin, source.id, { title: "Riyadh hospitals", sourcePublishedAt: ago(40), publishedAt: ago(30), coverage: { countryCodes: ["SA"], boundingBox: riyadhBox } });
      const newer = await dataset(tx, admin, source.id, { title: "Riyadh hospitals 2026", sourcePublishedAt: ago(5), publishedAt: ago(2), coverage: { countryCodes: ["SA"], boundingBox: riyadhBox } });
      const dubai = await dataset(tx, admin, source.id, { title: "Dubai hospitals", sourcePublishedAt: ago(1), publishedAt: ago(1), coverage: { countryCodes: ["AE"], boundingBox: dubaiBox } });
      const request = requestFor({ type: "Point", coordinates: [46.67, 24.71] }, {
        "poi:hospital": { source: "DATA_CENTER", versionId: older.version.id },
        "poi:school": { source: "DATA_CENTER", typeKey: "geojson", asOf: ago(20).toISOString() },
        "poi:clinic": { source: "DATA_CENTER", typeKey: "geojson" },
      });
      const requests = dataSourceRequestsOf(request.data.roles, { geography: targetGeography([request.location], 5000) });
      const result = await resolveSpatialDataSources({ requests, port: providerFor(admin), evaluatedAt: EVALUATED_AT });

      expect(result.sources.map((entry) => [entry.role, entry.status])).toEqual([["poi:clinic", "RESOLVED"], ["poi:hospital", "RESOLVED"], ["poi:school", "RESOLVED"]]);
      // The clinic is the latest dataset that covers the place: Dubai's is newer still, and is never chosen for Riyadh.
      expect(result.sources[0]).toMatchObject({ trace: { selectedVersionId: newer.version.id, candidateVersionIds: [newer.version.id, older.version.id] } });
      // As of twenty days ago the newer dataset was not yet published, so the school dataset is the older one; the exact pin is the older one as given.
      expect(result.sources[2]).toMatchObject({ trace: { selectedVersionId: older.version.id, asOfExplicit: true, candidateVersionIds: [older.version.id] } });
      expect(result.sources[1]).toMatchObject({ trace: { mode: "EXACT", selectedVersionId: older.version.id } });
      // Two roles resolve to the same version: one input serves both.
      expect(result.inputs.map((input) => [input.ref.id, input.roles])).toEqual([[older.version.id, ["poi:hospital", "poi:school"]], [newer.version.id, ["poi:clinic"]]].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
      expect(JSON.stringify(result)).not.toContain(dubai.version.id);
      expect(result.gaps.map((gap) => [gap.code, gap.subject])).toEqual([["DATA_CENTER_COMPETING_DATASETS", "poi:clinic"]]);
    });
  });

  it("finds no dataset for a place nothing covers, by type, while an exact pin is used as given and states the coverage it declares", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const riyadh = await dataset(tx, admin, source.id, { title: "Riyadh hospitals", coverage: { countryCodes: ["SA"], boundingBox: riyadhBox } });
      const jeddah = { type: "Point", coordinates: [39.2, 21.5] };
      const request = requestFor(jeddah, { "poi:hospital": { source: "DATA_CENTER", versionId: riyadh.version.id }, "poi:school": { source: "DATA_CENTER", typeKey: "geojson" } });
      const requests = dataSourceRequestsOf(request.data.roles, { geography: targetGeography([request.location], 5000) });
      const result = await resolveSpatialDataSources({ requests, port: providerFor(admin), evaluatedAt: EVALUATED_AT });
      expect(result.sources.map((entry) => [entry.role, entry.status])).toEqual([["poi:hospital", "RESOLVED"], ["poi:school", "NO_COVERAGE"]]);
      expect(result.inputs[0]).toMatchObject({ roles: ["poi:hospital"], coverage: { boundingBox: riyadhBox } });
      expect(result.gaps.map((gap) => [gap.code, gap.subject])).toEqual([["NO_COVERAGE", "poi:school"]]);
    });
  });

  // ---------------------------------------------------------------------------------- a Map release bound to a Data Center version
  const layerAddress = { releaseId: RELEASE_ID, layerKey: "places" };
  const mapLayer = (registered = true) => buildMapLayerInput({
    layerKey: "places", roles: ["place:locality"], release: publishedRelease, boundary: realBoundary(), provenance: osmProvenance, registered, evaluatedAt: EVALUATED_AT,
  });
  const bindingFor = (reference: unknown, over: Record<string, unknown> = {}) => ({
    contract: MAP_BINDING_CONTRACT, map: { releaseId: RELEASE_ID, layerKey: "places", artifactSha256: "5e6f7a8b".repeat(8), exportsArtifact: false, ...over }, reference,
  });

  it("resolves the reference a Map release is bound to through the Data Center's own Map contract, and takes the Data Center's statements for the layer", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin, { licenseClass: "OPEN_LICENSE", allowExport: true, attribution: "© Open Authority", usagePolicy: "Share-alike; credit required" });
      const item = await dataset(tx, admin, source.id, { title: "Riyadh places", coverage: { countryCodes: ["SA"], regionCodes: ["SA-01"], boundingBox: riyadhBox } });
      await recordDataCenterQualityAssessment({ versionId: item.version.id, status: "MEASURED", score: 0.82, method: "register-check", methodVersion: "2", measuredAt: ago(10).toISOString(), explanation: "Compared with the official register" }, admin);
      const port = providerFor(admin);

      // What the Map keeps for its release: the snapshot the Data Center's contract gave when the release was published.
      const snapshot = await port.resolveMapReference(item.version.id);
      expect(snapshot).toEqual(await resolveDataCenterMapReference(item.version.id, admin, NOW));
      const outcome = await reconcileMapBinding({ binding: bindingFor(snapshot), layer: layerAddress, port });
      expect(outcome).toMatchObject({ status: "RECONCILED", findings: [] });
      const layer = mapLayer();
      const { input, gaps } = applyMapBinding(layer, outcome, EVALUATED_AT);
      expect(engineInputSchema.safeParse(input).success).toBe(true);
      // The Map's layer and artifact; the Data Center's rights, quality, source and coverage.
      expect(input).toMatchObject({
        id: layer.id, kind: "MAP_LAYER", governance: "MAP_REGISTERED", ref: { system: "JENAN_MAP", id: `${RELEASE_ID}/places` }, checksum: { value: "5e6f7a8b".repeat(8) },
        licenseClass: "OPEN_LICENSE", allowExport: true, usagePolicy: "Share-alike; credit required", attribution: { text: "© Open Authority", required: true },
        quality: { status: "MEASURED", score: 0.82, method: "register-check", methodVersion: "2" }, freshness: { status: "FRESH" },
        coverage: { countryCodes: ["SA"], regionCodes: ["SA-01"], boundingBox: riyadhBox },
      });
      expect(gaps).toEqual([]);
      expect(layer).toMatchObject({ licenseClass: null, allowExport: false, quality: { status: "UNAVAILABLE" } });
    });
  });

  it("no longer accepts a reference to a version the Data Center has superseded: the layer is unregistered, and no newer version is looked up in its place", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const item = await dataset(tx, admin, source.id, { content: geojson("first") });
      const port = providerFor(admin);
      const snapshot = await port.resolveMapReference(item.version.id);
      await createDataCenterVersion({ itemId: item.id, title: "Revised", content: geojson("second"), evidenceStatus: "ESTIMATED", reason: "New evidence" }, admin);
      await publish(item.id, admin);

      const outcome = await reconcileMapBinding({ binding: bindingFor(snapshot), layer: layerAddress, port });
      expect(outcome).toMatchObject({ status: "NOT_REGISTERED", refusal: "VERSION_UNAVAILABLE", findings: [{ code: "DATA_CENTER_VERSION_UNAVAILABLE", blocking: true }] });
      const { input, gaps } = applyMapBinding(mapLayer(), outcome, EVALUATED_AT);
      expect(input).toMatchObject({ governance: "MAP_UNREGISTERED", licenseClass: null, allowExport: false, quality: { status: "UNAVAILABLE" } });
      expect(gaps.map((gap) => gap.code)).toEqual(["MAP_DATA_CENTER_BINDING_REFUSED"]);
    });
  });

  it("does not tell a hidden version from a missing one, and a robot with no grant gets the same answer", async () => {
    await isolated(async (tx, admin) => {
      const owner = await user(tx, "owner");
      const stranger = await user(tx, "stranger");
      const privateSource = await createDataCenterSource({ name: "Private", kind: "MANUAL", scope: "PRIVATE", owner: "Owner", license: "Internal" }, owner);
      const hidden = await dataset(tx, admin, privateSource.id);
      const snapshot = await providerFor(owner).resolveMapReference(hidden.version.id);
      expect(snapshot).not.toBeNull();
      const { identity } = await robot(tx, admin, []);

      const refused = async (actor: DataCenterActor, reference: unknown) => reconcileMapBinding({ binding: bindingFor(reference), layer: layerAddress, port: providerFor(actor) });
      const missing = await refused(stranger, { ...(snapshot as object), version: { ...(snapshot as { version: object }).version, versionId: "cmissing000000000000000000" } });
      expect(missing).toMatchObject({ status: "NOT_REGISTERED", refusal: "VERSION_UNAVAILABLE" });
      expect(await refused(stranger, snapshot)).toEqual(missing);
      expect(await refused(identity, snapshot)).toEqual(missing);
      expect((await refused(owner, snapshot)).status).toBe("RECONCILED");
    });
  });

  it("uses what the Data Center says now when it changed something that does not decide the layer since the snapshot, and reports it", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin, { licenseClass: "OPEN_LICENSE", usagePolicy: "Share-alike; credit required" });
      const item = await dataset(tx, admin, source.id);
      const port = providerFor(admin);
      const current = (await port.resolveMapReference(item.version.id))!;
      // The snapshot the release kept was taken when the Data Center stated other rights.
      const older = { ...current, rights: { ...current.rights, licenseClass: "LICENSED", usagePolicy: "Licensed for display only" } };
      const outcome = await reconcileMapBinding({ binding: bindingFor(older), layer: layerAddress, port });
      expect(outcome).toMatchObject({ status: "RECONCILED" });
      expect(outcome.findings.map((finding) => finding.code)).toEqual(["LICENSE_CLASS_CHANGED", "USAGE_POLICY_CHANGED"]);
      const { input, gaps } = applyMapBinding(mapLayer(), outcome, EVALUATED_AT);
      expect(input).toMatchObject({ licenseClass: "OPEN_LICENSE", usagePolicy: "Share-alike; credit required" });
      expect(gaps.map((gap) => [gap.code, gap.severity])).toEqual([["MAP_DATA_CENTER_BINDING_CHANGED", "INFO"]]);
    });
  });

  it("refuses a snapshot whose content digest is not the version's, and a binding that does not satisfy the Data Center's contract", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const item = await dataset(tx, admin, source.id);
      const port = providerFor(admin);
      const current = (await port.resolveMapReference(item.version.id))!;
      const tampered = await reconcileMapBinding({ binding: bindingFor({ ...current, version: { ...current.version, checksum: { algorithm: "SHA-256", value: "0".repeat(64) } } }), layer: layerAddress, port });
      expect(tampered).toMatchObject({ status: "NOT_REGISTERED", refusal: "INCONSISTENT" });
      expect(tampered.findings.filter((finding) => finding.blocking).map((finding) => finding.code)).toEqual(["CHECKSUM_MISMATCH"]);
      expect(await reconcileMapBinding({ binding: { ...bindingFor(current), note: "extra" }, layer: layerAddress, port })).toEqual({ status: "NOT_REGISTERED", refusal: "BINDING_INVALID", findings: [] });
      expect(await reconcileMapBinding({ binding: bindingFor(current), layer: { releaseId: RELEASE_ID, layerKey: "pois" }, port })).toEqual({ status: "NOT_REGISTERED", refusal: "BINDING_FOR_ANOTHER_LAYER", findings: [] });
    });
  });

  // --------------------------------------------------------------------------------------------------------------------- effects
  it("writes nothing: no usage record, no audit entry, no lifecycle event, no new version, however many datasets it reads or is refused", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const item = await dataset(tx, admin, source.id, { coverage: { countryCodes: ["SA"], boundingBox: riyadhBox } });
      const stranger = await user(tx, "stranger");
      const before = await counts(tx);
      const port = providerFor(admin);
      await port.discover(exact(item.version.id));
      await port.discover(byType({ geography: { countryCodes: ["SA"] } }));
      await port.readContent({ versionId: item.version.id, expectedChecksum: item.version.checksum });
      await port.readContent({ versionId: item.version.id, expectedChecksum: "0".repeat(64) });
      await providerFor(stranger).readContent({ versionId: "missing" });
      await port.resolveMapReference(item.version.id);
      await providerFor(stranger).resolveMapReference(item.version.id);
      await reconcileMapBinding({ binding: bindingFor(await port.resolveMapReference(item.version.id)), layer: layerAddress, port });
      await resolveSpatialDataSources({ requests: [{ role: "poi:hospital", selection: exact(item.version.id) }, { role: "poi:other", selection: byType() }], port, evaluatedAt: EVALUATED_AT });
      expect(await counts(tx)).toEqual(before);
    });
  });
});
