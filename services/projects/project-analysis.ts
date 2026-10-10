import { ProjectMemberRole, ProjectStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  saveProjectIntelligenceSnapshot,
  searchProjectIntelligence,
  type ProjectIntelligenceResult,
} from "@/services/projects/project-intelligence";

export type ProjectAnalysisInput = {
  idea: string;
  city: string;
  targetAudience: "CONSUMERS" | "BUSINESSES" | "YOUTH" | "FAMILIES";
  budgetRange?: "UNDER_100K" | "BETWEEN_100K_500K" | "BETWEEN_500K_1M" | "ABOVE_1M";
};

export type ProjectAnalysisResult = {
  generatedAt: string;
  evidenceCompleteness: number;
  competitionLevel: "LOW" | "MODERATE" | "HIGH" | "UNAVAILABLE";
  purchasingPowerLevel: "LOW" | "MODERATE" | "HIGH" | "UNAVAILABLE";
  dataRiskLevel: "LOW" | "MODERATE" | "HIGH";
  competitorCount: number | null;
  sourceCount: number;
  limitationCount: number;
  recommendations: Array<
    | "VALIDATE_MARKET_DEMAND"
    | "DIFFERENTIATE_OFFER"
    | "OBTAIN_LOCAL_PURCHASING_DATA"
    | "VERIFY_LOCATION"
    | "REVIEW_SOURCE_LIMITATIONS"
    | "PROCEED_TO_DETAILED_FEASIBILITY"
  >;
};

function analysisAccessWhere(userId: string) {
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

function persistedInput(value: unknown): ProjectAnalysisInput | undefined {
  const study = jsonObject(value);
  const input = jsonObject(study?.input);
  const targetAudience = input?.targetAudience;
  const budgetRange = input?.budgetRange;
  if (
    typeof input?.idea !== "string" ||
    typeof input.city !== "string" ||
    !["CONSUMERS", "BUSINESSES", "YOUTH", "FAMILIES"].includes(
      String(targetAudience),
    )
  ) {
    return undefined;
  }
  if (
    budgetRange !== undefined &&
    ![
      "UNDER_100K",
      "BETWEEN_100K_500K",
      "BETWEEN_500K_1M",
      "ABOVE_1M",
    ].includes(String(budgetRange))
  ) {
    return undefined;
  }
  return {
    idea: input.idea,
    city: input.city,
    targetAudience: targetAudience as ProjectAnalysisInput["targetAudience"],
    ...(budgetRange
      ? { budgetRange: budgetRange as ProjectAnalysisInput["budgetRange"] }
      : {}),
  };
}

export function buildProjectAnalysisResult(
  intelligence: ProjectIntelligenceResult,
): ProjectAnalysisResult {
  const hasCompetitorSource = intelligence.sources.some(
    (source) => source.source === "OpenStreetMap Overpass",
  );
  const hasReliableSources =
    intelligence.sources.filter(
      (source) => source.confidence === "HIGH" || source.confidence === "MEDIUM",
    ).length >= 2;
  const evidenceCompleteness =
    (intelligence.location ? 15 : 0) +
    (intelligence.population.value !== null ? 20 : 0) +
    (intelligence.purchasingPower.value !== null ? 20 : 0) +
    (intelligence.costInflation.value !== null ? 15 : 0) +
    (hasCompetitorSource ? 15 : 0) +
    (hasReliableSources ? 15 : 0);
  const competitionLevel = !hasCompetitorSource
    ? "UNAVAILABLE"
    : intelligence.competitors.length > 20
      ? "HIGH"
      : intelligence.competitors.length > 5
        ? "MODERATE"
        : "LOW";
  const purchasingPower = intelligence.purchasingPower.value;
  const purchasingPowerLevel =
    purchasingPower === null
      ? "UNAVAILABLE"
      : purchasingPower >= 50_000
        ? "HIGH"
        : purchasingPower >= 25_000
          ? "MODERATE"
          : "LOW";
  const dataRiskLevel =
    intelligence.limitations.length >= 4
      ? "HIGH"
      : intelligence.limitations.length >= 2
        ? "MODERATE"
        : "LOW";
  const recommendations: ProjectAnalysisResult["recommendations"] = [
    "VALIDATE_MARKET_DEMAND",
  ];
  if (competitionLevel === "MODERATE" || competitionLevel === "HIGH") {
    recommendations.push("DIFFERENTIATE_OFFER");
  }
  if (purchasingPower === null) {
    recommendations.push("OBTAIN_LOCAL_PURCHASING_DATA");
  }
  if (!intelligence.location) recommendations.push("VERIFY_LOCATION");
  if (intelligence.limitations.length) {
    recommendations.push("REVIEW_SOURCE_LIMITATIONS");
  }
  if (evidenceCompleteness >= 70) {
    recommendations.push("PROCEED_TO_DETAILED_FEASIBILITY");
  }
  return {
    generatedAt: new Date().toISOString(),
    evidenceCompleteness,
    competitionLevel,
    purchasingPowerLevel,
    dataRiskLevel,
    competitorCount: hasCompetitorSource
      ? intelligence.competitors.length
      : null,
    sourceCount: intelligence.sources.length,
    limitationCount: intelligence.limitations.length,
    recommendations,
  };
}

export async function saveProjectAnalysisInput(
  projectId: string,
  input: ProjectAnalysisInput,
  userId: string,
) {
  const updatedAt = new Date();
  const analysisStudy: Prisma.InputJsonObject = {
    version: 1,
    status: "PENDING",
    input: JSON.parse(JSON.stringify(input)),
    updatedAt: updatedAt.toISOString(),
  };
  return db.$transaction(async (transaction) => {
    const project = await transaction.project.findFirst({
      where: { id: projectId, ...analysisAccessWhere(userId) },
      select: { id: true },
    });
    if (!project) throw new Error("Project not found");
    const updated = await transaction.project.update({
      where: { id: projectId },
      data: {
        analysisStudy,
        analysisStudyUpdatedAt: updatedAt,
        status: ProjectStatus.ANALYSIS,
      },
      select: {
        analysisStudy: true,
        analysisStudyUpdatedAt: true,
        id: true,
      },
    });
    await transaction.auditLog.create({
      data: {
        actorId: userId,
        action: "project.analysis_input.saved",
        entityType: "Project",
        entityId: projectId,
        metadata: {
          hasBudgetRange: Boolean(input.budgetRange),
          targetAudience: input.targetAudience,
        },
      },
    });
    return updated;
  });
}

export async function runProjectAnalysis(projectId: string, userId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, ...analysisAccessWhere(userId) },
    select: {
      analysisStudy: true,
      countryCode: true,
      id: true,
      sector: true,
    },
  });
  if (!project) throw new Error("Project not found");
  const input = persistedInput(project.analysisStudy);
  if (!input) throw new Error("Project analysis input is required");
  const currentStudy = jsonObject(project.analysisStudy);
  if (currentStudy?.status === "PROCESSING") {
    throw new Error("Project analysis is already processing");
  }
  if (currentStudy?.status === "COMPLETED" && jsonObject(currentStudy.result)) {
    return { analysisStudy: project.analysisStudy, reused: true };
  }

  const processingAt = new Date();
  await db.project.update({
    where: { id: projectId },
    data: {
      analysisStudy: {
        version: 1,
        status: "PROCESSING",
        input: JSON.parse(JSON.stringify(input)),
        processingStep: "MARKET_INTELLIGENCE",
        updatedAt: processingAt.toISOString(),
      },
      analysisStudyUpdatedAt: processingAt,
    },
  });

  try {
    const intelligence = await searchProjectIntelligence({
      query: input.city,
      countryCode: project.countryCode ?? undefined,
      sector: project.sector ?? undefined,
    });
    await saveProjectIntelligenceSnapshot(projectId, input.city, intelligence);
    const result = buildProjectAnalysisResult(intelligence);
    const completedAt = new Date();
    const analysisStudy: Prisma.InputJsonObject = {
      version: 1,
      status: "COMPLETED",
      input: JSON.parse(JSON.stringify(input)),
      result: JSON.parse(JSON.stringify(result)),
      updatedAt: completedAt.toISOString(),
    };
    const updated = await db.$transaction(async (transaction) => {
      const saved = await transaction.project.update({
        where: { id: projectId },
        data: {
          analysisStudy,
          analysisStudyUpdatedAt: completedAt,
        },
        select: {
          analysisStudy: true,
          analysisStudyUpdatedAt: true,
          id: true,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorId: userId,
          action: "project.analysis.completed",
          entityType: "Project",
          entityId: projectId,
          metadata: {
            competitorCount: result.competitorCount,
            evidenceCompleteness: result.evidenceCompleteness,
            sourceCount: result.sourceCount,
          },
        },
      });
      return saved;
    });
    return { ...updated, intelligence, reused: false };
  } catch (error) {
    const failedAt = new Date();
    const message =
      error instanceof Error ? error.message : "Project analysis failed";
    await db.$transaction([
      db.project.update({
        where: { id: projectId },
        data: {
          analysisStudy: {
            version: 1,
            status: "FAILED",
            input: JSON.parse(JSON.stringify(input)),
            error: message,
            updatedAt: failedAt.toISOString(),
          },
          analysisStudyUpdatedAt: failedAt,
        },
      }),
      db.auditLog.create({
        data: {
          actorId: userId,
          action: "project.analysis.failed",
          entityType: "Project",
          entityId: projectId,
          metadata: { message },
        },
      }),
    ]);
    throw error;
  }
}
