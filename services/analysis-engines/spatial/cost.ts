import { buildCostEstimate, type CostEstimate, type CostLine } from "../shared/cost";
import { DEFAULT_BUDGET_UNITS, MAX_BUDGET_UNITS, SEARCH_LADDER_METERS } from "./constants";
import { isConstraintRole, isFeatureRole, isPlaceRole, isPopulationRole, type SpatialNormalizedRequest } from "./contracts";
import { countVertices, type AreaGeometry } from "./geometry-precheck";

/**
 * spatial-cost-v1: an abstract, explainable measure of the work a request implies, computed from the normalized request alone.
 * The weights below are provisional; they are calibrated against measured runs on real data before the engine is closed, and any
 * change of weights is a new policy version.
 *
 *   1.0.0  first weights (milestone M1)
 *   1.1.0  PROXIMITY also prices the number of nearest features requested, which sets the size of the query and of the result
 *   1.2.0  LOCATION_CONTEXT also prices the nearest-place search of each place role (M2)
 *
 *   target factor   point 1 · area 2 + vertices / 500  (every selected analysis runs for the main location and every candidate)
 *   LOCATION_CONTEXT      3 per target factor, + for each place role 0.5 per search ring (up to maxSearchMeters)
 *   PROXIMITY             for each feature role: 0.5 per search ring (up to maxSearchMeters) + 0.1 per requested nearest feature
 *   CATCHMENT             1 per feature role, 1 per radius (+1 when the radius is above 10 km), +2 per radius with a population role
 *   DENSITY               4 + min(40, grid cells / 2000) for each feature role
 *   CONSTRAINT_SCREENING  1.5 for each constraint role
 *   SITE_COMPARISON       0.2 per target
 */
export const SPATIAL_COST_POLICY = { id: "spatial-cost-v1", version: "1.2.0" } as const;

const targetFactor = (location: SpatialNormalizedRequest["location"]) => (location.type === "Point" ? 1 : 2 + countVertices(location as AreaGeometry) / 500);
const ringsUpTo = (maxSearchMeters: number) => Math.max(1, SEARCH_LADDER_METERS.filter((meters) => meters <= maxSearchMeters).length);

export function estimateSpatialCost(request: SpatialNormalizedRequest, budgetUnits: number = DEFAULT_BUDGET_UNITS): CostEstimate {
  if (!Number.isFinite(budgetUnits) || budgetUnits <= 0 || budgetUnits > MAX_BUDGET_UNITS) throw new RangeError(`budgetUnits must be above 0 and at most ${MAX_BUDGET_UNITS}`);
  const locations = [request.location, ...request.candidates.map((candidate) => candidate.location)];
  const factor = locations.reduce((sum, location) => sum + targetFactor(location), 0);
  const { radiiMeters, roles, nearestCount, maxSearchMeters, grid } = request.parameters;
  const featureRoles = roles.filter(isFeatureRole);
  const analyses = new Set(request.analyses);
  const lines: CostLine[] = [];

  if (analyses.has("LOCATION_CONTEXT")) {
    lines.push({ key: "context", units: 3 * factor });
    for (const role of roles.filter(isPlaceRole)) lines.push({ key: `context.${role}`, units: 0.5 * ringsUpTo(maxSearchMeters) * factor });
  }
  if (analyses.has("PROXIMITY")) {
    const rings = ringsUpTo(maxSearchMeters);
    for (const role of featureRoles) {
      lines.push({ key: `proximity.${role}`, units: 0.5 * rings * factor });
      lines.push({ key: `proximity.${role}.nearest`, units: 0.1 * nearestCount * factor });
    }
  }
  if (analyses.has("CATCHMENT")) {
    lines.push({ key: "catchment.roles", units: featureRoles.length * factor });
    lines.push({ key: "catchment.radii", units: radiiMeters.reduce((sum, radius) => sum + 1 + (radius > 10_000 ? 1 : 0), 0) * factor });
    if (roles.some(isPopulationRole)) lines.push({ key: "catchment.population", units: 2 * radiiMeters.length * factor });
  }
  if (analyses.has("DENSITY")) {
    const largest = Math.max(...radiiMeters);
    const cells = (Math.PI * largest * largest) / (grid.cellMeters * grid.cellMeters);
    for (const role of featureRoles) lines.push({ key: `density.${role}`, units: (4 + Math.min(40, cells / 2000)) * factor });
  }
  if (analyses.has("CONSTRAINT_SCREENING")) for (const role of roles.filter(isConstraintRole)) lines.push({ key: `constraint.${role}`, units: 1.5 * factor });
  if (analyses.has("SITE_COMPARISON")) lines.push({ key: "comparison", units: 0.2 * locations.length });

  return buildCostEstimate(SPATIAL_COST_POLICY, lines, budgetUnits);
}
