import { assertWithinBudget, type CostEstimate } from "../shared/cost";
import { estimateSpatialCost } from "./cost";
import { normalizeSpatialRequest, type NormalizationResult, type NormalizeOptions } from "./normalize";

export interface PreparedSpatialRequest extends NormalizationResult { cost: CostEstimate }

/**
 * Everything that happens before any data is read: validate, normalize, resolve the Map-layer policy and refuse a request whose
 * estimated cost is above the server budget. A request that passes is bounded and reproducible.
 */
export function prepareSpatialRequest(input: unknown, options: NormalizeOptions & { budgetUnits?: number }): PreparedSpatialRequest {
  const normalization = normalizeSpatialRequest(input, options);
  const cost = estimateSpatialCost(normalization.normalized, options.budgetUnits);
  assertWithinBudget(cost);
  return { ...normalization, cost };
}
