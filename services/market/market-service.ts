import { MarketInquiryStatus, MarketListingStatus, MarketOfferStatus, MarketViewingStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { publicUserSelect } from "@/lib/auth/user-select";
import { ownedOrganizationRecordWhere } from "@/lib/auth/organization-scope";

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
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  const query = filters.search?.trim();
  const listings = await db.marketListing.findMany({
    where: {
      AND: [
        { OR: [{ status: MarketListingStatus.PUBLISHED }, ownedOrganizationRecordWhere(userId)] },
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
    orderBy: [{ qualityScore: "desc" }, { updatedAt: "desc" }],
    skip: offset,
    take: limit,
  });
  const ownedIds = new Set((await db.marketListing.findMany({
    where: { id: { in: listings.map(({ id }) => id) }, ...ownedOrganizationRecordWhere(userId) },
    select: { id: true },
  })).map(({ id }) => id));
  return listings.map((listing) => {
    const { ndaAcceptances, files, ...record } = listing;
    const isOwner = ownedIds.has(listing.id);
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
      where: { id: listingId, ...ownedOrganizationRecordWhere(userId) },
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

export async function listMarketInquiries(userId: string) {
  const inquiries = await db.marketInquiry.findMany({
    where: { OR: [{ requesterId: userId }, { listing: ownedOrganizationRecordWhere(userId) }] },
    include: {
      listing: { select: { id: true, title: true, createdById: true } },
      requester: { select: { email: true, profile: { select: { displayName: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return inquiries.map((inquiry) => ({
    ...inquiry,
    isListingOwner: inquiry.listing.createdById === userId,
  }));
}

export async function createMarketInquiry(listingId: string, message: string, userId: string) {
  return db.$transaction(async (transaction) => {
    const listing = await transaction.marketListing.findFirst({
      where: { id: listingId, status: MarketListingStatus.PUBLISHED },
      select: { id: true, createdById: true },
    });
    if (!listing) throw new Error("Published listing not found");
    if (await transaction.marketListing.findFirst({ where: { id: listingId, ...ownedOrganizationRecordWhere(userId) }, select: { id: true } })) throw new Error("Listing owner cannot create an inquiry");
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
      where: { id: inquiryId, listing: ownedOrganizationRecordWhere(userId) },
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

async function requireProtectedMarketAccess(listingId: string, userId: string, transaction: Prisma.TransactionClient) {
  const listing = await transaction.marketListing.findFirst({
    where: { id: listingId, status: MarketListingStatus.PUBLISHED },
    select: { id: true, createdById: true, requiresNda: true, currency: true },
  });
  if (!listing) throw new Error("Published listing not found");
  if (await transaction.marketListing.findFirst({ where: { id: listingId, ...ownedOrganizationRecordWhere(userId) }, select: { id: true } })) throw new Error("Listing owner cannot perform a buyer action");
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
    if (await transaction.marketListing.findFirst({ where: { id: listingId, ...ownedOrganizationRecordWhere(userId) }, select: { id: true } })) throw new Error("Listing owner does not need an NDA acceptance");
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
    const viewing = await transaction.marketViewingRequest.create({ data: { listingId: input.listingId, requesterId: userId, preferredAt: input.preferredAt, attendees: input.attendees, notes: input.notes?.trim() || undefined } });
    await transaction.auditLog.create({ data: { actorId: userId, action: "market.viewing.requested", entityType: "MarketViewingRequest", entityId: viewing.id, metadata: { listingId: input.listingId } } });
    return viewing;
  });
}

export async function createMarketOffer(input: { listingId: string; amountMinor: number; currency?: string; terms: string; message?: string; validUntil?: Date }, userId: string) {
  return db.$transaction(async (transaction) => {
    const listing = await requireProtectedMarketAccess(input.listingId, userId, transaction);
    const offer = await transaction.marketOffer.create({ data: { listingId: input.listingId, buyerId: userId, amountMinor: input.amountMinor, currency: input.currency?.trim().toUpperCase() || listing.currency, terms: input.terms.trim(), message: input.message?.trim() || undefined, validUntil: input.validUntil } });
    await transaction.auditLog.create({ data: { actorId: userId, action: "market.offer.submitted", entityType: "MarketOffer", entityId: offer.id, metadata: { listingId: input.listingId, amountMinor: input.amountMinor } } });
    return offer;
  });
}

export async function updateMarketOfferStatus(offerId: string, status: "NEGOTIATING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "CLOSED", userId: string) {
  return db.$transaction(async (transaction) => {
    const offer = await transaction.marketOffer.findUnique({ where: { id: offerId }, include: { listing: { select: { createdById: true } } } });
    if (!offer) throw new Error("Market offer not found");
    const owner = Boolean(await transaction.marketListing.findFirst({ where: { id: offer.listingId, ...ownedOrganizationRecordWhere(userId) }, select: { id: true } }));
    const buyer = offer.buyerId === userId;
    if ((!owner && !buyer) || (status === "WITHDRAWN" ? !buyer : !owner)) throw new Error("Market offer not found");
    const finalStatuses = new Set<MarketOfferStatus>([MarketOfferStatus.ACCEPTED, MarketOfferStatus.REJECTED, MarketOfferStatus.WITHDRAWN, MarketOfferStatus.CLOSED]);
    if (finalStatuses.has(offer.status)) throw new Error("Market offer is already final");
    const updated = await transaction.marketOffer.update({ where: { id: offer.id }, data: { status: MarketOfferStatus[status] } });
    if (status === "ACCEPTED") await transaction.marketOffer.updateMany({ where: { listingId: offer.listingId, id: { not: offer.id }, status: { in: [MarketOfferStatus.SUBMITTED, MarketOfferStatus.NEGOTIATING] } }, data: { status: MarketOfferStatus.REJECTED } });
    await transaction.auditLog.create({ data: { actorId: userId, action: "market.offer.status.updated", entityType: "MarketOffer", entityId: offer.id, metadata: { listingId: offer.listingId, status } } });
    return updated;
  });
}

export async function updateMarketViewingStatus(viewingId: string, status: "CONFIRMED" | "COMPLETED" | "CANCELLED", userId: string) {
  return db.$transaction(async (transaction) => {
    const viewing = await transaction.marketViewingRequest.findFirst({ where: { id: viewingId, listing: ownedOrganizationRecordWhere(userId) }, select: { id: true, listingId: true } });
    if (!viewing) throw new Error("Market viewing not found");
    const updated = await transaction.marketViewingRequest.update({ where: { id: viewing.id }, data: { status: MarketViewingStatus[status] } });
    await transaction.auditLog.create({ data: { actorId: userId, action: "market.viewing.status.updated", entityType: "MarketViewingRequest", entityId: viewing.id, metadata: { listingId: viewing.listingId, status } } });
    return updated;
  });
}

export async function listMarketDeals(userId: string) {
  const [viewings, offers] = await Promise.all([
    db.marketViewingRequest.findMany({
      where: { OR: [{ requesterId: userId }, { listing: ownedOrganizationRecordWhere(userId) }] },
      include: {
        listing: { select: { id: true, title: true, createdById: true } },
        requester: { select: { email: true, profile: { select: { displayName: true } } } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.marketOffer.findMany({
      where: { OR: [{ buyerId: userId }, { listing: ownedOrganizationRecordWhere(userId) }] },
      include: {
        listing: { select: { id: true, title: true, createdById: true } },
        buyer: { select: { email: true, profile: { select: { displayName: true } } } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return {
    viewings: viewings.map((item) => ({ ...item, isListingOwner: item.listing.createdById === userId })),
    offers: offers.map((item) => ({ ...item, isListingOwner: item.listing.createdById === userId, isBuyer: item.buyerId === userId })),
  };
}