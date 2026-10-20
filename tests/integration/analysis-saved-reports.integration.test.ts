import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { buildReport } from "@/lib/projects/analysis-report";
import { createProject } from "@/services/projects/project-service";
import { findLatestAnalysisReportId, getProjectAnalysisStatus, saveProjectAnalysisInput } from "@/services/projects/project-analysis";
import {
  buildLiveReport,
  getSavedAnalysisReport,
  listSavedAnalysisReports,
  saveAnalysisReportCopy,
} from "@/services/projects/analysis-report-service";

const suffix = crypto.randomUUID().slice(0, 8);
const created: { users: string[]; projects: string[] } = { users: [], projects: [] };

afterAll(async () => {
  await db.savedReport.deleteMany({ where: { userId: { in: created.users } } });
  for (const id of created.projects) await db.project.delete({ where: { id } }).catch(() => undefined);
  for (const id of created.users) await db.user.delete({ where: { id } }).catch(() => undefined);
  await db.$disconnect();
});

const finished = {
  version: 1,
  status: "COMPLETED",
  updatedAt: "2026-10-17T08:00:00.000Z",
  input: {
    idea: "منصة توصيل قهوة مختصة للمكاتب والشركات الناشئة في شمال الرياض",
    city: "الرياض",
    targetAudience: "BUSINESSES",
    latitude: 24.8216,
    longitude: 46.6633,
    expectedCapital: 500000,
    placeLabel: "الرياض - حي النرجس",
  },
  result: {
    generatedAt: "2026-10-17T08:00:00.000Z",
    evidenceCompleteness: 85,
    competitionLevel: "MODERATE",
    purchasingPowerLevel: "HIGH",
    dataRiskLevel: "LOW",
    competitorCount: 3,
    sourceCount: 2,
    limitationCount: 0,
    recommendations: ["VALIDATE_MARKET_DEMAND", "DIFFERENTIATE_OFFER"],
  },
};

describe("saved analysis reports", () => {
  it("keeps a private copy of a finished report, readable even after the project is gone", async () => {
    const owner = await db.user.create({ data: { email: `report-owner-${suffix}@example.test`, status: "ACTIVE" } });
    const outsider = await db.user.create({ data: { email: `report-outsider-${suffix}@example.test`, status: "ACTIVE" } });
    created.users.push(owner.id, outsider.id);
    const project = await createProject({ name: `Coffee delivery ${suffix}`, sector: "Food", countryCode: "SA" }, owner.id);
    created.projects.push(project.id);

    // A run that has not finished cannot be saved.
    await saveProjectAnalysisInput(project.id, { idea: finished.input.idea, city: "الرياض", targetAudience: "BUSINESSES", latitude: 24.8216, longitude: 46.6633 }, owner.id);
    await expect(saveAnalysisReportCopy(project.id, owner.id, "ar")).rejects.toThrow("Analysis not completed");
    expect(await findLatestAnalysisReportId(owner.id)).toBeNull();
    expect(await getProjectAnalysisStatus(project.id, owner.id)).toEqual({ status: "PENDING", stage: null });
    expect(await getProjectAnalysisStatus(project.id, outsider.id)).toBeNull();

    await db.project.update({ where: { id: project.id }, data: { analysisStudy: finished, analysisStudyUpdatedAt: new Date() } });
    await db.projectIntelligenceSnapshot.create({
      data: {
        projectId: project.id,
        query: "الرياض",
        location: { latitude: 24.8216, longitude: 46.6633, label: "الرياض" },
        population: { value: 36947025, year: 2024 },
        purchasingPower: { value: 58000, year: 2024 },
        costInflation: { value: 1.7, year: 2024 },
        competitors: [{ id: "c1", name: "Cafe A", kind: "cafe", latitude: 24.82, longitude: 46.66 }],
        sources: [{ source: "World Bank Open Data", retrievedAt: "2026-10-17T08:00:00.000Z", confidence: "HIGH" }],
        limitations: [],
        fetchedAt: new Date("2026-10-17T08:00:00.000Z"),
      },
    });
    expect(await findLatestAnalysisReportId(owner.id)).toBe(project.id);
    expect(await findLatestAnalysisReportId(outsider.id)).toBeNull();

    await expect(saveAnalysisReportCopy(project.id, outsider.id, "ar")).rejects.toThrow("Project not found");
    const first = await saveAnalysisReportCopy(project.id, owner.id, "ar");
    const again = await saveAnalysisReportCopy(project.id, owner.id, "en");
    expect(again.id).toBe(first.id);
    const listed = await listSavedAnalysisReports(owner.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: first.id, projectId: project.id, place: "الرياض - حي النرجس", locale: "en" });

    // Only the owner can read the copy.
    expect(await getSavedAnalysisReport(first.id, outsider.id)).toBeNull();
    expect(await listSavedAnalysisReports(outsider.id)).toEqual([]);

    // The copy holds the project facts, the location and the figures, not just a link.
    const live = await buildLiveReport(project.id, owner.id, "ar");
    const stored = await getSavedAnalysisReport(first.id, owner.id);
    expect(stored).not.toBeNull();
    const model = buildReport(stored!.data, "ar");
    expect(model.facts.find((fact) => fact.id === "idea")?.value).toBe(finished.input.idea);
    expect(model.place).toMatchObject({ name: "الرياض - حي النرجس", latitude: 24.8216, longitude: 46.6633 });
    expect(model.indicators.find((item) => item.id === "population")?.value).toContain("36.9");
    expect(model.indicators.find((item) => item.id === "competitors")?.state).toBe("ESTIMATED");
    expect(model.sources.length).toBeGreaterThan(0);
    expect(model.indicators.map((item) => item.value)).toEqual(live!.model.indicators.map((item) => item.value));

    // Deleting the project leaves the copy readable.
    await db.project.delete({ where: { id: project.id } });
    created.projects.splice(created.projects.indexOf(project.id), 1);
    const afterDelete = await getSavedAnalysisReport(first.id, owner.id);
    expect(afterDelete?.data.project.id).toBe(project.id);
    expect(buildReport(afterDelete!.data, "en").facts.find((fact) => fact.id === "location")?.value).toBe("الرياض - حي النرجس");

    const audit = await db.auditLog.findMany({ where: { actorId: owner.id, action: "project.analysis_report.saved" } });
    expect(audit).toHaveLength(2);
  });
});
