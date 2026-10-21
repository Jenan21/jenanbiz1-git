import { z } from "zod";
import { db } from "@/lib/db";
import { DataCenterError, type DataCenterActor, type DataCenterGeoFeature } from "./contracts";
import { buildDataCenterReferences } from "./discovery";
import { validateDataCenterGeoJson } from "./imports";
import type { DataCenterMapReference } from "./map-contract";
import { accessiblePublishedVersionWhere } from "./retrieval";
import { computeDataCenterVersionChecksum } from "./version-checksum";

/**
 * Reads the content of ONE published Data Center version, for a consumer that must use exactly that version (the analysis engines).
 *
 *  - Access is the access policy of retrieval, unchanged. A version the actor cannot read, an unpublished or superseded version, an
 *    expired or archived one and an id that does not exist all give the same `PUBLISHED_VERSION_NOT_FOUND`: the error cannot be used
 *    to learn that a hidden version exists. A robot with no grant is refused by the policy itself, whatever it asks for. As in
 *    retrieval, a version restricted to a specialty or a mission context is read only by a caller that names it.
 *  - The version is exactly the one asked for. There is no fallback to another version, ever.
 *  - Integrity: the SHA-256 the Data Center stored with the version is recomputed from the stored columns. A mismatch means the stored
 *    version is not what was written (`VERSION_CHECKSUM_MISMATCH`) and nothing is returned. A caller that pinned the content it expects
 *    (`expectedChecksum`) is refused when the version it would read has another checksum (`EXPECTED_CHECKSUM_MISMATCH`).
 *  - Spatial content: a dataset of type `geojson` is validated as WGS84 GeoJSON by the Data Center's own validator (no `crs`, positions
 *    within range, closed rings, structure limits). Invalid content is refused with the validator's code; nothing is repaired or
 *    skipped silently. `require: "GEOJSON"` refuses a dataset that is not of that type (`CONTENT_NOT_SPATIAL`).
 *  - Nothing is written: no usage record, no audit entry.
 */
export const readVersionRequestSchema = z.object({
  versionId: z.string().min(1).max(128),
  expectedChecksum: z.string().regex(/^[a-f0-9]{64}$/, "Lower-case hexadecimal SHA-256 digest").optional(),
  require: z.literal("GEOJSON").optional(),
  specialty: z.string().trim().min(1).max(80).optional(),
  missionContext: z.string().trim().min(1).max(80).optional(),
}).strict();
export type DataCenterReadRequest = z.input<typeof readVersionRequestSchema>;

export interface DataCenterVersionContent {
  /** Everything the Data Center states about the version, as the Map contract states it. */
  reference: DataCenterMapReference;
  /** The content exactly as stored. */
  content: string;
  /** GEOJSON when the dataset's type is `geojson` (validated); OTHER when the content is not spatial and is returned as stored. */
  contentKind: "GEOJSON" | "OTHER";
  /** The validated features of a GEOJSON dataset; null otherwise. */
  features: DataCenterGeoFeature[] | null;
  integrity: { algorithm: "SHA-256"; checksum: string; recomputed: true };
}

const NOT_FOUND = () => new DataCenterError("PUBLISHED_VERSION_NOT_FOUND", 404);

export async function readDataCenterVersionContent(request: DataCenterReadRequest, actor: DataCenterActor, options: { now?: Date } = {}): Promise<DataCenterVersionContent> {
  const parsed = readVersionRequestSchema.safeParse(request);
  if (!parsed.success) throw new DataCenterError("INVALID_VERSION_REQUEST", 400);
  const { versionId, expectedChecksum, require, specialty, missionContext } = parsed.data;

  const version = await db.dataCenterVersion.findFirst({
    where: { AND: [await accessiblePublishedVersionWhere(actor, { specialty, missionContext }), { id: versionId }] },
    include: { item: { include: { source: true } }, upstream: { select: { upstreamVersionId: true } } },
  });
  if (!version || version.number !== version.item.publishedVersion) throw NOT_FOUND();

  const recomputed = computeDataCenterVersionChecksum({ ...version, upstreamVersionIds: version.upstream.map((edge) => edge.upstreamVersionId) });
  if (recomputed !== version.checksum) throw new DataCenterError("VERSION_CHECKSUM_MISMATCH", 500);
  if (expectedChecksum !== undefined && expectedChecksum !== version.checksum) throw new DataCenterError("EXPECTED_CHECKSUM_MISMATCH", 409);

  const isGeoJson = version.item.typeKey === "geojson";
  if (require === "GEOJSON" && !isGeoJson) throw new DataCenterError("CONTENT_NOT_SPATIAL", 422);
  let features: DataCenterGeoFeature[] | null = null;
  if (isGeoJson) {
    try {
      features = validateDataCenterGeoJson(JSON.parse(version.content));
    } catch (error) {
      // JSON.parse fails with a SyntaxError; the validator fails with the Data Center's own codes. Either way the content is refused, not repaired.
      throw new DataCenterError(error instanceof DataCenterError ? error.code : "INVALID_GEOJSON", 422);
    }
  }

  const [built] = await buildDataCenterReferences([version], options.now ?? new Date());
  if (!built) throw NOT_FOUND();
  return {
    reference: built.reference, content: version.content, contentKind: isGeoJson ? "GEOJSON" : "OTHER", features,
    integrity: { algorithm: "SHA-256", checksum: version.checksum, recomputed: true },
  };
}
