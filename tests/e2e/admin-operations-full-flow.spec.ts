import { expect, test } from "@playwright/test";

import { ADMIN_OPERATION_ROUTES } from "@/lib/admin/admin-operations-routes";
import { cleanE2EIdentities, createE2ESession, queryE2E, seedE2EAdmin, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3101"}`;
const viewports = [
  { width: 2560, height: 1440 }, { width: 1920, height: 1080 }, { width: 1440, height: 900 },
  { width: 1366, height: 768 }, { width: 1280, height: 800 }, { width: 1024, height: 1366 },
  { width: 820, height: 1180 }, { width: 430, height: 932 }, { width: 390, height: 844 }, { width: 360, height: 800 },
] as const;

test.describe("admin operations 80-page acceptance", () => {
  test.describe.configure({ timeout: 240_000 });

  test.beforeEach(async ({ context }) => {
    await cleanE2EIdentities();
    await seedE2EAdmin();
    await seedE2EUser();
    const token = await createE2ESession(e2eIdentity.admin.email);
    await context.addCookies([{ name: "jenan_session", value: token, url: origin }]);
  });

  test.afterEach(async () => {
    await cleanE2EIdentities();
  });

  test("serves all declared routes to an administrator", async ({ page }) => {
    for (const definition of ADMIN_OPERATION_ROUTES) {
      const response = await page.request.get(definition.path, { maxRedirects: 0 });
      expect(response.status(), definition.path).toBe(200);
    }
  });

  test("rejects all declared routes for an ordinary user", async ({ browser }) => {
    const context = await browser.newContext();
    const token = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([{ name: "jenan_session", value: token, url: origin }]);
    const request = context.request;
    for (const definition of ADMIN_OPERATION_ROUTES) {
      const response = await request.get(definition.path, { maxRedirects: 0 });
      expect(response.status(), definition.path).toBe(403);
    }
    await context.close();
  });

  test("renders representative workspaces without browser or layout errors", async ({ page }) => {
    const routes = ["/admin/audit", "/robots/factory", "/robot-academy", "/robot-org", "/missions", "/intelligence", "/models", "/tools", "/finance", "/observability", "/admin/reports/system"];
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    for (const route of routes) {
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.locator(".admin-ops")).toBeVisible();
      await expect(page.locator(".admin-ops-hero h1")).not.toBeEmpty();
      await expect(page.locator(".admin-ops-panel").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${route} horizontal overflow`).toBe(true);
    }
    expect(browserErrors).toEqual([]);
  });

  test("keeps the operations workspace coherent across all required viewports", async ({ page }) => {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto("/missions", { waitUntil: "networkidle" });
      await expect(page.locator(".admin-ops-hero")).toBeVisible();
      await expect(page.locator(".admin-ops-metrics")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${viewport.width}x${viewport.height} horizontal overflow`).toBe(true);
    }
  });

  test("reports source truth and executes audited commands", async ({ page }) => {
    const unavailable = await page.request.get("/api/admin/operations-center?path=%2Fobservability%2Fbackups");
    expect(unavailable.status()).toBe(200);
    const snapshot = (await unavailable.json()).snapshot;
    expect(snapshot.panels.find((panel: { key: string }) => panel.key === "backups").sourceState).toBe("PARTIAL");

    const suffix = Date.now();
    const mission = await page.request.post("/api/admin/operations-center", { headers: { origin }, data: { action: "createMission", name: `E2E Mission ${suffix}`, requiredIntelligence: 55 } });
    expect(mission.status()).toBe(201);
    const missionId = (await mission.json()).result.id as string;
    const batch = await page.request.post("/api/admin/operations-center", { headers: { origin }, data: { action: "createBatch", name: `E2E Batch ${suffix}`, requestedCount: 8, priority: 70 } });
    expect(batch.status()).toBe(201);
    const batchId = (await batch.json()).result.id as string;

    const audit = await queryE2E<{ action: string }>('SELECT action FROM "AuditLog" WHERE "entityId" = ANY($1::text[]) ORDER BY action', [[missionId, batchId]]);
    expect(audit.rows.map((item) => item.action)).toEqual(["admin.mission.created", "admin.robot.batch.created"]);
    await queryE2E('DELETE FROM "Mission" WHERE id = $1', [missionId]);
    await queryE2E('DELETE FROM "CandidateBatch" WHERE id = $1', [batchId]);
  });
});