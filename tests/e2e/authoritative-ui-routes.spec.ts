import { expect, test } from "@playwright/test";

import { AUTHORITATIVE_UI_ROUTES } from "@/lib/platform/authoritative-ui-routes";
import { cleanE2EIdentities, createE2ESession, seedE2EAdmin, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = "http://127.0.0.1:3101";
const redirectedLegacyRoutes = new Set(["/home", "/admin/ai", "/admin/agents", "/admin/health"]);
const removedFundingRoutes = [
  "/funding", "/funding/readiness", "/funding/result", "/funding/company",
  "/funding/opportunities", "/funding/advisor", "/funding/report", "/funding-eligibility", "/api/funding",
] as const;

test.describe.serial("authoritative 152-screen route acceptance", () => {
  test.setTimeout(600_000);

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
    await seedE2EAdmin();
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  test("serves every active reference and keeps Funding removed", async ({ browser }) => {
    const [userToken, adminToken] = await Promise.all([
      createE2ESession(e2eIdentity.user.email),
      createE2ESession(e2eIdentity.admin.email),
    ]);
    const userContext = await browser.newContext();
    const adminContext = await browser.newContext();
    await userContext.addCookies([{ name: "jenan_session", value: userToken, url: origin }]);
    await adminContext.addCookies([{ name: "jenan_session", value: adminToken, url: origin }]);

    for (const definition of AUTHORITATIVE_UI_ROUTES) {
      const request = definition.section === "admin" ? adminContext.request : userContext.request;
      const response = await request.get(definition.path, { maxRedirects: 0 });
      const expectedStatus = redirectedLegacyRoutes.has(definition.path) ? 307 : 200;
      expect(response.status(), `${definition.section}: ${definition.path}`).toBe(expectedStatus);
    }

    for (const path of removedFundingRoutes) {
      const response = await userContext.request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(404);
    }

    await userContext.close();
    await adminContext.close();
  });
});