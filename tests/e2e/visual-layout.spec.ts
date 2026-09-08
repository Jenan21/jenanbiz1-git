import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context }, testInfo) => {
  const locale = String(testInfo.project.metadata.appLocale);
  await context.addCookies([
    { name: "locale", value: locale, url: "http://127.0.0.1:3101" },
  ]);
});

for (const path of ["/login", "/register"] as const) {
  test(`${path} respects viewport and document direction`, async ({
    page,
  }, testInfo) => {
    await page.route("**/api/platform/activity", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          activeUsers: 11,
          generatedAt: new Date().toISOString(),
          windowMinutes: 15,
          locations: [
            { countryCode: "US", countryName: { ar: "الولايات المتحدة", en: "United States" }, activeUsers: 9 },
            { countryCode: "DE", countryName: { ar: "ألمانيا", en: "Germany" }, activeUsers: 2 },
          ],
        }),
      });
    });
    await page.goto(path);
    const locale = String(testInfo.project.metadata.appLocale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      locale === "ar" ? "rtl" : "ltr",
    );
    await expect(page.locator(".access-page")).toBeVisible();
    await expect(page.locator(".access-page__logo")).toBeInViewport();
    await expect(page.locator(".access-page__form-panel")).toBeInViewport();
    await expect(page.locator(".access-page__form-panel form")).toBeVisible();
    await expect(page.locator(".access-page__alternate a")).toHaveAttribute(
      "href",
      path === "/login" ? "/register" : "/login",
    );
    await expect(page.locator(".gateway-world-map__activity > g")).toHaveCount(2);
    const activityRadii = await page
      .locator(".gateway-world-map__activity-ring")
      .evaluateAll((rings) => rings.map((ring) => Number(ring.getAttribute("r"))));
    expect(activityRadii[0]).toBeGreaterThan(activityRadii[1]);
    const initialLayout = await page.evaluate(() => {
      const viewportHeight = document.documentElement.clientHeight;
      const selectors = [
        ".access-page__logo",
        ".access-page__form-panel",
        ".access-page__form-panel form",
      ];
      return selectors.flatMap((selector) =>
        [...document.querySelectorAll<HTMLElement>(selector)]
          .map((element) => ({ selector, rect: element.getBoundingClientRect() }))
          .filter(({ rect }) => rect.top < -1 || rect.bottom > viewportHeight + 1)
          .map(({ selector, rect }) => ({ selector, top: rect.top, bottom: rect.bottom })),
      );
    });
    expect(initialLayout).toEqual([]);

    const layout = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const selectors = [
        "main",
        "form",
        "header",
        ".access-page__story",
        ".access-page__form-panel",
      ];
      const violations = selectors.flatMap((selector) =>
        [...document.querySelectorAll<HTMLElement>(selector)]
          .filter((element) => element.getClientRects().length > 0)
          .map((element) => ({
            selector,
            rect: element.getBoundingClientRect(),
          }))
          .filter(
            ({ rect }) => rect.left < -1 || rect.right > viewportWidth + 1,
          )
          .map(({ selector, rect }) => ({
            selector,
            left: rect.left,
            right: rect.right,
          })),
      );
      return {
        viewportWidth,
        scrollWidth: document.documentElement.scrollWidth,
        violations,
      };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.violations).toEqual([]);
  });
}
