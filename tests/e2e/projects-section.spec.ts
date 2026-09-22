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

    const companionProject = await page.request.post("/api/projects", {
      headers: { origin, "Content-Type": "application/json" },
      data: {
        action: "create",
        name: `Portfolio Project ${Date.now()}`,
        description: "A second project validates multi-project workspace data.",
        sector: "Services",
        countryCode: "SA",
        currency: "SAR",
      },
    });
    expect(companionProject.status()).toBe(201);
    const companionPayload = await companionProject.json();
    const companionProjectId = companionPayload.result.id as string;

    const listed = await page.request.get("/api/projects");
    expect(listed.status()).toBe(200);
    const listedPayload = await listed.json();
    expect(listedPayload.projects.some((project: { id: string }) => project.id === projectId)).toBe(true);
    expect(listedPayload.projects.some((project: { id: string }) => project.id === companionProjectId)).toBe(true);

    const filtered = await page.request.get("/api/projects?status=DRAFT&search=E2E%20Project&limit=1&offset=0");
    expect(filtered.status()).toBe(200);
    const filteredPayload = await filtered.json();
    expect(filteredPayload.page).toMatchObject({ limit: 1, offset: 0 });
    expect(filteredPayload.projects).toHaveLength(1);
    expect(filteredPayload.projects[0].id).toBe(projectId);

    const detail = await page.request.get(`/api/projects/${projectId}`);
    expect(detail.status()).toBe(200);
    expect(detail.headers()["cache-control"]).toContain("private");
    expect((await detail.json()).project.id).toBe(projectId);

    const evidenceUpload = await page.request.post("/api/files", {
      headers: { origin },
      multipart: {
        projectId,
        file: { name: "market-evidence.txt", mimeType: "text/plain", buffer: Buffer.from("Verified project market evidence.") },
      },
    });
    expect(evidenceUpload.status()).toBe(201);
    const evidencePayload = await evidenceUpload.json();
    expect(evidencePayload.file.projectId).toBe(projectId);

    const feasibility = await page.request.post("/api/projects", {
      headers: { origin, "Content-Type": "application/json" },
      data: {
        action: "calculateFeasibility",
        projectId,
        persist: true,
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

    const persistedRisk = await page.request.post("/api/projects", {
      headers: { origin, "Content-Type": "application/json" },
      data: {
        action: "createRisk",
        projectId,
        category: "MARKET",
        title: "Demand fluctuation",
        likelihood: 3,
        impact: 4,
        mitigation: "Review demand weekly and adjust delivery capacity.",
        ownerLabel: "E2E project owner",
      },
    });
    expect(persistedRisk.status()).toBe(200);

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

    const prematureStart = await page.request.post("/api/projects", {
      headers: { origin, "Content-Type": "application/json" },
      data: { action: "start", projectId },
    });
    expect(prematureStart.status()).toBe(409);

    for (const phaseType of ["FEASIBILITY", "EVALUATION", "PLANNING"]) {
      const activated = await page.request.post("/api/projects", {
        headers: { origin, "Content-Type": "application/json" },
        data: { action: "updatePhase", projectId, phaseType, status: "ACTIVE", notes: "E2E phase activation" },
      });
      expect(activated.status(), `${phaseType} activation`).toBe(200);
      if (phaseType === "EVALUATION") {
        const decision = await page.request.post("/api/projects", {
          headers: { origin, "Content-Type": "application/json" },
          data: {
            action: "recordDecision",
            projectId,
            verdict: "APPROVE",
            rationale: "All documented evidence supports a controlled project launch.",
          },
        });
        expect(decision.status()).toBe(200);
        expect((await decision.json()).result.verdict).toBe("APPROVE");
      }
      const completed = await page.request.post("/api/projects", {
        headers: { origin, "Content-Type": "application/json" },
        data: { action: "updatePhase", projectId, phaseType, status: "COMPLETED", notes: "E2E phase completion" },
      });
      expect(completed.status(), `${phaseType} completion`).toBe(200);
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

    const intelligence = await page.request.post("/api/projects", {
      headers: { origin, "Content-Type": "application/json" },
      data: {
        action: "searchIntelligence",
        projectId,
        query: "Riyadh, Saudi Arabia",
        latitude: 24.7136,
        longitude: 46.6753,
        countryCode: "SA",
        sector: "Technology",
      },
    });
    expect(intelligence.status()).toBe(200);
    expect((await intelligence.json()).result.location).toMatchObject({ latitude: 24.7136, longitude: 46.6753 });

    await page.goto("/projects/start", { waitUntil: "networkidle" });
    const projectCard = page.locator(".project-list-item").filter({ hasText: "E2E Project" });
    const openProject = projectCard.getByRole("button", { name: "Open" });
    if (await openProject.count()) await openProject.click();
    await expect(page.locator(".project-map__canvas")).toBeVisible();
    await expect(page.locator(".project-evidence-library")).toContainText("market-evidence.txt");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/projects/start", { waitUntil: "networkidle" });
    await expect(page.locator(".projects-workspace")).toBeVisible();
    const mobileLayout = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const selectors = [".project-create-form", ".project-workflow__steps", ".project-evidence-list", ".project-evidence-library", ".project-actions"];
      const overflows = selectors.flatMap((selector) =>
        [...document.querySelectorAll<HTMLElement>(selector)]
          .map((element) => ({ selector, rect: element.getBoundingClientRect() }))
          .filter(({ rect }) => rect.left < -1 || rect.right > viewportWidth + 1)
          .map(({ selector }) => selector),
      );
      return { scrollWidth: document.documentElement.scrollWidth, viewportWidth, overflows };
    });
    expect(mobileLayout.scrollWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth);
    expect(mobileLayout.overflows).toEqual([]);

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
