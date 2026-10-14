import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => createElement("a", { href, ...rest }, children),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/projects/projects-command-header", () => ({ ProjectsCommandHeader: () => null }));

import { AnalysisNotices, readMetric, readStudy } from "@/components/projects/project-analysis-workspace";

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
    for (const ar of [true, false]) {
      const html = renderToStaticMarkup(createElement(AnalysisNotices, { ar, study: study("هههههههههههه") }));
      expect(html).toContain('data-testid="analysis-unreadable-idea"');
      expect(html).toContain('data-testid="analysis-scope-notice"');
      expect(html).toContain('href="/projects/analysis"');
    }
  });

  it("shows only the scope note for a readable idea, and nothing before there is a result", () => {
    const readable = renderToStaticMarkup(createElement(AnalysisNotices, { ar: true, study: study("منصة رقمية لتوصيل المنتجات الصحية") }));
    expect(readable).toContain('data-testid="analysis-scope-notice"');
    expect(readable).not.toContain("analysis-unreadable-idea");
    const pending = renderToStaticMarkup(createElement(AnalysisNotices, { ar: true, study: readStudy({ status: "PENDING", input: { idea: "منصة رقمية لتوصيل المنتجات الصحية", city: "Jeddah", targetAudience: "CONSUMERS" } }) }));
    expect(pending).toBe("");
  });
});
