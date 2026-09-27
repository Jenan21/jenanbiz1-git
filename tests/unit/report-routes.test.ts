import { describe, expect, it } from "vitest";

import { isReportRoute, REPORT_ROUTES } from "@/lib/reports/report-routes";

describe("shared report routes", () => {
  it("declares the five authoritative report pages", () => {
    expect(REPORT_ROUTES).toHaveLength(5);
    expect(new Set(REPORT_ROUTES).size).toBe(5);
    expect(REPORT_ROUTES).toContain("/reports/print/project-analysis");
    expect(REPORT_ROUTES).toContain("/reports/view/investment");
  });

  it("rejects undeclared report paths", () => {
    expect(isReportRoute("/reports/view/general")).toBe(true);
    expect(isReportRoute("/reports/export/docx")).toBe(false);
  });
});