import { expect, test } from "@playwright/test";

import { REPORT_DEFINITIONS } from "@/lib/reports/report-routes";
import { cleanE2EIdentities, createE2ESession, queryE2E, seedE2EAdmin, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3101"}`;
const viewports = [
  { width: 2560, height: 1440 }, { width: 1920, height: 1080 }, { width: 1440, height: 900 },
  { width: 1366, height: 768 }, { width: 1280, height: 800 }, { width: 1024, height: 1366 },
  { width: 820, height: 1180 }, { width: 430, height: 932 }, { width: 390, height: 844 }, { width: 360, height: 800 },
] as const;

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

    for (const definition of REPORT_DEFINITIONS) {
      const suffix = definition.source === "PROJECT_RECORDS" ? `?project=${projectId}` : "";
      expect((await page.goto(`${definition.path}${suffix}`, { waitUntil: "domcontentloaded" }))?.status(), definition.path).toBe(200);
      const document = page.locator(".report-document");
      await expect(document).toBeVisible();
      await expect(document).toHaveAttribute("data-report-route", definition.path);
      await expect(document).toHaveAttribute("data-report-screen", definition.id);
      await expect(document).toHaveAttribute("data-report-kind", definition.kind);
      await expect(document).toHaveAttribute("data-report-source", definition.source === "PROJECT_RECORDS" ? "LIVE" : "AWAITING_APPROVED_SOURCE");
      await expect(page.locator(".report-source")).toBeVisible();
      expect(await page.evaluate(() => window.document.documentElement.scrollWidth <= window.document.documentElement.clientWidth + 1), definition.path).toBe(true);
    }
    await expect(page.locator(".report-source")).toHaveText("AWAITING_APPROVED_SOURCE");

    await page.goto(`/reports/view/general?project=${projectId}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "إرسال بالبريد" }).click();
    await expect(page.getByRole("status")).toContainText("بانتظار مزود معتمد", { timeout: 15_000 });
    const deliveries = await queryE2E<{ status: string }>('SELECT status FROM "ReportDelivery" WHERE "projectId" = $1', [projectId]);
    expect(deliveries.rows[0]?.status).toBe("PENDING_PROVIDER");
  });

  test("keeps every report document coherent across required viewports", async ({ context, page }) => {
    const token = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([{ name: "jenan_session", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const definition of REPORT_DEFINITIONS) {
        await page.goto(definition.path, { waitUntil: "domcontentloaded" });
        await expect(page.locator(".report-actions button")).toHaveCount(3);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${definition.path} at ${viewport.width}x${viewport.height}`).toBe(true);
      }
    }
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