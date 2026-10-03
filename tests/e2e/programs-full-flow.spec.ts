import { expect, test } from "@playwright/test";

import { PROGRAM_ROUTES } from "@/lib/programs/program-routes";
import { cleanE2EIdentities, createE2ESession, seedE2EAdmin, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = "http://127.0.0.1:3101";
const viewports = [
  { width: 2560, height: 1440 }, { width: 1920, height: 1080 }, { width: 1440, height: 900 },
  { width: 1366, height: 768 }, { width: 1280, height: 800 }, { width: 1024, height: 1366 },
  { width: 820, height: 1180 }, { width: 430, height: 932 }, { width: 390, height: 844 }, { width: 360, height: 800 },
] as const;

test.describe.serial("Jenan Programs full flow", () => {
  test.setTimeout(360_000);

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
    await seedE2EAdmin();
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  test.beforeEach(async ({ context }) => {
    const token = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([
      { name: "jenan_session", value: token, url: origin, httpOnly: true, sameSite: "Lax" },
      { name: "locale", value: "en", url: origin },
    ]);
  });

  test("creates and renders persisted organization operations", async ({ page }) => {
    const post = async (path: string, data: Record<string, unknown>) => page.request.post(path, { data, headers: { origin } });
    const organizationResponse = await post("/api/programs", { action: "createOrganization", name: "E2E Operations Group" });
    expect(organizationResponse.status()).toBe(201);
    const organizationId = (await organizationResponse.json()).result.id as string;

    for (const key of ["FINANCE", "PEOPLE", "FIELD_OPERATIONS", "FLEET"]) {
      expect((await post("/api/programs", { action: "activate", key, organizationId })).status(), key).toBe(201);
    }
    expect((await post("/api/programs/finance", { amountMinor: 125_000, currency: "SAR", description: "E2E retained revenue", occurredAt: new Date().toISOString(), organizationId, type: "INCOME" })).status()).toBe(201);
    expect((await post("/api/programs/fleet", { action: "create", label: "E2E service van", organizationId, plateNumber: "E2E-2026" })).status()).toBe(201);
    expect((await post("/api/programs/field", { action: "create", description: "Recorded field verification", organizationId, title: "E2E field audit" })).status()).toBe(201);
    expect((await post("/api/programs/people", { action: "invite", email: e2eIdentity.admin.email, organizationId })).status()).toBe(201);

    for (const definition of PROGRAM_ROUTES) {
      expect((await page.goto(definition.path, { waitUntil: "networkidle" }))?.status(), definition.path).toBe(200);
      const contract = page.locator(".program-route-contract");
      await expect(contract).toHaveAttribute("data-program-route", definition.path);
      await expect(contract).toHaveAttribute("data-program-screen", definition.id);
      await expect(contract).toHaveAttribute("data-program-key", definition.program);
      await expect(contract).toHaveAttribute("data-program-source", definition.source);
      await expect(contract).toHaveAttribute("data-program-privacy", "ORGANIZATION_SCOPED");
    }

    await page.goto("/programs/finance", { waitUntil: "networkidle" });
    await expect(page.getByText("E2E retained revenue")).toBeVisible();
    await page.goto("/programs/fleet", { waitUntil: "networkidle" });
    await expect(page.getByText("E2E service van")).toBeVisible();
    await page.goto("/programs/field", { waitUntil: "networkidle" });
    await expect(page.getByText("E2E field audit")).toBeVisible();
    await page.goto("/programs/people", { waitUntil: "networkidle" });
    await expect(page.getByText(e2eIdentity.admin.email)).toBeVisible();

    const rejected = await page.request.post("/api/programs", { data: { action: "createOrganization", name: "Rejected origin" }, headers: { origin: "https://invalid.example" } });
    expect(rejected.status()).toBe(403);
  });

  test("keeps every Programs screen coherent across required viewports", async ({ page }, testInfo) => {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const definition of PROGRAM_ROUTES) {
        expect((await page.goto(definition.path, { waitUntil: "domcontentloaded" }))?.status(), definition.path).toBe(200);
        await expect(page.locator(".program-route-contract")).toHaveAttribute("data-program-route", definition.path);
        const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
        expect(layout.scrollWidth, `${definition.path} at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(layout.viewportWidth + 1);
      }
      if ([1440, 820, 390].includes(viewport.width)) {
        await testInfo.attach(`programs-${viewport.width}x${viewport.height}`, { body: await page.screenshot({ animations: "disabled", fullPage: true }), contentType: "image/png" });
      }
    }
  });
});