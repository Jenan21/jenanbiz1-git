import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { cleanE2EIdentities } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = "http://127.0.0.1:3101";
const output = path.resolve("outputs/refinement-review-pack");
async function screenshot(page: Page, route: string, name: string) {
  await page.goto(route);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({ path: path.join(output, name), fullPage: true });
}

test("captures the seven refinement review images without baselines", async ({
  page,
}) => {
  await mkdir(output, { recursive: true });
  await cleanE2EIdentities();
  await page.addInitScript(() => {
    if (!localStorage.getItem("jenan-theme"))
      localStorage.setItem("jenan-theme", "balanced-dark");
  });
  await page
    .context()
    .addCookies([{ name: "locale", value: "ar", url: origin }]);
  const registration = await page.request.post("/api/auth/register", {
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
  expect(registration.status()).toBe(201);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await screenshot(page, "/funding-eligibility", "finance-desktop-ar-dark.png");
  await screenshot(page, "/software/robotics", "robotics-desktop-ar-dark.png");
  await screenshot(
    page,
    "/software/robotics/restro-bot",
    "robot-detail-desktop-ar-dark.png",
  );
  await page.evaluate(() => {
    localStorage.setItem("jenan-theme", "light");
    document.documentElement.dataset.theme = "light";
  });
  await screenshot(
    page,
    "/funding-eligibility",
    "finance-desktop-ar-light.png",
  );
  await screenshot(page, "/software/robotics", "robotics-desktop-ar-light.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    localStorage.setItem("jenan-theme", "balanced-dark");
    document.documentElement.dataset.theme = "balanced-dark";
  });
  await screenshot(page, "/funding-eligibility", "finance-mobile-ar.png");
  await screenshot(page, "/software/robotics", "robotics-mobile-ar.png");
  await cleanE2EIdentities();
});
