import { compareText } from "../shared/canonical";
import type { EngineInput } from "../shared/contracts";
import { countryCodeSchema } from "@/services/data-center/contracts";
import { mapFreshness, mapFreshnessDays, mapLayerLabel, type MapBoundaryFacts, type MapProvenance, type MapReleaseFacts } from "./map-contract";

/**
 * Describes a Map layer, as the engine uses it, in the engine's own input vocabulary. Everything is taken from what the Map recorded and
 * nothing is inferred or improved: a license class is never guessed from a license text, an undeclared quality stays undeclared, and a
 * source the Map does not describe is said not to be described.
 */
export const mapInputId = (releaseId: string, layerKey: string) => `map:${releaseId}:${layerKey}`;

const clip = (value: string, max: number) => (value.length <= max ? value : `${value.slice(0, max - 1)}…`);
const sortedUnique = (values: readonly string[]) => [...new Set(values)].sort(compareText);
const labelOf = (layerKey: string, release: MapReleaseFacts) => clip(`${mapLayerLabel(layerKey)} (Map release ${release.version})`, 500);

export interface MapInputArgs {
  layerKey: string;
  /** What the layer is used for in this run (`admin:region`, `place:locality`), sorted by the builder. */
  roles: readonly string[];
  release: MapReleaseFacts;
  boundary: MapBoundaryFacts | null;
  /** The reviewed provenance the release lists for this layer, or null when it lists none. */
  provenance: MapProvenance | null;
  registered: boolean;
  evaluatedAt: string;
}

function coverageOf(boundary: MapBoundaryFacts | null): EngineInput["coverage"] {
  const countryCodes = boundary?.countryCode !== null && boundary?.countryCode !== undefined && countryCodeSchema.safeParse(boundary.countryCode).success ? [boundary.countryCode] : [];
  const boundingBox = boundary?.boundingBox ?? null;
  return countryCodes.length === 0 && boundingBox === null ? null : { crs: "WGS84", countryCodes, regionCodes: [], boundingBox };
}

function build(args: MapInputArgs, options: { name: string; checksum: string | null; boundaryLimitations: boolean }): EngineInput {
  const { layerKey, release, boundary, provenance, registered, evaluatedAt } = args;
  const freshnessDays = mapFreshnessDays(layerKey);
  const sourceDate = provenance?.sourceDate ?? release.sourceDate;
  const limitations: string[] = [`The freshness period of ${freshnessDays} days is an engine default; the Map declares none.`];
  if (provenance === null) limitations.push("The release lists no reviewed provenance for this layer; the source and license of the release are shown instead.");
  if (registered && !options.boundaryLimitations) limitations.push("No content checksum is recorded for this layer; a published Map release is not modified.");
  if (options.boundaryLimitations) {
    limitations.push("The positional accuracy of the boundary data is not declared.");
    if (boundary !== null && !boundary.official) {
      limitations.push(clip(`Unofficial boundary: ${boundary.authorityText}.`, 500));
      if (boundary.notice !== null) limitations.push(clip(boundary.notice, 500));
    }
  }
  const attributionText = provenance === null ? null : clip(provenance.attribution, 4000);
  return {
    id: mapInputId(release.id, layerKey),
    roles: sortedUnique(args.roles),
    kind: "MAP_LAYER",
    governance: registered ? "MAP_REGISTERED" : "MAP_UNREGISTERED",
    ref: { system: "JENAN_MAP", id: `${release.id}/${layerKey}`, version: null, label: labelOf(layerKey, release) },
    checksum: options.checksum === null ? null : { algorithm: "SHA-256", value: options.checksum },
    source: provenance === null
      ? { name: clip(options.name, 500), organization: null, url: null }
      : { name: clip(provenance.source, 500), organization: clip(provenance.organization, 500), url: provenance.url.length <= 2000 ? provenance.url : null },
    ownership: "THIRD_PARTY",
    license: clip(provenance?.license ?? release.license, 500),
    // The Map's license text is recorded as given. Whether it permits redistribution is a decision for the owner, so the class stays undeclared
    // and export stays denied until it is declared.
    licenseClass: null,
    usagePolicy: null,
    attribution: { text: attributionText, required: attributionText !== null },
    allowExport: false,
    completeness: "UNKNOWN",
    evidenceStatus: null,
    quality: { status: "UNAVAILABLE" },
    freshness: mapFreshness(sourceDate, freshnessDays, evaluatedAt),
    coverage: coverageOf(boundary),
    limitations: sortedUnique(limitations),
  };
}

/** A layer of features or polygons (`regions`, `governorates`, `places`). */
export function buildMapLayerInput(args: MapInputArgs): EngineInput {
  const isAdministrative = args.layerKey === "regions" || args.layerKey === "governorates";
  return build(args, { name: args.release.source, checksum: null, boundaryLimitations: isAdministrative });
}

/** The national boundary of a release: the extent every other Map layer of the release is judged against. */
export function buildMapBoundaryInput(args: Omit<MapInputArgs, "layerKey" | "provenance"> & { boundary: MapBoundaryFacts }): EngineInput {
  const { boundary } = args;
  const checksum = boundary.sha256 !== null && /^[a-f0-9]{64}$/.test(boundary.sha256) ? boundary.sha256 : null;
  return build({ ...args, layerKey: "boundary", provenance: boundary.provenance }, { name: boundary.source, checksum, boundaryLimitations: true });
}
