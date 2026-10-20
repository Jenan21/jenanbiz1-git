import { describe, expect, it } from "vitest";
import { buildDataCenterUsageIntents, SPATIAL_USAGE_CONSUMER } from "@/services/analysis-engines/spatial/usage-intents";
import { makeEngineRunInput, makeInput, makeUnregisteredSampleInput } from "./support/analysis-engine-fixtures";

describe("what a successful run tells the Data Center, prepared and not written", () => {
  it("has one intent for each Data Center version the run used, with its exact checksum, the roles it served and the consumer and purpose the usage record needs", () => {
    const intents = buildDataCenterUsageIntents([
      makeInput({ id: "dc:version-2", roles: ["poi:school", "poi:hospital"], ref: { system: "DATA_CENTER", id: "version-2", version: 4, label: "Schools" }, checksum: { algorithm: "SHA-256", value: "b".repeat(64) } }),
      makeInput({ id: "dc:version-1", roles: ["poi:market"], ref: { system: "DATA_CENTER", id: "version-1", version: 3, label: "Markets" } }),
    ], ["PROXIMITY", "LOCATION_CONTEXT"]);
    expect(intents).toEqual([
      { versionId: "version-1", checksum: "a".repeat(64), consumer: SPATIAL_USAGE_CONSUMER, purpose: "Spatial analysis: LOCATION_CONTEXT, PROXIMITY", roles: ["poi:market"] },
      { versionId: "version-2", checksum: "b".repeat(64), consumer: SPATIAL_USAGE_CONSUMER, purpose: "Spatial analysis: LOCATION_CONTEXT, PROXIMITY", roles: ["poi:hospital", "poi:school"] },
    ]);
  });

  it("is derived from the inputs of a finished result and from nothing else: Map layers and other engines' outputs have none", () => {
    expect(buildDataCenterUsageIntents([makeUnregisteredSampleInput(), makeEngineRunInput()], ["LOCATION_CONTEXT"])).toEqual([]);
    expect(buildDataCenterUsageIntents([], ["LOCATION_CONTEXT"])).toEqual([]);
  });

  it("fits the Data Center's usage record: a consumer of at most 120 characters and a purpose of at most 500", () => {
    expect(SPATIAL_USAGE_CONSUMER.length).toBeLessThanOrEqual(120);
    const [intent] = buildDataCenterUsageIntents([makeInput()], Array.from({ length: 6 }, (_, index) => `ANALYSIS_NUMBER_${index}`.repeat(10)));
    expect(intent?.purpose.length).toBeLessThanOrEqual(500);
  });

  it("is the same whatever order the inputs and analyses arrive in, and does not change them", () => {
    const inputs = [makeInput({ id: "dc:b", ref: { system: "DATA_CENTER", id: "b", version: 1, label: "B" } }), makeInput({ id: "dc:a", ref: { system: "DATA_CENTER", id: "a", version: 1, label: "A" } })];
    const analyses = ["PROXIMITY", "CATCHMENT"];
    const first = buildDataCenterUsageIntents(inputs, analyses);
    expect(buildDataCenterUsageIntents([...inputs].reverse(), [...analyses].reverse())).toEqual(first);
    expect(first.map((intent) => intent.versionId)).toEqual(["a", "b"]);
    expect(inputs.map((input) => input.id)).toEqual(["dc:b", "dc:a"]);
    expect(analyses).toEqual(["PROXIMITY", "CATCHMENT"]);
  });
});
