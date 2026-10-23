import { z } from "zod";
import { db, type DbExecutor } from "@/lib/db";
import { coverageFromColumns, DataCenterError, type DataCenterActor } from "./contracts";
import { accessibleVersionWhere } from "./retrieval";
import { computeDataCenterVersionChecksum } from "./version-checksum";

export const historicalVersionRequestSchema = z.object({
  sourceId: z.string().min(1).max(128), versionId: z.string().min(1).max(128),
  expectedChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  specialty: z.string().trim().min(1).max(80).optional(),
  missionContext: z.string().trim().min(1).max(80).optional(),
  organizationId: z.string().min(1).max(128).optional(),
}).strict();
const unavailable = () => new DataCenterError("HISTORICAL_VERSION_NOT_AVAILABLE", 404);

/**
 * Exact previously published bytes, with current access/rights and no publication fallback.
 * Historical validity dates are retained, not treated as current authorization.
 * This path writes nothing and never constructs a misleading current-publication Map reference.
 */
export async function readHistoricalDataCenterVersionContent(
  request: z.input<typeof historicalVersionRequestSchema>, actor: DataCenterActor, executor: DbExecutor = db,
) {
  const validation = historicalVersionRequestSchema.safeParse(request);
  if (!validation.success) throw new DataCenterError("INVALID_HISTORICAL_VERSION_REQUEST", 400);
  const parsed = validation.data;
  let authorized;
  try { authorized = await accessibleVersionWhere(actor, parsed, executor); }
  catch (error) {
    if (error instanceof DataCenterError && (error.status === 403 || error.status === 404)) throw unavailable();
    throw error;
  }
  const version = await executor.dataCenterVersion.findFirst({
    where: { AND: [authorized, { id: parsed.versionId, item: { sourceId: parsed.sourceId } }] },
    include: { item: { include: { source: true } }, upstream: { select: { upstreamVersionId: true } } },
  });
  if (!version) throw unavailable();
  // A lower version number alone does not prove that a draft was ever published.
  const publication = await executor.dataCenterEvent.findFirst({
    where: { itemId: version.itemId, version: version.number, toStatus: "PUBLISHED" },
    select: { id: true, createdAt: true },
  });
  if (!publication) throw unavailable();
  const upstreamVersionIds = version.upstream.map((edge) => edge.upstreamVersionId);
  const checksum = computeDataCenterVersionChecksum({ ...version, upstreamVersionIds });
  if (checksum !== version.checksum || checksum !== parsed.expectedChecksum) throw new DataCenterError("HISTORICAL_VERSION_INTEGRITY_MISMATCH", 409);
  const source = version.item.source;
  return {
    contract: "jenan.data-center.historical-version/v1" as const,
    versionId: version.id, number: version.number, checksum, itemId: version.itemId,
    sourceId: source.id, typeKey: version.item.typeKey, layer: version.item.layer,
    content: version.content, evidenceStatus: version.evidenceStatus, origin: version.origin,
    provenance: version.provenance, upstreamVersionIds, coverage: coverageFromColumns(version),
    publishedAt: publication.createdAt.toISOString(),
    sourcePublishedAt: version.sourcePublishedAt?.toISOString() ?? null,
    expiresAt: version.expiresAt?.toISOString() ?? null,
    effectiveFrom: version.effectiveFrom?.toISOString() ?? null, effectiveTo: version.effectiveTo?.toISOString() ?? null,
    ownership: source.ownership, owner: source.owner,
    rights: {
      license: source.license, licenseClass: source.licenseClass, usagePolicy: source.usagePolicy,
      allowRetrieval: true as const, allowExport: source.allowExport,
      attribution: { required: source.attributionRequired, text: version.attribution ?? source.attribution },
    },
    currentAuthorization: "AUTHORIZED" as const,
    integrity: { algorithm: "SHA-256" as const, checksum, recomputed: true as const },
  };
}
