import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { cleanE2EIdentities, seedE2EAdmin } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const outputDirectory = path.resolve("outputs/visual-review-pack");
const origin = "http://127.0.0.1:3101";
async function prepare(page: Page) {
  await mkdir(outputDirectory, { recursive: true });
  await cleanE2EIdentities();
  await seedE2EAdmin();
  await page
    .context()
    .addCookies([{ name: "locale", value: "ar", url: origin }]);
  await page.addInitScript(() => {
    if (!localStorage.getItem("jenan-theme"))
      localStorage.setItem("jenan-theme", "balanced-dark");
  });
}
async function registerUser(page: Page) {
  const response = await page.request.post("/api/auth/register", {
    headers: { origin },
    data: {
      displayName: e2eIdentity.user.displayName,
      countryCode: "SA",
      email: e2eIdentity.user.email,
      password: e2eIdentity.user.password,
      locale: "ar",
      language: "ar",
    },
  });
  expect(response.status()).toBe(201);
}
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(outputDirectory, name),
    fullPage: true,
  });
}

test.afterEach(async () => cleanE2EIdentities());

test("review core user pages one", async ({ page }) => {
  await prepare(page);
  await registerUser(page);
  for (const route of [
    "dashboard",
    "projects",
    "academy",
    "studio",
    "talent",
  ]) {
    await page.goto(`/${route}`);
    await shot(page, `desktop-ar-dark-${route}.png`);
  }
});

test("review core user pages two", async ({ page }) => {
  await prepare(page);
  await registerUser(page);
  for (const route of [
    "market",
    "software",
    "software/robotics",
    "funding-eligibility",
  ]) {
    await page.goto(`/${route}`);
    await shot(page, `desktop-ar-dark-${route.replaceAll("/", "-")}.png`);
  }
});

test("review user remainder and light samples", async ({ page }) => {
  await prepare(page);
  await registerUser(page);
  for (const route of ["marketing", "account", "pricing", "benefits"]) {
    await page.goto(`/${route}`);
    await shot(page, `desktop-ar-dark-${route}.png`);
  }
  await page.evaluate(() => {
    localStorage.setItem("jenan-theme", "light");
    document.documentElement.dataset.theme = "light";
  });
  for (const route of [
    "dashboard",
    "software/robotics",
    "funding-eligibility",
  ]) {
    await page.goto(`/${route}`);
    await shot(page, `desktop-ar-light-${route.replaceAll("/", "-")}.png`);
  }
});

test("review admin pages", async ({ page }) => {
  await prepare(page);
  const login = await page.request.post("/api/auth/login", {
    headers: { origin },
    data: {
      email: e2eIdentity.admin.email,
      password: e2eIdentity.admin.password,
      remember: false,
    },
  });
  expect(login.status()).toBe(200);
  for (const route of [
    "admin",
    "admin/data-center",
    "admin/global-health",
    "admin/bounty-hunters",
    "admin/social-growth",
  ]) {
    await page.goto(`/${route}`);
    await shot(page, `desktop-ar-dark-${route.replaceAll("/", "-")}.png`);
  }
  await page.evaluate(() => {
    localStorage.setItem("jenan-theme", "light");
    document.documentElement.dataset.theme = "light";
  });
  await page.goto("/admin/bounty-hunters");
  await shot(page, "desktop-ar-light-admin-bounty-hunters.png");
});

test("review mobile essentials and write manifest", async ({ page }) => {
  await prepare(page);
  await registerUser(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "dashboard",
    "software/robotics",
    "funding-eligibility",
  ]) {
    await page.goto(`/${route}`);
    await shot(page, `mobile-ar-dark-${route.replaceAll("/", "-")}.png`);
  }
  await page.request.post("/api/auth/logout", { headers: { origin } });
  for (const route of ["login", "register"]) {
    await page.goto(`/${route}`);
    await shot(page, `mobile-ar-dark-${route}.png`);
  }
  const images = (await readdir(outputDirectory))
    .filter((file) => file.endsWith(".png"))
    .sort();
  await writeFile(
    path.join(outputDirectory, "README.md"),
    `# Jenan BIZ Visual Review Pack\n\nReview-only screenshots; these are not golden baselines.\n\n${images.map((image) => `- ${image}`).join("\n")}\n`,
    "utf8",
  );
});
