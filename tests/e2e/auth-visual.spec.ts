import { expect, test, type BrowserContext } from "@playwright/test";

test.setTimeout(120_000);

const viewports = [
  { name: "2560x1440", width: 2560, height: 1440 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1365x768", width: 1365, height: 768 },
  { name: "1347x768", width: 1347, height: 768 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1024x1366", width: 1024, height: 1366 },
  { name: "820x1180", width: 820, height: 1180 },
  { name: "430x932", width: 430, height: 932 },
  { name: "462x725", width: 462, height: 725 },
  { name: "390x844", width: 390, height: 844 },
  { name: "360x800", width: 360, height: 800 },
] as const;

const routes = [
  { route: "/auth", screen: "login" },
  { route: "/login", screen: "login" },
  { route: "/register", screen: "register" },
  { route: "/auth/forgot", screen: "forgot" },
] as const;

const activityFixture = {
  activeUsers: 50_000,
  generatedAt: "2026-09-29T12:00:00.000Z",
  windowMinutes: 15,
  locations: [
    {
      countryCode: "SA",
      countryName: { ar: "السعودية", en: "Saudi Arabia" },
      activeUsers: 19_000,
    },
    {
      countryCode: "AE",
      countryName: { ar: "الإمارات", en: "United Arab Emirates" },
      activeUsers: 12_500,
    },
    {
      countryCode: "US",
      countryName: { ar: "الولايات المتحدة", en: "United States" },
      activeUsers: 9_000,
    },
  ],
  sourceState: "LIVE",
};

async function setLocale(
  context: BrowserContext,
  locale: "ar" | "en",
  baseURL: string | undefined,
) {
  await context.addCookies([
    {
      name: "locale",
      value: locale,
      url: baseURL ?? "http://127.0.0.1:3101",
    },
  ]);
}

for (const locale of ["ar", "en"] as const) {
  for (const viewport of viewports) {
    test(`Canonical Auth ${viewport.name} ${locale} preserves the approved access flow`, async ({
      context,
      page,
    }, testInfo) => {
      const runtimeErrors: string[] = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));
      await page.setViewportSize(viewport);
      await setLocale(context, locale, testInfo.project.use.baseURL);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.route("**/api/platform/activity", async (route) => {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(activityFixture),
        });
      });
      await page.route("**/api/auth/country", async (route) => {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ countryCode: "SA", source: "network" }),
        });
      });

      for (const route of routes) {
        const response = await page.goto(route.route);
        expect(response?.status(), route.route).toBe(200);
        await page.evaluate(() => document.fonts.ready);

        const accessPage = page.locator(".access-page");
        await expect(accessPage).toHaveAttribute("data-auth-route", route.route);
        await expect(accessPage).toHaveAttribute("data-auth-screen", route.screen);
        await expect(accessPage).toHaveAttribute(
          "data-auth-source",
          route.screen === "forgot"
            ? "PASSWORD_RECOVERY_SERVICE"
            : "CANONICAL_PUBLIC_SCENE",
        );
        await expect(page.locator(".global-home__hero")).toBeVisible();
        await expect(page.locator(".global-home__hero-visual")).toBeVisible();
        await expect(page.locator(".access-page__form-panel")).toBeVisible();

        if (route.screen === "login") {
          await expect(page.locator(".access-page__form-panel")).toBeVisible();
          await expect(page.locator('input[name="email"]')).toBeVisible();
          await expect(page.locator('input[name="password"]')).toBeVisible();
          await expect(page.locator('input[name="remember"]')).toBeVisible();
          await expect(
            page.locator(".access-page__form-panel .form-note"),
          ).toBeVisible();
          await expect(
            page.locator('.access-page__form-panel a[href="/auth/forgot"]'),
          ).toBeVisible();
          if (viewport.name === "462x725") {
            const emailControl = await page
              .locator(".access-page__form-panel .field__control")
              .first()
              .boundingBox();
            const submit = await page
              .locator(".access-page__form-panel .auth-form__submit")
              .boundingBox();
            const alternate = await page
              .locator('.access-page__alternate a[href="/register"]')
              .boundingBox();
            if (!emailControl || !submit || !alternate) {
              throw new Error("Approved login controls should have a layout box");
            }
            expect(Math.round(emailControl.x)).toBe(29);
            expect(Math.round(emailControl.y)).toBeGreaterThanOrEqual(245);
            expect(Math.round(emailControl.y)).toBeLessThanOrEqual(249);
            expect(Math.round(emailControl.width)).toBe(404);
            expect(Math.round(emailControl.height)).toBe(48);
            expect(Math.round(submit.y)).toBeGreaterThanOrEqual(443);
            expect(Math.round(submit.y)).toBeLessThanOrEqual(448);
            expect(Math.round(submit.width)).toBe(404);
            expect(Math.round(alternate.y)).toBeGreaterThanOrEqual(555);
            expect(Math.round(alternate.y)).toBeLessThanOrEqual(560);
            expect(Math.round(alternate.height)).toBe(48);
          }
        }

        if (route.screen === "register") {
          await expect(page.locator(".access-page__form-panel")).toBeVisible();
          for (const name of [
            "name",
            "email",
            "countryCode",
            "password",
            "confirmPassword",
            "terms",
          ]) {
            await expect(page.locator(`[name="${name}"]`)).toBeVisible();
          }
          await expect(
            page.locator(".auth-form__step--all > .field > .field__label"),
          ).toHaveCount(5);
          await expect(page.locator(".auth-country > .field__label")).toBeVisible();
          const country = page.locator('select[name="countryCode"]');
          await expect(country).toHaveAttribute(
            "aria-label",
            locale === "ar" ? "الدولة" : "Country",
          );
          await expect(country).toHaveValue("SA");
          await expect(page.locator(".auth-country__flag")).toHaveText("🇸🇦");
          await expect(page.locator(".auth-country__selected strong")).toHaveText(
            locale === "ar" ? "السعودية" : "Saudi Arabia",
          );
          await expect(page.locator(".auth-country__source i")).toHaveAttribute(
            "data-source",
            "network",
          );
          await country.focus();
          await expect(country).toBeFocused();
          expect(
            await country.evaluate((element) =>
              getComputedStyle(
                element.closest(".auth-country__control")!,
              ).outlineStyle,
            ),
          ).toBe("solid");
          await expect(
            page.locator(".auth-form__terms-details"),
          ).toHaveCSS("direction", locale === "ar" ? "rtl" : "ltr");
          await country.selectOption("US");
          await expect(page.locator(".auth-country__flag")).toHaveText("🇺🇸");
          await expect(page.locator(".auth-country__selected strong")).toHaveText(
            locale === "ar" ? "الولايات المتحدة" : "United States",
          );
          await expect(page.locator(".auth-country__source i")).toHaveAttribute(
            "data-source",
            "manual",
          );
        }

        if (route.screen === "forgot") {
          await expect(page.locator(".access-page__form-panel")).toBeVisible();
          await expect(
            page.locator('.access-page__form-panel input[type="email"]'),
          ).toBeVisible();
          await expect(
            page.locator('.access-page__form-panel form button[type="submit"]'),
          ).toBeVisible();
          await expect(
            page.locator('.access-page__form-panel a[href="/auth"]'),
          ).toHaveCount(1);
        }

        const layout = await page.evaluate(() => {
          const visible = Array.from(
            document.querySelectorAll<HTMLElement>(
              ".access-page__form-panel",
            ),
          ).filter((element) => element.checkVisibility());
          const panelRoot = document.querySelector<HTMLElement>(
            ".access-page__form-panel",
          );
          const panel = document
            .querySelector<HTMLElement>(".access-page__form-panel")
            ?.getBoundingClientRect();
          const resources = performance
            .getEntriesByType("resource")
            .map((entry) => decodeURIComponent(entry.name));
          return {
            clippedButtons: Array.from(
              panelRoot?.querySelectorAll<HTMLElement>("button,a") ?? [],
            )
              .filter((element) => element.checkVisibility())
              .some(
                (element) => element.scrollWidth > element.clientWidth + 1,
              ),
            cityBackground: getComputedStyle(
              document.querySelector<HTMLElement>(".global-home__hero")!,
              "::before",
            ).backgroundImage,
            visualMapCount: document.querySelectorAll(
              ".global-home__hero-visual .gateway-world-map",
            ).length,
            offscreen: visible.some((element) => {
              const bounds = element.getBoundingClientRect();
              return (
                bounds.left < -1 ||
                bounds.right > document.documentElement.clientWidth + 1
              );
            }),
            panel: panel
              ? {
                  bottom: panel.bottom,
                  height: panel.height,
                  left: panel.left,
                  right: panel.right,
                  top: panel.top,
                  width: panel.width,
                }
              : null,
            referenceLoaded: resources.some((resource) =>
              /APPROVED_AUTH_REFERENCES|home_layout_REFERENCE_ONLY|login_candidate/.test(
                resource,
              ),
            ),
            visibleDevPortal:
              document.querySelector<HTMLElement>("nextjs-portal")
                ?.checkVisibility() ?? false,
            scrollWidth: document.documentElement.scrollWidth,
            viewportHeight: document.documentElement.clientHeight,
            viewportWidth: document.documentElement.clientWidth,
          };
        });

        expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
        expect(layout.offscreen).toBe(false);
        expect(layout.clippedButtons).toBe(false);
        expect(layout.referenceLoaded).toBe(false);
        expect(layout.visibleDevPortal).toBe(false);
        expect(layout.cityBackground).toContain("global-city-night.jpg");
        expect(layout.visualMapCount).toBe(1);
        if (layout.panel) {
          expect(layout.panel.left).toBeGreaterThanOrEqual(-1);
          expect(layout.panel.right).toBeLessThanOrEqual(
            layout.viewportWidth + 1,
          );
          expect(layout.panel.top).toBeGreaterThanOrEqual(-1);
          expect(layout.panel.bottom).toBeLessThanOrEqual(
            layout.viewportHeight + 1,
          );
          if (
            viewport.name === "1440x900" &&
            (route.screen === "login" || route.screen === "register")
          ) {
            expect(Math.round(layout.panel.left)).toBe(
              route.screen === "register" ? 454 : 410,
            );
            expect(Math.round(layout.panel.top)).toBe(
              route.screen === "register" ? 128 : 165,
            );
            expect(Math.round(layout.panel.width)).toBe(
              route.screen === "register" ? 532 : 620,
            );
            expect(Math.round(layout.panel.height)).toBe(
              route.screen === "register" ? 665 : 628,
            );
          }
          if (viewport.name === "1365x768" && route.screen === "login") {
            expect(Math.round(layout.panel.left)).toBe(373);
            expect(Math.round(layout.panel.top)).toBe(95);
            expect(Math.round(layout.panel.width)).toBe(620);
            expect(Math.round(layout.panel.height)).toBe(628);
          }
          if (viewport.name === "1024x768" && route.screen === "register") {
            expect(Math.round(layout.panel.left)).toBe(246);
            expect(Math.round(layout.panel.top)).toBe(61);
            expect(Math.round(layout.panel.width)).toBe(532);
            expect(Math.round(layout.panel.height)).toBe(665);
          }
          if (
            viewport.name === "462x725" &&
            (route.screen === "login" || route.screen === "register")
          ) {
            expect(Math.round(layout.panel.left)).toBe(0);
            expect(Math.round(layout.panel.top)).toBe(0);
            expect(Math.round(layout.panel.width)).toBe(462);
            expect(Math.round(layout.panel.height)).toBe(725);
          }
        }
      }

      if (
        ["1365x768", "1024x768", "1347x768", "820x1180", "462x725", "390x844"].includes(
          viewport.name,
        )
      ) {
        await page.goto("/auth");
        await testInfo.attach(`canonical-auth-${viewport.name}-${locale}`, {
          body: await page.screenshot({
            animations: "disabled",
            fullPage: viewport.width <= 1100,
          }),
          contentType: "image/png",
        });
      }

      expect(runtimeErrors).toEqual([]);
    });
  }
}
