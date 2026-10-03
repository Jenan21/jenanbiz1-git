import { expect, test } from "@playwright/test";

import { SUPPLEMENTAL_ROUTES } from "@/lib/platform/supplemental-routes";
import { cleanE2EIdentities, createE2ESession, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = "http://127.0.0.1:3101";
const viewports = [
  { width: 2560, height: 1440 }, { width: 1920, height: 1080 }, { width: 1440, height: 900 },
  { width: 1366, height: 768 }, { width: 1280, height: 800 }, { width: 1024, height: 1366 },
  { width: 820, height: 1180 }, { width: 430, height: 932 }, { width: 390, height: 844 }, { width: 360, height: 800 },
] as const;

test.describe.serial("supplemental platform pages", () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  test("keeps Benefits and Pricing truthful and responsive", async ({ context, page }) => {
    const token = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([
      { name: "jenan_session", value: token, url: origin, httpOnly: true, sameSite: "Lax" },
      { name: "locale", value: "en", url: origin },
    ]);

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const definition of SUPPLEMENTAL_ROUTES) {
        expect((await page.goto(definition.path, { waitUntil: "domcontentloaded" }))?.status(), definition.path).toBe(200);
        const workspace = page.locator(".workspace-overview");
        await expect(workspace).toHaveAttribute("data-module-route", definition.path);
        await expect(workspace).toHaveAttribute("data-module-screen", definition.id);
        await expect(workspace).toHaveAttribute("data-module-source", definition.source);
        await expect(workspace).toHaveAttribute("data-module-state", definition.state);
        await expect(workspace).toHaveAttribute("data-module-outputs", "NONE");
        const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
        expect(layout.scrollWidth, `${definition.path} at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(layout.viewportWidth + 1);
      }
    }

    await page.goto("/pricing");
    await expect(page.getByText("No approved pricing catalog is currently published")).toBeVisible();
    await expect(page.getByRole("button", { name: /purchase|buy|subscribe/i })).toHaveCount(0);
  });
});