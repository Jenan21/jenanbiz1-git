import type { DataCenterGeoFeature } from "@/services/data-center/contracts";
import { MAP_REFERENCE_CONTRACT, mapReferenceSchema, type DataCenterMapReference } from "@/services/data-center/map-contract";
import type { DataCenterContentOutcome, DataCenterDiscovery, DataCenterSelection, SpatialDataCenterPort } from "@/services/analysis-engines/spatial/data-center-port";

/** A published Data Center version as the Data Center's own Map contract states it, valid by construction (it is parsed by the contract's schema). */
export const DC_VERSION_ID = "cmvgpaznv0081j0t6fpqxjtqv";
export const DC_OTHER_VERSION_ID = "cmvgpb3sn00eaj0t6otj28tiz";
export const DC_SHA = "a1b2c3d4".repeat(8);
export const DC_OTHER_SHA = "0f9e8d7c".repeat(8);

type Section<K extends keyof DataCenterMapReference> = Partial<DataCenterMapReference[K]>;
export interface ReferenceOverrides {
  dataset?: Section<"dataset">; version?: Partial<Omit<DataCenterMapReference["version"], "checksum">> & { checksum?: string }; source?: Section<"source">; ownership?: Section<"ownership">;
  rights?: Partial<Omit<DataCenterMapReference["rights"], "attribution">> & { attribution?: Partial<DataCenterMapReference["rights"]["attribution"]> };
  coverage?: DataCenterMapReference["coverage"]; quality?: DataCenterMapReference["quality"]; freshness?: Section<"freshness">; publication?: Section<"publication">;
}
export function makeReference(over: ReferenceOverrides = {}): DataCenterMapReference {
  const { checksum, ...version } = over.version ?? {};
  return mapReferenceSchema.parse({
    contract: MAP_REFERENCE_CONTRACT, resolvedAt: "2026-10-20T12:00:00.000Z",
    dataset: { itemId: "item-1", title: "Riyadh hospitals", typeKey: "geojson", layer: "DATA", ...over.dataset },
    version: { versionId: DC_VERSION_ID, number: 3, checksum: { algorithm: "SHA-256", value: checksum ?? DC_SHA }, createdAt: "2026-06-01T08:00:00.000Z", evidenceStatus: "ESTIMATED", origin: "HUMAN", upstreamVersionIds: [], ...version },
    source: { sourceId: "source-1", name: "Ministry of Health register", kind: "OFFICIAL", scope: "PLATFORM", organization: "Ministry of Health", url: "https://data.example.test/hospitals", ...over.source },
    ownership: { ownership: "THIRD_PARTY", owner: "Ministry of Health", ...over.ownership },
    rights: {
      license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", usagePolicy: "Share-alike; credit required", allowRetrieval: true, allowExport: true, ...over.rights,
      attribution: { text: "© Ministry of Health, 2026", required: true, level: "SOURCE", ...over.rights?.attribution },
    },
    coverage: over.coverage === undefined ? { crs: "WGS84", countryCodes: ["SA"], regionCodes: ["SA-01"], boundingBox: { west: 46.0, south: 24.3, east: 47.3, north: 25.1 } } : over.coverage,
    quality: over.quality ?? { status: "MEASURED", score: 0.82, method: "register-check", methodVersion: "2", measuredAt: "2026-09-01T00:00:00.000Z", explanation: "Compared with the official register" },
    confidence: { score: 62, policyVersion: "dc-confidence-v2-seven-factors", evaluatedAt: "2026-10-20T12:00:00.000Z", heuristic: true },
    freshness: { status: "FRESH", freshnessDays: 365, sourcePublishedAt: "2026-05-15T00:00:00.000Z", expiresAt: null, effectiveFrom: null, effectiveTo: null, ...over.freshness },
    publication: { status: "PUBLISHED", publishedVersion: 3, publishedAt: "2026-06-02T09:00:00.000Z", ...over.publication },
  });
}

export const geoFeature = (index: number, over: Partial<DataCenterGeoFeature> = {}): DataCenterGeoFeature => ({
  type: "Feature", properties: { name: `Hospital ${index}` }, geometry: { type: "Point", coordinates: [46.6 + index * 0.01, 24.7] }, ...over,
});
export const geoFeatures = (count = 3) => Array.from({ length: count }, (_, index) => geoFeature(index));

export const foundDiscovery = (reference: DataCenterMapReference, over: Partial<DataCenterDiscovery> = {}): DataCenterDiscovery => ({
  mode: "EXACT", policy: "exact-version", asOf: null, asOfExplicit: false, status: "FOUND", selected: reference, candidates: [reference], notInForce: [], ...over,
});
export const emptyDiscovery = (status: DataCenterDiscovery["status"], over: Partial<DataCenterDiscovery> = {}): DataCenterDiscovery => ({
  mode: "BY_TYPE", policy: "dc-version-selection-v1", asOf: "2026-10-20T12:00:00.000Z", asOfExplicit: false, status, selected: null, candidates: [], notInForce: [], ...over,
});
export const okContent = (reference: DataCenterMapReference, features = geoFeatures(), over: Partial<Extract<DataCenterContentOutcome, { status: "OK" }>> = {}): DataCenterContentOutcome => ({
  status: "OK", reference, features, checksum: reference.version.checksum.value, ...over,
});

type Reply<Request, Result> = Result | Error | ((request: Request) => Result | Error);
export interface FakeDataCenterBehaviour {
  discover?: Reply<DataCenterSelection, DataCenterDiscovery>;
  readContent?: Reply<{ versionId: string; expectedChecksum?: string }, DataCenterContentOutcome>;
}
/** A Data Center port that answers from a script and records every request, so resolution can be tested without a database. */
export class FakeDataCenterPort implements SpatialDataCenterPort {
  readonly calls: Array<{ method: "discover" | "readContent"; request: unknown }> = [];
  constructor(private readonly behaviour: FakeDataCenterBehaviour = {}) {}
  private answer<Request, Result>(method: "discover" | "readContent", request: Request, reply: Reply<Request, Result> | undefined, fallback: (request: Request) => Result): Result {
    this.calls.push({ method, request });
    const value = reply === undefined ? fallback(request) : typeof reply === "function" ? (reply as (request: Request) => Result | Error)(request) : reply;
    if (value instanceof Error) throw value;
    return value;
  }
  callsOf(method: "discover" | "readContent") { return this.calls.filter((call) => call.method === method); }
  async discover(selection: DataCenterSelection) {
    return this.answer("discover", selection, this.behaviour.discover, (asked) => {
      const reference = makeReference();
      return asked.kind === "EXACT" ? foundDiscovery(makeReference({ version: { versionId: asked.versionId } })) : foundDiscovery(reference, { mode: "BY_TYPE", policy: "dc-version-selection-v1", asOf: asked.asOf ?? "2026-10-20T12:00:00.000Z", asOfExplicit: asked.asOf !== undefined });
    });
  }
  async readContent(request: { versionId: string; expectedChecksum?: string }) {
    return this.answer("readContent", request, this.behaviour.readContent, (asked) => okContent(makeReference({ version: { versionId: asked.versionId } })));
  }
}
