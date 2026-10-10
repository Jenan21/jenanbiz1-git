import { JobApplicationStatus, JobPostingStatus, Prisma, StudioDocumentKind, TalentInterviewMode, TalentInterviewStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const postingInclude = {
  createdBy: { include: { profile: true } },
  organization: {
    select: {
      id: true,
      name: true,
      description: true,
      industry: true,
      website: true,
      countryCode: true,
      city: true,
      employeeRange: true,
      hiringSettings: true,
    },
  },
  applications: { select: { applicantId: true, matchScore: true, status: true } },
  questions: { orderBy: { sequence: "asc" as const } },
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
  benefits?: string;
  city?: string;
  conditions?: string;
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
    hasBenefits: (input.benefits?.trim().length ?? 0) >= 20,
    hasConditions: (input.conditions?.trim().length ?? 0) >= 20,
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
    (signals.hasSkills ? 22 : 0) +
    (signals.hasBenefits ? 5 : 0) +
    (signals.hasConditions ? 5 : 0),
  );
  return { score, signals, skills };
}

function profileSkills(profile?: { skills: Prisma.JsonValue | null } | null) {
  return Array.isArray(profile?.skills)
    ? profile.skills.filter((skill): skill is string => typeof skill === "string")
    : [];
}

function scoreApplicationMatch(posting: { requiredSkills: Prisma.JsonValue | null }, message?: string, profile?: { skills: Prisma.JsonValue | null; yearsExperience: number } | null) {
  const requiredSkills = Array.isArray(posting.requiredSkills)
    ? posting.requiredSkills.filter((skill): skill is string => typeof skill === "string")
    : [];
  const candidateSkills = profileSkills(profile);
  const haystack = `${candidateSkills.join(" ")} ${message ?? ""}`.toLowerCase();
  const matchedSkills = requiredSkills.filter((skill) => haystack.includes(skill.toLowerCase()));
  const hasMeaningfulMessage = (message?.trim().length ?? 0) >= 80;
  const skillScore = requiredSkills.length ? Math.round((matchedSkills.length / requiredSkills.length) * 60) : 30;
  const experienceScore = Math.min(profile?.yearsExperience ?? 0, 10) * 2;
  const score = Math.min(100, 10 + (hasMeaningfulMessage ? 10 : 0) + skillScore + experienceScore);
  return { score, signals: { candidateSkills, hasMeaningfulMessage, matchedSkills, missingSkills: requiredSkills.filter((skill) => !matchedSkills.includes(skill)), requiredSkills, yearsExperience: profile?.yearsExperience ?? null } };
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

export async function listSavedJobs(userId: string) {
  return db.talentSavedJob.findMany({
    where: { userId },
    include: { jobPosting: { include: postingInclude } },
    orderBy: { createdAt: "desc" },
  });
}

export async function saveJob(jobPostingId: string, userId: string) {
  return db.$transaction(async (transaction) => {
    const posting = await transaction.jobPosting.findFirst({
      where: { id: jobPostingId, status: JobPostingStatus.PUBLISHED, createdById: { not: userId } },
      select: { id: true },
    });
    if (!posting) throw new Error("Published job posting not found");
    const savedJob = await transaction.talentSavedJob.upsert({
      where: { userId_jobPostingId: { userId, jobPostingId } },
      create: { userId, jobPostingId },
      update: {},
      include: { jobPosting: { include: postingInclude } },
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "talent.job.saved", entityType: "JobPosting", entityId: jobPostingId },
    });
    return savedJob;
  });
}

export async function removeSavedJob(jobPostingId: string, userId: string) {
  return db.$transaction(async (transaction) => {
    const removed = await transaction.talentSavedJob.deleteMany({ where: { userId, jobPostingId } });
    if (!removed.count) throw new Error("Saved job not found");
    await transaction.auditLog.create({
      data: { actorId: userId, action: "talent.job.unsaved", entityType: "JobPosting", entityId: jobPostingId },
    });
    return { jobPostingId };
  });
}

export async function createJobPosting(input: { benefits?: string; city?: string; conditions?: string; countryCode?: string; currency?: string; department?: string; description: string; organizationId?: string; questions?: Array<{ prompt: string; required?: boolean }>; requiredSkills?: string; salaryMaxMinor?: number; salaryMinMinor?: number; title: string; workMode: "ON_SITE" | "HYBRID" | "REMOTE" }, userId: string) {
  if (input.organizationId) {
    const membership = await db.organizationMember.findFirst({ where: { organizationId: input.organizationId, userId, status: "ACTIVE", isOwner: true }, select: { id: true } });
    if (!membership) throw new Error("Organization owner access required");
  }
  const quality = assessJobQuality(input);
  return db.$transaction(async (transaction) => {
    const posting = await transaction.jobPosting.create({
      data: { benefits: input.benefits?.trim() || undefined, city: input.city?.trim() || undefined, conditions: input.conditions?.trim() || undefined, countryCode: input.countryCode?.trim().toUpperCase() || undefined, currency: input.currency?.trim().toUpperCase() || "SAR", department: input.department?.trim() || undefined, description: input.description.trim(), organizationId: input.organizationId, qualityScore: quality.score, qualitySignals: quality.signals, requiredSkills: quality.skills, salaryMaxMinor: input.salaryMaxMinor, salaryMinMinor: input.salaryMinMinor, title: input.title.trim(), workMode: input.workMode, slug: `${slugify(input.title)}-${crypto.randomUUID().slice(0, 8)}`, createdById: userId, questions: { create: (input.questions ?? []).map((question, sequence) => ({ prompt: question.prompt.trim(), required: question.required ?? true, sequence })) } },
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

export async function applyToJob(jobPostingId: string, message: string | undefined, applicantId: string, options: { answers?: Array<{ answer: string; questionId: string }>; cvDocumentId?: string; shareProfile?: boolean } = {}) {
  return db.$transaction(async (transaction) => {
    const posting = await transaction.jobPosting.findFirst({ where: { id: jobPostingId, status: JobPostingStatus.PUBLISHED }, select: { id: true, createdById: true, description: true, requiredSkills: true, title: true, questions: { orderBy: { sequence: "asc" } } } });
    if (!posting) throw new Error("Job posting not found");
    if (posting.createdById === applicantId) throw new Error("You cannot apply to your own job posting");
    if (options.cvDocumentId && !options.shareProfile) throw new Error("Profile sharing consent is required");
    const answerMap = new Map((options.answers ?? []).map((answer) => [answer.questionId, answer.answer.trim()]));
    if ((options.answers ?? []).some((answer) => !posting.questions.some((question) => question.id === answer.questionId))) throw new Error("Application answer question is invalid");
    if (posting.questions.some((question) => question.required && !answerMap.get(question.id))) throw new Error("Required screening answers are missing");
    const profile = await transaction.talentProfile.findUnique({ where: { userId: applicantId } });
    if (options.cvDocumentId) {
      const cv = await transaction.studioDocument.findFirst({ where: { id: options.cvDocumentId, ownerId: applicantId, kind: StudioDocumentKind.CV }, select: { id: true } });
      if (!cv) throw new Error("CV document not found");
    }
    const match = scoreApplicationMatch(posting, message, profile);
    const profileSnapshot = options.shareProfile && profile ? {
      headline: profile.headline,
      summary: profile.summary,
      city: profile.city,
      countryCode: profile.countryCode,
      yearsExperience: profile.yearsExperience,
      skills: profile.skills,
      experience: profile.experience,
      education: profile.education,
      availability: profile.availability,
    } : undefined;
    const application = await transaction.jobApplication.create({ data: { jobPostingId, applicantId, cvDocumentId: options.cvDocumentId, profileSnapshot, consentVersion: options.shareProfile ? "talent-profile-v1" : undefined, consentedAt: options.shareProfile ? new Date() : undefined, matchScore: match.score, matchSignals: match.signals, message: message?.trim() || undefined, answers: { create: posting.questions.flatMap((question) => { const answer = answerMap.get(question.id); return answer ? [{ questionId: question.id, promptSnapshot: question.prompt, answer }] : []; }) } } });
    await transaction.auditLog.create({ data: { actorId: applicantId, action: "talent.job.application.submitted", entityType: "JobApplication", entityId: application.id, metadata: { jobPostingId, profileShared: Boolean(options.shareProfile), cvDocumentId: options.cvDocumentId ?? null } } });
    return application;
  });
}

export async function getTalentProfile(userId: string) {
  const [profile, cvDocuments] = await Promise.all([
    db.talentProfile.findUnique({ where: { userId }, include: { cvDocument: { select: { id: true, title: true, currentVersion: true, updatedAt: true } } } }),
    db.studioDocument.findMany({ where: { ownerId: userId, kind: StudioDocumentKind.CV }, select: { id: true, title: true, currentVersion: true, updatedAt: true }, orderBy: { updatedAt: "desc" } }),
  ]);
  return { profile, cvDocuments };
}

export async function saveTalentProfile(input: { availability?: string; city?: string; countryCode?: string; cvDocumentId?: string; desiredWorkModes?: string[]; education?: string; experience?: string; headline: string; isDiscoverable?: boolean; skills?: string; summary: string; yearsExperience?: number }, userId: string) {
  const skills = normalizeSkills(input.skills);
  if (input.cvDocumentId) {
    const cv = await db.studioDocument.findFirst({ where: { id: input.cvDocumentId, ownerId: userId, kind: StudioDocumentKind.CV }, select: { id: true } });
    if (!cv) throw new Error("CV document not found");
  }
  return db.$transaction(async (transaction) => {
    const data = {
      headline: input.headline.trim(), summary: input.summary.trim(), city: input.city?.trim() || undefined,
      countryCode: input.countryCode?.trim().toUpperCase() || undefined, yearsExperience: input.yearsExperience ?? 0,
      skills, experience: input.experience?.trim() || undefined, education: input.education?.trim() || undefined,
      desiredWorkModes: input.desiredWorkModes ?? [], availability: input.availability?.trim() || undefined,
      cvDocumentId: input.cvDocumentId || null, isDiscoverable: input.isDiscoverable ?? false,
    };
    const profile = await transaction.talentProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data, include: { cvDocument: { select: { id: true, title: true, currentVersion: true, updatedAt: true } } } });
    await transaction.auditLog.create({ data: { actorId: userId, action: "talent.profile.saved", entityType: "TalentProfile", entityId: profile.id, metadata: { isDiscoverable: profile.isDiscoverable, skillCount: skills.length, cvDocumentId: profile.cvDocumentId } } });
    return profile;
  });
}

export async function listDiscoverableTalent(userId: string, query?: string) {
  const profiles = await db.talentProfile.findMany({
    where: { isDiscoverable: true, userId: { not: userId } },
    select: { id: true, headline: true, summary: true, city: true, countryCode: true, yearsExperience: true, skills: true, desiredWorkModes: true, availability: true, updatedAt: true, user: { select: { profile: { select: { displayName: true } } } } },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const term = query?.trim().toLowerCase();
  return term ? profiles.filter((profile) => `${profile.user.profile?.displayName ?? ""} ${profile.headline} ${profile.summary} ${profileSkills(profile).join(" ")} ${profile.city ?? ""}`.toLowerCase().includes(term)) : profiles;
}

export async function listMyJobApplications(userId: string) {
  return db.jobApplication.findMany({
    where: { applicantId: userId },
    include: { jobPosting: { include: { organization: true, createdBy: { include: { profile: true } } } }, cvDocument: { select: { id: true, title: true, currentVersion: true } }, answers: { orderBy: { createdAt: "asc" } }, interviews: { orderBy: { scheduledAt: "desc" } }, messages: { include: { sender: { select: { profile: { select: { displayName: true } } } } }, orderBy: { createdAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function withdrawJobApplication(applicationId: string, userId: string) {
  return db.$transaction(async (transaction) => {
    const application = await transaction.jobApplication.findFirst({ where: { id: applicationId, applicantId: userId, status: { in: [JobApplicationStatus.SUBMITTED, JobApplicationStatus.UNDER_REVIEW] } }, select: { id: true } });
    if (!application) throw new Error("Active job application not found");
    const updated = await transaction.jobApplication.update({ where: { id: application.id }, data: { status: JobApplicationStatus.WITHDRAWN } });
    await transaction.auditLog.create({ data: { actorId: userId, action: "talent.job.application.withdrawn", entityType: "JobApplication", entityId: application.id } });
    return updated;
  });
}

export async function scheduleTalentInterview(
  input: {
    applicationId: string;
    durationMinutes: number;
    location?: string;
    mode: "VIDEO" | "PHONE" | "ON_SITE";
    notes?: string;
    scheduledAt: string;
  },
  userId: string,
) {
  const scheduledAt = new Date(input.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) throw new Error("Interview time must be in the future");
  return db.$transaction(async (transaction) => {
    const application = await transaction.jobApplication.findFirst({
      where: {
        id: input.applicationId,
        status: { in: [JobApplicationStatus.UNDER_REVIEW, JobApplicationStatus.ACCEPTED] },
        jobPosting: { createdById: userId },
      },
      select: { id: true, applicantId: true, jobPosting: { select: { id: true, title: true } } },
    });
    if (!application) throw new Error("Reviewable job application not found");
    const interview = await transaction.talentInterview.create({
      data: {
        applicationId: application.id,
        createdById: userId,
        durationMinutes: input.durationMinutes,
        location: input.location?.trim() || undefined,
        mode: TalentInterviewMode[input.mode],
        notes: input.notes?.trim() || undefined,
        scheduledAt,
      },
    });
    await transaction.notification.create({
      data: {
        userId: application.applicantId,
        type: "TALENT_INTERVIEW",
        title: "Interview scheduled",
        body: `An interview was scheduled for ${application.jobPosting.title}.`,
        data: { applicationId: application.id, interviewId: interview.id, jobPostingId: application.jobPosting.id, scheduledAt: interview.scheduledAt.toISOString() },
      },
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "talent.interview.scheduled", entityType: "TalentInterview", entityId: interview.id, metadata: { applicationId: application.id } },
    });
    return interview;
  });
}

export async function updateTalentInterviewStatus(
  interviewId: string,
  status: "COMPLETED" | "CANCELLED",
  userId: string,
) {
  return db.$transaction(async (transaction) => {
    const interview = await transaction.talentInterview.findFirst({
      where: { id: interviewId, createdById: userId, status: TalentInterviewStatus.SCHEDULED },
      select: { id: true, applicationId: true, application: { select: { applicantId: true, jobPosting: { select: { id: true, title: true } } } } },
    });
    if (!interview) throw new Error("Scheduled interview not found");
    const updated = await transaction.talentInterview.update({
      where: { id: interview.id },
      data: { status: TalentInterviewStatus[status] },
    });
    await transaction.notification.create({
      data: {
        userId: interview.application.applicantId,
        type: "TALENT_INTERVIEW",
        title: status === "CANCELLED" ? "Interview cancelled" : "Interview completed",
        body: `The interview for ${interview.application.jobPosting.title} was marked ${status.toLowerCase()}.`,
        data: { applicationId: interview.applicationId, interviewId: interview.id, jobPostingId: interview.application.jobPosting.id, status },
      },
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "talent.interview.status.updated", entityType: "TalentInterview", entityId: interview.id, metadata: { status } },
    });
    return updated;
  });
}

export async function listTalentMatches(userId: string) {
  const [profile, postings, candidates] = await Promise.all([
    db.talentProfile.findUnique({ where: { userId } }),
    db.jobPosting.findMany({ where: { status: JobPostingStatus.PUBLISHED }, include: { organization: true, createdBy: { include: { profile: true } } }, orderBy: { qualityScore: "desc" }, take: 100 }),
    db.talentProfile.findMany({ where: { isDiscoverable: true, userId: { not: userId } }, select: { id: true, userId: true, headline: true, summary: true, city: true, countryCode: true, yearsExperience: true, skills: true, availability: true, user: { select: { profile: { select: { displayName: true } } } } }, take: 100 }),
  ]);
  const candidateMatches = profile ? postings.filter((posting) => posting.createdById !== userId).map((posting) => ({ posting, ...scoreApplicationMatch(posting, undefined, profile) })).sort((left, right) => right.score - left.score) : [];
  const ownedPostings = postings.filter((posting) => posting.createdById === userId);
  const employerMatches = ownedPostings.flatMap((posting) => candidates.map((candidate) => ({ postingId: posting.id, postingTitle: posting.title, candidate, ...scoreApplicationMatch(posting, undefined, candidate) }))).sort((left, right) => right.score - left.score).slice(0, 100);
  return { candidateMatches, employerMatches };
}

export async function listOwnedJobApplications(userId: string) {
  return db.jobApplication.findMany({
    where: { jobPosting: { createdById: userId } },
    include: {
      jobPosting: { select: { id: true, title: true } },
      applicant: { select: { email: true, profile: { select: { displayName: true } } } },
      cvDocument: { select: { id: true, title: true, currentVersion: true, content: true } },
      answers: { orderBy: { createdAt: "asc" } },
      interviews: { orderBy: { scheduledAt: "desc" } },
      messages: {
        include: { sender: { select: { profile: { select: { displayName: true } } } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function updateJobApplicationStatus(
  applicationId: string,
  status: "UNDER_REVIEW" | "ACCEPTED" | "REJECTED",
  userId: string,
  employerNotes?: string,
) {
  return db.$transaction(async (transaction) => {
    const application = await transaction.jobApplication.findFirst({
      where: { id: applicationId, jobPosting: { createdById: userId } },
      select: { id: true, applicantId: true, status: true, jobPosting: { select: { id: true, title: true } } },
    });
    if (!application) throw new Error("Job application not found");
    const allowed = application.status === JobApplicationStatus.SUBMITTED
      ? status === "UNDER_REVIEW" || status === "REJECTED"
      : application.status === JobApplicationStatus.UNDER_REVIEW
        ? status === "ACCEPTED" || status === "REJECTED"
        : false;
    if (!allowed) throw new Error("Invalid job application status transition");
    const updated = await transaction.jobApplication.update({
      where: { id: application.id },
      data: { status: JobApplicationStatus[status], employerNotes: employerNotes?.trim() || undefined },
    });
    await transaction.notification.create({
      data: {
        userId: application.applicantId,
        type: "JOB_APPLICATION_STATUS",
        title: "Job application updated",
        body: `Your application for ${application.jobPosting.title} moved to ${status}. This status does not guarantee employment.`,
        data: { applicationId: application.id, jobPostingId: application.jobPosting.id, status },
      },
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "talent.job.application.status.updated", entityType: "JobApplication", entityId: updated.id, metadata: { status } },
    });
    return updated;
  });
}