import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { cleanE2EIdentities, seedE2EAdmin } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const outputDirectory = path.resolve("outputs/visual-review-pack");
const desktopUserRoutes = [
  "dashboard",
  "projects",
  "academy",
  "studio",
  "talent",
  "market",
  "software",
  "software/robotics",
  "funding-eligibility",
  "marketing",
  "account",
  "pricing",
  "benefits",
];
const desktopAdminRoutes = [
  "admin",
  "admin/data-center",
  "admin/global-health",
  "admin/bounty-hunters",
  "admin/social-growth",
];

test("creates the Arabic visual review pack without baselines", async ({
  page,
}) => {
  await mkdir(outputDirectory, { recursive: true });
  await cleanE2EIdentities();
  await seedE2EAdmin();
  await page
    .context()
    .addCookies([
      { name: "locale", value: "ar", url: "http://127.0.0.1:3101" },
    ]);
  await page.addInitScript(() =>
    localStorage.setItem("jenan-theme", "balanced-dark"),
  );

  const registration = await page.request.post("/api/auth/register", {
    headers: { origin: "http://127.0.0.1:3101" },
    data: {
      displayName: e2eIdentity.user.displayName,
      countryCode: "SA",
      email: e2eIdentity.user.email,
      password: e2eIdentity.user.password,
      locale: "ar",
      language: "ar",
    },
  });
  expect(registration.status()).toBe(201);
  const images: string[] = [];
  for (const route of desktopUserRoutes) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/${route}`);
    const name = `desktop-ar-dark-${route.replaceAll("/", "-")}.png`;
    await page.screenshot({
      path: path.join(outputDirectory, name),
      fullPage: true,
    });
    images.push(name);
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
    const name = `desktop-ar-light-${route.replaceAll("/", "-")}.png`;
    await page.screenshot({
      path: path.join(outputDirectory, name),
      fullPage: true,
    });
    images.push(name);
  }

  await page.request.post("/api/auth/logout", {
    headers: { origin: "http://127.0.0.1:3101" },
  });
  const adminLogin = await page.request.post("/api/auth/login", {
    headers: { origin: "http://127.0.0.1:3101" },
    data: {
      email: e2eIdentity.admin.email,
      password: e2eIdentity.admin.password,
      remember: false,
    },
  });
  expect(adminLogin.status()).toBe(200);
  await page.evaluate(() => {
    localStorage.setItem("jenan-theme", "balanced-dark");
    document.documentElement.dataset.theme = "balanced-dark";
  });
  for (const route of desktopAdminRoutes) {
    await page.goto(`/${route}`);
    const name = `desktop-ar-dark-${route.replaceAll("/", "-")}.png`;
    await page.screenshot({
      path: path.join(outputDirectory, name),
      fullPage: true,
    });
    images.push(name);
  }
  await page.evaluate(() => {
    localStorage.setItem("jenan-theme", "light");
    document.documentElement.dataset.theme = "light";
  });
  await page.goto("/admin/bounty-hunters");
  await page.screenshot({
    path: path.join(
      outputDirectory,
      "desktop-ar-light-admin-bounty-hunters.png",
    ),
    fullPage: true,
  });
  images.push("desktop-ar-light-admin-bounty-hunters.png");

  await page.request.post("/api/auth/logout", {
    headers: { origin: "http://127.0.0.1:3101" },
  });
  const userLogin = await page.request.post("/api/auth/login", {
    headers: { origin: "http://127.0.0.1:3101" },
    data: {
      email: e2eIdentity.user.email,
      password: e2eIdentity.user.password,
      remember: false,
    },
  });
  expect(userLogin.status()).toBe(200);
  await page.evaluate(() => {
    localStorage.setItem("jenan-theme", "balanced-dark");
    document.documentElement.dataset.theme = "balanced-dark";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "dashboard",
    "software/robotics",
    "funding-eligibility",
  ]) {
    await page.goto(`/${route}`);
    const name = `mobile-ar-dark-${route.replaceAll("/", "-")}.png`;
    await page.screenshot({
      path: path.join(outputDirectory, name),
      fullPage: true,
    });
    images.push(name);
  }
  await page.request.post("/api/auth/logout", {
    headers: { origin: "http://127.0.0.1:3101" },
  });
  for (const route of ["login", "register"]) {
    await page.goto(`/${route}`);
    const name = `mobile-ar-dark-${route}.png`;
    await page.screenshot({
      path: path.join(outputDirectory, name),
      fullPage: true,
    });
    images.push(name);
  }

  await writeFile(
    path.join(outputDirectory, "README.md"),
    `# Jenan BIZ Visual Review Pack\n\nReview-only screenshots; these are not golden baselines.\n\n${images.map((image) => `- ${image}`).join("\n")}\n`,
    "utf8",
  );
  await cleanE2EIdentities();
});
