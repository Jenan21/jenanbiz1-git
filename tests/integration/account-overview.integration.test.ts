import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getAccountOverview } from "@/services/account/account-overview-service";

const suffix = crypto.randomUUID().slice(0, 8);
let userId: string | undefined;
let organizationId: string | undefined;
let academyId: string | undefined;
let courseId: string | undefined;
let planId: string | undefined;

afterAll(async () => {
  if (userId) {
    await db.fundingAssessment.deleteMany({ where: { userId } });
    await db.marketingCampaign.deleteMany({ where: { createdById: userId } });
    await db.jobPosting.deleteMany({ where: { createdById: userId } });
    await db.marketListing.deleteMany({ where: { createdById: userId } });
    await db.project.deleteMany({ where: { createdById: userId } });
    await db.learnerEnrollment.deleteMany({ where: { userId } });
  }
  if (courseId) await db.academyCourse.delete({ where: { id: courseId } });
  if (academyId) await db.academy.delete({ where: { id: academyId } });
  if (organizationId) await db.organization.delete({ where: { id: organizationId } });
  if (planId) await db.plan.delete({ where: { id: planId } });
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

describe("account overview", () => {
  it("collects a user workspace across projects, subscriptions, requests, services, and learning", async () => {
    const user = await db.user.create({ data: { email: `account-${suffix}@example.test`, status: "ACTIVE", profile: { create: { displayName: "Account owner", locale: "en", language: "en" } } } });
    userId = user.id;
    const plan = await db.plan.create({ data: { billingPeriod: "MONTHLY", code: `account-plan-${suffix}`, name: `Account plan ${suffix}`, priceMinor: 9900 } });
    planId = plan.id;
    const organization = await db.organization.create({ data: { name: `Account org ${suffix}`, slug: `account-org-${suffix}`, members: { create: { userId: user.id, status: "ACTIVE", isOwner: true, joinedAt: new Date() } }, subscriptions: { create: { planId: plan.id, status: "ACTIVE", currentStart: new Date(), currentEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } } } });
    organizationId = organization.id;
    const academy = await db.academy.create({ data: { name: `Account academy ${suffix}`, slug: `account-academy-${suffix}` } });
    academyId = academy.id;
    const course = await db.academyCourse.create({ data: { academyId: academy.id, title: `Account course ${suffix}`, code: `ACC-${suffix}` } });
    courseId = course.id;
    await db.learnerEnrollment.create({ data: { userId: user.id, courseId: course.id } });
    await db.project.create({ data: { createdById: user.id, name: `Account project ${suffix}`, slug: `account-project-${suffix}` } });
    await db.marketListing.create({ data: { createdById: user.id, kind: "PROJECT", title: `Account listing ${suffix}`, slug: `account-listing-${suffix}`, summary: "A valid listing summary for account overview testing." } });
    await db.jobPosting.create({ data: { createdById: user.id, title: `Account role ${suffix}`, slug: `account-role-${suffix}`, description: "A valid job posting description for account overview testing." } });
    await db.marketingCampaign.create({ data: { createdById: user.id, name: `Account campaign ${suffix}`, slug: `account-campaign-${suffix}`, objective: "A valid campaign objective for account overview testing.", channel: "CONTENT" } });
    await db.fundingAssessment.create({ data: { countryCode: "SA", growthStage: "early", monthlyRevenueMinor: 10_000, organizationType: "company", requestedAmountMinor: 100_000, score: 72, userId: user.id, yearsOperating: 1 } });

    const overview = await getAccountOverview(user.id);

    expect(overview.projects[0]?.name).toContain("Account project");
    expect(overview.organizations[0]?.subscriptions[0]?.status).toBe("ACTIVE");
    expect(overview.services.marketListings).toHaveLength(1);
    expect(overview.services.jobPostings).toHaveLength(1);
    expect(overview.services.marketingCampaigns).toHaveLength(1);
    expect(overview.requests.fundingAssessments[0]?.score).toBe(72);
    expect(overview.learning[0]?.course.title).toContain("Account course");
  });
});