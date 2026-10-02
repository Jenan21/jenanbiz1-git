import { expect, test } from "@playwright/test";
import {
  cleanE2EIdentities,
  createE2ESession,
  seedE2EUser,
} from "./identity-fixture";
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

const dashboardViewports = [
  { width: 2560, height: 1440 },
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1024, height: 1366 },
  { width: 820, height: 1180 },
  { width: 430, height: 932 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
] as const;

test.describe
  .serial("Auth recovery and onboarding responsive acceptance", () => {
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
      test(`${viewport.name} ${locale} keeps recovery and onboarding responsive`, async ({
        context,
        page,
      }, testInfo) => {
        const runtimeErrors: string[] = [];
        page.on("pageerror", (error) => runtimeErrors.push(error.message));
        await page.setViewportSize(viewport);
        const sessionToken = await createE2ESession(e2eIdentity.user.email);
        await context.addCookies([
          { name: "locale", value: locale, url: "http://127.0.0.1:3101" },
          {
            name: "jenan_session",
            value: sessionToken,
            url: "http://127.0.0.1:3101",
            httpOnly: true,
            sameSite: "Lax",
          },
        ]);
        await page.emulateMedia({ reducedMotion: "reduce" });

        const forgotResponse = await page.goto("/auth/forgot");
        expect(forgotResponse?.status()).toBe(200);
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          locale === "ar" ? "rtl" : "ltr",
        );
        await expect(page.locator(".access-page__form-panel")).toBeVisible();
        await expect(page.locator(".access-page")).toHaveAttribute(
          "data-auth-route",
          "/auth/forgot",
        );
        await expect(page.locator(".access-page")).toHaveAttribute(
          "data-auth-source",
          "PASSWORD_RECOVERY_SERVICE",
        );
        await expect(
          page.getByRole("button", {
            name:
              locale === "ar" ? "إرسال رمز التحقق" : "Send verification code",
          }),
        ).toBeVisible();
        const forgotLayout = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
          clippedButtons: Array.from(document.querySelectorAll("button")).some(
            (button) => button.scrollWidth > button.clientWidth + 1,
          ),
        }));
        expect(forgotLayout.scrollWidth).toBeLessThanOrEqual(
          forgotLayout.viewportWidth + 1,
        );
        expect(forgotLayout.clippedButtons).toBe(false);

        const onboardingResponse = await page.goto("/user/onboarding");
        expect(onboardingResponse?.status()).toBe(200);
        await expect(page.locator(".onboarding-form")).toBeVisible();
        await expect(page.locator(".auth-workflow")).toHaveAttribute(
          "data-auth-route",
          "/user/onboarding",
        );
        await expect(page.locator(".auth-workflow")).toHaveAttribute(
          "data-auth-access",
          "AUTHENTICATED",
        );
        await expect(page.locator(".auth-workflow")).toHaveAttribute(
          "data-auth-source",
          "AUTHENTICATED_PROFILE",
        );
        const onboardingLayout = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
          panel: document
            .querySelector<HTMLElement>(".auth-workflow__panel")
            ?.getBoundingClientRect()
            .toJSON(),
        }));
        expect(onboardingLayout.scrollWidth).toBeLessThanOrEqual(
          onboardingLayout.viewportWidth + 1,
        );
        expect(onboardingLayout.panel).toBeTruthy();
        expect(onboardingLayout.panel!.left).toBeGreaterThanOrEqual(-1);
        expect(onboardingLayout.panel!.right).toBeLessThanOrEqual(
          onboardingLayout.viewportWidth + 1,
        );

        if (["1440x900", "820x1180", "390x844"].includes(viewport.name)) {
          await testInfo.attach(`auth-flow-${viewport.name}-${locale}`, {
            body: await page.screenshot({
              animations: "disabled",
              fullPage: true,
            }),
            contentType: "image/png",
          });
        }
        expect(runtimeErrors).toEqual([]);
      });
    }
  }

  test("canonical Auth routes remain available", async ({ page }) => {
    for (const route of [
      "/auth",
      "/login",
      "/register",
      "/auth/forgot",
    ]) {
      expect((await page.goto(route))?.status(), route).toBe(200);
      expect(new URL(page.url()).pathname).toBe(route);
      await expect(page.locator("[data-auth-route]")).toHaveAttribute(
        "data-auth-route",
        route,
      );
    }
    await page.goto("/auth");
    await expect(page.locator(".access-page")).toHaveAttribute(
      "data-auth-screen",
      "login",
    );
    await expect(page.locator(".access-page__form-panel")).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await page.locator(".access-page__panel-close").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(".access-page__form-panel")).toHaveCount(0);
    await expect(
      page.locator('.global-home__account[href="/auth"]'),
    ).toBeVisible();
    await expect(
      page.locator('.global-home__button[href="/register"]'),
    ).toBeVisible();
    await page.locator('.global-home__button[href="/register"]').click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.locator(".access-page__form-panel")).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await page.locator(".access-page__panel-close").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(".access-page__form-panel")).toHaveCount(0);
  });

  test("360x800 keeps extended registration and recovery states usable", async ({
    context,
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await context.addCookies([
      { name: "locale", value: "ar", url: "http://127.0.0.1:3101" },
    ]);
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto("/register");
    await page.getByLabel("الاسم الكامل").fill("مستخدم اختبار");
    await page
      .getByLabel("البريد الإلكتروني")
      .fill("responsive.auth@example.test");
    await expect(page.getByLabel("الدولة")).toBeVisible();
    await page.getByLabel("الدولة").selectOption("SA");
    await expect(page.getByLabel("تأكيد كلمة المرور")).toBeVisible();
    await page.getByText("عرض شروط الاستخدام", { exact: true }).click();
    await expect(page.locator(".auth-form__terms-details p")).toBeVisible();
    const registrationLayout = await page.evaluate(() => {
      const panel = document
        .querySelector<HTMLElement>(".access-page__form-panel")!
        .getBoundingClientRect();
      return {
        left: panel.left,
        right: panel.right,
        top: panel.top,
        bottom: panel.bottom,
        viewportWidth: document.documentElement.clientWidth,
        viewportHeight: document.documentElement.clientHeight,
      };
    });
    expect(registrationLayout.left).toBeGreaterThanOrEqual(-1);
    expect(registrationLayout.right).toBeLessThanOrEqual(
      registrationLayout.viewportWidth + 1,
    );
    expect(registrationLayout.top).toBeGreaterThanOrEqual(-1);
    expect(registrationLayout.bottom).toBeLessThanOrEqual(
      registrationLayout.viewportHeight + 1,
    );

    await page.route("**/api/auth/forgot", async (request) => {
      await request.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          accepted: true,
          delivery: "development",
          developmentCode: "123456",
        }),
      });
    });
    await page.goto("/auth/forgot");
    await page
      .getByLabel("البريد الإلكتروني")
      .fill("responsive.auth@example.test");
    await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
    await expect(page.getByLabel("رمز التحقق")).toHaveValue("123456");
    await expect(page.getByLabel("كلمة المرور الجديدة")).toBeVisible();
    await expect(page.getByLabel("تأكيد كلمة المرور")).toBeVisible();
    const recoveryLayout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      clippedButtons: Array.from(document.querySelectorAll("button")).some(
        (button) => button.scrollWidth > button.clientWidth + 1,
      ),
    }));
    expect(recoveryLayout.scrollWidth).toBeLessThanOrEqual(
      recoveryLayout.viewportWidth + 1,
    );
    expect(recoveryLayout.clippedButtons).toBe(false);

    await page.goto("/auth?reset=success");
    await expect(page.getByRole("status")).toContainText(
      "تم تحديث كلمة المرور",
    );
  });

  test("dashboard remains responsive and logout recovers from network errors on mobile", async ({
    context,
    page,
  }) => {
    let failLogout = false;
    await page.route("**/api/auth/logout", async (route) => {
      if (failLogout) {
        await route.fulfill({ status: 503, body: "Unavailable" });
        return;
      }
      await route.continue();
    });

    for (const locale of ["ar", "en"] as const) {
      for (const viewport of dashboardViewports) {
        await page.setViewportSize(viewport);
        await context.addCookies([
          { name: "locale", value: locale, url: "http://127.0.0.1:3101" },
          {
            name: "jenan_session",
            value: await createE2ESession(e2eIdentity.user.email),
            url: "http://127.0.0.1:3101",
            httpOnly: true,
            sameSite: "Lax",
          },
        ]);
        const response = await page.goto("/dashboard");
        expect(response?.status()).toBe(200);
        await expect(page.locator(".authenticated-home")).toHaveAttribute(
          "dir",
          locale === "ar" ? "rtl" : "ltr",
        );
        const layout = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
        }));
        expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
        await expect(
          page.locator(".authenticated-home__tools .logout-button"),
        ).toBeVisible();
        await expect(page.getByText(/\+\d+%/)).toHaveCount(0);
        await expect(
          page.locator(".authenticated-home__header nav"),
        ).toHaveCSS("direction", locale === "ar" ? "rtl" : "ltr");

        if (viewport.width <= 430) {
          failLogout = true;
          await page.getByRole("button", {
            name: locale === "ar" ? "خروج" : "Logout",
          }).click();
          await expect(page.getByRole("alert")).toHaveText(
            locale === "ar"
              ? "تعذر تسجيل الخروج. تحقق من اتصالك وحاول مجددًا."
              : "Could not log out. Check your connection and try again.",
          );
          await expect(
            page.locator(".authenticated-home__tools .logout-button"),
          ).toBeEnabled();
          failLogout = false;
          await page.getByRole("button", {
            name: locale === "ar" ? "خروج" : "Logout",
          }).click();
          await expect(page).toHaveURL(/\/auth$/);
        }
      }
    }
  });
});
