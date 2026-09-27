import { expect, test } from "@playwright/test";
import { academyFlowDefinitions } from "@/lib/academy/user-academy-routes";
import { cleanE2EIdentities, createE2ESession, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

test.describe.serial("Academy full route flow", () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  test("renders every Academy route with truthful source states", async ({ context, page }) => {
    const sessionToken = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([
      { name: "locale", value: "en", url: "http://127.0.0.1:3101" },
      { name: "jenan_session", value: sessionToken, url: "http://127.0.0.1:3101", httpOnly: true, sameSite: "Lax" },
    ]);
    const catalog = await page.request.get("/api/academy/catalog");
    expect(catalog.status()).toBe(200);
    expect((await catalog.json()).courses.length).toBeGreaterThan(0);

    for (const definition of academyFlowDefinitions) {
      const response = await page.goto(definition.route, { waitUntil: "domcontentloaded" });
      expect(response?.status(), definition.route).toBe(200);
      await expect(page.locator(".academy-section-nav")).toBeVisible();
      if (definition.route === "/academy/courses") await expect(page.locator(".academy-library")).toBeVisible();
      else if (definition.source === "course") await expect(page.locator(".academy-reference__course")).toBeVisible();
      else await expect(page.locator(".academy-reference__empty")).toContainText("Awaiting approved source");
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
      expect(layout.scrollWidth, definition.route).toBeLessThanOrEqual(layout.viewportWidth + 1);
    }
  });

  test("keeps representative Academy pages responsive on mobile", async ({ context, page }) => {
    const sessionToken = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([{ name: "jenan_session", value: sessionToken, url: "http://127.0.0.1:3101", httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ["/academy/courses", "/academy/course/sample/lesson/1", "/academy/webinars", "/academy/research/sample", "/academy/paths"]) {
      expect((await page.goto(route, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
      expect(layout.scrollWidth, route).toBeLessThanOrEqual(layout.viewportWidth + 1);
    }
  });
});