import { expect, test, type BrowserContext } from "@playwright/test";

test.setTimeout(120_000);

const viewports = [
  { name: "2560x1440", width: 2560, height: 1440 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1440x900", width: 1440, height: 900 },
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
        await expect(page.locator(".canonical-auth__background .global-home__stage")).toHaveCount(1);
        await expect(page.locator(".canonical-auth__background .gateway-world-map")).toHaveCount(1);
        await expect(page.locator("#access-panel")).toBeVisible();
        await expect(page.locator("#access-page-title")).toBeVisible();

        if (route.screen === "login") {
          await expect(page.locator('input[name="email"]')).toBeVisible();
          await expect(page.locator('input[name="password"]')).toBeVisible();
          await expect(page.locator('input[name="remember"]')).toBeAttached();
          await expect(page.locator('#access-panel a[href="/auth/forgot"]')).toBeVisible();
          await expect(page.locator('#access-panel a[href="/register"]')).toBeVisible();
          await expect(page.locator(".auth-field")).toHaveCount(2);
        }

        if (route.screen === "register") {
          for (const name of ["name", "email", "countryCode", "phone", "password", "confirmPassword", "terms"]) {
            await expect(page.locator(`[name="${name}"]`)).toBeAttached();
          }
          await expect(page.locator(".auth-field")).toHaveCount(5);
          const country = page.locator('select[name="countryCode"]');
          await expect(country).toHaveValue("SA");
          await expect(page.locator(".auth-country b")).toHaveText("SA");
          await country.selectOption("US");
          await expect(page.locator(".auth-country b")).toHaveText("US");
          await expect(page.locator('#access-panel a[href="/auth"]')).toBeVisible();
        }

        if (route.screen === "forgot") {
          await expect(page.locator('#access-panel input[type="email"]')).toBeVisible();
          await expect(page.locator('#access-panel form button[type="submit"]')).toBeVisible();
          await expect(page.locator('#access-panel a[href="/auth"]')).toHaveCount(1);
        }

        const layout = await page.evaluate(() => {
          const panel = document.querySelector<HTMLElement>("#access-panel")!.getBoundingClientRect();
          const panelRoot = document.querySelector<HTMLElement>("#access-panel");
          const resources = performance
            .getEntriesByType("resource")
            .map((entry) => decodeURIComponent(entry.name));
          return {
            clippedButtons: Array.from(panelRoot?.querySelectorAll<HTMLElement>("button,a") ?? [])
              .filter((element) => element.checkVisibility())
              .some((element) => element.scrollWidth > element.clientWidth + 1),
            panel: {
              bottom: panel.bottom,
              height: panel.height,
              left: panel.left,
              right: panel.right,
              top: panel.top,
              width: panel.width,
            },
            referenceLoaded: resources.some((resource) =>
              /APPROVED_AUTH_REFERENCES|login\.png|register\.png|popup_card/.test(resource),
            ),
            visibleDevPortal:
              document.querySelector<HTMLElement>("nextjs-portal")?.checkVisibility() ?? false,
            scrollWidth: document.documentElement.scrollWidth,
            viewportHeight: document.documentElement.clientHeight,
            viewportWidth: document.documentElement.clientWidth,
          };
        });

        expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
        expect(layout.clippedButtons).toBe(false);
        expect(layout.referenceLoaded).toBe(false);
        expect(layout.visibleDevPortal).toBe(false);
        expect(layout.panel.left).toBeGreaterThanOrEqual(-1);
        expect(layout.panel.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
        expect(layout.panel.top).toBeGreaterThanOrEqual(-1);
        expect(layout.panel.bottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
        // the approved cards keep their proportions at every screen size
        const ratio = route.screen === "register" ? 752 / 1008 : 758 / 836;
        expect(layout.panel.width / layout.panel.height).toBeCloseTo(ratio, 1);
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
