import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const output = path.resolve("outputs/login-gateway");
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3101";

async function prepare(page: import("@playwright/test").Page) {
  await mkdir(output, { recursive: true });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.context().clearCookies();
  await page.context().addCookies([
    { name: "locale", value: "ar", url: baseURL },
  ]);
  await page.addInitScript(() =>
    localStorage.setItem("jenan-theme", "balanced-dark"),
  );
  await page.goto("/login");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, (image) =>
        image.complete ? Promise.resolve() : image.decode().catch(() => undefined),
      ),
    );
  });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
}

test("captures the initial gateway and expanded login state", async ({ page }) => {
  await prepare(page);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("jenan-entry-gateway")).toBeVisible();
  await expect(page.locator(".login-gateway__hero-entry")).toHaveCount(0);
  await expect(page.getByTestId("login-expanded")).toHaveCount(0);
  await expect(page.locator(".login-gateway__status")).toBeVisible();
  await expect(page.locator(".login-gateway__ticker")).toBeVisible();
  await expect(page.locator(".login-gateway__activity")).toBeVisible();
  await expect(page.locator(".login-gateway__services")).toHaveCount(0);
  await expect(page.locator(".login-gateway__opportunities")).toBeVisible();
  await expect(page.getByText("فرص الأعمال العالمية")).toHaveCount(0);
  await expect(page.locator(".login-gateway__opportunities")).toHaveCSS("border-top-width", "0px");
  await expect(page.locator(".login-gateway__opportunity-map")).toHaveCSS("border-top-width", "0px");
  await expect(page.getByTestId("map-activity-state")).toContainText("مؤشرات جغرافية تجريبية");
  await expect(page.getByTestId("map-activity-state")).toContainText("ليست بيانات نشاط حقيقية");
  await expect(page.locator(".login-gateway__analytics")).toBeVisible();
  await expect(page.locator(".login-gateway__analytics")).toHaveCSS("border-top-width", "0px");
  await expect(page.locator(".login-gateway__analytics")).toHaveAttribute("data-market-state", "demo");
  await expect(page.locator(".login-gateway__provider-note")).toContainText("جميع الأرقام والمؤشرات تجريبية");
  await expect(page.locator(".login-gateway__analytics img")).toHaveCount(0);
  await expect(page.locator(".login-gateway__analytics .login-gateway__chart-card")).toHaveCount(4);
  await expect(page.locator(".login-gateway__analytics-svg")).toHaveCount(4);
  await expect(page.locator(".login-gateway__analytics-svg .analytics-svg__series")).toHaveCount(2);
  await expect(page.locator(".login-gateway__analytics-svg .analytics-svg__bars rect")).toHaveCount(5);
  await expect(page.locator(".login-gateway__analytics-svg polygon")).toHaveCount(2);
  await expect(page.locator(".login-gateway__ticker-item strong").first()).toHaveAttribute("data-value", "2431.2");
  await expect(page.locator(".login-gateway__circuit-board")).toBeVisible();
  const metricCards = page.locator(".login-gateway__chart-card");
  await expect(metricCards.nth(0)).toHaveAttribute("data-active", "true");
  await metricCards.nth(2).focus();
  await expect(metricCards.nth(2)).toHaveAttribute("data-active", "true");
  await expect(metricCards.nth(0)).toHaveAttribute("data-active", "false");

  const initialLayout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  expect(initialLayout.scrollWidth).toBeLessThanOrEqual(initialLayout.width + 1);
  expect(initialLayout.scrollHeight).toBeLessThanOrEqual(initialLayout.height + 1);
  await page.screenshot({
    path: path.join(output, "initial-gateway-1672x941.png"),
    fullPage: false,
  });

  await page.getByTestId("jenan-entry-gateway").evaluate((element) => {
    (element as HTMLElement).style.visibility = "hidden";
  });
  await page.screenshot({
    path: path.join(output, "initial-gateway-comparison-1672x941.png"),
    fullPage: false,
  });
  await page.getByTestId("jenan-entry-gateway").evaluate((element) => {
    (element as HTMLElement).style.visibility = "";
  });

  await page.getByTestId("jenan-entry-gateway").press("Enter");
  await expect(page.getByTestId("login-expanded")).toBeVisible();
  await expect(page.getByTestId("jenan-entry-gateway")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('input[name="email"]')).toBeFocused();
  await page.getByTestId("login-expanded").evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  await page.screenshot({
    path: path.join(output, "login-expanded-1672x941.png"),
    fullPage: false,
  });

  await page.getByTestId("close-login").click();
  await expect(page.getByTestId("jenan-entry-gateway")).toBeVisible();
  await expect(page.getByTestId("jenan-entry-gateway")).toHaveAttribute("aria-expanded", "false");

  await page.getByTestId("jenan-entry-gateway").click();
  await expect(page.getByTestId("login-expanded")).toBeVisible();
  await page.getByTestId("jenan-entry-gateway").click();
  await expect(page.getByTestId("login-expanded")).toHaveCount(0);
  await expect(page).toHaveURL(/\/login$/);
});

test("reduced motion keeps the gateway flow usable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepare(page);
  await page.getByTestId("jenan-entry-gateway").press("Space");
  await expect(page.getByTestId("login-expanded")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("jenan-entry-gateway")).toBeVisible();
});

test("English LTR gateway keeps the same Login-only flow", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.context().clearCookies();
  await page.context().addCookies([
    { name: "locale", value: "en", url: baseURL },
  ]);
  await page.goto("/login");

  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByTestId("jenan-entry-gateway")).toContainText("Open the sign-in screen");
  await page.getByTestId("jenan-entry-gateway").click();
  await expect(page.locator('input[name="email"]')).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("jenan-entry-gateway")).toBeVisible();
});

test("renders a live provider snapshot without production fallback data", async ({ page }) => {
  await page.route("**/api/market/live", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        state: "live",
        provider: "contract-test",
        updatedAt: "2026-08-13T16:00:00.000Z",
        staleAt: null,
        instruments: [
          { symbol: "XAU/USD", price: 2431.2, percentChange: 0.8, series: [2398, 2405, 2412, 2408, 2420, 2431.2], datetime: "2026-08-13" },
          { symbol: "WTI/USD", price: 78.4, percentChange: 0.35, series: [76.8, 77.2, 76.9, 77.8, 78.1, 78.4], datetime: "2026-08-13" },
          { symbol: "BTC/USD", price: 61220, percentChange: 1.1, series: [59800, 60200, 60700, 60500, 61000, 61220], datetime: "2026-08-13" },
          { symbol: "DXY", price: 102.7, percentChange: -0.2, series: [103.2, 103, 102.9, 103.1, 102.8, 102.7], datetime: "2026-08-13" },
        ],
      }),
    }),
  );
  await page.goto("/login");
  await expect(page.locator(".login-gateway__analytics")).toHaveAttribute("data-market-state", "live");
  await expect(page.locator(".login-gateway__provider-note")).toContainText("البيانات المباشرة متصلة");
  await expect(page.locator(".analytics-svg__series")).toHaveCount(2);
  await expect(page.locator(".analytics-svg__bars rect")).toHaveCount(5);
  await expect(page.locator(".login-gateway__analytics-svg polygon")).toHaveCount(2);
  await expect(page.locator(".login-gateway__ticker-item strong").first()).toHaveAttribute("data-value", "2431.2");
});

for (const viewport of [
  { width: 1440, height: 760 },
  { width: 1280, height: 650 },
  { width: 1024, height: 600 },
]) {
  test(`fits the complete Login composition at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/login");
    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);
    expect(layout.scrollHeight).toBeLessThanOrEqual(layout.height + 1);
    await expect(page.locator(".login-gateway__header")).toBeVisible();
    await expect(page.locator(".login-gateway__ticker")).toBeVisible();
    await expect(page.getByTestId("jenan-entry-gateway")).toBeVisible();
  });
}
