import { expect, test } from "@playwright/test";
import { queryE2E } from "./identity-fixture";

test("records financial entries only through an active finance program", async ({ baseURL, page }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const email = `finance-${Date.now()}@example.test`;
  let organizationId: string | undefined;
  let userId: string | undefined;
  try {
    const registration = await page.request.post("/api/auth/register", { headers: { origin: baseURL }, data: { displayName: "Finance User", countryCode: "SA", email, password: "StrongPass123!", locale: "en", language: "en" } });
    expect(registration.status()).toBe(201);
    userId = (await registration.json()).user.id as string;
    const organization = await page.request.post("/api/programs", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "createOrganization", name: "E2E Finance Company" } });
    organizationId = (await organization.json()).result.id as string;
    const forbidden = await page.request.post("/api/programs/finance", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { organizationId, type: "INCOME", amountMinor: 10000, currency: "SAR", description: "Unapproved income", occurredAt: new Date().toISOString() } });
    expect(forbidden.status()).toBe(403);
    const activation = await page.request.post("/api/programs", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "activate", organizationId, key: "FINANCE" } });
    expect(activation.status()).toBe(201);
    const recorded = await page.request.post("/api/programs/finance", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { organizationId, type: "INCOME", amountMinor: 125000, currency: "SAR", description: "E2E operating income", occurredAt: new Date().toISOString() } });
    expect(recorded.status()).toBe(201);
    expect((await recorded.json()).entry.amountMinor).toBe(125000);
    const ledger = await page.request.get(`/api/programs/finance?organizationId=${organizationId}`);
    expect(ledger.status()).toBe(200);
    expect((await ledger.json()).entries).toHaveLength(1);

    await page.goto("/programs/finance", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /الدفتر المالي التشغيلي|Operational financial ledger/ })).toBeVisible();
    await expect(page.getByText("E2E operating income", { exact: true })).toBeVisible();
  } finally {
    if (organizationId) await queryE2E('DELETE FROM "Organization" WHERE id = $1', [organizationId]);
    if (userId) await queryE2E('DELETE FROM "User" WHERE id = $1', [userId]);
  }
});