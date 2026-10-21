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
import { createDataCenterConflict, createDataCenterItem, createDataCenterSource, createDataCenterVersion, resolveDataCenterConflict, reviewDataCenterItem, transitionDataCenterItem } from "@/services/data-center/service";
import { grantDataCenterRobotAccess, revokeDataCenterRobotAccess } from "@/services/data-center/robot-grants";
import { recordDataCenterQualityAssessment } from "@/services/data-center/quality";
import { mapReferenceSchema } from "@/services/data-center/map-contract";
import { discoverDataCenterVersions, type DataCenterDiscoveryResult } from "@/services/data-center/discovery";
import type { DataCenterActor } from "@/services/data-center/contracts";

const enabled = process.env.DATA_CENTER_DATABASE_TESTS === "1";
const rollback = new Error("ROLLBACK_DATA_CENTER_TEST");
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const NOW = new Date();

async function isolated(run: (tx: DbExecutor, admin: DataCenterActor) => Promise<void>) {
  const actual = context.actual as typeof db;
  await expect(actual.$transaction(async (tx) => {
    context.tx = tx;
    try {
      const user = await tx.user.create({ data: { email: `data-center-${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
      await run(tx, { id: user.id, systemRole: "ADMIN", kind: "HUMAN" });
      throw rollback;
    } finally { context.tx = null; }
  }, { timeout: 60_000 })).rejects.toBe(rollback);
}
async function publish(itemId: string, actor: DataCenterActor) {
  await transitionDataCenterItem({ itemId, status: "IN_REVIEW", reason: "Submit reviewed source" }, actor);
  await reviewDataCenterItem({ itemId, decision: "APPROVED", notes: "Methodology reviewed; evidence label retained" }, actor);
  await transitionDataCenterItem({ itemId, status: "APPROVED", reason: "Approval recorded" }, actor);
  await transitionDataCenterItem({ itemId, status: "PUBLISHED", reason: "Release labelled estimate" }, actor);
}
/** Test-only: the Data Center's tables are append-only, so setting a past publication date needs the immutability trigger off for a moment, inside the rolled-back transaction. */
async function withoutImmutability(tx: DbExecutor, table: "DataCenterEvent" | "DataCenterVersion", work: () => Promise<unknown>) {
  await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${table}_immutable"`);
  try { await work(); } finally { await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER "${table}_immutable"`); }
}
const backdatePublication = (tx: DbExecutor, itemId: string, when: Date) => withoutImmutability(tx, "DataCenterEvent", () =>
  tx.$executeRaw`UPDATE "DataCenterEvent" SET "createdAt" = ${when} WHERE "itemId" = ${itemId} AND "toStatus" = 'PUBLISHED'::"DataCenterLifecycle"`);

const geojson = (...names: string[]) => JSON.stringify({ type: "FeatureCollection", features: names.map((name, index) => ({ type: "Feature", properties: { name }, geometry: { type: "Point", coordinates: [46.67 + index * 0.01, 24.71] } })) });
const riyadhBox = { west: 46.0, south: 24.3, east: 47.3, north: 25.1 };
const dubaiBox = { west: 54.9, south: 24.7, east: 55.7, north: 25.4 };
const platformSource = (admin: DataCenterActor, over: Record<string, unknown> = {}) => createDataCenterSource({
  name: `Source ${randomUUID()}`, kind: "OFFICIAL", scope: "PLATFORM", owner: "Authority", license: "ODbL-1.0", allowExport: false, freshnessDays: 365,
  ownership: "THIRD_PARTY", licenseClass: "OPEN_LICENSE", usagePolicy: "Share-alike; credit required", attribution: "© Authority", attributionRequired: true, ...over,
} as Parameters<typeof createDataCenterSource>[0], admin);

interface DatasetOptions {
  title?: string; typeKey?: string; content?: string; sourcePublishedAt?: Date; publishedAt?: Date; coverage?: Record<string, unknown>;
  expiresAt?: Date; effectiveFrom?: Date; effectiveTo?: Date; specialties?: string[]; requiredPermission?: string; attribution?: string;
}
async function dataset(tx: DbExecutor, admin: DataCenterActor, sourceId: string, over: DatasetOptions = {}) {
  const item = await createDataCenterItem({
    sourceId, title: over.title ?? `Hospitals ${randomUUID().slice(0, 8)}`, typeKey: over.typeKey ?? "geojson", layer: "DATA", content: over.content ?? geojson("a"), evidenceStatus: "ESTIMATED",
    sourcePublishedAt: (over.sourcePublishedAt ?? ago(30)).toISOString(),
    ...(over.expiresAt ? { expiresAt: over.expiresAt.toISOString() } : {}), ...(over.effectiveFrom ? { effectiveFrom: over.effectiveFrom.toISOString() } : {}), ...(over.effectiveTo ? { effectiveTo: over.effectiveTo.toISOString() } : {}),
    ...(over.coverage ? { coverage: over.coverage } : {}), ...(over.specialties ? { specialties: over.specialties } : {}), ...(over.requiredPermission ? { requiredPermission: over.requiredPermission } : {}),
    ...(over.attribution ? { attribution: over.attribution } : {}),
  } as Parameters<typeof createDataCenterItem>[0], admin);
  await publish(item.id, admin);
  if (over.publishedAt) await backdatePublication(tx, item.id, over.publishedAt);
  return item;
}
const user = async (tx: DbExecutor, label = "user"): Promise<DataCenterActor> => {
  const created = await tx.user.create({ data: { email: `${label}-${randomUUID()}@example.test`, status: "ACTIVE" } });
  return { id: created.id, systemRole: "USER", kind: "HUMAN" };
};
const versionIds = (result: DataCenterDiscoveryResult) => result.candidates.map((candidate) => candidate.reference.version.versionId);
const NOW_OPTIONS = { now: NOW };

afterAll(async () => { if (enabled) await (context.actual as typeof db).$disconnect(); });

describe.skipIf(!enabled)("discoverDataCenterVersions on real PostgreSQL (always rolled back)", () => {
  // ---------------------------------------------------------------------------------------------------------- exact versions
  it("returns the metadata of an exact published version, literally, as the Map contract states it, and never its content", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const content = geojson("Hayy Alpha", "Hayy Beta");
      const item = await dataset(tx, admin, source.id, { title: "Riyadh neighbourhoods", content, attribution: "© Authority, Riyadh 2026", coverage: { countryCodes: ["SA"], regionCodes: ["SA-01"], boundingBox: riyadhBox } });
      const result = await discoverDataCenterVersions({ versionIds: [item.version.id] }, admin, NOW_OPTIONS);
      expect(result).toMatchObject({ mode: "EXACT", policy: "exact-version", asOf: null, status: "FOUND", selected: null, unavailableVersionIds: [], notInForce: [], truncated: false });
      expect(versionIds(result)).toEqual([item.version.id]);
      const reference = result.candidates[0]!.reference;
      expect(mapReferenceSchema.parse(reference)).toEqual(reference);
      expect(reference).toMatchObject({
        dataset: { itemId: item.id, title: "Riyadh neighbourhoods", typeKey: "geojson", layer: "DATA" },
        version: { versionId: item.version.id, number: 1, checksum: { algorithm: "SHA-256", value: item.version.checksum }, evidenceStatus: "ESTIMATED", origin: "HUMAN" },
        source: { sourceId: source.id, kind: "OFFICIAL", scope: "PLATFORM" },
        ownership: { ownership: "THIRD_PARTY", owner: "Authority" },
        rights: { license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", usagePolicy: "Share-alike; credit required", allowExport: false, attribution: { text: "© Authority, Riyadh 2026", required: true, level: "VERSION" } },
        coverage: { crs: "WGS84", countryCodes: ["SA"], regionCodes: ["SA-01"], boundingBox: riyadhBox },
        quality: { status: "UNAVAILABLE" }, publication: { status: "PUBLISHED", publishedVersion: 1 },
      });
      expect(reference.publication.publishedAt).not.toBeNull();
      expect(reference.freshness).toMatchObject({ status: "FRESH", freshnessDays: 365 });
      expect(JSON.stringify(result)).not.toContain("Hayy Alpha");
      expect(JSON.stringify(result)).not.toContain("FeatureCollection");
    });
  });

  it("uses the exact version as given: an unpublished draft or a superseded version is not available, and nothing is chosen in its place", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const item = await dataset(tx, admin, source.id);
      const draft = await createDataCenterVersion({ itemId: item.id, title: "Revised", content: geojson("b"), evidenceStatus: "ESTIMATED", reason: "New evidence" }, admin);
      const first = await discoverDataCenterVersions({ versionIds: [draft.id, item.version.id] }, admin, NOW_OPTIONS);
      expect(versionIds(first)).toEqual([item.version.id]);
      expect(first).toMatchObject({ status: "NOT_AVAILABLE", unavailableVersionIds: [draft.id] });
      await publish(item.id, admin);
      const second = await discoverDataCenterVersions({ versionIds: [item.version.id, draft.id] }, admin, NOW_OPTIONS);
      expect(versionIds(second)).toEqual([draft.id]);
      expect(second.unavailableVersionIds).toEqual([item.version.id]);
    });
  });

  it("answers in the order asked, once for a repeated id, and keeps the ids it could not serve in that order too", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const [a, b, c] = [await dataset(tx, admin, source.id), await dataset(tx, admin, source.id), await dataset(tx, admin, source.id)];
      const result = await discoverDataCenterVersions({ versionIds: [c.version.id, "missing-2", a.version.id, c.version.id, "missing-1", b.version.id] }, admin, NOW_OPTIONS);
      expect(versionIds(result)).toEqual([c.version.id, a.version.id, b.version.id]);
      expect(result.unavailableVersionIds).toEqual(["missing-2", "missing-1"]);
    });
  });

  // ------------------------------------------------------------------------------------------------ nothing hidden is revealed
  it("gives the same answer for a version that is hidden, forbidden, unpublished, expired, archived, not yet effective or does not exist", async () => {
    await isolated(async (tx, admin) => {
      const owner = await user(tx, "owner");
      const stranger = await user(tx, "stranger");
      const privateSource = await createDataCenterSource({ name: "Private", kind: "MANUAL", scope: "PRIVATE", owner: "Owner", license: "Internal" }, owner);
      const platform = await platformSource(admin);
      const hidden = await dataset(tx, admin, privateSource.id);
      const unpublished = await createDataCenterItem({ sourceId: platform.id, title: "Draft", typeKey: "geojson", layer: "DATA", content: geojson("d"), evidenceStatus: "ESTIMATED" }, admin);
      const expired = await dataset(tx, admin, platform.id, { expiresAt: new Date(Date.now() + DAY) });
      await withoutImmutability(tx, "DataCenterVersion", () => tx.$executeRaw`UPDATE "DataCenterVersion" SET "expiresAt" = ${ago(1)} WHERE "id" = ${expired.version.id}`);
      const archived = await dataset(tx, admin, platform.id);
      await transitionDataCenterItem({ itemId: archived.id, status: "ARCHIVED", reason: "Withdrawn" }, admin);
      const future = await dataset(tx, admin, platform.id, { effectiveFrom: new Date(Date.now() + 5 * DAY) });
      const noRetrieval = await dataset(tx, admin, (await platformSource(admin, { allowRetrieval: false })).id);

      const ids = { hidden: hidden.version.id, unpublished: unpublished.version.id, expired: expired.version.id, archived: archived.version.id, future: future.version.id, noRetrieval: noRetrieval.version.id, missing: "cmissing000000000000000000" };
      const outcomes = new Map<string, DataCenterDiscoveryResult>();
      for (const [name, id] of Object.entries(ids)) outcomes.set(name, await discoverDataCenterVersions({ versionIds: [id] }, stranger, NOW_OPTIONS));
      for (const [name, outcome] of outcomes) {
        expect(outcome.candidates, name).toEqual([]);
        expect(outcome.unavailableVersionIds, name).toEqual([ids[name as keyof typeof ids]]);
        // The whole answer is the same as for an id that never existed, apart from the id itself.
        expect({ ...outcome, unavailableVersionIds: [] }, name).toEqual({ ...(outcomes.get("missing") as DataCenterDiscoveryResult), unavailableVersionIds: [] });
      }
      // The owner of the private source reads it; the administrator reads everything that is published and in force.
      expect(versionIds(await discoverDataCenterVersions({ versionIds: [ids.hidden] }, owner, NOW_OPTIONS))).toEqual([ids.hidden]);
      for (const name of ["expired", "archived", "future", "noRetrieval", "unpublished"] as const) {
        expect((await discoverDataCenterVersions({ versionIds: [ids[name]] }, admin, NOW_OPTIONS)).unavailableVersionIds, `${name} is not served even to an administrator`).toEqual([ids[name]]);
      }
      expect(versionIds(await discoverDataCenterVersions({ versionIds: [ids.hidden] }, admin, NOW_OPTIONS))).toEqual([ids.hidden]);
    });
  });

  it("does not serve a version while an open conflict names its item, and serves it again once the conflict is resolved", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const [a, b] = [await dataset(tx, admin, source.id), await dataset(tx, admin, source.id)];
      const conflict = await createDataCenterConflict({ itemId: a.id, otherItemId: b.id, reason: "Two sources disagree" }, admin);
      expect((await discoverDataCenterVersions({ versionIds: [a.version.id, b.version.id] }, admin, NOW_OPTIONS)).candidates).toEqual([]);
      await resolveDataCenterConflict({ conflictId: conflict.id, resolution: "KEEP_BOTH", notes: "Both retained" }, admin);
      expect(versionIds(await discoverDataCenterVersions({ versionIds: [a.version.id, b.version.id] }, admin, NOW_OPTIONS)).sort()).toEqual([a.version.id, b.version.id].sort());
    });
  });

  // -------------------------------------------------------------------------------------------------------------------- access
  it("shows platform data to every user, private data to its owner, and nothing of a private source to anyone else", async () => {
    await isolated(async (tx, admin) => {
      const owner = await user(tx, "owner");
      const other = await user(tx, "other");
      const platform = await platformSource(admin);
      const mine = await createDataCenterSource({ name: "Mine", kind: "MANUAL", scope: "PRIVATE", owner: "Owner", license: "Internal" }, owner);
      const shared = await dataset(tx, admin, platform.id);
      const privateOne = await dataset(tx, admin, mine.id);
      const typeKeys = ["geojson"];
      expect(versionIds(await discoverDataCenterVersions({ typeKeys }, owner, NOW_OPTIONS)).sort()).toEqual([shared.version.id, privateOne.version.id].sort());
      expect(versionIds(await discoverDataCenterVersions({ typeKeys }, other, NOW_OPTIONS))).toEqual([shared.version.id]);
      expect(versionIds(await discoverDataCenterVersions({ typeKeys }, admin, NOW_OPTIONS)).sort()).toEqual([shared.version.id, privateOne.version.id].sort());
    });
  });

  it("applies organization membership and permissions: owners and members with the read permission see the organization's data, others do not", async () => {
    await isolated(async (tx, admin) => {
      const organization = await tx.organization.create({ data: { name: "Org", slug: `org-${randomUUID()}` } });
      const read = await tx.permission.upsert({ where: { key: "data-center.read" }, update: {}, create: { key: "data-center.read" } });
      const sensitive = await tx.permission.upsert({ where: { key: "data-center.sensitive" }, update: {}, create: { key: "data-center.sensitive" } });
      const readerRole = await tx.role.create({ data: { name: "Reader", key: `reader-${randomUUID()}`, organizationId: organization.id, permissions: { create: [{ permissionId: read.id }] } } });
      const sensitiveRole = await tx.role.create({ data: { name: "Sensitive", key: `sensitive-${randomUUID()}`, organizationId: organization.id, permissions: { create: [{ permissionId: read.id }, { permissionId: sensitive.id }] } } });
      const member = async (label: string, over: { isOwner?: boolean; roleId?: string; status?: "ACTIVE" | "INVITED" | "SUSPENDED" }) => {
        const actor = await user(tx, label);
        await tx.organizationMember.create({ data: { organizationId: organization.id, userId: actor.id, isOwner: over.isOwner ?? false, roleId: over.roleId ?? null, status: over.status ?? "ACTIVE" } });
        return actor;
      };
      const [owner, reader, privileged, noRole, suspended, invited] = [
        await member("owner", { isOwner: true }), await member("reader", { roleId: readerRole.id }), await member("privileged", { roleId: sensitiveRole.id }),
        await member("norole", {}), await member("suspended", { isOwner: true, status: "SUSPENDED" }), await member("invited", { roleId: readerRole.id, status: "INVITED" }),
      ];
      const stranger = await user(tx, "stranger");
      const orgSource = await createDataCenterSource({ name: "Org data", kind: "MANUAL", scope: "ORGANIZATION", organizationId: organization.id, owner: "Org", license: "Internal" }, admin);
      const open = await dataset(tx, admin, orgSource.id);
      const restricted = await dataset(tx, admin, orgSource.id, { requiredPermission: "data-center.sensitive" });
      const both = [open.version.id, restricted.version.id].sort();
      const seen = async (actor: DataCenterActor) => versionIds(await discoverDataCenterVersions({ typeKeys: ["geojson"] }, actor, NOW_OPTIONS)).sort();
      expect(await seen(owner)).toEqual(both);
      expect(await seen(privileged)).toEqual(both);
      expect(await seen(reader)).toEqual([open.version.id]);
      for (const outsider of [noRole, suspended, invited, stranger]) expect(await seen(outsider)).toEqual([]);
      // The organization filter narrows what the actor may already see; it grants nothing.
      expect(versionIds(await discoverDataCenterVersions({ typeKeys: ["geojson"], organizationId: organization.id }, owner, NOW_OPTIONS)).sort()).toEqual(both);
      expect(await discoverDataCenterVersions({ typeKeys: ["geojson"], organizationId: organization.id }, stranger, NOW_OPTIONS)).toMatchObject({ status: "NOT_AVAILABLE", candidates: [] });
    });
  });

  it("gives a robot no implicit access: it needs an explicit grant for the source, and loses it when the grant is revoked or the mission assignment ends", async () => {
    await isolated(async (tx, admin) => {
      const robot = await tx.robot.create({ data: { name: "Analyst", slug: `analyst-${randomUUID()}` } });
      const mission = await tx.mission.create({ data: { name: "Site study", assignedRobots: { connect: { id: robot.id } } } });
      const principal = await tx.user.create({ data: { email: `robot-${randomUUID()}@example.test`, status: "ACTIVE" } });
      const identity: DataCenterActor = { id: principal.id, systemRole: "USER", kind: "AI", robotId: robot.id, roleKey: "analyst", specialty: "demography", missionId: mission.id };
      const granted = await platformSource(admin);
      const other = await platformSource(admin);
      const reachable = await dataset(tx, admin, granted.id);
      const unreachable = await dataset(tx, admin, other.id);

      // No grant at all: the Data Center's own refusal, the same whatever is asked for.
      for (const request of [{ versionIds: [reachable.version.id] }, { versionIds: ["missing"] }, { typeKeys: ["geojson"] }]) {
        await expect(discoverDataCenterVersions(request, identity, NOW_OPTIONS)).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED", status: 403 });
      }
      const grant = await grantDataCenterRobotAccess({
        sourceId: granted.id, robotId: robot.id, principalId: principal.id, roleKey: "analyst", specialty: "demography", missionId: mission.id, access: "READ", reason: "Site study", expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
      }, admin);
      const result = await discoverDataCenterVersions({ versionIds: [reachable.version.id, unreachable.version.id] }, identity, NOW_OPTIONS);
      expect(versionIds(result)).toEqual([reachable.version.id]);
      // The source it has no grant for is indistinguishable from a version that does not exist.
      const missing = await discoverDataCenterVersions({ versionIds: ["missing"] }, identity, NOW_OPTIONS);
      expect({ ...result, candidates: [], unavailableVersionIds: [] }).toEqual({ ...missing, unavailableVersionIds: [] });
      expect(versionIds(await discoverDataCenterVersions({ typeKeys: ["geojson"] }, identity, NOW_OPTIONS))).toEqual([reachable.version.id]);

      // A robot with a different specialty than its grant has no access either.
      await expect(discoverDataCenterVersions({ typeKeys: ["geojson"] }, { ...identity, specialty: "logistics" }, NOW_OPTIONS)).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED" });
      await revokeDataCenterRobotAccess({ grantId: grant.id, reason: "Study finished" }, admin);
      await expect(discoverDataCenterVersions({ typeKeys: ["geojson"] }, identity, NOW_OPTIONS)).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED" });
    });
  });

  it("applies a robot's mission assignment and a version's specialty restriction exactly as retrieval does", async () => {
    await isolated(async (tx, admin) => {
      const robot = await tx.robot.create({ data: { name: "Analyst", slug: `analyst-${randomUUID()}` } });
      const mission = await tx.mission.create({ data: { name: "Site study", assignedRobots: { connect: { id: robot.id } } } });
      const principal = await tx.user.create({ data: { email: `robot-${randomUUID()}@example.test`, status: "ACTIVE" } });
      const identity: DataCenterActor = { id: principal.id, systemRole: "USER", kind: "AI", robotId: robot.id, roleKey: "analyst", specialty: "demography", missionId: mission.id };
      const source = await platformSource(admin);
      await grantDataCenterRobotAccess({ sourceId: source.id, robotId: robot.id, principalId: principal.id, roleKey: "analyst", specialty: "demography", missionId: mission.id, reason: "Study", expiresAt: new Date(Date.now() + 30 * DAY).toISOString() }, admin);
      const general = await dataset(tx, admin, source.id);
      const specialised = await dataset(tx, admin, source.id, { specialties: ["demography"] });
      expect(versionIds(await discoverDataCenterVersions({ typeKeys: ["geojson"] }, identity, NOW_OPTIONS))).toEqual([general.version.id]);
      expect(versionIds(await discoverDataCenterVersions({ typeKeys: ["geojson"], specialty: "demography" }, identity, NOW_OPTIONS))).toEqual([specialised.version.id]);
      await tx.mission.update({ where: { id: mission.id }, data: { assignedRobots: { disconnect: { id: robot.id } } } });
      await expect(discoverDataCenterVersions({ typeKeys: ["geojson"] }, identity, NOW_OPTIONS)).rejects.toMatchObject({ code: "ROBOT_MISSION_ASSIGNMENT_REQUIRED" });
    });
  });

  // ------------------------------------------------------------------------------------------------------------------ by type
  it("selects by type with the written policy: the later source date wins, then the later publication, then the smaller id", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const older = await dataset(tx, admin, source.id, { sourcePublishedAt: ago(90), publishedAt: ago(20) });
      const sameSource = ago(10);
      const newerSource = await dataset(tx, admin, source.id, { sourcePublishedAt: sameSource, publishedAt: ago(60) });
      const result = await discoverDataCenterVersions({ typeKeys: ["geojson"] }, admin, NOW_OPTIONS);
      expect(result).toMatchObject({ mode: "BY_TYPE", policy: "dc-version-selection-v1", status: "FOUND", asOfExplicit: false, asOf: NOW.toISOString(), unavailableVersionIds: [], truncated: false });
      expect(versionIds(result)).toEqual([newerSource.version.id, older.version.id]);
      expect(result.selected?.reference.version.versionId).toBe(newerSource.version.id);

      // The very same source date: the later publication wins.
      const sameSourceNewerPublication = await dataset(tx, admin, source.id, { sourcePublishedAt: sameSource, publishedAt: ago(5) });
      expect((await discoverDataCenterVersions({ typeKeys: ["geojson"] }, admin, NOW_OPTIONS)).selected?.reference.version.versionId).toBe(sameSourceNewerPublication.version.id);
    });
  });

  it("breaks a tie by the smaller version id, always, whatever order the datasets were created in", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const sourceDate = ago(10);
      const created = [await dataset(tx, admin, source.id, { sourcePublishedAt: sourceDate }), await dataset(tx, admin, source.id, { sourcePublishedAt: sourceDate }), await dataset(tx, admin, source.id, { sourcePublishedAt: sourceDate })];
      // Every dataset has the same source date and the same publication instant: only the id can decide.
      await withoutImmutability(tx, "DataCenterEvent", () => tx.$executeRaw`UPDATE "DataCenterEvent" SET "createdAt" = ${ago(5)} WHERE "toStatus" = 'PUBLISHED'::"DataCenterLifecycle" AND "itemId" IN (${created[0]!.id}, ${created[1]!.id}, ${created[2]!.id})`);
      const expected = created.map((item) => item.version.id).sort();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await discoverDataCenterVersions({ typeKeys: ["geojson"] }, admin, NOW_OPTIONS);
        expect(versionIds(result)).toEqual(expected);
        expect(result.selected?.reference.version.versionId).toBe(expected[0]);
      }
    });
  });

  it("selects as of an instant and never the latest now: a version published later is not in force then", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const january = await dataset(tx, admin, source.id, { title: "January", sourcePublishedAt: ago(120), publishedAt: ago(100) });
      const march = await dataset(tx, admin, source.id, { title: "March", sourcePublishedAt: ago(70), publishedAt: ago(50) });
      const [t200, t80, t10] = [ago(200).toISOString(), ago(80).toISOString(), ago(10).toISOString()];
      const at = (asOf: string) => discoverDataCenterVersions({ typeKeys: ["geojson"], asOf }, admin, NOW_OPTIONS);

      expect((await discoverDataCenterVersions({ typeKeys: ["geojson"] }, admin, NOW_OPTIONS)).selected?.reference.version.versionId).toBe(march.version.id);
      const between = await at(t80);
      expect(between).toMatchObject({ status: "FOUND", asOfExplicit: true, asOf: t80 });
      expect(between.selected?.reference.version.versionId).toBe(january.version.id);
      expect(between.notInForce).toEqual([{ versionId: march.version.id, reason: "NOT_PUBLISHED_AT_AS_OF" }]);
      expect(versionIds(await at(t10))).toEqual([march.version.id, january.version.id]);
      const before = await at(t200);
      expect(before).toMatchObject({ status: "NOT_IN_FORCE", candidates: [], selected: null });
      expect(before.notInForce.map((entry) => entry.reason)).toEqual(["NOT_PUBLISHED_AT_AS_OF", "NOT_PUBLISHED_AT_AS_OF"]);
      // The same request twice gives the same answer.
      expect(await at(t80)).toEqual(between);
    });
  });

  it("applies the validity window as of the instant: a version that was not yet effective, or whose period had ended, is not in force then", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const effectiveSince = await dataset(tx, admin, source.id, { title: "Effective since", sourcePublishedAt: ago(100), publishedAt: ago(90), effectiveFrom: ago(60) });
      const endsLater = await dataset(tx, admin, source.id, { title: "Ends later", sourcePublishedAt: ago(110), publishedAt: ago(95), effectiveTo: new Date(Date.now() + 40 * DAY) });
      const [t80, t10] = [ago(80).toISOString(), ago(10).toISOString()];
      const at = (asOf: string) => discoverDataCenterVersions({ typeKeys: ["geojson"], asOf }, admin, NOW_OPTIONS);
      const early = await at(t80);
      expect(early.notInForce).toEqual([{ versionId: effectiveSince.version.id, reason: "NOT_EFFECTIVE_AT_AS_OF" }]);
      expect(versionIds(early)).toEqual([endsLater.version.id]);
      expect(versionIds(await at(t10)).sort()).toEqual([effectiveSince.version.id, endsLater.version.id].sort());
    });
  });

  it("excludes a version whose publication date is unknown when an instant is given, and does not assume one", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const known = await dataset(tx, admin, source.id, { sourcePublishedAt: ago(100), publishedAt: ago(90) });
      const unknown = await dataset(tx, admin, source.id, { sourcePublishedAt: ago(5) });
      await withoutImmutability(tx, "DataCenterEvent", () => tx.$executeRaw`DELETE FROM "DataCenterEvent" WHERE "itemId" = ${unknown.id} AND "toStatus" = 'PUBLISHED'::"DataCenterLifecycle"`);
      const explicit = await discoverDataCenterVersions({ typeKeys: ["geojson"], asOf: ago(1).toISOString() }, admin, NOW_OPTIONS);
      expect(versionIds(explicit)).toEqual([known.version.id]);
      expect(explicit.notInForce).toEqual([{ versionId: unknown.version.id, reason: "PUBLICATION_DATE_UNKNOWN" }]);
      const implicit = await discoverDataCenterVersions({ typeKeys: ["geojson"] }, admin, NOW_OPTIONS);
      expect(versionIds(implicit)).toEqual([unknown.version.id, known.version.id]);
    });
  });

  it("limits the list it returns, says so, and still selects the preferred of all", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const items = [await dataset(tx, admin, source.id, { sourcePublishedAt: ago(30), publishedAt: ago(20) }), await dataset(tx, admin, source.id, { sourcePublishedAt: ago(20), publishedAt: ago(20) }), await dataset(tx, admin, source.id, { sourcePublishedAt: ago(10), publishedAt: ago(20) })];
      const all = await discoverDataCenterVersions({ typeKeys: ["geojson"] }, admin, NOW_OPTIONS);
      const limited = await discoverDataCenterVersions({ typeKeys: ["geojson"], limit: 2 }, admin, NOW_OPTIONS);
      expect(versionIds(all)).toEqual([items[2]!.version.id, items[1]!.version.id, items[0]!.version.id]);
      expect(versionIds(limited)).toEqual([items[2]!.version.id, items[1]!.version.id]);
      expect(limited).toMatchObject({ truncated: true });
      expect(limited.selected?.reference.version.versionId).toBe(items[2]!.version.id);
      expect(all.truncated).toBe(false);
    });
  });

  it("looks only at the types asked for", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const spatial = await dataset(tx, admin, source.id, { typeKey: "geojson" });
      const table = await dataset(tx, admin, source.id, { typeKey: "dataset", content: "a,b" });
      expect(versionIds(await discoverDataCenterVersions({ typeKeys: ["geojson"] }, admin, NOW_OPTIONS))).toEqual([spatial.version.id]);
      expect(versionIds(await discoverDataCenterVersions({ typeKeys: ["dataset"] }, admin, NOW_OPTIONS))).toEqual([table.version.id]);
      expect(versionIds(await discoverDataCenterVersions({ typeKeys: ["dataset", "geojson"] }, admin, NOW_OPTIONS)).sort()).toEqual([spatial.version.id, table.version.id].sort());
      expect(await discoverDataCenterVersions({ typeKeys: ["document"] }, admin, NOW_OPTIONS)).toMatchObject({ status: "NOT_AVAILABLE", candidates: [], selected: null });
      expect(await discoverDataCenterVersions({ typeKeys: ["geojson"], layer: "KNOWLEDGE" }, admin, NOW_OPTIONS)).toMatchObject({ status: "NOT_AVAILABLE" });
    });
  });

  // ------------------------------------------------------------------------------------------------------------------ geography
  it("narrows by the structured coverage a version declares: country, region and a box that intersects, every filter that is given holding", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const riyadh = await dataset(tx, admin, source.id, { title: "Riyadh", coverage: { countryCodes: ["SA"], regionCodes: ["SA-01"], boundingBox: riyadhBox } });
      const dubai = await dataset(tx, admin, source.id, { title: "Dubai", coverage: { countryCodes: ["AE"], boundingBox: dubaiBox } });
      const countryOnly = await dataset(tx, admin, source.id, { title: "Saudi, no box", coverage: { countryCodes: ["SA"] } });
      const undeclared = await dataset(tx, admin, source.id, { title: "Undeclared" });
      const found = async (geography: Record<string, unknown>) => versionIds(await discoverDataCenterVersions({ typeKeys: ["geojson"], geography }, admin, NOW_OPTIONS)).sort();
      const sorted = (...items: Array<{ version: { id: string } }>) => items.map((item) => item.version.id).sort();

      expect(versionIds(await discoverDataCenterVersions({ typeKeys: ["geojson"] }, admin, NOW_OPTIONS)).sort()).toEqual(sorted(riyadh, dubai, countryOnly, undeclared));
      expect(await found({ countryCodes: ["SA"] })).toEqual(sorted(riyadh, countryOnly));
      expect(await found({ countryCodes: ["AE", "SA"] })).toEqual(sorted(riyadh, dubai, countryOnly));
      expect(await found({ regionCodes: ["SA-01"] })).toEqual(sorted(riyadh));
      expect(await found({ boundingBox: { west: 46.6, south: 24.6, east: 46.8, north: 24.8 } })).toEqual(sorted(riyadh));
      expect(await found({ boundingBox: dubaiBox })).toEqual(sorted(dubai));
      expect(await found({ countryCodes: ["SA"], boundingBox: { west: 46.6, south: 24.6, east: 46.8, north: 24.8 } })).toEqual(sorted(riyadh));
      // Closed boxes that only touch intersect; boxes that do not, do not.
      expect(await found({ boundingBox: { west: 47.3, south: 25.1, east: 48, north: 26 } })).toEqual(sorted(riyadh));
      expect(await found({ boundingBox: { west: 47.31, south: 24.6, east: 48, north: 24.8 } })).toEqual([]);
      // A version that declared no coverage matches no geographic filter, and a country-only version cannot be matched by a box.
      for (const geography of [{ countryCodes: ["SA", "AE"] }, { boundingBox: { west: -180, south: -90, east: 180, north: 90 } }]) {
        expect(await found(geography)).not.toContain(undeclared.version.id);
      }
      expect(await found({ boundingBox: { west: -180, south: -90, east: 180, north: 90 } })).not.toContain(countryOnly.version.id);
    });
  });

  it("says whether nothing exists or nothing covers the place: NO_COVERAGE is not NOT_AVAILABLE", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      await dataset(tx, admin, source.id, { coverage: { countryCodes: ["SA"], boundingBox: riyadhBox } });
      const tokyo = { boundingBox: { west: 139.5, south: 35.5, east: 139.9, north: 35.8 } };
      expect(await discoverDataCenterVersions({ typeKeys: ["geojson"], geography: tokyo }, admin, NOW_OPTIONS)).toMatchObject({ status: "NO_COVERAGE", candidates: [], selected: null });
      expect(await discoverDataCenterVersions({ typeKeys: ["geojson"], geography: { countryCodes: ["SA"], boundingBox: dubaiBox } }, admin, NOW_OPTIONS)).toMatchObject({ status: "NO_COVERAGE" });
      expect(await discoverDataCenterVersions({ typeKeys: ["document"], geography: tokyo }, admin, NOW_OPTIONS)).toMatchObject({ status: "NOT_AVAILABLE" });
      // A hidden dataset that would cover the place is not counted: for this user nothing exists at all.
      const owner = await user(tx, "owner");
      const hiddenSource = await createDataCenterSource({ name: "Hidden", kind: "MANUAL", scope: "PRIVATE", owner: "Owner", license: "Internal" }, owner);
      await dataset(tx, admin, hiddenSource.id, { typeKey: "dataset", content: "a,b", coverage: { countryCodes: ["JP"], boundingBox: tokyo.boundingBox } });
      const stranger = await user(tx, "stranger");
      expect(await discoverDataCenterVersions({ typeKeys: ["dataset"], geography: tokyo }, stranger, NOW_OPTIONS)).toMatchObject({ status: "NOT_AVAILABLE" });
    });
  });

  // ------------------------------------------------------------------------------------------------------ what it says about a version
  it("states quality as recorded: unavailable without an assessment, the most recent measurement otherwise", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const [plain, measured, superseded] = [await dataset(tx, admin, source.id), await dataset(tx, admin, source.id), await dataset(tx, admin, source.id)];
      await recordDataCenterQualityAssessment({ versionId: measured.version.id, status: "MEASURED", score: 0.82, method: "register-check", methodVersion: "2", measuredAt: ago(10).toISOString(), explanation: "Compared with the official register" }, admin);
      await recordDataCenterQualityAssessment({ versionId: superseded.version.id, status: "MEASURED", score: 0.9, method: "register-check", methodVersion: "1", measuredAt: ago(30).toISOString(), explanation: "First check" }, admin);
      await recordDataCenterQualityAssessment({ versionId: superseded.version.id, status: "INSUFFICIENT_DATA", method: "register-check", methodVersion: "2", measuredAt: ago(5).toISOString(), explanation: "Register unavailable" }, admin);
      const result = await discoverDataCenterVersions({ versionIds: [plain.version.id, measured.version.id, superseded.version.id] }, admin, NOW_OPTIONS);
      const quality = Object.fromEntries(result.candidates.map((candidate) => [candidate.reference.version.versionId, candidate.reference.quality]));
      expect(quality[plain.version.id]).toEqual({ status: "UNAVAILABLE" });
      expect(quality[measured.version.id]).toMatchObject({ status: "MEASURED", score: 0.82, method: "register-check", methodVersion: "2", explanation: "Compared with the official register" });
      expect(quality[superseded.version.id]).toMatchObject({ status: "INSUFFICIENT_DATA", methodVersion: "2" });
      expect(quality[superseded.version.id]).not.toHaveProperty("score");
    });
  });

  it("carries the rights of the source exactly as declared, and leaves an undeclared license class undeclared", async () => {
    await isolated(async (tx, admin) => {
      const open = await platformSource(admin, { licenseClass: "OPEN_LICENSE", allowExport: true });
      const unclassified = await platformSource(admin, { licenseClass: undefined, ownership: undefined, usagePolicy: undefined, attribution: undefined, attributionRequired: false });
      const owned = await platformSource(admin, { kind: "MANUAL", ownership: "PLATFORM_OWNED", licenseClass: "JENAN_OWNED", usagePolicy: "Internal and published map use", attribution: "Jenan PRO", allowExport: false });
      const [a, b, c] = [await dataset(tx, admin, open.id), await dataset(tx, admin, unclassified.id), await dataset(tx, admin, owned.id)];
      const result = await discoverDataCenterVersions({ versionIds: [a.version.id, b.version.id, c.version.id] }, admin, NOW_OPTIONS);
      const [first, second, third] = result.candidates.map((candidate) => candidate.reference);
      expect(first).toMatchObject({ rights: { licenseClass: "OPEN_LICENSE", allowExport: true }, ownership: { ownership: "THIRD_PARTY" } });
      expect(second).toMatchObject({ rights: { licenseClass: null, attribution: { text: null, required: false, level: null } }, ownership: { ownership: "THIRD_PARTY" } });
      expect(second!.rights.usagePolicy).toMatch(/redistribution requires explicit permission/);
      expect(third).toMatchObject({ rights: { licenseClass: "JENAN_OWNED", usagePolicy: "Internal and published map use" }, ownership: { ownership: "PLATFORM_OWNED" } });
    });
  });

  // -------------------------------------------------------------------------------------------------------- determinism and effects
  it("gives the same answer to the same request at the same instant", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      for (let index = 0; index < 4; index += 1) await dataset(tx, admin, source.id, { sourcePublishedAt: ago(10 + (index % 2)), publishedAt: ago(5) });
      const request = { typeKeys: ["geojson"], asOf: ago(2).toISOString() };
      const first = await discoverDataCenterVersions(request, admin, NOW_OPTIONS);
      for (let attempt = 0; attempt < 3; attempt += 1) expect(await discoverDataCenterVersions(request, admin, NOW_OPTIONS)).toEqual(first);
      expect(first.candidates).toHaveLength(4);
    });
  });

  it("writes nothing: no usage record, no audit entry, no lifecycle event", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const item = await dataset(tx, admin, source.id, { coverage: { countryCodes: ["SA"], boundingBox: riyadhBox } });
      const counts = async () => ({
        usage: await tx.dataCenterUsage.count(), audit: await tx.auditLog.count(), events: await tx.dataCenterEvent.count(), versions: await tx.dataCenterVersion.count(), items: await tx.dataCenterItem.count(),
        revision: (await tx.dataCenterItem.findUniqueOrThrow({ where: { id: item.id } })).revision,
      });
      const before = await counts();
      await discoverDataCenterVersions({ versionIds: [item.version.id, "missing"] }, admin, NOW_OPTIONS);
      await discoverDataCenterVersions({ typeKeys: ["geojson"], geography: { countryCodes: ["SA"] }, asOf: ago(1).toISOString() }, admin, NOW_OPTIONS);
      expect(await counts()).toEqual(before);
    });
  });

  it("refuses a request that is not well formed, with one error that says nothing about the data", async () => {
    await isolated(async (tx, admin) => {
      const bad: unknown[] = [
        {}, { versionIds: [] }, { typeKeys: [] }, { versionIds: ["a"], typeKeys: ["geojson"] }, { versionIds: ["a"], asOf: ago(1).toISOString() }, { versionIds: ["a"], geography: { countryCodes: ["SA"] } },
        { typeKeys: ["GeoJSON"] }, { typeKeys: ["geojson"], asOf: "yesterday" }, { typeKeys: ["geojson"], geography: {} }, { typeKeys: ["geojson"], geography: { countryCodes: ["saudi"] } },
        { typeKeys: ["geojson"], geography: { boundingBox: { west: 10, south: 0, east: 5, north: 1 } } }, { typeKeys: ["geojson"], limit: 0 }, { typeKeys: ["geojson"], limit: 101 },
        { typeKeys: ["geojson"], extra: true }, { versionIds: Array.from({ length: 51 }, (_, index) => `v${index}`) }, { typeKeys: Array.from({ length: 11 }, (_, index) => `type-${index}x`) },
      ];
      for (const request of bad) await expect(discoverDataCenterVersions(request as never, admin, NOW_OPTIONS), JSON.stringify(request)).rejects.toMatchObject({ code: "INVALID_DISCOVERY_REQUEST", status: 400 });
    });
  });

  it("refuses a caller that is not a trusted principal", async () => {
    await isolated(async (tx, admin) => {
      await expect(discoverDataCenterVersions({ typeKeys: ["geojson"] }, { ...admin, kind: "SYSTEM" } as never, NOW_OPTIONS)).rejects.toMatchObject({ code: "TRUSTED_PRINCIPAL_KIND_REQUIRED", status: 403 });
    });
  });
});
