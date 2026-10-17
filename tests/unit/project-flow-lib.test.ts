import { describe, expect, it } from "vitest";
import { budgetRangeFor, preliminaryVerdict } from "@/lib/projects/feasibility-simple";
import { evidenceChecks, readStudy } from "@/lib/projects/analysis-study";

describe("capital bands of the analysis", () => {
  it("maps the expected capital to the stored budget band", () => {
    expect(budgetRangeFor(50_000)).toBe("UNDER_100K");
    expect(budgetRangeFor(100_000)).toBe("BETWEEN_100K_500K");
    expect(budgetRangeFor(500_000)).toBe("BETWEEN_100K_500K");
    expect(budgetRangeFor(500_001)).toBe("BETWEEN_500K_1M");
    expect(budgetRangeFor(1_000_000)).toBe("BETWEEN_500K_1M");
    expect(budgetRangeFor(1_000_001)).toBe("ABOVE_1M");
  });

  it("gives no band for a capital that is not a positive number", () => {
    expect(budgetRangeFor(0)).toBeUndefined();
    expect(budgetRangeFor(-5)).toBeUndefined();
    expect(budgetRangeFor(Number.NaN)).toBeUndefined();
  });
});

describe("the saved analysis input", () => {
  const base = { idea: "منصة توصيل قهوة مختصة", city: "الرياض", targetAudience: "BUSINESSES" };

  it("keeps the exact location, capital, size and place name that were picked", () => {
    const study = readStudy({ status: "PENDING", input: { ...base, latitude: 24.82, longitude: 46.66, expectedCapital: 500_000, projectSize: "SMALL", placeLabel: "الرياض - حي الترجس" } });
    expect(study.input).toMatchObject({ latitude: 24.82, longitude: 46.66, expectedCapital: 500_000, projectSize: "SMALL", placeLabel: "الرياض - حي الترجس" });
  });

  it("drops a coordinate that has no partner and a capital that is not positive", () => {
    const study = readStudy({ status: "PENDING", input: { ...base, latitude: 24.82, expectedCapital: 0 } });
    expect(study.input?.latitude).toBeUndefined();
    expect(study.input?.longitude).toBeUndefined();
    expect(study.input?.expectedCapital).toBeUndefined();
  });
});

describe("the evidence checks behind the completeness score", () => {
  const result = { generatedAt: "", evidenceCompleteness: 85, competitionLevel: "HIGH" as const, purchasingPowerLevel: "HIGH" as const, dataRiskLevel: "LOW" as const, competitorCount: 4, sourceCount: 3, limitationCount: 0, recommendations: [] };
  const snapshot = {
    id: "s1",
    query: "Riyadh",
    fetchedAt: "2026-10-17T00:00:00.000Z",
    location: { latitude: 24.8, longitude: 46.6, label: "الرياض" },
    population: { value: 35_000_000, year: 2024 },
    purchasingPower: { value: 58_000, year: 2024 },
    costInflation: { value: null, year: null },
    sources: [
      { source: "World Bank Open Data", confidence: "HIGH" },
      { source: "OpenStreetMap Nominatim", confidence: "MEDIUM" },
    ],
  };

  it("adds up to the full score when every check is met", () => {
    const checks = evidenceChecks({ ...snapshot, costInflation: { value: 1.7, year: 2024 } }, result);
    expect(checks.every((check) => check.met)).toBe(true);
    expect(checks.reduce((sum, check) => sum + check.weight, 0)).toBe(100);
  });

  it("marks the checks that the saved data does not meet", () => {
    const checks = evidenceChecks(snapshot, { ...result, competitorCount: null });
    expect(checks.filter((check) => !check.met).map((check) => check.id)).toEqual(["inflation", "competitors"]);
  });
});

describe("the preliminary verdict of the short study", () => {
  it("follows the evidence, never a promised return", () => {
    expect(preliminaryVerdict({ evidenceCompleteness: 85, dataRiskLevel: "LOW" })).toBe("SUITABLE");
    expect(preliminaryVerdict({ evidenceCompleteness: 85, dataRiskLevel: "HIGH" })).toBe("REVIEW");
    expect(preliminaryVerdict({ evidenceCompleteness: 50, dataRiskLevel: "MODERATE" })).toBe("REVIEW");
    expect(preliminaryVerdict({ evidenceCompleteness: 30, dataRiskLevel: "LOW" })).toBe("INSUFFICIENT");
  });
});
