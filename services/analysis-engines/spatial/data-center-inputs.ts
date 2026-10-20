import type { EngineInput } from "../shared/contracts";
import { compareText } from "../shared/canonical";
import { dataCenterFreshness, type DataCenterMapReference } from "@/services/data-center/map-contract";

/**
 * Describes a published Data Center version, as the engine uses it, in the engine's own input vocabulary. The Data Center is the source of
 * truth for rights, quality, source and publication, so everything is taken from its reference exactly as it states it. Nothing is
 * inferred or improved: an undeclared license class stays undeclared (so export is denied), quality that was never recorded stays
 * unavailable, and completeness, which the Data Center does not record, is unknown.
 */
export const dataCenterInputId = (versionId: string) => `dc:${versionId}`;

const clip = (value: string, max: number) => (value.length <= max ? value : `${value.slice(0, max - 1)}…`);
const earlier = (first: string, second: string) => (Date.parse(first) <= Date.parse(second) ? first : second);

/** How the version was chosen, kept with the input so a run can be explained and replayed. Absent for an exact pin. */
export interface DataCenterSelectionNote { policy: string; asOf: string; typeKey: string }

export interface DataCenterInputArgs {
  reference: DataCenterMapReference;
  /** What the dataset is used for in this run (`poi:hospital`), sorted by the builder. */
  roles: readonly string[];
  /** The instant freshness is judged at: the run's own, never "now". */
  evaluatedAt: string;
  selection?: DataCenterSelectionNote;
}

function freshnessOf(reference: DataCenterMapReference, evaluatedAt: string): EngineInput["freshness"] {
  const { freshness } = reference;
  const bounds = [freshness.expiresAt, freshness.effectiveTo].filter((value): value is string => value !== null);
  const status = dataCenterFreshness({
    sourcePublishedAt: freshness.sourcePublishedAt === null ? null : new Date(freshness.sourcePublishedAt), freshnessDays: freshness.freshnessDays,
    expiresAt: freshness.expiresAt === null ? null : new Date(freshness.expiresAt), effectiveTo: freshness.effectiveTo === null ? null : new Date(freshness.effectiveTo),
  }, new Date(evaluatedAt));
  // The version stops being usable at the earlier of its expiry and the end of its effective period.
  return { status, sourcePublishedAt: freshness.sourcePublishedAt, freshnessDays: freshness.freshnessDays, expiresAt: bounds.length === 0 ? null : bounds.reduce(earlier) };
}

function qualityOf(reference: DataCenterMapReference): EngineInput["quality"] {
  const { quality } = reference;
  if (quality.status === "UNAVAILABLE") return { status: "UNAVAILABLE" };
  const assessment = { method: clip(quality.method, 500), methodVersion: clip(quality.methodVersion, 500), measuredAt: quality.measuredAt, explanation: clip(quality.explanation, 4000) };
  return quality.status === "MEASURED" ? { status: "MEASURED", score: quality.score, ...assessment } : { status: "INSUFFICIENT_DATA", ...assessment };
}

export function buildDataCenterInput(args: DataCenterInputArgs): EngineInput {
  const { reference, evaluatedAt } = args;
  const { source, rights } = reference;
  const limitations = ["The Data Center does not record whether a dataset is complete, so completeness is treated as unknown."];
  if (args.selection) limitations.push(`Selected by the policy ${args.selection.policy} among the published datasets of type ${args.selection.typeKey}, as of ${args.selection.asOf}.`);
  return {
    id: dataCenterInputId(reference.version.versionId),
    roles: [...new Set(args.roles)].sort(compareText),
    kind: "DATA_CENTER_VERSION",
    governance: "DC_PUBLISHED",
    ref: { system: "DATA_CENTER", id: reference.version.versionId, version: reference.version.number, label: clip(reference.dataset.title, 500) },
    checksum: { algorithm: "SHA-256", value: reference.version.checksum.value },
    source: { name: clip(source.name, 500), organization: source.organization === null ? null : clip(source.organization, 500), url: source.url !== null && source.url.length <= 2000 ? source.url : null },
    ownership: reference.ownership.ownership,
    license: clip(rights.license, 500),
    licenseClass: rights.licenseClass,
    usagePolicy: clip(rights.usagePolicy, 4000),
    attribution: { text: rights.attribution.text === null ? null : clip(rights.attribution.text, 4000), required: rights.attribution.required },
    allowExport: rights.allowExport,
    completeness: "UNKNOWN",
    evidenceStatus: reference.version.evidenceStatus,
    quality: qualityOf(reference),
    freshness: freshnessOf(reference, evaluatedAt),
    coverage: reference.coverage === null ? null : { crs: "WGS84", countryCodes: [...reference.coverage.countryCodes], regionCodes: [...reference.coverage.regionCodes], boundingBox: reference.coverage.boundingBox },
    limitations: [...new Set(limitations)].sort(compareText),
  };
}
