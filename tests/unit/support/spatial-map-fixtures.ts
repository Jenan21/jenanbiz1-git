import {
  interpretMapBoundary, type MapBoundaryFacts, type MapDescription, type MapLayerFacts, type MapProvenance, type MapReleaseFacts, type MapRuntimeFacts, type RawMapBoundaryRow,
} from "@/services/analysis-engines/spatial/map-contract";

/** Records shaped exactly like the Map's real ones (the keys, types and wording of the published Saudi release), used as unit-test input. */
export const RELEASE_ID = "b3c4b6ff-7cee-4b42-95d3-c3683cf88a34";
export const BOUNDARY_ID = "4b0ae84a-69b8-4c3c-8ebb-9f46ef2a88d8";

export const osmProvenance: MapProvenance = {
  url: "https://build.protomaps.com/20261017.pmtiles", source: "Protomaps basemap build (OpenStreetMap + Natural Earth) build 20261017", license: "ODbL-1.0",
  importedAt: "2026-10-18T15:31:56.005Z", sourceDate: "2026-10-17T04:00:00.000Z",
  attribution: "© OpenStreetMap contributors (ODbL 1.0; https://www.openstreetmap.org/copyright; https://opendatacommons.org/licenses/odbl/1.0/)",
  organization: "OpenStreetMap contributors / Protomaps",
};
export const regionsProvenance: MapProvenance = {
  url: "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/SAU/ADM1/geoBoundaries-SAU-ADM1.geojson", source: "geoBoundaries gbOpen SAU ADM1 SAU-ADM1-25081817",
  license: "ODbL-1.0", importedAt: "2026-10-18T15:31:56.005Z", sourceDate: "2017-01-01T00:00:00.000Z",
  attribution: "geoBoundaries / William & Mary (product CC BY 4.0; https://www.geoboundaries.org; https://creativecommons.org/licenses/by/4.0/); upstream OpenStreetMap, Wambacher, ODbL-1.0; represented year precision; upstream simplified geometry",
  organization: "geoBoundaries / William & Mary; upstream: OpenStreetMap, Wambacher",
};
export const governoratesProvenance: MapProvenance = {
  ...regionsProvenance, url: "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/SAU/ADM2/geoBoundaries-SAU-ADM2.geojson", source: "geoBoundaries gbOpen SAU ADM2 SAU-ADM2-3984122",
};
export const adm0Provenance: MapProvenance = {
  ...regionsProvenance, url: "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/SAU/ADM0/geoBoundaries-SAU-ADM0.geojson", source: "geoBoundaries gbOpen SAU ADM0 SAU-ADM0-44563762",
};
export const BOUNDARY_SHA256 = "f685cc6220a4629ecd4ca39e0fd350845e25faefd5bea33f63cced18a407dd63";
export const AUTHORITY_TEXT = "geoBoundaries open data — not a Saudi government authority";
export const NOTICE_TEXT = "Unofficial boundaries — حدود غير رسمية";

export const realCoverage = {
  notice: NOTICE_TEXT, provenance: adm0Provenance, unofficial: true, countryCode: "SA", authoritative: false, coverageBasis: "geoBoundaries-ADM0", boundarySha256: BOUNDARY_SHA256,
  boundarySource: "geoBoundaries gbOpen SAU ADM0 SAU-ADM0-44563762", coverageVerified: true, boundaryAuthority: AUTHORITY_TEXT,
  layers: [
    { id: "base", provenance: osmProvenance }, { id: "roads", provenance: osmProvenance }, { id: "places", provenance: osmProvenance }, { id: "pois", provenance: osmProvenance },
    { id: "buildings", provenance: osmProvenance }, { id: "regions", provenance: regionsProvenance }, { id: "governorates", provenance: governoratesProvenance },
  ],
};
export const realBoundaryRow = (over: Partial<RawMapBoundaryRow> = {}): RawMapBoundaryRow => ({
  id: BOUNDARY_ID, authority: AUTHORITY_TEXT, source: "geoBoundaries gbOpen SAU ADM0 SAU-ADM0-44563762", coverage: realCoverage,
  west: 34.49440549999996, south: 16.379562200000038, east: 55.66669850000001, north: 32.154337700000035, ...over,
});

export const publishedRuntime: MapRuntimeFacts = { status: "enabled", publishedReleaseId: RELEASE_ID };
export const publishedRelease: MapReleaseFacts = {
  id: RELEASE_ID, version: "provisionA-75d7a657", status: "Published", source: "Protomaps basemap build (OpenStreetMap + Natural Earth) build 20261017", sourceDate: "2026-10-17T04:00:00.000Z",
  license: "ODbL-1.0", publishedAt: "2026-10-19T08:00:00.000Z",
};
export const realBoundary = (): MapBoundaryFacts => interpretMapBoundary(realBoundaryRow());
const binding = (status: "ready" | "warning" | "unavailable" = "ready", enabled = true) => ({ enabled, status, visibility: "public" });

/** The published release as the real database describes it: places and regions are bound for display, the governorates are data-only. */
export function realDescription(over: Partial<MapDescription> = {}): MapDescription {
  const boundary = realBoundary();
  const layers: MapLayerFacts[] = [
    { id: "regions", provenance: boundary.layerProvenance.regions ?? null, binding: binding(), hasFeatures: true },
    { id: "governorates", provenance: boundary.layerProvenance.governorates ?? null, binding: null, hasFeatures: true },
    { id: "places", provenance: boundary.layerProvenance.places ?? null, binding: binding(), hasFeatures: true },
  ];
  return { runtime: publishedRuntime, release: publishedRelease, boundary, layers, ...over };
}
