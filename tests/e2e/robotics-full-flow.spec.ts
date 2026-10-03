import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { ROBOTICS_FLOW_ROUTES } from "@/lib/robotics/robotics-routes";
import { cleanE2EIdentities, createE2ESession, queryE2E, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = "http://127.0.0.1:3101";
const robotId = `c${randomUUID().replaceAll("-", "").slice(0, 24)}`;
const profileId = `c${randomUUID().replaceAll("-", "").slice(0, 24)}`;
const viewports = [
  { width: 2560, height: 1440 }, { width: 1920, height: 1080 }, { width: 1440, height: 900 },
  { width: 1366, height: 768 }, { width: 1280, height: 800 }, { width: 1024, height: 1366 },
  { width: 820, height: 1180 }, { width: 430, height: 932 }, { width: 390, height: 844 }, { width: 360, height: 800 },
] as const;

test.describe.serial("Jenan Robotics public flow", () => {
  test.setTimeout(240_000);

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
    await queryE2E('INSERT INTO "Robot" (id, name, slug, intelligence, skill, experience, status, "isVisible", notes, team, "createdAt", "updatedAt") VALUES ($1, $2, $3, 92, 90, 88, \'ACTIVE\', true, $4, $5, NOW(), NOW())', [robotId, "E2E Public Operations Robot", `public-robot-${robotId.slice(0, 8)}`, "private admin note", "private-team"]);
    await queryE2E('INSERT INTO "RobotAcademicProfile" (id, "robotId", status, "qualityScore", "reliabilityScore", "safetyScore", "trustScore", "lastVerifiedAt", "operationalAt", "createdAt", "updatedAt") VALUES ($1, $2, \'OPERATIONAL\', 91, 93, 96, 94, NOW(), NOW(), NOW(), NOW())', [profileId, robotId]);
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
    await queryE2E('DELETE FROM "Robot" WHERE id = $1', [robotId]);
  });

  test("searches public profiles and records information requests without execution", async ({ context, page }) => {
    const token = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([{ name: "jenan_session", value: token, url: origin, httpOnly: true, sameSite: "Lax" }, { name: "locale", value: "en", url: origin }]);

    const apiPayload = await (await page.request.get("/api/robotics?query=operations&budgetMinor=100000")).json();
    const publicRobot = apiPayload.robots.find((robot: { id: string }) => robot.id === robotId);
    expect(publicRobot.name).toBe("E2E Public Operations Robot");
    expect(publicRobot).not.toHaveProperty("notes");
    expect(publicRobot).not.toHaveProperty("team");
    expect(publicRobot).not.toHaveProperty("tasks");
    expect(publicRobot).not.toHaveProperty("costs");
    expect(apiPayload.executionAvailableToUser).toBe(false);
    expect(apiPayload.pricingSourceConnected).toBe(false);

    await page.goto("/robotics/search", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Required task").fill("operations");
    await page.getByPlaceholder("Optional budget").fill("1000");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/\/robotics\/results\?/);
    const card = page.locator(".robotics-card").filter({ hasText: "E2E Public Operations Robot" });
    await expect(card).toBeVisible();
    await card.getByRole("link", { name: "View specifications" }).click();
    await expect(page.locator(".robotics-detail")).toContainText("E2E Public Operations Robot");
    await page.getByPlaceholder("Describe the task or use case").fill("Assess a documented operations automation use case for a regional team.");
    await page.getByPlaceholder("Sector").fill("Operations");
    await page.getByPlaceholder("Optional budget").fill("1000");
    const requestResponse = page.waitForResponse((response) => response.url().endsWith("/api/robotics") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Send information request" }).click();
    expect((await requestResponse).status()).toBe(201);
    await expect(page.getByRole("status")).toContainText("No robot was executed");
    expect((await queryE2E<{ count: string }>('SELECT COUNT(*)::text AS count FROM "RobotTask" WHERE "robotId" = $1', [robotId])).rows[0]?.count).toBe("0");

    const deniedApi = await page.request.get("/api/admin/robots");
    expect(deniedApi.status()).toBe(403);
    const deniedPage = await page.goto("/admin/robots");
    expect(deniedPage?.status()).toBe(403);
    await page.goto("/software/robotics");
    await expect(page).toHaveURL(/\/robotics$/);

    for (const definition of ROBOTICS_FLOW_ROUTES) {
      const suffix = definition.id === "results" || definition.id === "recommendations" ? "?query=operations&budget=1000" : definition.id === "item" ? `?robot=${robotId}` : "";
      const response = await page.goto(`${definition.route}${suffix}`, { waitUntil: "domcontentloaded" });
      expect(response?.status(), definition.route).toBe(200);
      await expect(page.locator(".robotics-flow")).toBeVisible();
      await expect(page.locator(".robotics-flow")).toHaveAttribute("data-robotics-route", definition.route);
      await expect(page.locator(".robotics-flow")).toHaveAttribute("data-robotics-screen", definition.id);
      await expect(page.locator(".robotics-flow")).toHaveAttribute("data-robotics-access", "INFORMATION_ONLY");
      await expect(page.locator(".robotics-flow")).toHaveAttribute("data-robotics-privacy", "SANITIZED_PUBLIC_PROFILE");
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
      expect(layout.scrollWidth, definition.route).toBeLessThanOrEqual(layout.viewportWidth + 1);
    }

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const route of ["/robotics", "/robotics/results?query=operations", `/robotics/item/sample?robot=${robotId}`, "/robotics/recommendations?query=operations"]) {
        expect((await page.goto(route, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
        const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
        expect(layout.scrollWidth, `${route} at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(layout.viewportWidth + 1);
      }
    }
  });
});