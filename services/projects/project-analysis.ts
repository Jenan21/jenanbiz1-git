import { createHash, randomUUID } from "node:crypto";
import { ProjectMemberRole, ProjectStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { readStage, type AnalysisStage, type AnalysisStatus } from "@/lib/projects/analysis-study";
import {
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
    select: { analysisStudy: true, analysisStudyUpdatedAt: true },
  });
  if (!project) return null;
  const study = jsonObject(project.analysisStudy);
  const status = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"].includes(String(study?.status))
    ? (study?.status as AnalysisStatus)
    : "PENDING";
  return {
    status,
    stage: status === "PROCESSING" ? (readStage(study?.processingStep) ?? null) : null,
    runId: typeof study?.runId === "string" ? study.runId : null,
    inputRevision: typeof study?.inputRevision === "string" ? study.inputRevision : null,
    updatedAt: project.analysisStudyUpdatedAt?.toISOString() ?? null,
    errorCode: status === "FAILED" ? (study?.errorCode === "ANALYSIS_INPUT_REQUIRED" ? "ANALYSIS_INPUT_REQUIRED" : "ANALYSIS_FAILED") : null,
    retryable: status === "FAILED" && study?.retryable !== false,
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
  return db.$transaction(async (transaction) => {
    await lockProject(transaction, projectId);
    const project = await transaction.project.findFirst({
      where: { id: projectId, ...analysisAccessWhere(userId) },
      select: { id: true, analysisStudy: true, analysisStudyUpdatedAt: true },
    });
    if (!project) throw new Error("Project not found");
    const previousInput = persistedInput(project.analysisStudy);
    if (previousInput && inputHash(previousInput) === inputHash(input)) return project;
    const previous = jsonObject(project.analysisStudy);
    if (typeof previous?.runId === "string") {
      await transaction.operationsJob.updateMany({
        where: { id: previous.runId, kind: QUEUE_KEY, status: { in: ["QUEUED", "RETRYING", "LEASED"] } },
        data: { status: "CANCELLED", leaseToken: null, leaseExpiresAt: null, completedAt: new Date() },
      });
    }
    const updatedAt = new Date();
    const analysisStudy: Prisma.InputJsonObject = {
      version: 1,
      status: "PENDING",
      input: JSON.parse(JSON.stringify(input)),
      inputRevision: randomUUID(),
      updatedAt: updatedAt.toISOString(),
    };
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
  return db.$transaction(async (transaction) => {
    await lockProject(transaction, projectId);
    const project = await transaction.project.findFirst({
      where: { id: projectId, ...analysisAccessWhere(userId) },
      select: { analysisStudy: true, countryCode: true, id: true, sector: true },
    });
    if (!project) throw new Error("Project not found");
    const input = persistedInput(project.analysisStudy);
    if (!input) throw new Error("Project analysis input is required");
    const study = jsonObject(project.analysisStudy)!;
    const inputRevision = typeof study.inputRevision === "string" ? study.inputRevision : inputHash(input);
    const previous = typeof study.runId === "string"
      ? await transaction.operationsJob.findUnique({ where: { id: study.runId } })
      : null;
    if (previous && previous.kind === QUEUE_KEY &&
        ["QUEUED", "RETRYING", "LEASED", "SUCCEEDED"].includes(previous.status)) {
      return { projectId, runId: previous.id, inputRevision, status: study.status, reused: true };
    }
    // Preserve accepted legacy reports as well as new reports on repeated submissions.
    if (study.status === "COMPLETED" && jsonObject(study.result)) {
      return { projectId, runId: typeof study.runId === "string" ? study.runId : null, inputRevision, status: "COMPLETED", reused: true };
    }
    const queue = await transaction.operationsQueue.upsert({
      where: { key: QUEUE_KEY },
      create: { key: QUEUE_KEY, name: "Project analysis", concurrency: 1 },
      update: {},
    });
    const runId = randomUUID();
    const payload = { projectId, userId, inputRevision, input, countryCode: project.countryCode, sector: project.sector };
    await transaction.operationsJob.create({
      data: {
        id: runId, queueId: queue.id, kind: QUEUE_KEY,
        idempotencyKey: `${QUEUE_KEY}:${runId}`, traceId: runId,
        payload: JSON.parse(JSON.stringify(payload)), maxAttempts: 3,
      },
    });
    const at = new Date();
    await transaction.project.update({
      where: { id: projectId },
      data: {
        analysisStudy: { version: 1, input: JSON.parse(JSON.stringify(input)), inputRevision, runId, status: "PENDING", updatedAt: at.toISOString() },
        analysisStudyUpdatedAt: at,
      },
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "project.analysis.queued", entityType: "Project", entityId: projectId, metadata: { runId, inputRevision } },
    });
    return { projectId, runId, inputRevision, status: "PENDING", reused: false };
  });
}

const QUEUE_KEY = "PROJECT_ANALYSIS";
const LEASE_MS = 60_000;
const EXECUTION_TIMEOUT_MS = 180_000;
type Transaction = Prisma.TransactionClient;
type AnalysisJob = { id: string; leaseToken: string; attempts: number; maxAttempts: number; payload: unknown };
type JobPayload = { projectId: string; userId: string; inputRevision: string; input: ProjectAnalysisInput; countryCode?: string; sector?: string };

function inputHash(input: ProjectAnalysisInput) {
  return createHash("sha256").update(JSON.stringify(Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)),
  ))).digest("hex");
}

async function lockProject(transaction: Transaction, projectId: string) {
  await transaction.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
}

/** Isolated queue: every claim gets a new fencing token, including expired-lease recovery. */
export async function claimProjectAnalysisJob(): Promise<AnalysisJob | null> {
  const token = randomUUID();
  const jobs = await db.$queryRaw<AnalysisJob[]>`
    UPDATE "OperationsJob" j SET
      "status" = 'LEASED', "attempts" = j."attempts" + 1,
      "leaseToken" = ${token}, "leasedAt" = NOW(),
      "leaseExpiresAt" = NOW() + INTERVAL '60 seconds', "updatedAt" = NOW()
    WHERE j."id" = (
      SELECT candidate."id" FROM "OperationsJob" candidate
      JOIN "OperationsQueue" q ON q."id" = candidate."queueId"
      WHERE q."key" = ${QUEUE_KEY} AND q."paused" = false AND candidate."kind" = ${QUEUE_KEY}
        AND candidate."attempts" < candidate."maxAttempts"
        AND ((candidate."status" IN ('QUEUED', 'RETRYING') AND candidate."availableAt" <= NOW())
          OR (candidate."status" = 'LEASED' AND candidate."leaseExpiresAt" <= NOW()))
      ORDER BY candidate."priority" DESC, candidate."createdAt"
      FOR UPDATE OF candidate SKIP LOCKED LIMIT 1
    )
    RETURNING j."id", j."leaseToken", j."attempts", j."maxAttempts", j."payload"`;
  return jobs[0] ?? null;
}

/** Project lock and token check are held through stage, snapshot, result and audit writes. */
async function withOwnedRun(
  job: AnalysisJob, payload: JobPayload,
  write: (transaction: Transaction, study: Record<string, unknown>) => Promise<void>,
) {
  return db.$transaction(async (transaction) => {
    await lockProject(transaction, payload.projectId);
    const project = await transaction.project.findUnique({ where: { id: payload.projectId }, select: { analysisStudy: true } });
    const study = jsonObject(project?.analysisStudy);
    const owned = await transaction.operationsJob.updateMany({
      where: { id: job.id, kind: QUEUE_KEY, status: "LEASED", leaseToken: job.leaseToken, leaseExpiresAt: { gt: new Date() } },
      data: { leaseExpiresAt: new Date(Date.now() + LEASE_MS) },
    });
    if (!owned.count) return false;
    if (study?.runId !== job.id || study?.inputRevision !== payload.inputRevision) {
      await transaction.operationsJob.update({ where: { id: job.id }, data: { status: "CANCELLED", leaseToken: null, leaseExpiresAt: null, completedAt: new Date() } });
      return false;
    }
    await write(transaction, study);
    return true;
  });
}

async function writeStudy(transaction: Transaction, projectId: string, study: Record<string, unknown>) {
  const at = new Date();
  await transaction.project.update({
    where: { id: projectId },
    data: { analysisStudy: JSON.parse(JSON.stringify({ ...study, updatedAt: at.toISOString() })), analysisStudyUpdatedAt: at },
  });
}

/** Executes outside HTTP lifetimes; a failed/expired owner cannot publish even a snapshot. */
export async function executeProjectAnalysisJob(job: AnalysisJob) {
  const payload = job.payload as JobPayload;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let lostLease = false;
  const heartbeat = setInterval(() => {
    void withOwnedRun(job, payload, async () => {}).then((owned) => {
      if (!owned) { lostLease = true; controller.abort(); }
    }).catch(() => { lostLease = true; controller.abort(); });
  }, LEASE_MS / 3);
  const stage = async (processingStep: AnalysisStage) => {
    if (lostLease || !await withOwnedRun(job, payload, (transaction, study) =>
      writeStudy(transaction, payload.projectId, { ...study, status: "PROCESSING", processingStep }))) {
      throw new Error("Analysis lease lost");
    }
  };
  try {
    await stage("LOCATION");
    const work = async () => {
      const intelligence = await searchProjectIntelligence({
        query: payload.input.city, countryCode: payload.countryCode ?? undefined, sector: payload.sector ?? undefined,
        latitude: payload.input.latitude, longitude: payload.input.longitude,
      }, stage, { signal: controller.signal });
      await stage("RECOMMENDATIONS");
      const result = buildProjectAnalysisResult(intelligence);
      await stage("REPORT");
      return { intelligence, result };
    };
    const { intelligence, result } = await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error("Analysis deadline exceeded"));
        }, EXECUTION_TIMEOUT_MS);
      }),
    ]);
    if (lostLease) return;
    await withOwnedRun(job, payload, async (transaction, study) => {
      await transaction.projectIntelligenceSnapshot.create({
        data: {
          projectId: payload.projectId, query: payload.input.city,
          location: intelligence.location ?? Prisma.JsonNull,
          population: intelligence.population, purchasingPower: intelligence.purchasingPower,
          costInflation: intelligence.costInflation, competitors: intelligence.competitors,
          sources: intelligence.sources, limitations: intelligence.limitations,
          fetchedAt: new Date(intelligence.sources[0]?.fetchedAt ?? Date.now()),
        },
      });
      await writeStudy(transaction, payload.projectId, { ...study, status: "COMPLETED", processingStep: null, result });
      await transaction.operationsJob.update({
        where: { id: job.id }, data: { status: "SUCCEEDED", completedAt: new Date(), leaseToken: null, leaseExpiresAt: null, lastError: null },
      });
      await transaction.auditLog.create({
        data: { actorId: payload.userId, action: "project.analysis.completed", entityType: "Project", entityId: payload.projectId, metadata: { runId: job.id, inputRevision: payload.inputRevision } },
      });
    });
  } catch {
    await withOwnedRun(job, payload, async (transaction, study) => {
      const retry = job.attempts < job.maxAttempts;
      await writeStudy(transaction, payload.projectId, {
        ...study, status: retry ? "PENDING" : "FAILED", processingStep: null,
        errorCode: retry ? null : "ANALYSIS_FAILED", retryable: !retry,
      });
      await transaction.operationsJob.update({
        where: { id: job.id },
        data: { status: retry ? "RETRYING" : "FAILED", leaseToken: null, leaseExpiresAt: null, lastError: "ANALYSIS_FAILED", availableAt: new Date(Date.now() + job.attempts * 5000), completedAt: retry ? null : new Date() },
      });
      await transaction.auditLog.create({
        data: { actorId: payload.userId, action: retry ? "project.analysis.retrying" : "project.analysis.failed", entityType: "Project", entityId: payload.projectId, metadata: { runId: job.id, errorCode: "ANALYSIS_FAILED" } },
      });
    });
  } finally {
    lostLease = true;
    controller.abort();
    clearInterval(heartbeat);
    if (timeout) clearTimeout(timeout);
  }
}

/** Retires exhausted leases, and upgrades orphaned pre-queue studies without aging live jobs. */
export async function recoverProjectAnalysisJobs() {
  const exhausted = await db.operationsJob.findMany({
    where: { kind: QUEUE_KEY, status: "LEASED", leaseExpiresAt: { lte: new Date() } },
    take: 20,
  });
  for (const job of exhausted.filter((item) => item.attempts >= item.maxAttempts)) {
    const payload = job.payload as unknown as JobPayload;
    await db.$transaction(async (transaction) => {
      await lockProject(transaction, payload.projectId);
      const changed = await transaction.operationsJob.updateMany({
        where: { id: job.id, status: "LEASED", leaseToken: job.leaseToken, leaseExpiresAt: { lte: new Date() } },
        data: { status: "FAILED", lastError: "ANALYSIS_FAILED", leaseToken: null, leaseExpiresAt: null, completedAt: new Date() },
      });
      if (!changed.count) return;
      const project = await transaction.project.findUnique({ where: { id: payload.projectId }, select: { analysisStudy: true } });
      const study = jsonObject(project?.analysisStudy);
      if (study?.runId === job.id && study.inputRevision === payload.inputRevision) {
        await writeStudy(transaction, payload.projectId, { ...study, status: "FAILED", processingStep: null, errorCode: "ANALYSIS_FAILED", retryable: true });
      }
    });
  }
  const legacy = await db.$queryRaw<Array<{ id: string; createdById: string; analysisStudy: unknown }>>`
    SELECT p."id", p."createdById", p."analysisStudy" FROM "Project" p
    WHERE p."analysisStudy"->>'status' = 'PROCESSING'
      AND NOT EXISTS (
        SELECT 1 FROM "OperationsJob" j
        WHERE j."id" = p."analysisStudy"->>'runId' AND j."kind" = ${QUEUE_KEY}
      ) LIMIT 20`;
  for (const project of legacy) {
    if (!persistedInput(project.analysisStudy)) {
      await db.$transaction(async (transaction) => {
        await lockProject(transaction, project.id);
        const current = await transaction.project.findUnique({ where: { id: project.id }, select: { analysisStudy: true } });
        const study = jsonObject(current?.analysisStudy);
        if (study?.status === "PROCESSING" && !persistedInput(study)) {
          await writeStudy(transaction, project.id, { ...study, status: "FAILED", processingStep: null, errorCode: "ANALYSIS_INPUT_REQUIRED", retryable: false });
        }
      });
      continue;
    }
    await runProjectAnalysis(project.id, project.createdById);
  }
}
