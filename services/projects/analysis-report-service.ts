import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { buildReport, type ReportData } from "@/lib/projects/analysis-report";
import { asRecord, readStudy, type IntelligenceSnapshot } from "@/lib/projects/analysis-study";
import type { Locale } from "@/types/i18n";

export const ANALYSIS_REPORT_KIND = "PROJECT_ANALYSIS";
const COPY_VERSION = 1;

const projectAccess = (userId: string) => ({ OR: [{ createdById: userId }, { members: { some: { userId } } }] });

/** The facts a report is built from, read for a person who may see the project; null when they may not. */
export async function loadAnalysisReportData(projectId: string, userId: string): Promise<ReportData | null> {
  const project = await db.project.findFirst({
    where: { id: projectId, ...projectAccess(userId) },
    select: {
      id: true,
      name: true,
      sector: true,
      countryCode: true,
      analysisStudy: true,
      intelligenceSnapshots: { orderBy: { fetchedAt: "desc" }, take: 1 },
    },
  });
  if (!project) return null;
  const row = project.intelligenceSnapshots[0];
  const snapshot: IntelligenceSnapshot | undefined = row
    ? {
        id: row.id,
        query: row.query,
        location: row.location ?? undefined,
        population: row.population ?? undefined,
        purchasingPower: row.purchasingPower ?? undefined,
        costInflation: row.costInflation ?? undefined,
        competitors: row.competitors ?? undefined,
        sources: row.sources,
        limitations: row.limitations,
        fetchedAt: row.fetchedAt.toISOString(),
      }
    : undefined;
  return {
    project: { id: project.id, name: project.name, sector: project.sector, countryCode: project.countryCode },
    study: readStudy(project.analysisStudy),
    snapshot,
  };
}

/**
 * Stores a copy of the finished report in the person's own data: the project facts, the location and every figure as they
 * stand now. Saving again replaces the copy, so there is one per project.
 */
export async function saveAnalysisReportCopy(projectId: string, userId: string, locale: Locale) {
  const data = await loadAnalysisReportData(projectId, userId);
  if (!data) throw new Error("Project not found");
  if (data.study.status !== "COMPLETED" || !data.study.result) throw new Error("Analysis not completed");
  const title = data.study.input?.idea?.trim().slice(0, 160) || data.project.name;
  const snapshot = JSON.parse(JSON.stringify({ version: COPY_VERSION, data })) as Prisma.InputJsonObject;
  const saved = await db.$transaction(async (transaction) => {
    const copy = await transaction.savedReport.upsert({
      where: { userId_projectId_kind: { userId, projectId, kind: ANALYSIS_REPORT_KIND } },
      create: { userId, projectId, kind: ANALYSIS_REPORT_KIND, title, locale, snapshot },
      update: { title, locale, snapshot },
      select: { id: true, updatedAt: true },
    });
    await transaction.auditLog.create({
      data: {
        actorId: userId,
        action: "project.analysis_report.saved",
        entityType: "SavedReport",
        entityId: copy.id,
        metadata: { projectId },
      },
    });
    return copy;
  });
  return { id: saved.id, savedAt: saved.updatedAt.toISOString() };
}

export type SavedReportSummary = {
  id: string;
  projectId: string;
  title: string;
  place: string;
  locale: string;
  savedAt: string;
};

/** A stored copy read back into the same shape the live report is built from; null for anyone but its owner. */
export async function getSavedAnalysisReport(id: string, userId: string) {
  const row = await db.savedReport.findFirst({ where: { id, userId, kind: ANALYSIS_REPORT_KIND } });
  if (!row) return null;
  const stored = asRecord(row.snapshot);
  const data = asRecord(stored?.data);
  const project = asRecord(data?.project);
  if (!data || typeof project?.id !== "string") return null;
  const report: ReportData = {
    project: {
      id: project.id,
      name: typeof project.name === "string" ? project.name : row.title,
      sector: typeof project.sector === "string" ? project.sector : null,
      countryCode: typeof project.countryCode === "string" ? project.countryCode : null,
    },
    study: readStudy(data.study),
    snapshot: asRecord(data.snapshot) as IntelligenceSnapshot | undefined,
  };
  return { id: row.id, locale: row.locale as Locale, title: row.title, savedAt: row.updatedAt.toISOString(), data: report };
}

export async function listSavedAnalysisReports(userId: string): Promise<SavedReportSummary[]> {
  const rows = await db.savedReport.findMany({
    where: { userId, kind: ANALYSIS_REPORT_KIND },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, projectId: true, title: true, locale: true, updatedAt: true, snapshot: true },
  });
  return rows.map((row) => {
    const input = asRecord(asRecord(asRecord(asRecord(row.snapshot)?.data)?.study)?.input);
    return {
      id: row.id,
      projectId: row.projectId,
      title: row.title,
      place: typeof input?.placeLabel === "string" ? input.placeLabel : typeof input?.city === "string" ? input.city : "",
      locale: row.locale,
      savedAt: row.updatedAt.toISOString(),
    };
  });
}

/** The localized report model of a live project, for the PDF; null when the project is not visible to the person. */
export async function buildLiveReport(projectId: string, userId: string, locale: Locale) {
  const data = await loadAnalysisReportData(projectId, userId);
  return data ? { data, model: buildReport(data, locale) } : null;
}
