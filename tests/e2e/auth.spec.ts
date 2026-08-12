import { expect, test } from "@playwright/test";
import { e2eIdentity } from "./test-identities";
import { cleanE2EIdentities, queryE2E, seedE2EAdmin } from "./identity-fixture";

test.describe.serial("real authentication and server-side RBAC", () => {
  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EAdmin();
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: "locale", value: "en", url: "http://127.0.0.1:3101" },
    ]);
  });

  test("registers, reaches dashboard, logs out, and invalidates access", async ({
    page,
  }) => {
    const registration = await page.request.post("/api/auth/register", {
      headers: { origin: "http://127.0.0.1:3101" },
      data: {
        displayName: e2eIdentity.user.displayName,
        countryCode: "SA",
        email: e2eIdentity.user.email,
        password: e2eIdentity.user.password,
        locale: "en",
        language: "en",
      },
    });
    expect(
      registration.status(),
      `registration API returned ${registration.status()}`,
    ).toBe(201);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);

    for (const route of [
      "/projects",
      "/academy",
      "/studio",
      "/talent",
      "/market",
      "/software",
      "/marketing",
      "/account",
      "/pricing",
      "/benefits",
    ]) {
      const response = await page.goto(route);
      expect(response?.status(), `${route} should render`).toBe(200);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflow, `${route} should not overflow horizontally`).toBe(false);
    }

    const persisted = await queryE2E<{
      id: string;
      countryCode: string;
      sessionCount: string;
    }>(
      'SELECT u.id, p."countryCode", COUNT(s.id)::text AS "sessionCount" FROM "User" u JOIN "Profile" p ON p."userId" = u.id LEFT JOIN "Session" s ON s."userId" = u.id WHERE u.email = $1 GROUP BY u.id, p."countryCode"',
      [e2eIdentity.user.email],
    );
    expect(persisted.rows[0]?.countryCode).toBe("SA");
    expect(persisted.rows[0]?.sessionCount).toBe("1");

    const logout = await page.request.post("/api/auth/logout", {
      headers: { origin: "http://127.0.0.1:3101" },
    });
    expect(logout.status()).toBe(200);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
    const sessions = await queryE2E<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "Session" WHERE "userId" = $1',
      [persisted.rows[0]?.id],
    );
    expect(sessions.rows[0]?.count).toBe("0");
  });

  test("rejects a wrong password and accepts the correct password", async ({
    page,
  }) => {
    const wrong = await page.request.post("/api/auth/login", {
      headers: { origin: "http://127.0.0.1:3101" },
      data: {
        email: e2eIdentity.user.email,
        password: "Wrong-password-2026!",
        remember: false,
      },
    });
    expect(wrong.status()).toBe(401);
    const correct = await page.request.post("/api/auth/login", {
      headers: { origin: "http://127.0.0.1:3101" },
      data: {
        email: e2eIdentity.user.email,
        password: e2eIdentity.user.password,
        remember: false,
      },
    });
    expect(correct.status()).toBe(200);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("returns 403 for USER access to admin", async ({ page }) => {
    const registration = await page.request.post("/api/auth/register", {
      headers: { origin: "http://127.0.0.1:3101" },
      data: {
        displayName: e2eIdentity.user.displayName,
        countryCode: "SA",
        email: e2eIdentity.user.email,
        password: e2eIdentity.user.password,
        locale: "en",
        language: "en",
      },
    });
    expect([201, 409]).toContain(registration.status());
    const login = await page.request.post("/api/auth/login", {
      headers: { origin: "http://127.0.0.1:3101" },
      data: {
        email: e2eIdentity.user.email,
        password: e2eIdentity.user.password,
        remember: false,
      },
    });
    expect(login.status()).toBe(200);
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(403);
    await expect(page.getByText("Access denied")).toBeVisible();
  });

  test("allows ADMIN access to admin", async ({ page }) => {
    const login = await page.request.post("/api/auth/login", {
      headers: { origin: "http://127.0.0.1:3101" },
      data: {
        email: e2eIdentity.admin.email,
        password: e2eIdentity.admin.password,
        remember: false,
      },
    });
    expect(login.status()).toBe(200);
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(200);
    await expect(page.getByText("Global command center")).toBeVisible();
    for (const route of [
      "/admin/data-center",
      "/admin/global-health",
      "/admin/bounty-hunters",
      "/admin/social-growth",
    ]) {
      const adminResponse = await page.goto(route);
      expect(adminResponse?.status(), `${route} should render`).toBe(200);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflow, `${route} should not overflow horizontally`).toBe(false);
    }
  });

  test("rate limits repeated login and register attempts", async ({ page }) => {
    let loginStatus = 0;
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const response = await page.request.post("/api/auth/login", {
        headers: { origin: "http://127.0.0.1:3101" },
        data: {
          email: e2eIdentity.admin.email,
          password: "Repeated-wrong-password!",
          remember: false,
        },
      });
      loginStatus = response.status();
      if (loginStatus === 429) {
        expect(response.headers()["retry-after"]).toBeTruthy();
        break;
      }
    }
    expect(loginStatus).toBe(429);

    let registerStatus = 0;
    const limitedRegistrationEmail = `e2e.rate.${process.env.E2E_RUN_ID}@example.test`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await page.request.post("/api/auth/register", {
        headers: { origin: "http://127.0.0.1:3101" },
        data: { email: limitedRegistrationEmail },
      });
      registerStatus = response.status();
    }
    expect(registerStatus).toBe(429);
  });
});
