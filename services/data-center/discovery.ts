import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { boundingBoxSchema, byCodePoint, countryCodeSchema, DataCenterError, layers, regionCodeSchema, type DataCenterActor } from "./contracts";
import { buildMapReference, type DataCenterMapReference } from "./map-contract";
import { versionConfidence } from "./policy";
import { accessiblePublishedVersionWhere } from "./retrieval";
import { DC_VERSION_SELECTION_POLICY, rankVersions, type SelectionExclusionReason, type SelectionFacts } from "./version-selection";

/**
 * Discovery of published Data Center versions for a consumer that must choose one (the analysis engines). It returns metadata only, never
 * content, and it applies exactly the access policy of retrieval (`accessiblePublishedVersionWhere`): source scope, organization
 * permission, robot grants, required permission, validity window, retrieval switch, open conflicts, and only the published version of an
 * item. A version the actor may not see is not returned and is not reported: the answer for a version that is forbidden, unpublished,
 * expired, archived or does not exist is one and the same, so discovery cannot be used to learn that a hidden version exists.
 * Nothing is written: no usage record, no audit entry.
 *
 * Two ways to ask:
 *  - EXACT: `versionIds`. The versions are used as given, never replaced by another. Those the actor can read are returned in the order
 *    asked; the others are listed in `unavailableVersionIds` without a reason.
 *  - BY_TYPE: `typeKeys` (optionally narrowed by `geography` and an `asOf` instant). The versions in force as of the instant are ranked by
 *    the written policy `dc-version-selection-v1`; the first is the selected one. The same request, instant and available versions
 *    always give the same selection.
 *
 * Geography uses the structured coverage the Data Center stores (country codes, region codes, a WGS84 box), not geometry. A version whose
 * coverage was not declared never matches a geographic filter: the Data Center never turns "unknown" into "worldwide". Every filter that
 * is given must hold.
 */
export const MAX_EXACT_VERSION_IDS = 50;
export const MAX_TYPE_KEYS = 10;
export const DEFAULT_DISCOVERY_LIMIT = 20;
export const MAX_DISCOVERY_LIMIT = 100;
/** Rows read before only the published version of each item is kept, and versions kept after that. Above either the answer is refused, not cut. */
const MAX_ROWS = 2000;
const MAX_CANDIDATES = 500;

const identifier = z.string().min(1).max(128);
const typeKey = z.string().regex(/^[a-z][a-z0-9._-]{1,79}$/, "A registered type key");
const geographySchema = z.object({
  countryCodes: z.array(countryCodeSchema).min(1).max(20).optional(),
  regionCodes: z.array(regionCodeSchema).min(1).max(50).optional(),
  boundingBox: boundingBoxSchema.optional(),
}).strict().refine((geography) => geography.countryCodes !== undefined || geography.regionCodes !== undefined || geography.boundingBox !== undefined, "A geographic filter names a country, a region or a box");

export const discoveryRequestSchema = z.object({
  versionIds: z.array(identifier).min(1).max(MAX_EXACT_VERSION_IDS).optional(),
  typeKeys: z.array(typeKey).min(1).max(MAX_TYPE_KEYS).optional(),
  asOf: z.iso.datetime().optional(),
  geography: geographySchema.optional(),
  layer: z.enum(layers).optional(),
  organizationId: identifier.optional(),
  specialty: z.string().trim().min(1).max(80).optional(),
  missionContext: z.string().trim().min(1).max(80).optional(),
  limit: z.number().int().min(1).max(MAX_DISCOVERY_LIMIT).optional(),
}).strict()
  .refine((request) => (request.versionIds === undefined) !== (request.typeKeys === undefined), "Give versionIds or typeKeys, one of them")
  .refine((request) => request.versionIds === undefined || (request.asOf === undefined && request.geography === undefined), "An exact version is used as given: asOf and geography apply to a selection by type");
export type DataCenterDiscoveryRequest = z.input<typeof discoveryRequestSchema>;

export type DataCenterDiscoveryStatus =
  | "FOUND"
  /** By type: no readable version of those types. Exact: at least one requested version is not available. */
  | "NOT_AVAILABLE"
  /** By type: readable versions of those types exist, none of which declares coverage that matches the geographic filter. */
  | "NO_COVERAGE"
  /** By type: readable versions match, none of which is in force as of the instant. */
  | "NOT_IN_FORCE"
  | "TOO_MANY_CANDIDATES";

export interface DiscoveredVersion {
  /** Everything the Data Center states about the version: dataset, version and its SHA-256, source, ownership, rights, coverage, quality, freshness, publication. */
  reference: DataCenterMapReference;
}
export interface DataCenterDiscoveryResult {
  mode: "EXACT" | "BY_TYPE";
  /** `dc-version-selection-v1` by type; `exact-version` for exact versions, which nothing chooses between. */
  policy: string;
  /** The instant a selection by type was made as of; null for exact versions. */
  asOf: string | null;
  asOfExplicit: boolean;
  status: DataCenterDiscoveryStatus;
  /** Exact: the readable versions in the order asked. By type: the versions in force, the preferred first, at most `limit`. */
  candidates: DiscoveredVersion[];
  /** By type: the preferred version. Exact: null, because the caller chose. */
  selected: DiscoveredVersion | null;
  /** Exact only: the ids asked for that are not available, in the order asked. The reason is never given. */
  unavailableVersionIds: string[];
  /** By type: readable matches that are not in force as of the instant, by id, with the reason. */
  notInForce: Array<{ versionId: string; reason: SelectionExclusionReason }>;
  /** By type: there are more versions in force than `limit`; the selection is still the preferred of all of them. */
  truncated: boolean;
}

/** The select of a version row: every column the Map reference needs and none of the content. */
const discoverySelect = {
  id: true, itemId: true, number: true, checksum: true, createdAt: true, evidenceStatus: true, origin: true, provenance: true, attribution: true,
  sourcePublishedAt: true, expiresAt: true, effectiveFrom: true, effectiveTo: true,
  coverageCountries: true, coverageRegions: true, bboxWest: true, bboxSouth: true, bboxEast: true, bboxNorth: true,
  item: { select: { id: true, title: true, typeKey: true, layer: true, status: true, publishedVersion: true, source: true } },
  upstream: { select: { upstreamVersionId: true } },
} satisfies Prisma.DataCenterVersionSelect;
type DiscoveryRow = Prisma.DataCenterVersionGetPayload<{ select: typeof discoverySelect }>;

function geographyConditions(geography: z.output<typeof geographySchema> | undefined): Prisma.DataCenterVersionWhereInput[] {
  if (!geography) return [];
  const conditions: Prisma.DataCenterVersionWhereInput[] = [];
  if (geography.countryCodes) conditions.push({ coverageCountries: { hasSome: geography.countryCodes } });
  if (geography.regionCodes) conditions.push({ coverageRegions: { hasSome: geography.regionCodes } });
  if (geography.boundingBox) {
    const { west, south, east, north } = geography.boundingBox;
    // Closed boxes that touch intersect. A version without a declared box has NULL columns and matches nothing here.
    conditions.push({ bboxWest: { lte: east }, bboxEast: { gte: west }, bboxSouth: { lte: north }, bboxNorth: { gte: south } });
  }
  return conditions;
}

/** Only the version an item has published is readable; the access policy already excludes archived items and unpublished ones. */
const isPublishedVersion = (row: DiscoveryRow) => row.number === row.item.publishedVersion;

/** Builds the Map reference of every row with set-based queries (quality, publication), never one query per version. */
export async function buildDataCenterReferences(rows: readonly DiscoveryRow[], now: Date) {
  const ids = rows.map((row) => row.id);
  const qualities = ids.length === 0 ? [] : await db.dataCenterQualityAssessment.findMany({
    where: { versionId: { in: ids } }, orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });
  const latestQuality = new Map<string, (typeof qualities)[number]>();
  for (const assessment of qualities) if (!latestQuality.has(assessment.versionId)) latestQuality.set(assessment.versionId, assessment);

  const events = ids.length === 0 ? [] : await db.dataCenterEvent.findMany({
    where: { toStatus: "PUBLISHED", OR: rows.map((row) => ({ itemId: row.itemId, version: row.number })) },
    select: { itemId: true, version: true, createdAt: true }, orderBy: { createdAt: "desc" },
  });
  const publishedAt = new Map<string, Date>();
  for (const event of events) if (!publishedAt.has(`${event.itemId}:${event.version}`)) publishedAt.set(`${event.itemId}:${event.version}`, event.createdAt);

  return rows.map((row) => {
    const confidence = versionConfidence(row, row.item.source, now);
    const published = publishedAt.get(`${row.itemId}:${row.number}`) ?? null;
    const reference = buildMapReference({
      item: row.item, version: row, source: row.item.source, quality: latestQuality.get(row.id) ?? null,
      upstreamVersionIds: row.upstream.map((edge) => edge.upstreamVersionId).sort(byCodePoint),
      confidence: { score: confidence.score, policyVersion: confidence.policyVersion, evaluatedAt: confidence.evaluatedAt }, publishedAt: published,
    }, now);
    const facts: SelectionFacts = {
      versionId: row.id, sourcePublishedAt: row.sourcePublishedAt, publishedAt: published, effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo, expiresAt: row.expiresAt,
    };
    return { reference, facts };
  });
}

export async function discoverDataCenterVersions(request: DataCenterDiscoveryRequest, actor: DataCenterActor, options: { now?: Date } = {}): Promise<DataCenterDiscoveryResult> {
  const parsed = discoveryRequestSchema.safeParse(request);
  if (!parsed.success) throw new DataCenterError("INVALID_DISCOVERY_REQUEST", 400);
  const input = parsed.data;
  const now = options.now ?? new Date();
  const access = await accessiblePublishedVersionWhere(actor, { layer: input.layer, organizationId: input.organizationId, specialty: input.specialty, missionContext: input.missionContext });

  if (input.versionIds !== undefined) {
    const requested = [...new Set(input.versionIds)];
    const rows = await db.dataCenterVersion.findMany({ where: { AND: [access, { id: { in: requested } }] }, select: discoverySelect, take: requested.length });
    const readable = new Map(rows.filter(isPublishedVersion).map((row) => [row.id, row]));
    const built = new Map((await buildDataCenterReferences([...readable.values()], now)).map((entry) => [entry.facts.versionId, entry.reference]));
    const candidates = requested.flatMap((id) => (built.has(id) ? [{ reference: built.get(id) as DataCenterMapReference }] : []));
    const unavailable = requested.filter((id) => !built.has(id));
    return {
      mode: "EXACT", policy: "exact-version", asOf: null, asOfExplicit: false, status: unavailable.length === 0 ? "FOUND" : "NOT_AVAILABLE",
      candidates, selected: null, unavailableVersionIds: unavailable, notInForce: [], truncated: false,
    };
  }

  const typeKeys = [...new Set(input.typeKeys as string[])].sort(byCodePoint);
  const asOfIsExplicit = input.asOf !== undefined;
  const asOf = asOfIsExplicit ? new Date(input.asOf as string) : now;
  const byType = (extra: Prisma.DataCenterVersionWhereInput[]) => db.dataCenterVersion.findMany({
    where: { AND: [access, { item: { typeKey: { in: typeKeys } } }, ...extra] }, select: discoverySelect, orderBy: { id: "asc" }, take: MAX_ROWS + 1,
  });
  const empty = (status: DataCenterDiscoveryStatus): DataCenterDiscoveryResult => ({
    mode: "BY_TYPE", policy: DC_VERSION_SELECTION_POLICY, asOf: asOf.toISOString(), asOfExplicit: asOfIsExplicit, status, candidates: [], selected: null,
    unavailableVersionIds: [], notInForce: [], truncated: false,
  });

  const rows = await byType(geographyConditions(input.geography));
  if (rows.length > MAX_ROWS) return empty("TOO_MANY_CANDIDATES");
  const published = rows.filter(isPublishedVersion);
  if (published.length > MAX_CANDIDATES) return empty("TOO_MANY_CANDIDATES");
  if (published.length === 0) {
    // With a geographic filter, say whether the type exists at all: "no dataset" and "no dataset covers this place" are different facts.
    if (input.geography === undefined) return empty("NOT_AVAILABLE");
    const unfiltered = await byType([]);
    if (unfiltered.length > MAX_ROWS) return empty("TOO_MANY_CANDIDATES");
    return empty(unfiltered.some(isPublishedVersion) ? "NO_COVERAGE" : "NOT_AVAILABLE");
  }

  const built = await buildDataCenterReferences(published, now);
  const byId = new Map(built.map((entry) => [entry.facts.versionId, entry]));
  const { ranked, excluded } = rankVersions(built.map((entry) => entry.facts), asOf, asOfIsExplicit);
  const limit = input.limit ?? DEFAULT_DISCOVERY_LIMIT;
  const inForce = ranked.map((facts) => ({ reference: (byId.get(facts.versionId) as (typeof built)[number]).reference }));
  return {
    mode: "BY_TYPE", policy: DC_VERSION_SELECTION_POLICY, asOf: asOf.toISOString(), asOfExplicit: asOfIsExplicit,
    status: inForce.length > 0 ? "FOUND" : "NOT_IN_FORCE", candidates: inForce.slice(0, limit), selected: inForce[0] ?? null,
    unavailableVersionIds: [], notInForce: excluded.map((entry) => ({ versionId: entry.candidate.versionId, reason: entry.reason })), truncated: inForce.length > limit,
  };
}
