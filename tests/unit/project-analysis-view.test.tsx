import { describe, expect, it } from "vitest";

import { buildReport } from "@/lib/projects/analysis-report";
import { readMetric, readStudy } from "@/lib/projects/analysis-study";

const savedResult = {
  generatedAt: "2026-10-14T00:00:00.000Z",
  evidenceCompleteness: 100,
  competitionLevel: "LOW",
  purchasingPowerLevel: "HIGH",
  dataRiskLevel: "LOW",
  competitorCount: 0,
  sourceCount: 3,
  limitationCount: 0,
  recommendations: ["VALIDATE_MARKET_DEMAND"],
};

function study(idea: string, result: unknown = savedResult) {
  return readStudy({ status: "COMPLETED", input: { idea, city: "Jeddah", targetAudience: "CONSUMERS" }, result });
}

describe("saved analysis shown to the owner", () => {
  it("reads the year and unit the snapshots really store", () => {
    expect(readMetric({ value: 35_000_000, year: 2024 })).toEqual({ value: 35_000_000, unit: undefined, period: "2024" });
    expect(readMetric({ value: 58_000, year: 2024, metric: "GNI per capita, PPP" })).toEqual({ value: 58_000, unit: "GNI per capita, PPP", period: "2024" });
    expect(readMetric({ value: 2.3, period: "2023", unit: "%" })).toEqual({ value: 2.3, unit: "%", period: "2023" });
    expect(readMetric({ value: null, year: null })).toEqual({ value: null, unit: undefined, period: undefined });
  });

  it("no longer shows an old empty competitor search as low competition or as earned evidence", () => {
    const result = study("هههههههههههه").result!;
    expect(result.competitionLevel).toBe("UNAVAILABLE");
    expect(result.competitorCount).toBeNull();
    expect(result.evidenceCompleteness).toBe(85);
  });

  it("keeps a real count of competitors untouched", () => {
    const result = study("منصة رقمية لتوصيل المنتجات الصحية", { ...savedResult, competitorCount: 8, competitionLevel: "MODERATE" }).result!;
    expect(result.competitionLevel).toBe("MODERATE");
    expect(result.competitorCount).toBe(8);
    expect(result.evidenceCompleteness).toBe(100);
  });

  it("warns on every results screen when the saved idea cannot be understood", () => {
    for (const locale of ["ar", "en"] as const) {
      const model = buildReport({ project: { id: "p1", name: "x" }, study: study("هههههههههههه") }, locale);
      expect(model.ideaWarning).toBeTruthy();
    }
  });

  it("raises no warning for a readable idea, and none before there is an idea at all", () => {
    expect(buildReport({ project: { id: "p1", name: "x" }, study: study("منصة رقمية لتوصيل المنتجات الصحية") }, "ar").ideaWarning).toBeNull();
    expect(buildReport({ project: { id: "p1", name: "x" }, study: readStudy({ status: "PENDING" }) }, "ar").ideaWarning).toBeNull();
  });
});
