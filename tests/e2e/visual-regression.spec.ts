import { expect, test, type BrowserContext } from "@playwright/test";

// Visual regression for the frozen pre-login pages. The baseline images are generated from a known-good build and are
// not committed (they depend on the machine's fonts and renderer): point VISUAL_BASELINE_DIR at a folder, run once with
// `--update-snapshots` to record, change the code, then run again to compare pixel by pixel.
//
//   VISUAL_BASELINE_DIR=<folder> PLAYWRIGHT_BASE_URL=http://127.0.0.1:3102 npx playwright test --project=visual-regression --update-snapshots
//   VISUAL_BASELINE_DIR=<folder> PLAYWRIGHT_BASE_URL=http://127.0.0.1:3102 npx playwright test --project=visual-regression
test.skip(!process.env.VISUAL_BASELINE_DIR, "set VISUAL_BASELINE_DIR to record or compare baselines");

const origin = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3101"}`;

const viewports = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "820x1180", width: 820, height: 1180 },
  { name: "430x932", width: 430, height: 932 },
  { name: "390x844", width: 390, height: 844 },
  { name: "360x800", width: 360, height: 800 },
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
const activityEmpty = { activeUsers: 0, generatedAt: "2026-09-30T12:00:00.000Z", locations: [], sourceState: "EMPTY", windowMinutes: 15 };

const screens = [
  { name: "home-empty", path: "/", activity: activityEmpty },
  { name: "home-active", path: "/", activity: activityFixture },
  { name: "login", path: "/login", activity: activityEmpty },
  { name: "register", path: "/register", activity: activityEmpty },
] as const;

async function settle(context: BrowserContext, path: string, activity: unknown, locale: "ar" | "en") {
  await context.addCookies([{ name: "locale", value: locale, url: origin }]);
  const page = await context.newPage();
  await page.route("**/api/platform/activity", (route) => route.fulfill({ body: JSON.stringify(activity), contentType: "application/json" }));
  await page.goto(path, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  // Every image on the page has to be decoded before the picture is taken, or the comparison would measure timing.
  await page.evaluate(async () => {
    await Promise.all(
      Array.from(document.images).map((image) => (image.complete ? Promise.resolve() : new Promise((resolve) => { image.onload = image.onerror = () => resolve(null); }))),
    );
  });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(1_200);
  return page;
}

test.describe("pre-login pages keep their exact look", () => {
  for (const locale of ["ar", "en"] as const) {
    for (const viewport of viewports) {
      for (const screen of screens) {
        test(`${screen.name} ${locale} ${viewport.name}`, async ({ browser }) => {
          const context = await browser.newContext({ deviceScaleFactor: 1, locale: locale === "ar" ? "ar-SA" : "en-US", reducedMotion: "reduce", viewport });
          try {
            const page = await settle(context, screen.path, screen.activity, locale);
            await expect(page).toHaveScreenshot(`${screen.name}-${locale}-${viewport.name}.png`, {
              animations: "disabled",
              fullPage: true,
              maxDiffPixelRatio: 0,
              threshold: 0,
              timeout: 15_000,
            });
          } finally {
            await context.close();
          }
        });
      }
    }
  }
});
