import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { renderProjectReport } from "@/services/projects/project-report";

describe("project report Unicode output", () => {
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
