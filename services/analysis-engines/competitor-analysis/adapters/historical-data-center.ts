import type { Prisma } from "@/generated/prisma/client";
import { memberHasPermission } from "@/lib/auth/authorization";
import { db, type DbExecutor } from "@/lib/db";
import { DataCenterError, type DataCenterActor } from "@/services/data-center/contracts";
import { isDataCenterAdmin, sourceScopeWhere } from "@/services/data-center/policy";
import { computeDataCenterVersionChecksum } from "@/services/data-center/version-checksum";
import { canonicalize } from "../../shared/canonical";
import type { CompetitorSourceReference } from "../data-port";
import { competitorDatasetSchema } from "../datasets";
import { canonicalCompetitorPreparation, type CompetitorAnalyticsResult } from "../engine";
import { competitorHistoryContextSchema, competitorHistorySources, type CompetitorHistoryContext } from "../run-history";

export class CompetitorHistoryUnavailable extends Error {
  constructor() { super("This Competitor run or its historical inputs are unavailable"); this.name = "CompetitorHistoryUnavailable"; }
}
export class CompetitorHistoryMismatch extends Error {
  constructor(readonly reason: "VERSION_CHECKSUM" | "STORED_EVIDENCE" | "REQUEST_HASH" | "INPUT_HASH" | "OUTPUT_HASH" | "ENGINE_VERSION") {
    super(`Competitor historical integrity mismatch: ${reason}`); this.name = "CompetitorHistoryMismatch";
  }
}
async function permissionWhere(actor: DataCenterActor, executor: DbExecutor): Promise<Prisma.DataCenterVersionWhereInput> {
  if (isDataCenterAdmin(actor)) return {};
  const memberships = await executor.organizationMember.findMany({
    where: { userId: actor.id, status: "ACTIVE" },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  return { OR: [
    { requiredPermission: null },
    ...memberships.filter((member) => memberHasPermission(member, "data-center.read")).map((member) => ({
      item: { source: { scope: "ORGANIZATION" as const, organizationId: member.organizationId } },
      ...(member.isOwner ? {} : { requiredPermission: { in: member.role?.permissions.map((entry) => entry.permission.key) ?? [] } }),
    })),
  ] };
}
/** Historical expiry/supersession never selects a replacement; current access and rights still apply. */
async function readExactReference(reference: CompetitorSourceReference | string, actor: DataCenterActor, access: CompetitorHistoryContext, executor: DbExecutor) {
  const versionId = typeof reference === "string" ? reference : reference.version.versionId;
  let scope: Prisma.DataCenterSourceWhereInput;
  try { scope = await sourceScopeWhere(actor, executor); }
  catch (error) {
    if (error instanceof DataCenterError && (error.status === 403 || error.status === 404)) throw new CompetitorHistoryUnavailable();
    throw error;
  }
  const version = await executor.dataCenterVersion.findFirst({
    where: { AND: [
      { id: versionId }, await permissionWhere(actor, executor),
      { evidenceStatus: { not: "CONFLICTED" }, item: {
        status: { not: "ARCHIVED" }, source: { AND: [scope, { allowRetrieval: true }, ...(access.organizationId ? [{ organizationId: access.organizationId }] : [])] },
        conflicts: { none: { resolvedAt: null } }, otherConflicts: { none: { resolvedAt: null } },
      } },
      access.specialty === undefined ? { specialties: { isEmpty: true } } : { specialties: { has: access.specialty } },
      access.missionContext === undefined ? { missionContexts: { isEmpty: true } } : { missionContexts: { has: access.missionContext } },
    ] },
    include: { item: { include: { source: true } }, upstream: { select: { upstreamVersionId: true } } },
  });
  if (!version) throw new CompetitorHistoryUnavailable();
  if (typeof reference !== "string") {
    const source = version.item.source; const rights = reference.rights;
    if (version.item.sourceId !== reference.source.sourceId || version.item.typeKey !== reference.dataset.typeKey
      || version.item.id !== reference.dataset.itemId || version.item.layer !== reference.dataset.layer
      || source.license !== rights.license || source.licenseClass !== rights.licenseClass || source.usagePolicy !== rights.usagePolicy
      || source.allowExport !== rights.allowExport || source.attributionRequired !== rights.attribution.required
      || (version.attribution ?? source.attribution) !== rights.attribution.text
      || source.ownership !== reference.ownership.ownership || source.owner !== reference.ownership.owner) throw new CompetitorHistoryUnavailable();
  }
  const checksum = computeDataCenterVersionChecksum({ ...version, upstreamVersionIds: version.upstream.map((entry) => entry.upstreamVersionId) });
  if (checksum !== version.checksum || typeof reference !== "string" && (checksum !== reference.version.checksum.value || version.number !== reference.version.number)) throw new CompetitorHistoryMismatch("VERSION_CHECKSUM");
  if (version.content.length > 200_000 || Buffer.byteLength(version.content, "utf8") > 800_000) throw new CompetitorHistoryMismatch("STORED_EVIDENCE");
  return version.content;
}
/** Authorize even unused retained discovery candidates before returning any cached metadata. */
export async function authorizeCompetitorHistory(result: CompetitorAnalyticsResult, actor: DataCenterActor, rawAccess: CompetitorHistoryContext, executor: DbExecutor = db) {
  const access = competitorHistoryContextSchema.parse(rawAccess);
  const contents = new Map<string, { checksum: string; content: string }>();
  for (const { source } of competitorHistorySources(result)) {
    const references = [...source.reference ? [source.reference] : [], ...source.selection?.candidates.map((candidate) => candidate.reference) ?? []];
    for (const reference of references) {
      const previous = contents.get(reference.version.versionId);
      if (previous && previous.checksum !== reference.version.checksum.value) throw new CompetitorHistoryMismatch("STORED_EVIDENCE");
      // Recheck every captured reference's rights, including duplicates with inconsistent claims.
      const content = await readExactReference(reference, actor, access, executor);
      contents.set(reference.version.versionId, { checksum: reference.version.checksum.value, content });
    }
    for (const excluded of source.selection?.notInForce ?? []) await readExactReference(excluded.versionId, actor, access, executor);
  }
  for (const prepared of [result.preparation.current, ...result.preparation.baseline ? [result.preparation.baseline] : []]) {
    const restored = structuredClone(prepared);
    for (const source of restored.sources) if (source.dataset && source.reference) {
      const raw = contents.get(source.reference.version.versionId)?.content;
      if (raw === undefined) throw new CompetitorHistoryMismatch("STORED_EVIDENCE");
      let decoded: unknown;
      try { decoded = JSON.parse(raw); }
      catch (error) { if (error instanceof SyntaxError) throw new CompetitorHistoryMismatch("STORED_EVIDENCE"); throw error; }
      const parsed = competitorDatasetSchema.safeParse(decoded);
      if (!parsed.success) throw new CompetitorHistoryMismatch("STORED_EVIDENCE");
      source.dataset = parsed.data;
    }
    if (canonicalize(canonicalCompetitorPreparation(restored)) !== canonicalize(prepared)) throw new CompetitorHistoryMismatch("STORED_EVIDENCE");
  }
}
