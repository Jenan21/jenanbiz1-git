import { expect, test } from "@playwright/test";
import { queryE2E } from "./identity-fixture";

test("creates an organization and activates an operational program", async ({ baseURL, page }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const email = `programs-${Date.now()}@example.test`;
  let organizationId: string | undefined;
  let userId: string | undefined;

  try {
    const registration = await page.request.post("/api/auth/register", {
      headers: { origin: baseURL },
      data: { displayName: "Programs User", countryCode: "SA", email, password: "StrongPass123!", locale: "en", language: "en" },
    });
    expect(registration.status()).toBe(201);
    userId = (await registration.json()).user.id as string;

    const organization = await page.request.post("/api/programs", {
      headers: { origin: baseURL, "Content-Type": "application/json" },
      data: { action: "createOrganization", name: "E2E Operations Company" },
    });
    expect(organization.status()).toBe(201);
    organizationId = (await organization.json()).result.id as string;

    const activation = await page.request.post("/api/programs", {
      headers: { origin: baseURL, "Content-Type": "application/json" },
      data: { action: "activate", organizationId, key: "FINANCE" },
    });
    expect(activation.status()).toBe(201);
    expect((await activation.json()).result.status).toBe("ACTIVE");

    const programs = await page.request.get("/api/programs");
    expect(programs.status()).toBe(200);
    expect((await programs.json()).organizations[0].organization.businessPrograms[0].key).toBe("FINANCE");

    await page.goto("/programs", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /برامج جنان للمنشآت|Jenan organization programs/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /العمليات المالية|Financial operations/ })).toBeVisible();
  } finally {
    if (organizationId) await queryE2E('DELETE FROM "Organization" WHERE id = $1', [organizationId]);
    if (userId) await queryE2E('DELETE FROM "User" WHERE id = $1', [userId]);
  }
});