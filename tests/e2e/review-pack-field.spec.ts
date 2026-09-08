import { expect, test } from "@playwright/test";
import { queryE2E } from "./identity-fixture";

test("assigns field work to an invited member who updates its execution status", async ({ baseURL, page }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const suffix = Date.now();
  const ownerEmail = `field-owner-${suffix}@example.test`;
  const memberEmail = `field-member-${suffix}@example.test`;
  let organizationId: string | undefined;
  let ownerId: string | undefined;
  let memberId: string | undefined;
  try {
    const ownerRegistration = await page.request.post("/api/auth/register", { headers: { origin: baseURL }, data: { displayName: "Field Owner", countryCode: "SA", email: ownerEmail, password: "StrongPass123!", locale: "en", language: "en" } });
    ownerId = (await ownerRegistration.json()).user.id as string;
    const memberRegistration = await page.request.post("/api/auth/register", { headers: { origin: baseURL }, data: { displayName: "Field Operator", countryCode: "SA", email: memberEmail, password: "StrongPass123!", locale: "en", language: "en" } });
    memberId = (await memberRegistration.json()).user.id as string;
    expect((await page.request.post("/api/auth/login", { headers: { origin: baseURL }, data: { email: ownerEmail, password: "StrongPass123!", remember: false } })).status()).toBe(200);
    const organization = await page.request.post("/api/programs", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "createOrganization", name: "E2E Field Company" } });
    organizationId = (await organization.json()).result.id as string;
    const blocked = await page.request.get(`/api/programs/field?organizationId=${organizationId}`);
    expect(blocked.status()).toBe(403);
    expect((await page.request.post("/api/programs", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "activate", organizationId, key: "PEOPLE" } })).status()).toBe(201);
    expect((await page.request.post("/api/programs", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "activate", organizationId, key: "FIELD_OPERATIONS" } })).status()).toBe(201);
    const invitation = await page.request.post("/api/programs/people", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "invite", organizationId, email: memberEmail } });
    expect(invitation.status()).toBe(201);
    const membershipId = (await invitation.json()).result.id as string;
    expect((await page.request.post("/api/auth/login", { headers: { origin: baseURL }, data: { email: memberEmail, password: "StrongPass123!", remember: false } })).status()).toBe(200);
    expect((await page.request.post("/api/programs/people", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "acceptInvitation", membershipId } })).status()).toBe(200);
    expect((await page.request.post("/api/auth/login", { headers: { origin: baseURL }, data: { email: ownerEmail, password: "StrongPass123!", remember: false } })).status()).toBe(200);
    const created = await page.request.post("/api/programs/field", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "create", organizationId, title: "E2E site inspection", description: "Validate field assignment lifecycle.", assigneeMemberId: membershipId } });
    expect(created.status()).toBe(201);
    const assignmentId = (await created.json()).result.id as string;
    expect((await page.request.post("/api/auth/login", { headers: { origin: baseURL }, data: { email: memberEmail, password: "StrongPass123!", remember: false } })).status()).toBe(200);
    const inProgress = await page.request.post("/api/programs/field", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "updateStatus", organizationId, assignmentId, status: "IN_PROGRESS" } });
    expect(inProgress.status()).toBe(200);
    const completed = await page.request.post("/api/programs/field", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "updateStatus", organizationId, assignmentId, status: "COMPLETED" } });
    expect(completed.status()).toBe(200);
    expect((await completed.json()).result.status).toBe("COMPLETED");
    await page.goto("/programs/field", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /لوحة العمليات الميدانية|Field operations board/ })).toBeVisible();
    await expect(page.getByText("E2E site inspection", { exact: true })).toBeVisible();
  } finally {
    if (organizationId) await queryE2E('DELETE FROM "Organization" WHERE id = $1', [organizationId]);
    if (ownerId) await queryE2E('DELETE FROM "User" WHERE id = $1', [ownerId]);
    if (memberId) await queryE2E('DELETE FROM "User" WHERE id = $1', [memberId]);
  }
});