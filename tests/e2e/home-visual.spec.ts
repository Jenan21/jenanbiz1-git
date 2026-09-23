import { expect, test, type BrowserContext } from "@playwright/test";

const homeViewports = [
  { name: "2560x1440", width: 2560, height: 1440 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1661x947", width: 1661, height: 947 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "820x1180", width: 820, height: 1180 },
  { name: "390x844", width: 390, height: 844 },
] as const;

const activityFixture = {
  activeUsers: 28,
  generatedAt: "2026-05-20T12:00:00.000Z",
  windowMinutes: 15,
  locations: [
    { countryCode: "SA", countryName: { ar: "السعودية", en: "Saudi Arabia" }, activeUsers: 10 },
    { countryCode: "AE", countryName: { ar: "الإمارات", en: "United Arab Emirates" }, activeUsers: 7 },
    { countryCode: "US", countryName: { ar: "الولايات المتحدة", en: "United States" }, activeUsers: 5 },
    { countryCode: "DE", countryName: { ar: "ألمانيا", en: "Germany" }, activeUsers: 4 },
    { countryCode: "JP", countryName: { ar: "اليابان", en: "Japan" }, activeUsers: 2 },
  ],
};

const zones = [
  ".global-home__header",
  ".global-home__hero-copy",
  ".global-home__world",
  ".global-home__kpis",
  ".global-home__capabilities",
  ".global-home__quote",
  ".global-home__news",
  ".global-home__stats",
  ".global-home__distribution",
  ".global-home__trust",
  ".global-home__footer",
];

const mobileFlow = [
  ".global-home__header",
  ".global-home__hero-copy",
  ".global-home__world",
  ".global-home__kpis",
  ".global-home__capabilities",
  ".global-home__quote",
  ".global-home__news",
  ".global-home__stats",
  ".global-home__distribution",
  ".global-home__trust",
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
    test(`homepage ${viewport.name} ${locale} preserves the approved composition`, async ({
      context,
      page,
    }, testInfo) => {
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
      await page.goto("/");
      await activityResponse;
      await page.evaluate(() => document.fonts.ready);

      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "ar" ? "rtl" : "ltr",
      );
      await expect(page.locator(".global-home__stage")).toBeVisible();
      await expect(page.locator(".global-home__network i")).toHaveCount(6);
      await expect(page.locator(".global-home__quote cite")).toHaveText("Jenan Pro");
      await expect(page.locator(".global-home__regions [data-state='live']")).toHaveCount(4);
      await expect(page.locator(".global-home__regions [data-state='unavailable']")).toHaveCount(2);
      await expect(page.locator(".global-home__kpis article:nth-child(2) strong")).toHaveText("28");
      await expect(page.locator(".global-home__kpis article:nth-child(3) strong")).toHaveText("5");

      const layout = await page.evaluate(
        ({ mobileFlow, zones }) => {
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
          const zoneRects = zones.map((selector) => ({
            rect: rect(selector),
            selector,
          }));
          const orderedRects = mobileFlow.map(rect);
          const regionRects = [
            ...document.querySelectorAll<HTMLElement>(".global-home__region"),
          ].map((region) => ({
            name: region.textContent?.trim() ?? "region",
            rect: region.getBoundingClientRect(),
          }));
          const resources = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name);

          return {
            cityBackground: getComputedStyle(
              document.querySelector<HTMLElement>(".global-home__city")!,
            ).backgroundImage,
            earthBackground: getComputedStyle(
              document.querySelector<HTMLElement>(".global-home__earth-texture")!,
            ).backgroundImage,
            ordered: orderedRects.every(
              (bounds, index) =>
                bounds &&
                (index === 0 ||
                  (orderedRects[index - 1] &&
                    bounds.top >= orderedRects[index - 1]!.bottom - 1)),
            ),
            referenceLoaded: resources.some((resource) =>
              resource.includes("reference-home.png"),
            ),
            regionOverlaps: regionRects.flatMap((first, index) =>
              regionRects.slice(index + 1).flatMap((second) => {
                const overlapWidth =
                  Math.min(first.rect.right, second.rect.right) -
                  Math.max(first.rect.left, second.rect.left);
                const overlapHeight =
                  Math.min(first.rect.bottom, second.rect.bottom) -
                  Math.max(first.rect.top, second.rect.top);
                return overlapWidth > 1 && overlapHeight > 1
                  ? [`${first.name} / ${second.name}`]
                  : [];
              }),
            ),
            scrollWidth: document.documentElement.scrollWidth,
            stage,
            stageBackground: getComputedStyle(
              document.querySelector<HTMLElement>(".global-home__stage")!,
            ).backgroundImage,
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
        },
        { mobileFlow, zones },
      );

      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
      expect(layout.violations).toEqual([]);
      expect(layout.regionOverlaps).toEqual([]);
      expect(layout.referenceLoaded).toBe(false);
      expect(layout.stageBackground).not.toBe("none");
      expect(layout.earthBackground).toContain("earth-night-texture.jpg");
      expect(layout.cityBackground).toContain("global-city-night.jpg");

      if (viewport.width > 900) {
        expect(layout.stage).not.toBeNull();
        expect(layout.stage!.width).toBeLessThanOrEqual(1662);
        expect(layout.stage!.width / layout.stage!.height).toBeCloseTo(
          1661 / 947,
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
        expect(layout.stage!.height).toBeGreaterThan(viewport.height);
      }

      if (viewport.name === "1661x947") {
        const expectedGeometry = {
          ".global-home__hero-copy": { left: 48, top: 144 },
          ".global-home__world": { left: 457, top: 63 },
          ".global-home__kpis": { left: 1390, top: 101 },
          ".global-home__news": { left: 360, top: 596 },
          ".global-home__trust": { left: 0, top: 791 },
          ".global-home__footer": { left: 37, top: 876 },
        } as const;
        for (const [selector, expected] of Object.entries(expectedGeometry)) {
          const bounds = layout.zones[selector];
          expect(bounds).not.toBeNull();
          expect(Math.abs(bounds!.left - expected.left)).toBeLessThanOrEqual(2);
          expect(Math.abs(bounds!.top - expected.top)).toBeLessThanOrEqual(2);
        }
      }

      await testInfo.attach(`homepage-${viewport.name}-${locale}`, {
        body: await page.screenshot({
          animations: "disabled",
          fullPage: viewport.width <= 900,
        }),
        contentType: "image/png",
      });
    });
  }

  test(`homepage ${locale} exposes an unavailable-data state`, async ({
    context,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1661, height: 947 });
    await setLocaleCookie(context, locale, testInfo.project.use.baseURL);
    await page.route("**/api/platform/activity", async (route) => {
      await route.fulfill({ status: 503 });
    });

    const activityResponse = page.waitForResponse("**/api/platform/activity");
    await page.goto("/");
    await activityResponse;

    await expect(page.locator(".global-home__regions [data-state='unavailable']")).toHaveCount(6);
    await expect(page.locator(".global-home__distribution .global-home__empty")).toContainText(
      locale === "ar" ? "لا توجد جلسات نشطة حالياً" : "No active sessions now",
    );
    await expect(page.locator(".global-home__kpis article:nth-child(2) strong")).toHaveText("0");
    await expect(page.locator(".global-home__kpis article:nth-child(3) strong")).toHaveText("0");
  });
}