import { expect, test } from "@playwright/test";
import { projectFlowDefinitions } from "@/lib/projects/project-flow-routes";
import { cleanE2EIdentities, createE2ESession, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = "http://127.0.0.1:3101";

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
    const created = await page.request.post("/api/projects", { headers: { origin }, data: { action: "create", countryCode: "SA", name: "E2E route composition project", sector: "Operations" } });
    expect(created.status()).toBe(201);
    const projectId = (await created.json()).result.id as string;
    const compliance = await page.request.post("/api/projects", { headers: { origin }, data: { action: "createCompliance", authority: "Municipality", kind: "LICENSE", projectId, reference: "E2E-LIC", title: "E2E operating license" } });
    expect(compliance.status()).toBe(201);
    const vendor = await page.request.post("/api/projects", { headers: { origin }, data: { action: "createVendor", category: "Equipment", contactEmail: "supplier@example.test", kind: "VENDOR", name: "E2E verified supplier", projectId } });
    expect(vendor.status()).toBe(201);

    for (const definition of projectFlowDefinitions) {
      const response = await page.goto(definition.route, { waitUntil: "domcontentloaded" });
      expect(response?.status(), definition.route).toBe(200);
      await expect(page.locator(".projects-live-service")).toBeVisible();
      await expect(page.locator(".projects-workspace")).toHaveAttribute("data-project-view", definition.focus);
      await expect(page.locator(".project-flow-navigation a.is-active")).toHaveAttribute("href", definition.route);
      await expect(page.locator(`[data-project-focus="${definition.focus}"]:visible`).first()).toBeVisible();
      const visibleFocuses = await page.locator("[data-project-focus]").evaluateAll((elements) => [...new Set(elements.filter((element) => { const style = getComputedStyle(element); const bounds = element.getBoundingClientRect(); return style.display !== "none" && bounds.width > 0 && bounds.height > 0; }).map((element) => element.getAttribute("data-project-focus")))].filter(Boolean));
      expect(visibleFocuses, definition.route).toEqual([definition.focus]);
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
      expect(layout.scrollWidth, definition.route).toBeLessThanOrEqual(layout.viewportWidth + 1);
    }
    await page.goto("/projects/start/licenses", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".projects-workspace")).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
    await expect(page.getByText("E2E operating license")).toBeVisible();
    await page.goto("/projects/start/vendors", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".projects-workspace")).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
    await expect(page.getByText("E2E verified supplier")).toBeVisible();
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