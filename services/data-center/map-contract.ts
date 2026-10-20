import { z } from "zod";
import { boundingBoxSchema, countryCodeSchema, DataCenterError, evidenceStates, layers, licenseClasses, ownerships, regionCodeSchema, type CoverageColumns, coverageFromColumns } from "./contracts";

/**
 * Contract between the Data Center (source of truth for datasets, versions, sources, rights and quality) and the Jenan PRO Map
 * (display and spatial experience). It is deliberately independent: no foreign key, no import and no query reaches the jenan_map
 * schema from here. The Map stores only an opaque reference (the version ID) plus the immutable snapshot below for a published
 * release, and uses assessMapReferenceUse / assessMapBinding to see whether the Data Center still agrees with that snapshot.
 * This module is pure (no database, no network) so both sides can test against it.
 */
export const MAP_REFERENCE_CONTRACT = "jenan.data-center.map-reference/v1";
export const MAP_BINDING_CONTRACT = "jenan.data-center.map-binding/v1";

const text = z.string().min(1).max(4000);
const identifier = z.string().min(1).max(128);
const timestamp = z.iso.datetime();
const optionalTimestamp = timestamp.nullable();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/, "Lower-case hexadecimal SHA-256 digest");
const assessment = { method: text, methodVersion: text, measuredAt: timestamp, explanation: text };

export const mapReferenceSchema = z.object({
  contract: z.literal(MAP_REFERENCE_CONTRACT),
  resolvedAt: timestamp,
  dataset: z.object({ itemId: identifier, title: text, typeKey: text, layer: z.enum(layers) }).strict(),
  version: z.object({
    versionId: identifier, number: z.number().int().min(1), checksum: z.object({ algorithm: z.literal("SHA-256"), value: sha256 }).strict(),
    createdAt: timestamp, evidenceStatus: z.enum(evidenceStates), origin: text, upstreamVersionIds: z.array(identifier).max(20),
  }).strict(),
  source: z.object({
    sourceId: identifier, name: text, kind: text, scope: z.enum(["PLATFORM", "ORGANIZATION", "PRIVATE"]), organization: text.nullable(), url: text.nullable(),
  }).strict(),
  ownership: z.object({ ownership: z.enum(ownerships), owner: text }).strict(),
  rights: z.object({
    license: text, licenseClass: z.enum(licenseClasses).nullable(), usagePolicy: text, allowRetrieval: z.literal(true), allowExport: z.boolean(),
    attribution: z.object({ text: text.nullable(), required: z.boolean(), level: z.enum(["VERSION", "SOURCE"]).nullable() }).strict(),
  }).strict(),
  coverage: z.object({
    crs: z.literal("WGS84"), countryCodes: z.array(countryCodeSchema).max(250), regionCodes: z.array(regionCodeSchema).max(500), boundingBox: boundingBoxSchema.nullable(),
  }).strict().nullable(),
  quality: z.discriminatedUnion("status", [
    z.object({ status: z.literal("UNAVAILABLE") }).strict(),
    z.object({ status: z.literal("INSUFFICIENT_DATA"), ...assessment }).strict(),
    z.object({ status: z.literal("MEASURED"), score: z.number().min(0).max(1), ...assessment }).strict(),
  ]),
  confidence: z.object({ score: z.number().min(0).max(100), policyVersion: text, evaluatedAt: timestamp, heuristic: z.literal(true) }).strict(),
  freshness: z.object({
    status: z.enum(["FRESH", "STALE", "EXPIRED", "UNKNOWN"]), freshnessDays: z.number().int().min(1), sourcePublishedAt: optionalTimestamp,
    expiresAt: optionalTimestamp, effectiveFrom: optionalTimestamp, effectiveTo: optionalTimestamp,
  }).strict(),
  publication: z.object({ status: z.literal("PUBLISHED"), publishedVersion: z.number().int().min(1), publishedAt: optionalTimestamp }).strict(),
}).strict()
  .refine((r) => r.version.number === r.publication.publishedVersion, "The reference must describe the published version")
  .refine((r) => !r.rights.attribution.required || r.rights.attribution.text !== null, "Mandatory attribution needs its text")
  .refine((r) => r.rights.licenseClass !== "JENAN_OWNED" || r.ownership.ownership === "PLATFORM_OWNED", "JENAN_OWNED requires platform ownership")
  .refine((r) => r.rights.licenseClass !== "RESTRICTED" || !r.rights.allowExport, "RESTRICTED data cannot allow export")
  .refine((r) => (r.source.kind === "GENERATED") === (r.ownership.ownership === "AI_GENERATED"), "AI_GENERATED ownership and GENERATED sources go together");
export type DataCenterMapReference = z.infer<typeof mapReferenceSchema>;

/** What the Map keeps for one published release layer: its own identifiers (opaque to the Data Center) and the immutable reference snapshot. */
export const mapBindingSchema = z.object({
  contract: z.literal(MAP_BINDING_CONTRACT),
  map: z.object({ releaseId: identifier, layerKey: identifier, artifactId: identifier.optional(), artifactSha256: sha256.optional(), exportsArtifact: z.boolean() }).strict(),
  reference: mapReferenceSchema,
}).strict().refine((b) => !b.map.exportsArtifact || !!b.map.artifactSha256, "An exported artifact must record its own SHA-256 digest");
export type DataCenterMapBinding = z.infer<typeof mapBindingSchema>;

export interface MapFinding { code: string; blocking: boolean; message: string }

/** Pure freshness classification; an undated source is UNKNOWN, never silently fresh. */
export function dataCenterFreshness(input: { sourcePublishedAt: Date | null; freshnessDays: number; expiresAt: Date | null; effectiveTo: Date | null }, now = new Date()) {
  if ((input.expiresAt && input.expiresAt <= now) || (input.effectiveTo && input.effectiveTo <= now)) return "EXPIRED" as const;
  if (!input.sourcePublishedAt) return "UNKNOWN" as const;
  return now.getTime() - input.sourcePublishedAt.getTime() > input.freshnessDays * 86_400_000 ? "STALE" as const : "FRESH" as const;
}

export interface MapReferenceInput {
  item: { id: string; title: string; typeKey: string; layer: string; status: string; publishedVersion: number | null };
  version: CoverageColumns & {
    id: string; number: number; checksum: string; createdAt: Date; evidenceStatus: string; origin: string; attribution: string | null;
    sourcePublishedAt: Date | null; expiresAt: Date | null; effectiveFrom: Date | null; effectiveTo: Date | null;
  };
  source: {
    id: string; name: string; kind: string; scope: string; owner: string; sourceOrganization: string | null; sourceUrl: string | null; ownership: string; license: string;
    licenseClass: string | null; usagePolicy: string; attribution: string | null; attributionRequired: boolean; allowRetrieval: boolean; allowExport: boolean; freshnessDays: number;
  };
  upstreamVersionIds: string[];
  quality: { status: string; score: number | null; method: string; methodVersion: string; measuredAt: Date; explanation: string } | null;
  confidence: { score: number; policyVersion: string; evaluatedAt: string };
  publishedAt: Date | null;
}
const iso = (value: Date | null) => value?.toISOString() ?? null;

/** Maps Data Center rows to the contract. Only the item's published version of a retrievable source can be referenced. */
export function buildMapReference(input: MapReferenceInput, now = new Date()): DataCenterMapReference {
  const { item, version, source, quality } = input;
  if (item.status === "ARCHIVED" || item.publishedVersion !== version.number || !source.allowRetrieval) throw new DataCenterError("PUBLISHED_VERSION_NOT_FOUND", 404);
  const attributionText = version.attribution ?? source.attribution;
  return mapReferenceSchema.parse({
    contract: MAP_REFERENCE_CONTRACT, resolvedAt: now.toISOString(),
    dataset: { itemId: item.id, title: item.title, typeKey: item.typeKey, layer: item.layer },
    version: { versionId: version.id, number: version.number, checksum: { algorithm: "SHA-256", value: version.checksum }, createdAt: version.createdAt.toISOString(),
      evidenceStatus: version.evidenceStatus, origin: version.origin, upstreamVersionIds: input.upstreamVersionIds },
    source: { sourceId: source.id, name: source.name, kind: source.kind, scope: source.scope, organization: source.sourceOrganization, url: source.sourceUrl },
    ownership: { ownership: source.ownership, owner: source.owner },
    rights: { license: source.license, licenseClass: source.licenseClass, usagePolicy: source.usagePolicy, allowRetrieval: source.allowRetrieval, allowExport: source.allowExport,
      attribution: { text: attributionText, required: source.attributionRequired, level: version.attribution ? "VERSION" : source.attribution ? "SOURCE" : null } },
    coverage: coverageFromColumns(version),
    quality: quality ? { status: quality.status, ...(quality.score === null ? {} : { score: quality.score }), method: quality.method, methodVersion: quality.methodVersion,
      measuredAt: quality.measuredAt.toISOString(), explanation: quality.explanation } : { status: "UNAVAILABLE" },
    confidence: { ...input.confidence, heuristic: true },
    freshness: { status: dataCenterFreshness({ sourcePublishedAt: version.sourcePublishedAt, freshnessDays: source.freshnessDays, expiresAt: version.expiresAt, effectiveTo: version.effectiveTo }, now),
      freshnessDays: source.freshnessDays, sourcePublishedAt: iso(version.sourcePublishedAt), expiresAt: iso(version.expiresAt), effectiveFrom: iso(version.effectiveFrom), effectiveTo: iso(version.effectiveTo) },
    publication: { status: "PUBLISHED", publishedVersion: version.number, publishedAt: iso(input.publishedAt) },
  });
}

/**
 * Maps the declared Data Center rights onto the Map's license classes without losing information: the declared class is kept as is
 * and an undeclared class is treated as RESTRICTED (fail closed), with the basis stated rather than hidden.
 */
export function effectiveMapLicenseClass(reference: DataCenterMapReference) {
  const declared = reference.rights.licenseClass;
  return { declared, effective: declared ?? "RESTRICTED" as const, basis: declared ? "DECLARED" as const : "UNCLASSIFIED_FAIL_CLOSED" as const };
}

/** Whether a reference may be displayed or exported by the Map right now. Freshness is re-evaluated from the stored dates. */
export function assessMapReferenceUse(reference: DataCenterMapReference, intent: "DISPLAY" | "EXPORT", now = new Date()) {
  const findings: MapFinding[] = [];
  const add = (code: string, blocking: boolean, message: string) => findings.push({ code, blocking, message });
  const date = (value: string | null) => (value ? new Date(value) : null);
  const freshness = dataCenterFreshness({ sourcePublishedAt: date(reference.freshness.sourcePublishedAt), freshnessDays: reference.freshness.freshnessDays,
    expiresAt: date(reference.freshness.expiresAt), effectiveTo: date(reference.freshness.effectiveTo) }, now);
  if (freshness === "EXPIRED") add("DATA_EXPIRED", true, "The data is past its expiry or effective period");
  else if (freshness === "STALE") add("DATA_STALE", false, "The source date is older than the source's freshness window");
  else if (freshness === "UNKNOWN") add("FRESHNESS_UNKNOWN", false, "The source date is unknown, so freshness cannot be stated");
  if (reference.quality.status === "UNAVAILABLE") add("QUALITY_UNAVAILABLE", false, "No quality assessment has been recorded for this version");
  if (intent === "EXPORT") {
    if (!reference.rights.allowExport) add("EXPORT_NOT_PERMITTED", true, "The source does not allow redistribution or export");
    const { declared, basis } = effectiveMapLicenseClass(reference);
    if (basis === "UNCLASSIFIED_FAIL_CLOSED") add("LICENSE_CLASS_UNDECLARED", true, "No license class is declared, so the data is treated as RESTRICTED");
    else if (declared === "RESTRICTED") add("LICENSE_CLASS_RESTRICTED", true, "The declared license class is RESTRICTED");
  }
  return { allowed: !findings.some((finding) => finding.blocking), findings };
}

/** Compares the snapshot a published Map release kept with what the Data Center says now (null when the version is no longer referenceable). */
export function assessMapBinding(binding: DataCenterMapBinding, current: DataCenterMapReference | null) {
  const findings: MapFinding[] = [];
  const add = (code: string, blocking: boolean, message: string) => findings.push({ code, blocking, message });
  const snapshot = binding.reference;
  if (!current) {
    add("DATA_CENTER_VERSION_UNAVAILABLE", true, "The referenced version is no longer a published, accessible Data Center version");
    return { consistent: false, findings };
  }
  if (current.version.versionId !== snapshot.version.versionId) add("VERSION_MISMATCH", true, "The current reference describes a different version than the snapshot");
  if (current.version.checksum.value !== snapshot.version.checksum.value) add("CHECKSUM_MISMATCH", true, "The version content digest differs from the snapshot");
  if (binding.map.exportsArtifact && !current.rights.allowExport) add("EXPORT_NO_LONGER_PERMITTED", true, "The source no longer allows export of an exported artifact");
  if (current.rights.licenseClass !== snapshot.rights.licenseClass) {
    const tightened = binding.map.exportsArtifact && (current.rights.licenseClass === null || current.rights.licenseClass === "RESTRICTED");
    add("LICENSE_CLASS_CHANGED", tightened, "The declared license class changed since the snapshot");
  }
  if (current.rights.license !== snapshot.rights.license) add("LICENSE_CHANGED", false, "The license text changed since the snapshot");
  if (current.rights.usagePolicy !== snapshot.rights.usagePolicy) add("USAGE_POLICY_CHANGED", false, "The usage policy changed since the snapshot");
  if (current.rights.attribution.text !== snapshot.rights.attribution.text) add("ATTRIBUTION_CHANGED", false, "The required credit line changed since the snapshot");
  if (current.ownership.ownership !== snapshot.ownership.ownership) add("OWNERSHIP_CHANGED", false, "The declared ownership changed since the snapshot");
  return { consistent: !findings.some((finding) => finding.blocking), findings };
}
