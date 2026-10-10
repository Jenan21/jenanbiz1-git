import { expect, test } from "@playwright/test";
import { cleanE2EIdentities, queryE2E, seedE2EAdmin } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3101"}`;

test.describe.serial("projects section acceptance", () => {
  test.setTimeout(150_000);

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
        phone: "+966501234567",
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

    const professionalSections = [
      {
        section: "GENERAL",
        data: {
          projectType: "Digital service",
          legalNature: "Limited liability company",
          size: "MEDIUM",
          location: "Riyadh",
          description: "A source-backed professional feasibility study for E2E acceptance.",
        },
      },
      {
        section: "MARKET",
        data: {
          scope: "REGIONAL",
          customerSegment: "Regional business customers",
          demandTrend: "Demand is documented from named sources.",
          marketSizeNotes: "Market size is reviewed against traceable sources.",
          competitorNotes: "Named competitors are assessed.",
          pricingNotes: "Pricing is based on comparable offers.",
          distributionNotes: "Direct and partner distribution.",
        },
      },
      {
        section: "MARKETING",
        data: {
          objectives: ["AWARENESS", "ACQUISITION"],
          strategy: "MIXED",
          budget: 25000,
          channels: ["SEARCH", "CONTENT", "PARTNERS"],
          awarenessMonths: 2,
          launchMonths: 1,
          growthMonths: 6,
        },
      },
      {
        section: "TECHNICAL",
        data: {
          facilityType: "Operations office",
          facilityArea: 120,
          equipmentCount: 18,
          productsServices: "Managed digital services",
          rawMaterials: "Cloud infrastructure and licensed tools",
          staffingPlan: "Operations, finance, and growth teams",
          organizationNotes: "Documented ownership and delivery responsibilities",
        },
      },
      {
        section: "FINANCIAL",
        data: {
          initialInvestment: 100000,
          monthlyFixedCosts: 10000,
          variableCostPerUnit: 20,
          pricePerUnit: 50,
          monthlyUnits: 1000,
          months: 12,
          annualDiscountRate: 10,
          annualInflationRate: 2,
          taxRate: 15,
        },
      },
      {
        section: "SWOT",
        data: {
          strengths: "Documented operating capability",
          weaknesses: "Early-stage market presence",
          opportunities: "Regional demand growth",
          threats: "Competitive price pressure",
          recommendation: "Proceed through a controlled launch with monthly evidence reviews.",
        },
      },
      {
        section: "TIMELINE",
        data: {
          startDate: "2026-10-01",
          durationMonths: 12,
          preparationMonths: 2,
          launchMonths: 1,
          growthMonths: 9,
          milestones: "Setup, controlled launch, evidence review, and scale decision.",
        },
      },
    ];
    for (const payload of professionalSections) {
      const savedSection = await page.request.post("/api/projects", {
        headers: { origin, "Content-Type": "application/json" },
        data: {
          action: "saveFeasibilityStudy",
          projectId,
          payload,
        },
      });
      expect(savedSection.status(), `${payload.section} feasibility section`).toBe(200);
    }
    const professionalDetail = await page.request.get(`/api/projects/${projectId}`);
    expect(professionalDetail.status()).toBe(200);
    expect((await professionalDetail.json()).project.feasibilityStudy).toMatchObject({
      sections: {
        GENERAL: { location: "Riyadh" },
        MARKET: { scope: "REGIONAL" },
        FINANCIAL: { initialInvestment: 100000 },
        TIMELINE: { durationMonths: 12 },
      },
      version: 1,
    });

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

    const arabicProject = await page.request.post("/api/projects", {
      headers: { origin, "Content-Type": "application/json" },
      data: {
        action: "create",
        name: "\u0645\u0634\u0631\u0648\u0639 \u062a\u062d\u0644\u064a\u0644 \u0639\u0631\u0628\u064a",
        description:
          "\u0648\u0635\u0641 \u0645\u0634\u0631\u0648\u0639 \u0639\u0631\u0628\u064a \u0645\u0648\u062b\u0642",
        sector: "Technology",
        countryCode: "SA",
      },
    });
    expect(arabicProject.status()).toBe(201);
    const arabicProjectId = (await arabicProject.json()).result.id as string;
    const arabicAnalysis = await page.request.post("/api/projects", {
      headers: { origin, "Content-Type": "application/json" },
      data: {
        action: "saveProjectAnalysis",
        projectId: arabicProjectId,
        input: {
          idea: "\u0645\u0646\u0635\u0629 \u0631\u0642\u0645\u064a\u0629 \u0644\u062a\u0648\u0635\u064a\u0644 \u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a \u0627\u0644\u0635\u062d\u064a\u0629",
          city: "Riyadh",
          targetAudience: "CONSUMERS",
        },
      },
    });
    expect(arabicAnalysis.status()).toBe(200);
    const arabicReport = await page.request.get(
      `/api/projects/${arabicProjectId}/report`,
    );
    expect(arabicReport.status()).toBe(200);
    expect(arabicReport.headers()["content-type"]).toContain("application/pdf");
    expect((await arabicReport.body()).byteLength).toBeGreaterThan(100_000);

    await page.goto(`/projects/feasibility/pro/result?project=${projectId}`, {
      waitUntil: "networkidle",
    });
    await expect(page.locator(".professional-feasibility")).toHaveAttribute(
      "data-project-professional-flow",
      "true",
    );
    await expect(page.locator(".pfs-score")).toContainText("100%");
    await expect(
      page.getByRole("link", { name: "Create final report" }),
    ).toBeVisible();
    await page.goto(`/projects/feasibility/pro/report?project=${projectId}`, {
      waitUntil: "networkidle",
    });
    await expect(page.locator(".pfs-report-paper")).toContainText(
      "E2E Project",
    );
    await expect(
      page.getByRole("link", { name: "Download PDF" }),
    ).toHaveAttribute("href", `/api/projects/${projectId}/report`);

    for (const route of [
      "/projects/analysis",
      "/projects/feasibility",
      "/projects/evaluation",
      "/projects/start",
    ]) {
      const livePage = await page.goto(route, { waitUntil: "networkidle" });
      expect(livePage?.status(), `${route} live page`).toBe(200);
      if (route === "/projects/analysis") {
        await expect(page.locator(".project-analysis-dashboard")).toHaveAttribute(
          "data-project-analysis-source",
          "USER_INPUT_REQUIRED",
        );
        await expect(
          page.locator(".project-analysis-dashboard__form"),
        ).toBeVisible();
      } else if (route === "/projects/feasibility") {
        await expect(
          page.locator(".project-feasibility-dashboard"),
        ).toHaveAttribute("data-project-feasibility-source", "USER_INPUT_REQUIRED");
        await expect(
          page.locator(".project-feasibility-dashboard__choices > article"),
        ).toHaveCount(2);
      } else if (route === "/projects/start") {
        await expect(page.locator(".project-start-dashboard")).toHaveAttribute(
          "data-project-start-source",
          "USER_INPUT_REQUIRED",
        );
        await expect(
          page.locator(".project-start-dashboard__form"),
        ).toBeVisible();
      } else if (route === "/projects/evaluation") {
        await expect(
          page.locator(".project-evaluation-dashboard"),
        ).toHaveAttribute("data-project-evaluation-source", "USER_INPUT_REQUIRED");
        await expect(
          page.locator(".project-evaluation-dashboard__form"),
        ).toBeVisible();
      } else {
        await expect(page.locator(".projects-live-service")).toBeVisible();
        await expect(page.locator(".projects-workspace")).toBeVisible();
      }
    }

    await page.goto("/projects/analysis", { waitUntil: "networkidle" });
    await page
      .getByPlaceholder("Example: a healthy food delivery platform...")
      .fill("Verified E2E analysis entry");
    await page.getByLabel("Sector *").selectOption("Technology");
    await page.getByLabel("City *").selectOption("Riyadh");
    await page.getByLabel("Target audience *").selectOption("BUSINESSES");
    await Promise.all([
      page.waitForURL(/\/projects\/analysis\/progress\?project=/),
      page.getByRole("button", { name: "Start analysis" }).click(),
    ]);
    await expect(page.locator(".project-analysis-workspace")).toHaveAttribute(
      "data-analysis-route",
      "/projects/analysis/progress",
    );
    const analysisProjectUrl = new URL(page.url());
    const analysisProjectId = analysisProjectUrl.searchParams.get("project");
    expect(analysisProjectId).toBeTruthy();
    await expect(page.getByRole("heading", { name: "Project analysis complete" })).toBeVisible({
      timeout: 45_000,
    });
    await page.goto(`/projects/analysis/details?project=${analysisProjectId}`, {
      waitUntil: "networkidle",
    });
    await expect(page.locator("[data-testid='analysis-details']")).toBeVisible();
    await page.goto(`/projects/analysis/result?project=${analysisProjectId}`, {
      waitUntil: "networkidle",
    });
    await expect(page.locator("[data-testid='analysis-result']")).toContainText(
      "Evidence complete",
    );
    await page.goto(`/projects/analysis/report?project=${analysisProjectId}`, {
      waitUntil: "networkidle",
    });
    await expect(page.locator("[data-testid='analysis-report']")).toContainText(
      "Verified E2E analysis entry",
    );
    await page.goto(`/projects/analysis/print?project=${analysisProjectId}`, {
      waitUntil: "networkidle",
    });
    await expect(page.locator("[data-testid='analysis-export']")).toBeVisible();
    await expect(page.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
      "href",
      `/api/projects/${analysisProjectId}/report`,
    );

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

    await page.goto(`/projects/analysis/map?project=${projectId}`, {
      waitUntil: "networkidle",
    });
    await expect(page.locator(".pa-evidence-map")).toBeVisible();
    await page.goto(`/projects/start/roadmap?project=${projectId}`, {
      waitUntil: "networkidle",
    });
    await expect(page.locator(".project-evidence-library")).toContainText("market-evidence.txt");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/projects/start/roadmap", { waitUntil: "networkidle" });
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
