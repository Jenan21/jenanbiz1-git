import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { publicErrorMessage } from "@/lib/http/safe-error";
import { enforceRouteRateLimit } from "@/lib/rate-limit/route-rate-limit";
import { confirmCampaignPaymentReceived, listPendingMarketingPaymentRequests } from "@/services/marketing/campaign-service";

// Administrators only. A campaign's payment is recorded as a PENDING request by its owner; it becomes paid, and the
// campaign active, only when an administrator confirms here that the money for it has arrived.
const confirmSchema = z.object({
  action: z.literal("confirmPaymentReceived"),
  // The amount the request was for, so a stale screen cannot confirm a different figure. `Payment.amountMinor` is a 32-bit column.
  amountMinor: z.number().int().positive().max(2_147_483_647),
  campaignId: z.string().cuid(),
  // The bank transfer or receipt reference the money was matched against; kept on the payment and in the audit trail.
  reference: z.string().trim().min(3).max(120),
});

async function requireAdministrator() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasPlatformAdminAccess(user.systemRole)) return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  return user;
}

export async function GET(): Promise<NextResponse> {
  const admin = await requireAdministrator();
  if (admin instanceof NextResponse) return admin;
  try {
    return NextResponse.json({ success: true, requests: await listPendingMarketingPaymentRequests() }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, message: publicErrorMessage(error, "Unable to load payment requests") }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const admin = await requireAdministrator();
  if (admin instanceof NextResponse) return admin;
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const limited = await enforceRouteRateLimit(request, { limit: 30, scope: "marketing:payment-review", userId: admin.id, windowMs: 60_000 });
  if (limited) return limited;
  const parsed = confirmSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid payment confirmation" }, { status: 400 });
  try {
    const result = await confirmCampaignPaymentReceived(parsed.data, admin.id);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = publicErrorMessage(error, "Payment confirmation failed");
    return NextResponse.json({ success: false, message }, { status: message.endsWith("not found") ? 404 : 409 });
  }
}
