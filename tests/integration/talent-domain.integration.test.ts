import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  applyToJob,
  createJobPosting,
  listJobPostings,
  listOwnedJobApplications,
  updateJobApplicationStatus,
  updateJobPostingStatus,
} from "@/services/talent/job-service";

const suffix = crypto.randomUUID().slice(0, 8);
let ownerId: string | undefined;
let applicantId: string | undefined;
const jobIds: string[] = [];
const applicationIds: string[] = [];

afterAll(async () => {
  if (applicationIds.length) await db.jobApplication.deleteMany({ where: { id: { in: applicationIds } } });
  if (jobIds.length) await db.jobPosting.deleteMany({ where: { id: { in: jobIds } } });
  if (applicantId) await db.notification.deleteMany({ where: { userId: applicantId } });
  if (applicantId) await db.user.delete({ where: { id: applicantId } });
  if (ownerId) await db.user.delete({ where: { id: ownerId } });
  await db.$disconnect();
});

describe("talent domain", () => {
  it("scores postings, gates weak publication, filters roles, and tracks application matches", async () => {
    const owner = await db.user.create({ data: { email: `talent-owner-${suffix}@example.test`, status: "ACTIVE", profile: { create: { displayName: "Talent owner", locale: "en", language: "en" } } } });
    const applicant = await db.user.create({ data: { email: `talent-applicant-${suffix}@example.test`, status: "ACTIVE", profile: { create: { displayName: "Talent applicant", locale: "en", language: "en" } } } });
    ownerId = owner.id;
    applicantId = applicant.id;

    const weak = await createJobPosting({ description: "Short but valid role description.", title: `Weak role ${suffix}`, workMode: "REMOTE" }, owner.id);
    jobIds.push(weak.id);
    expect(weak.qualityScore).toBeLessThan(55);
    await expect(updateJobPostingStatus(weak.id, "PUBLISHED", owner.id)).rejects.toThrow("quality score");

    const strong = await createJobPosting({
      city: "Riyadh",
      countryCode: "SA",
      department: "Growth Intelligence",
      description: "Lead AI-enabled market research, build partner pipelines, manage structured experiments, coordinate sales operations, and report measurable revenue impact across business units.",
      requiredSkills: "market research, sales operations, ai, reporting",
      salaryMaxMinor: 32_000_00,
      salaryMinMinor: 24_000_00,
      title: `AI growth lead ${suffix}`,
      workMode: "HYBRID",
    }, owner.id);
    jobIds.push(strong.id);
    expect(strong.qualityScore).toBeGreaterThanOrEqual(80);
    expect((await updateJobPostingStatus(strong.id, "PUBLISHED", owner.id)).status).toBe("PUBLISHED");

    const visible = await listJobPostings(applicant.id, { countryCode: "SA", search: "growth", workMode: "HYBRID" });
    expect(visible.map((posting) => posting.id)).toContain(strong.id);
    expect(visible.map((posting) => posting.id)).not.toContain(weak.id);

    await expect(applyToJob(strong.id, "Owner cannot apply", owner.id)).rejects.toThrow("own job");
    const application = await applyToJob(strong.id, "I have market research, sales operations, AI reporting, and pipeline growth experience across regional teams.", applicant.id);
    applicationIds.push(application.id);
    expect(application.matchScore).toBeGreaterThanOrEqual(80);

    const owned = await listOwnedJobApplications(owner.id);
    expect(owned[0]?.matchScore).toBe(application.matchScore);
    expect((await updateJobApplicationStatus(application.id, "UNDER_REVIEW", owner.id)).status).toBe("UNDER_REVIEW");
    expect(await db.notification.count({ where: { userId: applicant.id, type: "JOB_APPLICATION_STATUS" } })).toBe(1);
  });
});