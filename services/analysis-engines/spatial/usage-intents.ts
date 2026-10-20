import { compareText } from "../shared/canonical";
import type { EngineInput } from "../shared/contracts";

/**
 * What a successful run tells the Data Center about the versions it used, prepared and not written. The Data Center's own usage record
 * (`recordDataCenterUsage`: version, consumer, purpose) is written by the persistence of the run (milestone M5), in the same step that
 * stores the run, so a run that fails leaves no usage record behind. The intents are derived from the inputs of a finished result and
 * from nothing else: a version that was only discovered, or whose content was refused, is not in the result and has no intent.
 */
export const SPATIAL_USAGE_CONSUMER = "analysis-engine:spatial";

export interface DataCenterUsageIntent {
  versionId: string;
  /** The SHA-256 of the version the run used, so the record names the exact content. */
  checksum: string;
  /** Fits the Data Center's usage record: a consumer of at most 120 characters. */
  consumer: string;
  /** Fits the Data Center's usage record: a purpose of at most 500 characters. */
  purpose: string;
  /** The roles the run used the version for. */
  roles: string[];
}

export function buildDataCenterUsageIntents(inputs: readonly EngineInput[], analyses: readonly string[]): DataCenterUsageIntent[] {
  const purpose = `Spatial analysis: ${[...analyses].sort(compareText).join(", ")}`.slice(0, 500);
  return inputs
    .filter((input) => input.kind === "DATA_CENTER_VERSION" && input.checksum !== null)
    .map((input) => ({ versionId: input.ref.id, checksum: (input.checksum as { value: string }).value, consumer: SPATIAL_USAGE_CONSUMER, purpose, roles: [...input.roles].sort(compareText) }))
    .sort((first, second) => compareText(first.versionId, second.versionId));
}
