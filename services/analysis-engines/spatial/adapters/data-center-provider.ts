import { DataCenterError, type DataCenterActor } from "@/services/data-center/contracts";
import { discoverDataCenterVersions, type DataCenterDiscoveryRequest, type DataCenterDiscoveryResult } from "@/services/data-center/discovery";
import { readDataCenterVersionContent } from "@/services/data-center/version-content";
import { DC_VERSION_SELECTION_POLICY } from "@/services/data-center/version-selection";
import {
  DataCenterProviderError, type DataCenterContentOutcome, type DataCenterDiscovery, type DataCenterProviderErrorKind, type DataCenterSelection, type SpatialDataCenterPort,
} from "../data-center-port";

/**
 * The Data Center provider of the Spatial Engine: the adapter behind `SpatialDataCenterPort`.
 *
 * It reaches the Data Center only through the two read services the Data Center offers the engines, `discoverDataCenterVersions` and
 * `readDataCenterVersionContent`. It never reads a Data Center table, never imports the database layer or Prisma, and has no access
 * policy of its own: those services apply the Data Center's existing policy (administrators, organization membership and permissions,
 * robot grants, specialty and mission context) to the actor given here, so the engine sees exactly what retrieval would show that actor.
 *
 * What the engine is told never depends on why a version is out of reach. A version that is forbidden, hidden, unpublished, superseded,
 * expired, archived, not yet effective, or does not exist, and a robot that holds no grant at all, are all answered as "not available",
 * in one and the same shape, so the answer cannot be used to learn that a hidden version exists.
 *
 * The adapter reads no clock and writes nothing: no usage record, no audit entry (a permanent record of what a finished run used belongs
 * with the run record). The instant it is given is only what the Data Center states freshness at and defaults `asOf` to.
 */
export interface DataCenterProviderOptions {
  /** Who is asking. Passed to the Data Center unchanged; the Data Center decides what this actor may see. */
  actor: DataCenterActor;
  now: Date;
  /** The specialty or mission context a restricted version names; without them only unrestricted versions are visible, as in retrieval. */
  specialty?: string;
  missionContext?: string;
}

const CONNECTIVITY_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EPIPE"]);
const CONNECTIVITY_MESSAGE = /can't reach database|timed out|timeout|connection (?:terminated|closed|refused)/i;
/** The shape of a validator's code, so that nothing but a code ever reaches a gap. */
const VALIDATOR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

const stringField = (error: unknown, name: "code" | "name" | "message"): string => {
  const value = typeof error === "object" && error !== null ? (error as Record<string, unknown>)[name] : undefined;
  return typeof value === "string" ? value : "";
};

/** A refusal by the Data Center's access policy (403) or a missing version (404): both are told to the engine as "not available". */
const isUnavailableToActor = (error: unknown): boolean => error instanceof DataCenterError && (error.status === 403 || error.status === 404);

/** The Data Center could not be asked. Only the kind travels; the original error, which may name hosts or relations, stays in `cause`. */
function toProviderError(error: unknown): DataCenterProviderError {
  if (error instanceof DataCenterProviderError) return error;
  const unreachable = CONNECTIVITY_CODES.has(stringField(error, "code")) || stringField(error, "name") === "PrismaClientInitializationError"
    || (error instanceof DataCenterError && error.status === 503) || CONNECTIVITY_MESSAGE.test(stringField(error, "message"));
  const kind: DataCenterProviderErrorKind = unreachable ? "UNAVAILABLE" : "UNKNOWN";
  return new DataCenterProviderError(kind, { cause: error });
}

const nothingAvailable = (selection: DataCenterSelection, now: Date): DataCenterDiscovery => selection.kind === "EXACT"
  ? { mode: "EXACT", policy: "exact-version", asOf: null, asOfExplicit: false, status: "NOT_AVAILABLE", selected: null, candidates: [], truncated: false, notInForce: [] }
  : {
    mode: "BY_TYPE", policy: DC_VERSION_SELECTION_POLICY, asOf: selection.asOf ?? now.toISOString(), asOfExplicit: selection.asOf !== undefined,
    status: "NOT_AVAILABLE", selected: null, candidates: [], truncated: false, notInForce: [],
  };

function discoveryRequestOf(selection: DataCenterSelection, context: { specialty?: string; missionContext?: string }): DataCenterDiscoveryRequest {
  if (selection.kind === "EXACT") return { versionIds: [selection.versionId], ...context };
  return {
    typeKeys: [selection.typeKey],
    ...(selection.asOf === undefined ? {} : { asOf: selection.asOf }),
    ...(selection.geography === undefined ? {} : { geography: selection.geography }),
    ...context,
  };
}

function fromDiscovery(result: DataCenterDiscoveryResult): DataCenterDiscovery {
  const candidates = result.candidates.map((entry) => entry.reference);
  // An exact version is chosen by the caller, so the Data Center reports none as selected: the version read back is the one.
  const selected = result.mode === "EXACT" ? (candidates[0] ?? null) : (result.selected?.reference ?? null);
  return {
    mode: result.mode, policy: result.policy, asOf: result.asOf, asOfExplicit: result.asOfExplicit, status: result.status, selected, candidates,
    truncated: result.truncated, notInForce: result.notInForce.map((entry) => ({ versionId: entry.versionId, reason: entry.reason })),
  };
}

/** The outcome of a read the Data Center refused or could not complete: an expected state is an outcome; anything else means it could not be asked. */
function outcomeOfReadError(error: unknown): Exclude<DataCenterContentOutcome, { status: "OK" }> {
  if (error instanceof DataCenterError) {
    if (error.code === "VERSION_CHECKSUM_MISMATCH") return { status: "INTEGRITY_FAILED" };
    if (error.code === "EXPECTED_CHECKSUM_MISMATCH") return { status: "PIN_CONTENT_CHANGED" };
    if (error.code === "CONTENT_NOT_SPATIAL") return { status: "NOT_SPATIAL" };
    if (isUnavailableToActor(error)) return { status: "NOT_AVAILABLE" };
    // The Data Center refuses content it validated as not GeoJSON in WGS84 with 422 and the validator's own code.
    if (error.status === 422) return { status: "CONTENT_INVALID", code: VALIDATOR_CODE.test(error.code) ? error.code : "INVALID_GEOJSON" };
  }
  throw toProviderError(error);
}

export function createDataCenterProvider(options: DataCenterProviderOptions): SpatialDataCenterPort {
  const { actor, now } = options;
  const context = {
    ...(options.specialty === undefined ? {} : { specialty: options.specialty }),
    ...(options.missionContext === undefined ? {} : { missionContext: options.missionContext }),
  };
  return {
    async discover(selection) {
      try {
        return fromDiscovery(await discoverDataCenterVersions(discoveryRequestOf(selection, context), actor, { now }));
      } catch (error) {
        if (isUnavailableToActor(error)) return nothingAvailable(selection, now);
        throw toProviderError(error);
      }
    },
    async readContent({ versionId, expectedChecksum }) {
      try {
        const content = await readDataCenterVersionContent({ versionId, ...(expectedChecksum === undefined ? {} : { expectedChecksum }), require: "GEOJSON", ...context }, actor, { now });
        if (content.features === null) return { status: "NOT_SPATIAL" };
        return { status: "OK", reference: content.reference, features: content.features, checksum: content.integrity.checksum };
      } catch (error) {
        return outcomeOfReadError(error);
      }
    },
  };
}
