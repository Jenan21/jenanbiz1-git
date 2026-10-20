/**
 * Constants of the Spatial Analysis Engine v1. Everything a caller can ask for is bounded here, so the cost of a request is
 * known before any data is read.
 */
export const SPATIAL_ENGINE_KEY = "spatial";
export const SPATIAL_ENGINE_VERSION = "1.0.0-m1";
export const SPATIAL_REQUEST_CONTRACT = "jenan.spatial-analysis.request/v1";
export const SPATIAL_RESULT_CONTRACT = "jenan.spatial-analysis.result/v1";

/**
 * The six analyses of v1. The engine produces documented spatial facts and measurements only: it never judges a location
 * and never recommends an action. Interpretation belongs to the later engines, and the final decision to Risk & Decision.
 */
export const spatialAnalyses = ["LOCATION_CONTEXT", "PROXIMITY", "CATCHMENT", "DENSITY", "CONSTRAINT_SCREENING", "SITE_COMPARISON"] as const;
export type SpatialAnalysis = typeof spatialAnalyses[number];

/** Left out of v1 on purpose; the result lists them so nobody mistakes a straight-line distance for a travel distance. */
export const spatialExclusions = ["ROUTE_TRAVEL_TIME", "DRIVING_DISTANCE", "TERRAIN", "GEOCODING", "AI_RECOMMENDATION", "BUSINESS_RECOMMENDATION"] as const;

/** The radii Jenan PRO analyses by default: 500 m, 1 km, 3 km and 5 km. Any other radius needs an explicit request, up to the maximum. */
export const DEFAULT_RADII_METERS = [500, 1000, 3000, 5000] as const;
export const MIN_RADIUS_METERS = 100;
export const MAX_RADIUS_METERS = 50_000;
export const MAX_RADII = 8;
/** Rings searched, in order, when looking for the nearest features. The search stops at the first ring that holds enough features. */
export const SEARCH_LADDER_METERS = [500, 1000, 3000, 5000, 10_000, 25_000, 50_000] as const;
export const DEFAULT_MAX_SEARCH_METERS = 5000;
export const DEFAULT_NEAREST_COUNT = 3;
export const MAX_NEAREST_COUNT = 20;
export const MAX_ROLES = 32;
export const MAX_CANDIDATES = 20;
export const MAX_AOI_VERTICES = 2000;
export const MAX_AOI_RINGS = 100;
export const MAX_AOI_PARTS = 100;
/** Ceiling for an area of interest; measured with the spherical pre-check (accurate to about half a percent). */
export const MAX_AOI_AREA_KM2 = 250_000;
export const DEFAULT_CLUSTER = { epsMeters: 500, minPoints: 5 } as const;
export const DEFAULT_GRID = { cellMeters: 500 } as const;
export const PRIMARY_TARGET_ID = "primary";

/** Budget in cost units. Chosen by the server; a caller can neither raise nor lower it. */
export const DEFAULT_BUDGET_UNITS = 1000;
export const MAX_BUDGET_UNITS = 5000;
