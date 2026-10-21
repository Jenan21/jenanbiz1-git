import { Prisma } from "@/generated/prisma/client";
import { memberHasPermission } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { DataCenterError, type DataCenterActor, type DataCenterGeoFeature } from "@/services/data-center/contracts";
import { validateDataCenterGeoJson } from "@/services/data-center/imports";
import { isDataCenterAdmin, sourceScopeWhere } from "@/services/data-center/policy";
import { computeDataCenterVersionChecksum } from "@/services/data-center/version-checksum";

export class HistoricalVersionUnavailable extends Error {
  constructor() {
    super("Historical Data Center version is unavailable");
    this.name = "HistoricalVersionUnavailable";
  }
}

export class HistoricalVersionIntegrityError extends Error {
  constructor(readonly versionId: string) {
    super("Historical Data Center version failed its expected SHA-256 check");
    this.name = "HistoricalVersionIntegrityError";
  }
}

export interface HistoricalDataCenterContext {
  specialty?: string;
  missionContext?: string;
}

async function permissionWhere(actor: DataCenterActor): Promise<Prisma.DataCenterVersionWhereInput> {
  if (isDataCenterAdmin(actor)) return {};
  const memberships = await db.organizationMember.findMany({
    where: { userId: actor.id, status: "ACTIVE" },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  return { OR: [
    { requiredPermission: null },
    ...memberships.filter((membership) => memberHasPermission(membership, "data-center.read")).map((membership) => ({
      item: { source: { scope: "ORGANIZATION" as const, organizationId: membership.organizationId } },
      ...(membership.isOwner ? {} : { requiredPermission: { in: membership.role?.permissions.map((entry) => entry.permission.key) ?? [] } }),
    })),
  ] };
}

/** Internal read-only replay path. It accepts one opaque version ID and never performs discovery or publication fallback. */
export async function readHistoricalDataCenterVersion(input: {
  versionId: string;
  expectedChecksum: string;
  actor: DataCenterActor;
  context: HistoricalDataCenterContext;
  expectedSourceId: string;
  expectedTypeKey: string;
}): Promise<{ checksum: string; features: DataCenterGeoFeature[] }> {
  let sourceScope;
  try {
    sourceScope = await sourceScopeWhere(input.actor);
  } catch (error) {
    if (error instanceof DataCenterError && (error.status === 403 || error.status === 404)) throw new HistoricalVersionUnavailable();
    throw error;
  }
  const version = await db.dataCenterVersion.findFirst({
    where: { AND: [
      { id: input.versionId },
      await permissionWhere(input.actor),
      {
        evidenceStatus: { not: "CONFLICTED" },
        item: {
          status: { not: "ARCHIVED" },
          source: { AND: [sourceScope, { allowRetrieval: true }] },
          conflicts: { none: { resolvedAt: null } },
          otherConflicts: { none: { resolvedAt: null } },
        },
      },
      input.context.specialty === undefined ? { specialties: { isEmpty: true } } : { specialties: { has: input.context.specialty } },
      input.context.missionContext === undefined ? { missionContexts: { isEmpty: true } } : { missionContexts: { has: input.context.missionContext } },
    ] },
    include: { item: { include: { source: true } }, upstream: { select: { upstreamVersionId: true } } },
  });
  if (!version || version.item.sourceId !== input.expectedSourceId || version.item.typeKey !== input.expectedTypeKey || version.item.source.allowRetrieval !== true) {
    throw new HistoricalVersionUnavailable();
  }

  const checksum = computeDataCenterVersionChecksum({
    ...version,
    upstreamVersionIds: version.upstream.map((edge) => edge.upstreamVersionId),
  });
  if (checksum !== version.checksum || version.checksum !== input.expectedChecksum || version.item.typeKey !== "geojson") {
    throw new HistoricalVersionIntegrityError(input.versionId);
  }

  let features: DataCenterGeoFeature[];
  try {
    features = validateDataCenterGeoJson(JSON.parse(version.content));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof DataCenterError) throw new HistoricalVersionIntegrityError(input.versionId);
    throw error;
  }
  return { checksum, features };
}
