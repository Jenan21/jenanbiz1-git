import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import { publicErrorMessage } from "@/lib/http/safe-error";
import { MARKET_LIMITS, MAX_INT32 } from "@/lib/market/market-limits";
import { enforceRouteRateLimit } from "@/lib/rate-limit/route-rate-limit";
import { acceptMarketNda, createMarketInquiry, createMarketListing, createMarketOffer, createMarketViewingRequest, listMarketDeals, listMarketInquiries, listMarketListings, updateMarketInquiryStatus, updateMarketListingStatus, updateMarketOfferStatus, updateMarketViewingStatus } from "@/services/market/market-service";

const commandSchema = z.discriminatedUnion("action", [
  // `askingPriceMinor` and `amountMinor` are 32-bit integer columns, so larger values are refused here rather than by the database.
  z.object({ action: z.literal("create"), kind: z.enum(["PROJECT", "BUSINESS"]), title: z.string().trim().min(2).max(160), summary: z.string().trim().min(20).max(4000), sector: z.string().trim().max(120).optional(), countryCode: z.string().trim().length(2).optional(), currency: z.string().trim().length(3).optional(), askingPriceMinor: z.number().int().positive().max(MAX_INT32).optional(), valuationNote: z.string().trim().max(1000).optional(), confidentialDetails: z.string().trim().max(4000).optional(), requiresNda: z.boolean().optional(), projectId: z.string().cuid().optional() }),
  z.object({ action: z.literal("updateStatus"), listingId: z.string().cuid(), status: z.enum(["PUBLISHED", "PAUSED", "ARCHIVED"]) }),
  z.object({ action: z.literal("createInquiry"), listingId: z.string().cuid(), message: z.string().trim().min(10).max(2_000) }),
  z.object({ action: z.literal("updateInquiryStatus"), inquiryId: z.string().cuid(), status: z.enum(["CONTACTED", "CLOSED"]) }),
  z.object({ action: z.literal("acceptNda"), listingId: z.string().cuid() }),
  z.object({ action: z.literal("createViewing"), listingId: z.string().cuid(), preferredAt: z.string().datetime(), attendees: z.number().int().min(1).max(20), notes: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal("updateViewingStatus"), viewingId: z.string().cuid(), status: z.enum(["CONFIRMED", "COMPLETED", "CANCELLED"]) }),
  z.object({ action: z.literal("createOffer"), listingId: z.string().cuid(), amountMinor: z.number().int().positive().max(MAX_INT32), currency: z.string().trim().length(3).optional(), terms: z.string().trim().min(10).max(4000), message: z.string().trim().max(2000).optional(), validUntil: z.string().datetime().optional() }),
  z.object({ action: z.literal("updateOfferStatus"), offerId: z.string().cuid(), status: z.enum(["NEGOTIATING", "ACCEPTED", "REJECTED", "WITHDRAWN", "CLOSED"]) }),
]);

const hour = 60 * 60_000;
// Creating things that other people must then review is budgeted per user on top of the general write budget.
const actionRateLimits: Partial<Record<z.infer<typeof commandSchema>["action"], { limit: number; scope: string; windowMs: number }>> = {
  create: { limit: 20, scope: "market:listing", windowMs: hour },
  createInquiry: { limit: 30, scope: "market:inquiry", windowMs: hour },
  createOffer: { limit: 20, scope: "market:offer", windowMs: hour },
  createViewing: { limit: 20, scope: "market:viewing", windowMs: hour },
};

const querySchema = z.object({
  countryCode: z.string().trim().max(8).optional(),
  inquiriesCursor: z.string().cuid().optional(),
  kind: z.enum(["PROJECT", "BUSINESS"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offersCursor: z.string().cuid().optional(),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  search: z.string().trim().max(200).optional(),
  section: z.enum(["all", "deals"]).default("all"),
  status: z.enum(["DRAFT", "PUBLISHED", "PAUSED", "ARCHIVED"]).optional(),
  take: z.coerce.number().int().min(1).max(MARKET_LIMITS.maxPageSize).default(MARKET_LIMITS.defaultPageSize),
  viewingsCursor: z.string().cuid().optional(),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const searchParams = request.nextUrl.searchParams;
  // An empty parameter means "not set", as it did before the query was validated.
  const query = querySchema.safeParse(Object.fromEntries([...searchParams.entries()].map(([key, value]) => [key, value || undefined])));
  if (!query.success) return NextResponse.json({ success: false, message: "Invalid market query" }, { status: 400 });
  const { take } = query.data;
  const dealsPage = { offersCursor: query.data.offersCursor, take, viewingsCursor: query.data.viewingsCursor };
  if (query.data.section === "deals") {
    const deals = await listMarketDeals(user.id, dealsPage);
    return NextResponse.json({ success: true, viewings: deals.viewings, offers: deals.offers, pagination: { offersNextCursor: deals.nextCursors.offers, take, viewingsNextCursor: deals.nextCursors.viewings } });
  }
  const [listings, inquiries, deals] = await Promise.all([listMarketListings(user.id, {
    countryCode: query.data.countryCode,
    kind: query.data.kind,
    limit: query.data.limit,
    offset: query.data.offset,
    search: query.data.search,
    status: query.data.status,
  }), listMarketInquiries(user.id, { cursor: query.data.inquiriesCursor, take }), listMarketDeals(user.id, dealsPage)]);
  return NextResponse.json({
    success: true,
    listings,
    inquiries: inquiries.inquiries,
    viewings: deals.viewings,
    offers: deals.offers,
    pagination: { inquiriesNextCursor: inquiries.nextCursor, offersNextCursor: deals.nextCursors.offers, take, viewingsNextCursor: deals.nextCursors.viewings },
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const limited = await enforceRouteRateLimit(request, { limit: 60, scope: "market:write", userId: user.id, windowMs: 60_000 });
  if (limited) return limited;
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid market command" }, { status: 400 });
  const actionLimit = actionRateLimits[parsed.data.action];
  if (actionLimit) {
    const actionLimited = await enforceRouteRateLimit(request, { ...actionLimit, userId: user.id });
    if (actionLimited) return actionLimited;
  }
  try {
    const input = parsed.data;
    const result = input.action === "create"
      ? await createMarketListing(input, user.id)
      : input.action === "updateStatus"
        ? await updateMarketListingStatus(input.listingId, input.status, user.id)
        : input.action === "createInquiry"
          ? await createMarketInquiry(input.listingId, input.message, user.id)
          : input.action === "updateInquiryStatus"
            ? await updateMarketInquiryStatus(input.inquiryId, input.status, user.id)
            : input.action === "acceptNda"
              ? await acceptMarketNda(input.listingId, user.id)
              : input.action === "createViewing"
                ? await createMarketViewingRequest({ ...input, preferredAt: new Date(input.preferredAt) }, user.id)
                : input.action === "updateViewingStatus"
                  ? await updateMarketViewingStatus(input.viewingId, input.status, user.id)
                  : input.action === "createOffer"
                    ? await createMarketOffer({ ...input, validUntil: input.validUntil ? new Date(input.validUntil) : undefined }, user.id)
                    : await updateMarketOfferStatus(input.offerId, input.status, user.id);
    return NextResponse.json({ success: true, result }, { status: ["create", "createInquiry", "createViewing", "createOffer"].includes(input.action) ? 201 : 200 });
  } catch (error) {
    const message = publicErrorMessage(error, "Market command failed");
    return NextResponse.json({ success: false, message }, { status: message.endsWith("not found") ? 404 : 409 });
  }
}