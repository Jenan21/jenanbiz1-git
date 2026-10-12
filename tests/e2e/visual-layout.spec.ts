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
    await expect(page.locator("#access-panel")).toBeInViewport();
    await expect(page.locator("#access-panel form")).toBeVisible();
    await expect(page.locator(".access-page__alt-link")).toHaveAttribute(
      "href",
      path === "/login" ? "/register" : "/auth",
    );
    const initialLayout = await page.evaluate(() => {
      const viewportHeight = document.documentElement.clientHeight;
      const selectors = [
        "#access-panel",
        "#access-panel form",
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
        "form",
        "#access-panel",
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

    if (path === "/login") {
      const password = page.locator('input[name="password"]');
      await expect(password).toHaveAttribute("type", "password");
      await page.locator(".auth-field__toggle").click();
      await expect(password).toHaveAttribute("type", "text");
    } else {
      await expect(page.locator('input[name="name"]')).toBeVisible();
      await expect(page.locator('select[name="countryCode"]')).toBeVisible();
      await page.locator('input[name="name"]').fill("Visual Test User");
      await page.locator('input[name="email"]').fill("visual@example.test");
      await expect(page.locator('input[name="confirmPassword"]')).toBeVisible();
      await expect(page.locator('input[name="terms"]')).toBeAttached();
      await page.locator('select[name="countryCode"]').selectOption("SA");
      await page.locator('input[name="password"]').fill("Correct-Horse-2026!");
      await page.locator('input[name="confirmPassword"]').fill("Different-Horse-2026!");
      await page.locator('input[name="terms"]').check({ force: true });
      await page.locator(".auth-primary").click();
      await expect(page.locator(".auth-hint")).toContainText(
        locale === "ar"
          ? "كلمتا المرور غير متطابقتين"
          : "Passwords do not match",
      );
    }
  });
}
