import { expect, test } from "@playwright/test";
import { queryE2E } from "./identity-fixture";

test("creates, publishes, and displays a market listing", async ({ baseURL, page }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const email = `market-listing-${Date.now()}@example.test`;
  let listingId: string | undefined;
  let userId: string | undefined;

  try {
    const unauthenticated = await page.request.get("/api/market");
    expect(unauthenticated.status()).toBe(401);

    const registration = await page.request.post("/api/auth/register", {
      headers: { origin: baseURL },
      data: {
        displayName: "Market Listing User",
        countryCode: "SA",
        email,
        password: "StrongPass123!",
        locale: "en",
        language: "en",
      },
    });
    expect(registration.status()).toBe(201);
    userId = (await registration.json()).user.id as string;

    const created = await page.request.post("/api/market", {
      headers: { origin: baseURL, "Content-Type": "application/json" },
      data: {
        action: "create",
        kind: "PROJECT",
        title: "E2E Market Project",
        summary: "A validated project opportunity for the market acceptance test.",
        sector: "Technology",
        countryCode: "SA",
      },
    });
    expect(created.status()).toBe(201);
    const createdPayload = await created.json();
    listingId = createdPayload.result.id as string;
    expect(createdPayload.result.status).toBe("DRAFT");

    const published = await page.request.post("/api/market", {
      headers: { origin: baseURL, "Content-Type": "application/json" },
      data: { action: "updateStatus", listingId, status: "PUBLISHED" },
    });
    expect(published.status()).toBe(200);
    expect((await published.json()).result.status).toBe("PUBLISHED");

    await page.goto("/market", { waitUntil: "networkidle" });
    await expect(page.locator(".market-workspace")).toBeVisible();
    await expect(page.getByRole("heading", { name: "E2E Market Project" })).toBeVisible();
  } finally {
    if (listingId) await queryE2E('DELETE FROM "MarketListing" WHERE id = $1', [listingId]);
    if (userId) await queryE2E('DELETE FROM "User" WHERE id = $1', [userId]);
  }
});