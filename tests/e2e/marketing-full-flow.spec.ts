import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { MARKETING_FLOW_ROUTES } from "@/lib/marketing/marketing-routes";
import { cleanE2EIdentities, createE2ESession, queryE2E, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = "http://127.0.0.1:3101";
const robotId = randomUUID();
const robotSlug = `marketing-e2e-${robotId.slice(0, 8)}`;
const viewports = [
  { width: 2560, height: 1440 }, { width: 1920, height: 1080 }, { width: 1440, height: 900 },
  { width: 1366, height: 768 }, { width: 1280, height: 800 }, { width: 1024, height: 1366 },
  { width: 820, height: 1180 }, { width: 430, height: 932 }, { width: 390, height: 844 }, { width: 360, height: 800 },
] as const;

test.describe.serial("Jenan Marketing full flow", () => {
  test.setTimeout(300_000);

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
    await queryE2E('INSERT INTO "Robot" (id, name, slug, intelligence, skill, experience, status, "isVisible", "createdAt", "updatedAt") VALUES ($1, $2, $3, 95, 92, 0, \'ACTIVE\', true, NOW(), NOW())', [robotId, "E2E Marketing Robot", robotSlug]);
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
    await queryE2E('DELETE FROM "Robot" WHERE id = $1', [robotId]);
  });

  test("uses sourced metrics and completes campaign, audience, lead, analytics, and report flows", async ({ context, page }) => {
    const token = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([{ name: "jenan_session", value: token, url: origin, httpOnly: true, sameSite: "Lax" }, { name: "locale", value: "en", url: origin }]);
    const organizationResponse = await page.request.post("/api/software/operations", { headers: { origin }, data: { action: "createOrganization", name: "E2E Marketing Company" } });
    expect(organizationResponse.status()).toBe(201);
    const organizationId = (await organizationResponse.json()).result.id as string;

    await page.goto("/marketing/campaign/new", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Campaign name").fill("E2E Sourced Growth Campaign");
    await page.getByLabel("Campaign owner").selectOption(`ORG:${organizationId}`);
    await page.getByLabel("Channel").selectOption("SOCIAL");
    await page.getByPlaceholder("Allocated budget").fill("12000");
    await page.getByPlaceholder("Conversion target").fill("2");
    await page.getByPlaceholder("Target audience").fill("Saudi SME operations leaders");
    await page.getByPlaceholder("Call to action").fill("Book an operations review");
    await page.getByLabel("Start date").fill("2026-10-01");
    await page.getByLabel("End date").fill("2026-10-31");
    await page.getByPlaceholder("Campaign objective and desired outcome").fill("Launch a structured campaign for operations leaders, record qualified demand, route evidence to sales, and report conversions from verified lead records.");
    await page.getByPlaceholder("Content and message brief").fill("Lead with measurable operating clarity and a documented review call to action.");
    const campaignResponse = page.waitForResponse((response) => response.url().endsWith("/api/marketing") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save draft" }).click();
    expect((await campaignResponse).status()).toBe(201);
    const payload = await (await page.request.get("/api/marketing")).json();
    const campaignId = payload.campaigns.find((campaign: { name: string }) => campaign.name === "E2E Sourced Growth Campaign").id as string;

    await page.goto(`/marketing/campaign/sample?campaign=${campaignId}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".marketing-campaign-detail")).toContainText("External channel provider: not connected");
    const confirmResponse = page.waitForResponse((response) => response.url().endsWith("/api/marketing") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Internal confirm and assign" }).click();
    expect((await confirmResponse).status()).toBe(200);
    await expect(page.locator(".marketing-campaign-detail")).toContainText("E2E Marketing Robot");

    await page.goto("/marketing/audience", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Campaign").selectOption(campaignId);
    await page.getByPlaceholder("Segment name").fill("Saudi SME operators");
    await page.getByPlaceholder("Location").fill("Saudi Arabia");
    await page.getByPlaceholder("Interests").fill("growth, operations, analytics");
    const audienceResponse = page.waitForResponse((response) => response.url().endsWith("/api/marketing") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save segment" }).click();
    expect((await audienceResponse).status()).toBe(201);
    await expect(page.locator(".marketing-audience-grid")).toContainText("Audience size: unavailable");

    await page.goto("/marketing/leads", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Campaign").selectOption(campaignId);
    await page.getByPlaceholder("Lead label").fill("E2E Qualified Lead");
    await page.getByPlaceholder("Source").fill("LinkedIn");
    await page.getByPlaceholder("Expected pipeline value").fill("18000");
    await page.getByLabel("Lead status").selectOption("QUALIFIED");
    const leadResponse = page.waitForResponse((response) => response.url().endsWith("/api/marketing") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Add lead" }).click();
    expect((await leadResponse).status()).toBe(201);
    const leadRow = page.locator(".marketing-lead-table tbody tr").filter({ hasText: "E2E Qualified Lead" });
    await expect(leadRow).toBeVisible();
    const conversionResponse = page.waitForResponse((response) => response.url().endsWith("/api/marketing") && response.request().method() === "POST");
    await leadRow.locator("select").selectOption("CONVERTED");
    expect((await conversionResponse).status()).toBe(200);

    await page.goto("/marketing/analytics", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".marketing-analytics")).toContainText("Recorded conversions");
    await expect(page.locator(".marketing-analytics")).toContainText("Unavailable");
    const refreshed = await (await page.request.post("/api/marketing", { headers: { origin }, data: { action: "refreshPerformance", campaignId } })).json();
    expect(refreshed.result.snapshot.externalMetricsAvailable).toBe(false);
    expect(refreshed.result.snapshot.source).toBe("RECORDED_LEADS");
    expect(refreshed.result.snapshot).not.toHaveProperty("roi");

    await page.goto(`/marketing/report/sample?campaign=${campaignId}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".marketing-report")).toContainText("Pipeline-to-budget ratio");
    await expect(page.locator(".marketing-report")).toContainText("only print/PDF is supported");

    for (const definition of MARKETING_FLOW_ROUTES) {
      const suffix = definition.id === "campaign-detail" || definition.id === "report" ? `?campaign=${campaignId}` : "";
      const response = await page.goto(`${definition.route}${suffix}`, { waitUntil: "domcontentloaded" });
      expect(response?.status(), definition.route).toBe(200);
      await expect(page.locator(".marketing-flow")).toBeVisible();
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
      expect(layout.scrollWidth, definition.route).toBeLessThanOrEqual(layout.viewportWidth + 1);
    }

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const route of ["/marketing", "/marketing/campaigns", `/marketing/campaign/sample?campaign=${campaignId}`, "/marketing/leads", "/marketing/analytics", `/marketing/report/sample?campaign=${campaignId}`]) {
        expect((await page.goto(route, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
        const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
        expect(layout.scrollWidth, `${route} at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(layout.viewportWidth + 1);
      }
    }
  });
});