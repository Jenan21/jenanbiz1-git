import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildProjectReportRows, renderProjectReport } from "@/services/projects/project-report";

describe("project report Unicode output", () => {
  it("includes attached evidence and source retrieval dates in report rows", () => {
    const rows = buildProjectReportRows({
      id: "project-1",
      name: "Evidence review",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-02-01T00:00:00Z"),
      assessments: [{
        type: "MARKET",
        score: 88,
        summary: "Demand review",
        source: "Regional study",
        assessedAt: new Date("2026-02-01T00:00:00Z"),
        evidenceFiles: [{
          fileAssetId: "file-1",
          createdAt: new Date("2026-01-20T00:00:00Z"),
          fileAsset: {
            id: "file-1",
            fileName: "market-study.pdf",
            mimeType: "application/pdf",
            checksum: "sha256-value",
            createdAt: new Date("2026-01-19T00:00:00Z"),
          },
        }],
      }],
      financialPlans: [],
      decisions: [],
      phases: [],
      complianceItems: [],
      risks: [],
      evidenceFiles: [],
      intelligenceSnapshots: [],
    } as never, {
      location: null,
      population: { value: null, year: null },
      purchasingPower: { value: null, year: null, metric: "GNI per capita" },
      costInflation: { value: null, year: null, metric: "Inflation" },
      competitors: [],
      sources: [{ source: "World Bank", url: "https://data.example.test", fetchedAt: "2026-02-02T00:00:00.000Z", confidence: "HIGH" }],
      limitations: [],
    });
    const content = rows.map((row) => row.text).join("\n");
    expect(content).toContain("Linked evidence: market-study.pdf");
    expect(content).toContain("sha256-value");
    expect(content).toContain("Retrieved: 2026-02-02T00:00:00.000Z");
  });

  it("renders Arabic, mixed-language evidence and long source URLs without truncation errors", async () => {
    const bytes = await renderProjectReport([
      { text: "جنان برو — تقرير المشروع", heading: true },
      { text: "تقرير دراسة جدوى إنتاجية، مصدر البيانات: الرياض. NPV 1000 SAR" },
      { text: `Source: https://example.test/${"evidence".repeat(150)}` },
      ...Array.from({ length: 70 }, (_, index) => ({ text: `Evidence ${index}: بيانات المصدر وقائمة المراجعة` })),
    ], "تقرير المشروع");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe("تقرير المشروع");
    expect(pdf.getAuthor()).toBe("Jenan PRO");
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(pdf.getPages().every((page) => page.getWidth() === 595 && page.getHeight() === 842)).toBe(true);
  });
});
