import { expect, test } from "@playwright/test";

import { TALENT_FLOW_ROUTES } from "@/lib/talent/talent-routes";
import { cleanE2EIdentities, createE2ESession, seedE2EAdmin, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = "http://127.0.0.1:3101";
const viewports = [
  { width: 2560, height: 1440 }, { width: 1920, height: 1080 }, { width: 1440, height: 900 },
  { width: 1366, height: 768 }, { width: 1280, height: 800 }, { width: 1024, height: 1366 },
  { width: 820, height: 1180 }, { width: 430, height: 932 }, { width: 390, height: 844 }, { width: 360, height: 800 },
] as const;

test.describe.serial("Jenan Talent full flow", () => {
  test.setTimeout(300_000);

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
    await seedE2EAdmin();
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  test("keeps candidate data consent-scoped and completes the hiring stages", async ({ browser }) => {
    const employerContext = await browser.newContext();
    const candidateContext = await browser.newContext();
    const employerToken = await createE2ESession(e2eIdentity.user.email);
    const candidateToken = await createE2ESession(e2eIdentity.admin.email);
    await employerContext.addCookies([{ name: "jenan_session", value: employerToken, url: origin, httpOnly: true, sameSite: "Lax" }, { name: "locale", value: "en", url: origin }]);
    await candidateContext.addCookies([{ name: "jenan_session", value: candidateToken, url: origin, httpOnly: true, sameSite: "Lax" }, { name: "locale", value: "en", url: origin }]);
    const employerPage = await employerContext.newPage();
    const candidatePage = await candidateContext.newPage();

    const organization = await employerPage.request.post("/api/software/operations", { headers: { origin }, data: { action: "createOrganization", name: "E2E Talent Company" } });
    expect(organization.status()).toBe(201);
    const organizationId = (await organization.json()).result.id as string;
    const posting = await employerPage.request.post("/api/talent", { headers: { origin }, data: { action: "create", organizationId, title: "Senior Growth Operations Lead", description: "Lead measurable market research, sales operations, reporting, and responsible automation programs across regional teams with documented objectives and review practices.", department: "Growth", countryCode: "SA", city: "Riyadh", salaryMinMinor: 2_000_000, salaryMaxMinor: 3_000_000, requiredSkills: "market research, sales operations, reporting, automation", workMode: "HYBRID" } });
    expect(posting.status()).toBe(201);
    const jobId = (await posting.json()).result.id as string;
    expect((await employerPage.request.post("/api/talent", { headers: { origin }, data: { action: "updateStatus", jobPostingId: jobId, status: "PUBLISHED" } })).status()).toBe(200);

    const cvResponse = await candidatePage.request.post("/api/studio/documents", { headers: { origin }, data: { action: "create", kind: "CV", title: "E2E Candidate CV", content: { name: "E2E Candidate", role: "Growth operations", experience: "Six years in market research and reporting." } } });
    expect(cvResponse.status()).toBe(201);
    const cvDocumentId = (await cvResponse.json()).document.id as string;
    expect((await candidatePage.request.post("/api/talent", { headers: { origin }, data: { action: "saveProfile", headline: "Growth operations specialist", summary: "I build measurable operating systems across research, sales, reporting, and automation for growing teams.", city: "Riyadh", countryCode: "SA", yearsExperience: 6, skills: "market research, sales operations, reporting, automation", desiredWorkModes: ["HYBRID", "REMOTE"], availability: "Within 30 days", cvDocumentId, isDiscoverable: true } })).status()).toBe(200);

    await candidatePage.goto(`/talent/job/sample?job=${jobId}`, { waitUntil: "domcontentloaded" });
    await expect(candidatePage.locator(".talent-job-detail")).toContainText("Senior Growth Operations Lead");
    await candidatePage.goto(`/talent/apply/sample?job=${jobId}`, { waitUntil: "domcontentloaded" });
    await candidatePage.getByPlaceholder("Connect your experience to the required skills").fill("I bring six years of market research, sales operations, reporting, and automation experience with regional delivery teams.");
    await candidatePage.getByLabel("CV from Studio").selectOption(cvDocumentId);
    await candidatePage.getByRole("checkbox").check();
    const applyResponse = candidatePage.waitForResponse((response) => response.url().endsWith("/api/talent") && response.request().method() === "POST");
    await candidatePage.getByRole("button", { name: "Submit application" }).click();
    expect((await applyResponse).status()).toBe(201);
    await expect(candidatePage.getByRole("status")).toContainText("does not guarantee employment");

    const privateSearchPayload = await (await employerPage.request.get("/api/talent?talentSearch=growth")).json();
    expect(JSON.stringify(privateSearchPayload.talent)).not.toContain(e2eIdentity.admin.email);
    expect(privateSearchPayload.talent.some((profile: { headline: string }) => profile.headline === "Growth operations specialist")).toBe(true);
    const applicationId = privateSearchPayload.applications[0].id as string;
    expect(privateSearchPayload.applications[0].cvDocument.title).toBe("E2E Candidate CV");
    expect(privateSearchPayload.applications[0].profileSnapshot.headline).toBe("Growth operations specialist");

    await employerPage.goto("/talent/employer/applicants", { waitUntil: "domcontentloaded" });
    const applicantCard = employerPage.locator(".talent-applicant-list > article").filter({ hasText: "Senior Growth Operations Lead" });
    await expect(applicantCard).toBeVisible();
    const reviewResponse = employerPage.waitForResponse((response) => response.url().endsWith("/api/talent") && response.request().method() === "POST");
    await applicantCard.getByRole("button", { name: "Review" }).click();
    expect((await reviewResponse).status()).toBe(200);
    await employerPage.goto(`/talent/candidate/sample?application=${applicationId}`, { waitUntil: "domcontentloaded" });
    await expect(employerPage.locator(".talent-candidate-detail")).toContainText("Shared CV");
    await employerPage.getByLabel("Employer notes").fill("Verified for the structured interview stage.");
    const acceptResponse = employerPage.waitForResponse((response) => response.url().endsWith("/api/talent") && response.request().method() === "POST");
    await employerPage.getByRole("button", { name: "Advance candidate" }).click();
    expect((await acceptResponse).status()).toBe(200);
    await expect(employerPage.getByRole("status")).toContainText("without an employment guarantee");

    await candidatePage.goto("/talent/profile", { waitUntil: "domcontentloaded" });
    await expect(candidatePage.locator(".talent-profile__applications")).toContainText("ACCEPTED");
    await candidatePage.goto("/talent/matching", { waitUntil: "domcontentloaded" });
    await expect(candidatePage.locator(".talent-match-layout")).toContainText("Senior Growth Operations Lead");
    await expect(candidatePage.locator(".talent-match-layout")).toContainText("market research");

    for (const definition of TALENT_FLOW_ROUTES) {
      const page = definition.id.startsWith("employer") || definition.id === "candidate" || definition.id === "reports" ? employerPage : candidatePage;
      const suffix = definition.id === "job-detail" || definition.id === "apply" ? `?job=${jobId}` : definition.id === "candidate" ? `?application=${applicationId}` : "";
      const response = await page.goto(`${definition.route}${suffix}`, { waitUntil: "domcontentloaded" });
      expect(response?.status(), definition.route).toBe(200);
      await expect(page.locator(".talent-flow")).toBeVisible();
      await expect(page.locator(".talent-flow")).toHaveAttribute("data-talent-route", definition.route);
      await expect(page.locator(".talent-flow")).toHaveAttribute("data-talent-source", "PERSISTED_RECORDS");
      await expect(page.locator(".talent-flow")).toHaveAttribute("data-talent-privacy", "CONSENT_SCOPED");
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
      expect(layout.scrollWidth, definition.route).toBeLessThanOrEqual(layout.viewportWidth + 1);
    }

    for (const viewport of viewports) {
      await candidatePage.setViewportSize(viewport);
      for (const route of ["/talent", "/talent/jobs", `/talent/job/sample?job=${jobId}`, "/talent/profile", "/talent/matching"]) {
        expect((await candidatePage.goto(route, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
        const layout = await candidatePage.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
        expect(layout.scrollWidth, `${route} at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(layout.viewportWidth + 1);
      }
    }

    await employerContext.close();
    await candidateContext.close();
  });
});