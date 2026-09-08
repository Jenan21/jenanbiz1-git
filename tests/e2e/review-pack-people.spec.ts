import { expect, test } from "@playwright/test";
import { queryE2E } from "./identity-fixture";

test("an organization owner invites a registered user who must accept before activation", async ({ baseURL, page }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const suffix = Date.now();
  const ownerEmail = `people-owner-${suffix}@example.test`;
  const memberEmail = `people-member-${suffix}@example.test`;
  let organizationId: string | undefined;
  let ownerId: string | undefined;
  let memberId: string | undefined;
  try {
    const ownerRegistration = await page.request.post("/api/auth/register", { headers: { origin: baseURL }, data: { displayName: "People Owner", countryCode: "SA", email: ownerEmail, password: "StrongPass123!", locale: "en", language: "en" } });
    expect(ownerRegistration.status()).toBe(201);
    ownerId = (await ownerRegistration.json()).user.id as string;
    const memberRegistration = await page.request.post("/api/auth/register", { headers: { origin: baseURL }, data: { displayName: "People Member", countryCode: "SA", email: memberEmail, password: "StrongPass123!", locale: "en", language: "en" } });
    expect(memberRegistration.status()).toBe(201);
    memberId = (await memberRegistration.json()).user.id as string;
    const ownerLogin = await page.request.post("/api/auth/login", { headers: { origin: baseURL }, data: { email: ownerEmail, password: "StrongPass123!", remember: false } });
    expect(ownerLogin.status()).toBe(200);
    const organization = await page.request.post("/api/programs", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "createOrganization", name: "E2E People Company" } });
    organizationId = (await organization.json()).result.id as string;
    await page.request.post("/api/programs", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "activate", organizationId, key: "PEOPLE" } });
    const invitation = await page.request.post("/api/programs/people", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "invite", organizationId, email: memberEmail } });
    expect(invitation.status()).toBe(201);
    const membershipId = (await invitation.json()).result.id as string;
    const memberLogin = await page.request.post("/api/auth/login", { headers: { origin: baseURL }, data: { email: memberEmail, password: "StrongPass123!", remember: false } });
    expect(memberLogin.status()).toBe(200);
    const pending = await page.request.get("/api/programs/people");
    expect((await pending.json()).invitations).toHaveLength(1);
    const accepted = await page.request.post("/api/programs/people", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "acceptInvitation", membershipId } });
    expect(accepted.status()).toBe(200);
    expect((await accepted.json()).result.status).toBe("ACTIVE");
    await page.goto("/programs/people", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /إدارة الأفراد والفرق|People and team operations/ })).toBeVisible();
  } finally {
    if (organizationId) await queryE2E('DELETE FROM "Organization" WHERE id = $1', [organizationId]);
    if (ownerId) await queryE2E('DELETE FROM "User" WHERE id = $1', [ownerId]);
    if (memberId) await queryE2E('DELETE FROM "User" WHERE id = $1', [memberId]);
  }
});