import { expect, test } from "@playwright/test";
import { projectFlowDefinitions } from "@/lib/projects/project-flow-routes";
import { cleanE2EIdentities, createE2ESession, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";
import { PDFDocument } from "pdf-lib";

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

  test("saves reproducible studies, rejects unbounded inputs and downloads Arabic reports", async ({ context, page }) => {
    const sessionToken = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([
      { name: "locale", value: "en", url: origin },
      { name: "jenan_session", value: sessionToken, url: origin, httpOnly: true, sameSite: "Lax" },
    ]);
    const created = await page.request.post("/api/projects", { headers: { origin }, data: { action: "create", name: "دراسة جدوى مشروع جنان برو", countryCode: "SA", sector: "التصنيع" } });
    expect(created.status()).toBe(201);
    const projectId = (await created.json()).result.id;
    await page.goto("/projects/feasibility/pro/financial");
    await expect(page.locator(".projects-workspace")).toHaveAttribute("aria-busy", "false");
    await expect(page.getByLabel("Initial investment", { exact: true })).toHaveValue("");
    const inputs = { initialInvestment: 10000, monthlyFixedCosts: 2000, variableCostPerUnit: 10, pricePerUnit: 25, monthlyUnits: 300, months: 12, annualDiscountRate: 12, annualInflationRate: 2, taxRate: 15 };
    const labels: Record<keyof typeof inputs, string> = {
      initialInvestment: "Initial investment", monthlyFixedCosts: "Monthly fixed costs", variableCostPerUnit: "Variable cost per unit",
      pricePerUnit: "Price per unit", monthlyUnits: "Monthly units", months: "Months",
      annualDiscountRate: "Annual discount rate %", annualInflationRate: "Annual inflation rate %", taxRate: "Tax rate %",
    };
    for (const [field, input] of Object.entries(inputs)) await page.getByLabel(labels[field as keyof typeof inputs], { exact: true }).fill(String(input));
    await page.getByRole("button", { name: "Calculate and save version", exact: true }).click();
    await expect(page.locator(".project-financial-audit")).toBeVisible();
    await expect(page.locator(".project-financial-audit")).toContainText("JENAN_FINANCE_V2");
    await page.getByText("Monthly cash-flow schedule", { exact: true }).click();
    await expect(page.locator(".project-table-scroll tbody tr")).toHaveCount(13);
    await page.getByText("One-factor sensitivity ±10%", { exact: true }).click();
    await expect(page.locator(".project-financial-audit details").last().locator("li")).toHaveCount(8);
    await page.reload();
    await expect(page.getByLabel("Initial investment", { exact: true })).toHaveValue("10000");
    await expect(page.locator(".project-financial-audit")).toBeVisible();
    const oversized = await page.request.post("/api/projects", { headers: { origin }, data: { action: "calculateFeasibility", projectId, persist: true, inputs: { ...inputs, months: 1e12 } } });
    expect(oversized.status()).toBe(400);
    const pdfResponse = await page.request.get(`/api/projects/${projectId}/report`);
    expect(pdfResponse.status()).toBe(200);
    expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
    expect(pdfResponse.headers()["cache-control"]).toContain("no-store");
    const pdf = await PDFDocument.load(await pdfResponse.body());
    expect(pdf.getTitle()).toBe("دراسة جدوى مشروع جنان برو");
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  test("checks all four branches in Arabic/English at the ten acceptance viewports", async ({ context, page }, testInfo) => {
    test.setTimeout(480_000);
    const sessionToken = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([{ name: "jenan_session", value: sessionToken, url: origin, httpOnly: true, sameSite: "Lax" }]);
    const existing = await page.request.get("/api/projects?limit=1");
    expect(existing.status()).toBe(200);
    if (!(await existing.json()).projects.length) {
      const created = await page.request.post("/api/projects", {
        headers: { origin }, data: { action: "create", countryCode: "SA", name: "Acceptance viewport review project", sector: "Operations" },
      });
      expect(created.status()).toBe(201);
    }
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const viewports = [
      [2560, 1440], [1920, 1080], [1440, 900], [1366, 768], [1280, 800],
      [1024, 1366], [820, 1180], [430, 932], [390, 844], [360, 800],
    ] as const;
    const routes = ["/projects/analysis/result", "/projects/feasibility/pro/financial", "/projects/evaluation/result", "/projects/start/launch"];
    for (const locale of ["ar", "en"]) {
      await context.addCookies([{ name: "locale", value: locale, url: origin }]);
      for (const [width, height] of viewports) {
        await page.setViewportSize({ width, height });
        for (const route of routes) {
          expect((await page.goto(route, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
          await expect(page.locator(".projects-workspace")).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
          await expect(page.locator(".project-review-panel")).toBeVisible();
          const layout = await page.evaluate(() => ({
            width: document.documentElement.clientWidth,
            scroll: document.documentElement.scrollWidth,
            clippedControls: [...document.querySelectorAll("button, input, select")].filter((element) => {
              const box = element.getBoundingClientRect();
              return box.width > 0 && (box.left < -1 || box.right > document.documentElement.clientWidth + 1);
            }).length,
          }));
          expect(layout.scroll, `${route} ${locale} ${width}`).toBeLessThanOrEqual(layout.width + 1);
          expect(layout.clippedControls, `${route} ${locale} ${width}`).toBe(0);
          if (route === "/projects/feasibility/pro/financial") {
            await expect.poll(() => page.evaluate(() => {
              const target = document.querySelector(".project-calculator")!;
              const headerHeight = document.querySelector(".platform-header")!.getBoundingClientRect().height;
              return parseFloat(getComputedStyle(target).scrollMarginTop) - headerHeight;
            })).toBeGreaterThanOrEqual(26);
          }
          if (width === 1920 || width === 390) {
            await expect.poll(() => page.evaluate(() => {
              window.scrollTo({ top: 0, behavior: "instant" });
              return window.scrollY;
            })).toBe(0);
            await page.screenshot({ path: testInfo.outputPath(`${locale}-${width}-${route.replaceAll("/", "_")}.png`), fullPage: true });
          }
        }
      }
    }
    expect(errors).toEqual([]);
  });
});