import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { cleanE2EIdentities, createE2ESession, seedE2EAdmin, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = "http://127.0.0.1:3101";

// Pages with the shared header carry Back and Home there; the others get the floating shortcuts.
const back = (page: Page) => page.locator('[data-testid="header-back"]:visible, [data-testid="shortcut-back"]:visible');
const home = (page: Page) => page.locator('.jenan-header__brand:visible, [data-testid="shortcut-home"]:visible');
const adminEntry = (page: Page) => page.locator('[data-testid="admin-entry-link"]:visible, [data-testid="home-admin-link"]:visible');

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
      await expect(home(page), path).toBeVisible();
      await home(page).click();
      await expect(page, path).toHaveURL(/\/dashboard$/);
    }
    await expect(page.getByTestId("page-shortcuts")).toHaveCount(0);
  });

  test("back returns to the previous page of the platform", async ({ context, page }) => {
    await signIn(context, e2eIdentity.user.email);
    await page.goto("/dashboard");
    await page.locator('.authenticated-home__service[href="/market"]').click();
    await expect(page).toHaveURL(/\/market$/);
    await back(page).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("back on a page opened directly goes to its section, and from the section to the home", async ({ context, page }) => {
    await signIn(context, e2eIdentity.user.email);
    await page.goto("/projects/analysis");
    await back(page).click();
    await expect(page).toHaveURL(/\/projects$/);
    await page.goto("/academy");
    await back(page).click();
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
    await expect(home(memberPage)).toBeVisible();
    await expect(adminEntry(memberPage)).toHaveCount(0);
    await member.close();

    const admin = await browser.newContext();
    await signIn(admin, e2eIdentity.admin.email);
    const adminPage = await admin.newPage();
    await adminPage.goto("/projects");
    await expect(adminEntry(adminPage)).toBeVisible();
    await adminEntry(adminPage).click();
    await expect(adminPage).toHaveURL(/\/admin$/);
    await expect(adminEntry(adminPage)).toHaveCount(0);
    await expect(back(adminPage)).toBeVisible();
    await admin.close();
  });

  test("the shortcuts and the header stay inside the screen in Arabic on a phone", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await signIn(context, e2eIdentity.user.email, "ar");
    const page = await context.newPage();
    await page.goto("/academy/courses");
    const header = await page.getByTestId("jenan-header").boundingBox();
    expect(header).not.toBeNull();
    expect(header!.x).toBeGreaterThanOrEqual(0);
    expect(header!.x + header!.width).toBeLessThanOrEqual(360);
    await expect(page.getByTestId("header-back")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

    await page.goto("/studio");
    const shortcuts = page.getByTestId("page-shortcuts");
    if (await shortcuts.isVisible()) {
      const box = await shortcuts.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    }
    await context.close();
  });
});
