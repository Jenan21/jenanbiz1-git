import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { setRateLimitProvider } from "@/lib/rate-limit/auth-rate-limit";
import { MemoryRateLimitProvider } from "@/lib/rate-limit/memory-provider";

const mocks = vi.hoisted(() => ({
  acceptMarketNda: vi.fn(),
  confirmCampaignPaymentReceived: vi.fn(),
  createMarketListing: vi.fn(),
  createMarketOffer: vi.fn(),
  createMarketViewingRequest: vi.fn(),
  createStudioDocument: vi.fn(),
  exportStudioDocument: vi.fn(),
  getCurrentUser: vi.fn(),
  listMarketDeals: vi.fn(),
  listMarketInquiries: vi.fn(),
  listMarketListings: vi.fn(),
  listPendingMarketingPaymentRequests: vi.fn(),
  listStudioActivity: vi.fn(),
  listStudioDocuments: vi.fn(),
  requestCampaignPayment: vi.fn(),
  restoreStudioDocument: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/services/market/market-service", () => ({
  acceptMarketNda: mocks.acceptMarketNda,
  createMarketInquiry: vi.fn(),
  createMarketListing: mocks.createMarketListing,
  createMarketOffer: mocks.createMarketOffer,
  createMarketViewingRequest: mocks.createMarketViewingRequest,
  listMarketDeals: mocks.listMarketDeals,
  listMarketInquiries: mocks.listMarketInquiries,
  listMarketListings: mocks.listMarketListings,
  updateMarketInquiryStatus: vi.fn(),
  updateMarketListingStatus: vi.fn(),
  updateMarketOfferStatus: vi.fn(),
  updateMarketViewingStatus: vi.fn(),
}));
vi.mock("@/services/marketing/campaign-service", () => ({
  confirmCampaignPaymentReceived: mocks.confirmCampaignPaymentReceived,
  createMarketingAudienceSegment: vi.fn(),
  createMarketingCampaign: vi.fn(),
  createMarketingLead: vi.fn(),
  getMarketingReadiness: vi.fn(),
  listMarketingCampaigns: vi.fn(),
  listPendingMarketingPaymentRequests: mocks.listPendingMarketingPaymentRequests,
  refreshMarketingCampaignPerformance: vi.fn(),
  requestCampaignPayment: mocks.requestCampaignPayment,
  updateMarketingCampaignStatus: vi.fn(),
  updateMarketingLead: vi.fn(),
}));
vi.mock("@/services/software/software-access", () => ({ listSoftwareOrganizations: vi.fn() }));
vi.mock("@/services/studio/studio-export-service", () => ({ exportStudioDocument: mocks.exportStudioDocument }));
vi.mock("@/services/studio/studio-document-service", () => ({
  createStudioDocument: mocks.createStudioDocument,
  listStudioActivity: mocks.listStudioActivity,
  listStudioDocuments: mocks.listStudioDocuments,
  restoreStudioDocument: mocks.restoreStudioDocument,
  updateStudioDocument: vi.fn(),
}));

import { GET as marketGet, POST as marketPost } from "@/app/api/market/route";
import { POST as marketingPost } from "@/app/api/marketing/route";
import { GET as paymentRequestsGet, POST as paymentRequestsPost } from "@/app/api/marketing/payment-requests/route";
import { POST as studioDocumentsPost } from "@/app/api/studio/documents/route";
import { POST as studioExportPost } from "@/app/api/studio/export/route";

const listingId = "cmarketlisting0000000000001";
const campaignId = "ccampaign00000000000000001";
const origin = "http://localhost";
const prismaFailure = () =>
  new Prisma.PrismaClientKnownRequestError("Invalid `prisma.marketOffer.create()` invocation in /var/task/.next/server/chunks/ssr/x.js:12", { clientVersion: "7.9.1", code: "P2000" });

function post(path: string, body: unknown) {
  return new NextRequest(`${origin}${path}`, { body: JSON.stringify(body), headers: { "content-type": "application/json", origin }, method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  setRateLimitProvider(new MemoryRateLimitProvider());
  mocks.getCurrentUser.mockResolvedValue({ id: "user-1", systemRole: "USER" });
});

describe("market route", () => {
  it("never echoes a database error, and keeps messages the service wrote on purpose", async () => {
    mocks.createMarketOffer.mockRejectedValueOnce(prismaFailure());
    const hidden = await marketPost(post("/api/market", { action: "createOffer", amountMinor: 100, listingId, terms: "Subject to verification of records." }));
    expect(hidden.status).toBe(409);
    const body = await hidden.json();
    expect(body.message).toMatch(/^Market command failed \(ref [0-9a-f]{8}\)$/);
    expect(JSON.stringify(body)).not.toMatch(/prisma|invocation|var\/task/i);

    mocks.createMarketOffer.mockRejectedValueOnce(new Error("Published listing not found"));
    const deliberate = await marketPost(post("/api/market", { action: "createOffer", amountMinor: 100, listingId, terms: "Subject to verification of records." }));
    expect(deliberate.status).toBe(404);
    expect((await deliberate.json()).message).toBe("Published listing not found");
  });

  it("refuses numbers that would not fit the 32-bit price columns before they reach the database", async () => {
    const listing = { action: "create", kind: "BUSINESS", summary: "A documented operating business with audited demand and a controlled review process.", title: "Cafe business" };
    expect((await marketPost(post("/api/market", { ...listing, askingPriceMinor: 2_147_483_648 }))).status).toBe(400);
    mocks.createMarketListing.mockResolvedValueOnce({ id: "listing-1" });
    expect((await marketPost(post("/api/market", { ...listing, askingPriceMinor: 2_147_483_647 }))).status).toBe(201);
    const offer = { action: "createOffer", listingId, terms: "Subject to verification of records." };
    expect((await marketPost(post("/api/market", { ...offer, amountMinor: 10_000_000_000 }))).status).toBe(400);
    expect((await marketPost(post("/api/market", { ...offer, amountMinor: 2_147_483_648 }))).status).toBe(400);
    expect(mocks.createMarketOffer).not.toHaveBeenCalled();
  });

  it("budgets offers per user per hour and every write per user per minute", async () => {
    mocks.createMarketOffer.mockResolvedValue({ id: "offer-1" });
    const offer = { action: "createOffer", amountMinor: 100, listingId, terms: "Subject to verification of records." };
    for (let index = 0; index < 20; index += 1) expect((await marketPost(post("/api/market", offer))).status).toBe(201);
    const blocked = await marketPost(post("/api/market", offer));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    expect(mocks.createMarketOffer).toHaveBeenCalledTimes(20);

    // Another user, and other actions of the same user, are not affected by the offer budget.
    mocks.getCurrentUser.mockResolvedValue({ id: "user-2", systemRole: "USER" });
    expect((await marketPost(post("/api/market", offer))).status).toBe(201);
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1", systemRole: "USER" });
    mocks.acceptMarketNda.mockResolvedValue({ id: "nda-1" });
    // Twenty-one writes were already counted for user-1 (the blocked one still counts toward the minute budget).
    for (let index = 0; index < 39; index += 1) expect((await marketPost(post("/api/market", { action: "acceptNda", listingId }))).status).toBe(200);
    expect((await marketPost(post("/api/market", { action: "acceptNda", listingId }))).status).toBe(429);
  });

  it("validates the list query and pages inquiries, viewings and offers by cursor", async () => {
    mocks.listMarketListings.mockResolvedValue([]);
    mocks.listMarketInquiries.mockResolvedValue({ inquiries: [], nextCursor: "cinquirycursor00000000001" });
    mocks.listMarketDeals.mockResolvedValue({ nextCursors: { offers: "cofferscursor00000000000001", viewings: null }, offers: [], viewings: [] });
    const get = (query: string) => marketGet(new NextRequest(`${origin}/api/market${query}`));

    expect((await get("?limit=abc")).status).toBe(400);
    expect((await get("?take=5000")).status).toBe(400);
    expect((await get("?kind=EVIL")).status).toBe(400);
    expect((await get("?offersCursor=not-a-cursor")).status).toBe(400);

    const response = await get("?take=25&offersCursor=cprevcursor000000000000001&kind=BUSINESS&search=");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pagination).toEqual({ inquiriesNextCursor: "cinquirycursor00000000001", offersNextCursor: "cofferscursor00000000000001", take: 25, viewingsNextCursor: null });
    expect(mocks.listMarketDeals).toHaveBeenCalledWith("user-1", { offersCursor: "cprevcursor000000000000001", take: 25, viewingsCursor: undefined });
    expect(mocks.listMarketInquiries).toHaveBeenCalledWith("user-1", { cursor: undefined, take: 25 });
    expect(mocks.listMarketListings).toHaveBeenCalledWith("user-1", expect.objectContaining({ kind: "BUSINESS", limit: 50, offset: 0, search: undefined }));

    mocks.listMarketListings.mockClear();
    const dealsOnly = await get("?section=deals");
    expect(dealsOnly.status).toBe(200);
    expect(Object.keys(await dealsOnly.json()).sort()).toEqual(["offers", "pagination", "success", "viewings"]);
    expect(mocks.listMarketListings).not.toHaveBeenCalled();
  });
});

describe("marketing routes", () => {
  it("only records a payment request for the campaign's owner, and no longer has a self-service confirmation", async () => {
    mocks.requestCampaignPayment.mockResolvedValue({ id: campaignId, payment: { status: "PENDING" } });
    const requested = await marketingPost(post("/api/marketing", { action: "requestPayment", campaignId }));
    expect(requested.status).toBe(200);
    expect(mocks.requestCampaignPayment).toHaveBeenCalledWith(campaignId, "user-1");

    const legacy = await marketingPost(post("/api/marketing", { action: "confirmPaymentAndAssign", campaignId }));
    expect(legacy.status).toBe(400);
    expect(mocks.confirmCampaignPaymentReceived).not.toHaveBeenCalled();
  });

  it("answers a database failure with a reference, not with the error", async () => {
    mocks.requestCampaignPayment.mockRejectedValueOnce(prismaFailure());
    const response = await marketingPost(post("/api/marketing", { action: "requestPayment", campaignId }));
    const body = await response.json();
    expect(body.message).toMatch(/^Marketing command failed \(ref [0-9a-f]{8}\)$/);
  });

  it("lets only administrators list and confirm payment requests", async () => {
    const confirm = { action: "confirmPaymentReceived", amountMinor: 1_200_000, campaignId, reference: "TRX-20261013-001" };
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await paymentRequestsGet()).status).toBe(401);
    expect((await paymentRequestsPost(post("/api/marketing/payment-requests", confirm))).status).toBe(401);

    for (const systemRole of ["USER", "EMPLOYEE", "SUPERVISOR", "MANAGER", "ELITE_COMMITTEE"]) {
      mocks.getCurrentUser.mockResolvedValue({ id: "user-1", systemRole });
      expect((await paymentRequestsGet()).status, systemRole).toBe(403);
      expect((await paymentRequestsPost(post("/api/marketing/payment-requests", confirm))).status, systemRole).toBe(403);
    }
    expect(mocks.listPendingMarketingPaymentRequests).not.toHaveBeenCalled();
    expect(mocks.confirmCampaignPaymentReceived).not.toHaveBeenCalled();

    for (const systemRole of ["ADMIN", "SUPER_ADMIN"]) {
      mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", systemRole });
      mocks.listPendingMarketingPaymentRequests.mockResolvedValueOnce([]);
      expect((await paymentRequestsGet()).status, systemRole).toBe(200);
      mocks.confirmCampaignPaymentReceived.mockResolvedValueOnce({ id: campaignId, status: "ACTIVE" });
      expect((await paymentRequestsPost(post("/api/marketing/payment-requests", confirm))).status, systemRole).toBe(200);
    }
    expect(mocks.confirmCampaignPaymentReceived).toHaveBeenCalledWith({ action: "confirmPaymentReceived", amountMinor: 1_200_000, campaignId, reference: "TRX-20261013-001" }, "admin-1");
  });

  it("requires the amount and a reference, and a same-site request", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", systemRole: "ADMIN" });
    const confirm = { action: "confirmPaymentReceived", amountMinor: 1_200_000, campaignId, reference: "TRX-1" };
    for (const invalid of [{ ...confirm, reference: "" }, { ...confirm, reference: "ab" }, { ...confirm, amountMinor: 0 }, { ...confirm, amountMinor: 2_147_483_648 }, { ...confirm, campaignId: "not-a-cuid" }, { action: "confirmPaymentReceived", campaignId }]) {
      expect((await paymentRequestsPost(post("/api/marketing/payment-requests", invalid))).status).toBe(400);
    }
    const crossSite = new NextRequest(`${origin}/api/marketing/payment-requests`, { body: JSON.stringify(confirm), headers: { "content-type": "application/json", origin: "https://evil.example" }, method: "POST" });
    expect((await paymentRequestsPost(crossSite)).status).toBe(403);
    expect(mocks.confirmCampaignPaymentReceived).not.toHaveBeenCalled();
  });

  it("reports a refused confirmation with the service's own words", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", systemRole: "ADMIN" });
    mocks.confirmCampaignPaymentReceived.mockRejectedValueOnce(new Error("Campaign payment already confirmed"));
    const response = await paymentRequestsPost(post("/api/marketing/payment-requests", { action: "confirmPaymentReceived", amountMinor: 100, campaignId, reference: "TRX-0001" }));
    expect(response.status).toBe(409);
    expect((await response.json()).message).toBe("Campaign payment already confirmed");
  });
});

describe("studio routes", () => {
  it("budgets exports per user and hides internal failures", async () => {
    mocks.exportStudioDocument.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), extension: "docx", mimeType: "application/octet-stream" });
    const exportRequest = { content: { body: "text" }, kind: "DOCS", title: "Decision memo" };
    for (let index = 0; index < 20; index += 1) expect((await studioExportPost(post("/api/studio/export", exportRequest))).status).toBe(200);
    expect((await studioExportPost(post("/api/studio/export", exportRequest))).status).toBe(429);

    setRateLimitProvider(new MemoryRateLimitProvider());
    mocks.exportStudioDocument.mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'rows') at /srv/app/services/studio/x.ts:44:9"));
    const failed = await studioExportPost(post("/api/studio/export", exportRequest));
    expect(failed.status).toBe(409);
    expect((await failed.json()).message).toMatch(/^Studio export failed \(ref [0-9a-f]{8}\)$/);

    mocks.exportStudioDocument.mockRejectedValueOnce(new Error("Studio export input is invalid"));
    expect((await (await studioExportPost(post("/api/studio/export", exportRequest))).json()).message).toBe("Studio export input is invalid");
  });

  it("keeps the restore version inside the 32-bit column and hides database failures", async () => {
    const restore = { action: "restore", documentId: "cstudiodocument000000000001" };
    expect((await studioDocumentsPost(post("/api/studio/documents", { ...restore, version: 2_147_483_648 }))).status).toBe(400);
    mocks.restoreStudioDocument.mockRejectedValueOnce(prismaFailure());
    const failed = await studioDocumentsPost(post("/api/studio/documents", { ...restore, version: 2_147_483_647 }));
    expect(failed.status).toBe(409);
    expect((await failed.json()).message).toMatch(/^Studio command failed \(ref [0-9a-f]{8}\)$/);

    mocks.restoreStudioDocument.mockRejectedValueOnce(new Error("Studio document version not found"));
    const missing = await studioDocumentsPost(post("/api/studio/documents", { ...restore, version: 3 }));
    expect(missing.status).toBe(404);
  });
});
