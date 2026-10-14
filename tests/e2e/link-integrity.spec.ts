import { test } from "@playwright/test";
import { crawl, expectNoFindings, origin } from "./crawler";
import { cleanE2EIdentities, createE2ESession, seedE2EAdmin, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

test.describe.serial("link integrity of the signed-in application", () => {
  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
    await seedE2EAdmin();
  });
  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  test("every internal link a member can reach opens a working page", async ({ context, page }, testInfo) => {
    test.setTimeout(25 * 60_000);
    await context.addCookies([
      { name: "jenan_session", value: await createE2ESession(e2eIdentity.user.email), url: origin, httpOnly: true, sameSite: "Lax" },
      { name: "locale", value: "en", url: origin },
    ]);
    const { visited, findings } = await crawl(
      page,
      ["/dashboard", "/projects", "/academy", "/market", "/talent", "/marketing", "/studio", "/software", "/programs", "/account", "/pricing", "/benefits"],
      140,
      true,
    );
    await testInfo.attach("visited-pages.txt", { body: visited.join("\n"), contentType: "text/plain" });
    test.expect(visited.length, "the crawl must actually reach pages").toBeGreaterThan(40);
    expectNoFindings(findings);
  });

  test("every internal link an administrator can reach opens a working page", async ({ context, page }, testInfo) => {
    test.setTimeout(15 * 60_000);
    await context.addCookies([
      { name: "jenan_session", value: await createE2ESession(e2eIdentity.admin.email), url: origin, httpOnly: true, sameSite: "Lax" },
      { name: "locale", value: "en", url: origin },
    ]);
    const { visited, findings } = await crawl(page, ["/admin", "/admin/dashboard", "/admin/users", "/admin/academy", "/admin/operations"], 70, true);
    await testInfo.attach("visited-admin-pages.txt", { body: visited.join("\n"), contentType: "text/plain" });
    test.expect(visited.length).toBeGreaterThan(10);
    expectNoFindings(findings);
  });
});
