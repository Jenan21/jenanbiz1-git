import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { generateTalentReportWorkbook } from "@/services/talent/talent-report-service";

describe("Talent Excel report", () => {
  it("generates summary, posting, and privacy-safe application sheets", async () => {
    const bytes = await generateTalentReportWorkbook({ generatedAt: new Date("2026-09-28T00:00:00.000Z"), postings: [{ title: "Growth lead", status: "PUBLISHED", qualityScore: 90, workMode: "HYBRID", city: "Riyadh", countryCode: "SA", applicantCount: 1, createdAt: new Date("2026-09-01"), updatedAt: new Date("2026-09-20") }], applications: [{ candidateName: "Shared Candidate", jobTitle: "Growth lead", status: "ACCEPTED", matchScore: 88, consentVersion: "talent-profile-v1", createdAt: new Date("2026-09-10"), updatedAt: new Date("2026-09-12") }] });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Summary", "Postings", "Applications"]);
    expect(workbook.getWorksheet("Applications")?.getCell("A2").value).toBe("Shared Candidate");
    expect(JSON.stringify(workbook.getWorksheet("Applications")?.getSheetValues())).not.toContain("@example.test");
  });
});