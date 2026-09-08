import { expect, test } from "@playwright/test";
import { queryE2E } from "./identity-fixture";

test("saves a transparent funding readiness assessment for the authenticated user", async ({ baseURL, page }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const email = `funding-${Date.now()}@example.test`;
  let assessmentId: string | undefined;
  let userId: string | undefined;
  try {
    const registration = await page.request.post("/api/auth/register", { headers: { origin: baseURL }, data: { displayName: "Funding User", countryCode: "SA", email, password: "StrongPass123!", locale: "en", language: "en" } });
    expect(registration.status()).toBe(201);
    userId = (await registration.json()).user.id as string;
    const assessment = await page.request.post("/api/funding", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { countryCode: "SA", organizationType: "ORGANIZATION", growthStage: "OPERATING", requestedAmountMinor: 120000, monthlyRevenueMinor: 300000, yearsOperating: 3 } });
    expect(assessment.status()).toBe(201);
    const created = await assessment.json();
    assessmentId = created.assessment.id as string;
    expect(created.assessment.score).toBe(100);
    const history = await page.request.get("/api/funding");
    expect((await history.json()).assessments).toHaveLength(1);
    await page.goto("/funding-eligibility", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /تقييم جاهزية التمويل|Funding readiness assessment/ })).toBeVisible();
    await expect(page.locator(".funding-history").getByText("100/100", { exact: true })).toBeVisible();
  } finally {
    if (assessmentId) await queryE2E('DELETE FROM "FundingAssessment" WHERE id = $1', [assessmentId]);
    if (userId) await queryE2E('DELETE FROM "User" WHERE id = $1', [userId]);
  }
});