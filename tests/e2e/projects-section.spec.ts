import { expect, test } from "@playwright/test";
import { cleanE2EIdentities, queryE2E, seedE2EAdmin } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3101"}`;

test.describe.serial("projects section acceptance", () => {
  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EAdmin();
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  test("completes the authenticated project lifecycle and protects its outputs", async ({
    page,
  }) => {
    const registration = await page.request.post("/api/auth/register", {
      headers: { origin },
      data: {
        displayName: e2eIdentity.user.displayName,
        countryCode: "SA",
        email: e2eIdentity.user.email,
        password: e2eIdentity.user.password,
        locale: "en",
        language: "en",
      },
    });
    expect(registration.status()).toBe(201);

    const unauthenticatedList = await page.request.post("/api/auth/logout", {
      headers: { origin },
    });
    expect(unauthenticatedList.status()).toBe(200);
    const rejectedList = await page.request.get("/api/projects");
    expect(rejectedList.status()).toBe(401);

    const login = await page.request.post("/api/auth/login", {
      headers: { origin },
      data: {
        email: e2eIdentity.user.email,
        password: e2eIdentity.user.password,
        remember: false,
      },
    });
    expect(login.status()).toBe(200);

    const invalidCreate = await page.request.post("/api/projects", {
      headers: { origin, "Content-Type": "application/json" },
      data: { action: "create", name: "x" },
    });
    expect(invalidCreate.status()).toBe(400);

    const created = await page.request.post("/api/projects", {
      headers: { origin, "Content-Type": "application/json" },
      data: {
        action: "create",
        name: `E2E Project ${Date.now()}`,
        description: "Project section acceptance lifecycle",
        sector: "Technology",
        countryCode: "SA",
        currency: "SAR",
      },
    });
    expect(created.status()).toBe(201);
    const createdPayload = await created.json();
    expect(createdPayload.success).toBe(true);
    const projectId = createdPayload.result.id as string;

    const listed = await page.request.get("/api/projects");
    expect(listed.status()).toBe(200);
    const listedPayload = await listed.json();
    expect(listedPayload.projects.some((project: { id: string }) => project.id === projectId)).toBe(true);

    const feasibility = await page.request.post("/api/projects", {
      headers: { origin, "Content-Type": "application/json" },
      data: {
        action: "calculateFeasibility",
        inputs: {
          initialInvestment: 100000,
          monthlyFixedCosts: 10000,
          variableCostPerUnit: 20,
          pricePerUnit: 50,
          monthlyUnits: 1000,
          months: 12,
        },
      },
    });
    expect(feasibility.status()).toBe(200);
    expect((await feasibility.json()).result.base.valid).toBe(true);

    const risk = await page.request.post("/api/projects", {
      headers: { origin, "Content-Type": "application/json" },
      data: {
        action: "calculateRisk",
        factors: { market: 20, financial: 30, operational: 40, technical: 30, compliance: 20 },
      },
    });
    expect(risk.status()).toBe(200);
    expect((await risk.json()).result.level).toBe("LOW");

    const phase = await page.request.post("/api/projects", {
      headers: { origin, "Content-Type": "application/json" },
      data: { action: "updatePhase", projectId, phaseType: "ANALYSIS", status: "COMPLETED", notes: "E2E verified" },
    });
    expect(phase.status()).toBe(200);

    for (const type of ["MARKET", "FINANCIAL", "OPERATIONAL", "RISK", "TECHNICAL", "COMPLIANCE"]) {
      const assessment = await page.request.post("/api/projects", {
        headers: { origin, "Content-Type": "application/json" },
        data: { action: "recordAssessment", projectId, type, score: 85, summary: "Evidence verified", source: "E2E acceptance" },
      });
      expect(assessment.status(), `${type} assessment`).toBe(200);
    }

    const started = await page.request.post("/api/projects", {
      headers: { origin, "Content-Type": "application/json" },
      data: { action: "start", projectId },
    });
    expect(started.status()).toBe(200);
    expect((await started.json()).result.status).toBe("IN_PROGRESS");

    const report = await page.request.get(`/api/projects/${projectId}/report`);
    expect(report.status()).toBe(200);
    expect(report.headers()["content-type"]).toContain("application/pdf");

    for (const route of [
      "/projects/analysis",
      "/projects/feasibility",
      "/projects/evaluation",
      "/projects/start",
    ]) {
      const livePage = await page.goto(route, { waitUntil: "networkidle" });
      expect(livePage?.status(), `${route} live page`).toBe(200);
      await expect(page.locator(".projects-live-service")).toBeVisible();
      await expect(page.locator(".projects-workspace")).toBeVisible();
    }

    await page.request.post("/api/auth/logout", { headers: { origin } });
    const protectedReport = await page.request.get(`/api/projects/${projectId}/report`);
    expect(protectedReport.status()).toBe(401);

    const persisted = await queryE2E<{ status: string; currentPhase: string }>(
      'SELECT status, "currentPhase" FROM "Project" WHERE id = $1',
      [projectId],
    );
    expect(persisted.rows[0]).toEqual({ status: "IN_PROGRESS", currentPhase: "EXECUTION" });
  });
});
