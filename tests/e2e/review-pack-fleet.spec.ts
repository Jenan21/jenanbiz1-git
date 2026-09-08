import { expect, test } from "@playwright/test";
import { queryE2E } from "./identity-fixture";

test("registers and updates fleet vehicles only through an active fleet program", async ({ baseURL, page }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const email = `fleet-${Date.now()}@example.test`;
  let organizationId: string | undefined;
  let userId: string | undefined;
  try {
    const registration = await page.request.post("/api/auth/register", { headers: { origin: baseURL }, data: { displayName: "Fleet Owner", countryCode: "SA", email, password: "StrongPass123!", locale: "en", language: "en" } });
    userId = (await registration.json()).user.id as string;
    const organization = await page.request.post("/api/programs", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "createOrganization", name: "E2E Fleet Company" } });
    organizationId = (await organization.json()).result.id as string;
    expect((await page.request.get(`/api/programs/fleet?organizationId=${organizationId}`)).status()).toBe(403);
    await page.request.post("/api/programs", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "activate", organizationId, key: "FLEET" } });
    const created = await page.request.post("/api/programs/fleet", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "create", organizationId, label: "E2E Delivery Van", plateNumber: "E2E-101" } });
    expect(created.status()).toBe(201);
    const vehicleId = (await created.json()).result.id as string;
    const maintenance = await page.request.post("/api/programs/fleet", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "updateStatus", organizationId, vehicleId, status: "MAINTENANCE" } });
    expect((await maintenance.json()).result.status).toBe("MAINTENANCE");
    await page.goto("/programs/fleet", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /إدارة أسطول المنشأة|Organization fleet management/ })).toBeVisible();
    await expect(page.getByText("E2E Delivery Van", { exact: true })).toBeVisible();
  } finally {
    if (organizationId) await queryE2E('DELETE FROM "Organization" WHERE id = $1', [organizationId]);
    if (userId) await queryE2E('DELETE FROM "User" WHERE id = $1', [userId]);
  }
});