import { expect, test, type BrowserContext } from "@playwright/test";

test.setTimeout(120_000);

const viewports = [
  { name: "2560x1440", width: 2560, height: 1440 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1347x768", width: 1347, height: 768 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1024x1366", width: 1024, height: 1366 },
  { name: "820x1180", width: 820, height: 1180 },
  { name: "430x932", width: 430, height: 932 },
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
        await expect(page.locator(".global-home__world")).toBeVisible();
        await expect(page.locator(".global-home__globe")).toBeVisible();
        await expect(page.locator(".access-page__form-panel")).toBeVisible();

        if (route.screen === "login") {
          await expect(page.locator(".access-page__form-panel")).toBeVisible();
          await expect(page.locator('input[name="email"]')).toBeVisible();
          await expect(page.locator('input[name="password"]')).toBeVisible();
          await expect(page.locator('input[name="remember"]')).toBeVisible();
          await expect(
            page.locator('.access-page__form-panel a[href="/auth/forgot"]'),
          ).toBeVisible();
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
          const country = page.locator('select[name="countryCode"]');
          await expect(country).toHaveValue("SA");
          await expect(page.locator(".auth-country__flag")).toHaveText("🇸🇦");
          await expect(page.locator('.auth-country__source i[data-source="network"]')).toBeVisible();
          await country.selectOption("US");
          await expect(page.locator(".auth-country__flag")).toHaveText("🇺🇸");
          await expect(page.locator('.auth-country__source i[data-source="manual"]')).toBeVisible();
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
              document.querySelector<HTMLElement>(".global-home__city")!,
            ).backgroundImage,
            globeBackground: getComputedStyle(
              document.querySelector<HTMLElement>(".global-home__earth-texture")!,
            ).backgroundImage,
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
            scrollWidth: document.documentElement.scrollWidth,
            viewportHeight: document.documentElement.clientHeight,
            viewportWidth: document.documentElement.clientWidth,
          };
        });

        expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
        expect(layout.offscreen).toBe(false);
        expect(layout.clippedButtons).toBe(false);
        expect(layout.referenceLoaded).toBe(false);
        expect(layout.cityBackground).toContain("global-city-night.jpg");
        expect(layout.globeBackground).toContain("earth-night-texture.jpg");
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
            expect(Math.round(layout.panel.left)).toBe(489);
            expect(Math.round(layout.panel.top)).toBe(99);
            expect(Math.round(layout.panel.width)).toBe(462);
            expect(Math.round(layout.panel.height)).toBe(724);
          }
        }
      }

      if (["1347x768", "820x1180", "390x844"].includes(viewport.name)) {
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
