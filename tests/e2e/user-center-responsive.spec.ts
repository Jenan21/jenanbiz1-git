import { expect, test } from "@playwright/test";
import { cleanE2EIdentities, createE2ESession, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const viewports = [
  { name: "2560x1440", width: 2560, height: 1440 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1024x1366", width: 1024, height: 1366 },
  { name: "820x1180", width: 820, height: 1180 },
  { name: "430x932", width: 430, height: 932 },
  { name: "390x844", width: 390, height: 844 },
  { name: "360x800", width: 360, height: 800 },
] as const;

const routes = [
  "/user",
  "/user/investments",
  "/user/investment/detail",
  "/user/unlocks",
  "/user/payments",
  "/user/payments/invoice",
  "/user/reports",
] as const;

test.describe.serial("User center responsive acceptance", () => {
  test.setTimeout(120_000);

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  for (const locale of ["ar", "en"] as const) {
    for (const viewport of viewports) {
      test(`${viewport.name} ${locale} keeps all user-center pages responsive`, async ({ context, page }, testInfo) => {
        await page.setViewportSize(viewport);
        const sessionToken = await createE2ESession(e2eIdentity.user.email);
        await context.addCookies([
          { name: "locale", value: locale, url: "http://127.0.0.1:3101" },
          { name: "jenan_session", value: sessionToken, url: "http://127.0.0.1:3101", httpOnly: true, sameSite: "Lax" },
        ]);
        const runtimeErrors: string[] = [];
        page.on("pageerror", (error) => runtimeErrors.push(error.message));

        for (const route of routes) {
          const response = await page.goto(route, { waitUntil: "domcontentloaded" });
          expect(response?.status(), route).toBe(200);
          await expect(page.locator(".user-center-nav")).toBeVisible();
          const layout = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            viewportWidth: document.documentElement.clientWidth,
            clippedButtons: Array.from(document.querySelectorAll("button, a.button")).some((element) => element.scrollWidth > element.clientWidth + 1),
          }));
          expect(layout.scrollWidth, route).toBeLessThanOrEqual(layout.viewportWidth + 1);
          expect(layout.clippedButtons, route).toBe(false);
        }

        await page.goto("/user/investments");
        await expect(page.getByText(locale === "ar" ? "غير متوفر" : "Unavailable").first()).toBeVisible();
        if (["1440x900", "820x1180", "390x844"].includes(viewport.name)) {
          await testInfo.attach(`user-center-${viewport.name}-${locale}`, { body: await page.screenshot({ animations: "disabled", fullPage: true }), contentType: "image/png" });
        }
        expect(runtimeErrors).toEqual([]);
      });
    }
  }
});