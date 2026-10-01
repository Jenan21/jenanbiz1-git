import { expect, test, type BrowserContext } from "@playwright/test";

test.setTimeout(90_000);

const homeViewports = [
  { name: "2560x1440", width: 2560, height: 1440 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1672x941", width: 1672, height: 941 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1265x590", width: 1265, height: 590 },
  { name: "820x1180", width: 820, height: 1180 },
  { name: "390x844", width: 390, height: 844 },
] as const;

const activityFixture = {
  activeUsers: 28,
  generatedAt: "2026-09-30T12:00:00.000Z",
  windowMinutes: 15,
  locations: [
    { countryCode: "SA", countryName: { ar: "السعودية", en: "Saudi Arabia" }, activeUsers: 10 },
    { countryCode: "AE", countryName: { ar: "الإمارات", en: "United Arab Emirates" }, activeUsers: 7 },
    { countryCode: "US", countryName: { ar: "الولايات المتحدة", en: "United States" }, activeUsers: 5 },
    { countryCode: "DE", countryName: { ar: "أوروبا", en: "Europe" }, activeUsers: 4 },
  ],
  sourceState: "LIVE",
};

const zones = [
  ".global-home__header",
  ".global-home__hero",
  ".global-home__services",
  ".global-home__dashboard",
  ".global-home__ecosystem",
  ".global-home__footer",
];

async function setLocaleCookie(
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
  for (const viewport of homeViewports) {
    test(`canonical homepage ${viewport.name} ${locale} preserves the approved composition`, async ({
      context,
      page,
    }, testInfo) => {
      const runtimeErrors: string[] = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));
      await page.setViewportSize(viewport);
      await setLocaleCookie(context, locale, testInfo.project.use.baseURL);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.route("**/api/platform/activity", async (route) => {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(activityFixture),
        });
      });

      const activityResponse = page.waitForResponse("**/api/platform/activity");
      const response = await page.goto("/");
      await activityResponse;
      await page.evaluate(() => document.fonts.ready);

      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "ar" ? "rtl" : "ltr",
      );
      await expect(page.locator(".global-home")).toHaveAttribute("data-home-route", "/");
      await expect(page.locator(".global-home")).toHaveAttribute(
        "data-home-source",
        "LIVE_PLATFORM_ACTIVITY",
      );
      await expect(page.locator(".global-home__stage")).toBeVisible();
      await expect(page.locator(".global-home__service")).toHaveCount(6);
      await expect(page.locator(".global-home__hero-locations span")).toHaveCount(4);
      await expect(page.locator(".global-home__hero-actions a")).toHaveCount(3);
      await expect(page.locator('.global-home__service[href="/projects"]')).toBeVisible();
      await expect(page.locator('.global-home__service[href="/academy"]')).toBeVisible();
      await expect(page.locator('.global-home__service[href="/software"]')).toBeVisible();
      await expect(page.locator('.global-home__service[href="/market"]')).toBeVisible();
      await expect(page.locator('.global-home__service[href="/talent"]')).toBeVisible();
      await expect(page.locator('.global-home__service[href="/marketing"]')).toBeVisible();
      await expect(page.locator(".global-home__market-panel")).toHaveAttribute(
        "data-market-source",
        "UNAVAILABLE",
      );
      await expect(page.locator(".global-home__market-panel article > strong")).toHaveText(["—", "—", "—", "—"]);
      await expect(page.locator(".global-home__hero-copy h1")).not.toContainText(
        locale === "ar" ? "منصة جنان برو" : "Jenan Pro platform",
      );

      const layout = await page.evaluate((selectors) => {
        const rect = (selector: string) => {
          const bounds = document
            .querySelector<HTMLElement>(selector)
            ?.getBoundingClientRect();
          return bounds
            ? {
                bottom: bounds.bottom,
                height: bounds.height,
                left: bounds.left,
                right: bounds.right,
                top: bounds.top,
                width: bounds.width,
              }
            : null;
        };
        const stage = rect(".global-home__stage");
        const zoneRects = selectors.map((selector) => ({
          rect: rect(selector),
          selector,
        }));
        const resources = performance
          .getEntriesByType("resource")
          .map((entry) => decodeURIComponent(entry.name));
        const hero = document.querySelector<HTMLElement>(".global-home__hero")!;

        return {
          cityBackground: getComputedStyle(hero, "::before").backgroundImage,
          clippedInteractive: Array.from(
            document.querySelectorAll<HTMLElement>("a,button"),
          )
            .filter((element) => element.checkVisibility())
            .some((element) => element.scrollWidth > element.clientWidth + 1),
          ordered: zoneRects.every(
            ({ rect: bounds }, index) =>
              bounds &&
              (index === 0 ||
                (zoneRects[index - 1].rect &&
                  bounds.top >= zoneRects[index - 1].rect!.bottom - 1)),
          ),
          referenceLoaded: resources.some((resource) =>
            /APPROVED_HOME_REFERENCE|الصفحه الرئيسيه\.png/.test(resource),
          ),
          scrollHeight: document.documentElement.scrollHeight,
          scrollWidth: document.documentElement.scrollWidth,
          stage,
          viewportHeight: document.documentElement.clientHeight,
          viewportWidth: document.documentElement.clientWidth,
          violations: zoneRects.filter(
            ({ rect: bounds }) =>
              bounds &&
              (bounds.left < -1 ||
                bounds.right > document.documentElement.clientWidth + 1),
          ),
          zones: Object.fromEntries(
            zoneRects.map(({ rect: bounds, selector }) => [selector, bounds]),
          ),
        };
      }, zones);

      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
      expect(layout.violations).toEqual([]);
      expect(layout.clippedInteractive).toBe(false);
      expect(layout.referenceLoaded).toBe(false);
      expect(layout.cityBackground).toContain("global-city-night.jpg");

      const usesFixedStage = viewport.width > 1100 && viewport.height > 700;
      if (usesFixedStage) {
        expect(layout.stage).not.toBeNull();
        expect(layout.stage!.width).toBeLessThanOrEqual(1673);
        expect(layout.stage!.width / layout.stage!.height).toBeCloseTo(
          1672 / 941,
          2,
        );
        expect(
          Math.abs(
            layout.stage!.left -
              (layout.viewportWidth - layout.stage!.width) / 2,
          ),
        ).toBeLessThanOrEqual(1);
      } else {
        expect(layout.ordered).toBe(true);
        expect(layout.stage!.width).toBeCloseTo(layout.viewportWidth, 0);
        expect(layout.scrollHeight).toBeGreaterThanOrEqual(layout.viewportHeight);
      }

      if (viewport.name === "1672x941") {
        const expectedGeometry = {
          ".global-home__header": { left: 0, top: 0 },
          ".global-home__hero": { left: 0, top: 78 },
          ".global-home__services": { left: 22, top: 487 },
          ".global-home__ecosystem": { left: 0, top: 818 },
          ".global-home__footer": { left: 0, top: 876 },
        } as const;
        for (const [selector, expected] of Object.entries(expectedGeometry)) {
          const bounds = layout.zones[selector];
          expect(bounds).not.toBeNull();
          expect(Math.abs(bounds!.left - expected.left)).toBeLessThanOrEqual(2);
          expect(Math.abs(bounds!.top - expected.top)).toBeLessThanOrEqual(2);
        }
      }

      await testInfo.attach(`canonical-home-${viewport.name}-${locale}`, {
        body: await page.screenshot({
          animations: "disabled",
          fullPage: viewport.width <= 1100 || viewport.height <= 700,
        }),
        contentType: "image/png",
      });
      expect(runtimeErrors).toEqual([]);
    });
  }

  test(`canonical homepage ${locale} exposes truthful unavailable states`, async ({
    context,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1672, height: 941 });
    await setLocaleCookie(context, locale, testInfo.project.use.baseURL);
    await page.route("**/api/platform/activity", async (route) => {
      await route.fulfill({ status: 503 });
    });

    const activityResponse = page.waitForResponse("**/api/platform/activity");
    await page.goto("/");
    await activityResponse;

    await expect(page.locator(".global-home")).toHaveAttribute(
      "data-home-source",
      "UNAVAILABLE",
    );
    await expect(page.locator(".global-home__hero-locations span")).toHaveCount(0);
    await expect(page.locator(".global-home__market-panel article > strong")).toHaveText([
      "—",
      "—",
      "—",
      "—",
    ]);
    await expect(page.locator(".global-home__market-panel em").first()).toContainText(
      locale === "ar" ? "المصدر غير متصل" : "Source unavailable",
    );
  });
}
