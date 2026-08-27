import { defineConfig } from "@playwright/test";

process.env.E2E_RUN_ID ??= `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const visualProjects = [
  ["desktop", { width: 1440, height: 1000 }],
  ["laptop", { width: 1280, height: 800 }],
  ["tablet", { width: 820, height: 1180 }],
  ["mobile", { width: 390, height: 844 }],
] as const;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3101",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    ...visualProjects.flatMap(([device, viewport]) =>
      (["ar", "en"] as const).map((locale) => ({
        name: `visual-${device}-${locale}`,
        testMatch: /visual-layout\.spec\.ts/,
        use: { viewport, locale: locale === "ar" ? "ar-SA" : "en-US" },
        metadata: { appLocale: locale, viewportKind: device },
      })),
    ),
    {
      name: "auth-chromium",
      testMatch: /auth\.spec\.ts/,
      use: { viewport: { width: 1280, height: 800 }, locale: "en-US" },
      metadata: { appLocale: "en" },
    },
    {
      name: "review-pack",
      testMatch:
        /(review-pack.*|refinement-review|auth-contract-review|auth-new-direction-login-review|projects-interactions)\.spec\.ts/,
      use: { viewport: { width: 1440, height: 1000 }, locale: "ar-SA" },
      metadata: { appLocale: "ar" },
    },
  ],
});
