import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { MARKET_LIMITS } from "@/lib/market/market-limits";
import {
  acceptMarketNda,
  createMarketInquiry,
  createMarketListing,
  createMarketOffer,
  createMarketViewingRequest,
  listMarketDeals,
  listMarketInquiries,
  listMarketListings,
  updateMarketListingStatus,
  updateMarketOfferStatus,
} from "@/services/market/market-service";

const suffix = crypto.randomUUID().slice(0, 8);
const userIds: string[] = [];
const listingIds: string[] = [];
let userCounter = 0;
const tomorrow = () => new Date(Date.now() + 86_400_000);
const terms = "Subject to verification of the records and inventory reconciliation.";

async function createUser(label: string) {
  userCounter += 1;
  const user = await db.user.create({
    data: {
      email: `sec-market-${label}-${userCounter}-${suffix}@example.test`,
      passwordHash: `argon2-secret-${label}-${userCounter}-${suffix}`,
      status: "ACTIVE",
      systemRole: label === "owner" ? "ADMIN" : "USER",
      profile: { create: { displayName: `Member ${label}`, language: "en", locale: "en", phone: `+966500${String(userCounter).padStart(5, "0")}` } },
    },
  });
  userIds.push(user.id);
  return user;
}

async function publishedListing(ownerId: string, requiresNda = false) {
  const listing = await createMarketListing({
    askingPriceMinor: 2_500_000,
    countryCode: "SA",
    kind: "BUSINESS",
    requiresNda,
    sector: "Food services",
    summary: "A documented profitable cafe business with audited monthly demand, repeat customers, trained staff, lease clarity, inventory controls, and expansion potential across nearby districts.",
    title: `Security review cafe ${suffix}`,
    valuationNote: "Price is based on current revenue, equipment, lease position, and verified demand indicators.",
  }, ownerId);
  listingIds.push(listing.id);
  await updateMarketListingStatus(listing.id, "PUBLISHED", ownerId);
  return listing;
}

afterAll(async () => {
  if (listingIds.length) await db.marketListing.deleteMany({ where: { id: { in: listingIds } } });
  if (userIds.length) {
    await db.notification.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await db.$disconnect();
});

describe("market responses do not carry other people's account data", () => {
  it("shows other members only as a display name and an id", async () => {
    const owner = await createUser("owner");
    const buyer = await createUser("buyer");
    const listing = await publishedListing(owner.id);
    await createMarketInquiry(listing.id, "I am interested and want to review the documents.", buyer.id);
    await createMarketViewingRequest({ attendees: 2, listingId: listing.id, preferredAt: tomorrow() }, buyer.id);
    await createMarketOffer({ amountMinor: 2_300_000, listingId: listing.id, terms }, buyer.id);

    const responses = {
      buyerListings: await listMarketListings(buyer.id),
      createdListing: listing,
      ownerDeals: await listMarketDeals(owner.id),
      ownerInquiries: await listMarketInquiries(owner.id),
      ownerListings: await listMarketListings(owner.id),
      republished: await updateMarketListingStatus(listing.id, "PUBLISHED", owner.id),
    };

    for (const [name, response] of Object.entries(responses)) {
      const serialized = JSON.stringify(response);
      for (const forbidden of ["passwordHash", "argon2-secret", "email", "@example.test", "phone", "+966500", "systemRole", "emailVerifiedAt"]) {
        expect(serialized, `${name} must not contain ${forbidden}`).not.toContain(forbidden);
      }
    }

    const seen = (await listMarketListings(buyer.id)).find((item) => item.id === listing.id);
    expect(seen?.createdBy).toEqual({ id: owner.id, profile: { displayName: "Member owner" } });
    const inquiry = (await listMarketInquiries(owner.id)).inquiries.find((item) => item.listing.id === listing.id);
    expect(inquiry?.requester).toEqual({ id: buyer.id, profile: { displayName: "Member buyer" } });
    const deals = await listMarketDeals(owner.id);
    expect(deals.viewings.find((item) => item.listingId === listing.id)?.requester).toEqual({ id: buyer.id, profile: { displayName: "Member buyer" } });
    expect(deals.offers.find((item) => item.listingId === listing.id)?.buyer).toEqual({ id: buyer.id, profile: { displayName: "Member buyer" } });
  });
});

describe("open offers and viewings are capped per person per listing", () => {
  it("stops a buyer at the cap, frees the cap when offers close, and leaves other buyers alone", async () => {
    const owner = await createUser("owner");
    const buyer = await createUser("buyer-cap");
    const other = await createUser("other-cap");
    const listing = await publishedListing(owner.id);
    const submit = (buyerId: string) => createMarketOffer({ amountMinor: 1_000_000, listingId: listing.id, terms }, buyerId);

    const offers = [];
    for (let index = 0; index < MARKET_LIMITS.openOffersPerBuyerPerListing; index += 1) offers.push(await submit(buyer.id));
    await expect(submit(buyer.id)).rejects.toThrow(`${MARKET_LIMITS.openOffersPerBuyerPerListing} open offers`);
    await expect(submit(other.id)).resolves.toMatchObject({ buyerId: other.id });

    await updateMarketOfferStatus(offers[0].id, "REJECTED", owner.id);
    await expect(submit(buyer.id)).resolves.toMatchObject({ buyerId: buyer.id });
    await expect(submit(buyer.id)).rejects.toThrow("open offers");

    for (let index = 0; index < MARKET_LIMITS.openViewingsPerRequesterPerListing; index += 1) {
      await createMarketViewingRequest({ attendees: 1, listingId: listing.id, preferredAt: tomorrow() }, buyer.id);
    }
    await expect(createMarketViewingRequest({ attendees: 1, listingId: listing.id, preferredAt: tomorrow() }, buyer.id)).rejects.toThrow("open viewing requests");
    await expect(createMarketViewingRequest({ attendees: 1, listingId: listing.id, preferredAt: tomorrow() }, other.id)).resolves.toMatchObject({ requesterId: other.id });
  });

  it("holds the cap when the same buyer submits many offers at the same moment", async () => {
    const owner = await createUser("owner");
    const buyer = await createUser("buyer-race");
    const listing = await publishedListing(owner.id);
    const results = await Promise.allSettled(Array.from({ length: MARKET_LIMITS.openOffersPerBuyerPerListing + 4 }, () => createMarketOffer({ amountMinor: 1_000_000, listingId: listing.id, terms }, buyer.id)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(MARKET_LIMITS.openOffersPerBuyerPerListing);
    expect(await db.marketOffer.count({ where: { buyerId: buyer.id, listingId: listing.id } })).toBe(MARKET_LIMITS.openOffersPerBuyerPerListing);
  });

  it("keeps the NDA gate in front of the caps", async () => {
    const owner = await createUser("owner");
    const buyer = await createUser("buyer-nda");
    const listing = await publishedListing(owner.id, true);
    await expect(createMarketOffer({ amountMinor: 1_000_000, listingId: listing.id, terms }, buyer.id)).rejects.toThrow("NDA acceptance");
    await acceptMarketNda(listing.id, buyer.id);
    await expect(createMarketOffer({ amountMinor: 1_000_000, listingId: listing.id, terms }, buyer.id)).resolves.toMatchObject({ status: "SUBMITTED" });
  });
});

describe("accepting an offer is atomic", () => {
  it("lets exactly one of two concurrent acceptances on a listing win, however the requests interleave", async () => {
    const owner = await createUser("owner");
    const first = await createUser("buyer-a");
    const second = await createUser("buyer-b");

    for (let round = 0; round < 6; round += 1) {
      const listing = await publishedListing(owner.id);
      const offerA = await createMarketOffer({ amountMinor: 1_000_000, listingId: listing.id, terms }, first.id);
      const offerB = await createMarketOffer({ amountMinor: 1_100_000, listingId: listing.id, terms }, second.id);

      const results = await Promise.allSettled([updateMarketOfferStatus(offerA.id, "ACCEPTED", owner.id), updateMarketOfferStatus(offerB.id, "ACCEPTED", owner.id)]);
      expect(results.filter((result) => result.status === "fulfilled"), `round ${round}`).toHaveLength(1);
      const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      expect(String(rejected?.reason?.message)).toMatch(/already been accepted|already final|changed by another request/);

      const offers = await db.marketOffer.findMany({ where: { listingId: listing.id }, select: { status: true } });
      expect(offers.filter((offer) => offer.status === "ACCEPTED"), `round ${round}`).toHaveLength(1);
      expect(offers.filter((offer) => offer.status === "REJECTED"), `round ${round}`).toHaveLength(1);
    }
  });

  it("lets exactly one of two concurrent acceptances of the same offer win", async () => {
    const owner = await createUser("owner");
    const buyer = await createUser("buyer-same");
    const listing = await publishedListing(owner.id);
    const offer = await createMarketOffer({ amountMinor: 1_000_000, listingId: listing.id, terms }, buyer.id);
    const results = await Promise.allSettled([updateMarketOfferStatus(offer.id, "ACCEPTED", owner.id), updateMarketOfferStatus(offer.id, "ACCEPTED", owner.id)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await db.marketOffer.findUniqueOrThrow({ where: { id: offer.id } })).status).toBe("ACCEPTED");
    expect(await db.auditLog.count({ where: { action: "market.offer.status.updated", entityId: offer.id } })).toBe(1);
  });

  it("lets a buyer's withdrawal and the owner's acceptance of the same offer race without both applying", async () => {
    const owner = await createUser("owner");
    const buyer = await createUser("buyer-withdraw");
    const listing = await publishedListing(owner.id);
    const offer = await createMarketOffer({ amountMinor: 1_000_000, listingId: listing.id, terms }, buyer.id);
    const results = await Promise.allSettled([updateMarketOfferStatus(offer.id, "ACCEPTED", owner.id), updateMarketOfferStatus(offer.id, "WITHDRAWN", buyer.id)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(["ACCEPTED", "WITHDRAWN"]).toContain((await db.marketOffer.findUniqueOrThrow({ where: { id: offer.id } })).status);
  });

  it("refuses a second acceptance on a listing that already has one, even for an offer made later", async () => {
    const owner = await createUser("owner");
    const buyer = await createUser("buyer-late");
    const listing = await publishedListing(owner.id);
    const accepted = await createMarketOffer({ amountMinor: 1_000_000, listingId: listing.id, terms }, buyer.id);
    await updateMarketOfferStatus(accepted.id, "ACCEPTED", owner.id);
    const late = await createMarketOffer({ amountMinor: 1_500_000, listingId: listing.id, terms }, buyer.id);
    await expect(updateMarketOfferStatus(late.id, "ACCEPTED", owner.id)).rejects.toThrow("Another offer has already been accepted");
    expect((await db.marketOffer.findUniqueOrThrow({ where: { id: late.id } })).status).toBe("SUBMITTED");
  });
});

describe("inquiries, viewings and offers come a page at a time", () => {
  it("pages each list by cursor without repeats or gaps and clamps the page size", async () => {
    const owner = await createUser("owner");
    const buyers = [await createUser("page-1"), await createUser("page-2"), await createUser("page-3")];
    const listing = await publishedListing(owner.id);
    for (const buyer of buyers) {
      await createMarketInquiry(listing.id, "I am interested and want to review the documents.", buyer.id);
      for (let index = 0; index < 2; index += 1) {
        await createMarketOffer({ amountMinor: 1_000_000 + index, listingId: listing.id, terms }, buyer.id);
        await createMarketViewingRequest({ attendees: 1, listingId: listing.id, preferredAt: tomorrow() }, buyer.id);
      }
    }

    const offerIds: string[] = [];
    const viewingIds: string[] = [];
    let offersCursor: string | undefined;
    let viewingsCursor: string | undefined;
    let pages = 0;
    do {
      const page = await listMarketDeals(owner.id, { offersCursor, take: 4, viewingsCursor });
      expect(page.offers.length).toBeLessThanOrEqual(4);
      offerIds.push(...page.offers.map((item) => item.id));
      viewingIds.push(...page.viewings.map((item) => item.id));
      offersCursor = page.nextCursors.offers ?? undefined;
      viewingsCursor = page.nextCursors.viewings ?? undefined;
      pages += 1;
    } while ((offersCursor || viewingsCursor) && pages < 10);

    expect(new Set(offerIds).size).toBe(offerIds.length);
    expect(new Set(viewingIds).size).toBe(viewingIds.length);
    expect(offerIds).toHaveLength(6);
    expect(viewingIds).toHaveLength(6);
    expect(pages).toBe(2);

    const inquiryIds: string[] = [];
    let inquiriesCursor: string | undefined;
    do {
      const page = await listMarketInquiries(owner.id, { cursor: inquiriesCursor, take: 2 });
      inquiryIds.push(...page.inquiries.map((item) => item.id));
      inquiriesCursor = page.nextCursor ?? undefined;
    } while (inquiriesCursor);
    expect(new Set(inquiryIds).size).toBe(3);

    expect((await listMarketDeals(owner.id, { take: 0 })).offers).toHaveLength(1);
    expect((await listMarketDeals(owner.id, { take: Number.NaN })).offers).toHaveLength(6);
  });

  it("answers a repeated inquiry in words rather than with a database error", async () => {
    const owner = await createUser("owner");
    const buyer = await createUser("buyer-inquiry");
    const listing = await publishedListing(owner.id);
    await createMarketInquiry(listing.id, "I am interested and want to review the documents.", buyer.id);
    await expect(createMarketInquiry(listing.id, "Asking once more about the same listing.", buyer.id)).rejects.toThrow("already sent an inquiry");
  });
});
