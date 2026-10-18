import { ProjectMemberRole, ProjectStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { readStage, type AnalysisStage, type AnalysisStatus } from "@/lib/projects/analysis-study";
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
  latitude?: number;
  longitude?: number;
  expectedCapital?: number;
  areaSqm?: number;
  projectSize?: "SMALL" | "MEDIUM" | "LARGE";
  placeLabel?: string;
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

function analysisReadWhere(userId: string) {
  return { OR: [{ createdById: userId }, { members: { some: { userId } } }] };
}

/** Where the run of a project has got to; the screens poll this while the analysis is working. */
export async function getProjectAnalysisStatus(projectId: string, userId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, ...analysisReadWhere(userId) },
    select: { analysisStudy: true },
  });
  if (!project) return null;
  const study = jsonObject(project.analysisStudy);
  const status = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"].includes(String(study?.status))
    ? (study?.status as AnalysisStatus)
    : "PENDING";
  return {
    status,
    stage: status === "PROCESSING" ? (readStage(study?.processingStep) ?? null) : null,
  };
}

/** The user's most recent finished analysis, so the landing page offers «عرض التقرير» only when there is one. */
export async function findLatestAnalysisReportId(userId: string) {
  const project = await db.project.findFirst({
    where: {
      AND: [analysisReadWhere(userId), { analysisStudy: { path: ["status"], equals: "COMPLETED" } }],
    },
    orderBy: { analysisStudyUpdatedAt: "desc" },
    select: { id: true },
  });
  return project?.id ?? null;
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
  const hasCoordinates =
    typeof input.latitude === "number" &&
    typeof input.longitude === "number" &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude);
  return {
    idea: input.idea,
    city: input.city,
    targetAudience: targetAudience as ProjectAnalysisInput["targetAudience"],
    ...(budgetRange
      ? { budgetRange: budgetRange as ProjectAnalysisInput["budgetRange"] }
      : {}),
    ...(hasCoordinates
      ? { latitude: input.latitude as number, longitude: input.longitude as number }
      : {}),
    ...(typeof input.expectedCapital === "number" && input.expectedCapital > 0
      ? { expectedCapital: input.expectedCapital }
      : {}),
    ...(typeof input.areaSqm === "number" && input.areaSqm > 0 ? { areaSqm: input.areaSqm } : {}),
    ...(["SMALL", "MEDIUM", "LARGE"].includes(String(input.projectSize))
      ? { projectSize: input.projectSize as ProjectAnalysisInput["projectSize"] }
      : {}),
    ...(typeof input.placeLabel === "string" && input.placeLabel ? { placeLabel: input.placeLabel } : {}),
  };
}

export function buildProjectAnalysisResult(
  intelligence: ProjectIntelligenceResult,
): ProjectAnalysisResult {
  // A source with zero results is a gap in the map data, not proof of an empty market.
  const hasCompetitorSource =
    intelligence.competitors.length > 0 &&
    intelligence.sources.some((source) => source.source === "OpenStreetMap Overpass");
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
        processingStep: "LOCATION",
        updatedAt: processingAt.toISOString(),
      },
      analysisStudyUpdatedAt: processingAt,
    },
  });

  // The recorded step is only a progress hint for the screens: failing to write it must never fail the analysis.
  const markStage = async (stage: AnalysisStage) => {
    const at = new Date();
    await db.project
      .update({
        where: { id: projectId },
        data: {
          analysisStudy: {
            version: 1,
            status: "PROCESSING",
            input: JSON.parse(JSON.stringify(input)),
            processingStep: stage,
            updatedAt: at.toISOString(),
          },
          analysisStudyUpdatedAt: at,
        },
      })
      .catch(() => undefined);
  };

  try {
    const intelligence = await searchProjectIntelligence(
      {
        query: input.city,
        ...(input.latitude !== undefined && input.longitude !== undefined
          ? { latitude: input.latitude, longitude: input.longitude }
          : {}),
        countryCode: project.countryCode ?? undefined,
        sector: project.sector ?? undefined,
      },
      markStage,
    );
    await markStage("RECOMMENDATIONS");
    const result = buildProjectAnalysisResult(intelligence);
    await markStage("REPORT");
    await saveProjectIntelligenceSnapshot(projectId, input.city, intelligence);
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
