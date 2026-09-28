import { expect, test } from "@playwright/test";
import { cleanE2EIdentities, createE2ESession, seedE2EAdmin, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";
import { marketFlowDefinitions } from "@/lib/market/market-flow-routes";

const origin = "http://127.0.0.1:3101";
const viewports = [
  { width: 2560, height: 1440 }, { width: 1920, height: 1080 }, { width: 1440, height: 900 },
  { width: 1366, height: 768 }, { width: 1280, height: 800 }, { width: 1024, height: 1366 },
  { width: 820, height: 1180 }, { width: 430, height: 932 }, { width: 390, height: 844 }, { width: 360, height: 800 },
] as const;

test.describe.serial("Jenan Market buyer and seller flow", () => {
  test.setTimeout(600_000);

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
    await seedE2EAdmin();
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  test("protects confidential data and completes NDA, viewing, offer, and deal stages", async ({ browser }) => {
    const ownerContext = await browser.newContext();
    const buyerContext = await browser.newContext();
    const ownerToken = await createE2ESession(e2eIdentity.user.email);
    const buyerToken = await createE2ESession(e2eIdentity.admin.email);
    await ownerContext.addCookies([{ name: "jenan_session", value: ownerToken, url: origin, httpOnly: true, sameSite: "Lax" }, { name: "locale", value: "en", url: origin }]);
    await buyerContext.addCookies([{ name: "jenan_session", value: buyerToken, url: origin, httpOnly: true, sameSite: "Lax" }, { name: "locale", value: "en", url: origin }]);
    const ownerPage = await ownerContext.newPage();
    const buyerPage = await buyerContext.newPage();

    const created = await ownerPage.request.post("/api/market", { headers: { origin }, data: { action: "create", kind: "BUSINESS", title: "Protected E2E Market Listing", summary: "A documented operating business with audited demand, trained staff, stable supplier relationships, repeat customers, and a controlled confidential review process for qualified buyers.", sector: "Services", countryCode: "SA", askingPriceMinor: 5_000_000, valuationNote: "Valuation reflects verified operating assets and revenue history.", confidentialDetails: "Protected lease schedule, monthly operating statements, and supplier contract details.", requiresNda: true } });
    expect(created.status()).toBe(201);
    const listingId = (await created.json()).result.id as string;
    expect((await ownerPage.request.post("/api/market", { headers: { origin }, data: { action: "updateStatus", listingId, status: "PUBLISHED" } })).status()).toBe(200);

    const upload = await ownerPage.request.post("/api/files", { headers: { origin }, multipart: { marketListingId: listingId, marketVisibility: "NDA_REQUIRED", file: { name: "protected-market-document.txt", mimeType: "text/plain", buffer: Buffer.from("Protected market evidence") } } });
    expect(upload.status()).toBe(201);
    const fileId = (await upload.json()).file.id as string;

    const publicPayload = await (await buyerPage.request.get("/api/market")).json();
    const publicListing = publicPayload.listings.find((item: { id: string }) => item.id === listingId);
    expect(publicListing.confidentialDetails).toBeNull();
    expect(publicListing.files).toHaveLength(0);
    expect(publicListing.ndaAccepted).toBe(false);
    expect((await buyerPage.request.get(`/api/files/${fileId}`)).status()).toBe(404);
    expect((await buyerPage.request.post("/api/market", { headers: { origin }, data: { action: "createOffer", listingId, amountMinor: 4_750_000, terms: "Subject to review of protected documents." } })).status()).toBe(409);

    expect((await buyerPage.request.post("/api/market", { headers: { origin }, data: { action: "acceptNda", listingId } })).status()).toBe(200);
    const protectedPayload = await (await buyerPage.request.get("/api/market")).json();
    const protectedListing = protectedPayload.listings.find((item: { id: string }) => item.id === listingId);
    expect(protectedListing.confidentialDetails).toContain("lease schedule");
    expect(protectedListing.files.some((item: { id: string }) => item.id === fileId)).toBe(true);
    expect((await buyerPage.request.get(`/api/files/${fileId}`)).status()).toBe(200);

    const viewing = await buyerPage.request.post("/api/market", { headers: { origin }, data: { action: "createViewing", listingId, preferredAt: new Date(Date.now() + 86_400_000).toISOString(), attendees: 2, notes: "Buyer and financial advisor" } });
    expect(viewing.status()).toBe(201);
    const viewingId = (await viewing.json()).result.id as string;
    const offer = await buyerPage.request.post("/api/market", { headers: { origin }, data: { action: "createOffer", listingId, amountMinor: 4_750_000, terms: "Subject to verification of the protected records and inventory reconciliation." } });
    expect(offer.status()).toBe(201);
    const offerId = (await offer.json()).result.id as string;
    expect((await ownerPage.request.post("/api/market", { headers: { origin }, data: { action: "updateViewingStatus", viewingId, status: "CONFIRMED" } })).status()).toBe(200);
    expect((await ownerPage.request.post("/api/market", { headers: { origin }, data: { action: "updateOfferStatus", offerId, status: "NEGOTIATING" } })).status()).toBe(200);
    expect((await ownerPage.request.post("/api/market", { headers: { origin }, data: { action: "updateOfferStatus", offerId, status: "ACCEPTED" } })).status()).toBe(200);

    for (const definition of marketFlowDefinitions) {
      const page = definition.route.startsWith("/market/sell") ? ownerPage : buyerPage;
      const response = await page.goto(definition.route, { waitUntil: "domcontentloaded" });
      expect(response?.status(), definition.route).toBe(200);
      await expect(page.locator(".market-flow")).toBeVisible();
      await expect(page.locator(".market-flow")).toHaveAttribute("data-market-route", definition.route);
      await expect(page.locator(".market-flow")).toHaveAttribute("data-market-kind", definition.kind);
      await expect(page.locator(".market-flow")).toHaveAttribute("data-market-source", "CONNECTED");
      await expect(page.locator(".market-flow__nav a.is-active")).toHaveAttribute("href", definition.route);
      if (definition.route === "/market/listings") {
        await expect(page.locator(".market-listing-catalog")).toBeVisible();
        await expect(page.locator(".market-flow__listing")).toHaveCount(0);
      }
      if (definition.route === "/market/deal/sample") await expect(page.locator(".market-flow__timeline span").last()).toHaveClass(/is-complete/);
      if (definition.route === "/market/deal/sample/report") {
        await expect(page.locator(".market-deal-report")).toBeVisible();
        await expect(page.locator(".market-flow__deal")).toHaveCount(0);
        await expect(page.locator(".market-flow")).toHaveAttribute("data-market-outputs", "PRINT_PDF,SHARE_LINK");
      }
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
      expect(layout.scrollWidth, definition.route).toBeLessThanOrEqual(layout.viewportWidth + 1);
    }

    for (const viewport of viewports) {
      await buyerPage.setViewportSize(viewport);
      expect((await buyerPage.goto("/market", { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
      await expect(buyerPage.locator(".market-workspace")).toHaveAttribute("data-market-route", "/market");
      expect(await buyerPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `/market at ${viewport.width}x${viewport.height}`).toBe(true);
      for (const definition of marketFlowDefinitions) {
        const page = definition.route.startsWith("/market/sell") ? ownerPage : buyerPage;
        await page.setViewportSize(viewport);
        expect((await page.goto(definition.route, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
        await expect(page.locator(".market-flow")).toHaveAttribute("data-market-route", definition.route);
        const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
        expect(layout.scrollWidth, `${definition.route} at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(layout.viewportWidth + 1);
      }
    }

    expect((await ownerPage.request.delete(`/api/files/${fileId}`, { headers: { origin } })).status()).toBe(204);
    await ownerContext.close();
    await buyerContext.close();
  });
});