import { expect, test } from "@playwright/test";
import { cleanE2EIdentities, queryE2E, seedE2EAdmin } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3101"}`;
const adminRoutes = [
  "/admin",
  "/admin/operations",
  "/admin/dashboard",
  "/admin/academy",
  "/admin/branches",
  "/admin/users",
  "/admin/robots",
  "/admin/committee",
  "/admin/decisions",
  "/admin/reports",
  "/admin/finance",
  "/admin/robot-knowledge",
  "/admin/intel",
  "/admin/data-center",
  "/admin/global-health",
  "/admin/bounty-hunters",
  "/admin/social-growth",
] as const;
const adminApiRoutes = [
  "/api/admin/summary",
  "/api/admin/platform",
  "/api/admin/dashboard",
  "/api/admin/operations",
  "/api/admin/academy",
  "/api/admin/branches",
  "/api/admin/users",
  "/api/admin/robots",
  "/api/admin/committee",
  "/api/admin/decisions",
  "/api/admin/reports",
  "/api/admin/finance",
  "/api/admin/intel",
  "/api/admin/data-center",
  "/api/admin/global-health",
  "/api/admin/bounty",
  "/api/admin/social-growth",
] as const;

test.describe("admin control panel acceptance", () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await cleanE2EIdentities();
    await seedE2EAdmin();
    const response = await page.request.post("/api/auth/login", {
      headers: { origin },
      data: {
        email: e2eIdentity.admin.email,
        password: e2eIdentity.admin.password,
        remember: false,
      },
    });
    expect(response.status()).toBe(200);
  });

  test.afterEach(async () => {
    await cleanE2EIdentities();
  });

  test("loads every primary admin route without auth or server errors", async ({
    page,
  }) => {
    const serverErrors: string[] = [];
    const browserErrors: string[] = [];
    const consoleErrors: string[] = [];
    let currentRoute = "";
    page.on("response", (response) => {
      if (response.status() >= 500) {
        serverErrors.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" || message.text().includes("same key")) {
        consoleErrors.push(`${currentRoute}: ${message.text()}`);
        console.log(`ADMIN_CONSOLE_WARNING ${currentRoute}: ${message.text()}`);
      }
    });

    for (const route of adminRoutes) {
      currentRoute = route;
      test.info().annotations.push({ type: "route", description: route });
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status(), `${route} page response`).toBeLessThan(400);
      expect(page.url(), `${route} must remain accessible to an admin`).not.toContain(
        "/login",
      );
      await expect(page.locator(".admin-shell")).toBeVisible();
      await expect(page.locator("main")).toBeVisible();
    }

    expect(serverErrors, "admin routes must not expose server errors").toEqual([]);
    expect(browserErrors, "admin routes must not expose browser errors").toEqual([]);
    expect(consoleErrors, "admin routes must not expose console errors").toEqual([]);
  });

  test("rejects the same routes for an unauthenticated browser", async ({
    page,
  }) => {
    await page.request.post("/api/auth/logout", { headers: { origin } });

    for (const route of adminRoutes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(page.url(), `${route} must require authentication`).toContain("/login");
    }
  });

  test("protects and serves every primary admin data API", async ({ page }) => {
    await page.request.post("/api/auth/logout", { headers: { origin } });

    for (const route of adminApiRoutes) {
      const response = await page.request.get(route);
      expect(response.status(), `${route} unauthenticated status`).toBe(403);
    }

    const login = await page.request.post("/api/auth/login", {
      headers: { origin },
      data: {
        email: e2eIdentity.admin.email,
        password: e2eIdentity.admin.password,
        remember: false,
      },
    });
    expect(login.status()).toBe(200);

    for (const route of adminApiRoutes) {
      const response = await page.request.get(route);
      expect(response.status(), `${route} admin status`).toBe(200);
      const payload = await response.json();
      expect(payload.success, `${route} response contract`).toBe(true);
    }

    for (const [route, collection] of [
      ["/api/admin/users", "users"],
      ["/api/admin/committee", "reviews"],
      ["/api/admin/decisions", "tasks"],
      ["/api/admin/branches", "branches"],
    ]) {
      const response = await page.request.get(`${route}?limit=1&offset=0`);
      expect(response.status(), `${route} pagination status`).toBe(200);
      const payload = await response.json() as {
        pagination: { total: number; limit: number; offset: number; hasMore: boolean };
        [key: string]: unknown;
      };
      expect(payload.pagination).toMatchObject({ limit: 1, offset: 0 });
      expect(Array.isArray(payload[collection])).toBe(true);
      expect((payload[collection] as unknown[]).length).toBeLessThanOrEqual(1);
    }

    const boundedPage = await page.request.get("/api/admin/users?limit=1000&offset=-1");
    expect((await boundedPage.json()).pagination).toMatchObject({ limit: 100, offset: 0 });

    const robots = await page.request.get("/api/admin/dashboard?limit=1&offset=0");
    expect(robots.status()).toBe(200);
    const robotPayload = await robots.json() as {
      summary: { dailyGeneration: number; pagination: { limit: number; offset: number } };
    };
    expect(robotPayload.summary.pagination).toMatchObject({ limit: 1, offset: 0 });
    expect(robotPayload.summary.dailyGeneration).toBeGreaterThanOrEqual(0);
  });

  test("validates and executes admin mutations safely", async ({ page }) => {
    await page.request.post("/api/auth/logout", { headers: { origin } });
    const unauthenticatedRobot = await page.request.post("/api/admin/robots", {
      headers: { origin, "Content-Type": "application/json" },
      data: { name: "E2E Robot", team: "QA", mission: "Validate" },
    });
    expect(unauthenticatedRobot.status()).toBe(403);

    const login = await page.request.post("/api/auth/login", {
      headers: { origin },
      data: {
        email: e2eIdentity.admin.email,
        password: e2eIdentity.admin.password,
        remember: false,
      },
    });
    expect(login.status()).toBe(200);

    const invalidRobot = await page.request.post("/api/admin/robots", {
      headers: { origin, "Content-Type": "application/json" },
      data: { name: "x", team: "x", mission: "x" },
    });
    expect(invalidRobot.status()).toBe(400);

    const generatedRobot = await page.request.post("/api/admin/robots", {
      headers: { origin, "Content-Type": "application/json" },
      data: {
        name: `E2E Robot ${Date.now()}`,
        team: "QA",
        mission: "Validate admin mutation flow",
      },
    });
    expect(generatedRobot.status()).toBe(201);
    const generatedPayload = await generatedRobot.json();
    expect(generatedPayload.success).toBe(true);
    const robotId = generatedPayload.robot.id as string;

    const taskResult = await queryE2E<{ id: string; status: string }>(
      'SELECT id, status FROM "RobotTask" WHERE "robotId" = $1 ORDER BY "createdAt" DESC LIMIT 1',
      [robotId],
    );
    expect(taskResult.rows).toHaveLength(1);
    const task = taskResult.rows[0];

    const approved = await page.request.post("/api/admin/decisions", {
      headers: { origin, "Content-Type": "application/json" },
      data: { id: task.id, action: "approve" },
    });
    expect(approved.status()).toBe(200);
    expect((await approved.json()).success).toBe(true);

    const invalidDecision = await page.request.post("/api/admin/decisions", {
      headers: { origin, "Content-Type": "application/json" },
      data: { id: "not-a-cuid", action: "approve" },
    });
    expect(invalidDecision.status()).toBe(400);

    await queryE2E('DELETE FROM "Robot" WHERE id = $1', [robotId]);
  });

  test("loads and protects the robot detail workspace", async ({ page }) => {
    const snapshotResponse = await page.request.get("/api/admin/robots");
    expect(snapshotResponse.status()).toBe(200);
    const snapshotPayload = await snapshotResponse.json();
    let robotId = snapshotPayload.snapshot?.robots?.[0]?.id as string | undefined;
    let createdRobotId: string | undefined;

    if (!robotId) {
      const generatedRobot = await page.request.post("/api/admin/robots", {
        headers: { origin, "Content-Type": "application/json" },
        data: {
          name: `E2E Detail Robot ${Date.now()}`,
          team: "QA",
          mission: "Validate detail workspace",
        },
      });
      expect(generatedRobot.status()).toBe(201);
      createdRobotId = (await generatedRobot.json()).robot.id as string;
      robotId = createdRobotId;
    }

    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" || message.text().includes("same key")) {
        browserErrors.push(message.text());
      }
    });

    const detailResponse = await page.goto(`/admin/robots/${robotId}`, {
      waitUntil: "networkidle",
    });
    expect(detailResponse?.status()).toBeLessThan(400);
    expect(page.url()).toContain(`/admin/robots/${robotId}`);
    await expect(page.locator(".admin-shell")).toBeVisible();
    await expect(page.locator("main")).toBeVisible();
    expect(browserErrors).toEqual([]);

    await page.request.post("/api/auth/logout", { headers: { origin } });
    await page.goto(`/admin/robots/${robotId}`, { waitUntil: "domcontentloaded" });
    expect(page.url()).toContain("/login");

    if (createdRobotId) {
      await queryE2E('DELETE FROM "Robot" WHERE id = $1', [createdRobotId]);
    }
  });

  test("refreshes the live overview from the admin summary source", async ({ page }) => {
    await page.goto("/admin/dashboard", { waitUntil: "networkidle" });
    const refresh = page.locator(".dashboard-actions .button--primary");
    await expect(refresh).toBeVisible();

    const summaryRequest = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/admin/summary" &&
        response.request().method() === "GET" &&
        response.status() === 200,
    );
    await refresh.click();
    const summaryResponse = await summaryRequest;
    const payload = await summaryResponse.json() as {
      summary: {
        healthServices: Array<{ label: string; value: string; detail: string }>;
        growthChannels: Array<{ label: string; value: string; detail: string }>;
      };
    };
    expect(payload.summary.healthServices).toContainEqual({
      label: "وقت التشغيل",
      value: "—",
      detail: "يتطلب مصدر مراقبة معتمد",
    });
    expect(payload.summary.growthChannels).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "روابط JenanBIZ النشطة" }),
      expect.objectContaining({ label: "عضويات المجتمع" }),
    ]));
    const operations = await page.request.get("/api/admin/operations");
    expect(operations.status()).toBe(200);
    expect((await operations.json()).operations.missions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "تحديثات قلب المنصة" }),
      expect.objectContaining({ title: "تحسين دورة النمو" }),
      expect.objectContaining({ title: "مراجعة الثقة والتحويل" }),
      expect.objectContaining({ title: "توسيع الوصول للسوق" }),
    ]));
    await expect(page.locator(".dashboard-refresh-status")).toContainText(/آخر تحديث|Last updated/);
  });
});
