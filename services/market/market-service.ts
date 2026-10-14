import { MarketInquiryStatus, MarketListingStatus, MarketOfferStatus, MarketViewingStatus, Prisma } from "@/generated/prisma/client";
import { publicUserSelect } from "@/lib/auth/public-user";
import { db, type DbExecutor } from "@/lib/db";
import { MARKET_LIMITS } from "@/lib/market/market-limits";

// Other people only ever see a seller's or buyer's display name and opaque id, never the account record.
const listingInclude = {
  createdBy: { select: publicUserSelect },
  project: { select: { id: true, name: true } },
  organization: { select: { id: true, name: true } },
} satisfies Prisma.MarketListingInclude;

export type MarketListingFilters = {
  countryCode?: string;
  kind?: "PROJECT" | "BUSINESS";
  limit?: number;
  offset?: number;
  search?: string;
  status?: "DRAFT" | "PUBLISHED" | "PAUSED" | "ARCHIVED";
};

export type MarketPageSize = { take?: number };

function pageSize(take?: number) {
  const value = Math.trunc(take ?? MARKET_LIMITS.defaultPageSize);
  return Number.isFinite(value) ? Math.min(Math.max(value, 1), MARKET_LIMITS.maxPageSize) : MARKET_LIMITS.defaultPageSize;
}

// A page is read one row past its size: the extra row only tells whether another page follows, and the last row shown is the cursor for it.
function cursorPage<T extends { id: string }>(rows: T[], take: number) {
  const items = rows.slice(0, take);
  return { items, nextCursor: rows.length > take ? items[items.length - 1].id : null };
}

function assessListingQuality(input: {
  askingPriceMinor?: number;
  countryCode?: string;
  projectId?: string;
  sector?: string;
  summary: string;
  title: string;
  valuationNote?: string;
}) {
  const signals = {
    hasCountry: Boolean(input.countryCode?.trim()),
    hasLinkedProject: Boolean(input.projectId),
    hasPrice: typeof input.askingPriceMinor === "number" && input.askingPriceMinor > 0,
    hasSector: Boolean(input.sector?.trim()),
    hasValuationNote: Boolean(input.valuationNote?.trim()),
    strongSummary: input.summary.trim().length >= 120,
    strongTitle: input.title.trim().length >= 8,
  };
  const score = Math.min(100,
    20 +
    (signals.strongTitle ? 10 : 0) +
    (signals.strongSummary ? 20 : 0) +
    (signals.hasSector ? 12 : 0) +
    (signals.hasCountry ? 12 : 0) +
    (signals.hasPrice ? 16 : 0) +
    (signals.hasValuationNote ? 12 : 0) +
    (signals.hasLinkedProject ? 18 : 0),
  );
  return { score, signals };
}

function slugify(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
  return slug || "listing";
}

export async function listMarketListings(userId: string, filters: MarketListingFilters = {}) {
  const requestedLimit = Math.trunc(filters.limit ?? 50);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
  const requestedOffset = Math.trunc(filters.offset ?? 0);
  const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;
  const query = filters.search?.trim();
  const listings = await db.marketListing.findMany({
    where: {
      AND: [
        { OR: [{ status: MarketListingStatus.PUBLISHED }, { createdById: userId }] },
        filters.status ? { status: MarketListingStatus[filters.status] } : {},
        filters.kind ? { kind: filters.kind } : {},
        filters.countryCode ? { countryCode: filters.countryCode.trim().toUpperCase() } : {},
        query ? { OR: [{ title: { contains: query, mode: "insensitive" } }, { summary: { contains: query, mode: "insensitive" } }, { sector: { contains: query, mode: "insensitive" } }] } : {},
      ],
    },
    include: {
      ...listingInclude,
      files: { orderBy: { createdAt: "desc" } },
      ndaAcceptances: { where: { userId }, select: { acceptedAt: true, termsVersion: true } },
    },
    orderBy: [{ qualityScore: "desc" }, { updatedAt: "desc" }, { id: "asc" }],
    skip: offset,
    take: limit,
  });
  return listings.map((listing) => {
    const { ndaAcceptances, files, ...record } = listing;
    const isOwner = listing.createdById === userId;
    const ndaAccepted = isOwner || !listing.requiresNda || ndaAcceptances.length > 0;
    return {
      ...record,
      confidentialDetails: ndaAccepted ? listing.confidentialDetails : null,
      files: files
        .filter((file) => isOwner || file.marketVisibility === "PUBLIC" || ndaAccepted)
        .map((file) => ({ id: file.id, fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes.toString(), marketVisibility: file.marketVisibility, createdAt: file.createdAt.toISOString() })),
      isOwner,
      ndaAccepted,
    };
  });
}

export async function createMarketListing(
  input: {
    kind: "PROJECT" | "BUSINESS";
    title: string;
    summary: string;
    sector?: string;
    countryCode?: string;
    currency?: string;
    askingPriceMinor?: number;
    valuationNote?: string;
    confidentialDetails?: string;
    requiresNda?: boolean;
    projectId?: string;
  },
  userId: string,
) {
  if (input.projectId) {
    const project = await db.project.findFirst({
      where: { id: input.projectId, createdById: userId },
      select: { id: true },
    });
    if (!project) throw new Error("Project not found");
  }
  const quality = assessListingQuality(input);
  return db.$transaction(async (transaction) => {
    const listing = await transaction.marketListing.create({
      data: {
        kind: input.kind,
        title: input.title.trim(),
        slug: `${slugify(input.title)}-${crypto.randomUUID().slice(0, 8)}`,
        summary: input.summary.trim(),
        sector: input.sector?.trim() || undefined,
        countryCode: input.countryCode?.trim().toUpperCase() || undefined,
        currency: input.currency?.trim().toUpperCase() || "SAR",
        askingPriceMinor: input.askingPriceMinor,
        valuationNote: input.valuationNote?.trim() || undefined,
        confidentialDetails: input.confidentialDetails?.trim() || undefined,
        requiresNda: input.requiresNda ?? true,
        qualityScore: quality.score,
        qualitySignals: quality.signals,
        reviewedAt: new Date(),
        projectId: input.projectId,
        createdById: userId,
      },
      include: listingInclude,
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "market.listing.created", entityType: "MarketListing", entityId: listing.id },
    });
    return { ...listing, files: [], isOwner: true, ndaAccepted: true };
  });
}

export async function updateMarketListingStatus(
  listingId: string,
  status: "PUBLISHED" | "PAUSED" | "ARCHIVED",
  userId: string,
) {
  return db.$transaction(async (transaction) => {
    const current = await transaction.marketListing.findFirst({
      where: { id: listingId, createdById: userId },
      select: { id: true, qualityScore: true },
    });
    if (!current) throw new Error("Listing not found");
    if (status === "PUBLISHED" && current.qualityScore < 50) throw new Error("Listing quality score is too low to publish");
    const listing = await transaction.marketListing.update({
      where: { id: listingId },
      data: { status },
      include: listingInclude,
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "market.listing.status.updated", entityType: "MarketListing", entityId: listing.id, metadata: { status } },
    });
    return { ...listing, files: [], isOwner: true, ndaAccepted: true };
  });
}

export async function listMarketInquiries(userId: string, page: MarketPageSize & { cursor?: string } = {}) {
  const take = pageSize(page.take);
  const rows = await db.marketInquiry.findMany({
    where: { OR: [{ requesterId: userId }, { listing: { createdById: userId } }] },
    include: {
      listing: { select: { id: true, title: true, createdById: true } },
      requester: { select: publicUserSelect },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
  });
  const { items, nextCursor } = cursorPage(rows, take);
  return {
    inquiries: items.map((inquiry) => ({
      ...inquiry,
      isListingOwner: inquiry.listing.createdById === userId,
    })),
    nextCursor,
  };
}

export async function createMarketInquiry(listingId: string, message: string, userId: string) {
  return db.$transaction(async (transaction) => {
    const listing = await transaction.marketListing.findFirst({
      where: { id: listingId, status: MarketListingStatus.PUBLISHED },
      select: { id: true, createdById: true },
    });
    if (!listing) throw new Error("Published listing not found");
    if (listing.createdById === userId) throw new Error("Listing owner cannot create an inquiry");
    if (await transaction.marketInquiry.findUnique({ where: { listingId_requesterId: { listingId: listing.id, requesterId: userId } }, select: { id: true } })) {
      throw new Error("You have already sent an inquiry about this listing");
    }
    const inquiry = await transaction.marketInquiry.create({
      data: { listingId: listing.id, requesterId: userId, message: message.trim() },
    });
    await transaction.notification.create({
      data: {
        userId: listing.createdById,
        type: "MARKET_INQUIRY",
        title: "New market inquiry",
        body: "A buyer requested contact about one of your published listings.",
        data: { listingId: listing.id, inquiryId: inquiry.id },
      },
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "market.inquiry.created", entityType: "MarketInquiry", entityId: inquiry.id, metadata: { listingId: listing.id } },
    });
    return inquiry;
  });
}

export async function updateMarketInquiryStatus(inquiryId: string, status: "CONTACTED" | "CLOSED", userId: string) {
  return db.$transaction(async (transaction) => {
    const inquiry = await transaction.marketInquiry.findFirst({
      where: { id: inquiryId, listing: { createdById: userId } },
      select: { id: true, listingId: true },
    });
    if (!inquiry) throw new Error("Market inquiry not found");
    const updated = await transaction.marketInquiry.update({
      where: { id: inquiry.id },
      data: { status: MarketInquiryStatus[status] },
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "market.inquiry.status.updated", entityType: "MarketInquiry", entityId: updated.id, metadata: { listingId: inquiry.listingId, status } },
    });
    return updated;
  });
}

// Takes a row lock on the listing until the transaction ends, so the checks that follow cannot be overtaken by a concurrent request.
async function lockMarketListing(transaction: DbExecutor, listingId: string) {
  await transaction.$queryRaw`SELECT "id" FROM "MarketListing" WHERE "id" = ${listingId} FOR UPDATE`;
}

async function requireProtectedMarketAccess(listingId: string, userId: string, transaction: DbExecutor) {
  await lockMarketListing(transaction, listingId);
  const listing = await transaction.marketListing.findFirst({
    where: { id: listingId, status: MarketListingStatus.PUBLISHED },
    select: { id: true, createdById: true, requiresNda: true, currency: true },
  });
  if (!listing) throw new Error("Published listing not found");
  if (listing.createdById === userId) throw new Error("Listing owner cannot perform a buyer action");
  if (listing.requiresNda) {
    const acceptance = await transaction.marketNdaAcceptance.findUnique({ where: { listingId_userId: { listingId, userId } }, select: { id: true } });
    if (!acceptance) throw new Error("NDA acceptance is required");
  }
  return listing;
}

export async function acceptMarketNda(listingId: string, userId: string) {
  return db.$transaction(async (transaction) => {
    const listing = await transaction.marketListing.findFirst({ where: { id: listingId, status: MarketListingStatus.PUBLISHED }, select: { id: true, createdById: true } });
    if (!listing) throw new Error("Published listing not found");
    if (listing.createdById === userId) throw new Error("Listing owner does not need an NDA acceptance");
    const acceptance = await transaction.marketNdaAcceptance.upsert({
      where: { listingId_userId: { listingId, userId } },
      update: { acceptedAt: new Date(), termsVersion: "v1" },
      create: { listingId, userId, termsVersion: "v1" },
    });
    await transaction.auditLog.create({ data: { actorId: userId, action: "market.nda.accepted", entityType: "MarketNdaAcceptance", entityId: acceptance.id, metadata: { listingId, termsVersion: "v1" } } });
    return acceptance;
  });
}

export async function createMarketViewingRequest(input: { listingId: string; preferredAt: Date; attendees: number; notes?: string }, userId: string) {
  return db.$transaction(async (transaction) => {
    await requireProtectedMarketAccess(input.listingId, userId, transaction);
    if (input.preferredAt <= new Date()) throw new Error("Viewing date must be in the future");
    const openViewings = await transaction.marketViewingRequest.count({
      where: { listingId: input.listingId, requesterId: userId, status: { in: [MarketViewingStatus.REQUESTED, MarketViewingStatus.CONFIRMED] } },
    });
    if (openViewings >= MARKET_LIMITS.openViewingsPerRequesterPerListing) {
      throw new Error(`You already have ${MARKET_LIMITS.openViewingsPerRequesterPerListing} open viewing requests for this listing`);
    }
    const viewing = await transaction.marketViewingRequest.create({ data: { listingId: input.listingId, requesterId: userId, preferredAt: input.preferredAt, attendees: input.attendees, notes: input.notes?.trim() || undefined } });
    await transaction.auditLog.create({ data: { actorId: userId, action: "market.viewing.requested", entityType: "MarketViewingRequest", entityId: viewing.id, metadata: { listingId: input.listingId } } });
    return viewing;
  });
}

export async function createMarketOffer(input: { listingId: string; amountMinor: number; currency?: string; terms: string; message?: string; validUntil?: Date }, userId: string) {
  return db.$transaction(async (transaction) => {
    const listing = await requireProtectedMarketAccess(input.listingId, userId, transaction);
    const openOffers = await transaction.marketOffer.count({
      where: { listingId: input.listingId, buyerId: userId, status: { in: [MarketOfferStatus.SUBMITTED, MarketOfferStatus.NEGOTIATING] } },
    });
    if (openOffers >= MARKET_LIMITS.openOffersPerBuyerPerListing) {
      throw new Error(`You already have ${MARKET_LIMITS.openOffersPerBuyerPerListing} open offers on this listing`);
    }
    const offer = await transaction.marketOffer.create({ data: { listingId: input.listingId, buyerId: userId, amountMinor: input.amountMinor, currency: input.currency?.trim().toUpperCase() || listing.currency, terms: input.terms.trim(), message: input.message?.trim() || undefined, validUntil: input.validUntil } });
    await transaction.auditLog.create({ data: { actorId: userId, action: "market.offer.submitted", entityType: "MarketOffer", entityId: offer.id, metadata: { listingId: input.listingId, amountMinor: input.amountMinor } } });
    return offer;
  });
}

export async function updateMarketOfferStatus(offerId: string, status: "NEGOTIATING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "CLOSED", userId: string) {
  return db.$transaction(async (transaction) => {
    const offer = await transaction.marketOffer.findUnique({ where: { id: offerId }, include: { listing: { select: { createdById: true } } } });
    if (!offer) throw new Error("Market offer not found");
    const owner = offer.listing.createdById === userId;
    const buyer = offer.buyerId === userId;
    if ((!owner && !buyer) || (status === "WITHDRAWN" ? !buyer : !owner)) throw new Error("Market offer not found");
    const finalStatuses = new Set<MarketOfferStatus>([MarketOfferStatus.ACCEPTED, MarketOfferStatus.REJECTED, MarketOfferStatus.WITHDRAWN, MarketOfferStatus.CLOSED]);
    if (finalStatuses.has(offer.status)) throw new Error("Market offer is already final");
    if (status === "ACCEPTED") {
      // Accepting is serialised per listing, so two requests cannot each accept a different offer on it.
      await lockMarketListing(transaction, offer.listingId);
      const accepted = await transaction.marketOffer.findFirst({ where: { listingId: offer.listingId, status: MarketOfferStatus.ACCEPTED }, select: { id: true } });
      if (accepted) throw new Error(accepted.id === offer.id ? "Market offer is already final" : "Another offer has already been accepted for this listing");
    }
    // The change only applies while the offer still has the status it was read with, so exactly one of two concurrent changes wins.
    const changed = await transaction.marketOffer.updateMany({ where: { id: offer.id, status: offer.status }, data: { status: MarketOfferStatus[status] } });
    if (changed.count !== 1) throw new Error("Market offer was changed by another request; reload and try again");
    if (status === "ACCEPTED") await transaction.marketOffer.updateMany({ where: { listingId: offer.listingId, id: { not: offer.id }, status: { in: [MarketOfferStatus.SUBMITTED, MarketOfferStatus.NEGOTIATING] } }, data: { status: MarketOfferStatus.REJECTED } });
    await transaction.auditLog.create({ data: { actorId: userId, action: "market.offer.status.updated", entityType: "MarketOffer", entityId: offer.id, metadata: { listingId: offer.listingId, status } } });
    return transaction.marketOffer.findUniqueOrThrow({ where: { id: offer.id } });
  });
}

export async function updateMarketViewingStatus(viewingId: string, status: "CONFIRMED" | "COMPLETED" | "CANCELLED", userId: string) {
  return db.$transaction(async (transaction) => {
    const viewing = await transaction.marketViewingRequest.findFirst({ where: { id: viewingId, listing: { createdById: userId } }, select: { id: true, listingId: true } });
    if (!viewing) throw new Error("Market viewing not found");
    const updated = await transaction.marketViewingRequest.update({ where: { id: viewing.id }, data: { status: MarketViewingStatus[status] } });
    await transaction.auditLog.create({ data: { actorId: userId, action: "market.viewing.status.updated", entityType: "MarketViewingRequest", entityId: viewing.id, metadata: { listingId: viewing.listingId, status } } });
    return updated;
  });
}

export type MarketDealsPage = MarketPageSize & { offersCursor?: string; viewingsCursor?: string };

export async function listMarketDeals(userId: string, page: MarketDealsPage = {}) {
  const take = pageSize(page.take);
  const [viewings, offers] = await Promise.all([
    db.marketViewingRequest.findMany({
      where: { OR: [{ requesterId: userId }, { listing: { createdById: userId } }] },
      include: {
        listing: { select: { id: true, title: true, createdById: true } },
        requester: { select: publicUserSelect },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(page.viewingsCursor ? { cursor: { id: page.viewingsCursor }, skip: 1 } : {}),
    }),
    db.marketOffer.findMany({
      where: { OR: [{ buyerId: userId }, { listing: { createdById: userId } }] },
      include: {
        listing: { select: { id: true, title: true, createdById: true } },
        buyer: { select: publicUserSelect },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(page.offersCursor ? { cursor: { id: page.offersCursor }, skip: 1 } : {}),
    }),
  ]);
  const viewingsPage = cursorPage(viewings, take);
  const offersPage = cursorPage(offers, take);
  return {
    viewings: viewingsPage.items.map((item) => ({ ...item, isListingOwner: item.listing.createdById === userId })),
    offers: offersPage.items.map((item) => ({ ...item, isListingOwner: item.listing.createdById === userId, isBuyer: item.buyerId === userId })),
    nextCursors: { offers: offersPage.nextCursor, viewings: viewingsPage.nextCursor },
  };
}