import { expect, test } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3101";

test.beforeEach(async ({ context }, testInfo) => {
  const locale = String(testInfo.project.metadata.appLocale);
  await context.addCookies([
    { name: "locale", value: locale, url: baseURL },
  ]);
});

for (const path of ["/login", "/register"] as const) {
  test(`${path} respects viewport and document direction`, async ({
    page,
  }, testInfo) => {
    await page.goto(path);
    const locale = String(testInfo.project.metadata.appLocale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      locale === "ar" ? "rtl" : "ltr",
    );
    await expect(page.locator("main")).toBeVisible();
    if (path === "/login") {
      await page.getByTestId("jenan-entry-gateway").click();
    }
    await expect(page.locator("form")).toBeVisible();

    const layout = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const selectors = ["main", "form", "header", ".auth-panel"];
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
