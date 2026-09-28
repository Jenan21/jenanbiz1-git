import { expect, test } from "@playwright/test";

const viewports = [
  { name: "2560x1440", width: 2560, height: 1440 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1661x947", width: 1661, height: 947 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1347x768", width: 1347, height: 768 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1267x599", width: 1267, height: 599 },
  { name: "1024x1366", width: 1024, height: 1366 },
  { name: "820x1180", width: 820, height: 1180 },
  { name: "430x932", width: 430, height: 932 },
  { name: "390x844", width: 390, height: 844 },
  { name: "360x800", width: 360, height: 800 },
] as const;

const activityFixture = {
  activeUsers: 28,
  generatedAt: "2026-09-09T12:00:00.000Z",
  windowMinutes: 15,
  locations: [
    {
      countryCode: "SA",
      countryName: { ar: "السعودية", en: "Saudi Arabia" },
      activeUsers: 16,
    },
    {
      countryCode: "AE",
      countryName: { ar: "الإمارات", en: "United Arab Emirates" },
      activeUsers: 8,
    },
    {
      countryCode: "US",
      countryName: { ar: "الولايات المتحدة", en: "United States" },
      activeUsers: 4,
    },
  ],
};

for (const locale of ["ar", "en"] as const) {
  for (const route of ["/login", "/register"] as const) {
    for (const viewport of viewports) {
      test(`${route} ${viewport.name} ${locale} matches Auth acceptance`, async ({
        context,
        page,
      }, testInfo) => {
        const runtimeErrors: string[] = [];
        page.on("pageerror", (error) => runtimeErrors.push(error.message));
        const shouldCapture = [
          "1661x947",
          "1366x768",
          "1024x1366",
          "390x844",
        ].includes(viewport.name);
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
        await expect(page.locator(".access-page")).toHaveAttribute(
          "data-auth-route",
          route,
        );
        await expect(page.locator(".access-page")).toHaveAttribute(
          "data-auth-screen",
          route.slice(1),
        );
        await expect(page.locator(".access-page")).toHaveAttribute(
          "data-auth-source",
          "LIVE_PLATFORM_ACTIVITY",
        );
        await expect(page.locator(".access-page")).toHaveAttribute(
          "data-auth-privacy",
          "PUBLIC_AGGREGATE",
        );
        await expect(page.locator(".access-page__form-panel")).toBeVisible();
        await expect(
          page.locator(".access-page__form-panel form"),
        ).toBeVisible();
        if (route === "/login") {
          await expect(page.locator('input[name="email"]')).toBeVisible();
          await expect(page.locator('input[name="password"]')).toBeVisible();
          await expect(page.locator('input[name="remember"]')).toBeVisible();
          await expect(
            page.locator('.access-page__form-panel a[href="/auth/forgot"]'),
          ).toBeVisible();
        }
        await page.keyboard.press("Escape");
        await expect(page.locator(".access-page__form-panel")).toHaveCount(0);
        await expect(page.locator(".access-page__access-action")).toHaveCount(
          2,
        );
        await expect(
          page.locator(".access-page__world-signals > span"),
        ).toHaveCount(activityFixture.locations.length);

        const closedLayout = await page.evaluate(() => {
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
          const city =
            document.querySelector<HTMLElement>(".access-page__city");
          const globe = document.querySelector<HTMLElement>(
            ".access-page__globe",
          );
          const heroTitle = document.querySelector<HTMLElement>(
            ".access-page__story h1",
          );
          return {
            cityBackground: city ? getComputedStyle(city).backgroundImage : "",
            cityBackgroundSize: city
              ? getComputedStyle(city).backgroundSize
              : "",
            accessIcon: rect(".access-page__access-action .icon"),
            benefits: rect(".access-page__benefits"),
            city: rect(".access-page__city"),
            dock: rect(".access-page__access-dock"),
            footer: rect(".access-page__footer"),
            globe: rect(".access-page__globe"),
            globeBackground: globe
              ? getComputedStyle(globe).backgroundImage
              : "",
            globeBackgroundSize: globe
              ? getComputedStyle(globe).backgroundSize
              : "",
            headerNavLinks: document.querySelectorAll(
              ".access-page__header nav > a",
            ).length,
            heroTitleOverflow: heroTitle
              ? heroTitle.scrollWidth > heroTitle.clientWidth + 1
              : false,
            heroTitleText: heroTitle?.textContent,
            intel: rect(".access-page__intel"),
            logo: rect(".access-page__logo"),
            logoMonogram: document.querySelector<HTMLElement>(
              ".access-page__logo-monogram",
            )?.textContent,
            logoName: document.querySelector<HTMLElement>(
              ".access-page__logo-copy strong",
            )?.textContent,
            metrics: rect(".access-page__metrics"),
            referenceLoaded: resources.some((resource) =>
              /reference-approved-home|واجهات الدخول والتسجيل|الدخول\.png/.test(
                decodeURIComponent(resource),
              ),
            ),
            scrollWidth: document.documentElement.scrollWidth,
            stage: rect(".access-page__stage"),
            story: rect(".access-page__story"),
            signalCount: document.querySelectorAll(
              ".access-page__world-signals > span",
            ).length,
            trust: rect(".access-page__trust"),
            viewportHeight: document.documentElement.clientHeight,
            viewportWidth: document.documentElement.clientWidth,
          };
        });

        expect(closedLayout.scrollWidth).toBeLessThanOrEqual(
          closedLayout.viewportWidth + 1,
        );
        expect(closedLayout.referenceLoaded).toBe(false);
        expect(closedLayout.cityBackground).toContain("global-city-night.jpg");
        expect(closedLayout.cityBackgroundSize).toContain("cover");
        expect(closedLayout.globeBackground).toContain(
          "earth-night-texture.jpg",
        );
        expect(closedLayout.globeBackgroundSize).toContain("cover");
        expect(closedLayout.logo).not.toBeNull();
        expect(closedLayout.logoMonogram).toBe("J");
        expect(closedLayout.logoName).toContain("Jenan Pro");
        expect(closedLayout.headerNavLinks).toBe(0);
        expect(closedLayout.heroTitleText).toContain(
          locale === "ar" ? "جنان برو" : "Jenan Pro",
        );
        expect(closedLayout.heroTitleOverflow).toBe(false);
        expect(closedLayout.signalCount).toBe(3);
        expect(closedLayout.accessIcon).not.toBeNull();
        expect(closedLayout.accessIcon!.width).toBeGreaterThanOrEqual(40);
        expect(closedLayout.dock).not.toBeNull();
        expect(closedLayout.intel).not.toBeNull();
        expect(closedLayout.dock!.left).toBeGreaterThanOrEqual(-1);
        expect(closedLayout.dock!.right).toBeLessThanOrEqual(
          closedLayout.viewportWidth + 1,
        );
        expect(closedLayout.dock!.bottom).toBeLessThanOrEqual(
          closedLayout.viewportHeight + 1,
        );

        if (viewport.width > 1100) {
          expect(closedLayout.stage).not.toBeNull();
          expect(closedLayout.stage!.left).toBeCloseTo(0, 0);
          expect(closedLayout.stage!.top).toBeCloseTo(0, 0);
          expect(closedLayout.stage!.width).toBeCloseTo(
            closedLayout.viewportWidth,
            0,
          );
          expect(closedLayout.stage!.height).toBeCloseTo(
            closedLayout.viewportHeight,
            0,
          );
          expect(closedLayout.story!.left).toBeGreaterThanOrEqual(
            closedLayout.trust!.left - 1,
          );
          expect(closedLayout.story!.right).toBeLessThanOrEqual(
            closedLayout.dock!.left + 1,
          );
          expect(closedLayout.dock!.bottom).toBeLessThanOrEqual(
            closedLayout.intel!.top + 1,
          );
          expect(closedLayout.intel!.bottom).toBeLessThanOrEqual(
            closedLayout.trust!.top + 1,
          );

          if (viewport.name === "1661x947") {
            const stage = closedLayout.stage!;
            const horizontal = (value: number) =>
              (value - stage.left) / stage.width;
            const vertical = (value: number) =>
              (value - stage.top) / stage.height;

            expect(horizontal(closedLayout.story!.left)).toBeGreaterThanOrEqual(
              0.02,
            );
            expect(horizontal(closedLayout.story!.left)).toBeLessThanOrEqual(
              0.04,
            );
            expect(vertical(closedLayout.story!.top)).toBeGreaterThanOrEqual(
              0.13,
            );
            expect(vertical(closedLayout.story!.top)).toBeLessThanOrEqual(0.17);
            expect(
              closedLayout.story!.width / stage.width,
            ).toBeGreaterThanOrEqual(0.27);
            expect(closedLayout.story!.width / stage.width).toBeLessThanOrEqual(
              0.31,
            );
            expect(horizontal(closedLayout.globe!.left)).toBeGreaterThanOrEqual(
              0.33,
            );
            expect(horizontal(closedLayout.globe!.left)).toBeLessThanOrEqual(
              0.37,
            );
            expect(vertical(closedLayout.globe!.top)).toBeGreaterThanOrEqual(
              0.06,
            );
            expect(vertical(closedLayout.globe!.top)).toBeLessThanOrEqual(0.09);
            expect(
              closedLayout.globe!.width / stage.width,
            ).toBeGreaterThanOrEqual(0.46);
            expect(closedLayout.globe!.width / stage.width).toBeLessThanOrEqual(
              0.51,
            );
            expect(
              closedLayout.globe!.height / stage.height,
            ).toBeGreaterThanOrEqual(0.51);
            expect(
              closedLayout.globe!.height / stage.height,
            ).toBeLessThanOrEqual(0.57);
            expect(vertical(closedLayout.benefits!.top)).toBeGreaterThanOrEqual(
              0.27,
            );
            expect(vertical(closedLayout.benefits!.top)).toBeLessThanOrEqual(
              0.34,
            );
            expect(vertical(closedLayout.intel!.top)).toBeGreaterThanOrEqual(
              0.61,
            );
            expect(vertical(closedLayout.intel!.top)).toBeLessThanOrEqual(0.65);
            expect(
              closedLayout.intel!.height / stage.height,
            ).toBeGreaterThanOrEqual(0.18);
            expect(
              closedLayout.intel!.height / stage.height,
            ).toBeLessThanOrEqual(0.21);
            expect(vertical(closedLayout.trust!.top)).toBeGreaterThanOrEqual(
              0.82,
            );
            expect(vertical(closedLayout.trust!.top)).toBeLessThanOrEqual(0.85);
            expect(vertical(closedLayout.footer!.top)).toBeGreaterThanOrEqual(
              0.91,
            );
            expect(vertical(closedLayout.footer!.top)).toBeLessThanOrEqual(
              0.94,
            );
          }
        } else {
          expect(closedLayout.story!.bottom).toBeLessThanOrEqual(
            closedLayout.dock!.top + 1,
          );
          expect(closedLayout.dock!.bottom).toBeLessThanOrEqual(
            closedLayout.metrics!.top + 1,
          );
          expect(closedLayout.metrics!.bottom).toBeLessThanOrEqual(
            closedLayout.intel!.top + 1,
          );
        }

        if (shouldCapture) {
          await testInfo.attach(
            `${route.slice(1)}-${viewport.name}-${locale}-gateway`,
            {
              body: await page.screenshot({
                animations: "disabled",
                fullPage: viewport.width <= 620,
              }),
              contentType: "image/png",
            },
          );
        }

        const triggerName =
          route === "/login"
            ? locale === "ar"
              ? "دخول"
              : "Sign in"
            : locale === "ar"
              ? "حساب جديد"
              : "New account";
        const trigger = page.getByRole("button", {
          name: triggerName,
          exact: true,
        });
        await trigger.click();
        await expect(page.locator(".access-page__form-panel")).toBeVisible();
        await expect(
          page.locator(".access-page__form-panel form"),
        ).toBeVisible();
        await expect(page.locator(".access-page__form-panel")).toHaveAttribute(
          "role",
          "dialog",
        );
        await expect(page.locator(".access-page__alternate a")).toHaveAttribute(
          "href",
          route === "/login" ? "/auth/register" : "/auth/login",
        );

        const openLayout = await page.evaluate(() => {
          const bounds = document
            .querySelector<HTMLElement>(".access-page__form-panel")!
            .getBoundingClientRect();
          return {
            bottom: bounds.bottom,
            left: bounds.left,
            right: bounds.right,
            top: bounds.top,
            viewportHeight: document.documentElement.clientHeight,
            viewportWidth: document.documentElement.clientWidth,
          };
        });

        expect(openLayout.left).toBeGreaterThanOrEqual(-1);
        expect(openLayout.right).toBeLessThanOrEqual(
          openLayout.viewportWidth + 1,
        );
        expect(openLayout.top).toBeGreaterThanOrEqual(-1);
        expect(openLayout.bottom).toBeLessThanOrEqual(
          openLayout.viewportHeight + 1,
        );

        if (shouldCapture) {
          await testInfo.attach(
            `${route.slice(1)}-${viewport.name}-${locale}-panel`,
            {
              body: await page.screenshot({
                animations: "disabled",
                fullPage: viewport.width <= 620,
              }),
              contentType: "image/png",
            },
          );
        }

        await page.keyboard.press("Escape");
        await expect(page.locator(".access-page__form-panel")).toHaveCount(0);
        await expect(trigger).toBeFocused();
        expect(runtimeErrors).toEqual([]);
      });
    }
  }
}
