import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  addProjectMember,
  createProjectComplianceItem,
  createProject,
  createProjectRisk,
  createProjectVendor,
  listUserProjectsPage,
  listUserProjects,
  recordProjectDecision,
  recordProjectAssessment,
  saveProjectFeasibilityStudySection,
  saveProjectFinancialPlan,
  startProject,
  updateProjectComplianceStatus,
  updateProjectRiskStatus,
  updateProjectPhase,
  updateProjectVendorStatus,
} from "@/services/projects/project-service";

const suffix = crypto.randomUUID().slice(0, 8);
let userId: string | undefined;
let editorId: string | undefined;
let reviewerId: string | undefined;
let outsiderId: string | undefined;
let outsiderProjectId: string | undefined;
let projectId: string | undefined;

afterAll(async () => {
  if (projectId) await db.project.delete({ where: { id: projectId } });
  if (outsiderProjectId) await db.project.delete({ where: { id: outsiderProjectId } });
  if (editorId) await db.user.delete({ where: { id: editorId } });
  if (reviewerId) await db.user.delete({ where: { id: reviewerId } });
  if (outsiderId) await db.user.delete({ where: { id: outsiderId } });
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

describe("projects domain", () => {
  it("runs the project lifecycle with gated start and auditable assessments", async () => {
    const user = await db.user.create({
      data: {
        email: `projects-${suffix}@example.test`,
        status: "ACTIVE",
        profile: { create: { displayName: "Projects owner", locale: "en", language: "en" } },
      },
    });
    userId = user.id;
    const [editor, reviewer] = await Promise.all([
      db.user.create({ data: { email: `projects-editor-${suffix}@example.test`, status: "ACTIVE" } }),
      db.user.create({ data: { email: `projects-reviewer-${suffix}@example.test`, status: "ACTIVE" } }),
    ]);
    editorId = editor.id;
    reviewerId = reviewer.id;
    const outsider = await db.user.create({ data: { email: `projects-outsider-${suffix}@example.test`, status: "ACTIVE" } });
    outsiderId = outsider.id;

    const project = await createProject(
      { name: `Solar cold chain ${suffix}`, sector: "Logistics", countryCode: "SA" },
      user.id,
    );
    projectId = project.id;
    outsiderProjectId = (await createProject({ name: `Private outsider portfolio ${suffix}`, sector: "Private" }, outsider.id)).id;
    await addProjectMember(project.id, { email: editor.email, role: "EDITOR" }, user.id);
    await addProjectMember(project.id, { email: reviewer.email, role: "REVIEWER" }, user.id);
    expect((await listUserProjects(editor.id)).some((item) => item.id === project.id)).toBe(true);
    const filteredPage = await listUserProjectsPage(editor.id, { limit: 1, offset: 0, search: `Private outsider portfolio ${suffix}` });
    expect(filteredPage.projects).toHaveLength(0);
    const ownerPage = await listUserProjectsPage(user.id, { limit: 1, offset: 0, status: "DRAFT" });
    expect(ownerPage.page.total).toBe(1);
    expect(ownerPage.page.hasMore).toBe(false);
    expect(project.phases).toHaveLength(7);
    expect(project.assessments).toHaveLength(6);
    expect(project.phases[0]?.status).toBe("ACTIVE");

    await saveProjectFeasibilityStudySection(
      project.id,
      {
        section: "GENERAL",
        data: {
          description: "A documented professional feasibility study.",
          legalNature: "Limited liability company",
          location: "Riyadh",
          projectType: "Service",
          size: "MEDIUM",
        },
      },
      user.id,
    );
    await saveProjectFeasibilityStudySection(
      project.id,
      {
        section: "MARKET",
        data: {
          competitorNotes: "Named competitors were reviewed.",
          customerSegment: "Regional logistics operators",
          demandTrend: "Documented demand growth",
          distributionNotes: "Direct distribution",
          marketSizeNotes: "Source-backed market estimate",
          pricingNotes: "Comparable contract pricing",
          scope: "REGIONAL",
        },
      },
      editor.id,
    );
    await expect(
      saveProjectFeasibilityStudySection(
        project.id,
        { section: "SWOT", data: { strengths: "Private" } },
        reviewer.id,
      ),
    ).rejects.toThrow("Project not found");
    await expect(
      saveProjectFeasibilityStudySection(
        project.id,
        { section: "SWOT", data: { strengths: "Private" } },
        outsider.id,
      ),
    ).rejects.toThrow("Project not found");
    const feasibilityDraft = await db.project.findUniqueOrThrow({
      where: { id: project.id },
      select: { feasibilityStudy: true, feasibilityStudyUpdatedAt: true },
    });
    expect(feasibilityDraft.feasibilityStudyUpdatedAt).not.toBeNull();
    expect(feasibilityDraft.feasibilityStudy).toMatchObject({
      sections: {
        GENERAL: { location: "Riyadh", size: "MEDIUM" },
        MARKET: { scope: "REGIONAL" },
      },
      version: 1,
    });
    expect(
      await db.auditLog.count({
        where: {
          action: "project.feasibility_section.saved",
          entityId: project.id,
        },
      }),
    ).toBe(2);

    await expect(startProject(project.id, user.id)).rejects.toThrow("Approved evaluation evidence");
    await expect(recordProjectAssessment(project.id, { type: "MARKET", score: 84 }, user.id)).rejects.toThrow("requires a summary and source");
    await expect(updateProjectPhase(project.id, "FEASIBILITY", "COMPLETED", user.id)).rejects.toThrow("Activate the project phase");
    await updateProjectPhase(project.id, "ANALYSIS", "COMPLETED", user.id, "Inputs reviewed");
    await recordProjectAssessment(project.id, { type: "MARKET", score: 84, summary: "Demand evidence captured", source: "verified research" }, editor.id);
    await Promise.all([
      recordProjectAssessment(project.id, { type: "MARKET", score: 85, summary: "Concurrent market evidence A", source: "verified research A" }, editor.id),
      recordProjectAssessment(project.id, { type: "MARKET", score: 86, summary: "Concurrent market evidence B", source: "verified research B" }, editor.id),
    ]);

    for (const type of ["FINANCIAL", "OPERATIONAL", "RISK", "TECHNICAL", "COMPLIANCE"] as const) {
      await recordProjectAssessment(project.id, { type, score: 80, summary: "Evidence reviewed", source: "verified research" }, editor.id);
    }

    const financialPlan = await saveProjectFinancialPlan(project.id, { inputs: { price: 50 }, baseCase: { roiPercent: 80 }, scenarios: [{ scenario: "EXPECTED" }] }, user.id);
    expect(financialPlan.version).toBe(1);
    const risk = await createProjectRisk(project.id, { category: "MARKET", title: "Demand variance", likelihood: 3, impact: 4, mitigation: "Review demand weekly and adjust capacity.", ownerLabel: "Project owner" }, user.id);
    expect(risk.score).toBe(12);
    expect((await updateProjectRiskStatus(project.id, risk.id, "MITIGATING", user.id)).status).toBe("MITIGATING");
    const compliance = await createProjectComplianceItem(project.id, { authority: "Municipality", kind: "LICENSE", reference: "LIC-2026", title: "Operating license" }, editor.id);
    expect((await updateProjectComplianceStatus(project.id, compliance.id, "APPROVED", editor.id)).status).toBe("APPROVED");
    const vendor = await createProjectVendor(project.id, { category: "Equipment", contactEmail: "vendor@example.test", kind: "VENDOR", name: "Verified equipment supplier" }, editor.id);
    expect((await updateProjectVendorStatus(project.id, vendor.id, "ACTIVE", editor.id)).status).toBe("ACTIVE");
    await expect(createProjectVendor(project.id, { kind: "PARTNER", name: "Unauthorized partner" }, outsider.id)).rejects.toThrow("Project not found");
    expect(await db.projectAssessmentRevision.count({ where: { projectId: project.id } })).toBe(8);
    const marketRevisions = await db.projectAssessmentRevision.findMany({ where: { projectId: project.id, assessment: { type: "MARKET" } }, orderBy: { version: "asc" } });
    expect(marketRevisions.map((revision) => revision.version)).toEqual([1, 2, 3]);
    await expect(startProject(project.id, user.id)).rejects.toThrow("A recorded approval decision is required before starting");
    await updateProjectPhase(project.id, "FEASIBILITY", "ACTIVE", user.id);
    await updateProjectPhase(project.id, "FEASIBILITY", "COMPLETED", user.id, "Financial model reviewed");
    await updateProjectPhase(project.id, "EVALUATION", "ACTIVE", user.id);
    const decision = await recordProjectDecision(project.id, { verdict: "APPROVE", rationale: "All documented assessment evidence supports a controlled launch." }, reviewer.id);
    expect(decision.verdict).toBe("APPROVE");
    await updateProjectPhase(project.id, "EVALUATION", "COMPLETED", user.id, "Approved by documented evidence");
    await updateProjectPhase(project.id, "PLANNING", "ACTIVE", user.id);
    await updateProjectPhase(project.id, "PLANNING", "COMPLETED", user.id, "Delivery plan approved");

    await expect(startProject(project.id, editor.id)).rejects.toThrow("Project not found");
    const started = await startProject(project.id, user.id);
    expect(started.status).toBe("IN_PROGRESS");
    expect(started.currentPhase).toBe("EXECUTION");
    expect((await listUserProjects(user.id)).some((item) => item.id === project.id)).toBe(true);
    const persistedProject = (await listUserProjects(user.id)).find((item) => item.id === project.id);
    expect(persistedProject?.complianceItems).toHaveLength(1);
    expect(persistedProject?.vendors).toHaveLength(1);
    expect(await db.auditLog.count({ where: { entityType: "Project", entityId: project.id } })).toBeGreaterThanOrEqual(2);
  });
});
