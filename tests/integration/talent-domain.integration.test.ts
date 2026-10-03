import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  applyToJob,
  createJobPosting,
  listDiscoverableTalent,
  listJobPostings,
  listMyJobApplications,
  listOwnedJobApplications,
  listTalentMatches,
  saveTalentProfile,
  updateJobApplicationStatus,
  updateJobPostingStatus,
  withdrawJobApplication,
} from "@/services/talent/job-service";
import { createStudioDocument } from "@/services/studio/studio-document-service";
import { sendTalentMessage } from "@/services/talent/talent-message-service";

const suffix = crypto.randomUUID().slice(0, 8);
let ownerId: string | undefined;
let applicantId: string | undefined;
let outsiderId: string | undefined;
const jobIds: string[] = [];
const applicationIds: string[] = [];

afterAll(async () => {
  if (applicationIds.length) await db.jobApplication.deleteMany({ where: { id: { in: applicationIds } } });
  if (jobIds.length) await db.jobPosting.deleteMany({ where: { id: { in: jobIds } } });
  if (applicantId) await db.notification.deleteMany({ where: { userId: applicantId } });
  if (applicantId) await db.user.delete({ where: { id: applicantId } });
  if (outsiderId) await db.user.delete({ where: { id: outsiderId } });
  if (ownerId) await db.user.delete({ where: { id: ownerId } });
  await db.$disconnect();
});

describe("talent domain", () => {
  it("scores postings, gates weak publication, filters roles, and tracks application matches", async () => {
    const owner = await db.user.create({ data: { email: `talent-owner-${suffix}@example.test`, status: "ACTIVE", profile: { create: { displayName: "Talent owner", locale: "en", language: "en" } } } });
    const applicant = await db.user.create({ data: { email: `talent-applicant-${suffix}@example.test`, status: "ACTIVE", profile: { create: { displayName: "Talent applicant", locale: "en", language: "en" } } } });
    const outsider = await db.user.create({ data: { email: `talent-outsider-${suffix}@example.test`, status: "ACTIVE" } });
    ownerId = owner.id;
    applicantId = applicant.id;
    outsiderId = outsider.id;

    const weak = await createJobPosting({ description: "Short but valid role description.", title: `Weak role ${suffix}`, workMode: "REMOTE" }, owner.id);
    jobIds.push(weak.id);
    expect(weak.qualityScore).toBeLessThan(55);
    await expect(updateJobPostingStatus(weak.id, "PUBLISHED", owner.id)).rejects.toThrow("quality score");

    const strong = await createJobPosting({
      benefits: "Flexible hybrid schedule, learning budget, and documented growth reviews.",
      city: "Riyadh",
      conditions: "Six years of relevant experience and authorization to work in the selected location.",
      countryCode: "SA",
      department: "Growth Intelligence",
      description: "Lead AI-enabled market research, build partner pipelines, manage structured experiments, coordinate sales operations, and report measurable revenue impact across business units.",
      requiredSkills: "market research, sales operations, ai, reporting",
      salaryMaxMinor: 32_000_00,
      salaryMinMinor: 24_000_00,
      title: `AI growth lead ${suffix}`,
      workMode: "HYBRID",
      questions: [{ prompt: "Describe one measurable growth experiment you led.", required: true }],
    }, owner.id);
    jobIds.push(strong.id);
    expect(strong.qualityScore).toBeGreaterThanOrEqual(80);
    expect((await updateJobPostingStatus(strong.id, "PUBLISHED", owner.id)).status).toBe("PUBLISHED");

    const visible = await listJobPostings(applicant.id, { countryCode: "SA", search: "growth", workMode: "HYBRID" });
    expect(visible.map((posting) => posting.id)).toContain(strong.id);
    expect(visible.map((posting) => posting.id)).not.toContain(weak.id);

    const cv = await createStudioDocument({ kind: "CV", title: "Applicant CV", content: { name: "Talent applicant", role: "AI growth lead" } }, applicant.id);
    await saveTalentProfile({ headline: "AI growth operator", summary: "I build measurable growth systems across research, sales operations, automation, and reporting.", countryCode: "SA", city: "Riyadh", yearsExperience: 6, skills: "market research, sales operations, ai, reporting", desiredWorkModes: ["HYBRID", "REMOTE"], availability: "Within 30 days", cvDocumentId: cv.id, isDiscoverable: true }, applicant.id);
    const discoverable = await listDiscoverableTalent(owner.id, "growth");
    expect(discoverable.some((profile) => profile.headline === "AI growth operator")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(discoverable[0] ?? {}, "email")).toBe(false);
    expect((await listTalentMatches(applicant.id)).candidateMatches[0]?.score).toBeGreaterThanOrEqual(80);

    await expect(applyToJob(strong.id, "Owner cannot apply", owner.id)).rejects.toThrow("own job");
    await expect(applyToJob(strong.id, "Consent is required for a linked CV.", applicant.id, { cvDocumentId: cv.id })).rejects.toThrow("consent");
    await expect(applyToJob(strong.id, "Missing required answer.", applicant.id)).rejects.toThrow("Required screening answers");
    const strongWithQuestion = await db.jobPosting.findUniqueOrThrow({ where: { id: strong.id }, include: { questions: true } });
    const application = await applyToJob(strong.id, "I have market research, sales operations, AI reporting, and pipeline growth experience across regional teams.", applicant.id, { answers: [{ questionId: strongWithQuestion.questions[0]!.id, answer: "I improved qualified pipeline conversion by 18% through a measured regional experiment." }], cvDocumentId: cv.id, shareProfile: true });
    applicationIds.push(application.id);
    expect(application.matchScore).toBeGreaterThanOrEqual(80);
    expect(application.consentVersion).toBe("talent-profile-v1");

    await expect(sendTalentMessage({ applicationId: application.id, body: "Unauthorized message" }, outsider.id)).rejects.toThrow("conversation access required");
    await sendTalentMessage({ applicationId: application.id, body: "Please confirm your interview availability." }, owner.id);
    await sendTalentMessage({ applicationId: application.id, body: "I am available next Tuesday afternoon." }, applicant.id);

    const owned = await listOwnedJobApplications(owner.id);
    expect(owned[0]?.matchScore).toBe(application.matchScore);
    expect(owned[0]?.profileSnapshot).toMatchObject({ headline: "AI growth operator", yearsExperience: 6 });
    expect(owned[0]?.cvDocument?.title).toBe("Applicant CV");
    expect(owned[0]?.answers[0]).toMatchObject({ promptSnapshot: "Describe one measurable growth experiment you led.", answer: "I improved qualified pipeline conversion by 18% through a measured regional experiment." });
    expect(owned[0]?.messages.map((message) => message.body)).toEqual(["Please confirm your interview availability.", "I am available next Tuesday afternoon."]);
    expect((await listMyJobApplications(applicant.id))[0]?.id).toBe(application.id);
    expect((await updateJobApplicationStatus(application.id, "UNDER_REVIEW", owner.id)).status).toBe("UNDER_REVIEW");
    expect((await updateJobApplicationStatus(application.id, "ACCEPTED", owner.id, "Proceed to the next hiring stage.")).status).toBe("ACCEPTED");
    await expect(withdrawJobApplication(application.id, applicant.id)).rejects.toThrow("Active job application not found");
    expect(await db.notification.count({ where: { userId: applicant.id, type: "JOB_APPLICATION_STATUS" } })).toBe(2);
    expect(await db.notification.count({ where: { userId: { in: [owner.id, applicant.id] }, type: "TALENT_MESSAGE" } })).toBe(2);
    expect(await db.auditLog.count({ where: { action: "talent.message.sent", entityType: "TalentMessage" } })).toBeGreaterThanOrEqual(2);

    const second = await createJobPosting({
      city: "Riyadh",
      countryCode: "SA",
      department: "Growth Intelligence",
      description: strong.description,
      requiredSkills: "market research, sales operations, ai, reporting",
      salaryMaxMinor: 32_000_00,
      salaryMinMinor: 24_000_00,
      title: `Second growth role ${suffix}`,
      workMode: "HYBRID",
    }, owner.id);
    jobIds.push(second.id);
    await updateJobPostingStatus(second.id, "PUBLISHED", owner.id);
    const withdrawn = await applyToJob(second.id, "I want to submit this application without sharing my private profile details.", applicant.id);
    applicationIds.push(withdrawn.id);
    expect((await withdrawJobApplication(withdrawn.id, applicant.id)).status).toBe("WITHDRAWN");
    await expect(updateJobApplicationStatus(withdrawn.id, "UNDER_REVIEW", owner.id)).rejects.toThrow("Invalid job application status transition");
  });
});