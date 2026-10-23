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
import { resolveDataCenterMapReference } from "@/services/data-center/map-resolver";
import { readDataCenterVersionContent } from "@/services/data-center/version-content";
import { readHistoricalDataCenterVersionContent } from "@/services/data-center/historical-version";
import type { DataCenterActor } from "@/services/data-center/contracts";

const enabled = process.env.DATA_CENTER_DATABASE_TESTS === "1";
const rollback = new Error("ROLLBACK_DATA_CENTER_TEST");
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const NOW = new Date(Date.now() + 60_000);

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
/** Test-only: the Data Center's tables are append-only, so tampering with a stored version needs the immutability trigger off for a moment, inside the rolled-back transaction. */
async function withoutImmutability(tx: DbExecutor, table: "DataCenterEvent" | "DataCenterVersion" | "DataCenterVersionLineage", work: () => Promise<unknown>) {
  await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${table}_immutable"`);
  try { await work(); } finally { await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER "${table}_immutable"`); }
}
const geojson = (...names: string[]) => JSON.stringify({ type: "FeatureCollection", features: names.map((name, index) => ({ type: "Feature", properties: { name }, geometry: { type: "Point", coordinates: [46.67 + index * 0.01, 24.71] } })) });
const riyadhBox = { west: 46.0, south: 24.3, east: 47.3, north: 25.1 };
const platformSource = (admin: DataCenterActor, over: Record<string, unknown> = {}) => createDataCenterSource({
  name: `Source ${randomUUID()}`, kind: "OFFICIAL", scope: "PLATFORM", owner: "Authority", license: "ODbL-1.0", allowExport: false, freshnessDays: 365,
  ownership: "THIRD_PARTY", licenseClass: "OPEN_LICENSE", usagePolicy: "Share-alike; credit required", attribution: "© Authority", attributionRequired: true, ...over,
} as Parameters<typeof createDataCenterSource>[0], admin);
async function dataset(tx: DbExecutor, admin: DataCenterActor, sourceId: string, over: Record<string, unknown> = {}) {
  const item = await createDataCenterItem({
    sourceId, title: `Hospitals ${randomUUID().slice(0, 8)}`, typeKey: "geojson", layer: "DATA", content: geojson("a"), evidenceStatus: "ESTIMATED", sourcePublishedAt: ago(30).toISOString(), ...over,
  } as Parameters<typeof createDataCenterItem>[0], admin);
  await publish(item.id, admin);
  return item;
}
const user = async (tx: DbExecutor, label = "user"): Promise<DataCenterActor> => {
  const created = await tx.user.create({ data: { email: `${label}-${randomUUID()}@example.test`, status: "ACTIVE" } });
  return { id: created.id, systemRole: "USER", kind: "HUMAN" };
};
const read = (versionId: string, actor: DataCenterActor, extra: Record<string, unknown> = {}) => readDataCenterVersionContent({ versionId, ...extra } as never, actor, { now: NOW });
const NOT_FOUND = { code: "PUBLISHED_VERSION_NOT_FOUND", status: 404 };
const failure = async (work: Promise<unknown>) => { try { await work; } catch (error) { return error as { code: string; status: number; message: string }; } throw new Error("expected the read to fail"); };

afterAll(async () => { if (enabled) await (context.actual as typeof db).$disconnect(); });

describe.skipIf(!enabled)("governed exact historical Data Center capability (Risk M2 exception)", () => {
  const historical = (sourceId: string, versionId: string, expectedChecksum: string, actor: DataCenterActor, extra = {}) =>
    readHistoricalDataCenterVersionContent({ sourceId, versionId, expectedChecksum, ...extra }, actor, context.tx as DbExecutor);
  const unavailable = { code: "HISTORICAL_VERSION_NOT_AVAILABLE", status: 404 };
  it("reads the exact superseded bytes and original publication, without changing the published reader or writing history", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const first = await dataset(tx, admin, source.id, { content: geojson("historical") });
      const second = await createDataCenterVersion({ itemId: first.id, title: "New version", content: geojson("current"), evidenceStatus: "ESTIMATED", reason: "Update" }, admin);
      await publish(first.id, admin);
      const before = [await tx.auditLog.count(), await tx.dataCenterEvent.count(), await tx.dataCenterUsage.count()];
      const retained = await historical(source.id, first.version.id, first.version.checksum, admin);
      expect(retained).toMatchObject({ versionId: first.version.id, number: 1, sourceId: source.id, content: geojson("historical"),
        checksum: first.version.checksum, currentAuthorization: "AUTHORIZED", integrity: { recomputed: true } });
      expect(retained).not.toHaveProperty("publication.publishedVersion");
      expect(await failure(read(first.version.id, admin))).toMatchObject(NOT_FOUND);
      expect((await read(second.id, admin)).content).toBe(geojson("current"));
      expect([await tx.auditLog.count(), await tx.dataCenterEvent.count(), await tx.dataCenterUsage.count()]).toEqual(before);
    });
  });
  it("never serves a draft that was skipped on publication, or substitutes another version/source/checksum", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const first = await dataset(tx, admin, source.id);
      const draft = await createDataCenterVersion({ itemId: first.id, title: "Unpublished", content: geojson("draft"), evidenceStatus: "ESTIMATED", reason: "Draft" }, admin);
      const third = await createDataCenterVersion({ itemId: first.id, title: "Published third", content: geojson("third"), evidenceStatus: "ESTIMATED", reason: "Replace draft" }, admin);
      await publish(first.id, admin);
      expect(await failure(historical(source.id, draft.id, draft.checksum, admin))).toMatchObject(unavailable);
      expect(await failure(historical("different-source", first.version.id, first.version.checksum, admin))).toMatchObject(unavailable);
      expect(await failure(historical(source.id, "absent", first.version.checksum, admin))).toMatchObject(unavailable);
      expect(await failure(historical(source.id, third.id, first.version.checksum, admin))).toMatchObject({ code: "HISTORICAL_VERSION_INTEGRITY_MISMATCH", status: 409 });
    });
  });
  it("makes hidden and absent versions indistinguishable even with an incorrect checksum", async () => {
    await isolated(async (tx, admin) => {
      const owner = await user(tx); const outsider = await user(tx);
      const source = await createDataCenterSource({ name: "Private historical", kind: "MANUAL", scope: "PRIVATE", owner: "Owner", license: "Internal" }, { ...owner, systemRole: "ADMIN" });
      const item = await dataset(tx, admin, source.id);
      const hidden = await failure(historical(source.id, item.version.id, "f".repeat(64), outsider));
      const absent = await failure(historical(source.id, "absent", "f".repeat(64), outsider));
      expect(hidden).toMatchObject(unavailable); expect(absent).toMatchObject(unavailable);
      expect(hidden.message).toBe(absent.message);
      expect((await historical(source.id, item.version.id, item.version.checksum, owner)).versionId).toBe(item.version.id);
    });
  });
  it("rechecks current source rights on every read and retains historical dates rather than substituting current data", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const item = await dataset(tx, admin, source.id, { effectiveFrom: ago(10).toISOString(), sourcePublishedAt: ago(12).toISOString() });
      expect((await historical(source.id, item.version.id, item.version.checksum, admin)).sourcePublishedAt).toBe(item.version.sourcePublishedAt?.toISOString());
      await tx.dataCenterSource.update({ where: { id: source.id }, data: { usagePolicy: "Changed current rights" } });
      expect((await historical(source.id, item.version.id, item.version.checksum, admin)).rights.usagePolicy).toBe("Changed current rights");
      await tx.dataCenterSource.update({ where: { id: source.id }, data: { allowRetrieval: false } });
      expect(await failure(historical(source.id, item.version.id, item.version.checksum, admin))).toMatchObject(unavailable);
    });
  });
  it("uses the same current organization/version permissions and specialty/mission restrictions", async () => {
    await isolated(async (tx, admin) => {
      const org = await tx.organization.create({ data: { name: "Historical org", slug: `historical-${randomUUID()}` } });
      const reader = await user(tx);
      const permission = await tx.permission.upsert({ where: { key: "data-center.read" }, update: {}, create: { key: "data-center.read" } });
      const role = await tx.role.create({ data: { name: "Historical reader", key: `historical-${randomUUID()}`, organizationId: org.id, permissions: { create: [{ permissionId: permission.id }] } } });
      const membership = await tx.organizationMember.create({ data: { organizationId: org.id, userId: reader.id, roleId: role.id, status: "ACTIVE" } });
      const source = await createDataCenterSource({ name: "Historical org source", kind: "MANUAL", scope: "ORGANIZATION", organizationId: org.id, owner: "Org", license: "Internal" }, admin);
      const item = await dataset(tx, admin, source.id, { requiredPermission: "data-center.read", specialties: ["health"], missionContexts: ["study"] });
      expect(await failure(historical(source.id, item.version.id, item.version.checksum, reader))).toMatchObject(unavailable);
      const access = { specialty: "health", missionContext: "study" };
      expect((await historical(source.id, item.version.id, item.version.checksum, reader, access)).versionId).toBe(item.version.id);
      expect(await failure(historical(source.id, item.version.id, item.version.checksum, reader, { ...access, organizationId: "other-org" }))).toMatchObject(unavailable);
      await tx.organizationMember.update({ where: { id: membership.id }, data: { status: "SUSPENDED" } });
      expect(await failure(historical(source.id, item.version.id, item.version.checksum, reader, access))).toMatchObject(unavailable);
    });
  });
  it("rechecks robot grants and mission assignment on every call, with no existence leak after revocation", async () => {
    await isolated(async (tx, admin) => {
      const robot = await tx.robot.create({ data: { name: "Historical analyst", slug: `historical-${randomUUID()}` } });
      const mission = await tx.mission.create({ data: { name: "Historical study", assignedRobots: { connect: { id: robot.id } } } });
      const principal = await user(tx);
      const actor: DataCenterActor = { ...principal, kind: "AI", robotId: robot.id, roleKey: "analyst", specialty: "health", missionId: mission.id };
      const source = await platformSource(admin); const item = await dataset(tx, admin, source.id);
      expect(await failure(historical(source.id, item.version.id, item.version.checksum, actor))).toMatchObject(unavailable);
      const grant = await grantDataCenterRobotAccess({ sourceId: source.id, robotId: robot.id, principalId: actor.id, roleKey: "analyst", specialty: "health", missionId: mission.id, reason: "Exact history", expiresAt: new Date(Date.now() + DAY).toISOString() }, admin);
      expect((await historical(source.id, item.version.id, item.version.checksum, actor)).versionId).toBe(item.version.id);
      await revokeDataCenterRobotAccess({ grantId: grant.id, reason: "Revoke current access" }, admin);
      const hidden = await failure(historical(source.id, item.version.id, item.version.checksum, actor));
      const absent = await failure(historical(source.id, "absent", item.version.checksum, actor));
      expect(hidden).toMatchObject(unavailable); expect(hidden.message).toBe(absent.message);
    });
  });
  it("rejects stored content tampering only after access and exact historical publication checks", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin); const item = await dataset(tx, admin, source.id);
      await withoutImmutability(tx, "DataCenterVersion", () => tx.$executeRaw`UPDATE "DataCenterVersion" SET "content" = 'tampered' WHERE "id" = ${item.version.id}`);
      expect(await failure(historical(source.id, item.version.id, item.version.checksum, admin))).toMatchObject({ code: "HISTORICAL_VERSION_INTEGRITY_MISMATCH", status: 409 });
    });
  });
  it("rejects malformed historical references explicitly before attempting a read", async () => {
    await isolated(async (_tx, admin) => {
      for (const extra of [{ sourceId: "" }, { versionId: "" }, { expectedChecksum: "not-a-hash" }, { latest: true }]) {
        expect(await failure(historical("source", "version", "a".repeat(64), admin, extra))).toMatchObject({ code: "INVALID_HISTORICAL_VERSION_REQUEST", status: 400 });
      }
    });
  });
});

describe.skipIf(!enabled)("readDataCenterVersionContent on real PostgreSQL (always rolled back)", () => {
  // ----------------------------------------------------------------------------------------------------------------- the content
  it("reads exactly the version asked for: its content as stored, its validated features, its reference, and the checksum it recomputed", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const content = geojson("Hayy Alpha", "Hayy Beta");
      const item = await dataset(tx, admin, source.id, { content, attribution: "© Authority, Riyadh 2026", coverage: { countryCodes: ["SA"], regionCodes: ["SA-01"], boundingBox: riyadhBox } });
      const result = await read(item.version.id, admin);
      expect(result.content).toBe(content);
      expect(result.contentKind).toBe("GEOJSON");
      expect(result.features).toHaveLength(2);
      expect(result.features?.map((feature) => feature.properties)).toEqual([{ name: "Hayy Alpha" }, { name: "Hayy Beta" }]);
      expect(result.integrity).toEqual({ algorithm: "SHA-256", checksum: item.version.checksum, recomputed: true });
      expect(result.reference).toEqual(await resolveDataCenterMapReference(item.version.id, admin, NOW));
      expect(result.reference).toMatchObject({
        version: { versionId: item.version.id, checksum: { algorithm: "SHA-256", value: item.version.checksum } },
        rights: { licenseClass: "OPEN_LICENSE", attribution: { text: "© Authority, Riyadh 2026", level: "VERSION" } },
        coverage: { countryCodes: ["SA"], regionCodes: ["SA-01"], boundingBox: riyadhBox },
      });
    });
  });

  it("returns content that is not spatial as stored, without features, and refuses it when a spatial dataset is required", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const table = await dataset(tx, admin, source.id, { typeKey: "dataset", content: "name,count\nA,1" });
      const result = await read(table.version.id, admin);
      expect(result).toMatchObject({ contentKind: "OTHER", content: "name,count\nA,1", features: null });
      expect(await failure(read(table.version.id, admin, { require: "GEOJSON" }))).toMatchObject({ code: "CONTENT_NOT_SPATIAL", status: 422 });
      const spatial = await dataset(tx, admin, source.id);
      expect((await read(spatial.version.id, admin, { require: "GEOJSON" })).contentKind).toBe("GEOJSON");
    });
  });

  it("carries the quality recorded for the version, and nothing when none was recorded", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const [plain, measured] = [await dataset(tx, admin, source.id), await dataset(tx, admin, source.id)];
      await recordDataCenterQualityAssessment({ versionId: measured.version.id, status: "MEASURED", score: 0.8, method: "register-check", methodVersion: "1", measuredAt: ago(3).toISOString(), explanation: "Compared with the official register" }, admin);
      expect((await read(plain.version.id, admin)).reference.quality).toEqual({ status: "UNAVAILABLE" });
      expect((await read(measured.version.id, admin)).reference.quality).toMatchObject({ status: "MEASURED", score: 0.8, method: "register-check" });
    });
  });

  // ------------------------------------------------------------------------------------------------- nothing hidden is revealed
  it("refuses with one and the same error a version that is hidden, forbidden, unpublished, superseded, expired, archived, not yet effective or does not exist", async () => {
    await isolated(async (tx, admin) => {
      const owner = await user(tx, "owner");
      const stranger = await user(tx, "stranger");
      const privateSource = await createDataCenterSource({ name: "Private", kind: "MANUAL", scope: "PRIVATE", owner: "Owner", license: "Internal" }, owner);
      const platform = await platformSource(admin);
      const hidden = await dataset(tx, admin, privateSource.id);
      const unpublished = await createDataCenterItem({ sourceId: platform.id, title: "Draft", typeKey: "geojson", layer: "DATA", content: geojson("d"), evidenceStatus: "ESTIMATED" }, admin);
      const superseded = await dataset(tx, admin, platform.id);
      const newer = await createDataCenterVersion({ itemId: superseded.id, title: "Revised", content: geojson("v2"), evidenceStatus: "ESTIMATED", reason: "New evidence" }, admin);
      await publish(superseded.id, admin);
      const expired = await dataset(tx, admin, platform.id, { expiresAt: new Date(Date.now() + DAY).toISOString() });
      await withoutImmutability(tx, "DataCenterVersion", () => tx.$executeRaw`UPDATE "DataCenterVersion" SET "expiresAt" = ${ago(1)} WHERE "id" = ${expired.version.id}`);
      const archived = await dataset(tx, admin, platform.id);
      await transitionDataCenterItem({ itemId: archived.id, status: "ARCHIVED", reason: "Withdrawn" }, admin);
      const future = await dataset(tx, admin, platform.id, { effectiveFrom: new Date(Date.now() + 5 * DAY).toISOString() });
      const noRetrieval = await dataset(tx, admin, (await platformSource(admin, { allowRetrieval: false })).id);

      const ids = { hidden: hidden.version.id, unpublished: unpublished.version.id, superseded: superseded.version.id, expired: expired.version.id, archived: archived.version.id, future: future.version.id, noRetrieval: noRetrieval.version.id, missing: "cmissing000000000000000000" };
      const errors = new Map<string, { code: string; status: number; message: string }>();
      for (const [name, id] of Object.entries(ids)) errors.set(name, await failure(read(id, stranger)));
      for (const [name, error] of errors) {
        expect(error, name).toMatchObject(NOT_FOUND);
        expect(error.message, name).toBe((errors.get("missing") as { message: string }).message);
      }
      for (const name of ["unpublished", "superseded", "expired", "archived", "future", "noRetrieval"] as const) expect(await failure(read(ids[name], admin)), `${name} is not served even to an administrator`).toMatchObject(NOT_FOUND);
      // The owner reads what is theirs; the superseding version is the one that is served now.
      expect((await read(ids.hidden, owner)).content).toBe(hidden.version.content);
      expect((await read(newer.id, admin)).content).toBe(geojson("v2"));
    });
  });

  it("applies organization membership and permissions, the same as retrieval does", async () => {
    await isolated(async (tx, admin) => {
      const organization = await tx.organization.create({ data: { name: "Org", slug: `org-${randomUUID()}` } });
      const read_ = await tx.permission.upsert({ where: { key: "data-center.read" }, update: {}, create: { key: "data-center.read" } });
      const role = await tx.role.create({ data: { name: "Reader", key: `reader-${randomUUID()}`, organizationId: organization.id, permissions: { create: [{ permissionId: read_.id }] } } });
      const member = async (label: string, over: { isOwner?: boolean; roleId?: string; status?: "ACTIVE" | "SUSPENDED" }) => {
        const actor = await user(tx, label);
        await tx.organizationMember.create({ data: { organizationId: organization.id, userId: actor.id, isOwner: over.isOwner ?? false, roleId: over.roleId ?? null, status: over.status ?? "ACTIVE" } });
        return actor;
      };
      const [owner, reader, noRole, suspended] = [await member("owner", { isOwner: true }), await member("reader", { roleId: role.id }), await member("norole", {}), await member("suspended", { isOwner: true, status: "SUSPENDED" })];
      const stranger = await user(tx, "stranger");
      const orgSource = await createDataCenterSource({ name: "Org data", kind: "MANUAL", scope: "ORGANIZATION", organizationId: organization.id, owner: "Org", license: "Internal" }, admin);
      const open = await dataset(tx, admin, orgSource.id);
      const restricted = await dataset(tx, admin, orgSource.id, { requiredPermission: "data-center.sensitive" });
      expect((await read(open.version.id, owner)).content).toBe(open.version.content);
      expect((await read(restricted.version.id, owner)).content).toBe(restricted.version.content);
      expect((await read(open.version.id, reader)).content).toBe(open.version.content);
      expect(await failure(read(restricted.version.id, reader))).toMatchObject(NOT_FOUND);
      for (const outsider of [noRole, suspended, stranger]) expect(await failure(read(open.version.id, outsider))).toMatchObject(NOT_FOUND);
    });
  });

  it("gives a robot no implicit access: no grant is refused whatever is asked for, a grant opens its own source only, and another source reads as not found", async () => {
    await isolated(async (tx, admin) => {
      const robot = await tx.robot.create({ data: { name: "Analyst", slug: `analyst-${randomUUID()}` } });
      const mission = await tx.mission.create({ data: { name: "Site study", assignedRobots: { connect: { id: robot.id } } } });
      const principal = await tx.user.create({ data: { email: `robot-${randomUUID()}@example.test`, status: "ACTIVE" } });
      const identity: DataCenterActor = { id: principal.id, systemRole: "USER", kind: "AI", robotId: robot.id, roleKey: "analyst", specialty: "demography", missionId: mission.id };
      const granted = await platformSource(admin);
      const other = await platformSource(admin);
      const reachable = await dataset(tx, admin, granted.id);
      const unreachable = await dataset(tx, admin, other.id);
      for (const id of [reachable.version.id, "missing"]) expect(await failure(read(id, identity))).toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED", status: 403 });
      await grantDataCenterRobotAccess({ sourceId: granted.id, robotId: robot.id, principalId: principal.id, roleKey: "analyst", specialty: "demography", missionId: mission.id, reason: "Study", expiresAt: new Date(Date.now() + 30 * DAY).toISOString() }, admin);
      expect((await read(reachable.version.id, identity)).content).toBe(reachable.version.content);
      const denied = await failure(read(unreachable.version.id, identity));
      expect(denied).toMatchObject(NOT_FOUND);
      expect(denied.message).toBe((await failure(read("missing", identity))).message);
    });
  });

  // ------------------------------------------------------------------------------------------------------------------ no fallback
  it("never substitutes another version: a pinned checksum that is not the version's is refused, and so is a version that was superseded", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const first = await dataset(tx, admin, source.id, { content: geojson("one") });
      expect((await read(first.version.id, admin, { expectedChecksum: first.version.checksum })).content).toBe(geojson("one"));
      const second = await createDataCenterVersion({ itemId: first.id, title: "Revised", content: geojson("two"), evidenceStatus: "ESTIMATED", reason: "New evidence" }, admin);
      await publish(first.id, admin);
      // The first version is no longer served, and the newer one is not returned in its place.
      expect(await failure(read(first.version.id, admin))).toMatchObject(NOT_FOUND);
      expect(await failure(read(first.version.id, admin, { expectedChecksum: first.version.checksum }))).toMatchObject(NOT_FOUND);
      // A pin to the content of the first version cannot be satisfied by the second.
      expect(await failure(read(second.id, admin, { expectedChecksum: first.version.checksum }))).toMatchObject({ code: "EXPECTED_CHECKSUM_MISMATCH", status: 409 });
      expect((await read(second.id, admin, { expectedChecksum: second.checksum })).content).toBe(geojson("two"));
    });
  });

  it("does not fall back to a sibling when the version asked for is not available", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const available = await dataset(tx, admin, source.id);
      const expired = await dataset(tx, admin, source.id, { expiresAt: new Date(Date.now() + DAY).toISOString() });
      await withoutImmutability(tx, "DataCenterVersion", () => tx.$executeRaw`UPDATE "DataCenterVersion" SET "expiresAt" = ${ago(1)} WHERE "id" = ${expired.version.id}`);
      expect(await failure(read(expired.version.id, admin))).toMatchObject(NOT_FOUND);
      expect((await read(available.version.id, admin)).reference.version.versionId).toBe(available.version.id);
    });
  });

  // ------------------------------------------------------------------------------------------------------------------ integrity
  it("recomputes the checksum of every kind of version the Data Center can store, so its composition cannot drift from service.ts unnoticed", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const upstream = await dataset(tx, admin, source.id, { title: "Upstream" });
      const other = await dataset(tx, admin, source.id, { title: "Another upstream" });
      const shapes: Array<[string, Record<string, unknown>, Record<string, unknown>?]> = [
        ["a bare version", {}],
        ["version attribution", { attribution: "© Authority, 2026" }],
        ["countries only", { coverage: { countryCodes: ["SA", "AE"] } }],
        ["countries and regions", { coverage: { countryCodes: ["SA"], regionCodes: ["SA-02", "SA-01"] } }],
        ["a box", { coverage: { countryCodes: ["SA"], boundingBox: riyadhBox } }],
        ["a box and nothing else", { coverage: { boundingBox: riyadhBox } }],
        ["lineage", { upstreamVersionIds: [other.version.id, upstream.version.id] }],
        ["provenance", { provenance: [{ label: "Register", reference: "https://example.test/register", kind: "SOURCE" }, { label: "Calculation", reference: "calc:v1", kind: "CALCULATION" }] }],
        ["specialties and mission contexts", { specialties: ["demography", "health"], missionContexts: ["site-study"] }, { specialty: "demography", missionContext: "site-study" }],
        ["a required permission", { requiredPermission: "data-center.read" }],
        ["dates", { expiresAt: new Date(Date.now() + 90 * DAY).toISOString(), effectiveFrom: ago(10).toISOString(), effectiveTo: new Date(Date.now() + 60 * DAY).toISOString() }],
        ["every optional part together", {
          attribution: "© All", coverage: { countryCodes: ["SA"], regionCodes: ["SA-01"], boundingBox: riyadhBox }, upstreamVersionIds: [upstream.version.id],
          provenance: [{ label: "Doc", reference: "doc:1", kind: "DOCUMENT" }], specialties: ["health"], requiredPermission: "data-center.read",
        }, { specialty: "health" }],
        ["non-ASCII text", { title: "مستشفيات الرياض", content: geojson("الورود", "النخيل") }],
      ];
      for (const [label, over, options] of shapes) {
        const item = await dataset(tx, admin, source.id, over);
        const result = await read(item.version.id, admin, options);
        expect(result.integrity.checksum, label).toBe(item.version.checksum);
      }
      // A later version of the same item is hashed the same way.
      const created = await dataset(tx, admin, source.id, { attribution: "© v1" });
      const next = await createDataCenterVersion({ itemId: created.id, title: "Second", content: geojson("v2"), evidenceStatus: "ESTIMATED", reason: "Update", attribution: "© v2", coverage: { countryCodes: ["SA"] } }, admin);
      await publish(created.id, admin);
      expect((await read(next.id, admin)).integrity.checksum).toBe(next.checksum);
    });
  });

  it.each<[string, (tx: DbExecutor, versionId: string) => Promise<unknown>, Record<string, unknown>?]>([
    ["its content", (tx, id) => tx.$executeRaw`UPDATE "DataCenterVersion" SET "content" = ${geojson("tampered")} WHERE "id" = ${id}`],
    ["its title", (tx, id) => tx.$executeRaw`UPDATE "DataCenterVersion" SET "title" = 'Tampered' WHERE "id" = ${id}`],
    ["its evidence status", (tx, id) => tx.$executeRaw`UPDATE "DataCenterVersion" SET "evidenceStatus" = 'UNVERIFIED'::"DataCenterEvidence" WHERE "id" = ${id}`],
    ["its origin", (tx, id) => tx.$executeRaw`UPDATE "DataCenterVersion" SET "origin" = 'IMPORT' WHERE "id" = ${id}`],
    ["its provenance", (tx, id) => tx.$executeRaw`UPDATE "DataCenterVersion" SET "provenance" = '[]'::jsonb WHERE "id" = ${id}`],
    ["its specialties", (tx, id) => tx.$executeRaw`UPDATE "DataCenterVersion" SET "specialties" = ARRAY['health']::text[] WHERE "id" = ${id}`, { specialty: "health" }],
    ["its source date", (tx, id) => tx.$executeRaw`UPDATE "DataCenterVersion" SET "sourcePublishedAt" = ${ago(2)} WHERE "id" = ${id}`],
    ["its attribution", (tx, id) => tx.$executeRaw`UPDATE "DataCenterVersion" SET "attribution" = '© Someone else' WHERE "id" = ${id}`],
    ["its coverage", (tx, id) => tx.$executeRaw`UPDATE "DataCenterVersion" SET "coverageCountries" = ARRAY['AE']::text[] WHERE "id" = ${id}`],
  ])("refuses a version whose stored %s was changed after it was written, and returns nothing of it", async (_what, tamper, options) => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const item = await dataset(tx, admin, source.id, { attribution: "© Authority", coverage: { countryCodes: ["SA"] }, provenance: [{ label: "Register", reference: "ref", kind: "SOURCE" }] });
      expect((await read(item.version.id, admin)).integrity.checksum).toBe(item.version.checksum);
      await withoutImmutability(tx, "DataCenterVersion", () => tamper(tx, item.version.id));
      const error = await failure(read(item.version.id, admin, options));
      expect(error).toMatchObject({ code: "VERSION_CHECKSUM_MISMATCH", status: 500 });
      expect(JSON.stringify(error)).not.toContain("tampered");
    });
  });

  it("reads a version restricted to a specialty or a mission context only for a caller that names it, as retrieval does", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const restricted = await dataset(tx, admin, source.id, { specialties: ["demography"], missionContexts: ["site-study"] });
      expect(await failure(read(restricted.version.id, admin))).toMatchObject(NOT_FOUND);
      expect(await failure(read(restricted.version.id, admin, { specialty: "logistics", missionContext: "site-study" }))).toMatchObject(NOT_FOUND);
      expect(await failure(read(restricted.version.id, admin, { specialty: "demography" }))).toMatchObject(NOT_FOUND);
      expect((await read(restricted.version.id, admin, { specialty: "demography", missionContext: "site-study" })).content).toBe(restricted.version.content);
    });
  });

  it("refuses a version whose lineage was changed after it was written", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const upstream = await dataset(tx, admin, source.id);
      const derived = await dataset(tx, admin, source.id, { upstreamVersionIds: [upstream.version.id] });
      expect((await read(derived.version.id, admin)).integrity.checksum).toBe(derived.version.checksum);
      await withoutImmutability(tx, "DataCenterVersionLineage", () => tx.$executeRaw`DELETE FROM "DataCenterVersionLineage" WHERE "versionId" = ${derived.version.id}`);
      expect(await failure(read(derived.version.id, admin))).toMatchObject({ code: "VERSION_CHECKSUM_MISMATCH" });
    });
  });

  // ------------------------------------------------------------------------------------------------------------------ GeoJSON
  const features = (...items: unknown[]) => JSON.stringify({ type: "FeatureCollection", features: items });
  const point = { type: "Feature", properties: { name: "p" }, geometry: { type: "Point", coordinates: [46.7, 24.7] } };
  it.each<[string, string, string]>([
    ["text that is not JSON", "this is not json", "INVALID_GEOJSON"],
    ["a JSON value that is not an object", "42", "INVALID_GEOJSON"],
    ["an object that is not GeoJSON", JSON.stringify({ hello: "world" }), "INVALID_GEOJSON"],
    ["an empty collection", features(), "INVALID_GEOJSON"],
    ["a CRS member: only WGS84 is accepted", JSON.stringify({ type: "FeatureCollection", crs: { type: "name", properties: { name: "EPSG:32638" } }, features: [point] }), "GEOJSON_WGS84_REQUIRED"],
    ["a longitude out of range", features({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [466.7, 24.7] } }), "INVALID_GEOJSON_COORDINATES"],
    ["a latitude out of range", features({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [46.7, 91] } }), "INVALID_GEOJSON_COORDINATES"],
    ["a position that is not numeric", features({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: ["46.7", "24.7"] } }), "INVALID_GEOJSON_COORDINATES"],
    ["a polygon ring that is not closed", features({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] } }), "INVALID_GEOJSON_COORDINATES"],
    ["a geometry type that does not exist", features({ type: "Feature", properties: {}, geometry: { type: "Circle", coordinates: [0, 0] } }), "INVALID_GEOJSON_COORDINATES"],
    ["an element that is not a feature", features({ type: "Point", coordinates: [0, 0] }), "INVALID_GEOJSON_FEATURE"],
    ["a feature without properties", features({ type: "Feature", geometry: { type: "Point", coordinates: [46.7, 24.7] } }), "INVALID_GEOJSON_FEATURE"],
    ["properties that are an array", features({ type: "Feature", properties: [], geometry: { type: "Point", coordinates: [46.7, 24.7] } }), "INVALID_GEOJSON_FEATURE"],
    ["a key that could pollute a prototype", `{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"__proto__":{"x":1}},"geometry":null}]}`, "UNSAFE_JSON_KEY"],
    ["nesting that is far too deep", `{"type":"FeatureCollection","features":[{"type":"Feature","properties":${"[".repeat(40)}${"]".repeat(40)},"geometry":null}]}`, "IMPORT_STRUCTURE_LIMIT"],
  ])("refuses %s, with the Data Center's own code, and repairs nothing", async (_name, content, code) => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const item = await dataset(tx, admin, source.id, { content });
      const error = await failure(read(item.version.id, admin));
      expect(error).toMatchObject({ code, status: 422 });
      // The checksum was fine: the content is refused for what it is, not because it was tampered with.
      expect(error.code).not.toBe("VERSION_CHECKSUM_MISMATCH");
    });
  });

  it("accepts every valid geometry type, a feature with no geometry (the engine decides what to do with it), and a single feature or bare geometry", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const ring = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
      const all = features(
        { type: "Feature", properties: null, geometry: { type: "Point", coordinates: [46.7, 24.7] } },
        { type: "Feature", properties: {}, geometry: { type: "MultiPoint", coordinates: [[1, 1], [2, 2]] } },
        { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[1, 1], [2, 2]] } },
        { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: [[[1, 1], [2, 2]], [[3, 3], [4, 4]]] } },
        { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } },
        { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: [[ring]] } },
        { type: "Feature", properties: { note: "no geometry" }, geometry: null },
      );
      const item = await dataset(tx, admin, source.id, { content: all });
      const result = await read(item.version.id, admin);
      expect(result.features?.map((feature) => feature.geometry?.type ?? null)).toEqual(["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon", null]);
      expect((await read((await dataset(tx, admin, source.id, { content: JSON.stringify(point) })).version.id, admin)).features).toHaveLength(1);
      expect((await read((await dataset(tx, admin, source.id, { content: JSON.stringify({ type: "Point", coordinates: [46.7, 24.7] }) })).version.id, admin)).features).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------------------------------------------------- effects
  it("writes nothing: no usage record, no audit entry, no lifecycle event, no new version", async () => {
    await isolated(async (tx, admin) => {
      const source = await platformSource(admin);
      const item = await dataset(tx, admin, source.id);
      const counts = async () => ({
        usage: await tx.dataCenterUsage.count(), audit: await tx.auditLog.count(), events: await tx.dataCenterEvent.count(), versions: await tx.dataCenterVersion.count(),
        revision: (await tx.dataCenterItem.findUniqueOrThrow({ where: { id: item.id } })).revision,
      });
      const before = await counts();
      await read(item.version.id, admin);
      await failure(read("missing", admin));
      await failure(read(item.version.id, admin, { expectedChecksum: "0".repeat(64) }));
      expect(await counts()).toEqual(before);
    });
  });

  it("refuses a request that is not well formed, and a caller that is not a trusted principal", async () => {
    await isolated(async (tx, admin) => {
      for (const bad of [{}, { versionId: "" }, { versionId: "x".repeat(129) }, { versionId: "a", expectedChecksum: "ABC" }, { versionId: "a", expectedChecksum: "a".repeat(63) }, { versionId: "a", require: "CSV" }, { versionId: "a", extra: true }]) {
        expect(await failure(readDataCenterVersionContent(bad as never, admin, { now: NOW })), JSON.stringify(bad)).toMatchObject({ code: "INVALID_VERSION_REQUEST", status: 400 });
      }
      expect(await failure(read("a", { ...admin, kind: "SYSTEM" } as never))).toMatchObject({ code: "TRUSTED_PRINCIPAL_KIND_REQUIRED", status: 403 });
    });
  });
});
