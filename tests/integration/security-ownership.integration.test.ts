import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getUserPayments } from "@/services/account/user-center-service";
import { getAccountOverview } from "@/services/account/account-overview-service";
import { listSoftwareHr } from "@/services/software/hr-service";
import { listSoftwareOperations } from "@/services/software/operations-service";
import { getSoftwareCompany } from "@/services/software/software-access";
import { getUserProject, addProjectMember } from "@/services/projects/project-service";
import { listMarketListings, listMarketInquiries, listMarketDeals, updateMarketListingStatus, updateMarketInquiryStatus, updateMarketOfferStatus, updateMarketViewingStatus } from "@/services/market/market-service";
import { listUserFiles, downloadUserFile, deleteUserFile, uploadUserFile } from "@/services/files/file-asset-service";
import {
  createMarketingCampaign, createMarketingLead, createMarketingAudienceSegment,
  listMarketingCampaigns, updateMarketingCampaignStatus, updateMarketingLead,
  refreshMarketingCampaignPerformance,
} from "@/services/marketing/campaign-service";
import {
  createJobPosting, listJobPostings, listMyJobApplications, listOwnedJobApplications,
  updateJobPostingStatus, updateJobApplicationStatus,
} from "@/services/talent/job-service";
import { sendTalentMessage } from "@/services/talent/talent-message-service";
import { exportTalentReport } from "@/services/talent/talent-report-service";

const suffix = crypto.randomUUID();
const users: string[] = [];
let ownerId: string;
let memberId: string;
let outsiderId: string;
let organizationId: string;
let projectId: string;
let campaignId: string;
let leadId: string;
let postingId: string;
let applicationId: string;
let personalPaymentId: string;
let organizationPaymentId: string;
let personalCampaignId: string;
let personalPostingId: string;
let listingId: string;
let inquiryId: string;
let offerId: string;
let viewingId: string;
let fileId: string;

function expectSafeUsers(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const key of ["passwordHash", "tokenHash", "resetToken", "phone", "onboardedAt"]) {
    expect(serialized).not.toContain(`"${key}":`);
  }
  expect(serialized).not.toContain("private-profile-marker");
}

beforeAll(async () => {
  for (const kind of ["owner", "member", "outsider"]) {
    const user = await db.user.create({
      data: {
        email: `security-${kind}-${suffix}@example.test`, status: "ACTIVE",
        passwordHash: "private-hash-marker",
        profile: { create: { displayName: kind, phone: "private-profile-marker", city: "private-profile-marker" } },
      },
    });
    users.push(user.id);
  }
  [ownerId, memberId, outsiderId] = users;
  const organization = await db.organization.create({
    data: { name: "Security organization", slug: `security-${suffix}`, members: { create: [
      { userId: ownerId, status: "ACTIVE", isOwner: true },
      { userId: memberId, status: "ACTIVE", isOwner: false },
    ] } },
  });
  organizationId = organization.id;
  const project = await db.project.create({
    data: { name: "Private security project", slug: `security-project-${suffix}`, createdById: ownerId, organizationId,
      financialPlans: { create: { createdById: ownerId, version: 1, inputs: { privateInput: 42 }, baseCase: { privateResult: 99 }, scenarios: [] } },
    },
  });
  projectId = project.id;
  await db.softwareEmployee.create({ data: { organizationId, employeeNumber: "SEC-1", name: "Private employee", roleTitle: "Private role", salaryMinor: 987654, hiredAt: new Date(), createdById: ownerId } });
  personalPaymentId = (await db.payment.create({ data: { payerUserId: memberId, amountMinor: 100, status: "SUCCEEDED", provider: "TEST" } })).id;
  organizationPaymentId = (await db.payment.create({ data: { organizationId, amountMinor: 200, status: "SUCCEEDED", provider: "TEST" } })).id;
  campaignId = (await createMarketingCampaign({ budgetMinor: 1000, channel: "CONTENT", customerType: "ORGANIZATION", organizationId, name: "Security campaign", objective: "Security ownership regression campaign" }, ownerId)).id;
  personalCampaignId = (await createMarketingCampaign({ budgetMinor: 1000, channel: "CONTENT", customerType: "INDIVIDUAL", name: "Personal campaign", objective: "Personal ownership retained" }, ownerId)).id;
  leadId = (await createMarketingLead({ campaignId, label: "Private lead" }, ownerId)).id;
  postingId = (await createJobPosting({ organizationId, title: "Security role", description: "Security ownership regression role description", workMode: "REMOTE" }, ownerId)).id;
  personalPostingId = (await createJobPosting({ title: "Personal role", description: "Personal ownership retained role", workMode: "REMOTE" }, ownerId)).id;
  const cv = await db.studioDocument.create({ data: { ownerId: memberId, kind: "CV", title: "Private CV", content: { privateCv: true } } });
  applicationId = (await db.jobApplication.create({ data: { jobPostingId: postingId, applicantId: memberId, cvDocumentId: cv.id, consentVersion: "talent-profile-v1" } })).id;
  await db.jobApplication.create({ data: { jobPostingId: postingId, applicantId: outsiderId } });
  await db.jobPosting.update({ where: { id: postingId }, data: { status: "PUBLISHED" } });
  await db.marketListing.create({ data: { createdById: ownerId, kind: "PROJECT", title: "Security public listing", slug: `security-listing-${suffix}`, summary: "Security listing privacy regression", status: "PUBLISHED" } });
  listingId = (await db.marketListing.create({ data: { createdById: ownerId, organizationId, kind: "BUSINESS", title: "Organization listing", slug: `security-org-listing-${suffix}`, summary: "Imported organization listing", status: "PUBLISHED", requiresNda: true, confidentialDetails: "private-organization-details" } })).id;
  inquiryId = (await db.marketInquiry.create({ data: { listingId, requesterId: memberId, message: "Private inquiry" } })).id;
  offerId = (await db.marketOffer.create({ data: { listingId, buyerId: memberId, amountMinor: 1000, terms: "Private offer" } })).id;
  viewingId = (await db.marketViewingRequest.create({ data: { listingId, requesterId: memberId, preferredAt: new Date(Date.now() + 86400000), attendees: 1 } })).id;
  fileId = (await db.fileAsset.create({ data: { uploadedById: ownerId, marketListingId: listingId, marketVisibility: "NDA_REQUIRED", fileName: "private.txt", mimeType: "text/plain", sizeBytes: 10, storageKey: `security-${suffix}` } })).id;
});

afterAll(async () => {
  if (users.length) {
    await db.fileAsset.deleteMany({ where: { uploadedById: { in: users } } });
    await db.marketingCampaign.deleteMany({ where: { createdById: { in: users } } });
    await db.jobPosting.deleteMany({ where: { createdById: { in: users } } });
    await db.marketListing.deleteMany({ where: { createdById: { in: users } } });
    await db.project.deleteMany({ where: { createdById: { in: users } } });
    await db.payment.deleteMany({ where: { OR: [{ payerUserId: { in: users } }, { organizationId }] } });
    if (organizationId) await db.organization.delete({ where: { id: organizationId } });
    await db.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  }
  await db.$disconnect();
});

describe.sequential("security ownership and DTO boundaries", () => {
  it("keeps private projects and HR out of ordinary organization members' workspaces", async () => {
    expect(await getUserProject(projectId, memberId)).toBeNull();
    expect((await listSoftwareOperations(organizationId, memberId)).projects).toEqual([]);
    await expect(listSoftwareHr(organizationId, memberId)).rejects.toThrow("owner access required");
    await expect(listSoftwareOperations(organizationId, outsiderId)).rejects.toThrow("membership required");
    expect((await listSoftwareHr(organizationId, ownerId)).employees[0]?.salaryMinor).toBe(987654);
    await addProjectMember(projectId, { email: `security-member-${suffix}@example.test`, role: "VIEWER" }, ownerId);
    expect((await listSoftwareOperations(organizationId, memberId)).projects[0]?.financialPlan?.inputs).toEqual({ privateInput: 42 });
  });

  it("allowlists collaborator and public identities and hides other applicants", async () => {
    expectSafeUsers(await getUserProject(projectId, memberId));
    expectSafeUsers(await getSoftwareCompany(organizationId, memberId));
    expectSafeUsers(await listMarketListings(memberId));
    const postings = await listJobPostings(memberId, { search: "Security role" });
    expectSafeUsers(postings);
    expect(postings.find((posting) => posting.id === postingId)?.applications).toEqual([
      expect.objectContaining({ applicantId: memberId }),
    ]);
    expectSafeUsers(await listMyJobApplications(memberId));
  });

  it("requires active billing ownership without removing personal payments", async () => {
    expect((await getUserPayments(ownerId)).map(({ id }) => id)).toContain(organizationPaymentId);
    for (const status of ["INVITED", "SUSPENDED", "ACTIVE"] as const) {
      await db.organizationMember.updateMany({ where: { organizationId, userId: memberId }, data: { status } });
      expect((await getUserPayments(memberId)).map(({ id }) => id)).toEqual([personalPaymentId]);
    }
    await db.organizationMember.updateMany({ where: { organizationId, userId: ownerId }, data: { status: "SUSPENDED" } });
    expect(await getUserPayments(ownerId)).toEqual([]);
    await db.organizationMember.updateMany({ where: { organizationId, userId: ownerId }, data: { status: "ACTIVE" } });
  });

  it("rejects foreign organization links on individual campaigns", async () => {
    await expect(createMarketingCampaign({ budgetMinor: 100, channel: "CONTENT", customerType: "INDIVIDUAL", organizationId, name: "Forged", objective: "Foreign organization association" }, outsiderId)).rejects.toThrow("cannot specify an organization");
  });

  it.each(["suspended", "demoted"] as const)("revokes hiring and campaign access when the owner is %s", async (mode) => {
    await db.organizationMember.updateMany({ where: { organizationId, userId: ownerId }, data: { status: mode === "suspended" ? "SUSPENDED" : "ACTIVE", isOwner: mode !== "demoted" } });
    expect((await listMarketingCampaigns(ownerId)).map(({ id }) => id)).toEqual([personalCampaignId]);
    const overview = await getAccountOverview(ownerId);
    expect(overview.services.marketingCampaigns.map(({ id }) => id)).toEqual([personalCampaignId]);
    expect(overview.services.jobPostings.map(({ id }) => id)).toEqual([personalPostingId]);
    if (mode === "suspended") expect(overview.organizations).toEqual([]);
    expect(overview.services.marketListings.some(({ id }) => id === listingId)).toBe(false);
    expect(overview.services.fileCount).toBe(0);
    const listing = (await listMarketListings(ownerId)).find(({ id }) => id === listingId);
    expect(listing).toMatchObject({ isOwner: false, confidentialDetails: null, ndaAccepted: false, files: [] });
    expect(await listMarketInquiries(ownerId)).toEqual([]);
    expect(await listMarketDeals(ownerId)).toEqual({ offers: [], viewings: [] });
    await expect(updateMarketListingStatus(listingId, "PAUSED", ownerId)).rejects.toThrow("not found");
    await expect(updateMarketInquiryStatus(inquiryId, "CLOSED", ownerId)).rejects.toThrow("not found");
    await expect(updateMarketOfferStatus(offerId, "REJECTED", ownerId)).rejects.toThrow("not found");
    await expect(updateMarketViewingStatus(viewingId, "CONFIRMED", ownerId)).rejects.toThrow("not found");
    expect(await listUserFiles(ownerId)).toEqual([]);
    expect(await downloadUserFile(ownerId, fileId)).toBeNull();
    expect(await deleteUserFile(ownerId, fileId)).toBe(false);
    await expect(uploadUserFile(ownerId, new File(["Safe text"], "safe.txt", { type: "text/plain" }), undefined, listingId)).rejects.toThrow("not found");
    expect((await listMarketInquiries(memberId)).some(({ id }) => id === inquiryId)).toBe(true);
    expect((await listMarketDeals(memberId)).offers.some(({ id }) => id === offerId)).toBe(true);
    expect(await listOwnedJobApplications(ownerId)).toEqual([]);
    await expect(updateMarketingCampaignStatus(campaignId, "PAUSED", ownerId)).rejects.toThrow("not found");
    await expect(createMarketingLead({ campaignId, label: "Forbidden" }, ownerId)).rejects.toThrow("not found");
    await expect(updateMarketingLead({ leadId, status: "LOST" }, ownerId)).rejects.toThrow("not found");
    await expect(createMarketingAudienceSegment({ campaignId, name: "Forbidden" }, ownerId)).rejects.toThrow("not found");
    await expect(refreshMarketingCampaignPerformance(campaignId, ownerId)).rejects.toThrow("not found");
    await expect(updateJobPostingStatus(postingId, "CLOSED", ownerId)).rejects.toThrow("not found");
    await expect(updateJobApplicationStatus(applicationId, "REJECTED", ownerId)).rejects.toThrow("not found");
    await expect(sendTalentMessage({ applicationId, body: "Forbidden" }, ownerId)).rejects.toThrow("access required");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await exportTalentReport(ownerId)).bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.getWorksheet("Applications")?.rowCount).toBe(1);
    expect(workbook.getWorksheet("Postings")?.rowCount).toBe(2);
    expect((await listMyJobApplications(memberId)).some(({ id }) => id === applicationId)).toBe(true);
    await sendTalentMessage({ applicationId, body: "Applicant retains access" }, memberId);
    expect((await db.marketingLead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("NEW");
    expect((await db.jobPosting.findUniqueOrThrow({ where: { id: postingId } })).status).toBe("PUBLISHED");
    await db.organizationMember.updateMany({ where: { organizationId, userId: ownerId }, data: { status: "ACTIVE", isOwner: true } });
    expect((await listOwnedJobApplications(ownerId)).length).toBe(2);
  });
});
