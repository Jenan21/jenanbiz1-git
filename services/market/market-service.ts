import { MarketInquiryStatus, MarketListingStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const listingInclude = {
  createdBy: { include: { profile: true } },
  project: { select: { id: true, name: true } },
  organization: { select: { id: true, name: true } },
} satisfies Prisma.MarketListingInclude;

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

export async function listMarketListings(userId: string) {
  const listings = await db.marketListing.findMany({
    where: { OR: [{ status: MarketListingStatus.PUBLISHED }, { createdById: userId }] },
    include: listingInclude,
    orderBy: { updatedAt: "desc" },
  });
  return listings.map((listing) => ({ ...listing, isOwner: listing.createdById === userId }));
}

export async function createMarketListing(
  input: {
    kind: "PROJECT" | "BUSINESS";
    title: string;
    summary: string;
    sector?: string;
    countryCode?: string;
    currency?: string;
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
        projectId: input.projectId,
        createdById: userId,
      },
      include: listingInclude,
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "market.listing.created", entityType: "MarketListing", entityId: listing.id },
    });
    return listing;
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
      select: { id: true },
    });
    if (!current) throw new Error("Listing not found");
    const listing = await transaction.marketListing.update({
      where: { id: listingId },
      data: { status },
      include: listingInclude,
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "market.listing.status.updated", entityType: "MarketListing", entityId: listing.id, metadata: { status } },
    });
    return listing;
  });
}

export async function listMarketInquiries(userId: string) {
  const inquiries = await db.marketInquiry.findMany({
    where: { OR: [{ requesterId: userId }, { listing: { createdById: userId } }] },
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
    if (listing.createdById === userId) throw new Error("Listing owner cannot create an inquiry");
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