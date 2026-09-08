import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import { createMarketInquiry, createMarketListing, listMarketInquiries, listMarketListings, updateMarketInquiryStatus, updateMarketListingStatus } from "@/services/market/market-service";

const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), kind: z.enum(["PROJECT", "BUSINESS"]), title: z.string().trim().min(2).max(160), summary: z.string().trim().min(20).max(4000), sector: z.string().trim().max(120).optional(), countryCode: z.string().trim().length(2).optional(), currency: z.string().trim().length(3).optional(), projectId: z.string().cuid().optional() }),
  z.object({ action: z.literal("updateStatus"), listingId: z.string().cuid(), status: z.enum(["PUBLISHED", "PAUSED", "ARCHIVED"]) }),
  z.object({ action: z.literal("createInquiry"), listingId: z.string().cuid(), message: z.string().trim().min(10).max(2_000) }),
  z.object({ action: z.literal("updateInquiryStatus"), inquiryId: z.string().cuid(), status: z.enum(["CONTACTED", "CLOSED"]) }),
]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const [listings, inquiries] = await Promise.all([listMarketListings(user.id), listMarketInquiries(user.id)]);
  return NextResponse.json({ success: true, listings, inquiries });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid market command" }, { status: 400 });
  try {
    const input = parsed.data;
    const result = input.action === "create"
      ? await createMarketListing(input, user.id)
      : input.action === "updateStatus"
        ? await updateMarketListingStatus(input.listingId, input.status, user.id)
        : input.action === "createInquiry"
          ? await createMarketInquiry(input.listingId, input.message, user.id)
          : await updateMarketInquiryStatus(input.inquiryId, input.status, user.id);
    return NextResponse.json({ success: true, result }, { status: input.action === "create" || input.action === "createInquiry" ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Market command failed";
    return NextResponse.json({ success: false, message }, { status: message.endsWith("not found") ? 404 : 409 });
  }
}