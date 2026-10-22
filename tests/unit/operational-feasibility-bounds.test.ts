import { describe, expect, it } from "vitest";
import {
  buildOperationalFoundationResult, ensureOperationalSize, normalizeOperationalRequest, operationalBounds, operationalWork,
} from "@/services/analysis-engines/operational-feasibility";
import { operationalContext, operationalDisclosure, operationalRequest, operationalValue } from "./support/operational-feasibility-fixtures";

describe("Operational M1 pre-expansion work and byte bounds", () => {
  it("measures the exact work formula without hidden computation or truncation", () => {
    expect(operationalWork(operationalRequest())).toEqual({ baseRows: 6, expandedRows: 7, metrics: 9, costUnits: 19 });
  });
  it("counts scenarios and each of three sensitivity points before expansion", () => {
    const request = operationalRequest();
    request.scenarios.push({ ...operationalDisclosure, id: "case", overrides: [{ valueId: "target", value: "100" }] });
    request.sensitivity.push({ ...operationalDisclosure, id: "band", valueId: "target", low: "100", base: "200", high: "300" });
    expect(operationalWork(request)).toEqual({ baseRows: 6, expandedRows: 35, metrics: 45, costUnits: 83 });
  });
  it("enforces exact byte limit and rejects oversized requests before parsing", () => {
    expect(() => ensureOperationalSize({ x: "x".repeat(operationalBounds.bytes - 8) })).not.toThrow();
    expect(() => ensureOperationalSize({ x: "x".repeat(operationalBounds.bytes - 7) })).toThrow(/2 MiB/);
    expect(() => normalizeOperationalRequest({ padding: "x".repeat(operationalBounds.bytes) }, operationalContext.evaluatedAt)).toThrow(/2 MiB/);
  });
  it("rejects combined base items even if each individual array is legal", () => {
    const request = operationalRequest();
    request.values.push(...Array.from({ length: 998 }, (_, i) => operationalValue(`extra-${i}`)));
    expect(() => normalizeOperationalRequest(request, operationalContext.evaluatedAt)).toThrow();
  });
  it("accepts exactly 1000 combined items and rejects 1001 rather than truncating", () => {
    const request = operationalRequest();
    request.values.push(...Array.from({ length: 994 }, (_, i) => operationalValue(`extra-${i}`)));
    expect(operationalWork(request).baseRows).toBe(1000);
    expect(normalizeOperationalRequest(request, operationalContext.evaluatedAt).normalized.values).toHaveLength(997);
    request.values.push(operationalValue("one-too-many"));
    expect(operationalWork(request).baseRows).toBe(1001);
    expect(() => normalizeOperationalRequest(request, operationalContext.evaluatedAt)).toThrow(/budget/);
  });
  it("rejects metric expansion across a legal long calendar, not a partial result", () => {
    const request = operationalRequest(); request.analyses = ["CAPACITY", "WORKFORCE", "INVENTORY", "SUPPLY", "REORDER", "QUALITY"];
    request.periods = Array.from({ length: 100 }, (_, i) => {
      const start = new Date("2026-10-01T00:00:00.000Z"); start.setUTCMonth(start.getUTCMonth() + i);
      const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
      return { ...request.periods[0]!, id: `p${i + 1}`, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
    });
    expect(operationalWork(request).metrics).toBe(600);
    expect(() => normalizeOperationalRequest(request, operationalContext.evaluatedAt)).toThrow(/budget/);
  });
  it("keeps the full 120 periods available for an appropriately small request", () => {
    const request = operationalRequest(); request.analyses = ["PREREQUISITES"];
    request.periods = Array.from({ length: 120 }, (_, i) => {
      const start = new Date("2026-10-01T00:00:00.000Z"); start.setUTCMonth(start.getUTCMonth() + i);
      const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
      return { ...request.periods[0]!, id: `p${i + 1}`, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
    });
    expect(buildOperationalFoundationResult(request, [], operationalContext).request.normalized.periods).toHaveLength(120);
  });
  it.each(["scenarios", "sensitivity", "stages"] as const)("does not accept an oversized %s array", (kind) => {
    const request = operationalRequest();
    if (kind === "scenarios") request.scenarios = Array.from({ length: 10 }, (_, i) => ({ ...operationalDisclosure, id: `s-${i}`, overrides: [{ valueId: "target", value: "100" }] }));
    if (kind === "sensitivity") request.sensitivity = Array.from({ length: 21 }, (_, i) => ({ ...operationalDisclosure, id: `d-${i}`, valueId: "target", low: "100", base: "200", high: "300" }));
    if (kind === "stages") request.network.stages = Array.from({ length: 101 }, (_, i) => ({ id: `s-${i}`, poolId: `pool-${i}`, outputId: "service" }));
    expect(() => normalizeOperationalRequest(request, operationalContext.evaluatedAt)).toThrow();
  });
});
