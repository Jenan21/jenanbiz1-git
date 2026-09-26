import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  acceptMarketNda,
  createMarketInquiry,
  createMarketListing,
  createMarketOffer,
  createMarketViewingRequest,
  listMarketDeals,
  listMarketInquiries,
  listMarketListings,
  updateMarketInquiryStatus,
  updateMarketListingStatus,
  updateMarketOfferStatus,
  updateMarketViewingStatus,
} from "@/services/market/market-service";

const suffix = crypto.randomUUID().slice(0, 8);
let ownerId: string | undefined;
let buyerId: string | undefined;
const listingIds: string[] = [];
const inquiryIds: string[] = [];

afterAll(async () => {
  if (inquiryIds.length) await db.marketInquiry.deleteMany({ where: { id: { in: inquiryIds } } });
  if (listingIds.length) await db.marketListing.deleteMany({ where: { id: { in: listingIds } } });
  if (ownerId) await db.notification.deleteMany({ where: { userId: ownerId } });
  if (buyerId) await db.user.delete({ where: { id: buyerId } });
  if (ownerId) await db.user.delete({ where: { id: ownerId } });
  await db.$disconnect();
});

describe("market domain", () => {
  it("scores listings, gates weak publication, filters opportunities, and tracks inquiries", async () => {
    const owner = await db.user.create({ data: { email: `market-owner-${suffix}@example.test`, status: "ACTIVE", profile: { create: { displayName: "Market owner", locale: "en", language: "en" } } } });
    const buyer = await db.user.create({ data: { email: `market-buyer-${suffix}@example.test`, status: "ACTIVE", profile: { create: { displayName: "Market buyer", locale: "en", language: "en" } } } });
    ownerId = owner.id;
    buyerId = buyer.id;

    const weak = await createMarketListing({ kind: "PROJECT", title: `Weak ${suffix}`, summary: "Short but valid market summary.", sector: "Retail" }, owner.id);
    listingIds.push(weak.id);
    expect(weak.qualityScore).toBeLessThan(50);
    await expect(updateMarketListingStatus(weak.id, "PUBLISHED", owner.id)).rejects.toThrow("quality score");

    const strong = await createMarketListing({
      askingPriceMinor: 2_500_000,
      countryCode: "SA",
      kind: "BUSINESS",
      sector: "Food services",
      summary: "A documented profitable cafe business with audited monthly demand, repeat customers, trained staff, lease clarity, inventory controls, and expansion potential across nearby districts.",
      title: `Premium cafe opportunity ${suffix}`,
      valuationNote: "Price is based on current revenue, equipment, lease position, and verified demand indicators.",
      confidentialDetails: "Verified lease terms and audited monthly statements are available after NDA acceptance.",
      requiresNda: true,
    }, owner.id);
    listingIds.push(strong.id);
    expect(strong.qualityScore).toBeGreaterThanOrEqual(80);
    expect((await updateMarketListingStatus(strong.id, "PUBLISHED", owner.id)).status).toBe("PUBLISHED");

    const visible = await listMarketListings(buyer.id, { countryCode: "SA", kind: "BUSINESS", search: "cafe" });
    expect(visible.map((listing) => listing.id)).toContain(strong.id);
    expect(visible.map((listing) => listing.id)).not.toContain(weak.id);
    expect(visible.find((listing) => listing.id === strong.id)?.confidentialDetails).toBeNull();
    expect(visible.find((listing) => listing.id === strong.id)?.ndaAccepted).toBe(false);

    await expect(createMarketViewingRequest({ listingId: strong.id, preferredAt: new Date(Date.now() + 86_400_000), attendees: 2 }, buyer.id)).rejects.toThrow("NDA acceptance");
    await acceptMarketNda(strong.id, buyer.id);
    const protectedListing = (await listMarketListings(buyer.id)).find((listing) => listing.id === strong.id);
    expect(protectedListing?.ndaAccepted).toBe(true);
    expect(protectedListing?.confidentialDetails).toContain("audited monthly statements");

    const viewing = await createMarketViewingRequest({ listingId: strong.id, preferredAt: new Date(Date.now() + 86_400_000), attendees: 2, notes: "Two decision makers will attend." }, buyer.id);
    expect((await updateMarketViewingStatus(viewing.id, "CONFIRMED", owner.id)).status).toBe("CONFIRMED");
    const offer = await createMarketOffer({ listingId: strong.id, amountMinor: 2_350_000, terms: "Subject to document verification and final inventory reconciliation." }, buyer.id);
    expect((await updateMarketOfferStatus(offer.id, "NEGOTIATING", owner.id)).status).toBe("NEGOTIATING");
    expect((await updateMarketOfferStatus(offer.id, "ACCEPTED", owner.id)).status).toBe("ACCEPTED");
    const deals = await listMarketDeals(owner.id);
    expect(deals.viewings.some((item) => item.id === viewing.id)).toBe(true);
    expect(deals.offers.some((item) => item.id === offer.id && item.status === "ACCEPTED")).toBe(true);

    await expect(createMarketInquiry(strong.id, "I am interested and want to review the documents.", owner.id)).rejects.toThrow("owner");
    const inquiry = await createMarketInquiry(strong.id, "I am interested and want to review the documents.", buyer.id);
    inquiryIds.push(inquiry.id);
    expect(await db.notification.count({ where: { userId: owner.id, type: "MARKET_INQUIRY" } })).toBe(1);
    expect((await listMarketInquiries(owner.id))[0]?.isListingOwner).toBe(true);
    expect((await updateMarketInquiryStatus(inquiry.id, "CONTACTED", owner.id)).status).toBe("CONTACTED");
  });
});