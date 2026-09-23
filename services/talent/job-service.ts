import { JobApplicationStatus, JobPostingStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const postingInclude = {
  createdBy: { include: { profile: true } },
  organization: { select: { id: true, name: true } },
  applications: { select: { applicantId: true, status: true } },
} satisfies Prisma.JobPostingInclude;

export type JobPostingFilters = {
  countryCode?: string;
  limit?: number;
  offset?: number;
  search?: string;
  status?: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
  workMode?: "ON_SITE" | "HYBRID" | "REMOTE";
};

function normalizeSkills(value?: string) {
  return (value ?? "")
    .split(/[,،\n]/)
    .map((skill) => skill.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

function assessJobQuality(input: {
  city?: string;
  countryCode?: string;
  department?: string;
  description: string;
  requiredSkills?: string;
  salaryMaxMinor?: number;
  salaryMinMinor?: number;
  title: string;
}) {
  const skills = normalizeSkills(input.requiredSkills);
  const signals = {
    clearDescription: input.description.trim().length >= 160,
    hasCountry: Boolean(input.countryCode?.trim()),
    hasDepartment: Boolean(input.department?.trim()),
    hasLocation: Boolean(input.city?.trim() || input.countryCode?.trim()),
    hasSalaryRange: Boolean(input.salaryMinMinor && input.salaryMaxMinor && input.salaryMaxMinor >= input.salaryMinMinor),
    hasSkills: skills.length >= 3,
    strongTitle: input.title.trim().length >= 8,
  };
  const score = Math.min(100,
    18 +
    (signals.strongTitle ? 10 : 0) +
    (signals.clearDescription ? 22 : 0) +
    (signals.hasDepartment ? 10 : 0) +
    (signals.hasLocation ? 12 : 0) +
    (signals.hasCountry ? 8 : 0) +
    (signals.hasSalaryRange ? 18 : 0) +
    (signals.hasSkills ? 22 : 0),
  );
  return { score, signals, skills };
}

function scoreApplicationMatch(posting: { description: string; requiredSkills: Prisma.JsonValue | null; title: string }, message?: string) {
  const requiredSkills = Array.isArray(posting.requiredSkills)
    ? posting.requiredSkills.filter((skill): skill is string => typeof skill === "string")
    : [];
  const haystack = `${posting.title} ${posting.description} ${message ?? ""}`.toLowerCase();
  const matchedSkills = requiredSkills.filter((skill) => haystack.includes(skill.toLowerCase()));
  const hasMeaningfulMessage = (message?.trim().length ?? 0) >= 80;
  const score = Math.min(100, 30 + (hasMeaningfulMessage ? 20 : 0) + (requiredSkills.length ? Math.round((matchedSkills.length / requiredSkills.length) * 50) : 20));
  return { score, signals: { hasMeaningfulMessage, matchedSkills, requiredSkills } };
}

function slugify(value: string) {
  const slug = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  return slug || "job";
}

export async function listJobPostings(userId: string, filters: JobPostingFilters = {}) {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  const query = filters.search?.trim();
  return db.jobPosting.findMany({
    where: {
      AND: [
        { OR: [{ status: JobPostingStatus.PUBLISHED }, { createdById: userId }] },
        filters.status ? { status: JobPostingStatus[filters.status] } : {},
        filters.workMode ? { workMode: filters.workMode } : {},
        filters.countryCode ? { countryCode: filters.countryCode.trim().toUpperCase() } : {},
        query ? { OR: [{ title: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }, { department: { contains: query, mode: "insensitive" } }, { city: { contains: query, mode: "insensitive" } }] } : {},
      ],
    },
    include: postingInclude,
    orderBy: [{ qualityScore: "desc" }, { updatedAt: "desc" }],
    skip: offset,
    take: limit,
  });
}

export async function createJobPosting(input: { city?: string; countryCode?: string; currency?: string; department?: string; description: string; requiredSkills?: string; salaryMaxMinor?: number; salaryMinMinor?: number; title: string; workMode: "ON_SITE" | "HYBRID" | "REMOTE" }, userId: string) {
  const quality = assessJobQuality(input);
  return db.$transaction(async (transaction) => {
    const posting = await transaction.jobPosting.create({
      data: { city: input.city?.trim() || undefined, countryCode: input.countryCode?.trim().toUpperCase() || undefined, currency: input.currency?.trim().toUpperCase() || "SAR", department: input.department?.trim() || undefined, description: input.description.trim(), qualityScore: quality.score, qualitySignals: quality.signals, requiredSkills: quality.skills, salaryMaxMinor: input.salaryMaxMinor, salaryMinMinor: input.salaryMinMinor, title: input.title.trim(), workMode: input.workMode, slug: `${slugify(input.title)}-${crypto.randomUUID().slice(0, 8)}`, createdById: userId },
      include: postingInclude,
    });
    await transaction.auditLog.create({ data: { actorId: userId, action: "talent.job.created", entityType: "JobPosting", entityId: posting.id } });
    return posting;
  });
}

export async function updateJobPostingStatus(jobPostingId: string, status: "PUBLISHED" | "CLOSED" | "ARCHIVED", userId: string) {
  return db.$transaction(async (transaction) => {
    const posting = await transaction.jobPosting.findFirst({ where: { id: jobPostingId, createdById: userId }, select: { id: true, qualityScore: true } });
    if (!posting) throw new Error("Job posting not found");
    if (status === "PUBLISHED" && posting.qualityScore < 55) throw new Error("Job posting quality score is too low to publish");
    const updated = await transaction.jobPosting.update({ where: { id: jobPostingId }, data: { status }, include: postingInclude });
    await transaction.auditLog.create({ data: { actorId: userId, action: "talent.job.status.updated", entityType: "JobPosting", entityId: updated.id, metadata: { status } } });
    return updated;
  });
}

export async function applyToJob(jobPostingId: string, message: string | undefined, applicantId: string) {
  return db.$transaction(async (transaction) => {
    const posting = await transaction.jobPosting.findFirst({ where: { id: jobPostingId, status: JobPostingStatus.PUBLISHED }, select: { id: true, createdById: true, description: true, requiredSkills: true, title: true } });
    if (!posting) throw new Error("Job posting not found");
    if (posting.createdById === applicantId) throw new Error("You cannot apply to your own job posting");
    const match = scoreApplicationMatch(posting, message);
    const application = await transaction.jobApplication.create({ data: { jobPostingId, applicantId, matchScore: match.score, matchSignals: match.signals, message: message?.trim() || undefined } });
    await transaction.auditLog.create({ data: { actorId: applicantId, action: "talent.job.application.submitted", entityType: "JobApplication", entityId: application.id, metadata: { jobPostingId } } });
    return application;
  });
}

export async function listOwnedJobApplications(userId: string) {
  return db.jobApplication.findMany({
    where: { jobPosting: { createdById: userId } },
    include: {
      jobPosting: { select: { id: true, title: true } },
      applicant: { select: { email: true, profile: { select: { displayName: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function updateJobApplicationStatus(
  applicationId: string,
  status: "UNDER_REVIEW" | "ACCEPTED" | "REJECTED",
  userId: string,
) {
  return db.$transaction(async (transaction) => {
    const application = await transaction.jobApplication.findFirst({
      where: { id: applicationId, jobPosting: { createdById: userId } },
      select: { id: true, applicantId: true, jobPosting: { select: { id: true, title: true } } },
    });
    if (!application) throw new Error("Job application not found");
    const updated = await transaction.jobApplication.update({
      where: { id: application.id },
      data: { status: JobApplicationStatus[status] },
    });
    await transaction.notification.create({
      data: {
        userId: application.applicantId,
        type: "JOB_APPLICATION_STATUS",
        title: "Job application updated",
        body: `Your application for ${application.jobPosting.title} is now ${status}.`,
        data: { applicationId: application.id, jobPostingId: application.jobPosting.id, status },
      },
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "talent.job.application.status.updated", entityType: "JobApplication", entityId: updated.id, metadata: { status } },
    });
    return updated;
  });
}