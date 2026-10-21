import { EngineError } from "../shared/errors";
import type { EngineEnvironment } from "../shared/states";
import type { InputGovernance } from "../shared/contracts";

/**
 * Which Map layers an analysis may read.
 *  - REGISTERED_ONLY: only layers that belong to a published, registered Map release. This is the only policy in production.
 *  - ALLOW_UNREGISTERED: layers that are not registered may be used, clearly labelled and with lowered confidence. Development and test only.
 */
export const mapLayerPolicies = ["REGISTERED_ONLY", "ALLOW_UNREGISTERED"] as const;
export type MapLayerPolicy = typeof mapLayerPolicies[number];

export function defaultMapLayerPolicy(environment: EngineEnvironment): MapLayerPolicy {
  return environment === "production" ? "REGISTERED_ONLY" : "ALLOW_UNREGISTERED";
}

/** Production refuses an explicit request for unregistered layers; elsewhere the caller may choose the stricter policy. */
export function resolveMapLayerPolicy(environment: EngineEnvironment, requested?: MapLayerPolicy): MapLayerPolicy {
  if (environment === "production" && requested === "ALLOW_UNREGISTERED") throw new EngineError("MAP_LAYER_POLICY_VIOLATION", { requested, environment });
  return requested ?? defaultMapLayerPolicy(environment);
}

/** Whether an input with this governance may be used under the policy. Data Center versions and engine outputs are always governed. */
export function governanceAllowedBy(policy: MapLayerPolicy, governance: InputGovernance): boolean {
  return governance !== "MAP_UNREGISTERED" || policy === "ALLOW_UNREGISTERED";
}
