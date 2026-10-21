import { EngineError } from "../shared/errors";
import { isConstraintRole, isFeatureRole, isPlaceRole, isPopulationRole, type SpatialNormalizedRequest } from "./contracts";

/** Conservative output bound, including comparison derivatives and every target; no backend access. */
export function assertSpatialMetricBudget(request: SpatialNormalizedRequest): number {
  const { roles, radiiMeters, nearestCount } = request.parameters;
  const features = roles.filter(isFeatureRole).length;
  const radii = radiiMeters.length;
  let perTarget = 0;
  let comparable = 0;
  if (request.analyses.includes("LOCATION_CONTEXT")) {
    perTarget += 11 + roles.filter(isPlaceRole).length * 5;
    comparable += 2 + roles.filter(isPlaceRole).length;
  }
  if (request.analyses.includes("PROXIMITY")) {
    perTarget += features * nearestCount * 3;
    comparable += features * nearestCount;
  }
  if (request.analyses.includes("CATCHMENT")) {
    const count = (features + roles.filter(isPopulationRole).length) * radii;
    perTarget += count;
    comparable += count;
  }
  if (request.analyses.includes("DENSITY")) {
    const count = features * (2 * radii + 5);
    perTarget += count;
    comparable += count;
  }
  if (request.analyses.includes("CONSTRAINT_SCREENING")) {
    const count = roles.filter(isConstraintRole).length * (4 + radii);
    perTarget += count;
    comparable += count;
  }
  if (request.analyses.includes("SITE_COMPARISON")) perTarget += comparable * 2;
  const requested = perTarget * (1 + request.candidates.length);
  if (requested > 500) throw new EngineError("REQUEST_TOO_LARGE", { reason: "result_metric_limit", maximum: 500, requested });
  return requested;
}
