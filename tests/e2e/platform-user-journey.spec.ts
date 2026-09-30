import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { builtInPlatformCatalog } from "@/lib/platform/catalog";
import { cleanE2EIdentities } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const runLabel = (process.env.E2E_RUN_ID ?? "journey").slice(-10);
const projectName = `Journey Project ${runLabel}`;
const marketTitle = `Journey Market Opportunity ${runLabel}`;
const jobTitle = `Journey Operations Lead ${runLabel}`;
const organizationName = `Journey Organization ${runLabel}`;
const campaignName = `Journey Growth Campaign ${runLabel}`;
const replacementPassword = `${e2eIdentity.user.password}-Reset`;

async function expectHealthyPage(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `${route} should render`).toBe(200);
  await expect(page.locator("body")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow, `${route} should not overflow horizontally`).toBe(false);
}

async function createPdf(label: string) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const pdfPage = document.addPage([420, 300]);
  pdfPage.drawText(label, { x: 40, y: 220, size: 18, font });
  return Buffer.from(await document.save());
}

test.describe.serial("real Jenan Pro user journey", () => {
  test.setTimeout(360_000);

  test.beforeAll(async () => {
    await cleanE2EIdentities();
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  test("registers, signs in, uses live services, and verifies the account record", async ({
    context,
    page,
  }) => {
    const browserErrors: string[] = [];
    const serverErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("response", (response) => {
      if (
        response.status() >= 500 &&
        response.url().startsWith("http://127.0.0.1:3101")
      ) {
        serverErrors.push(`${response.status()} ${response.url()}`);
      }
    });
    await context.addCookies([
      { name: "locale", value: "en", url: "http://127.0.0.1:3101" },
    ]);

    await page.goto("/register");
    await page.getByLabel("Full name").fill(e2eIdentity.user.displayName);
    await page.getByLabel("Email address").fill(e2eIdentity.user.email);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Country code").selectOption("SA");
    await page
      .getByLabel("Password", { exact: true })
      .fill(e2eIdentity.user.password);
    await page.getByLabel("Confirm password").fill(e2eIdentity.user.password);
    await page.getByLabel("I accept the terms and conditions").check();
    await Promise.all([
      page.waitForURL(/\/user\/onboarding$/),
      page.locator(".auth-form button[type=submit]").click(),
    ]);
    await page.getByLabel("Account type").selectOption("ORGANIZATION");
    await page.getByLabel("Country code").selectOption("SA");
    await page.getByLabel("City").fill("Riyadh");
    await page.getByLabel("Projects").check();
    await page.getByLabel("Market", { exact: true }).check();
    await page.getByLabel("Software").check();
    await Promise.all([
      page.waitForURL(/\/dashboard$/),
      page.getByRole("button", { name: "Save and continue" }).click(),
    ]);
    await expect(page.locator(".user-chip")).toContainText(
      e2eIdentity.user.displayName,
    );

    await Promise.all([
      page.waitForURL(/\/auth$/),
      page.getByRole("button", { name: "Logout", exact: true }).click(),
    ]);
    expect((await page.request.get("/api/account/overview")).status()).toBe(
      401,
    );

    await page.getByRole("link", { name: "Recover access" }).click();
    await expect(page).toHaveURL(/\/auth\/forgot$/);
    await page.getByLabel("Email address").fill(e2eIdentity.user.email);
    const resetRequest = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/forgot") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Send verification code" }).click();
    expect((await resetRequest).status()).toBe(200);
    await expect(page.locator(".auth-workflow__dev-code output")).toHaveText(
      /^\d{6}$/,
    );
    await page.getByLabel("New password").fill(replacementPassword);
    await page.getByLabel("Confirm password").fill(replacementPassword);
    const resetConfirmation = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/forgot") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Confirm password" }).click();
    expect((await resetConfirmation).status()).toBe(200);
    await page.waitForURL(/\/auth\?reset=success$/);
    await expect(page.getByRole("status")).toContainText(
      "Your password was updated",
    );

    await page.getByLabel("Email address").fill(e2eIdentity.user.email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(replacementPassword);
    await Promise.all([
      page.waitForURL(/\/dashboard$/),
      page.locator(".auth-form button[type=submit]").click(),
    ]);

    await expectHealthyPage(page, "/projects/analysis");
    const projectForm = page.locator(".project-create-form").first();
    await projectForm.getByLabel("Project name").fill(projectName);
    await projectForm.getByLabel("Sector").fill("Renewable logistics");
    await projectForm.getByLabel("Country").fill("SA");
    await projectForm
      .getByLabel("Brief description")
      .fill(
        "A verified end-to-end project created during the platform user journey.",
      );
    const projectResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/projects") &&
        response.request().method() === "POST",
    );
    await projectForm.getByRole("button", { name: "New project" }).click();
    expect((await projectResponse).status()).toBe(201);
    await expect(
      page.locator(".project-list-item").filter({ hasText: projectName }),
    ).toBeVisible();

    await expectHealthyPage(page, "/academy");
    const firstCourse = page.locator(".academy-course").first();
    await expect(firstCourse).toBeVisible();
    const courseTitle =
      (await firstCourse.locator("h2").textContent())?.trim() ?? "";
    await Promise.all([
      page.waitForURL(/\/academy\/courses\//),
      firstCourse.getByRole("link", { name: "Open content" }).click(),
    ]);
    await expect(page.locator(".academy-learning-progress")).toBeVisible();
    const enroll = page.getByRole("button", { name: "Enroll in course" });
    if (await enroll.isVisible()) {
      const enrollmentResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/academy/progress") &&
          response.request().method() === "POST",
      );
      await enroll.click();
      expect((await enrollmentResponse).status()).toBe(201);
      await expect(page.getByRole("status")).toContainText("Progress saved");
    }

    await expectHealthyPage(page, "/market");
    const marketForm = page.locator(".market-form");
    await marketForm.getByPlaceholder("Listing title").fill(marketTitle);
    await marketForm.getByPlaceholder("Sector").fill("Clean technology");
    await marketForm.getByPlaceholder("Country").fill("SA");
    await marketForm.getByPlaceholder("Asking price").fill("250000");
    await marketForm
      .getByPlaceholder("A clear opportunity summary")
      .fill(
        "A documented clean technology opportunity with verified operating assumptions, customer demand, delivery capacity, financial records, trained staff, and a practical regional expansion plan.",
      );
    await marketForm
      .getByPlaceholder("Valuation note or price rationale")
      .fill(
        "The requested value reflects current equipment, contracts, operating history, and validated demand.",
      );
    const listingResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/market") &&
        response.request().method() === "POST",
    );
    await marketForm.getByRole("button", { name: "Create listing" }).click();
    expect((await listingResponse).status()).toBe(201);
    const listingCard = page
      .locator(".market-listing")
      .filter({ hasText: marketTitle });
    await expect(listingCard).toBeVisible();
    const publishListingResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/market") &&
        response.request().method() === "POST",
    );
    await listingCard.getByRole("button", { name: "Publish listing" }).click();
    expect((await publishListingResponse).status()).toBe(200);
    await expect(listingCard).toContainText("PUBLISHED");

    await expectHealthyPage(page, "/talent/employer/post");
    const talentForm = page.locator(".talent-post-form");
    await talentForm.getByPlaceholder("Job title").fill(jobTitle);
    await talentForm.getByPlaceholder("Department").fill("Operations");
    await talentForm.getByLabel("Work mode").selectOption("HYBRID");
    await talentForm.getByPlaceholder("City").fill("Riyadh");
    await talentForm.getByPlaceholder("Country").fill("SA");
    await talentForm.getByPlaceholder("Salary from").fill("12000");
    await talentForm.getByPlaceholder("Salary to").fill("18000");
    await talentForm
      .getByPlaceholder("Required skills")
      .fill("operations, analytics, leadership, logistics");
    await talentForm
      .getByPlaceholder("Responsibilities, requirements, and benefits")
      .fill(
        "Lead cross-functional operations, analyze service performance, coordinate logistics, document decisions, and improve delivery quality across regional teams.",
      );
    const postingResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/talent") &&
        response.request().method() === "POST",
    );
    await talentForm.getByRole("button", { name: "Save draft" }).click();
    expect((await postingResponse).status()).toBe(201);
    await expectHealthyPage(page, "/talent/employer");
    const postingCard = page
      .locator(".talent-job-grid > article")
      .filter({ hasText: jobTitle });
    await expect(postingCard).toBeVisible();
    const publishPostingResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/talent") &&
        response.request().method() === "POST",
    );
    await postingCard.getByRole("button", { name: "Publish" }).click();
    expect((await publishPostingResponse).status()).toBe(200);
    await expect(postingCard).toContainText("PUBLISHED");

    await expectHealthyPage(page, "/programs");
    await page.getByPlaceholder("Organization name").fill(organizationName);
    const organizationResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/programs") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Create", exact: true }).click();
    expect((await organizationResponse).status()).toBe(201);
    await expect(page.getByLabel("Active organization")).toContainText(
      organizationName,
    );
    for (const programName of [
      "Financial operations",
      "People operations",
      "Field operations",
      "Fleet management",
    ]) {
      const programCard = page
        .locator(".program-card")
        .filter({ hasText: programName });
      const activationResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/programs") &&
          response.request().method() === "POST",
      );
      await programCard
        .getByRole("button", { name: "Activate program" })
        .click();
      expect((await activationResponse).status()).toBe(201);
      await expect(programCard).toContainText("Active");
    }
    await page.getByRole("link", { name: "Open financial ledger" }).click();
    await page.getByPlaceholder("Amount in SAR").fill("45000");
    await page
      .getByPlaceholder("Entry description")
      .fill("Verified journey service revenue");
    const ledgerResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/programs/finance") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Record entry" }).click();
    expect((await ledgerResponse).status()).toBe(201);
    await expect(page.locator(".ledger-entries")).toContainText(
      "Verified journey service revenue",
    );

    await expectHealthyPage(page, "/marketing/campaign/new");
    const campaignForm = page.locator(".marketing-campaign-form");
    await campaignForm.getByPlaceholder("Campaign name").fill(campaignName);
    await campaignForm
      .getByLabel("Campaign owner")
      .selectOption({ label: organizationName });
    await campaignForm.getByLabel("Channel").selectOption("SOCIAL");
    await campaignForm.getByPlaceholder("Allocated budget").fill("15000");
    await campaignForm.getByPlaceholder("Conversion target").fill("12");
    await campaignForm
      .getByPlaceholder("Target audience")
      .fill("Regional operations leaders and business owners");
    await campaignForm
      .getByPlaceholder("Call to action")
      .fill("Book a verified consultation");
    await campaignForm
      .getByPlaceholder("Campaign objective and desired outcome")
      .fill(
        "Generate qualified business leads for the verified regional operations service.",
      );
    const campaignResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/marketing") &&
        response.request().method() === "POST",
    );
    await campaignForm.getByRole("button", { name: "Save draft" }).click();
    expect((await campaignResponse).status()).toBe(201);
    await expectHealthyPage(page, "/marketing/campaigns");
    await expect(
      page
        .locator(".marketing-campaign-list article")
        .filter({ hasText: campaignName }),
    ).toBeVisible();
    await expectHealthyPage(page, "/marketing/leads");
    const leadForm = page.locator(".marketing-lead-form");
    await leadForm.getByLabel("Campaign").selectOption({ label: campaignName });
    await leadForm
      .getByPlaceholder("Lead label")
      .fill("Journey qualified lead");
    await leadForm.getByPlaceholder("Source").fill("E2E platform journey");
    await leadForm.getByPlaceholder("Expected pipeline value").fill("25000");
    await leadForm.getByLabel("Lead status").selectOption("QUALIFIED");
    const leadResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/marketing") &&
        response.request().method() === "POST",
    );
    await leadForm.getByRole("button", { name: "Add lead" }).click();
    expect((await leadResponse).status()).toBe(201);
    await expect(page.getByRole("status")).toContainText("Lead recorded");

    await expectHealthyPage(page, "/studio/pdf/editor");
    const mergeForm = page
      .locator(".studio-pdf-editor form")
      .filter({ hasText: "Merge files" });
    await mergeForm.locator('input[type="file"]').setInputFiles([
      {
        name: "journey-one.pdf",
        mimeType: "application/pdf",
        buffer: await createPdf("Jenan Pro journey one"),
      },
      {
        name: "journey-two.pdf",
        mimeType: "application/pdf",
        buffer: await createPdf("Jenan Pro journey two"),
      },
    ]);
    const downloadPromise = page.waitForEvent("download");
    await mergeForm.getByRole("button", { name: "Merge and download" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("jenan-merged.pdf");
    expect(await download.failure()).toBeNull();
    await expect(page.getByRole("status")).toContainText(
      "created and downloaded",
    );

    await expectHealthyPage(page, "/studio/visual-dna");
    await page
      .locator(".visual-dna")
      .locator('input[type="file"]')
      .setInputFiles(
        path.join(process.cwd(), "public", "assets", "jenan-pro-logo.jpg"),
      );
    await expect(page.getByText(/File: jenan-pro-logo\.jpg/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Apply theme" }),
    ).toBeEnabled();

    await expectHealthyPage(page, "/account");
    await expect(page.locator(".account-overview")).toContainText(projectName);
    await expect(page.locator(".account-overview")).toContainText(
      organizationName,
    );
    await expect(page.locator(".account-overview")).toContainText(marketTitle);
    await expect(page.locator(".account-overview")).toContainText(jobTitle);
    await expect(page.locator(".account-overview")).toContainText(campaignName);
    await expect(page.locator(".account-overview")).toContainText(courseTitle);
    for (const route of [
      "/projects",
      "/projects/feasibility",
      "/projects/evaluation",
      "/projects/start",
      "/programs/people",
      "/programs/field",
      "/programs/fleet",
      "/robotics",
      "/benefits",
      "/pricing",
      "/studio",
      "/studio/visual-dna",
    ]) {
      await expectHealthyPage(page, route);
    }

    const removedFundingRoute = await page.goto("/funding-eligibility");
    expect(removedFundingRoute?.status()).toBe(404);
    const removedFundingApi = await page.request.get("/api/funding");
    expect(removedFundingApi.status()).toBe(404);

    const serviceRoutes = new Set(
      builtInPlatformCatalog.modules.flatMap((module) =>
        module.services.map((service) => service.href),
      ),
    );
    for (const route of serviceRoutes) {
      await expectHealthyPage(page, route);
    }

    const denied = await page.goto("/admin");
    expect(denied?.status()).toBe(403);
    await expect(page.getByText("Access denied")).toBeVisible();

    const logout = await page.request.post("/api/auth/logout", {
      headers: { origin: "http://127.0.0.1:3101" },
    });
    expect(logout.status()).toBe(200);
    await page.goto("/studio/visual-dna");
    await expect(page).toHaveURL(/\/auth\?next=%2Fstudio%2Fvisual-dna$/);
    expect(serverErrors).toEqual([]);
    expect(browserErrors).toEqual([]);
  });
});
