import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  createMarketInquiry,
  createMarketListing,
  listMarketInquiries,
  listMarketListings,
  updateMarketInquiryStatus,
  updateMarketListingStatus,
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
    }, owner.id);
    listingIds.push(strong.id);
    expect(strong.qualityScore).toBeGreaterThanOrEqual(80);
    expect((await updateMarketListingStatus(strong.id, "PUBLISHED", owner.id)).status).toBe("PUBLISHED");

    const visible = await listMarketListings(buyer.id, { countryCode: "SA", kind: "BUSINESS", search: "cafe" });
    expect(visible.map((listing) => listing.id)).toContain(strong.id);
    expect(visible.map((listing) => listing.id)).not.toContain(weak.id);

    await expect(createMarketInquiry(strong.id, "I am interested and want to review the documents.", owner.id)).rejects.toThrow("owner");
    const inquiry = await createMarketInquiry(strong.id, "I am interested and want to review the documents.", buyer.id);
    inquiryIds.push(inquiry.id);
    expect(await db.notification.count({ where: { userId: owner.id, type: "MARKET_INQUIRY" } })).toBe(1);
    expect((await listMarketInquiries(owner.id))[0]?.isListingOwner).toBe(true);
    expect((await updateMarketInquiryStatus(inquiry.id, "CONTACTED", owner.id)).status).toBe("CONTACTED");
  });
});