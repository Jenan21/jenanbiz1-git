import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  createProject,
  listUserProjects,
  recordProjectAssessment,
  startProject,
  updateProjectPhase,
} from "@/services/projects/project-service";

const suffix = crypto.randomUUID().slice(0, 8);
let userId: string | undefined;
let projectId: string | undefined;

afterAll(async () => {
  if (projectId) await db.project.delete({ where: { id: projectId } });
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

    const project = await createProject(
      { name: `Solar cold chain ${suffix}`, sector: "Logistics", countryCode: "SA" },
      user.id,
    );
    projectId = project.id;
    expect(project.phases).toHaveLength(7);
    expect(project.assessments).toHaveLength(6);
    expect(project.phases[0]?.status).toBe("ACTIVE");

    await expect(startProject(project.id, user.id)).rejects.toThrow("Complete all project assessments");
    await updateProjectPhase(project.id, "ANALYSIS", "COMPLETED", user.id, "Inputs reviewed");
    await recordProjectAssessment(project.id, { type: "MARKET", score: 84, summary: "Demand evidence captured", source: "verified research" }, user.id);

    for (const type of ["FINANCIAL", "OPERATIONAL", "RISK", "TECHNICAL", "COMPLIANCE"] as const) {
      await recordProjectAssessment(project.id, { type, score: 80 }, user.id);
    }

    const started = await startProject(project.id, user.id);
    expect(started.status).toBe("IN_PROGRESS");
    expect(started.currentPhase).toBe("EXECUTION");
    expect((await listUserProjects(user.id)).some((item) => item.id === project.id)).toBe(true);
    expect(await db.auditLog.count({ where: { entityType: "Project", entityId: project.id } })).toBeGreaterThanOrEqual(2);
  });
});
