import { expect, test } from "@playwright/test";

import { REPORT_ROUTES } from "@/lib/reports/report-routes";
import { cleanE2EIdentities, createE2ESession, seedE2EAdmin, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3101"}`;

test.describe.serial("shared report and legacy route acceptance", () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
    await seedE2EAdmin();
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  test("renders all five report pages from real or explicit unavailable sources", async ({ context, page }) => {
    const token = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([{ name: "jenan_session", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
    const created = await page.request.post("/api/projects", {
      headers: { origin },
      data: { action: "create", name: "E2E Report Project", description: "Verified report source", sector: "Technology", countryCode: "SA", currency: "SAR" },
    });
    expect(created.status()).toBe(201);
    const projectId = (await created.json()).result.id as string;

    for (const route of REPORT_ROUTES) {
      const suffix = route.includes("project-") || route.endsWith("general") ? `?project=${projectId}` : "";
      expect((await page.goto(`${route}${suffix}`, { waitUntil: "domcontentloaded" }))?.status(), route).toBe(200);
      await expect(page.locator(".report-document")).toBeVisible();
      await expect(page.locator(".report-source")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), route).toBe(true);
    }
    await expect(page.locator(".report-source")).toHaveText("AWAITING_APPROVED_SOURCE");
  });

  test("keeps report documents printable and responsive on mobile", async ({ context, page }) => {
    const token = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([{ name: "jenan_session", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/reports/view/portfolio", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".report-actions button")).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  });

  test("redirects legacy routes to their approved replacements", async ({ browser }) => {
    const userContext = await browser.newContext();
    const userToken = await createE2ESession(e2eIdentity.user.email);
    await userContext.addCookies([{ name: "jenan_session", value: userToken, url: origin }]);
    const home = await userContext.request.get("/home", { maxRedirects: 0 });
    expect(home.status()).toBe(307);
    expect(home.headers().location).toBe("/");
    await userContext.close();

    const adminContext = await browser.newContext();
    const adminToken = await createE2ESession(e2eIdentity.admin.email);
    await adminContext.addCookies([{ name: "jenan_session", value: adminToken, url: origin }]);
    for (const [legacy, replacement] of [["/admin/ai", "/models"], ["/admin/agents", "/robots/factory"], ["/admin/health", "/observability/health"]] as const) {
      const response = await adminContext.request.get(legacy, { maxRedirects: 0 });
      expect(response.status(), legacy).toBe(307);
      expect(response.headers().location).toBe(replacement);
    }
    await adminContext.close();
  });
});