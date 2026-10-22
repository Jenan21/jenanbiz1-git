import { bindOperationalDataset } from "@/services/analysis-engines/operational-feasibility";
import { operationalCalculationDataset } from "./operational-calculation-fixtures";
import { operationalPortFixture } from "./operational-data-fixtures";
import { operationalContext } from "./operational-feasibility-fixtures";

export function operationalAcceptanceDataset() {
  const dataset = operationalCalculationDataset();
  dataset.model.analyses.push("SCENARIOS", "SENSITIVITY");
  const disclosure = {
    author: "Synthetic owner", declaredAt: "2026-10-01T00:00:00.000Z",
    rationale: "Explicit synthetic operational acceptance, not production data", evidence: ["model-record"],
  };
  dataset.model.scenarios = [{ ...disclosure, id: "declared-target", overrides: [{ valueId: "target", value: "100" }] }];
  dataset.model.sensitivity = [{ ...disclosure, id: "declared-cycle", valueId: "cycle-2", low: "1", base: "2", high: "4" }];
  return dataset;
}
export function operationalAcceptanceFixture() {
  const fixture = operationalPortFixture();
  Object.assign(fixture.dataset, operationalAcceptanceDataset());
  fixture.request = bindOperationalDataset(fixture.dataset, fixture.reference, operationalContext.evaluatedAt);
  return fixture;
}
