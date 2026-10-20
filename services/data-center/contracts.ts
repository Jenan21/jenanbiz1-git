import { z } from "zod";

export const layers = ["DATA", "KNOWLEDGE", "INTELLIGENCE", "CONTEXT"] as const;
export const evidenceStates = ["VERIFIED", "ESTIMATED", "DERIVED", "UNVERIFIED", "CONFLICTED"] as const;
export const lifecycleStates = ["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED", "REJECTED", "ARCHIVED"] as const;
// Ownership says who owns the data; the license text and the declared license class describe usage rights and are never inferred from it.
export const ownerships = ["PLATFORM_OWNED", "USER_OWNED", "THIRD_PARTY", "AI_GENERATED"] as const;
export const licenseClasses = ["JENAN_OWNED", "OPEN_LICENSE", "LICENSED", "RESTRICTED"] as const;
export const grantAccess = ["READ", "PROPOSE"] as const;
export const qualityStatuses = ["MEASURED", "INSUFFICIENT_DATA"] as const;
export const DEFAULT_USAGE_POLICY = "Internal use; redistribution requires explicit permission";
const text = (max: number) => z.string().trim().min(1).max(max);
const id = text(128);
const tags = z.array(text(80)).max(30).default([]);
const httpUrl = text(2000).refine((value) => {
  try { const url = new URL(value); return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password; } catch { return false; }
}, "Only http(s) URLs without embedded credentials are accepted");
export function resolveSourceOwnership(source: { kind: string; ownership?: typeof ownerships[number] }) {
  return source.ownership ?? (source.kind === "GENERATED" ? "AI_GENERATED" : "THIRD_PARTY");
}
export const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2 country code in upper case");
export const regionCodeSchema = z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/, "ISO 3166-2 region code in upper case");
const longitude = z.number().min(-180).max(180);
const latitude = z.number().min(-90).max(90);
export const boundingBoxSchema = z.object({ west: longitude, south: latitude, east: longitude, north: latitude }).strict()
  .refine((box) => box.west <= box.east && box.south <= box.north, "Bounding box needs west <= east and south <= north");
// Plain WGS84 metadata. No geometry is stored in the Data Center and antimeridian crossing is not supported in v1.
export const coverageSchema = z.object({
  countryCodes: z.array(countryCodeSchema).max(250).default([]),
  regionCodes: z.array(regionCodeSchema).max(500).default([]),
  boundingBox: boundingBoxSchema.optional(),
}).strict()
  .refine((c) => new Set(c.countryCodes).size === c.countryCodes.length && new Set(c.regionCodes).size === c.regionCodes.length, "Coverage codes must be unique")
  .refine((c) => c.regionCodes.every((region) => c.countryCodes.includes(region.slice(0, 2))), "Every region code needs its country in countryCodes");
export type DataCenterCoverage = z.infer<typeof coverageSchema>;
// Quality is recorded, never computed here: a score needs the method, method version and date that produced it.
const qualityMetrics = z.record(text(80), z.union([z.number(), z.string().max(500), z.boolean()])).refine((metrics) => Object.keys(metrics).length <= 30, "At most 30 metrics");
export const qualityAssessmentSchema = z.object({
  versionId: id, status: z.enum(qualityStatuses), score: z.number().min(0).max(1).optional(),
  method: text(120), methodVersion: text(60), measuredAt: z.iso.datetime(), explanation: text(4000), metrics: qualityMetrics.default({}),
}).strict().refine((v) => (v.status === "MEASURED") === (v.score !== undefined), "A score is required for MEASURED assessments and forbidden otherwise");
export type DataCenterQualityInput = z.input<typeof qualityAssessmentSchema>;
export interface CoverageColumns { coverageCountries: string[]; coverageRegions: string[]; bboxWest: number | null; bboxSouth: number | null; bboxEast: number | null; bboxNorth: number | null }
// Locale-independent ordering, so lock order and canonical hashing never depend on the host's collation.
export const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Canonical (sorted) database columns for a coverage declaration; nothing declared means empty lists and no box. */
export function coverageToColumns(coverage?: DataCenterCoverage): CoverageColumns {
  const box = coverage?.boundingBox;
  return { coverageCountries: [...(coverage?.countryCodes ?? [])].sort(byCodePoint), coverageRegions: [...(coverage?.regionCodes ?? [])].sort(byCodePoint),
    bboxWest: box?.west ?? null, bboxSouth: box?.south ?? null, bboxEast: box?.east ?? null, bboxNorth: box?.north ?? null };
}
/** Returns null when no coverage was declared, so consumers never mistake "unknown" for "worldwide". */
export function coverageFromColumns(row: CoverageColumns) {
  const boundingBox = row.bboxWest === null || row.bboxSouth === null || row.bboxEast === null || row.bboxNorth === null ? null
    : { west: row.bboxWest, south: row.bboxSouth, east: row.bboxEast, north: row.bboxNorth };
  if (!row.coverageCountries.length && !row.coverageRegions.length && !boundingBox) return null;
  return { crs: "WGS84" as const, countryCodes: row.coverageCountries, regionCodes: row.coverageRegions, boundingBox };
}
export const sourceSchema = z.object({
  name: text(240), kind: z.enum(["MANUAL", "FILE", "OFFICIAL", "ACADEMY", "GENERATED", "API"]),
  scope: z.enum(["PLATFORM", "ORGANIZATION", "PRIVATE"]), organizationId: id.optional(),
  owner: text(240), license: text(500), allowExport: z.boolean().default(false),
  allowRetrieval: z.boolean().default(true), freshnessDays: z.number().int().min(1).max(3650).default(90),
  sourceOrganization: text(240).optional(), sourceUrl: httpUrl.optional(),
  ownership: z.enum(ownerships).optional(), licenseClass: z.enum(licenseClasses).optional(),
  usagePolicy: text(2000).optional(), attribution: text(1000).optional(), attributionRequired: z.boolean().default(false),
}).strict()
  .refine((v) => v.scope === "ORGANIZATION" ? !!v.organizationId : !v.organizationId, "Organization scope requires organizationId exclusively")
  .refine((v) => (v.kind === "GENERATED") === (resolveSourceOwnership(v) === "AI_GENERATED"), "AI_GENERATED ownership and GENERATED kind must go together")
  .refine((v) => !v.attributionRequired || !!v.attribution, "Attribution text is required when attribution is mandatory")
  .refine((v) => v.licenseClass !== "JENAN_OWNED" || resolveSourceOwnership(v) === "PLATFORM_OWNED", "JENAN_OWNED requires platform ownership")
  .refine((v) => v.licenseClass !== "RESTRICTED" || !v.allowExport, "RESTRICTED sources cannot allow export");
export const itemSchema = z.object({
  sourceId: id, title: text(240), typeKey: text(80), layer: z.enum(layers),
  content: text(200_000), evidenceStatus: z.enum(evidenceStates).default("UNVERIFIED"),
  provenance: z.array(z.object({ label: text(240), reference: text(2000), kind: z.enum(["SOURCE", "CALCULATION", "DOCUMENT", "HUMAN_REVIEW"]) }).strict()).max(100).default([]),
  specialties: tags, missionContexts: tags, requiredPermission: text(100).optional(),
  sourcePublishedAt: z.iso.datetime().optional(), expiresAt: z.iso.datetime().optional(),
  effectiveFrom: z.iso.datetime().optional(), effectiveTo: z.iso.datetime().optional(),
  origin: z.enum(["HUMAN", "AI", "IMPORT", "CALCULATION", "ACADEMY"]).default("HUMAN"),
  // Versions this one was derived from; stored as lineage rows with real foreign keys.
  upstreamVersionIds: z.array(id).max(20).default([]),
  // Version-level credit line (overrides the source statement for this version) and declared geographic coverage.
  attribution: text(1000).optional(), coverage: coverageSchema.optional(),
}).strict();
export const versionSchema = itemSchema.omit({ sourceId: true, typeKey: true, layer: true }).extend({ itemId: id, reason: text(2000) });
export const commandSchema = z.discriminatedUnion("action", [
  sourceSchema.safeExtend({ action: z.literal("create-source") }),
  itemSchema.omit({ origin: true }).extend({ action: z.literal("create-item") }),
  versionSchema.omit({ origin: true }).extend({ action: z.literal("create-version") }),
  z.object({ action: z.literal("register-type"), key: z.string().regex(/^[a-z][a-z0-9._-]{1,79}$/), label: text(240), layer: z.enum(layers), requiresIndependentReview: z.boolean().default(false), categoryKey: text(80).optional(), departmentKey: text(80).optional() }).strict(),
  z.object({ action: z.literal("register-category"), key: z.string().regex(/^[a-z][a-z0-9._-]{1,79}$/), label: text(240) }).strict(),
  z.object({ action: z.literal("register-department"), key: z.string().regex(/^[a-z][a-z0-9._-]{1,79}$/), label: text(240) }).strict(),
  z.object({ action: z.literal("link-evidence"), versionId: id, evidenceId: id.optional(), kind: z.enum(["SOURCE", "DOCUMENT", "CALCULATION", "HUMAN_REVIEW", "EXISTING_EVIDENCE"]), reference: text(2000), label: text(240), notes: text(4000).optional() }).strict(),
  z.object({ action: z.literal("transition-item"), itemId: id, status: z.enum(lifecycleStates), reason: text(2000) }).strict(),
  z.object({ action: z.literal("review-item"), itemId: id, decision: z.enum(["APPROVED", "REJECTED"]), notes: text(4000) }).strict(),
  z.object({ action: z.literal("create-conflict"), itemId: id, otherItemId: id, reason: text(4000) }).strict(),
  z.object({ action: z.literal("resolve-conflict"), conflictId: id, resolution: z.enum(["KEEP_FIRST", "KEEP_SECOND", "KEEP_BOTH", "SUPERSEDED"]), notes: text(4000) }).strict(),
  z.object({ action: z.literal("record-usage"), versionId: id, consumer: text(120), missionId: id.optional(), purpose: text(500), specialty: text(80).optional(), missionContext: text(80).optional() }).strict(),
  z.object({ action: z.literal("request-academy-release"), versionId: id, targetKind: z.enum(["COURSE", "ROBOT", "SPECIALTY"]), targetId: id, notes: text(4000) }).strict(),
  z.object({ action: z.literal("approve-academy-release"), releaseId: id, notes: text(4000) }).strict(),
  z.object({ action: z.literal("import-academy-source"), sourceId: id, resourceVersionId: id }).strict(),
  z.object({ action: z.literal("grant-robot-access"), sourceId: id, robotId: id, principalId: id, roleKey: text(80), specialty: text(80), missionId: id, access: z.enum(grantAccess).default("READ"), reason: text(2000), expiresAt: z.iso.datetime() }).strict(),
  z.object({ action: z.literal("revoke-robot-access"), grantId: id, reason: text(2000) }).strict(),
  qualityAssessmentSchema.safeExtend({ action: z.literal("record-quality-assessment") }),
]);
export type CreateSourceInput = z.input<typeof sourceSchema>;
export type CreateItemInput = z.input<typeof itemSchema>;
export type DataCenterCommand = z.infer<typeof commandSchema>;
// Robot identity fields are filled only by trusted server code that has authenticated the robot runtime; never from request input.
export interface DataCenterActor { id: string; systemRole: string; kind: "HUMAN" | "AI"; robotId?: string; roleKey?: string; specialty?: string; missionId?: string; }
export class DataCenterError extends Error {
  constructor(public readonly code: string, public readonly status = 400) { super(code); }
}
export interface DataCenterContextRequest {
  query?: string; mode?: "keyword" | "semantic"; organizationId?: string;
  specialty?: string; missionContext?: string; typeKey?: string;
  layer?: typeof layers[number]; limit?: number; page?: number;
  categoryKey?: string; departmentKey?: string;
}
export interface DataCenterSemanticAdapter {
  readonly name: string;
  search(input: { query: string; candidateVersionIds: string[]; limit: number }): Promise<string[]>;
}
export interface DataCenterScanner {
  readonly name: string;
  scan(bytes: Uint8Array): Promise<"CLEAN" | "INFECTED" | "UNAVAILABLE">;
}
export interface DataCenterGeoFeature {
  type: "Feature";
  geometry: { type: string; coordinates?: unknown; geometries?: unknown[] } | null;
  properties: Record<string, unknown> | null;
}
