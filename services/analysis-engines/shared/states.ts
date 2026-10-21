/**
 * States shared by every analysis engine.
 *
 * An engine reports what it knows with a fine-grained `MetricStatus`. Consumers that follow the platform convention
 * (`MetricState` in the Project Analysis report: VERIFIED, ESTIMATED, UNAVAILABLE, COMPUTED) read the compatible
 * `PlatformMetricState` that is derived from it. A value is never invented for a missing input: every status that
 * means "no value" carries `null`, not zero.
 */
export const metricStatuses = [
  "COMPUTED", // all required inputs were available and cover the target
  "PARTIAL", // computed from some of the requested inputs; the missing ones are reported as gaps
  "ESTIMATED", // computed with a declared approximation that was allowed explicitly
  "NO_COVERAGE", // the target lies outside the declared coverage of the data: unknown, not zero
  "NOT_AVAILABLE", // no accessible dataset exists for a required role
  "NOT_COMPUTABLE", // a required capability is missing (for example a computation backend or a road network)
  "NOT_FOUND_WITHIN_RADIUS", // coverage is confirmed and nothing mapped was found within the searched distance
] as const;
export type MetricStatus = typeof metricStatuses[number];

export const platformMetricStates = ["VERIFIED", "ESTIMATED", "UNAVAILABLE", "COMPUTED"] as const;
export type PlatformMetricState = typeof platformMetricStates[number];

/** Statuses that must never carry a value or a confidence. */
export const valuelessStatuses = ["NO_COVERAGE", "NOT_AVAILABLE", "NOT_COMPUTABLE", "NOT_FOUND_WITHIN_RADIUS"] as const satisfies readonly MetricStatus[];
export function isValuelessStatus(status: MetricStatus) {
  return (valuelessStatuses as readonly MetricStatus[]).includes(status);
}

/**
 * Platform-compatible state. "Nothing mapped" is UNAVAILABLE, as in the platform (zero mapped venues do not prove absence);
 * the engine status keeps the finer meaning. VERIFIED is reachable only for a computed value whose inputs were all verified.
 */
export function platformStateFor(status: MetricStatus, options: { verified?: boolean } = {}): PlatformMetricState {
  switch (status) {
    case "COMPUTED": return options.verified ? "VERIFIED" : "COMPUTED";
    case "PARTIAL": return "COMPUTED";
    case "ESTIMATED": return "ESTIMATED";
    default: return "UNAVAILABLE";
  }
}
export function allowedPlatformStates(status: MetricStatus): readonly PlatformMetricState[] {
  return status === "COMPUTED" ? ["COMPUTED", "VERIFIED"] : [platformStateFor(status)];
}

export const runStatuses = ["COMPLETED", "COMPLETED_WITH_GAPS", "FAILED"] as const;
export type RunStatus = typeof runStatuses[number];

export const engineEnvironments = ["production", "development", "test"] as const;
export type EngineEnvironment = typeof engineEnvironments[number];
export function engineEnvironmentFrom(nodeEnv: string | undefined): EngineEnvironment {
  return nodeEnv === "production" ? "production" : nodeEnv === "test" ? "test" : "development";
}

/** Confidence bands, best first. INSUFFICIENT means the inputs do not support a stated level, and maps to UNAVAILABLE on the platform. */
export const confidenceBands = ["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"] as const;
export type ConfidenceBand = typeof confidenceBands[number];
export const cappingBands = ["HIGH", "MEDIUM", "LOW"] as const satisfies readonly ConfidenceBand[];
export type CappingBand = typeof cappingBands[number];

const bandRanks: Record<ConfidenceBand, number> = { HIGH: 3, MEDIUM: 2, LOW: 1, INSUFFICIENT: 0 };
export function bandRank(band: ConfidenceBand) { return bandRanks[band]; }
/** The weaker of two bands. */
export function minBand(first: ConfidenceBand, second: ConfidenceBand): ConfidenceBand {
  return bandRanks[first] <= bandRanks[second] ? first : second;
}
export function isBandAtMost(band: ConfidenceBand, limit: ConfidenceBand) { return bandRanks[band] <= bandRanks[limit]; }
export function platformConfidenceFor(band: ConfidenceBand): "HIGH" | "MEDIUM" | "LOW" | null {
  return band === "INSUFFICIENT" ? null : band;
}
