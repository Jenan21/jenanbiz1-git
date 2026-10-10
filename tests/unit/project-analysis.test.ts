import { describe, expect, it } from "vitest";
import { buildProjectAnalysisResult } from "@/services/projects/project-analysis";
import type { ProjectIntelligenceResult } from "@/services/projects/project-intelligence";

function intelligence(
  overrides: Partial<ProjectIntelligenceResult> = {},
): ProjectIntelligenceResult {
  return {
    location: { latitude: 24.7136, longitude: 46.6753, label: "Riyadh" },
    population: { value: 35_000_000, year: 2024 },
    purchasingPower: {
      value: 58_000,
      year: 2024,
      metric: "GNI per capita, PPP",
    },
    costInflation: {
      value: 2.3,
      year: 2024,
      metric: "Consumer price inflation",
    },
    competitors: Array.from({ length: 8 }, (_, index) => ({
      name: `Competitor ${index + 1}`,
      category: "service",
      latitude: 24.7 + index / 100,
      longitude: 46.6 + index / 100,
    })),
    sources: [
      {
        source: "OpenStreetMap Nominatim",
        url: "https://example.test/location",
        fetchedAt: "2026-10-10T00:00:00.000Z",
        confidence: "MEDIUM",
      },
      {
        source: "World Bank Open Data",
        url: "https://example.test/world-bank",
        fetchedAt: "2026-10-10T00:00:00.000Z",
        confidence: "HIGH",
      },
      {
        source: "OpenStreetMap Overpass",
        url: "https://example.test/competitors",
        fetchedAt: "2026-10-10T00:00:00.000Z",
        confidence: "MEDIUM",
      },
    ],
    limitations: [],
    ...overrides,
  };
}

describe("project analysis result", () => {
  it("derives evidence, competition, purchasing power, and recommendations deterministically", () => {
    const result = buildProjectAnalysisResult(intelligence());

    expect(result.evidenceCompleteness).toBe(100);
    expect(result.competitionLevel).toBe("MODERATE");
    expect(result.purchasingPowerLevel).toBe("HIGH");
    expect(result.dataRiskLevel).toBe("LOW");
    expect(result.competitorCount).toBe(8);
    expect(result.recommendations).toContain("DIFFERENTIATE_OFFER");
    expect(result.recommendations).toContain("PROCEED_TO_DETAILED_FEASIBILITY");
  });

  it("does not treat missing provider coverage as zero competition or verified purchasing power", () => {
    const result = buildProjectAnalysisResult(
      intelligence({
        location: null,
        population: { value: null, year: null },
        purchasingPower: {
          value: null,
          year: null,
          metric: "GNI per capita, PPP",
        },
        costInflation: {
          value: null,
          year: null,
          metric: "Consumer price inflation",
        },
        competitors: [],
        sources: [
          {
            source: "OpenStreetMap Nominatim",
            url: "https://example.test/location",
            fetchedAt: "2026-10-10T00:00:00.000Z",
            confidence: "LOW",
          },
        ],
        limitations: [
          "Location unavailable",
          "Population unavailable",
          "Purchasing power unavailable",
          "Competitor coverage unavailable",
        ],
      }),
    );

    expect(result.evidenceCompleteness).toBe(0);
    expect(result.competitionLevel).toBe("UNAVAILABLE");
    expect(result.purchasingPowerLevel).toBe("UNAVAILABLE");
    expect(result.competitorCount).toBeNull();
    expect(result.dataRiskLevel).toBe("HIGH");
    expect(result.recommendations).toContain("VERIFY_LOCATION");
    expect(result.recommendations).not.toContain(
      "PROCEED_TO_DETAILED_FEASIBILITY",
    );
  });
});
