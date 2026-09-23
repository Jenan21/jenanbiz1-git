import { expect, test } from "@playwright/test";

const viewports = [
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
  generatedAt: "2026-09-09T12:00:00.000Z",
  windowMinutes: 15,
  locations: [
    { countryCode: "SA", countryName: { ar: "السعودية", en: "Saudi Arabia" }, activeUsers: 16 },
    { countryCode: "AE", countryName: { ar: "الإمارات", en: "United Arab Emirates" }, activeUsers: 8 },
    { countryCode: "US", countryName: { ar: "الولايات المتحدة", en: "United States" }, activeUsers: 4 },
  ],
};

for (const locale of ["ar", "en"] as const) {
  for (const route of ["/login", "/register"] as const) {
    for (const viewport of viewports) {
      test(`${route} ${viewport.name} ${locale} matches Auth acceptance`, async ({
        context,
        page,
      }, testInfo) => {
        await page.setViewportSize(viewport);
        await context.addCookies([
          {
            name: "locale",
            value: locale,
            url: testInfo.project.use.baseURL ?? "http://127.0.0.1:3101",
          },
        ]);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.route("**/api/platform/activity", async (request) => {
          await request.fulfill({
            contentType: "application/json",
            body: JSON.stringify(activityFixture),
          });
        });

        await page.goto(route);
        await page.evaluate(() => document.fonts.ready);

        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          locale === "ar" ? "rtl" : "ltr",
        );
        await expect(page.locator(".access-page__form-panel")).toBeVisible();
        await expect(page.locator(".access-page__form-panel form")).toBeVisible();
        await expect(page.locator(".access-page__alternate a")).toHaveAttribute(
          "href",
          route === "/login" ? "/register" : "/login",
        );

        const layout = await page.evaluate(() => {
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
          const resources = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name);
          const city = document.querySelector<HTMLElement>(".access-page__city")!;
          const globe = document.querySelector<HTMLElement>(".access-page__globe")!;
          return {
            cityBackground: getComputedStyle(city).backgroundImage,
            form: rect(".access-page__form-panel"),
            globeBackground: getComputedStyle(globe).backgroundImage,
            referenceLoaded: resources.some((resource) =>
              /reference-approved-home|واجهات الدخول والتسجيل|الدخول\.png/.test(
                decodeURIComponent(resource),
              ),
            ),
            scrollWidth: document.documentElement.scrollWidth,
            stage: rect(".access-page__stage"),
            story: rect(".access-page__story"),
            trust: rect(".access-page__trust"),
            viewportWidth: document.documentElement.clientWidth,
          };
        });

        expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
        expect(layout.referenceLoaded).toBe(false);
        expect(layout.cityBackground).toContain("global-city-night.jpg");
        expect(layout.globeBackground).toContain("earth-night-texture.jpg");
        expect(layout.form).not.toBeNull();
        expect(layout.form!.left).toBeGreaterThanOrEqual(-1);
        expect(layout.form!.right).toBeLessThanOrEqual(layout.viewportWidth + 1);

        if (viewport.width > 1350) {
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
          expect(layout.story!.right).toBeLessThan(layout.form!.left);
          expect(layout.form!.right).toBeLessThan(layout.trust!.right);
        }

        if (viewport.width <= 620) {
          expect(layout.form!.top).toBeLessThan(layout.story!.top);
        }

        await testInfo.attach(
          `${route.slice(1)}-${viewport.name}-${locale}`,
          {
            body: await page.screenshot({
              animations: "disabled",
              fullPage: viewport.width <= 620,
            }),
            contentType: "image/png",
          },
        );
      });
    }
  }
}