import { expect, test } from "@playwright/test";
import { queryE2E } from "./identity-fixture";

test("lets a buyer inquire about a published listing and only its owner manage the inquiry", async ({ baseURL, page }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const suffix = Date.now();
  const ownerEmail = `market-owner-${suffix}@example.test`;
  const buyerEmail = `market-buyer-${suffix}@example.test`;
  let listingId: string | undefined;
  let ownerId: string | undefined;
  let buyerId: string | undefined;
  try {
    const ownerRegistration = await page.request.post("/api/auth/register", { headers: { origin: baseURL }, data: { displayName: "Market Owner", countryCode: "SA", email: ownerEmail, password: "StrongPass123!", locale: "en", language: "en" } });
    ownerId = (await ownerRegistration.json()).user.id as string;
    const buyerRegistration = await page.request.post("/api/auth/register", { headers: { origin: baseURL }, data: { displayName: "Market Buyer", countryCode: "SA", email: buyerEmail, password: "StrongPass123!", locale: "en", language: "en" } });
    buyerId = (await buyerRegistration.json()).user.id as string;
    expect((await page.request.post("/api/auth/login", { headers: { origin: baseURL }, data: { email: ownerEmail, password: "StrongPass123!", remember: false } })).status()).toBe(200);
    const created = await page.request.post("/api/market", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "create", kind: "BUSINESS", title: "E2E Market Inquiry Business", summary: "Published opportunity used to verify buyer inquiry and owner follow-up." } });
    listingId = (await created.json()).result.id as string;
    expect((await page.request.post("/api/market", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "updateStatus", listingId, status: "PUBLISHED" } })).status()).toBe(200);
    expect((await page.request.post("/api/auth/login", { headers: { origin: baseURL }, data: { email: buyerEmail, password: "StrongPass123!", remember: false } })).status()).toBe(200);
    const inquiry = await page.request.post("/api/market", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "createInquiry", listingId, message: "I would like to discuss this published opportunity." } });
    expect(inquiry.status()).toBe(201);
    const inquiryId = (await inquiry.json()).result.id as string;
    const notifications = await queryE2E<{ count: string }>('SELECT COUNT(*)::text AS count FROM "Notification" WHERE "userId" = $1 AND type = $2', [ownerId, "MARKET_INQUIRY"]);
    expect(notifications.rows[0]?.count).toBe("1");
    expect((await page.request.post("/api/market", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "updateInquiryStatus", inquiryId, status: "CONTACTED" } })).status()).toBe(404);
    expect((await page.request.post("/api/auth/login", { headers: { origin: baseURL }, data: { email: ownerEmail, password: "StrongPass123!", remember: false } })).status()).toBe(200);
    const ownerMarket = await page.request.get("/api/market");
    expect((await ownerMarket.json()).inquiries).toHaveLength(1);
    const contacted = await page.request.post("/api/market", { headers: { origin: baseURL, "Content-Type": "application/json" }, data: { action: "updateInquiryStatus", inquiryId, status: "CONTACTED" } });
    expect(contacted.status()).toBe(200);
    await page.goto("/market", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "E2E Market Inquiry Business" })).toBeVisible();
    await expect(page.getByText("I would like to discuss this published opportunity.", { exact: true })).toBeVisible();
  } finally {
    if (listingId) await queryE2E('DELETE FROM "MarketListing" WHERE id = $1', [listingId]);
    if (ownerId) await queryE2E('DELETE FROM "User" WHERE id = $1', [ownerId]);
    if (buyerId) await queryE2E('DELETE FROM "User" WHERE id = $1', [buyerId]);
  }
});