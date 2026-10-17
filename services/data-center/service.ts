import { createHash } from "node:crypto";
import { Prisma, type DataCenterLifecycle } from "@/generated/prisma/client";
import { db, type DbExecutor } from "@/lib/db";
import { commandSchema, DataCenterError, itemSchema, sourceSchema, versionSchema, type CreateItemInput, type CreateSourceInput, type DataCenterActor, type DataCenterCommand } from "./contracts";
import { assertEvidence, assertSourceAccess, deterministicConfidence, requireDataCenterAdmin, requireDataCenterPrincipal, sourceScopeWhere } from "./policy";

export async function auditDataCenter(tx: DbExecutor, actor: DataCenterActor, action: string, entityId: string, metadata: Prisma.InputJsonValue = {}) {
  await tx.auditLog.create({ data: { actorId: actor.id, action: `data-center.${action}`, entityType: "DataCenter", entityId, metadata } });
}
export async function lockDataCenterItem(tx: DbExecutor, itemId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`data-center:${itemId}`}))`;
}
export async function getAccessibleItem(tx: DbExecutor, actor: DataCenterActor, itemId: string, write = false) {
  const item = await tx.dataCenterItem.findUnique({ where: { id: itemId }, include: { source: true, type: true } });
  if (!item) throw new DataCenterError("ITEM_NOT_FOUND", 404);
  await assertSourceAccess(item.source, actor, write, tx);
  return item;
}
export async function createDataCenterSource(input: CreateSourceInput, actor: DataCenterActor) {
  requireDataCenterPrincipal(actor);
  const data = sourceSchema.parse(input);
  if (data.scope === "PLATFORM") requireDataCenterAdmin(actor);
  if (data.scope === "ORGANIZATION") {
    const organization = await db.organization.findUnique({ where: { id: data.organizationId } });
    if (!organization) throw new DataCenterError("ORGANIZATION_NOT_FOUND", 404);
    await assertSourceAccess({ ...data, ownerId: actor.id } as Parameters<typeof assertSourceAccess>[0], actor, true);
  }
  return db.$transaction(async (tx) => {
    const source = await tx.dataCenterSource.create({ data: { ...data, ownerId: actor.id } });
    await auditDataCenter(tx, actor, "source.created", source.id, { scope: source.scope });
    return source;
  });
}
export async function createDataCenterItemInTransaction(tx: DbExecutor, input: CreateItemInput, actor: DataCenterActor) {
  const data = itemSchema.parse(input);
  const source = await assertSourceAccess(await tx.dataCenterSource.findUnique({ where: { id: data.sourceId } }), actor, true, tx);
  const type = await tx.dataCenterType.findUnique({ where: { key: data.typeKey } });
  if (!type || type.layer !== data.layer) throw new DataCenterError("TYPE_LAYER_MISMATCH");
  // Generated proposals remain proposals, even when submitted by a trusted administrator.
  if (actor.kind === "AI" || source.kind === "GENERATED") data.origin = "AI";
  if (data.origin === "AI" && data.layer === "KNOWLEDGE") throw new DataCenterError("GENERATED_MATERIAL_IS_NOT_SOURCE_KNOWLEDGE");
  assertEvidence(data, actor);
  const item = await tx.dataCenterItem.create({ data: { sourceId: source.id, typeKey: type.key, layer: type.layer, title: data.title, createdById: actor.id } });
  const version = await tx.dataCenterVersion.create({ data: versionData(data, item.id, 1, actor, source.freshnessDays, source.kind) });
  if (data.provenance.length) await tx.dataCenterEvidenceLink.createMany({ data: data.provenance.map((p) => ({ versionId: version.id, kind: p.kind, reference: p.reference, label: p.label, linkedById: actor.id })), skipDuplicates: true });
  await tx.dataCenterEvent.create({ data: { itemId: item.id, version: 1, toStatus: "DRAFT", actorId: actor.id, reason: "Initial proposal; review required" } });
  await auditDataCenter(tx, actor, "item.created", item.id, { versionId: version.id, evidenceStatus: version.evidenceStatus });
  return { ...item, version };
}
export async function createDataCenterItem(input: CreateItemInput, actor: DataCenterActor) {
  return db.$transaction((tx) => createDataCenterItemInTransaction(tx, input, actor));
}
function versionData(data: ReturnType<typeof itemSchema.parse> | ReturnType<typeof versionSchema.parse>, itemId: string, number: number, actor: DataCenterActor, freshnessDays: number, sourceKind: string) {
  const sourcePublishedAt = data.sourcePublishedAt ? new Date(data.sourcePublishedAt) : undefined;
  if (sourcePublishedAt && sourcePublishedAt > new Date()) throw new DataCenterError("FUTURE_SOURCE_DATE");
  const expiresAt = data.expiresAt ? new Date(data.expiresAt) : undefined;
  const effectiveFrom = data.effectiveFrom ? new Date(data.effectiveFrom) : undefined;
  const effectiveTo = data.effectiveTo ? new Date(data.effectiveTo) : undefined;
  if (effectiveFrom && effectiveTo && effectiveFrom >= effectiveTo) throw new DataCenterError("INVALID_EFFECTIVE_DATE_RANGE");
  const normalized = { title: data.title, content: data.content, evidenceStatus: data.evidenceStatus, origin: data.origin, provenance: data.provenance,
    specialties: data.specialties, missionContexts: data.missionContexts, requiredPermission: data.requiredPermission ?? null,
    sourcePublishedAt: sourcePublishedAt?.toISOString() ?? null, expiresAt: expiresAt?.toISOString() ?? null,
    effectiveFrom: effectiveFrom?.toISOString() ?? null, effectiveTo: effectiveTo?.toISOString() ?? null };
  return { ...normalized, itemId, number, sourcePublishedAt, expiresAt, effectiveFrom, effectiveTo,
    checksum: createHash("sha256").update(JSON.stringify(normalized)).digest("hex"), createdById: actor.id,
    confidence: deterministicConfidence({ evidenceStatus: data.evidenceStatus, provenanceCount: data.provenance.length, sourcePublishedAt, freshnessDays, sourceKind, origin: data.origin, expiresAt,
      completeness: 4 + (data.provenance.length ? 2 : 0) + (sourcePublishedAt ? 2 : 0) + (effectiveFrom || effectiveTo ? 2 : 0), consistency: 0 }) };
}
export async function createDataCenterVersion(input: zVersionInput, actor: DataCenterActor) {
  const data = versionSchema.parse(input);
  return db.$transaction(async (tx) => {
    await lockDataCenterItem(tx, data.itemId);
    const item = await getAccessibleItem(tx, actor, data.itemId, true);
    if (actor.kind === "AI" || item.source.kind === "GENERATED") data.origin = "AI";
    if (data.origin === "AI" && item.layer === "KNOWLEDGE") throw new DataCenterError("GENERATED_MATERIAL_IS_NOT_SOURCE_KNOWLEDGE");
    assertEvidence(data, actor);
    const version = await tx.dataCenterVersion.create({ data: versionData(data, item.id, item.currentVersion + 1, actor, item.source.freshnessDays, item.source.kind) });
    if (data.provenance.length) await tx.dataCenterEvidenceLink.createMany({ data: data.provenance.map((p) => ({ versionId: version.id, kind: p.kind, reference: p.reference, label: p.label, linkedById: actor.id })), skipDuplicates: true });
    const updatedItem = await tx.dataCenterItem.update({ where: { id: item.id }, data: { currentVersion: version.number, title: data.title, status: "DRAFT", revision: { increment: 1 } } });
    await tx.dataCenterEvent.create({ data: { itemId: item.id, version: version.number, fromStatus: item.status, toStatus: "DRAFT", actorId: actor.id, reason: data.reason } });
    await auditDataCenter(tx, actor, "version.created", item.id, { versionId: version.id, reason: data.reason });
    return { ...version, item: updatedItem };
  });
}
type zVersionInput = Parameters<typeof versionSchema.parse>[0];
const transitions: Record<DataCenterLifecycle, DataCenterLifecycle[]> = {
  DRAFT: ["IN_REVIEW", "ARCHIVED"], IN_REVIEW: ["APPROVED", "REJECTED", "DRAFT"],
  APPROVED: ["PUBLISHED", "ARCHIVED", "DRAFT"], PUBLISHED: ["ARCHIVED"], REJECTED: ["DRAFT", "ARCHIVED"], ARCHIVED: ["DRAFT"],
};
export async function transitionDataCenterItem(input: { itemId: string; status: DataCenterLifecycle; reason: string }, actor: DataCenterActor) {
  return db.$transaction(async (tx) => {
    await lockDataCenterItem(tx, input.itemId);
    const item = await getAccessibleItem(tx, actor, input.itemId, true);
    if (!transitions[item.status].includes(input.status)) throw new DataCenterError("INVALID_LIFECYCLE_TRANSITION", 409);
    if (["APPROVED", "PUBLISHED", "REJECTED"].includes(input.status)) requireDataCenterAdmin(actor);
    const version = await tx.dataCenterVersion.findUniqueOrThrow({ where: { itemId_number: { itemId: item.id, number: item.currentVersion } }, include: { reviews: true } });
    if (["APPROVED", "PUBLISHED"].includes(input.status)) {
      const approvals = version.reviews.filter((r) => r.decision === "APPROVED");
      if (!approvals.length || version.reviews.some((r) => r.decision === "REJECTED")) throw new DataCenterError("APPROVING_REVIEW_REQUIRED", 409);
      if (item.type.requiresIndependentReview && !approvals.some((r) => r.reviewerId !== version.createdById)) throw new DataCenterError("INDEPENDENT_REVIEW_REQUIRED", 409);
      const conflicts = await tx.dataCenterConflict.count({ where: { resolvedAt: null, OR: [{ itemId: item.id }, { otherItemId: item.id }] } });
      if (conflicts || version.evidenceStatus === "CONFLICTED") throw new DataCenterError("UNRESOLVED_CONFLICT", 409);
      if (version.expiresAt && version.expiresAt <= new Date()) throw new DataCenterError("EXPIRED_VERSION", 409);
      if (version.effectiveTo && version.effectiveTo <= new Date()) throw new DataCenterError("EXPIRED_EFFECTIVE_PERIOD", 409);
    }
    const result = await tx.dataCenterItem.update({ where: { id: item.id }, data: { status: input.status, revision: { increment: 1 },
      ...(input.status === "PUBLISHED" ? { publishedVersion: item.currentVersion } : input.status === "ARCHIVED" ? { publishedVersion: null } : {}) } });
    await tx.dataCenterEvent.create({ data: { itemId: item.id, version: version.number, fromStatus: item.status, toStatus: input.status, actorId: actor.id, reason: input.reason } });
    await auditDataCenter(tx, actor, "item.transitioned", item.id, { from: item.status, to: input.status, versionId: version.id, reason: input.reason });
    return result;
  });
}
export async function reviewDataCenterItem(input: { itemId: string; decision: "APPROVED" | "REJECTED"; notes: string }, actor: DataCenterActor) {
  requireDataCenterAdmin(actor);
  return db.$transaction(async (tx) => {
    await lockDataCenterItem(tx, input.itemId);
    const item = await getAccessibleItem(tx, actor, input.itemId);
    if (item.status !== "IN_REVIEW") throw new DataCenterError("ITEM_NOT_IN_REVIEW", 409);
    const version = await tx.dataCenterVersion.findUniqueOrThrow({ where: { itemId_number: { itemId: item.id, number: item.currentVersion } } });
    if (item.type.requiresIndependentReview && version.createdById === actor.id) throw new DataCenterError("INDEPENDENT_REVIEW_REQUIRED", 409);
    const review = await tx.dataCenterReview.create({ data: { versionId: version.id, reviewerId: actor.id, decision: input.decision, notes: input.notes } });
    await auditDataCenter(tx, actor, "version.reviewed", item.id, { versionId: version.id, reviewId: review.id, decision: input.decision });
    return review;
  });
}
export async function createDataCenterConflict(input: { itemId: string; otherItemId: string; reason: string }, actor: DataCenterActor) {
  requireDataCenterAdmin(actor);
  if (input.itemId === input.otherItemId) throw new DataCenterError("DISTINCT_ITEMS_REQUIRED");
  return db.$transaction(async (tx) => {
    for (const id of [input.itemId, input.otherItemId].sort()) await lockDataCenterItem(tx, id);
    const first = await getAccessibleItem(tx, actor, input.itemId);
    const second = await getAccessibleItem(tx, actor, input.otherItemId);
    const conflict = await tx.dataCenterConflict.create({ data: { ...input, itemVersion: first.currentVersion, otherVersion: second.currentVersion } });
    await tx.dataCenterItem.updateMany({ where: { id: { in: [first.id, second.id] } }, data: { revision: { increment: 1 } } });
    await auditDataCenter(tx, actor, "conflict.created", conflict.id, input);
    return conflict;
  });
}
export async function resolveDataCenterConflict(input: { conflictId: string; resolution: string; notes: string }, actor: DataCenterActor) {
  requireDataCenterAdmin(actor);
  return db.$transaction(async (tx) => {
    await lockDataCenterItem(tx, `conflict:${input.conflictId}`);
    const conflict = await tx.dataCenterConflict.findUnique({ where: { id: input.conflictId } });
    if (!conflict || conflict.resolvedAt) throw new DataCenterError("OPEN_CONFLICT_NOT_FOUND", 404);
    for (const id of [conflict.itemId, conflict.otherItemId].sort()) await lockDataCenterItem(tx, id);
    const archiveIds = input.resolution === "KEEP_FIRST" ? [conflict.otherItemId]
      : input.resolution === "KEEP_SECOND" ? [conflict.itemId]
      : input.resolution === "SUPERSEDED" ? [conflict.itemId, conflict.otherItemId] : [];
    for (const itemId of archiveIds) {
      const item = await getAccessibleItem(tx, actor, itemId, true);
      const conflictedVersion = itemId === conflict.itemId ? conflict.itemVersion : conflict.otherVersion;
      if (item.currentVersion !== conflictedVersion) throw new DataCenterError("CONFLICT_VERSION_CHANGED_REVIEW_RESOLUTION", 409);
      if (item.status !== "ARCHIVED") {
        await tx.dataCenterItem.update({ where: { id: itemId }, data: { status: "ARCHIVED", publishedVersion: null } });
        await tx.dataCenterEvent.create({ data: { itemId, version: item.currentVersion, fromStatus: item.status, toStatus: "ARCHIVED", actorId: actor.id, reason: `Conflict ${conflict.id}: ${input.resolution}. ${input.notes}` } });
      }
    }
    const result = await tx.dataCenterConflict.update({ where: { id: conflict.id }, data: { resolution: input.resolution, notes: input.notes, resolvedById: actor.id, resolvedAt: new Date() } });
    await tx.dataCenterItem.updateMany({ where: { id: { in: [conflict.itemId, conflict.otherItemId] } }, data: { revision: { increment: 1 } } });
    await auditDataCenter(tx, actor, "conflict.resolved", result.id, { resolution: input.resolution, notes: input.notes });
    return result;
  });
}
export async function registerDataCenterType(input: { key: string; label: string; layer: "DATA" | "KNOWLEDGE" | "INTELLIGENCE" | "CONTEXT"; requiresIndependentReview: boolean; categoryKey?: string; departmentKey?: string }, actor: DataCenterActor) {
  requireDataCenterAdmin(actor);
  return db.$transaction(async (tx) => {
    if (input.categoryKey && !await tx.dataCenterCategory.findUnique({ where: { key: input.categoryKey } })) throw new DataCenterError("CATEGORY_NOT_FOUND", 404);
    if (input.departmentKey && !await tx.dataCenterDepartment.findUnique({ where: { key: input.departmentKey } })) throw new DataCenterError("DEPARTMENT_NOT_FOUND", 404);
    const result = await tx.dataCenterType.create({ data: input });
    await auditDataCenter(tx, actor, "type.registered", result.key);
    return result;
  });
}
export async function linkDataCenterEvidence(input: { versionId: string; evidenceId?: string; kind: string; reference: string; label: string; notes?: string }, actor: DataCenterActor) {
  requireDataCenterAdmin(actor);
  return db.$transaction(async (tx) => {
    const version = await tx.dataCenterVersion.findUnique({ where: { id: input.versionId } });
    if (!version) throw new DataCenterError("VERSION_NOT_FOUND", 404);
    await lockDataCenterItem(tx, version.itemId);
    await getAccessibleItem(tx, actor, version.itemId, true);
    if ((input.kind === "EXISTING_EVIDENCE") !== !!input.evidenceId) throw new DataCenterError("EVIDENCE_REFERENCE_MISMATCH");
    if (input.evidenceId && !await tx.evidence.findUnique({ where: { id: input.evidenceId }, select: { id: true } })) throw new DataCenterError("EVIDENCE_NOT_FOUND", 404);
    const link = await tx.dataCenterEvidenceLink.create({ data: { ...input, linkedById: actor.id } });
    await tx.dataCenterItem.update({ where: { id: version.itemId }, data: { revision: { increment: 1 } } });
    await auditDataCenter(tx, actor, "evidence.linked", link.id, { versionId: version.id, evidenceId: input.evidenceId ?? null, kind: input.kind });
    return link;
  });
}
export async function getDataCenterItem(itemId: string, actor: DataCenterActor) {
  requireDataCenterAdmin(actor);
  const item = await getAccessibleItem(db, actor, itemId);
  const versions = await db.dataCenterVersion.findMany({ where: { itemId }, orderBy: { number: "desc" }, take: 100, include: { reviews: true, evidenceLinks: true } });
  return { ...item, versions, events: await db.dataCenterEvent.findMany({ where: { itemId }, take: 100, orderBy: { createdAt: "desc" } }) };
}
export async function getDataCenterOverview(actor: DataCenterActor) {
  requireDataCenterAdmin(actor);
  const [sources, items, published, reviews, conflicts, imports, usage, types, layers, lifecycle, academyReleases] = await Promise.all([
    db.dataCenterSource.count(), db.dataCenterItem.count(), db.dataCenterItem.count({ where: { publishedVersion: { not: null }, status: { not: "ARCHIVED" } } }),
    db.dataCenterItem.count({ where: { status: "IN_REVIEW" } }), db.dataCenterConflict.count({ where: { resolvedAt: null } }),
    db.dataCenterImport.count(), db.dataCenterUsage.count(), db.dataCenterType.count(),
    db.dataCenterItem.groupBy({ by: ["layer"], _count: true }), db.dataCenterItem.groupBy({ by: ["status"], _count: true }),
    db.dataCenterAcademyRelease.count({ where: { status: "PENDING" } }),
  ]);
  return { sources, items, published, reviews, conflicts, imports, usage, types, layers, lifecycle, academyReleases,
    freshness: "Per-version timestamps and deterministic confidence; undated sources remain unknown",
    backup: { status: "MANAGED_EXTERNALLY", detail: "Database and document storage use the existing platform backup architecture; no restore is executed here." } };
}
export async function listDataCenterArea(area: string, actor: DataCenterActor, options: { page?: number; limit?: number; query?: string; status?: string; layer?: string; sourceId?: string } = {}) {
  requireDataCenterAdmin(actor);
  const page = Math.max(1, Math.min(10_000, Math.floor(options.page || 1)));
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit || 20)));
  const pagination = { skip: (page - 1) * limit, take: limit };
  let rows: unknown[], total: number;
  const where: Prisma.DataCenterItemWhereInput = {
    ...(options.query ? { title: { contains: options.query.slice(0, 200), mode: "insensitive" } } : {}),
    ...(options.status && ["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED", "REJECTED", "ARCHIVED"].includes(options.status) ? { status: options.status as DataCenterLifecycle } : {}),
    ...(options.sourceId ? { sourceId: options.sourceId } : {}),
    ...(options.layer && ["DATA", "KNOWLEDGE", "INTELLIGENCE", "CONTEXT"].includes(options.layer) ? { layer: options.layer as "DATA" | "KNOWLEDGE" | "INTELLIGENCE" | "CONTEXT" } : {}),
  };
  switch (area) {
    case "items": case "reviews":
      if (area === "reviews") where.status = "IN_REVIEW";
      [rows, total] = await Promise.all([db.dataCenterItem.findMany({ where, ...pagination, orderBy: { updatedAt: "desc" }, include: { source: true, type: true, versions: { orderBy: { number: "desc" }, take: 1, include: { reviews: true } } } }), db.dataCenterItem.count({ where })]); break;
    case "sources":
      [rows, total] = await Promise.all([db.dataCenterSource.findMany({ ...pagination, orderBy: { createdAt: "desc" } }), db.dataCenterSource.count()]); break;
    case "types":
      [rows, total] = await Promise.all([db.dataCenterType.findMany({ ...pagination, orderBy: { key: "asc" } }), db.dataCenterType.count()]); break;
    case "evidence":
      [rows, total] = await Promise.all([db.dataCenterEvidenceLink.findMany({ ...pagination, orderBy: { createdAt: "desc" } }), db.dataCenterEvidenceLink.count()]); break;
    case "categories":
      [rows, total] = await Promise.all([db.dataCenterCategory.findMany({ ...pagination, orderBy: { key: "asc" } }), db.dataCenterCategory.count()]); break;
    case "departments":
      [rows, total] = await Promise.all([db.dataCenterDepartment.findMany({ ...pagination, orderBy: { key: "asc" } }), db.dataCenterDepartment.count()]); break;
    case "conflicts":
      [rows, total] = await Promise.all([db.dataCenterConflict.findMany({ ...pagination, orderBy: { createdAt: "desc" }, include: { item: { select: { title: true } }, otherItem: { select: { title: true } } } }), db.dataCenterConflict.count()]); break;
    case "imports":
      [rows, total] = await Promise.all([db.dataCenterImport.findMany({ ...pagination, orderBy: { createdAt: "desc" }, omit: { storageKey: true } }), db.dataCenterImport.count()]); break;
    case "usage":
      [rows, total] = await Promise.all([db.dataCenterUsage.findMany({ ...pagination, orderBy: { createdAt: "desc" } }), db.dataCenterUsage.count()]); break;
    case "academy":
      [rows, total] = await Promise.all([db.dataCenterAcademyRelease.findMany({ ...pagination, orderBy: { createdAt: "desc" } }), db.dataCenterAcademyRelease.count()]); break;
    default: throw new DataCenterError("UNKNOWN_AREA");
  }
  return { area, rows, total, page, limit };
}
export async function dispatchDataCenterCommand(command: DataCenterCommand, actor: DataCenterActor) {
  const { action, ...input } = commandSchema.parse(command);
  switch (action) {
    case "create-source": return createDataCenterSource(input as Extract<DataCenterCommand, { action: "create-source" }>, actor);
    case "create-item": return createDataCenterItem(input as Extract<DataCenterCommand, { action: "create-item" }>, actor);
    case "create-version": return createDataCenterVersion(input, actor);
    case "register-type": return registerDataCenterType(input as Extract<DataCenterCommand, { action: "register-type" }>, actor);
    case "link-evidence": return linkDataCenterEvidence(input as Extract<DataCenterCommand, { action: "link-evidence" }>, actor);
    case "register-category": case "register-department":
      requireDataCenterAdmin(actor);
      return db.$transaction(async (tx) => {
        const data = input as { key: string; label: string };
        const result = action === "register-category" ? await tx.dataCenterCategory.create({ data }) : await tx.dataCenterDepartment.create({ data });
        await auditDataCenter(tx, actor, action, result.key);
        return result;
      });
    case "transition-item": return transitionDataCenterItem(input as Extract<DataCenterCommand, { action: "transition-item" }>, actor);
    case "review-item": return reviewDataCenterItem(input as Extract<DataCenterCommand, { action: "review-item" }>, actor);
    case "create-conflict": return createDataCenterConflict(input as Extract<DataCenterCommand, { action: "create-conflict" }>, actor);
    case "resolve-conflict": return resolveDataCenterConflict(input as Extract<DataCenterCommand, { action: "resolve-conflict" }>, actor);
    case "record-usage": return (await import("./retrieval")).recordDataCenterUsage(input as Extract<DataCenterCommand, { action: "record-usage" }>, actor);
    case "import-academy-source": return (await import("./retrieval")).importAcademyDataCenterSource(input as Extract<DataCenterCommand, { action: "import-academy-source" }>, actor);
    case "request-academy-release": return (await import("./retrieval")).requestAcademyDataCenterRelease(input as Extract<DataCenterCommand, { action: "request-academy-release" }>, actor);
    case "approve-academy-release": return (await import("./retrieval")).approveAcademyDataCenterRelease(input as Extract<DataCenterCommand, { action: "approve-academy-release" }>, actor);
  }
}
export { sourceScopeWhere };
