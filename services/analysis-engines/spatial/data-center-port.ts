import type { DataCenterGeoFeature } from "@/services/data-center/contracts";
import type { DataCenterMapReference } from "@/services/data-center/map-contract";
import type { BoundingBox } from "./geometry-precheck";

/**
 * The engine's view of the Data Center: two read-only questions, discovery of published versions and the exact read of one of them. The
 * engine never reads a Data Center table; whatever sits behind this port (the adapter that calls the Data Center's approved services)
 * applies the Data Center's own access policy, and everything that comes back is plain data in the Data Center's own Map-contract
 * vocabulary (`DataCenterMapReference`): the Data Center stays the source of truth for rights, quality, source and publication.
 *
 * Expected states of the Data Center (nothing readable, no coverage, content that is not valid) are outcomes, not exceptions; an
 * exception means the Data Center could not be asked at all. Outcomes never say why a version is unavailable: a hidden version and a
 * version that does not exist give the same answer.
 */
export type DataCenterGeography = { countryCodes?: string[]; regionCodes?: string[]; boundingBox?: BoundingBox };

/** One dataset for one role: an exact version, or the preferred version of a type as of an instant. */
export type DataCenterSelection =
  | { kind: "EXACT"; versionId: string }
  | { kind: "BY_TYPE"; typeKey: string; asOf?: string; geography?: DataCenterGeography };

export const dataCenterDiscoveryStatuses = ["FOUND", "NOT_AVAILABLE", "NO_COVERAGE", "NOT_IN_FORCE", "TOO_MANY_CANDIDATES"] as const;
export type DataCenterDiscoveryStatus = typeof dataCenterDiscoveryStatuses[number];

export interface DataCenterDiscovery {
  mode: "EXACT" | "BY_TYPE";
  /** The policy that chose among versions (`dc-version-selection-v1`), or `exact-version` when nothing was chosen. */
  policy: string;
  /** The instant a selection by type was made as of; null for an exact version. */
  asOf: string | null;
  asOfExplicit: boolean;
  status: DataCenterDiscoveryStatus;
  /** The version chosen: the exact version, or the preferred of the versions in force. */
  selected: DataCenterMapReference | null;
  /** By type: the versions in force, the preferred first (including the selected one), up to the Data Center's listing limit. */
  candidates: DataCenterMapReference[];
  /** By type: more versions were in force than `candidates` lists. The selection is still the preferred of all of them. */
  truncated: boolean;
  /** By type: readable matches that were not in force as of the instant, with the reason. */
  notInForce: Array<{ versionId: string; reason: string }>;
}

export type DataCenterContentOutcome =
  | { status: "OK"; reference: DataCenterMapReference; features: DataCenterGeoFeature[]; checksum: string }
  | { status: "NOT_AVAILABLE" }
  | { status: "INTEGRITY_FAILED" }
  | { status: "PIN_CONTENT_CHANGED" }
  | { status: "NOT_SPATIAL" }
  | { status: "CONTENT_INVALID"; code: string };

export interface SpatialDataCenterPort {
  discover(selection: DataCenterSelection): Promise<DataCenterDiscovery>;
  /** The content of exactly one version. With `expectedChecksum`, a version whose checksum differs is not read. */
  readContent(request: { versionId: string; expectedChecksum?: string }): Promise<DataCenterContentOutcome>;
}

export const dataCenterProviderErrorKinds = ["UNAVAILABLE", "UNKNOWN"] as const;
export type DataCenterProviderErrorKind = typeof dataCenterProviderErrorKinds[number];
/** The Data Center could not be asked (not that it said no). Only the kind travels; the original error stays in `cause`. */
export class DataCenterProviderError extends Error {
  constructor(readonly kind: DataCenterProviderErrorKind, options?: { cause?: unknown }) {
    super(`The Data Center could not be asked (${kind})`, options);
    this.name = "DataCenterProviderError";
  }
}
