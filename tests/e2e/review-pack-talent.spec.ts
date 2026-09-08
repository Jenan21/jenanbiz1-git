import { expect, test } from "@playwright/test";
import { queryE2E } from "./identity-fixture";

test("creates a job posting and accepts an application from another user", async ({ baseURL, page }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const suffix = Date.now();
  let postingId: string | undefined;
  let employerId: string | undefined;
  let applicantId: string | undefined;

  try {
    const employer = await page.request.post("/api/auth/register", { headers: { origin: baseURL }, data: { displayName: "Talent Employer", countryCode: "SA", email: `employer-${suffix}@example.test`, password: "StrongPass123!", locale: "en", language: "en" } });
    expect(employer.status()).toBe(201);
    employerId = (await employer.json()).user.id as string;
    const created = await page.request.post("/api/talent", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "create", title: "E2E Operations Lead", description: "Lead cross-functional operating work for the talent acceptance test.", department: "Operations", countryCode: "SA", city: "Riyadh", workMode: "HYBRID" } });
    expect(created.status(), await created.text()).toBe(201);
    postingId = (await created.json()).result.id as string;
    const published = await page.request.post("/api/talent", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "updateStatus", jobPostingId: postingId, status: "PUBLISHED" } });
    expect(published.status()).toBe(200);

    await page.request.post("/api/auth/logout", { headers: { origin: baseURL } });
    const applicant = await page.request.post("/api/auth/register", { headers: { origin: baseURL }, data: { displayName: "Talent Applicant", countryCode: "SA", email: `applicant-${suffix}@example.test`, password: "StrongPass123!", locale: "en", language: "en" } });
    expect(applicant.status()).toBe(201);
    applicantId = (await applicant.json()).user.id as string;
    const application = await page.request.post("/api/talent", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "apply", jobPostingId: postingId, message: "I would like to be considered for this role." } });
    expect(application.status()).toBe(200);
    expect((await application.json()).result.status).toBe("SUBMITTED");

    const applicationId = (await application.json()).result.id as string;
    const applicantNotificationBefore = await queryE2E<{ count: string }>('SELECT COUNT(*)::text AS count FROM "Notification" WHERE "userId" = $1 AND type = $2', [applicantId, "JOB_APPLICATION_STATUS"]);
    expect(applicantNotificationBefore.rows[0]?.count).toBe("0");
    expect((await page.request.post("/api/auth/login", { headers: { origin: baseURL }, data: { email: `employer-${suffix}@example.test`, password: "StrongPass123!", remember: false } })).status()).toBe(200);
    const employerTalent = await page.request.get("/api/talent");
    expect((await employerTalent.json()).applications).toHaveLength(1);
    const reviewed = await page.request.post("/api/talent", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "updateApplicationStatus", applicationId, status: "UNDER_REVIEW" } });
    expect(reviewed.status()).toBe(200);
    expect((await reviewed.json()).result.status).toBe("UNDER_REVIEW");
    const applicantNotificationAfter = await queryE2E<{ count: string }>('SELECT COUNT(*)::text AS count FROM "Notification" WHERE "userId" = $1 AND type = $2', [applicantId, "JOB_APPLICATION_STATUS"]);
    expect(applicantNotificationAfter.rows[0]?.count).toBe("1");

    await page.goto("/talent", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "E2E Operations Lead" })).toBeVisible();
  } finally {
    if (postingId) await queryE2E('DELETE FROM "JobPosting" WHERE id = $1', [postingId]);
    if (applicantId) await queryE2E('DELETE FROM "User" WHERE id = $1', [applicantId]);
    if (employerId) await queryE2E('DELETE FROM "User" WHERE id = $1', [employerId]);
  }
});