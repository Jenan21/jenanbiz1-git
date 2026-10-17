import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Prisma, HubItem, HubVersion } from "@/generated/prisma/client";
import { documentStorage } from "@/lib/storage/document-storage";
import {
  academySchema, academyTransitionSchema, conflictSchema, createItemSchema, exportSchema,
  evidenceLinkSchema, grantSchema, listSchema, resolveConflictSchema, retrievalSchema, sourceSchema, transitionSchema,
  type DataCenterUser, type SemanticSearchProvider,
} from "./contracts";
import { assertTransition, canSee, compatibleScope, DataCenterError, freshnessConfidence, managementScope, requirePermission, visibleScope } from "./policy";
import { importCapabilities, parseDataCenterFile } from "./imports";

export { DataCenterError } from "./policy";
export { configureDataCenterScanner } from "./imports";
type Transaction = Prisma.TransactionClient;
let semanticProvider: SemanticSearchProvider | undefined;
export function configureDataCenterSemanticProvider(provider: SemanticSearchProvider | undefined) { semanticProvider = provider; }
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const versionInclude = { versions: { orderBy: { version: "desc" as const }, take: 1, include: { source: true } } };
function audit(tx: Transaction, actorId: string, action: string, entityId: string, metadata: Prisma.InputJsonObject = {}) {
  return tx.auditLog.create({ data: { actorId, action: `data-center.${action}`, entityType: "HubItem", entityId, metadata } });
}
function scoped(user: DataCenterUser, value: { scope: string; organizationId?: string }) {
  return { scope: value.scope, organizationId: value.organizationId ?? null, ownerId: user.id };
}
async function findItem(tx: Transaction, user: DataCenterUser, id: string) {
  const item = await tx.hubItem.findFirst({ where: { id, ...visibleScope(user) } });
  if (!item) throw new DataCenterError("Record not found", 404, "NOT_FOUND");
  return item;
}
async function cas(tx: Transaction, item: HubItem, expectedRevision: number, data: Prisma.HubItemUpdateManyMutationInput) {
  const result = await tx.hubItem.updateMany({ where: { id: item.id, revision: expectedRevision }, data: { ...data, revision: { increment: 1 } } });
  if (result.count !== 1) throw new DataCenterError("Record changed; reload before retrying", 409, "REVISION_CONFLICT");
}
function sourceSnapshot(source: { name: string; url: string | null; quality: number; license: string; allowRedistribution: boolean }): Prisma.InputJsonObject {
  return { name: source.name, url: source.url, quality: source.quality, license: source.license, allowRedistribution: source.allowRedistribution };
}

export async function createDataCenterSource(user: DataCenterUser, input: unknown) {
  const value = sourceSchema.parse(input);
  requirePermission(user, "source", scoped(user, value));
  return json(await db.$transaction(async (tx) => {
    const source = await tx.hubSource.create({ data: { ...value, ownerId: user.id } });
    await audit(tx, user.id, "source.created", source.id, { scope: source.scope });
    return source;
  }));
}

async function createItem(user: DataCenterUser, input: unknown, original?: { storageKey: string; mimeType: string; size: number }) {
  const value = createItemSchema.parse(input);
  return json(await db.$transaction(async (tx) => {
    let item = value.itemId ? await findItem(tx, user, value.itemId) : null;
    const scope = item ?? scoped(user, value);
    requirePermission(user, "write", scope);
    if (value.verification === "HUMAN_VERIFIED") requirePermission(user, "verify", scope);
    if (new Date(value.sourceDate) > new Date()) throw new DataCenterError("Source date cannot be in the future");
    if (item && (item.layer !== value.layer || !compatibleScope(item, scoped({ ...user, id: item.ownerId }, value)))) throw new DataCenterError("Versions cannot change scope or layer");
    const source = await tx.hubSource.findFirst({ where: { id: value.sourceId, ...visibleScope(user) } });
    if (!source || !compatibleScope(scope, source)) throw new DataCenterError("Source must match the item's exact scope", 403);
    const version = item ? item.currentVersion + 1 : 1;
    if (item) {
      await cas(tx, item, value.expectedRevision!, { currentVersion: version, title: value.title, tags: value.tags, state: "DRAFT" });
    } else item = await tx.hubItem.create({ data: { layer: value.layer, ...scoped(user, value) as { scope: "PLATFORM" | "ORGANIZATION" | "PRIVATE"; organizationId: string | null; ownerId: string }, title: value.title, tags: value.tags } });
    const created = await tx.hubVersion.create({ data: {
      itemId: item.id, version, title: value.title, content: value.content, tags: value.tags,
      sourceId: source.id, sourceDate: new Date(value.sourceDate), sourceSnapshot: sourceSnapshot(source),
      confidence: value.confidence, verification: value.verification, authorId: user.id,
      verifiedById: value.verification === "HUMAN_VERIFIED" ? user.id : null,
      verifiedAt: value.verification === "HUMAN_VERIFIED" ? new Date() : null,
      validUntil: value.validUntil ? new Date(value.validUntil) : null, checksum: digest(value.content),
      originalStorageKey: original?.storageKey, originalMimeType: original?.mimeType, originalBytes: original?.size,
      chunks: { create: Array.from({ length: Math.ceil(value.content.length / 2000) }, (_, ordinal) => {
        const content = value.content.slice(ordinal * 2000, (ordinal + 1) * 2000);
        return { ordinal, content, checksum: digest(content) };
      }) },
    } });
    await audit(tx, user.id, "version.created", item.id, { versionId: created.id, version, scope: item.scope });
    return { ...item, title: value.title, currentVersion: version, revision: value.itemId ? value.expectedRevision! + 1 : 1, state: "DRAFT", version: created };
  }));
}
export async function createDataCenterItem(user: DataCenterUser, input: unknown) { return createItem(user, input); }

export async function transitionDataCenterItem(user: DataCenterUser, input: unknown) {
  const value = transitionSchema.parse(input);
  return json(await db.$transaction(async (tx) => {
    const item = await findItem(tx, user, value.itemId);
    const permission = value.state === "APPROVED" ? "approve" : value.state === "PUBLISHED" ? "publish" : value.state === "ARCHIVED" || value.state === "DEPRECATED" ? "archive" : "review";
    requirePermission(user, permission, item);
    assertTransition(item.state, value.state);
    const version = await tx.hubVersion.findUniqueOrThrow({ where: { itemId_version: { itemId: item.id, version: item.currentVersion } } });
    if (["APPROVED", "PUBLISHED"].includes(value.state)) {
      if (version.authorId === user.id) throw new DataCenterError("An independent human reviewer is required", 403);
      if (version.verification !== "HUMAN_VERIFIED" || !version.verifiedById) throw new DataCenterError("Explicit human verification is required");
      if (version.validUntil && version.validUntil <= new Date()) throw new DataCenterError("Expired content cannot be approved or published");
      const conflicts = await tx.hubConflict.count({ where: { resolution: null, OR: [{ leftVersionId: version.id }, { rightVersionId: version.id }] } });
      if (conflicts) throw new DataCenterError("Resolve conflicts before approval or publication", 409);
    }
    await cas(tx, item, value.expectedRevision, { state: value.state });
    await tx.hubReview.create({ data: { itemId: item.id, versionId: version.id, actorId: user.id, fromState: item.state, toState: value.state, notes: value.notes } });
    await audit(tx, user.id, "transition", item.id, { from: item.state, to: value.state, versionId: version.id, notes: value.notes });
    return { ...item, state: value.state, revision: value.expectedRevision + 1 };
  }));
}

export async function ingestDataCenterFile(user: DataCenterUser, file: File, metadata: unknown) {
  // Validate permissions and metadata before invoking a scanner or touching storage.
  const metadataObject = z.record(z.string(), z.unknown()).parse(metadata);
  if ("content" in metadataObject) throw new DataCenterError("Import content must come from the uploaded file");
  const base = createItemSchema.parse({ ...metadataObject, content: "import" });
  requirePermission(user, "import", scoped(user, base));
  const parsed = await parseDataCenterFile(file);
  const storageKey = `data-center/${user.id}/${randomUUID()}`;
  await documentStorage.upload(storageKey, parsed.bytes, parsed.mimeType);
  try { return await createItem(user, { ...base, content: parsed.content }, { storageKey, mimeType: parsed.mimeType, size: parsed.bytes.length }); }
  catch (error) { await documentStorage.delete(storageKey); throw error; }
}

export async function getDataCenterOverview(user: DataCenterUser) {
  requirePermission(user, "read");
  const where = managementScope(user);
  const [layers, states, sourceCount, conflictCount, academyCount, grantCount] = await Promise.all([
    db.hubItem.groupBy({ by: ["layer"], where, _count: true }),
    db.hubItem.groupBy({ by: ["state"], where, _count: true }),
    db.hubSource.count({ where }),
    db.hubConflict.count({ where: { AND: [{ leftVersion: { item: where } }, { rightVersion: { item: where } }], resolution: null } }),
    db.hubAcademyRelease.count({ where: { item: where } }),
    db.hubAccessGrant.count({ where: { item: where, revokedAt: null, expiresAt: { gt: new Date() } } }),
  ]);
  return json({ layers, states, sourceCount, conflictCount, academyCount, grantCount, semantic: semanticProvider ? "available" : "unavailable", vectorDatabase: "not_configured", imports: importCapabilities, scanner: "required", workflow: ["DRAFT", "UNDER_REVIEW", "APPROVED", "PUBLISHED", "DEPRECATED", "ARCHIVED", "REJECTED"] });
}

function publicItem(item: HubItem & { versions: Array<HubVersion & { source: { quality: number; license: string; allowRedistribution: boolean; name: string } }> }) {
  const version = item.versions[0];
  return { ...item, versions: undefined, version: version ? { ...version, originalStorageKey: undefined, scoring: freshnessConfidence({ ...version, quality: version.source.quality }) } : null };
}
export async function listDataCenterArea(user: DataCenterUser, area: string, query: unknown = {}) {
  requirePermission(user, "read");
  const filter = listSchema.parse(query);
  const where = managementScope(user);
  const take = filter.limit;
  if (area === "sources") return json(await db.hubSource.findMany({ where: { ...where, ...(filter.query ? { name: { contains: filter.query, mode: "insensitive" } } : {}) }, take, orderBy: { createdAt: "desc" } }));
  if (area === "conflicts") return json(await db.hubConflict.findMany({ where: { AND: [{ leftVersion: { item: where } }, { rightVersion: { item: where } }] }, include: { leftVersion: { select: { sourceSnapshot: true, sourceDate: true, confidence: true, title: true } }, rightVersion: { select: { sourceSnapshot: true, sourceDate: true, confidence: true, title: true } } }, take, orderBy: { createdAt: "desc" } }));
  if (area === "academy") return json(await db.hubAcademyRelease.findMany({ where: { item: where }, include: { item: true }, take, orderBy: { createdAt: "desc" } }));
  if (area === "grants") return json(await db.hubAccessGrant.findMany({ where: { item: where }, take, orderBy: { createdAt: "desc" } }));
  if (area === "usage") return json(await db.hubUsage.findMany({ where: { actorId: user.id, version: { item: where } }, take, orderBy: { createdAt: "desc" } }));
  const layer = ({ data: "DATA", knowledge: "KNOWLEDGE", assets: "ASSET", evidence: "EVIDENCE" } as const)[area as "data"];
  if (!layer) throw new DataCenterError("Unknown area", 404);
  return json((await db.hubItem.findMany({ where: { ...where, layer, state: filter.state, ...(filter.query ? { OR: undefined, AND: [where, { OR: [{ title: { contains: filter.query, mode: "insensitive" } }, { tags: { has: filter.query } }] }] } : {}) }, include: versionInclude, take, orderBy: { updatedAt: "desc" } })).map(publicItem));
}

export async function retrieveDataCenterContext(user: DataCenterUser, input: unknown) {
  const value = retrievalSchema.parse(input);
  if (value.organizationId && !user.memberships.some((entry) => entry.organizationId === value.organizationId && entry.status === "ACTIVE")) throw new DataCenterError("Organization unavailable", 403);
  if (value.mode === "semantic" && !semanticProvider) return { status: "unavailable", reason: "No embedding/semantic provider is configured; keyword search remains available.", results: [] };
  return db.$transaction(async (tx) => {
    const now = new Date();
    const terms = value.query.split(/\s+/).filter(Boolean).slice(0, 8);
    const items = await tx.hubItem.findMany({
      where: {
        AND: [visibleScope(user), { OR: [{ scope: "PLATFORM" }, { scope: "PRIVATE", ownerId: user.id }, ...(value.organizationId ? [{ scope: "ORGANIZATION" as const, organizationId: value.organizationId }] : [])] }],
        state: "PUBLISHED",
        ...(value.robotId ? { grants: { some: { robotId: value.robotId, missionId: value.missionId ?? null, grantedById: user.id, revokedAt: null, expiresAt: { gt: now } } } } : {}),
        ...(value.mode === "keyword" ? { versions: { some: { OR: terms.map((term) => ({ content: { contains: term, mode: "insensitive" as const } })) } } } : {}),
      }, include: versionInclude, take: 200, orderBy: { updatedAt: "desc" },
    });
    let candidates = items.flatMap((item) => {
      const version = item.versions[0];
      if (!version || (version.validUntil && version.validUntil <= now)) return [];
      // An old matching version must not make an unrelated current version retrievable.
      if (value.mode === "keyword" && !terms.some((term) => version.content.toLowerCase().includes(term.toLowerCase()))) return [];
      return [{ item, version, score: 0 }];
    });
    if (value.mode === "semantic" && semanticProvider) {
      const scores = await semanticProvider.search({ query: value.query, candidates: candidates.map(({ version }) => ({ versionId: version.id, text: version.content })), limit: value.limit });
      const map = new Map(scores.filter((score) => Number.isFinite(score.score)).map((score) => [score.versionId, score.score]));
      candidates = candidates.filter(({ version }) => map.has(version.id)).map((entry) => ({ ...entry, score: map.get(entry.version.id)! })).sort((a, b) => b.score - a.score);
    }
    const results = [];
    for (const { item, version, score } of candidates.slice(0, value.limit)) {
      const unresolved = await tx.hubConflict.count({ where: { resolution: null, OR: [{ leftVersionId: version.id }, { rightVersionId: version.id }] } });
      if (unresolved) continue;
      await tx.hubUsage.create({ data: { versionId: version.id, actorId: user.id, robotId: value.robotId, missionId: value.missionId, purpose: value.robotId ? "ROBOT_CONTEXT" : "SEARCH" } });
      results.push({ itemId: item.id, versionId: version.id, version: version.version, layer: item.layer, title: version.title, text: version.content.slice(0, value.robotId ? 4000 : 8000), source: version.sourceSnapshot, sourceDate: version.sourceDate.toISOString(), verification: version.verification, scoring: freshnessConfidence({ ...version, quality: version.source.quality }, now), ...(value.mode === "semantic" ? { similarity: score } : {}) });
    }
    return { status: "available", mode: value.mode, results, truncated: items.length === 200, executionAllowed: false };
  });
}

function safeCsv(value: string) { return `"${(/^[=+\-@\t\r\n]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`; }
export async function exportDataCenter(user: DataCenterUser, input: unknown) {
  const value = exportSchema.parse(input);
  return db.$transaction(async (tx) => {
    const items = await tx.hubItem.findMany({ where: { id: { in: value.itemIds }, ...visibleScope(user), state: "PUBLISHED" }, include: versionInclude });
    if (items.length !== new Set(value.itemIds).size) throw new DataCenterError("Some export records are unavailable", 404);
    const rows = items.map((item) => {
      requirePermission(user, "export", item);
      const version = item.versions[0];
      const snapshot = version.sourceSnapshot as { allowRedistribution?: boolean };
      if (!version.source.allowRedistribution || snapshot.allowRedistribution !== true) throw new DataCenterError("Source license prohibits redistribution", 403, "LICENSE_RESTRICTED");
      if (version.validUntil && version.validUntil <= new Date()) throw new DataCenterError("Expired version cannot be exported", 409);
      return { itemId: item.id, versionId: version.id, version: version.version, title: version.title, content: version.content, source: version.sourceSnapshot, sourceDate: version.sourceDate.toISOString(), confidence: version.confidence, verification: version.verification };
    });
    for (const row of rows) {
      await tx.hubUsage.create({ data: { versionId: row.versionId, actorId: user.id, purpose: "EXPORT" } });
      await audit(tx, user.id, "export", row.itemId, { versionId: row.versionId, format: value.format });
    }
    return { mimeType: value.format === "json" ? "application/json" : "text/csv", filename: `jenan-pro-data-center.${value.format}`, content: value.format === "json" ? JSON.stringify(rows, null, 2) : [["itemId", "versionId", "version", "title", "content", "source", "sourceDate", "confidence", "verification"].join(","), ...rows.map((row) => Object.values(row).map((cell) => safeCsv(typeof cell === "object" ? JSON.stringify(cell) : String(cell))).join(","))].join("\r\n") };
  });
}

export async function createDataCenterConflict(user: DataCenterUser, input: unknown) {
  const value = conflictSchema.parse(input);
  if (value.leftVersionId === value.rightVersionId) throw new DataCenterError("A conflict requires two distinct versions");
  return json(await db.$transaction(async (tx) => {
    const versions = await tx.hubVersion.findMany({ where: { id: { in: [value.leftVersionId, value.rightVersionId] } }, include: { item: true } });
    if (versions.length !== 2 || versions.some((entry) => !canSee(user, entry.item))) throw new DataCenterError("Version not found", 404);
    for (const version of versions) requirePermission(user, "review", version.item);
    if (!compatibleScope(versions[0].item, versions[1].item)) throw new DataCenterError("Conflicts cannot bridge scopes");
    const conflict = await tx.hubConflict.create({ data: { ...value, createdById: user.id } });
    // Lock item revisions so publication racing a new conflict cannot silently win.
    for (const item of new Map(versions.map((version) => [version.item.id, version.item])).values()) await cas(tx, item, item.revision, {});
    await audit(tx, user.id, "conflict.created", versions[0].itemId, { conflictId: conflict.id });
    return conflict;
  }));
}
export async function resolveDataCenterConflict(user: DataCenterUser, input: unknown) {
  const value = resolveConflictSchema.parse(input);
  return json(await db.$transaction(async (tx) => {
    const conflict = await tx.hubConflict.findUnique({ where: { id: value.conflictId }, include: { leftVersion: { include: { item: true } }, rightVersion: { include: { item: true } } } });
    if (!conflict) throw new DataCenterError("Conflict not found", 404);
    requirePermission(user, "approve", conflict.leftVersion.item); requirePermission(user, "approve", conflict.rightVersion.item);
    const result = await tx.hubConflict.updateMany({ where: { id: conflict.id, revision: value.expectedRevision, resolution: null }, data: { resolution: value.resolution, resolvedById: user.id, resolvedAt: new Date(), revision: { increment: 1 } } });
    if (!result.count) throw new DataCenterError("Conflict changed", 409);
    await audit(tx, user.id, "conflict.resolved", conflict.leftVersion.itemId, { conflictId: conflict.id, resolution: value.resolution });
    return { id: conflict.id, resolution: value.resolution, revision: value.expectedRevision + 1 };
  }));
}

export async function grantDataCenterRobotAccess(user: DataCenterUser, input: unknown) {
  const value = grantSchema.parse(input);
  const expiresAt = new Date(value.expiresAt);
  if (expiresAt <= new Date() || expiresAt.getTime() > Date.now() + 90 * 86400000) throw new DataCenterError("Grant expiry must be within 90 days");
  return json(await db.$transaction(async (tx) => {
    const item = await findItem(tx, user, value.itemId);
    requirePermission(user, "grant", item);
    if (item.state !== "PUBLISHED") throw new DataCenterError("Only published items may be granted");
    if (!await tx.robot.findUnique({ where: { id: value.robotId }, select: { id: true } })) throw new DataCenterError("Robot not found", 404);
    if (value.missionId && !await tx.mission.findFirst({ where: { id: value.missionId, assignedRobots: { some: { id: value.robotId } } }, select: { id: true } })) throw new DataCenterError("Mission is not assigned to this robot", 404);
    const grant = await tx.hubAccessGrant.create({ data: { ...value, expiresAt, grantedById: user.id } });
    await audit(tx, user.id, "robot.granted", item.id, { grantId: grant.id, robotId: value.robotId });
    return { ...grant, executionAllowed: false };
  }));
}
export async function revokeDataCenterRobotAccess(user: DataCenterUser, input: unknown) {
  const { grantId } = z.object({ grantId: z.string().min(1).max(128) }).strict().parse(input);
  return db.$transaction(async (tx) => {
    const grant = await tx.hubAccessGrant.findUnique({ where: { id: grantId }, include: { item: true } });
    if (!grant) throw new DataCenterError("Grant not found", 404);
    requirePermission(user, "grant", grant.item);
    await tx.hubAccessGrant.update({ where: { id: grantId }, data: { revokedAt: new Date() } });
    await audit(tx, user.id, "robot.revoked", grant.itemId, { grantId });
    return { revoked: true };
  });
}
export async function stageDataCenterAcademy(user: DataCenterUser, input: unknown) {
  const value = academySchema.parse(input);
  return json(await db.$transaction(async (tx) => {
    const item = await findItem(tx, user, value.itemId);
    requirePermission(user, "academy", item);
    const version = await tx.hubVersion.findFirst({ where: { id: value.versionId, itemId: item.id } });
    if (!version) throw new DataCenterError("Version not found", 404);
    const release = await tx.hubAcademyRelease.create({ data: { ...value, startsAt: value.startsAt ? new Date(value.startsAt) : null, validUntil: value.validUntil ? new Date(value.validUntil) : null, createdById: user.id } });
    await audit(tx, user.id, "academy.staged", item.id, { academyId: release.id, versionId: version.id });
    return release;
  }));
}
export async function transitionDataCenterAcademy(user: DataCenterUser, input: unknown) {
  const value = academyTransitionSchema.parse(input);
  return json(await db.$transaction(async (tx) => {
    const release = await tx.hubAcademyRelease.findUnique({ where: { id: value.academyId }, include: { item: true, version: true } });
    if (!release) throw new DataCenterError("Academy release not found", 404);
    requirePermission(user, value.state === "APPROVED" ? "approve" : value.state === "PUBLISHED" ? "publish" : "academy", release.item);
    assertTransition(release.state, value.state);
    if (["APPROVED", "PUBLISHED"].includes(value.state)) {
      if (release.createdById === user.id || release.version.verification !== "HUMAN_VERIFIED") throw new DataCenterError("Independent human verification required", 403);
      if (release.item.state !== "PUBLISHED" || release.item.currentVersion !== release.version.version) throw new DataCenterError("Academy requires the current published version");
      if ((release.validUntil && release.validUntil <= new Date()) || (release.version.validUntil && release.version.validUntil <= new Date())) throw new DataCenterError("Academy content expired");
      if (value.state === "PUBLISHED" && release.startsAt && release.startsAt > new Date()) throw new DataCenterError("Release start date has not arrived");
      if (await tx.hubConflict.count({ where: { resolution: null, OR: [{ leftVersionId: release.versionId }, { rightVersionId: release.versionId }] } })) throw new DataCenterError("Unresolved academy conflict", 409);
    }
    const updated = await tx.hubAcademyRelease.updateMany({ where: { id: release.id, revision: value.expectedRevision }, data: { state: value.state, revision: { increment: 1 }, lastReviewedById: user.id } });
    if (!updated.count) throw new DataCenterError("Academy release changed", 409);
    await audit(tx, user.id, "academy.transition", release.itemId, { academyId: release.id, from: release.state, to: value.state, notes: value.notes });
    return { id: release.id, state: value.state, revision: value.expectedRevision + 1, robotRelease: false };
  }));
}

const layerService = (layer: "DATA" | "KNOWLEDGE" | "ASSET" | "EVIDENCE", area: string) => ({
  create: (user: DataCenterUser, input: Record<string, unknown>) => createDataCenterItem(user, { ...input, layer }),
  list: (user: DataCenterUser, query?: unknown) => listDataCenterArea(user, area, query),
  transition: transitionDataCenterItem,
});
export const JenanDataService = layerService("DATA", "data");
export const JenanKnowledgeService = layerService("KNOWLEDGE", "knowledge");
export const JenanAssetService = layerService("ASSET", "assets");
export const JenanEvidenceService = layerService("EVIDENCE", "evidence");
export const JenanContextService = { retrieve: retrieveDataCenterContext, grant: grantDataCenterRobotAccess, revoke: revokeDataCenterRobotAccess };

export async function getDataCenterItem(user: DataCenterUser, itemId: string) {
  z.string().min(1).max(128).parse(itemId);
  return db.$transaction(async (tx) => {
    const item = await findItem(tx, user, itemId);
    requirePermission(user, "read", item);
    const versions = await tx.hubVersion.findMany({ where: { itemId }, orderBy: { version: "desc" }, take: 100, include: { chunks: { select: { id: true, ordinal: true, checksum: true }, orderBy: { ordinal: "asc" } }, evidenceLinks: { include: { evidenceVersion: { select: { id: true, title: true, sourceSnapshot: true, sourceDate: true, confidence: true } } } } } });
    const reviews = await tx.hubReview.findMany({ where: { itemId }, take: 100, orderBy: { createdAt: "desc" } });
    return json({ ...item, versions: versions.map((version) => ({ ...version, originalStorageKey: undefined, hasOriginal: Boolean(version.originalStorageKey) })), reviews });
  });
}

export async function linkDataCenterEvidence(user: DataCenterUser, input: unknown) {
  const value = evidenceLinkSchema.parse(input);
  if (value.versionId === value.evidenceVersionId) throw new DataCenterError("Evidence cannot reference itself");
  return json(await db.$transaction(async (tx) => {
    const versions = await tx.hubVersion.findMany({ where: { id: { in: [value.versionId, value.evidenceVersionId] } }, include: { item: true } });
    const target = versions.find((version) => version.id === value.versionId);
    const evidence = versions.find((version) => version.id === value.evidenceVersionId);
    if (!target || !evidence || !canSee(user, target.item) || !canSee(user, evidence.item)) throw new DataCenterError("Version not found", 404);
    requirePermission(user, "review", target.item);
    requirePermission(user, "review", evidence.item);
    if (evidence.item.layer !== "EVIDENCE" || !compatibleScope(target.item, evidence.item)) throw new DataCenterError("Evidence must be an EVIDENCE record in the same scope");
    const link = await tx.hubEvidenceLink.create({ data: { ...value, createdById: user.id } });
    await cas(tx, target.item, target.item.revision, {});
    await audit(tx, user.id, "evidence.linked", target.itemId, { linkId: link.id, evidenceVersionId: evidence.id, relation: value.relation });
    return link;
  }));
}
