import { expect, test, type BrowserContext } from "@playwright/test";

test.setTimeout(90_000);

const homeViewports = [
  { name: "2560x1440", width: 2560, height: 1440 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1661x947", width: 1661, height: 947 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "768x1024", width: 768, height: 1024 },
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

const removedElements = [
  ".global-home__news",
  ".global-home__stats",
  ".global-home__distribution",
  ".global-home__trust",
  ".global-home__nav",
  ".global-home__search",
  ".global-home__bell",
];

async function setLocaleCookie(
  context: BrowserContext,
  locale: "ar" | "en",
  baseURL: string | undefined,
) {
  await context.addCookies([
    { name: "locale", value: locale, url: baseURL ?? "http://127.0.0.1:3101" },
  ]);
}

async function openHome(
  context: BrowserContext,
  page: import("@playwright/test").Page,
  locale: "ar" | "en",
  baseURL: string | undefined,
  activity: "live" | "down" = "live",
) {
  await setLocaleCookie(context, locale, baseURL);
  await page.route("**/api/platform/activity", async (route) => {
    if (activity === "down") await route.fulfill({ status: 503 });
    else
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(activityFixture),
      });
  });
  const activityResponse = page.waitForResponse("**/api/platform/activity");
  const response = await page.goto("/");
  await activityResponse;
  await page.evaluate(() => document.fonts.ready);
  return response;
}

for (const locale of ["ar", "en"] as const) {
  for (const viewport of homeViewports) {
    test(`pre-login home ${viewport.name} ${locale} keeps the approved composition`, async ({
      context,
      page,
    }, testInfo) => {
      const runtimeErrors: string[] = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));
      await page.setViewportSize(viewport);
      const response = await openHome(context, page, locale, testInfo.project.use.baseURL);

      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      await expect(page.locator(".global-home__stage")).toBeVisible();

      // approved decisions: headline, tagline, two access buttons, 4 capabilities, cinematic panels
      await expect(page.locator(".global-home__statement span")).toHaveCount(3);
      await expect(page.locator(".global-home__hero-copy > strong span")).toHaveCount(3);
      await expect(page.locator(".global-home__statement")).toHaveText(
        locale === "ar" ? /بيانات دقيقة\s*رؤى ذكية\s*نمو مستدام/ : /Accurate data\s*Smart insights\s*Sustainable growth/,
      );
      await expect(page.locator(".global-home__statement")).not.toContainText("·");
      await expect(page.locator(".global-home__access-btn")).toHaveCount(2);
      await expect(page.locator('.global-home__access a[href="/login"]')).toBeVisible();
      await expect(page.locator('.global-home__access a[href="/register"]')).toBeVisible();
      await expect(page.locator(".global-home__capabilities article")).toHaveCount(4);
      await expect(page.locator(".global-home__kpis article")).toHaveCount(3);
      await expect(page.locator(".cine__slide")).toHaveCount(6);
      await expect(page.locator('.cine__slide[data-state="active"]')).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Jenan PRO");

      for (const selector of removedElements) {
        await expect(page.locator(selector), `${selector} must stay removed`).toHaveCount(0);
      }
      const heading = await page.locator(".global-home__hero-copy h1").boundingBox();
      expect(heading!.width).toBeLessThanOrEqual(3);
      expect(heading!.height).toBeLessThanOrEqual(3);

      const layout = await page.evaluate(() => {
        const rect = (selector: string) => {
          const bounds = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
          return bounds
            ? { bottom: bounds.bottom, left: bounds.left, right: bounds.right, top: bounds.top }
            : null;
        };
        const resources = performance
          .getEntriesByType("resource")
          .map((entry) => decodeURIComponent(entry.name));
        return {
          access: rect(".global-home__access"),
          cine: rect(".cine"),
          clipped: Array.from(document.querySelectorAll<HTMLElement>("a,button"))
            .filter((element) => element.checkVisibility() && !element.closest(".cine__slide:not([data-state='active'])"))
            .some((element) => element.scrollWidth > element.clientWidth + 1),
          referenceLoaded: resources.some((resource) =>
            /APPROVED_HOME_REFERENCE|homepage\.png/.test(resource),
          ),
          scrollHeight: document.documentElement.scrollHeight,
          scrollWidth: document.documentElement.scrollWidth,
          viewportHeight: document.documentElement.clientHeight,
          viewportWidth: document.documentElement.clientWidth,
          world: rect(".global-home__world"),
        };
      });

      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
      expect(layout.scrollHeight).toBeLessThanOrEqual(layout.viewportHeight + 1);
      expect(layout.clipped).toBe(false);
      expect(layout.referenceLoaded).toBe(false);
      // access buttons sit under the globe and above the service panels, never on top of either
      expect(layout.access!.top).toBeGreaterThanOrEqual(layout.world!.bottom - 12);
      expect(layout.access!.bottom).toBeLessThanOrEqual(layout.cine!.top + 1);
      expect(layout.cine!.bottom).toBeLessThanOrEqual(layout.viewportHeight);

      await testInfo.attach(`home-${viewport.name}-${locale}`, {
        body: await page.screenshot({ animations: "disabled" }),
        contentType: "image/png",
      });
      expect(runtimeErrors).toEqual([]);
    });
  }

  test(`pre-login home ${locale} rotates one service every 7 seconds without scene motion`, async ({
    context,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1661, height: 947 });
    await openHome(context, page, locale, testInfo.project.use.baseURL);

    const active = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>(".cine__slide")).findIndex(
          (slide) => slide.dataset.state === "active",
        ),
      );
    const first = await active();
    expect(first).toBe(0);

    const moving = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".cine, .cine *")).filter((element) => {
        const style = getComputedStyle(element);
        return style.animationName !== "none";
      }).length,
    );
    expect(moving, "cinematic panels must not animate inside the scene").toBe(0);

    await page.waitForTimeout(6000);
    expect(await active()).toBe(0);
    await page.waitForTimeout(1900);
    expect(await active()).toBe(1);
    await expect(page.locator('.cine__slide[data-state="active"] .cine__chips a')).toHaveCount(4);
    await expect(page.locator('.cine__slide[data-state="active"] .cine__cta')).toBeVisible();
  });

  test(`pre-login home ${locale} pauses the rotation while hovered`, async ({
    context,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHome(context, page, locale, testInfo.project.use.baseURL);
    await page.locator(".cine").hover();
    await page.waitForTimeout(8000);
    await expect(page.locator('.cine__slide[data-state="active"]')).toHaveAttribute(
      "data-scene",
      "projects",
    );
  });

  test(`pre-login home ${locale} exposes truthful empty activity`, async ({
    context,
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1661, height: 947 });
    await openHome(context, page, locale, testInfo.project.use.baseURL, "down");
    await expect(page.locator(".global-home__kpis article").nth(1).locator("strong")).toHaveText("0");
    await expect(page.locator(".global-home__kpis article").nth(2).locator("strong")).toHaveText("0");
  });
}

test("pre-login home opens each auth panel from its button", async ({ context, page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openHome(context, page, "ar", testInfo.project.use.baseURL);
  await page.locator('.global-home__access a[href="/login"]').click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("#access-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/$/);
  await page.locator('.global-home__access a[href="/register"]').click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.locator("#access-panel")).toBeVisible();
});
