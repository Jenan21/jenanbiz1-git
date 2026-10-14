import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getFinancialSummary } from "@/lib/admin/financial-summary";
import { getPlatformAdminSummary } from "@/lib/admin/platform-summary";
import * as campaignService from "@/services/marketing/campaign-service";
import {
  confirmCampaignPaymentReceived,
  createMarketingCampaign,
  listMarketingCampaigns,
  listPendingMarketingPaymentRequests,
  requestCampaignPayment,
  updateMarketingCampaignStatus,
} from "@/services/marketing/campaign-service";

const suffix = crypto.randomUUID().slice(0, 8);
const userIds: string[] = [];
const campaignIds: string[] = [];
const paymentIds: string[] = [];
let robotId: string | undefined;
let userCounter = 0;

const strongCampaign = {
  budgetMinor: 1_200_000,
  callToAction: "Book a consultation",
  channel: "SOCIAL" as const,
  customerType: "INDIVIDUAL" as const,
  kpiTarget: 2,
  objective: "Launch a structured social campaign targeting business owners, qualify inbound leads, measure conversions, and route high-value opportunities to sales operations.",
  targetAudience: "Saudi SME owners seeking growth and project intelligence services",
};

async function createUser(label: string, systemRole: "ADMIN" | "USER" = "USER") {
  userCounter += 1;
  const user = await db.user.create({ data: { email: `sec-marketing-${label}-${userCounter}-${suffix}@example.test`, status: "ACTIVE", systemRole, profile: { create: { displayName: `Member ${label}`, language: "en", locale: "en" } } } });
  userIds.push(user.id);
  return user;
}

async function campaignFor(ownerId: string, overrides: Partial<Parameters<typeof createMarketingCampaign>[0]> = {}) {
  const campaign = await createMarketingCampaign({ ...strongCampaign, name: `Security review ${userCounter++} ${suffix}`, ...overrides }, ownerId);
  campaignIds.push(campaign.id);
  return campaign;
}

async function setUpRobot() {
  // Outranks every other robot, so it is the one assigned.
  const robot = await db.robot.create({ data: { intelligence: 2_000_000_000, isVisible: true, name: `Review robot ${suffix}`, skill: 2_000_000_000, slug: `review-robot-${suffix}`, status: "ACTIVE" } });
  robotId = robot.id;
}

beforeAll(setUpRobot);

afterAll(async () => {
  if (campaignIds.length) await db.marketingCampaign.deleteMany({ where: { id: { in: campaignIds } } });
  if (paymentIds.length) await db.payment.deleteMany({ where: { id: { in: paymentIds } } });
  if (userIds.length) await db.payment.deleteMany({ where: { payerUserId: { in: userIds } } });
  if (robotId) await db.robot.delete({ where: { id: robotId } });
  if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("a campaign's payment is a request until an administrator confirms it", () => {
  it("records a PENDING request that moves no money, assigns nobody and activates nothing", async () => {
    const owner = await createUser("owner");
    const campaign = await campaignFor(owner.id);

    const requested = await requestCampaignPayment(campaign.id, owner.id);
    expect(requested.status).toBe("DRAFT");
    expect(requested.robotTask).toBeNull();
    expect(requested.payment).toMatchObject({ amountMinor: strongCampaign.budgetMinor, paidAt: null, provider: "MANUAL_REVIEW", status: "PENDING" });
    expect(await db.payment.count({ where: { payerUserId: owner.id, status: "SUCCEEDED" } })).toBe(0);
    expect(await db.robotTask.count({ where: { title: { contains: campaign.name } } })).toBe(0);

    // Asking for the activation by hand does not get around it either.
    await expect(updateMarketingCampaignStatus(campaign.id, "ACTIVE", owner.id)).rejects.toThrow("Payment confirmation is still pending");
    expect((await listMarketingCampaigns(owner.id)).find((item) => item.id === campaign.id)?.status).toBe("DRAFT");
    expect(await db.auditLog.count({ where: { action: "marketing.campaign.payment.requested", entityId: requested.payment?.id } })).toBe(1);
  });

  it("has no self-service way to confirm payment any more", () => {
    expect("confirmCampaignPaymentAndAssignRobot" in campaignService).toBe(false);
  });

  it("does not let an administrator confirm the payment of a campaign they created themselves", async () => {
    const admin = await createUser("admin-owner", "ADMIN");
    const campaign = await campaignFor(admin.id);
    await requestCampaignPayment(campaign.id, admin.id);
    await expect(confirmCampaignPaymentReceived({ amountMinor: campaign.budgetMinor, campaignId: campaign.id, reference: "TRX-SELF" }, admin.id)).rejects.toThrow("different administrator");
    expect((await db.payment.findFirstOrThrow({ where: { externalRef: `marketing-${campaign.id}` } })).status).toBe("PENDING");
  });

  it("is idempotent: asking again, or many times at once, leaves a single request", async () => {
    const owner = await createUser("owner");
    const campaign = await campaignFor(owner.id);
    const first = await requestCampaignPayment(campaign.id, owner.id);
    const again = await requestCampaignPayment(campaign.id, owner.id);
    expect(again.payment?.id).toBe(first.payment?.id);

    const concurrent = await campaignFor(owner.id);
    const results = await Promise.all([1, 2, 3, 4].map(() => requestCampaignPayment(concurrent.id, owner.id)));
    expect(new Set(results.map((result) => result.payment?.id)).size).toBe(1);
    expect(await db.payment.count({ where: { externalRef: `marketing-${concurrent.id}` } })).toBe(1);
  });

  it("refuses a request for another person's campaign, a campaign without a budget, a weak one, or an archived one", async () => {
    const owner = await createUser("owner");
    const stranger = await createUser("stranger");
    const campaign = await campaignFor(owner.id);
    await expect(requestCampaignPayment(campaign.id, stranger.id)).rejects.toThrow("Campaign not found");

    const unfunded = await campaignFor(owner.id, { budgetMinor: 0 });
    expect(unfunded.qualityScore).toBeGreaterThanOrEqual(60);
    await expect(requestCampaignPayment(unfunded.id, owner.id)).rejects.toThrow("budget");

    const weak = await campaignFor(owner.id, { budgetMinor: 100, callToAction: undefined, kpiTarget: undefined, objective: "Short goal", targetAudience: undefined });
    expect(weak.qualityScore).toBeLessThan(60);
    await expect(requestCampaignPayment(weak.id, owner.id)).rejects.toThrow("quality score");

    const archived = await campaignFor(owner.id);
    await updateMarketingCampaignStatus(archived.id, "ARCHIVED", owner.id);
    await expect(requestCampaignPayment(archived.id, owner.id)).rejects.toThrow("Archived campaigns");
  });

  it("lets an administrator confirm once, and only for the amount that was requested", async () => {
    const owner = await createUser("owner");
    const admin = await createUser("admin", "ADMIN");
    const campaign = await campaignFor(owner.id);
    await requestCampaignPayment(campaign.id, owner.id);

    expect((await listPendingMarketingPaymentRequests()).map((item) => item.id)).toContain(campaign.id);
    const queued = (await listPendingMarketingPaymentRequests()).find((item) => item.id === campaign.id);
    expect(queued?.createdBy.email).toContain("@example.test");

    await expect(confirmCampaignPaymentReceived({ amountMinor: campaign.budgetMinor - 1, campaignId: campaign.id, reference: "TRX-WRONG" }, admin.id)).rejects.toThrow("does not match");
    expect((await db.payment.findFirstOrThrow({ where: { externalRef: `marketing-${campaign.id}` } })).status).toBe("PENDING");

    const confirmed = await confirmCampaignPaymentReceived({ amountMinor: campaign.budgetMinor, campaignId: campaign.id, reference: `TRX-${suffix}` }, admin.id);
    expect(confirmed.status).toBe("ACTIVE");
    expect(confirmed.payment).toMatchObject({ provider: "MANUAL_REVIEW", status: "SUCCEEDED" });
    expect(confirmed.payment?.paidAt).toBeInstanceOf(Date);
    expect(confirmed.robotTask?.robot.id).toBe(robotId);
    const payment = await db.payment.findFirstOrThrow({ where: { externalRef: `marketing-${campaign.id}` } });
    expect(payment.metadata).toMatchObject({ confirmedByUserId: admin.id, purpose: "marketing-campaign", receivedReference: `TRX-${suffix}`, requestedByUserId: owner.id });
    expect(await db.auditLog.count({ where: { actorId: admin.id, action: "marketing.campaign.payment.confirmed", entityId: payment.id } })).toBe(1);
    expect((await listPendingMarketingPaymentRequests()).map((item) => item.id)).not.toContain(campaign.id);

    await expect(confirmCampaignPaymentReceived({ amountMinor: campaign.budgetMinor, campaignId: campaign.id, reference: "TRX-AGAIN" }, admin.id)).rejects.toThrow("already confirmed");
    expect(await db.robotTask.count({ where: { title: `Marketing campaign: ${campaign.name}` } })).toBe(1);
    // After confirmation the owner may pause and resume as before.
    expect((await updateMarketingCampaignStatus(campaign.id, "PAUSED", owner.id)).status).toBe("PAUSED");
    expect((await updateMarketingCampaignStatus(campaign.id, "ACTIVE", owner.id)).status).toBe("ACTIVE");
  });

  it("lets only one of two concurrent confirmations succeed", async () => {
    const owner = await createUser("owner");
    const admin = await createUser("admin", "ADMIN");
    const otherAdmin = await createUser("admin", "ADMIN");
    const campaign = await campaignFor(owner.id);
    await requestCampaignPayment(campaign.id, owner.id);

    const results = await Promise.allSettled([
      confirmCampaignPaymentReceived({ amountMinor: campaign.budgetMinor, campaignId: campaign.id, reference: "TRX-FIRST" }, admin.id),
      confirmCampaignPaymentReceived({ amountMinor: campaign.budgetMinor, campaignId: campaign.id, reference: "TRX-SECOND" }, otherAdmin.id),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.robotTask.count({ where: { title: `Marketing campaign: ${campaign.name}` } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "marketing.campaign.payment.confirmed", metadata: { path: ["campaignId"], equals: campaign.id } } })).toBe(1);
  });

  it("refuses to confirm what was never requested, or a campaign that was archived meanwhile", async () => {
    const owner = await createUser("owner");
    const admin = await createUser("admin", "ADMIN");
    const unrequested = await campaignFor(owner.id);
    await expect(confirmCampaignPaymentReceived({ amountMinor: unrequested.budgetMinor, campaignId: unrequested.id, reference: "TRX-NONE" }, admin.id)).rejects.toThrow("No payment request");
    await expect(confirmCampaignPaymentReceived({ amountMinor: 1, campaignId: "cdoesnotexist00000000000001", reference: "TRX-NONE" }, admin.id)).rejects.toThrow("Campaign not found");

    const archived = await campaignFor(owner.id);
    await requestCampaignPayment(archived.id, owner.id);
    await updateMarketingCampaignStatus(archived.id, "ARCHIVED", owner.id);
    await expect(confirmCampaignPaymentReceived({ amountMinor: archived.budgetMinor, campaignId: archived.id, reference: "TRX-LATE" }, admin.id)).rejects.toThrow("Archived campaigns");
    expect((await db.payment.findFirstOrThrow({ where: { externalRef: `marketing-${archived.id}` } })).status).toBe("PENDING");
    expect((await listPendingMarketingPaymentRequests()).map((item) => item.id)).not.toContain(archived.id);
  });
});

describe("revenue totals count only payments that were really made", () => {
  it("leaves pending requests and the earlier unverified confirmations out of what was paid", async () => {
    const currency = "ZZZ";
    const created = await Promise.all([
      db.payment.create({ data: { amountMinor: 100, currency, provider: "INTERNAL_CONFIRMATION", status: "SUCCEEDED" } }),
      db.payment.create({ data: { amountMinor: 200, currency, status: "SUCCEEDED" } }),
      db.payment.create({ data: { amountMinor: 300, currency, provider: "MANUAL_REVIEW", status: "PENDING" } }),
      db.payment.create({ data: { amountMinor: 400, currency, provider: "bank-transfer", status: "SUCCEEDED" } }),
      db.payment.create({ data: { amountMinor: 500, currency, provider: "bank-transfer", status: "REFUNDED" } }),
    ]);
    paymentIds.push(...created.map((payment) => payment.id));

    const summary = (await getFinancialSummary()).revenueByCurrency.find((entry) => entry.currency === currency);
    expect(summary).toEqual({ currency, pendingMinor: 300, refundedMinor: 500, succeededMinor: 600 });

    const before = (await getPlatformAdminSummary()).revenue;
    await db.payment.deleteMany({ where: { id: { in: [created[0].id, created[2].id] } } });
    const after = (await getPlatformAdminSummary()).revenue;
    // Removing the unverified confirmation changes nothing that was counted; removing the pending request lowers only "pending".
    expect(after.succeededMinor).toBe(before.succeededMinor);
    expect(before.pendingMinor - after.pendingMinor).toBe(300);
  });
});
