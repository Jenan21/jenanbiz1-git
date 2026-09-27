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

test.describe.serial("Auth recovery and onboarding responsive acceptance", () => {
  test.setTimeout(90_000);

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  for (const locale of ["ar", "en"] as const) {
    for (const viewport of viewports) {
      test(`${viewport.name} ${locale} keeps recovery and onboarding responsive`, async ({ context, page }, testInfo) => {
        const runtimeErrors: string[] = [];
        page.on("pageerror", (error) => runtimeErrors.push(error.message));
        await page.setViewportSize(viewport);
        const sessionToken = await createE2ESession(e2eIdentity.user.email);
        await context.addCookies([
          { name: "locale", value: locale, url: "http://127.0.0.1:3101" },
          { name: "jenan_session", value: sessionToken, url: "http://127.0.0.1:3101", httpOnly: true, sameSite: "Lax" },
        ]);
        await page.emulateMedia({ reducedMotion: "reduce" });

        const forgotResponse = await page.goto("/auth/forgot");
        expect(forgotResponse?.status()).toBe(200);
        await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
        await expect(page.locator(".auth-workflow__panel")).toBeVisible();
        await expect(page.locator(".auth-workflow")).toHaveAttribute("data-auth-route", "/auth/forgot");
        await expect(page.locator(".auth-workflow")).toHaveAttribute("data-auth-source", "PASSWORD_RECOVERY_SERVICE");
        await expect(page.getByRole("button", { name: locale === "ar" ? "إرسال رمز التحقق" : "Send verification code" })).toBeVisible();
        const forgotLayout = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
          clippedButtons: Array.from(document.querySelectorAll("button")).some((button) => button.scrollWidth > button.clientWidth + 1),
        }));
        expect(forgotLayout.scrollWidth).toBeLessThanOrEqual(forgotLayout.viewportWidth + 1);
        expect(forgotLayout.clippedButtons).toBe(false);

        const onboardingResponse = await page.goto("/user/onboarding");
        expect(onboardingResponse?.status()).toBe(200);
        await expect(page.locator(".onboarding-form")).toBeVisible();
        await expect(page.locator(".auth-workflow")).toHaveAttribute("data-auth-route", "/user/onboarding");
        await expect(page.locator(".auth-workflow")).toHaveAttribute("data-auth-access", "AUTHENTICATED");
        await expect(page.locator(".auth-workflow")).toHaveAttribute("data-auth-source", "AUTHENTICATED_PROFILE");
        const onboardingLayout = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
          panel: document.querySelector<HTMLElement>(".auth-workflow__panel")?.getBoundingClientRect().toJSON(),
        }));
        expect(onboardingLayout.scrollWidth).toBeLessThanOrEqual(onboardingLayout.viewportWidth + 1);
        expect(onboardingLayout.panel).toBeTruthy();
        expect(onboardingLayout.panel!.left).toBeGreaterThanOrEqual(-1);
        expect(onboardingLayout.panel!.right).toBeLessThanOrEqual(onboardingLayout.viewportWidth + 1);

        if (["1440x900", "820x1180", "390x844"].includes(viewport.name)) {
          await testInfo.attach(`auth-flow-${viewport.name}-${locale}`, {
            body: await page.screenshot({ animations: "disabled", fullPage: true }),
            contentType: "image/png",
          });
        }
        expect(runtimeErrors).toEqual([]);
      });
    }
  }

  test("canonical Auth routes remain available", async ({ page }) => {
    for (const route of ["/auth", "/auth/login", "/auth/register", "/auth/forgot"]) {
      expect((await page.goto(route))?.status(), route).toBe(200);
    }
  });
});