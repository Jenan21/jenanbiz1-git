import { createHash } from "node:crypto";
import { byCodePoint } from "./contracts";

/**
 * Recomputes, from the stored columns of a version, the SHA-256 the Data Center computed when it created that version, so a reader can
 * prove that what it holds is what was stored. The composition mirrors `versionData` in `service.ts` exactly: the optional parts
 * (attribution, coverage, lineage) join the hash only when present, so versions that never had them keep their original checksum.
 * This module is pure and changes nothing; a test on a real database creates versions through the service and recomputes each one,
 * so a change to the composition in `service.ts` that is not mirrored here fails that test.
 */
export interface VersionChecksumParts {
  title: string;
  content: string;
  evidenceStatus: string;
  origin: string;
  provenance: unknown;
  specialties: readonly string[];
  missionContexts: readonly string[];
  requiredPermission: string | null;
  sourcePublishedAt: Date | null;
  expiresAt: Date | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  attribution: string | null;
  coverageCountries: readonly string[];
  coverageRegions: readonly string[];
  bboxWest: number | null;
  bboxSouth: number | null;
  bboxEast: number | null;
  bboxNorth: number | null;
  /** The versions this one was derived from. */
  upstreamVersionIds: readonly string[];
}

const iso = (value: Date | null) => value?.toISOString() ?? null;
const PROVENANCE_KEYS = ["label", "reference", "kind"] as const;

/**
 * The database keeps provenance as jsonb, which does not keep the order of an object's keys, while the checksum was computed over the
 * entries as the contract wrote them (label, reference, kind). Well-formed entries are rebuilt in that order; anything else is left
 * as it is and simply fails to match.
 */
function provenanceAsHashed(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return entry;
    const record = entry as Record<string, unknown>;
    const keys = Object.keys(record);
    return keys.length === PROVENANCE_KEYS.length && PROVENANCE_KEYS.every((key) => key in record)
      ? { label: record.label, reference: record.reference, kind: record.kind }
      : entry;
  });
}

export function computeDataCenterVersionChecksum(parts: VersionChecksumParts): string {
  const countries = [...parts.coverageCountries].sort(byCodePoint);
  const regions = [...parts.coverageRegions].sort(byCodePoint);
  const upstream = [...new Set(parts.upstreamVersionIds)].sort(byCodePoint);
  const box = parts.bboxWest === null || parts.bboxSouth === null || parts.bboxEast === null || parts.bboxNorth === null
    ? null : { west: parts.bboxWest, south: parts.bboxSouth, east: parts.bboxEast, north: parts.bboxNorth };
  const coverageDeclared = countries.length > 0 || regions.length > 0 || parts.bboxWest !== null;
  const hashed = {
    title: parts.title, content: parts.content, evidenceStatus: parts.evidenceStatus, origin: parts.origin, provenance: provenanceAsHashed(parts.provenance),
    specialties: [...parts.specialties], missionContexts: [...parts.missionContexts], requiredPermission: parts.requiredPermission,
    sourcePublishedAt: iso(parts.sourcePublishedAt), expiresAt: iso(parts.expiresAt), effectiveFrom: iso(parts.effectiveFrom), effectiveTo: iso(parts.effectiveTo),
    ...(parts.attribution ? { attribution: parts.attribution } : {}),
    ...(coverageDeclared ? { coverage: { countryCodes: countries, regionCodes: regions, boundingBox: box } } : {}),
    ...(upstream.length ? { upstreamVersionIds: upstream } : {}),
  };
  return createHash("sha256").update(JSON.stringify(hashed)).digest("hex");
}

/** Whether the stored checksum is the one these stored columns produce. */
export function dataCenterVersionChecksumMatches(parts: VersionChecksumParts, stored: string): boolean {
  return computeDataCenterVersionChecksum(parts) === stored;
}
