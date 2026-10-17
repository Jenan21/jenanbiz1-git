import { Prisma } from "@/generated/prisma/client";
import { db, type DbExecutor } from "@/lib/db";
import { memberHasPermission } from "@/lib/auth/authorization";
import { DataCenterError, type DataCenterActor, type DataCenterContextRequest, type DataCenterSemanticAdapter } from "./contracts";
import { deterministicConfidence, isDataCenterAdmin, requireDataCenterAdmin, sourceScopeWhere } from "./policy";
import { auditDataCenter, createDataCenterItemInTransaction } from "./service";
import { validateDataCenterGeoJson } from "./imports";

let semanticAdapter: DataCenterSemanticAdapter | undefined;
export function configureDataCenterSemanticAdapter(adapter?: DataCenterSemanticAdapter) { semanticAdapter = adapter; }
export function dataCenterSemanticStatus() { return { available: !!semanticAdapter, provider: semanticAdapter?.name ?? null }; }

async function permissionFilter(actor: DataCenterActor, tx: DbExecutor = db): Promise<Prisma.DataCenterVersionWhereInput> {
  if (isDataCenterAdmin(actor)) return {};
  const memberships = await tx.organizationMember.findMany({ where: { userId: actor.id, status: "ACTIVE" }, include: { role: { include: { permissions: { include: { permission: true } } } } } });
  return { OR: [
    { requiredPermission: null },
    ...memberships.filter((m) => memberHasPermission(m, "data-center.read")).map((m) => ({
      item: { source: { scope: "ORGANIZATION" as const, organizationId: m.organizationId } },
      ...(m.isOwner ? {} : { requiredPermission: { in: m.role?.permissions.map((p) => p.permission.key) ?? [] } }),
    })),
  ] };
}
export async function accessiblePublishedVersionWhere(actor: DataCenterActor, input: DataCenterContextRequest = {}, tx: DbExecutor = db): Promise<Prisma.DataCenterVersionWhereInput> {
  const scope = await sourceScopeWhere(actor, tx);
  return {
    AND: [
      await permissionFilter(actor, tx),
      { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: new Date() } }] },
      { OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
    ],
    item: {
      status: { not: "ARCHIVED" }, publishedVersion: { not: null }, source: { AND: [scope, { allowRetrieval: true }, ...(input.organizationId ? [{ organizationId: input.organizationId }] : [])] },
      ...(input.typeKey ? { typeKey: input.typeKey } : {}), ...(input.layer ? { layer: input.layer } : {}),
      ...(input.categoryKey || input.departmentKey ? { type: { ...(input.categoryKey ? { categoryKey: input.categoryKey } : {}), ...(input.departmentKey ? { departmentKey: input.departmentKey } : {}) } } : {}),
      conflicts: { none: { resolvedAt: null } }, otherConflicts: { none: { resolvedAt: null } },
    },
    evidenceStatus: { not: "CONFLICTED" },
    ...(input.specialty ? { specialties: { has: input.specialty } } : { specialties: { isEmpty: true } }),
    ...(input.missionContext ? { missionContexts: { has: input.missionContext } } : { missionContexts: { isEmpty: true } }),
  };
}
export async function retrieveDataCenterContext(input: DataCenterContextRequest, actor: DataCenterActor) {
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit || 20)));
  const page = Math.max(1, Math.min(100, Math.floor(input.page || 1)));
  const query = input.query?.trim().slice(0, 500) ?? "";
  if (input.mode === "semantic" && !semanticAdapter)
    return { available: false, reason: "SEMANTIC_PROVIDER_UNAVAILABLE", rows: [], total: 0, page, limit, truncated: false };
  const where = await accessiblePublishedVersionWhere(actor, input);
  // Only scoped candidates reach either search adapter. The cap is explicit, never a claim of global coverage.
  const candidates = await db.dataCenterVersion.findMany({ where, include: { item: { include: { source: true } } }, take: 2001, orderBy: { createdAt: "desc" } });
  const current = candidates.slice(0, 2000).filter((v) => v.number === v.item.publishedVersion);
  let matches = current;
  if (query && current.length) {
    const ids = current.map((v) => v.id);
    let orderedIds: string[];
    if (input.mode === "semantic") {
      try { orderedIds = await semanticAdapter!.search({ query, candidateVersionIds: ids, limit: 2000 }); }
      catch { return { available: false, reason: "SEMANTIC_PROVIDER_UNAVAILABLE", rows: [], total: 0, page, limit, truncated: candidates.length > 2000 }; }
    } else {
      const result = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "DataCenterVersion"
        WHERE "id" IN (${Prisma.join(ids)})
          AND to_tsvector('simple', "title" || ' ' || "content") @@ plainto_tsquery('simple', ${query})
        ORDER BY ts_rank_cd(to_tsvector('simple', "title" || ' ' || "content"), plainto_tsquery('simple', ${query})) DESC, "id" ASC
      `);
      orderedIds = result.map((r) => r.id);
    }
    const indexed = new Map(current.map((v) => [v.id, v]));
    matches = [...new Set(orderedIds)].flatMap((id) => indexed.has(id) ? [indexed.get(id)!] : []);
  }
  return { available: true, mode: input.mode ?? "keyword", rows: matches.slice((page - 1) * limit, page * limit).map((v) => ({
    itemId: v.itemId, versionId: v.id, version: v.number, title: v.title, content: v.content,
    typeKey: v.item.typeKey, layer: v.item.layer, evidenceStatus: v.evidenceStatus, origin: v.origin,
    provenance: v.provenance, checksum: v.checksum, sourceId: v.item.sourceId, source: v.item.source.name,
    license: v.item.source.license, owner: v.item.source.owner, scope: v.item.source.scope,
    sourceOrganization: v.item.source.sourceOrganization, sourcePublishedAt: v.sourcePublishedAt, expiresAt: v.expiresAt,
    effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo,
    confidence: deterministicConfidence({ evidenceStatus: v.evidenceStatus, origin: v.origin,
      provenanceCount: Array.isArray(v.provenance) ? v.provenance.length : 0, sourcePublishedAt: v.sourcePublishedAt,
      freshnessDays: v.item.source.freshnessDays, expiresAt: v.expiresAt, sourceKind: v.item.source.kind,
      completeness: 4 + (Array.isArray(v.provenance) && v.provenance.length ? 2 : 0) + (v.sourcePublishedAt ? 2 : 0) + (v.effectiveFrom || v.effectiveTo ? 2 : 0), consistency: 0 }),
    confidenceSnapshot: v.confidence,
  })), total: matches.length, page, limit, truncated: candidates.length > 2000 };
}
/** Read-only geospatial consumer contract; rendering remains the Map consumer's responsibility. */
export async function retrieveDataCenterGeoContext(input: DataCenterContextRequest, actor: DataCenterActor) {
  const context = await retrieveDataCenterContext({ ...input, typeKey: "geojson", layer: "DATA" }, actor);
  const features = [];
  let invalidItems = 0;
  for (const row of context.rows) {
    try {
      for (const feature of validateDataCenterGeoJson(JSON.parse(row.content))) {
        if (features.length >= 10_000) break;
        features.push({ feature, source: { itemId: row.itemId, versionId: row.versionId, version: row.version, evidenceStatus: row.evidenceStatus, confidence: row.confidence, license: row.license, checksum: row.checksum } });
      }
    } catch { invalidItems++; }
  }
  return { available: context.available, coordinateSystem: "WGS84", features, page: context.page, limit: context.limit,
    truncated: context.truncated || features.length >= 10_000, invalidItems };
}
export async function recordDataCenterUsage(input: { versionId: string; consumer: string; purpose: string; missionId?: string; specialty?: string; missionContext?: string }, actor: DataCenterActor) {
  return db.$transaction(async (tx) => {
    const version = await tx.dataCenterVersion.findFirst({ where: { AND: [await accessiblePublishedVersionWhere(actor, { specialty: input.specialty, missionContext: input.missionContext }, tx), { id: input.versionId }] }, include: { item: true } });
    if (!version || version.number !== version.item.publishedVersion) throw new DataCenterError("PUBLISHED_VERSION_NOT_FOUND", 404);
    if (input.missionId) {
      const mission = await tx.mission.findFirst({ where: { id: input.missionId } });
      if (!mission || !isDataCenterAdmin(actor)) throw new DataCenterError("MISSION_ACCESS_REQUIRED", 403);
    }
    const usage = await tx.dataCenterUsage.create({ data: { versionId: input.versionId, consumer: input.consumer, purpose: input.purpose, missionId: input.missionId, actorId: actor.id } });
    await auditDataCenter(tx, actor, "version.used", input.versionId, { consumer: input.consumer, usageId: usage.id, specialty: input.specialty ?? null, missionContext: input.missionContext ?? null });
    return usage;
  });
}
export async function importAcademyDataCenterSource(input: { sourceId: string; resourceVersionId: string }, actor: DataCenterActor) {
  requireDataCenterAdmin(actor);
  return db.$transaction(async (tx) => {
    const source = await tx.dataCenterSource.findUnique({ where: { id: input.sourceId } });
    if (!source || source.kind !== "ACADEMY") throw new DataCenterError("ACADEMY_SOURCE_REQUIRED", 409);
    const version = await tx.academyResourceVersion.findUnique({ where: { id: input.resourceVersionId }, include: { resource: true } });
    if (!version || version.approvalState !== "APPROVED" || version.resource.approvalState !== "APPROVED" || version.version !== version.resource.currentVersion)
      throw new DataCenterError("APPROVED_ACADEMY_RESOURCE_REQUIRED", 409);
    return createDataCenterItemInTransaction(tx, {
      sourceId: source.id, title: version.title, typeKey: "academy-source", layer: "KNOWLEDGE",
      content: JSON.stringify(version.content), evidenceStatus: "UNVERIFIED", origin: "ACADEMY",
      sourcePublishedAt: version.sourcePublishedAt?.toISOString(),
      provenance: [{ label: version.resource.title, reference: `academy-resource-version:${version.id}`, kind: "SOURCE" }],
    }, actor);
  });
}
async function assertAcademyReleaseSource(tx: DbExecutor, versionId: string) {
  const version = await tx.dataCenterVersion.findUnique({ where: { id: versionId }, include: { item: { include: { source: true } } } });
  if (!version || version.item.source.kind !== "ACADEMY" || !version.item.source.allowRetrieval || version.item.layer !== "KNOWLEDGE" || version.item.status === "ARCHIVED" || version.number !== version.item.publishedVersion || version.origin !== "ACADEMY" || version.evidenceStatus === "CONFLICTED" || (version.expiresAt && version.expiresAt <= new Date()) || (version.effectiveFrom && version.effectiveFrom > new Date()) || (version.effectiveTo && version.effectiveTo <= new Date()))
    throw new DataCenterError("APPROVED_ACADEMY_SOURCE_REQUIRED", 409);
  const conflicts = await tx.dataCenterConflict.count({ where: { resolvedAt: null, OR: [{ itemId: version.itemId }, { otherItemId: version.itemId }] } });
  if (conflicts) throw new DataCenterError("UNRESOLVED_CONFLICT", 409);
  const references = Array.isArray(version.provenance) ? version.provenance : [];
  const reference = references.find((p) => p && typeof p === "object" && "reference" in p && typeof p.reference === "string" && p.reference.startsWith("academy-resource-version:"));
  const resourceVersionId = reference && typeof reference === "object" && "reference" in reference ? String(reference.reference).slice("academy-resource-version:".length) : "";
  const original = await tx.academyResourceVersion.findUnique({ where: { id: resourceVersionId }, include: { resource: true } });
  if (!original || original.approvalState !== "APPROVED" || original.resource.approvalState !== "APPROVED" || version.content !== JSON.stringify(original.content))
    throw new DataCenterError("APPROVED_ACADEMY_RESOURCE_REQUIRED", 409);
  return version;
}
async function assertAcademyTarget(tx: DbExecutor, targetKind: string, targetId: string) {
  const target = targetKind === "COURSE" ? await tx.academyCourse.findUnique({ where: { id: targetId }, select: { id: true } })
    : targetKind === "ROBOT" ? await tx.robot.findUnique({ where: { id: targetId }, select: { id: true } })
    : targetKind === "SPECIALTY" ? await tx.specialization.findUnique({ where: { id: targetId }, select: { id: true } }) : null;
  if (!target) throw new DataCenterError("ACADEMY_TARGET_NOT_FOUND", 404);
}
export async function exportDataCenter(input: DataCenterContextRequest & { format: "json" | "csv" }, actor: DataCenterActor) {
  const result = await retrieveDataCenterContext(input, actor);
  if (!result.available) throw new DataCenterError("SEARCH_UNAVAILABLE", 503);
  const sourceIds = [...new Set(result.rows.map((r) => r.sourceId))];
  const allowed = await db.dataCenterSource.findMany({ where: { id: { in: sourceIds }, allowExport: true }, select: { id: true } });
  const permitted = new Set(allowed.map((s) => s.id));
  const rows = result.rows.filter((r) => permitted.has(r.sourceId));
  await db.$transaction((tx) => auditDataCenter(tx, actor, "exported", actor.id, { format: input.format, versionIds: rows.map((r) => r.versionId), excludedByLicense: result.rows.length - rows.length }));
  if (input.format === "json") return { body: JSON.stringify({ ...result, rows, excludedByLicense: result.rows.length - rows.length }), mimeType: "application/json" };
  const fields = ["itemId", "versionId", "version", "title", "content", "evidenceStatus", "source", "license", "checksum"] as const;
  const escape = (v: unknown) => `"${String(v ?? "").replace(/^[=+\-@\t\r]/, "'$&").replaceAll('"', '""')}"`;
  return { body: [fields.join(","), ...rows.map((r) => fields.map((f) => escape(r[f])).join(","))].join("\r\n"), mimeType: "text/csv; charset=utf-8" };
}
export async function requestAcademyDataCenterRelease(input: { versionId: string; targetKind: string; targetId: string; notes: string }, actor: DataCenterActor) {
  requireDataCenterAdmin(actor);
  return db.$transaction(async (tx) => {
    await assertAcademyReleaseSource(tx, input.versionId);
    await assertAcademyTarget(tx, input.targetKind, input.targetId);
    const release = await tx.dataCenterAcademyRelease.create({ data: { ...input, requestedById: actor.id } });
    await auditDataCenter(tx, actor, "academy.release-requested", release.id, input);
    return release;
  });
}
export async function approveAcademyDataCenterRelease(input: { releaseId: string; notes: string }, actor: DataCenterActor) {
  requireDataCenterAdmin(actor);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`data-center-release:${input.releaseId}`}))`;
    const release = await tx.dataCenterAcademyRelease.findUnique({ where: { id: input.releaseId }, include: { version: { include: { item: true } } } });
    if (!release || release.status !== "PENDING" || release.version.item.status === "ARCHIVED" || release.version.number !== release.version.item.publishedVersion) throw new DataCenterError("PENDING_RELEASE_NOT_FOUND", 409);
    if (release.requestedById === actor.id) throw new DataCenterError("INDEPENDENT_RELEASE_APPROVAL_REQUIRED", 409);
    await assertAcademyReleaseSource(tx, release.versionId);
    await assertAcademyTarget(tx, release.targetKind, release.targetId);
    const result = await tx.dataCenterAcademyRelease.update({ where: { id: release.id }, data: { status: "APPROVED", approvedById: actor.id, approvedAt: new Date(), notes: input.notes } });
    await auditDataCenter(tx, actor, "academy.release-approved", result.id, { versionId: result.versionId, targetKind: result.targetKind, targetId: result.targetId });
    return result;
  });
}
/** Explicit opt-in consumer contract; never mutates Academy or Robot data. */
export async function retrieveAcademyDataCenterRelease(targetKind: string, targetId: string, actor: DataCenterActor) {
  requireDataCenterAdmin(actor);
  const releases = await db.dataCenterAcademyRelease.findMany({ where: { targetKind, targetId, status: "APPROVED" }, take: 100 });
  const results = [];
  for (const release of releases) {
    try {
      const version = await assertAcademyReleaseSource(db, release.versionId);
      results.push({ releaseId: release.id, versionId: version.id, itemId: version.itemId, version: version.number, title: version.title, content: version.content, provenance: version.provenance, checksum: version.checksum });
    } catch (error) { if (!(error instanceof DataCenterError)) throw error; }
  }
  return results;
}
