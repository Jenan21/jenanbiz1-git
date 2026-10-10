import { expect, test } from "@playwright/test";
import { academyFlowDefinitions } from "@/lib/academy/user-academy-routes";
import { cleanE2EIdentities, createE2ESession, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const viewports = [
  { width: 2560, height: 1440 }, { width: 1920, height: 1080 }, { width: 1440, height: 900 },
  { width: 1366, height: 768 }, { width: 1280, height: 800 }, { width: 1024, height: 1366 },
  { width: 820, height: 1180 }, { width: 430, height: 932 }, { width: 390, height: 844 }, { width: 360, height: 800 },
] as const;

test.describe.serial("Academy full route flow", () => {
  test.setTimeout(600_000);

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
    const catalogPayload = await catalog.json() as { courses: Array<{ id: string; title: string }> };
    expect(catalogPayload.courses.length).toBeGreaterThan(0);

    const selectedCourse = catalogPayload.courses.at(-1)!;
    expect((await page.goto(`/academy/courses/${selectedCourse.id}`, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: selectedCourse.title, level: 1 })).toBeVisible();
    expect((await page.goto(`/academy/courses/${selectedCourse.id}/lesson/1`, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
    await expect(page.locator(".academy-course-focus, .academy-reference__header--course")).toContainText(selectedCourse.title);

    for (const definition of academyFlowDefinitions) {
      const response = await page.goto(definition.route, { waitUntil: "domcontentloaded" });
      expect(response?.status(), definition.route).toBe(200);
      await expect(page.locator(".academy-section-nav")).toBeVisible();
      if (definition.route === "/academy/courses") await expect(page.locator(".academy-catalog")).toBeVisible();
      else if (definition.source === "course" && ["detail", "player", "form", "dashboard", "report"].includes(definition.kind)) {
        const expectedMode = definition.kind === "player" ? "lesson" : definition.kind === "form" ? "quiz" : definition.kind === "dashboard" ? "result" : definition.kind === "report" ? "certificate" : "detail";
        await expect(page.locator(".academy-course-journey")).toHaveAttribute("data-academy-course-mode", expectedMode);
      }
      else await expect(page.locator(".academy-reference")).toHaveAttribute("data-academy-kind", definition.kind);
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
      expect(layout.scrollWidth, definition.route).toBeLessThanOrEqual(layout.viewportWidth + 1);
    }
  });

  test("keeps every Academy screen responsive across all required viewports", async ({ context, page }) => {
    const sessionToken = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([{ name: "jenan_session", value: sessionToken, url: "http://127.0.0.1:3101", httpOnly: true, sameSite: "Lax" }]);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      expect((await page.goto("/academy", { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `/academy at ${viewport.width}x${viewport.height}`).toBe(true);
      for (const definition of academyFlowDefinitions) {
        expect((await page.goto(definition.route, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
        await expect(page.locator("[data-academy-route]")).toHaveAttribute("data-academy-route", definition.route);
        const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
        expect(layout.scrollWidth, `${definition.route} at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(layout.viewportWidth + 1);
      }
    }
  });
});