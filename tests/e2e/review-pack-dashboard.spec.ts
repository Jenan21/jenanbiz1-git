import { expect, test } from "@playwright/test";
import { queryE2E } from "./identity-fixture";

test("serves a private user dashboard with real account metrics", async ({ baseURL, browser, page }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const suffix = Date.now();
  let ownerId: string | undefined;
  let otherUserId: string | undefined;
  let otherContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    expect((await page.request.get("/api/dashboard")).status()).toBe(401);
    const owner = await page.request.post("/api/auth/register", {
      headers: { origin: baseURL },
      data: { displayName: "Dashboard Owner", countryCode: "SA", email: `dashboard-owner-${suffix}@example.test`, password: "StrongPass123!", locale: "en", language: "en" },
    });
    expect(owner.status()).toBe(201);
    ownerId = (await owner.json()).user.id as string;
    const project = await page.request.post("/api/projects", {
      headers: { origin: baseURL, "Content-Type": "application/json" },
      data: { action: "create", name: "Dashboard API Project", description: "A project used to verify dashboard metrics." },
    });
    expect(project.status()).toBe(201);

    const dashboard = await page.request.get("/api/dashboard");
    expect(dashboard.status()).toBe(200);
    expect((await dashboard.json()).dashboard.metrics.projects).toEqual({ total: 1, active: 0 });

    otherContext = await browser.newContext({ baseURL });
    const other = await otherContext.request.post("/api/auth/register", {
      headers: { origin: baseURL },
      data: { displayName: "Other Dashboard User", countryCode: "SA", email: `dashboard-other-${suffix}@example.test`, password: "StrongPass123!", locale: "en", language: "en" },
    });
    expect(other.status()).toBe(201);
    otherUserId = (await other.json()).user.id as string;
    const privateDashboard = await otherContext.request.get("/api/dashboard");
    expect(privateDashboard.status()).toBe(200);
    expect((await privateDashboard.json()).dashboard.metrics.projects).toEqual({ total: 0, active: 0 });
  } finally {
    await otherContext?.close();
    if (ownerId) {
      await queryE2E('DELETE FROM "Project" WHERE "createdById" = $1', [ownerId]);
      await queryE2E('DELETE FROM "User" WHERE id = $1', [ownerId]);
    }
    if (otherUserId) await queryE2E('DELETE FROM "User" WHERE id = $1', [otherUserId]);
  }
});