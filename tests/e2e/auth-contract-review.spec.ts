import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const output = path.resolve("outputs/auth-contract-review");

async function setLocale(page: Page, locale: "ar" | "en") {
  await page.context().clearCookies();
  await page
    .context()
    .addCookies([
      { name: "locale", value: locale, url: "http://127.0.0.1:3101" },
    ]);
}

async function setTheme(page: Page, theme: "balanced-dark" | "light") {
  await page.addInitScript(
    (value) => localStorage.setItem("jenan-theme", value),
    theme,
  );
}

async function capture(page: Page, route: string, name: string) {
  await page.goto(route);
  await expect(page.locator("html")).toHaveAttribute("dir", /rtl|ltr/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({ path: path.join(output, name), fullPage: true });
}

test("captures the strict login/register review set", async ({ page }) => {
  await mkdir(output, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await setLocale(page, "ar");
  await setTheme(page, "balanced-dark");
  await capture(page, "/login", "01-login-ar-dark-desktop.png");
  await capture(page, "/register", "02-register-ar-dark-desktop.png");

  await setLocale(page, "en");
  await capture(page, "/login", "03-login-en-dark-desktop.png");

  await setLocale(page, "ar");
  await page.evaluate(() => {
    localStorage.setItem("jenan-theme", "light");
    document.documentElement.dataset.theme = "light";
  });
  await capture(page, "/login", "04-login-ar-light-desktop.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    localStorage.setItem("jenan-theme", "balanced-dark");
    document.documentElement.dataset.theme = "balanced-dark";
  });
  await capture(page, "/login", "05-login-ar-dark-mobile.png");
  await capture(page, "/register", "06-register-ar-dark-mobile.png");
});
