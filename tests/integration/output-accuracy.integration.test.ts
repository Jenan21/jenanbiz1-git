import { afterAll, describe, expect, it } from "vitest";
import { extractPdfText } from "@/packages/pdf-engine/src";
import { db } from "@/lib/db";
import { createProject, createProjectRisk, saveProjectFinancialPlan } from "@/services/projects/project-service";
import { saveProjectAnalysisInput } from "@/services/projects/project-analysis";
import { createProjectReport } from "@/services/projects/project-report";

const suffix = crypto.randomUUID().slice(0, 8);
let userId: string | undefined;
let projectId: string | undefined;

afterAll(async () => {
  if (projectId) await db.project.delete({ where: { id: projectId } });
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

const GARBAGE = /\bNaN\b|\bundefined\b|\[object Object\]|Invalid Date|\bInfinity\b/;

describe("the project report states exactly what was recorded", () => {
  it("prints each recorded figure and never a placeholder produced by a bug", async () => {
    const user = await db.user.create({ data: { email: `output-${suffix}@example.test`, status: "ACTIVE", profile: { create: { displayName: "Report Owner", language: "en", locale: "en" } } } });
    userId = user.id;
    const project = await createProject({ name: `Accuracy project ${suffix}`, sector: "Logistics", countryCode: "SA", currency: "SAR", description: "Cold-chain marketplace for regional operators." }, user.id);
    projectId = project.id;
    await saveProjectAnalysisInput(project.id, { idea: "A documented cold-chain marketplace for regional operators.", city: "Riyadh", targetAudience: "BUSINESSES", budgetRange: "BETWEEN_100K_500K" }, user.id);
    await createProjectRisk(project.id, { category: "MARKET", title: "Demand variance", likelihood: 3, impact: 4, mitigation: "Review demand weekly and adjust capacity.", ownerLabel: "Project owner" }, user.id);
    await saveProjectFinancialPlan(
      project.id,
      {
        inputs: { price: 50 },
        baseCase: { breakEvenUnits: 410, internalRateReturn: 22.5, monthlyProfit: 31_250, monthlyRevenue: 125_000, netPresentValue: 912_345, paybackMonths: 14, roiPercent: 80 },
        scenarios: [{ scenario: "EXPECTED" }],
      },
      user.id,
    );

    const bytes = await createProjectReport(project.id, user.id);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    const pages = await extractPdfText(bytes);
    expect(pages.length).toBeGreaterThanOrEqual(1);
    const text = pages.join(" ");

    expect(text).toContain("JENAN PRO PROJECT REPORT");
    expect(text).toContain(`Project: Accuracy project ${suffix}`);
    for (const expected of ["Report Owner", "Logistics", "SA", "SAR", "Status ANALYSIS", "Riyadh", "BUSINESSES", "Demand variance", "Review demand weekly and adjust capacity.", "score 12/25"]) {
      expect(text, expected).toContain(expected);
    }
    // A figure that was never recorded reads "-", not "-%".
    expect(text).toContain("Evidence completeness -");
    expect(text).not.toContain("-%");
    // Every recorded financial figure is printed unchanged, next to its own label.
    const figures: Array<[string, string]> = [["Monthly revenue", "125000"], ["Monthly profit", "31250"], ["Break-even units", "410"], ["ROI percent", "80"], ["Payback months", "14"], ["Net present value", "912345"], ["Internal rate of return", "22.5"]];
    for (const [label, value] of figures) expect(text, label).toMatch(new RegExp(`${label}\\s+${value}(?!\\d)`));
    expect(text).toContain("Financial plan version: v1");
    // All seven lifecycle phases are listed in order.
    expect([...text.matchAll(/(\d)\. [^-]+ - (ACTIVE|PENDING)/g)].map((match) => match[1])).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(text).not.toMatch(GARBAGE);
  });
});
