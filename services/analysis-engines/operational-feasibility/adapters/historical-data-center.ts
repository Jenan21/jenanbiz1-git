import type { Prisma } from "@/generated/prisma/client";
import { memberHasPermission } from "@/lib/auth/authorization";
import type { DbExecutor } from "@/lib/db";
import { DataCenterError, type DataCenterActor } from "@/services/data-center/contracts";
import { isDataCenterAdmin, sourceScopeWhere } from "@/services/data-center/policy";
import { computeDataCenterVersionChecksum } from "@/services/data-center/version-checksum";
import type { OperationalSourceReference } from "../data-port";
import { OperationalHistoryMismatch, OperationalHistoryUnavailable, type OperationalHistoryAccess, type OperationalHistoryRuntime } from "../run-history";

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
async function readHistorical(reference: OperationalSourceReference, actor: DataCenterActor, access: OperationalHistoryAccess, executor: DbExecutor) {
  let scope: Prisma.DataCenterSourceWhereInput;
  try { scope = await sourceScopeWhere(actor, executor); }
  catch (error) {
    if (error instanceof DataCenterError && (error.status === 403 || error.status === 404)) throw new OperationalHistoryUnavailable();
    throw error;
  }
  const version = await executor.dataCenterVersion.findFirst({
    where: { AND: [
      { id: reference.version.versionId }, await permissionWhere(actor, executor),
      { evidenceStatus: "VERIFIED", item: {
        status: "PUBLISHED",
        source: { AND: [scope, { allowRetrieval: true }, ...(access.organizationId ? [{ organizationId: access.organizationId }] : [])] },
        conflicts: { none: { resolvedAt: null } }, otherConflicts: { none: { resolvedAt: null } },
      } },
      access.specialty === undefined ? { specialties: { isEmpty: true } } : { specialties: { has: access.specialty } },
      access.missionContext === undefined ? { missionContexts: { isEmpty: true } } : { missionContexts: { has: access.missionContext } },
    ] },
    include: { item: { include: { source: true } }, upstream: { select: { upstreamVersionId: true } } },
  });
  if (!version) throw new OperationalHistoryUnavailable();
  const source = version.item.source; const rights = reference.rights;
  if (version.item.sourceId !== reference.source.sourceId || version.item.typeKey !== reference.dataset.typeKey
    || version.item.id !== reference.dataset.itemId || version.item.layer !== reference.dataset.layer
    || source.license !== rights.license || source.licenseClass !== rights.licenseClass || source.usagePolicy !== rights.usagePolicy
    || source.allowExport !== rights.allowExport || source.attributionRequired !== rights.attribution.required
    || (version.attribution ?? source.attribution) !== rights.attribution.text
    || source.ownership !== reference.ownership.ownership || source.owner !== reference.ownership.owner) throw new OperationalHistoryUnavailable();
  const checksum = computeDataCenterVersionChecksum({ ...version, upstreamVersionIds: version.upstream.map((entry) => entry.upstreamVersionId) });
  if (checksum !== version.checksum || checksum !== reference.version.checksum.value || version.number !== reference.version.number) {
    throw new OperationalHistoryMismatch("VERSION_CHECKSUM");
  }
  return version;
}

/** Exact superseded bytes may be replayed; source scope, rights, conflicts and robot grants are current. */
export async function authorizeOperationalHistory(runtime: OperationalHistoryRuntime, actor: DataCenterActor, executor: DbExecutor) {
  for (const entry of runtime.transcript) {
    const references = entry.operation === "DISCOVER" ? entry.response.candidates.map((candidate) => candidate.reference)
      : entry.response.status === "AVAILABLE" ? [entry.response.reference] : [];
    for (const reference of references) {
      const version = await readHistorical(reference, actor, runtime.replayAuthorizationContext, executor);
      if (entry.operation === "READ" && entry.response.status === "AVAILABLE"
        && (version.content !== entry.response.content || version.item.typeKey !== "operational-feasibility-model"
          || entry.response.contentKind !== "OTHER" || entry.query.versionId !== reference.version.versionId
          || entry.query.expectedChecksum !== version.checksum)) throw new OperationalHistoryMismatch("STORED_EVIDENCE");
    }
  }
}
