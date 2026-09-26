import { expect, test } from "@playwright/test";
import { projectFlowDefinitions } from "@/lib/projects/project-flow-routes";
import { cleanE2EIdentities, createE2ESession, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

test.describe.serial("Projects full route flow", () => {
  test.setTimeout(240_000);

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  test("renders every blueprint child route with the live workspace", async ({ context, page }) => {
    const sessionToken = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([
      { name: "locale", value: "en", url: "http://127.0.0.1:3101" },
      { name: "jenan_session", value: sessionToken, url: "http://127.0.0.1:3101", httpOnly: true, sameSite: "Lax" },
    ]);
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));

    for (const definition of projectFlowDefinitions) {
      const response = await page.goto(definition.route, { waitUntil: "domcontentloaded" });
      expect(response?.status(), definition.route).toBe(200);
      await expect(page.locator(".projects-live-service")).toBeVisible();
      await expect(page.locator(".projects-workspace")).toHaveAttribute("data-project-view", definition.focus);
      await expect(page.locator(".project-flow-navigation a.is-active")).toHaveAttribute("href", definition.route);
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
      expect(layout.scrollWidth, definition.route).toBeLessThanOrEqual(layout.viewportWidth + 1);
    }
    expect(browserErrors).toEqual([]);
  });

  test("keeps representative flows responsive on mobile", async ({ context, page }) => {
    const sessionToken = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([{ name: "jenan_session", value: sessionToken, url: "http://127.0.0.1:3101", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ["/projects", "/projects/analysis/map", "/projects/evaluation/risks", "/projects/feasibility/pro/financial", "/projects/start/team"]) {
      expect((await page.goto(route, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
      expect(layout.scrollWidth, route).toBeLessThanOrEqual(layout.viewportWidth + 1);
    }
  });
});