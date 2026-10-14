import { expect, test } from "@playwright/test";
import { cleanE2EIdentities, createE2ESession, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = "http://127.0.0.1:3101";

// Panel links on the pre-login home reach members-only pages: guests sign in first and must come back to the same place.
test.describe.serial("Home service panel links keep their destination", () => {
  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  test("a guest who picks a Market quick filter returns to it after signing in", async ({ context, page }) => {
    await context.addCookies([{ name: "locale", value: "en", url: origin }]);
    await page.goto("/");
    const market = page.locator('.cine__slide[data-state="active"]');
    // A click made before the page has hydrated is lost, and the panels keep rotating; repeat it until it takes effect.
    await expect(async () => {
      await page.locator(".cine__dot").nth(3).click();
      await expect(market).toHaveAttribute("data-panel", "market", { timeout: 1_500 });
    }).toPass({ timeout: 30_000 });
    await market.getByRole("link", { name: "Restaurants & cafés" }).click();
    await expect(page).toHaveURL(/\/auth\?next=%2Fmarket%2Flistings%3Fq%3D/);

    await page.getByLabel("Username or email").fill(e2eIdentity.user.email);
    await page.getByLabel("Password", { exact: true }).fill(e2eIdentity.user.password);
    await Promise.all([
      page.waitForURL(/\/market\/listings\?q=/),
      page.locator(".auth-form button[type=submit]").click(),
    ]);
    await expect(page.getByPlaceholder("Search title or sector")).toHaveValue("مطاعم");
  });

  test("members get the Market and PDF quick filters applied and unsupported values ignored", async ({ context, page }) => {
    const token = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([
      { name: "jenan_session", value: token, url: origin, httpOnly: true, sameSite: "Lax" },
      { name: "locale", value: "en", url: origin },
    ]);

    await page.goto("/market/listings?kind=BUSINESS");
    await expect(page.getByLabel("Listing kind")).toHaveValue("BUSINESS");

    await page.goto("/market/listings?kind=ADMIN&q=cafes");
    await expect(page.getByLabel("Listing kind")).toHaveValue("");
    await expect(page.getByPlaceholder("Search title or sector")).toHaveValue("cafes");

    await page.goto("/market/listings");
    await expect(page.getByLabel("Listing kind")).toHaveValue("");
    await expect(page.getByPlaceholder("Search title or sector")).toHaveValue("");

    await page.goto("/studio/pdf/editor?tool=convert");
    await expect(page.getByLabel("PDF operation")).toHaveValue("convert");
  });
});
