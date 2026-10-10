import { ProjectMemberRole, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export type ProjectLaunchSection =
  "BASICS" | "BUDGET" | "TEAM" | "TIMELINE" | "TASKS";

function launchAccessWhere(userId: string) {
  return {
    OR: [
      { createdById: userId },
      {
        members: {
          some: {
            userId,
            role: { in: [ProjectMemberRole.OWNER, ProjectMemberRole.EDITOR] },
          },
        },
      },
    ],
  };
}

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function getProjectLaunchPlanReadiness(value: unknown) {
  const plan = jsonObject(value);
  const sections = jsonObject(plan?.sections);
  const basics = jsonObject(sections?.BASICS);
  const budget = jsonObject(sections?.BUDGET);
  const timeline = jsonObject(sections?.TIMELINE);
  const missing: string[] = [];
  if (
    !basics ||
    typeof basics.projectName !== "string" ||
    !basics.projectName.trim() ||
    typeof basics.idea !== "string" ||
    !basics.idea.trim()
  ) {
    missing.push("BASICS");
  }
  if (
    !budget ||
    typeof budget.totalBudget !== "number" ||
    budget.totalBudget <= 0 ||
    !Array.isArray(budget.allocations) ||
    budget.allocations.length === 0
  ) {
    missing.push("BUDGET");
  }
  if (
    !timeline ||
    typeof timeline.startDate !== "string" ||
    typeof timeline.targetLaunchDate !== "string" ||
    !Array.isArray(timeline.milestones) ||
    timeline.milestones.length !== 6
  ) {
    missing.push("TIMELINE");
  }
  return { ready: missing.length === 0, missing };
}

export async function saveProjectLaunchPlanSection(
  projectId: string,
  input: {
    section: ProjectLaunchSection;
    data: Record<string, unknown>;
  },
  userId: string,
) {
  return db.$transaction(async (transaction) => {
    const project = await transaction.project.findFirst({
      where: { id: projectId, ...launchAccessWhere(userId) },
      select: { id: true, launchPlan: true },
    });
    if (!project) throw new Error("Project not found");

    const currentPlan: Prisma.InputJsonObject = project.launchPlan
      ? JSON.parse(JSON.stringify(project.launchPlan))
      : {};
    const currentSections =
      currentPlan.sections &&
      typeof currentPlan.sections === "object" &&
      !Array.isArray(currentPlan.sections)
        ? currentPlan.sections
        : {};
    const sectionData: Prisma.InputJsonObject = JSON.parse(
      JSON.stringify(input.data),
    );
    const updatedAt = new Date();
    const launchPlan: Prisma.InputJsonObject = {
      version: 1,
      sections: {
        ...currentSections,
        [input.section]: sectionData,
      },
      updatedAt: updatedAt.toISOString(),
    };
    const updated = await transaction.project.update({
      where: { id: projectId },
      data: {
        launchPlan,
        launchPlanUpdatedAt: updatedAt,
        ...(input.section === "BASICS"
          ? {
              name: String(input.data.projectName).trim(),
              description: String(input.data.idea).trim(),
              sector: String(input.data.sector).trim(),
            }
          : {}),
      },
      select: {
        id: true,
        launchPlan: true,
        launchPlanUpdatedAt: true,
        name: true,
      },
    });
    await transaction.auditLog.create({
      data: {
        actorId: userId,
        action: "project.launch_section.saved",
        entityType: "Project",
        entityId: projectId,
        metadata: { section: input.section },
      },
    });
    return updated;
  });
}
