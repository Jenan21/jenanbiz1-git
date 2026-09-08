import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { queryE2E } from "./identity-fixture";

test("confirms a campaign payment and assigns an active bounty robot", async ({ baseURL, page }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const suffix = Date.now();
  let campaignId: string | undefined;
  let userId: string | undefined;
  let robotId: string | undefined;
  let paymentId: string | undefined;
  let robotTaskId: string | undefined;

  try {
    const registration = await page.request.post("/api/auth/register", { headers: { origin: baseURL }, data: { displayName: "Growth Operator", countryCode: "SA", email: `growth-${suffix}@example.test`, password: "StrongPass123!", locale: "en", language: "en" } });
    expect(registration.status()).toBe(201);
    userId = (await registration.json()).user.id as string;
    robotId = randomUUID();
    await queryE2E('INSERT INTO "Robot" (id, name, slug, intelligence, skill, status, "isVisible", "createdAt", "updatedAt") VALUES ($1, $2, $3, 90, 90, \'ACTIVE\', true, NOW(), NOW())', [robotId, "Growth Bounty Robot", `growth-robot-${suffix}`]);

    const created = await page.request.post("/api/marketing", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "createCampaign", name: "E2E growth campaign", objective: "Validate commercial growth campaign creation and lead capture.", channel: "SOCIAL", customerType: "INDIVIDUAL", budgetMinor: 125000, currency: "SAR" } });
    expect(created.status(), await created.text()).toBe(201);
    campaignId = (await created.json()).result.id as string;

    const assigned = await page.request.post("/api/marketing", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "confirmPaymentAndAssign", campaignId } });
    expect(assigned.status(), await assigned.text()).toBe(200);
    const assignedCampaign = (await assigned.json()).result;
    expect(assignedCampaign.status).toBe("ACTIVE");
    expect(assignedCampaign.payment.status).toBe("SUCCEEDED");
    expect(assignedCampaign.payment.payerUserId).toBe(userId);
    expect(assignedCampaign.robotTask.robot.id).toBe(robotId);
    paymentId = assignedCampaign.payment.id as string;
    robotTaskId = assignedCampaign.robotTask.id as string;

    const lead = await page.request.post("/api/marketing", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "createLead", campaignId, label: "E2E qualified buyer", source: "acceptance suite", status: "QUALIFIED" } });
    expect(lead.status(), await lead.text()).toBe(200);
    expect((await lead.json()).result.status).toBe("QUALIFIED");

    await page.goto("/marketing", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "E2E growth campaign" })).toBeVisible();
  } finally {
    if (campaignId) await queryE2E('DELETE FROM "MarketingCampaign" WHERE id = $1', [campaignId]);
    if (paymentId) await queryE2E('DELETE FROM "Payment" WHERE id = $1', [paymentId]);
    if (robotTaskId) await queryE2E('DELETE FROM "RobotTask" WHERE id = $1', [robotTaskId]);
    if (robotId) await queryE2E('DELETE FROM "Robot" WHERE id = $1', [robotId]);
    if (userId) await queryE2E('DELETE FROM "User" WHERE id = $1', [userId]);
  }
});