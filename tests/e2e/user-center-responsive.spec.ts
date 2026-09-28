import { expect, test } from "@playwright/test";
import { USER_CENTER_ROUTES } from "@/lib/account/user-center-routes";
import {
  cleanE2EIdentities,
  createE2ESession,
  seedE2EUser,
} from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const viewports = [
  { name: "2560x1440", width: 2560, height: 1440 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1024x1366", width: 1024, height: 1366 },
  { name: "820x1180", width: 820, height: 1180 },
  { name: "430x932", width: 430, height: 932 },
  { name: "390x844", width: 390, height: 844 },
  { name: "360x800", width: 360, height: 800 },
] as const;

test.describe.serial("User center responsive acceptance", () => {
  test.setTimeout(120_000);

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  for (const locale of ["ar", "en"] as const) {
    for (const viewport of viewports) {
      test(`${viewport.name} ${locale} keeps all user-center pages responsive`, async ({
        context,
        page,
      }, testInfo) => {
        await page.setViewportSize(viewport);
        const sessionToken = await createE2ESession(e2eIdentity.user.email);
        await context.addCookies([
          { name: "locale", value: locale, url: "http://127.0.0.1:3101" },
          {
            name: "jenan_session",
            value: sessionToken,
            url: "http://127.0.0.1:3101",
            httpOnly: true,
            sameSite: "Lax",
          },
        ]);
        const runtimeErrors: string[] = [];
        page.on("pageerror", (error) => runtimeErrors.push(error.message));

        for (const definition of USER_CENTER_ROUTES) {
          const response = await page.goto(definition.path, {
            waitUntil: "domcontentloaded",
          });
          expect(response?.status(), definition.path).toBe(200);
          if (definition.path !== "/account")
            await expect(page.locator(".user-center-nav")).toBeVisible();
          const contract = page.locator(".user-center-contract");
          await expect(contract).toHaveAttribute(
            "data-user-route",
            definition.path,
          );
          await expect(contract).toHaveAttribute(
            "data-user-screen",
            definition.id,
          );
          await expect(contract).toHaveAttribute(
            "data-user-source",
            definition.source,
          );
          await expect(contract).toHaveAttribute(
            "data-user-outputs",
            definition.outputs,
          );
          await expect(contract).toHaveAttribute(
            "data-user-privacy",
            "USER_SCOPED",
          );
          const layout = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            viewportWidth: document.documentElement.clientWidth,
            clippedButtons: Array.from(
              document.querySelectorAll("button, a.button"),
            ).some((element) => element.scrollWidth > element.clientWidth + 1),
          }));
          expect(layout.scrollWidth, definition.path).toBeLessThanOrEqual(
            layout.viewportWidth + 1,
          );
          expect(layout.clippedButtons, definition.path).toBe(false);
        }

        await page.goto("/user");
        await expect(page.locator(".account-overview__account")).toBeVisible();
        await expect(
          page.locator(".account-overview__investment"),
        ).toBeVisible();
        await expect(page.locator(".account-overview__services")).toBeVisible();
        await expect(
          page.locator(".account-overview__notifications"),
        ).toBeVisible();
        await expect(page.locator(".account-overview__activity")).toBeVisible();

        await page.goto("/user/investment/detail");
        await expect(
          page.locator(".user-investment-detail__performance"),
        ).toBeVisible();
        await expect(
          page.locator(".user-investment-detail__documents"),
        ).toBeVisible();
        await expect(
          page.locator(".user-investment-detail__report button:disabled"),
        ).toHaveCount(4);

        await page.goto("/user/unlocks");
        await expect(page.locator(".community-access__summary")).toBeVisible();
        await expect(
          page.locator(".community-access__summary article"),
        ).toHaveCount(3);

        await page.goto("/user/payments");
        await expect(
          page.locator(".user-finance__summary article"),
        ).toHaveCount(4);
        await expect(page.locator(".user-payments-panel")).toBeVisible();

        await page.goto("/user/payments/invoice");
        await expect(page.locator(".user-invoice__sheet")).toBeVisible();
        await expect(page.locator(".user-invoice__outputs")).toBeVisible();

        await page.goto("/user/reports");
        await expect(
          page.locator(".user-reports__summary article"),
        ).toHaveCount(4);
        await expect(
          page.locator(".user-report-library > section"),
        ).toHaveCount(5);
        await expect(
          page.locator(".user-report-library__activity"),
        ).toBeVisible();

        await page.goto("/user/investments");
        await expect(
          page.getByText(locale === "ar" ? "غير متوفر" : "Unavailable").first(),
        ).toBeVisible();
        await expect(
          page.locator(".user-investments__performance"),
        ).toBeVisible();
        await expect(
          page.locator(".user-investments__allocation"),
        ).toBeVisible();
        await expect(page.locator(".user-investments__export")).toBeDisabled();
        if (["1440x900", "820x1180", "390x844"].includes(viewport.name)) {
          await testInfo.attach(`user-center-${viewport.name}-${locale}`, {
            body: await page.screenshot({
              animations: "disabled",
              fullPage: true,
            }),
            contentType: "image/png",
          });
        }
        expect(runtimeErrors).toEqual([]);
      });
    }
  }
});
