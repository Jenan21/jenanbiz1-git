import { expect, test, type BrowserContext } from "@playwright/test";
import { cleanE2EIdentities, createE2ESession, seedE2EAdmin, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = "http://127.0.0.1:3101";

async function signIn(context: BrowserContext, email: string, locale: "en" | "ar" = "en") {
  await context.addCookies([
    { name: "jenan_session", value: await createE2ESession(email), url: origin, httpOnly: true, sameSite: "Lax" },
    { name: "locale", value: locale, url: origin },
  ]);
}

test.describe.serial("back and home on every member page", () => {
  test.setTimeout(120_000);

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
    await seedE2EAdmin();
  });
  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  test("a member can always get home from a deep page", async ({ context, page }) => {
    await signIn(context, e2eIdentity.user.email);
    for (const path of ["/projects/analysis", "/academy", "/market", "/talent", "/software", "/marketing", "/user/investments"]) {
      await page.goto(path);
      await expect(page.getByTestId("shortcut-home"), path).toBeVisible();
      await page.getByTestId("shortcut-home").click();
      await expect(page, path).toHaveURL(/\/dashboard$/);
    }
    await expect(page.getByTestId("page-shortcuts")).toHaveCount(0);
  });

  test("back returns to the previous page of the platform", async ({ context, page }) => {
    await signIn(context, e2eIdentity.user.email);
    await page.goto("/dashboard");
    await page.locator('.authenticated-home__service[href="/market"]').click();
    await expect(page).toHaveURL(/\/market$/);
    await page.getByTestId("shortcut-back").click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("back on a page opened directly goes to its section, and from the section to the home", async ({ context, page }) => {
    await signIn(context, e2eIdentity.user.email);
    await page.goto("/projects/analysis");
    await page.getByTestId("shortcut-back").click();
    await expect(page).toHaveURL(/\/projects$/);
    await page.goto("/academy");
    await page.getByTestId("shortcut-back").click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("the pages that keep their frozen design get no shortcuts", async ({ page }) => {
    for (const path of ["/", "/login", "/register"]) {
      await page.goto(path);
      await expect(page.getByTestId("page-shortcuts"), path).toHaveCount(0);
    }
  });

  test("only an administrator is offered the way into the administration area", async ({ browser }) => {
    const member = await browser.newContext();
    await signIn(member, e2eIdentity.user.email);
    const memberPage = await member.newPage();
    await memberPage.goto("/projects");
    await expect(memberPage.getByTestId("shortcut-home")).toBeVisible();
    await expect(memberPage.getByTestId("admin-entry-link")).toHaveCount(0);
    await member.close();

    const admin = await browser.newContext();
    await signIn(admin, e2eIdentity.admin.email);
    const adminPage = await admin.newPage();
    await adminPage.goto("/projects");
    await expect(adminPage.getByTestId("admin-entry-link")).toBeVisible();
    await adminPage.getByTestId("admin-entry-link").click();
    await expect(adminPage).toHaveURL(/\/admin$/);
    await expect(adminPage.getByTestId("admin-entry-link")).toHaveCount(0);
    await expect(adminPage.getByTestId("shortcut-back")).toBeVisible();
    await admin.close();
  });

  test("the shortcuts stay inside the screen in Arabic on a phone", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await signIn(context, e2eIdentity.user.email, "ar");
    const page = await context.newPage();
    await page.goto("/projects/analysis");
    const box = await page.getByTestId("page-shortcuts").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await context.close();
  });
});
