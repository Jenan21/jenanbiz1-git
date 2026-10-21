import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  allowedPlatformStates, bandRank, cappingBands, confidenceBands, EngineError, engineEnvironmentFrom, engineErrorCodes, isBandAtMost, isValuelessStatus, metricStatuses,
  minBand, platformConfidenceFor, platformMetricStates, platformStateFor, valuelessStatuses, type MetricStatus,
} from "@/services/analysis-engines/shared";

describe("metric states", () => {
  it("maps every engine status to a platform state without ever inventing a value", () => {
    const expected: Record<MetricStatus, string> = {
      COMPUTED: "COMPUTED", PARTIAL: "COMPUTED", ESTIMATED: "ESTIMATED",
      NO_COVERAGE: "UNAVAILABLE", NOT_AVAILABLE: "UNAVAILABLE", NOT_COMPUTABLE: "UNAVAILABLE", NOT_FOUND_WITHIN_RADIUS: "UNAVAILABLE",
    };
    for (const status of metricStatuses) expect(platformStateFor(status)).toBe(expected[status]);
  });

  it("reaches VERIFIED only for a computed value whose inputs were verified", () => {
    expect(platformStateFor("COMPUTED", { verified: true })).toBe("VERIFIED");
    expect(platformStateFor("PARTIAL", { verified: true })).toBe("COMPUTED");
    expect(platformStateFor("ESTIMATED", { verified: true })).toBe("ESTIMATED");
    expect(allowedPlatformStates("COMPUTED")).toEqual(["COMPUTED", "VERIFIED"]);
    expect(allowedPlatformStates("NO_COVERAGE")).toEqual(["UNAVAILABLE"]);
  });

  it("treats exactly the four absence statuses as valueless", () => {
    expect([...valuelessStatuses].sort()).toEqual(["NOT_AVAILABLE", "NOT_COMPUTABLE", "NOT_FOUND_WITHIN_RADIUS", "NO_COVERAGE"]);
    for (const status of metricStatuses) expect(isValuelessStatus(status)).toBe((valuelessStatuses as readonly string[]).includes(status));
  });

  it("keeps the platform vocabulary of the Project Analysis report (text check, no import)", () => {
    const source = readFileSync(join(process.cwd(), "lib", "projects", "analysis-report.ts"), "utf8");
    const members = (name: string) => [...(source.match(new RegExp(`export type ${name} = ([^;]+);`))?.[1] ?? "").matchAll(/"([A-Z]+)"/g)].map((match) => match[1]).sort();
    expect(members("MetricState")).toEqual([...platformMetricStates].sort());
    expect(members("Confidence")).toEqual([...cappingBands].sort());
  });
});

describe("confidence bands", () => {
  it("orders bands from best to weakest", () => {
    expect(confidenceBands.map(bandRank)).toEqual([3, 2, 1, 0]);
    expect(minBand("HIGH", "LOW")).toBe("LOW");
    expect(minBand("LOW", "HIGH")).toBe("LOW");
    expect(minBand("MEDIUM", "INSUFFICIENT")).toBe("INSUFFICIENT");
    expect(isBandAtMost("LOW", "MEDIUM")).toBe(true);
    expect(isBandAtMost("HIGH", "MEDIUM")).toBe(false);
  });

  it("reports INSUFFICIENT as no platform confidence instead of a low one", () => {
    expect(platformConfidenceFor("HIGH")).toBe("HIGH");
    expect(platformConfidenceFor("LOW")).toBe("LOW");
    expect(platformConfidenceFor("INSUFFICIENT")).toBeNull();
  });
});

describe("environment and errors", () => {
  it("defaults anything that is not production or test to development", () => {
    expect(engineEnvironmentFrom("production")).toBe("production");
    expect(engineEnvironmentFrom("test")).toBe("test");
    expect(engineEnvironmentFrom("development")).toBe("development");
    expect(engineEnvironmentFrom(undefined)).toBe("development");
    expect(engineEnvironmentFrom("staging")).toBe("development");
  });

  it("gives every error code an HTTP status and keeps details out of the message", () => {
    const statuses = Object.fromEntries(engineErrorCodes.map((code) => [code, new EngineError(code).status]));
    expect(statuses).toEqual({ INVALID_INPUT: 400, REQUEST_TOO_LARGE: 422, MAP_LAYER_POLICY_VIOLATION: 403, BACKEND_UNAVAILABLE: 503, CONTRACT_VIOLATION: 500 });
    const error = new EngineError("REQUEST_TOO_LARGE", { units: 9, budgetUnits: 5 });
    expect(error.message).toBe("REQUEST_TOO_LARGE");
    expect(error.details).toEqual({ units: 9, budgetUnits: 5 });
    expect(error).toBeInstanceOf(Error);
  });
});
