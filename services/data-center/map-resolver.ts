import { db } from "@/lib/db";
import { byCodePoint, DataCenterError, type DataCenterActor } from "./contracts";
import { buildMapReference, type DataCenterMapReference } from "./map-contract";
import { versionConfidence } from "./policy";
import { latestDataCenterQuality } from "./quality";
import { accessiblePublishedVersionWhere } from "./retrieval";

/**
 * Resolves the Map-facing reference of one published version. It applies the same visibility rules as retrieval (scope, permission,
 * open conflicts, validity window, source retrieval switch, no specialty/mission-restricted material) and reads only Data Center tables.
 * Nothing is written, no jenan_map table is touched and no HTTP route is exposed here.
 */
export async function resolveDataCenterMapReference(versionId: string, actor: DataCenterActor, now = new Date()): Promise<DataCenterMapReference> {
  if (!versionId || versionId.length > 128) throw new DataCenterError("PUBLISHED_VERSION_NOT_FOUND", 404);
  const version = await db.dataCenterVersion.findFirst({
    where: { AND: [await accessiblePublishedVersionWhere(actor), { id: versionId }] },
    include: { item: { include: { source: true } }, upstream: { select: { upstreamVersionId: true } } },
  });
  if (!version || version.number !== version.item.publishedVersion) throw new DataCenterError("PUBLISHED_VERSION_NOT_FOUND", 404);
  const quality = await latestDataCenterQuality(db, version.id);
  const published = await db.dataCenterEvent.findFirst({ where: { itemId: version.itemId, version: version.number, toStatus: "PUBLISHED" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const confidence = versionConfidence(version, version.item.source, now);
  return buildMapReference({
    item: version.item, version, source: version.item.source, quality,
    upstreamVersionIds: version.upstream.map((edge) => edge.upstreamVersionId).sort(byCodePoint),
    confidence: { score: confidence.score, policyVersion: confidence.policyVersion, evaluatedAt: confidence.evaluatedAt }, publishedAt: published?.createdAt ?? null,
  }, now);
}
