import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  confirmCampaignPaymentAndAssignRobot,
  createMarketingCampaign,
  createMarketingLead,
  refreshMarketingCampaignPerformance,
  updateMarketingCampaignStatus,
} from "@/services/marketing/campaign-service";

const suffix = crypto.randomUUID().slice(0, 8);
let userId: string | undefined;
let robotId: string | undefined;
const campaignIds: string[] = [];

afterAll(async () => {
  if (campaignIds.length) await db.marketingCampaign.deleteMany({ where: { id: { in: campaignIds } } });
  if (userId) await db.payment.deleteMany({ where: { payerUserId: userId, externalRef: { startsWith: "marketing-" } } });
  if (robotId) await db.robot.delete({ where: { id: robotId } });
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

describe("marketing domain", () => {
  it("scores campaigns, gates weak activation, assigns robots, and reports performance", async () => {
    const user = await db.user.create({ data: { email: `marketing-${suffix}@example.test`, status: "ACTIVE", profile: { create: { displayName: "Growth owner", locale: "en", language: "en" } } } });
    userId = user.id;
    const robot = await db.robot.create({ data: { intelligence: 95, isVisible: true, name: `Growth hunter ${suffix}`, skill: 91, slug: `growth-hunter-${suffix}`, status: "ACTIVE" } });
    robotId = robot.id;

    const weak = await createMarketingCampaign({ budgetMinor: 0, channel: "CONTENT", customerType: "INDIVIDUAL", name: `Weak campaign ${suffix}`, objective: "Short goal" }, user.id);
    campaignIds.push(weak.id);
    expect(weak.qualityScore).toBeLessThan(60);
    await expect(updateMarketingCampaignStatus(weak.id, "ACTIVE", user.id)).rejects.toThrow("quality score");
    await expect(confirmCampaignPaymentAndAssignRobot(weak.id, user.id)).rejects.toThrow("quality score");

    const strong = await createMarketingCampaign({
      budgetMinor: 12_000_00,
      callToAction: "Book a consultation",
      channel: "SOCIAL",
      customerType: "INDIVIDUAL",
      kpiTarget: 2,
      name: `Expansion campaign ${suffix}`,
      objective: "Launch a structured social campaign targeting business owners, qualify inbound leads, measure conversions, and route high-value opportunities to sales operations.",
      targetAudience: "Saudi SME owners seeking growth and project intelligence services",
    }, user.id);
    campaignIds.push(strong.id);
    expect(strong.qualityScore).toBeGreaterThanOrEqual(80);
    const active = await confirmCampaignPaymentAndAssignRobot(strong.id, user.id);
    expect(active.status).toBe("ACTIVE");
    expect(active.robotTask?.robot.id).toBe(robot.id);
    expect(active.payment?.status).toBe("SUCCEEDED");

    await createMarketingLead({ campaignId: strong.id, label: "Lead A", source: "LinkedIn", status: "QUALIFIED", valueMinor: 600_000 }, user.id);
    await createMarketingLead({ campaignId: strong.id, label: "Lead B", source: "Referral", status: "CONVERTED", valueMinor: 1_200_000 }, user.id);
    const performance = await refreshMarketingCampaignPerformance(strong.id, user.id);
    expect(performance.snapshot?.leads).toBe(2);
    expect(performance.snapshot?.converted).toBe(1);
    expect(performance.snapshot?.conversionRate).toBe(50);
    expect(performance.snapshot?.kpiProgress).toBe(50);
    expect(performance.snapshot?.pipelineValueMinor).toBe(1_800_000);
    expect(performance.snapshot?.roi).toBe(0.5);
  });
});