import type { Prisma } from "@/generated/prisma/client";
import { memberHasPermission } from "@/lib/auth/authorization";
import { db, type DbExecutor } from "@/lib/db";
import { DataCenterError, type DataCenterActor } from "@/services/data-center/contracts";
import { isDataCenterAdmin, sourceScopeWhere } from "@/services/data-center/policy";
import { computeDataCenterVersionChecksum } from "@/services/data-center/version-checksum";
import { canonicalize } from "../../shared/canonical";
import { EngineError } from "../../shared/errors";
import { marketDatasetSchema } from "../datasets";
import type { MarketM3Result } from "../result";
import { marketHistoryContextSchema, type MarketHistoryContext } from "../run-history";

export class MarketHistoryUnavailable extends Error {
  constructor() { super("This Market run or its historical inputs are unavailable"); this.name = "MarketHistoryUnavailable"; }
}
export class MarketHistoryMismatch extends Error {
  constructor(readonly reason: "VERSION_CHECKSUM" | "STORED_EVIDENCE" | "REQUEST_HASH" | "INPUT_HASH" | "OUTPUT_HASH" | "ENGINE_VERSION") {
    super(`Market historical integrity mismatch: ${reason}`); this.name = "MarketHistoryMismatch";
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
/** Exact immutable version read with current access/retrieval policy. Historical expiry/publication never selects a replacement. */
export async function readMarketHistoricalVersion(
  saved: MarketM3Result["sourceEvidence"][number], actor: DataCenterActor, rawAccess: MarketHistoryContext, executor: DbExecutor = db,
): Promise<string> {
  const access = marketHistoryContextSchema.parse(rawAccess);
  if (!saved.input || !saved.reference || !saved.dataset) throw new EngineError("CONTRACT_VIOLATION", { first: "Historical read requires a captured exact governed version" });
  let scope: Prisma.DataCenterSourceWhereInput;
  try { scope = await sourceScopeWhere(actor, executor); }
  catch (error) {
    if (error instanceof DataCenterError && (error.status === 403 || error.status === 404)) throw new MarketHistoryUnavailable();
    throw error;
  }
  const version = await executor.dataCenterVersion.findFirst({
    where: { AND: [
      { id: saved.input.ref.id }, await permissionWhere(actor, executor),
      { evidenceStatus: { not: "CONFLICTED" }, item: {
        status: { not: "ARCHIVED" }, source: { AND: [scope, { allowRetrieval: true }, ...(access.organizationId ? [{ organizationId: access.organizationId }] : [])] },
        conflicts: { none: { resolvedAt: null } }, otherConflicts: { none: { resolvedAt: null } },
      } },
      access.specialty === undefined ? { specialties: { isEmpty: true } } : { specialties: { has: access.specialty } },
      access.missionContext === undefined ? { missionContexts: { isEmpty: true } } : { missionContexts: { has: access.missionContext } },
    ] },
    include: { item: { include: { source: true } }, upstream: { select: { upstreamVersionId: true } } },
  });
  if (!version || version.item.sourceId !== saved.reference.source.sourceId || version.item.typeKey !== saved.reference.dataset.typeKey) throw new MarketHistoryUnavailable();
  const source = version.item.source;
  const rights = saved.reference.rights;
  if (source.license !== rights.license || source.licenseClass !== rights.licenseClass || source.usagePolicy !== rights.usagePolicy
    || source.allowExport !== rights.allowExport || source.attributionRequired !== rights.attribution.required
    || (version.attribution ?? source.attribution) !== rights.attribution.text
    || source.ownership !== saved.reference.ownership.ownership || source.owner !== saved.reference.ownership.owner) throw new MarketHistoryUnavailable();
  const checksum = computeDataCenterVersionChecksum({ ...version, upstreamVersionIds: version.upstream.map((entry) => entry.upstreamVersionId) });
  if (checksum !== version.checksum || checksum !== saved.input.checksum?.value || checksum !== saved.reference.version.checksum.value
    || version.number !== saved.input.ref.version || version.id !== saved.reference.version.versionId) throw new MarketHistoryMismatch("VERSION_CHECKSUM");
  if (Buffer.byteLength(version.content, "utf8") > 800_000 || version.content.length > 200_000) throw new MarketHistoryMismatch("STORED_EVIDENCE");
  let content: unknown;
  try { content = JSON.parse(version.content); }
  catch (error) { if (error instanceof SyntaxError) throw new MarketHistoryMismatch("STORED_EVIDENCE"); throw error; }
  const parsed = marketDatasetSchema.safeParse(content);
  if (!parsed.success || canonicalize(parsed.data) !== canonicalize(saved.dataset)) throw new MarketHistoryMismatch("STORED_EVIDENCE");
  return version.content;
}
