import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildReport } from "@/lib/projects/analysis-report";
import { readStudy } from "@/lib/projects/analysis-study";
import { renderAnalysisReportPdf } from "@/services/projects/analysis-report-pdf";

const now = "2026-10-17T07:59:00.000Z";

function sample(competitors: number, options: { empty?: boolean; idea?: string } = {}) {
  const venues = Array.from({ length: competitors }, (_, index) => ({
    id: `c${index}`,
    name: index % 5 === 0 ? undefined : `مقهى التجربة رقم ${index + 1} Specialty Coffee`,
    kind: ["cafe", "restaurant", "bakery", "coffee", "fast_food"][index % 5],
    latitude: 24.8216 + ((index % 7) - 3) * 0.006,
    longitude: 46.6633 + ((index % 5) - 2) * 0.008,
  }));
  return {
    project: { id: "ckproject0000000000000001", name: "منصة توصيل قهوة", sector: "Food", countryCode: "SA" },
    study: readStudy({
      status: "COMPLETED",
      updatedAt: now,
      input: {
        idea: options.idea ?? "منصة توصيل قهوة مختصة للمكاتب والشركات الناشئة في شمال الرياض مع اشتراكات شهرية",
        city: "الرياض",
        targetAudience: "BUSINESSES",
        latitude: 24.8216,
        longitude: 46.6633,
        expectedCapital: 500000,
        areaSqm: 150,
        placeLabel: "الرياض - حي النرجس",
      },
      result: options.empty
        ? undefined
        : {
            generatedAt: now,
            evidenceCompleteness: 85,
            competitionLevel: "HIGH",
            purchasingPowerLevel: "HIGH",
            dataRiskLevel: "MODERATE",
            competitorCount: competitors,
            sourceCount: 3,
            limitationCount: 2,
            recommendations: ["VALIDATE_MARKET_DEMAND", "DIFFERENTIATE_OFFER", "OBTAIN_LOCAL_PURCHASING_DATA", "REVIEW_SOURCE_LIMITATIONS", "PROCEED_TO_DETAILED_FEASIBILITY"],
          },
    }),
    snapshot: options.empty
      ? undefined
      : {
          id: "s1",
          query: "Riyadh",
          fetchedAt: now,
          location: { latitude: 24.8216, longitude: 46.6633, label: "الرياض" },
          population: { value: 36947025, year: 2024 },
          purchasingPower: { value: 58000, year: 2024 },
          costInflation: { value: 1.7, year: 2024 },
          competitors: venues,
          sources: [
            { source: "World Bank Open Data", retrievedAt: now, confidence: "HIGH" },
            { source: "OpenStreetMap Overpass", retrievedAt: now, confidence: "MEDIUM" },
          ],
          limitations: ["Population result is unavailable.", "Competitor discovery could not be loaded: provider timeout"],
        },
  };
}

async function render(data: ReturnType<typeof sample>, locale: "ar" | "en", name: string) {
  const bytes = await renderAnalysisReportPdf(buildReport(data, locale));
  if (process.env.PDF_OUT) {
    mkdirSync(process.env.PDF_OUT, { recursive: true });
    writeFileSync(path.join(process.env.PDF_OUT, `${name}.pdf`), bytes);
  }
  return bytes;
}

describe("analysis report PDF on the letterhead", () => {
  it.each(["ar", "en"] as const)("writes a valid multi-page PDF in %s", async (locale) => {
    const bytes = await render(sample(14), locale, `report-${locale}`);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThanOrEqual(2);
    for (const page of document.getPages()) expect(page.getSize()).toEqual({ width: 595.28, height: 841.89 });
    expect(bytes.byteLength).toBeLessThan(1_500_000);
  });

  it("still renders when no figure is available and when a long idea and many competitors are given", async () => {
    const empty = await PDFDocument.load(await render(sample(0, { empty: true }), "ar", "report-empty-ar"));
    expect(empty.getPageCount()).toBeGreaterThanOrEqual(1);
    const heavy = await PDFDocument.load(await render(sample(60, { idea: "فكرة ".repeat(90) }), "en", "report-heavy-en"));
    expect(heavy.getPageCount()).toBeGreaterThanOrEqual(2);
  });
});
