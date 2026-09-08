import { JobApplicationStatus, JobPostingStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const postingInclude = {
  createdBy: { include: { profile: true } },
  organization: { select: { id: true, name: true } },
  applications: { select: { applicantId: true, status: true } },
} satisfies Prisma.JobPostingInclude;

function slugify(value: string) {
  const slug = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  return slug || "job";
}

export async function listJobPostings(userId: string) {
  return db.jobPosting.findMany({
    where: { OR: [{ status: JobPostingStatus.PUBLISHED }, { createdById: userId }] },
    include: postingInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export async function createJobPosting(input: { title: string; description: string; department?: string; countryCode?: string; city?: string; workMode: "ON_SITE" | "HYBRID" | "REMOTE" }, userId: string) {
  return db.$transaction(async (transaction) => {
    const posting = await transaction.jobPosting.create({
      data: { title: input.title.trim(), description: input.description.trim(), department: input.department?.trim() || undefined, countryCode: input.countryCode?.trim().toUpperCase() || undefined, city: input.city?.trim() || undefined, workMode: input.workMode, slug: `${slugify(input.title)}-${crypto.randomUUID().slice(0, 8)}`, createdById: userId },
      include: postingInclude,
    });
    await transaction.auditLog.create({ data: { actorId: userId, action: "talent.job.created", entityType: "JobPosting", entityId: posting.id } });
    return posting;
  });
}

export async function updateJobPostingStatus(jobPostingId: string, status: "PUBLISHED" | "CLOSED" | "ARCHIVED", userId: string) {
  return db.$transaction(async (transaction) => {
    const posting = await transaction.jobPosting.findFirst({ where: { id: jobPostingId, createdById: userId }, select: { id: true } });
    if (!posting) throw new Error("Job posting not found");
    const updated = await transaction.jobPosting.update({ where: { id: jobPostingId }, data: { status }, include: postingInclude });
    await transaction.auditLog.create({ data: { actorId: userId, action: "talent.job.status.updated", entityType: "JobPosting", entityId: updated.id, metadata: { status } } });
    return updated;
  });
}

export async function applyToJob(jobPostingId: string, message: string | undefined, applicantId: string) {
  return db.$transaction(async (transaction) => {
    const posting = await transaction.jobPosting.findFirst({ where: { id: jobPostingId, status: JobPostingStatus.PUBLISHED }, select: { id: true, createdById: true } });
    if (!posting) throw new Error("Job posting not found");
    if (posting.createdById === applicantId) throw new Error("You cannot apply to your own job posting");
    const application = await transaction.jobApplication.create({ data: { jobPostingId, applicantId, message: message?.trim() || undefined } });
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