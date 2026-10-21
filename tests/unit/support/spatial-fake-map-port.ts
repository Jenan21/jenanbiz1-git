import type { SpatialLocation } from "@/services/analysis-engines/spatial/contracts";
import type { MapDescription } from "@/services/analysis-engines/spatial/map-contract";
import type {
  DatasetMeasureRequest, DatasetMeasureResult, GeometryCheck, MapCountRequest, MapCountResult, MapDescribeRequest, MapLocateRequest, MapLocateResult, MapNearestRequest, MapNearestResult, SpatialMapPort,
  SpatialMeasureRequest, SpatialMeasureResult,
} from "@/services/analysis-engines/spatial/map-port";
import type { SpatialBackendCapabilities } from "@/services/analysis-engines/spatial/ports";
import { realDescription, RELEASE_ID } from "./spatial-map-fixtures";

/** The world the fake port describes: the numbers are the ones the real Saudi release returned for Riyadh. */
export const RIYADH_REGION = { id: "9c4173b3-6ad9-4a51-8ae0-e9bb6ec39cd4", label: "Riyadh Region" };
export const RIYADH_GOVERNORATE = { id: "87d3b841-e6bd-4791-842a-1ce214c213ca", label: "Riyadh" };

export const healthyCapabilities = (over: Partial<SpatialBackendCapabilities> = {}): SpatialBackendCapabilities => ({
  backend: "POSTGIS", placement: "DEDICATED_CONNECTION", readOnly: true, postgis: "3.5.2", geos: "3.9.0-CAPI-1.16.2", proj: "7.2.1", mapSchemaReachable: true, roleCanWrite: false, contractProblems: [], ...over,
});

export const unit = (over: Partial<MapLocateResult["levels"][string]["units"][number]> = {}) => ({
  id: RIYADH_REGION.id, label: RIYADH_REGION.label, coversAnchor: true, coversTarget: true, edgeDistanceMeters: 82_849.5, ...over,
});
export const riyadhLocate = (over: Partial<MapLocateResult> = {}): MapLocateResult => ({
  anchor: { longitude: 46.6753, latitude: 24.7136 },
  coverage: { status: "FULL", fraction: 1 },
  levels: {
    regions: { units: [unit()], truncated: false },
    governorates: { units: [unit({ id: RIYADH_GOVERNORATE.id, label: RIYADH_GOVERNORATE.label, edgeDistanceMeters: 6059.5 })], truncated: false },
  },
  ...over,
});
export const outsideLocate = (): MapLocateResult => ({
  anchor: { longitude: 55.2708, latitude: 25.2048 }, coverage: { status: "NONE", fraction: 0 },
  levels: { regions: { units: [], truncated: false }, governorates: { units: [], truncated: false } },
});

const TILE = "12/2578/1757";
export const nearestPlace = (over: Partial<MapNearestResult> = {}): MapNearestResult => ({
  searchedMeters: 3000, ringMeters: 3000,
  matches: [{ id: "579dc30f-2d09-4994-a33e-bdf671781853", label: "الورود", kind: "neighbourhood", sourceId: `places:neighbourhood:${TILE}/7`, distanceMeters: 1236.2 }],
  unrecognized: { count: 0, nearestMeters: null }, ...over,
});
export const nothingNearby = (searchedMeters = 5000): MapNearestResult => ({ searchedMeters, ringMeters: null, matches: [], unrecognized: { count: 0, nearestMeters: null } });

type Reply<Request, Result> = Result | Error | ((request: Request) => Result | Error);
export interface FakeBehaviour {
  capabilities?: Reply<void, SpatialBackendCapabilities>;
  describeMap?: Reply<MapDescribeRequest, MapDescription>;
  checkGeometries?: Reply<readonly SpatialLocation[], GeometryCheck[]>;
  locate?: Reply<MapLocateRequest, MapLocateResult>;
  nearest?: Reply<MapNearestRequest, MapNearestResult>;
  countFeatures?: Reply<MapCountRequest, MapCountResult>;
  measureDataset?: Reply<DatasetMeasureRequest, DatasetMeasureResult>;
  measureSpatial?: Reply<SpatialMeasureRequest, SpatialMeasureResult>;
}

/** A Map port that answers from a script and records every request, so analyses can be tested without a database. */
export class FakeMapPort implements SpatialMapPort {
  readonly calls: Array<{ method: string; request: unknown }> = [];
  constructor(private readonly behaviour: FakeBehaviour = {}) {}

  private answer<Request, Result>(method: string, request: Request, reply: Reply<Request, Result> | undefined, fallback: (request: Request) => Result): Result {
    this.calls.push({ method, request });
    const value = reply === undefined ? fallback(request) : typeof reply === "function" ? (reply as (request: Request) => Result | Error)(request) : reply;
    if (value instanceof Error) throw value;
    return value;
  }
  callsOf(method: string) { return this.calls.filter((call) => call.method === method); }

  async capabilities() { return this.answer<void, SpatialBackendCapabilities>("capabilities", undefined, this.behaviour.capabilities, () => healthyCapabilities()); }
  async describeMap(request: MapDescribeRequest) {
    return this.answer("describeMap", request, this.behaviour.describeMap, (asked) => {
      const description = realDescription();
      const known = new Map(description.layers.map((layer) => [layer.id, layer]));
      return { ...description, layers: asked.layers.map((id) => known.get(id) ?? { id, provenance: null, binding: null, hasFeatures: false }) };
    });
  }
  async checkGeometries(locations: readonly SpatialLocation[]) { return this.answer("checkGeometries", locations, this.behaviour.checkGeometries, (asked) => asked.map(() => ({ valid: true as const }))); }
  async locate(request: MapLocateRequest) {
    return this.answer("locate", request, this.behaviour.locate, (asked) => {
      const full = riyadhLocate();
      return { ...full, levels: Object.fromEntries(asked.levels.map((level) => [level, full.levels[level] ?? { units: [], truncated: false }])) };
    });
  }
  async nearest(request: MapNearestRequest) { return this.answer("nearest", request, this.behaviour.nearest, () => nearestPlace()); }
  async countFeatures(request: MapCountRequest) {
    return this.answer("countFeatures", request, this.behaviour.countFeatures, (asked) => ({
      radii: asked.radiiMeters.map((radiusMeters) => ({ radiusMeters, count: 0, unrecognized: 0 })),
    }));
  }
  async measureDataset(request: DatasetMeasureRequest) {
    return this.answer("measureDataset", request, this.behaviour.measureDataset, (asked) => ({
      valid: true, nearest: [], radii: asked.radiiMeters.map((radiusMeters) => ({ radiusMeters, count: 0, populationEstimate: null })),
    }));
  }
  async measureSpatial(request: SpatialMeasureRequest) {
    return this.answer("measureSpatial", request, this.behaviour.measureSpatial, (asked) => ({
      valid: true, truncated: false, unrecognized: 0, pointsOnly: true,
      radii: asked.radiiMeters.map((radiusMeters) => ({ radiusMeters, count: 0, areaKm2: Math.PI * (radiusMeters / 1000) ** 2 })),
      occupiedCells: 0, maxCellCount: 0, clusterCount: 0, largestCluster: 0, noiseCount: 0,
      intersects: 0, covers: 0, overlapKm2: 0, nearestMeters: null,
    }));
  }
}

export const PUBLISHED_RELEASE_ID = RELEASE_ID;
