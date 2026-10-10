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
      if (definition.route.startsWith("/projects/analysis/")) {
        await expect(page.locator(".project-analysis-workspace")).toHaveAttribute(
          "data-analysis-route",
          definition.route,
        );
        await expect(
          page.locator(".pa-stage-navigation a.is-active"),
        ).toBeVisible();
      } else if (definition.route.startsWith("/projects/feasibility/pro/")) {
        await expect(page.locator(".professional-feasibility")).toHaveAttribute("data-project-route", definition.route);
        await expect(page.locator(".pfs-stepper a[aria-current='step']")).toBeVisible();
        await expect(page.locator(".pfs-stage [data-project-focus], .pfs-stage[data-project-focus]")).toBeVisible();
      } else if (definition.route.startsWith("/projects/start/")) {
        await expect(page.locator(".project-start-workspace")).toHaveAttribute("data-project-start-route", definition.route);
        if (definition.route !== "/projects/start/report") {
          await expect(page.locator(".psw-navigation a.is-active")).toBeVisible();
        }
      } else {
        await expect(page.locator(".projects-live-service")).toBeVisible();
        await expect(page.locator(".projects-workspace")).toHaveAttribute("data-project-view", definition.focus);
        await expect(page.locator(".project-flow-navigation a.is-active")).toHaveAttribute("href", definition.route);
        await expect(page.locator(`[data-project-focus="${definition.focus}"]:visible`).first()).toBeVisible();
        const visibleFocuses = await page.locator("[data-project-focus]").evaluateAll((elements) => [...new Set(elements.filter((element) => { const style = getComputedStyle(element); const bounds = element.getBoundingClientRect(); return style.display !== "none" && bounds.width > 0 && bounds.height > 0; }).map((element) => element.getAttribute("data-project-focus")))].filter(Boolean));
        expect(visibleFocuses, definition.route).toEqual([definition.focus]);
      }
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
      expect(layout.scrollWidth, definition.route).toBeLessThanOrEqual(layout.viewportWidth + 1);
    }
    const marketingResponse = await page.goto(`/projects/feasibility/pro/marketing?project=${projectId}`, { waitUntil: "domcontentloaded" });
    expect(marketingResponse?.status()).toBe(200);
    await expect(page.locator(".professional-feasibility")).toHaveAttribute("data-project-route", "/projects/feasibility/pro/marketing");
    await expect(page.locator("[data-project-focus='marketing']")).toBeVisible();
    await page.goto(`/projects/analysis/print?project=${projectId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator(".project-analysis-workspace")).toHaveAttribute(
      "data-analysis-route",
      "/projects/analysis/print",
    );
    await page.goto("/projects/start/licenses", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("E2E operating license")).toBeVisible({ timeout: 20_000 });
    await page.goto("/projects/start/vendors", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("E2E verified supplier")).toBeVisible({ timeout: 20_000 });
    expect(browserErrors).toEqual([]);
  });

  test("keeps representative flows responsive on mobile", async ({ context, page }) => {
    const sessionToken = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([{ name: "jenan_session", value: sessionToken, url: "http://127.0.0.1:3101", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ["/projects", "/projects/analysis/map", "/projects/evaluation/risks", "/projects/feasibility/pro/financial", "/projects/start/team"]) {
      expect((await page.goto(route, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
      if (route === "/projects") {
        await expect(page.locator(".projects-dashboard")).toHaveAttribute(
          "data-projects-source",
          "ACCOUNT_PROJECT_RECORDS",
        );
        await expect(page.locator(".projects-dashboard__services > a")).toHaveCount(4);
      }
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
      expect(layout.scrollWidth, route).toBeLessThanOrEqual(layout.viewportWidth + 1);
    }
  });

  test("keeps every professional feasibility stage responsive at the approved sizes", async ({
    context,
    page,
  }) => {
    const sessionToken = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([
      {
        name: "jenan_session",
        value: sessionToken,
        url: "http://127.0.0.1:3101",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const sizes = [
      { width: 2560, height: 1440 },
      { width: 1920, height: 1080 },
      { width: 1440, height: 900 },
      { width: 1366, height: 768 },
      { width: 1280, height: 800 },
      { width: 1024, height: 1366 },
      { width: 820, height: 1180 },
      { width: 430, height: 932 },
      { width: 390, height: 844 },
      { width: 360, height: 800 },
    ];
    const routes = [
      "/projects/feasibility/pro/new",
      "/projects/feasibility/pro/market",
      "/projects/feasibility/pro/marketing",
      "/projects/feasibility/pro/technical",
      "/projects/feasibility/pro/financial",
      "/projects/feasibility/pro/result",
      "/projects/feasibility/pro/report",
    ];
    for (const size of sizes) {
      await page.setViewportSize(size);
      for (const route of routes) {
        expect((await page.goto(route, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
        await expect(page.locator(".professional-feasibility")).toBeVisible();
        const layout = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
        }));
        expect(
          layout.scrollWidth,
          `${route} at ${size.width}x${size.height}`,
        ).toBeLessThanOrEqual(layout.viewportWidth + 1);
      }
    }
  });

  test("keeps every project analysis stage responsive at the approved sizes", async ({
    context,
    page,
  }) => {
    const sessionToken = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([
      {
        name: "jenan_session",
        value: sessionToken,
        url: "http://127.0.0.1:3101",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const sizes = [
      { width: 2560, height: 1440 },
      { width: 1920, height: 1080 },
      { width: 1440, height: 900 },
      { width: 1366, height: 768 },
      { width: 1280, height: 800 },
      { width: 1024, height: 1366 },
      { width: 820, height: 1180 },
      { width: 430, height: 932 },
      { width: 390, height: 844 },
      { width: 360, height: 800 },
    ];
    const routes = [
      "/projects/analysis/new",
      "/projects/analysis/progress",
      "/projects/analysis/details",
      "/projects/analysis/result",
      "/projects/analysis/report",
      "/projects/analysis/print",
    ];
    for (const size of sizes) {
      await page.setViewportSize(size);
      for (const route of routes) {
        expect(
          (await page.goto(route, { waitUntil: "domcontentloaded" }))?.status(),
        ).toBe(200);
        await expect(page.locator(".project-analysis-workspace")).toBeVisible();
        const layout = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
        }));
        expect(
          layout.scrollWidth,
          `${route} at ${size.width}x${size.height}`,
        ).toBeLessThanOrEqual(layout.viewportWidth + 1);
      }
    }
  });

  test("keeps every project launch stage responsive at the approved sizes", async ({
    context,
    page,
  }) => {
    const sessionToken = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([{ name: "jenan_session", value: sessionToken, url: "http://127.0.0.1:3101", httpOnly: true, sameSite: "Lax" }]);
    const sizes = [
      { width: 2560, height: 1440 },
      { width: 1920, height: 1080 },
      { width: 1440, height: 900 },
      { width: 1366, height: 768 },
      { width: 1280, height: 800 },
      { width: 1024, height: 1366 },
      { width: 820, height: 1180 },
      { width: 430, height: 932 },
      { width: 390, height: 844 },
      { width: 360, height: 800 },
    ];
    const routes = [
      "/projects/start",
      "/projects/start/new",
      "/projects/start/licenses",
      "/projects/start/setup",
      "/projects/start/team",
      "/projects/start/vendors",
      "/projects/start/roadmap",
      "/projects/start/launch",
      "/projects/start/report",
    ];
    for (const size of sizes) {
      await page.setViewportSize(size);
      for (const route of routes) {
        expect((await page.goto(route, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
        await expect(page.locator(".project-start-workspace")).toBeVisible();
        const layout = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
        }));
        expect(layout.scrollWidth, `${route} at ${size.width}x${size.height}`).toBeLessThanOrEqual(layout.viewportWidth + 1);
      }
    }
  });
});