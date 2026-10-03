import { expect, test, type APIRequestContext } from "@playwright/test";
import { e2eIdentity } from "./test-identities";
import {
  cleanE2EIdentities,
  createE2ESession,
  queryE2E,
  seedE2EAdmin,
  seedE2EUser,
} from "./identity-fixture";

const canonicalFlowEmail = `e2e.user.auth-flow.${process.env.E2E_RUN_ID}@example.test`;
const canonicalFlowPassword = "Canonical-Auth-2026!";
const canonicalFlowReplacement = "Canonical-Auth-Reset-2026!";

test.describe.serial("account security HTTP boundaries", () => {
  test.setTimeout(90_000);
  const origin =
    process.env.PLAYWRIGHT_BASE_URL ??
    `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3101"}`;
  const otherEmail = `e2e.user.security-other.${process.env.E2E_RUN_ID}@example.test`;
  let owner: APIRequestContext;
  let other: APIRequestContext;
  let anonymous: APIRequestContext;
  let token: string;
  let projectId: string;
  let organizationId: string;
  let fileId: string;

  test.beforeAll(async ({ playwright }) => {
    await cleanE2EIdentities();
    await seedE2EUser();
    await queryE2E(
      'INSERT INTO "User" (id, email, status, "systemRole", "createdAt", "updatedAt") VALUES ($1, $2, \'ACTIVE\', \'USER\', NOW(), NOW())',
      [crypto.randomUUID(), otherEmail],
    );
    token = await createE2ESession(e2eIdentity.user.email);
    owner = await playwright.request.newContext({
      baseURL: origin,
      extraHTTPHeaders: { origin, cookie: `jenan_session=${token}` },
    });
    other = await playwright.request.newContext({
      baseURL: origin,
      extraHTTPHeaders: {
        origin,
        cookie: `jenan_session=${await createE2ESession(otherEmail)}`,
      },
    });
    anonymous = await playwright.request.newContext({ baseURL: origin });
    const identity = await queryE2E<{ id: string }>(
      'SELECT id FROM "User" WHERE email = $1',
      [e2eIdentity.user.email],
    );
    const otherIdentity = await queryE2E<{ id: string }>(
      'SELECT id FROM "User" WHERE email = $1',
      [otherEmail],
    );
    organizationId = crypto.randomUUID();
    await queryE2E(
      'INSERT INTO "Organization" (id, name, slug, "updatedAt") VALUES ($1, $2, $3, NOW())',
      [organizationId, "Security organization", `security-${organizationId}`],
    );
    for (const [userId, isOwner] of [
      [identity.rows[0]!.id, true],
      [otherIdentity.rows[0]!.id, false],
    ] as const) {
      await queryE2E(
        'INSERT INTO "OrganizationMember" (id, "organizationId", "userId", status, "isOwner", "updatedAt") VALUES ($1, $2, $3, \'ACTIVE\', $4, NOW())',
        [crypto.randomUUID(), organizationId, userId, isOwner],
      );
    }
    await queryE2E(
      'INSERT INTO "SoftwareEmployee" (id, "organizationId", "employeeNumber", name, "roleTitle", "salaryMinor", "hiredAt", "createdById", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, NOW())',
      [
        crypto.randomUUID(),
        organizationId,
        "SEC-1",
        "Private employee",
        "Private role",
        987654,
        identity.rows[0]!.id,
      ],
    );
    projectId = crypto.randomUUID();
    await queryE2E(
      'INSERT INTO "Project" (id, name, slug, "createdById", "updatedAt") VALUES ($1, $2, $3, $4, NOW())',
      [
        projectId,
        "Private security project",
        `security-${projectId}`,
        identity.rows[0]!.id,
      ],
    );
    await queryE2E('UPDATE "Project" SET "organizationId" = $1 WHERE id = $2', [
      organizationId,
      projectId,
    ]);
  });

  test.afterAll(async () => {
    if (fileId) await owner.delete(`/api/files/${fileId}`);
    await Promise.all([
      owner?.dispose(),
      other?.dispose(),
      anonymous?.dispose(),
    ]);
    await cleanE2EIdentities();
  });

  test("rejects missing origins and unauthenticated exports without caching error responses", async () => {
    for (const route of [
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/forgot",
      "/api/auth/logout",
    ]) {
      const response = await anonymous.post(route, { data: {} });
      expect(response.status(), route).toBe(403);
      expect(response.headers()["cache-control"], route).toContain("no-store");
    }
    for (const route of [
      "/api/account/overview",
      "/api/files",
      `/api/files/${projectId}`,
      `/api/projects/${projectId}/report`,
      "/api/talent/report",
      "/api/software/operations",
    ]) {
      const response = await anonymous.get(route);
      expect(response.status(), route).toBe(401);
      expect(response.headers()["cache-control"], route).toContain("no-store");
    }
    const onboarding = await owner.post("/api/account/onboarding", {
      headers: { origin: "https://attacker.test" },
      data: {},
    });
    expect(onboarding.status()).toBe(403);
  });

  test("keeps encoded external next destinations inside the application", async ({
    page,
  }) => {
    await page
      .context()
      .addCookies([{ name: "locale", value: "en", url: origin }]);
    for (const next of ["/%5Cattacker.example/login", "/a/..//attacker.example/login"]) {
      await page.goto(`/auth?next=${next}`);
      await page.getByLabel("Email address").fill(e2eIdentity.user.email);
      await page.getByLabel("Password", { exact: true }).fill(e2eIdentity.user.password);
      await Promise.all([
        page.waitForURL(`${origin}/dashboard`),
        page.getByRole("button", { name: "Sign in", exact: true }).click(),
      ]);
      expect(new URL(page.url()).origin).toBe(origin);
      const cookie = (await page.context().cookies()).find(({ name }) => name === "jenan_session");
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
      expect((await page.request.post("/api/auth/logout", { headers: { origin } })).status()).toBe(200);
    }
  });

  test("prevents cross-account project downloads and file mutations", async () => {
    const upload = await owner.post("/api/files", {
      multipart: {
        file: {
          name: "private.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("Private security file"),
        },
      },
    });
    expect(upload.status()).toBe(201);
    fileId = (await upload.json()).file.id;
    const ownFile = await owner.get(`/api/files/${fileId}`);
    expect(ownFile.status()).toBe(200);
    expect(ownFile.headers()["cache-control"]).toContain("no-store");
    expect(ownFile.headers()["x-content-type-options"]).toBe("nosniff");
    expect(await ownFile.text()).toBe("Private security file");
    for (const route of [
      `/api/files/${fileId}`,
      `/api/projects/${projectId}`,
      `/api/projects/${projectId}/report`,
    ]) {
      const response = await other.get(route);
      expect(response.status(), route).toBe(404);
      expect(response.headers()["cache-control"], route).toContain("no-store");
    }
    expect((await other.delete(`/api/files/${fileId}`)).status()).toBe(404);
    expect(
      (
        await owner.delete(`/api/files/${fileId}`, {
          headers: { origin: "https://attacker.test" },
        })
      ).status(),
    ).toBe(403);
    expect((await owner.get(`/api/files/${fileId}`)).status()).toBe(200);
    const foreignUpload = await other.post("/api/files", {
      multipart: {
        projectId,
        file: {
          name: "foreign.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("Forbidden"),
        },
      },
    });
    expect(foreignUpload.status()).toBe(422);
    const files = await other.get("/api/files");
    expect(
      (await files.json()).files.some(
        (file: { id: string }) => file.id === fileId,
      ),
    ).toBe(false);
    const overview = await other.get("/api/account/overview");
    expect(JSON.stringify(await overview.json())).not.toContain(projectId);
    const ownProject = await owner.get(`/api/projects/${projectId}`);
    expect(ownProject.status()).toBe(200);
    expect(JSON.stringify(await ownProject.json())).not.toContain(
      '"passwordHash":',
    );
    expect(
      (await owner.get("/api/talent/report")).headers()["cache-control"],
    ).toContain("no-store");
    const workspace = await other.get(
      `/api/software/operations?organizationId=${organizationId}`,
    );
    expect(workspace.status()).toBe(200);
    const data = await workspace.json();
    expect(data.workspace.hr.employees).toEqual([]);
    expect(data.workspace.hr.payrollRuns).toEqual([]);
    expect(data.workspace.operations.projects).toEqual([]);
    expect(JSON.stringify(data)).not.toContain('"passwordHash":');
    const ownWorkspace = await owner.get(
      `/api/software/operations?organizationId=${organizationId}`,
    );
    expect(
      (await ownWorkspace.json()).workspace.hr.employees[0].salaryMinor,
    ).toBe(987654);
  });

  test("rejects MIME/size violations and invalidates the actual session on logout", async () => {
    for (const file of [
      {
        name: "unsafe.html",
        mimeType: "text/html",
        buffer: Buffer.from("<script>alert(1)</script>"),
      },
      {
        name: "spoofed.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("<html>not a PDF</html>"),
      },
      {
        name: "spoofed.png",
        mimeType: "image/png",
        buffer: Buffer.from("not an image"),
      },
      { name: "empty.txt", mimeType: "text/plain", buffer: Buffer.alloc(0) },
      {
        name: "large.txt",
        mimeType: "text/plain",
        buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
      },
    ]) {
      expect(
        (await owner.post("/api/files", { multipart: { file } })).status(),
      ).toBe(422);
    }
    if (fileId) {
      expect((await owner.delete(`/api/files/${fileId}`)).status()).toBe(204);
      fileId = "";
    }
    expect((await owner.post("/api/auth/logout")).status()).toBe(200);
    const revoked = await owner.get("/api/account/overview");
    expect(revoked.status()).toBe(401);
    expect(revoked.headers()["cache-control"]).toContain("no-store");
  });
});

test.describe.serial("real authentication and server-side RBAC", () => {
  test.setTimeout(90_000);

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
        phone: "+966501234567",
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
    await expect(page.locator(".authenticated-home")).toHaveAttribute(
      "data-dashboard-source",
      "AUTHENTICATED_PLATFORM",
    );
    await expect(page.locator(".authenticated-home__service")).toHaveCount(6);

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
      phone: string;
      sessionCount: string;
    }>(
      'SELECT u.id, p."countryCode", p."phone", COUNT(s.id)::text AS "sessionCount" FROM "User" u JOIN "Profile" p ON p."userId" = u.id LEFT JOIN "Session" s ON s."userId" = u.id WHERE u.email = $1 GROUP BY u.id, p."countryCode", p."phone"',
      [e2eIdentity.user.email],
    );
    expect(persisted.rows[0]?.countryCode).toBe("SA");
    expect(persisted.rows[0]?.phone).toBe("+966501234567");
    expect(persisted.rows[0]?.sessionCount).toBe("1");

    const logout = await page.request.post("/api/auth/logout", {
      headers: { origin: "http://127.0.0.1:3101" },
    });
    expect(logout.status()).toBe(200);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/auth\?next=%2Fdashboard$/);
    const sessions = await queryE2E<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "Session" WHERE "userId" = $1',
      [persisted.rows[0]?.id],
    );
    expect(sessions.rows[0]?.count).toBe("0");
  });

  test("completes the canonical visual authentication journey", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await Promise.all([
      page.waitForURL(/\/register$/),
      page.locator('.global-home__hero-actions a[href="/register"]').click(),
    ]);

    await page.getByLabel("Full name").fill("Canonical Auth User");
    await page.getByLabel("Email address").fill(canonicalFlowEmail);
    await page.getByLabel("Country code").selectOption("SA");
    await page
      .getByLabel("Password", { exact: true })
      .fill(canonicalFlowPassword);
    await page.getByLabel("Confirm password").fill(canonicalFlowPassword);
    await page.getByText("View terms of use", { exact: true }).click();
    await expect(
      page.getByText("I agree to provide accurate information", {
        exact: false,
      }),
    ).toBeVisible();
    await page.getByLabel("I accept the terms and conditions").check();
    await Promise.all([
      page.waitForURL(/\/user\/onboarding$/),
      page.getByRole("button", { name: "Create account", exact: true }).click(),
    ]);

    await page.getByLabel("Account type").selectOption("INDIVIDUAL");
    await page.getByLabel("Country code").fill("SA");
    await page.getByLabel("City").fill("Riyadh");
    await page.getByLabel("Projects").check();
    await page.getByLabel("Academy").check();
    await Promise.all([
      page.waitForURL(/\/dashboard$/),
      page.getByRole("button", { name: "Save and continue" }).click(),
    ]);
    await expect(page.locator(".user-chip")).toContainText(
      "Canonical Auth User",
    );
    await expect(page.locator(".authenticated-home")).toBeVisible();

    await Promise.all([
      page.waitForURL(/\/auth$/),
      page.getByRole("button", { name: "Logout", exact: true }).click(),
    ]);
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/auth\/forgot$/);
    await page.getByLabel("Email address").fill(canonicalFlowEmail);
    await page.getByRole("button", { name: "Send verification code" }).click();
    await expect(page.locator(".auth-workflow__dev-code output")).toHaveText(
      /^\d{6}$/,
      { timeout: 15_000 },
    );
    await page.getByLabel("New password").fill(canonicalFlowReplacement);
    await page.getByLabel("Confirm password").fill(canonicalFlowReplacement);
    await page.getByRole("button", { name: "Confirm password" }).click();
    await page.waitForURL(/\/auth\?reset=success$/);
    await expect(page.getByRole("status")).toContainText(
      "Your password was updated",
    );

    await page.getByLabel("Email address").fill(canonicalFlowEmail);
    await page
      .getByLabel("Password", { exact: true })
      .fill(canonicalFlowReplacement);
    await page.getByLabel("Remember me").check();
    await Promise.all([
      page.waitForURL(/\/dashboard$/),
      page.getByRole("button", { name: "Sign in", exact: true }).click(),
    ]);
    const remembered = await queryE2E<{ expiresAt: Date }>(
      'SELECT MAX(s."expiresAt") AS "expiresAt" FROM "Session" s JOIN "User" u ON u.id = s."userId" WHERE u.email = $1',
      [canonicalFlowEmail],
    );
    expect(new Date(remembered.rows[0]!.expiresAt).getTime()).toBeGreaterThan(
      Date.now() + 29 * 24 * 60 * 60 * 1000,
    );

    await Promise.all([
      page.waitForURL(/\/auth$/),
      page.getByRole("button", { name: "Logout", exact: true }).click(),
    ]);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/auth\?next=%2Faccount$/);
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
        phone: "+966501234567",
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

  test("rejects cross-origin authentication mutations", async ({ page }) => {
    const requests = [
      [
        "/api/auth/login",
        {
          email: "user@example.test",
          password: "Password-2026!",
          remember: false,
        },
      ],
      [
        "/api/auth/register",
        {
          displayName: "User",
          countryCode: "SA",
          phone: "+966501234567",
          email: "user@example.test",
          password: "Password-2026!",
          locale: "en",
          language: "en",
        },
      ],
      ["/api/auth/forgot", { action: "request", email: "user@example.test" }],
      ["/api/auth/logout", undefined],
    ] as const;
    for (const [route, data] of requests) {
      const response = await page.request.post(route, {
        data,
        headers: { origin: "https://malicious.example.test" },
      });
      expect(response.status(), route).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: "INVALID_ORIGIN",
      });
    }
    const spoofedProxy = await page.request.post("/api/auth/login", {
      data: {
        email: "user@example.test",
        password: "Password-2026!",
        remember: false,
      },
      headers: {
        origin: "https://malicious.example.test",
        "x-forwarded-host": "malicious.example.test",
        "x-forwarded-proto": "https",
      },
    });
    expect(spoofedProxy.status()).toBe(403);
  });

  test("rate limits repeated password recovery requests", async ({ page }) => {
    const email = `e2e.recovery.limit.${process.env.E2E_RUN_ID}@example.test`;
    let status = 0;
    let retryAfter: string | undefined;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await page.request.post("/api/auth/forgot", {
        headers: { origin: "http://127.0.0.1:3101" },
        data: { action: "request", email },
      });
      status = response.status();
      retryAfter = response.headers()["retry-after"];
      if (status === 429) break;
    }
    expect(status).toBe(429);
    expect(retryAfter).toBeTruthy();
  });

  test("rate limits repeated login and register attempts", async ({ page }) => {
    let loginStatus = 0;
    const limitedLoginEmail = `e2e.login.limit.${process.env.E2E_RUN_ID}@example.test`;
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const response = await page.request.post("/api/auth/login", {
        headers: { origin: "http://127.0.0.1:3101" },
        data: {
          email: limitedLoginEmail,
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
