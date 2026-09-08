import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import { confirmCampaignPaymentAndAssignRobot, createMarketingCampaign, createMarketingLead, listMarketingCampaigns, updateMarketingCampaignStatus } from "@/services/marketing/campaign-service";

const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createCampaign"), name: z.string().trim().min(2).max(160), objective: z.string().trim().min(10).max(1000), channel: z.enum(["CONTENT", "EMAIL", "SOCIAL", "PAID_SEARCH", "DIRECT"]), customerType: z.enum(["INDIVIDUAL", "ORGANIZATION"]), budgetMinor: z.number().int().min(0).max(1_000_000_000), currency: z.string().trim().length(3).optional() }),
  z.object({ action: z.literal("confirmPaymentAndAssign"), campaignId: z.string().cuid() }),
  z.object({ action: z.literal("updateCampaignStatus"), campaignId: z.string().cuid(), status: z.enum(["PAUSED", "ARCHIVED"]) }),
  z.object({ action: z.literal("createLead"), campaignId: z.string().cuid(), label: z.string().trim().min(2).max(160), source: z.string().trim().max(160).optional(), status: z.enum(["NEW", "QUALIFIED", "CONTACTED", "CONVERTED", "LOST"]).optional(), valueMinor: z.number().int().min(0).max(1_000_000_000).optional() }),
]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  return NextResponse.json({ success: true, campaigns: await listMarketingCampaigns(user.id) });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid marketing command" }, { status: 400 });
  try {
    const input = parsed.data;
    const result = input.action === "createCampaign" ? await createMarketingCampaign(input, user.id) : input.action === "confirmPaymentAndAssign" ? await confirmCampaignPaymentAndAssignRobot(input.campaignId, user.id) : input.action === "updateCampaignStatus" ? await updateMarketingCampaignStatus(input.campaignId, input.status, user.id) : await createMarketingLead(input, user.id);
    return NextResponse.json({ success: true, result }, { status: input.action === "createCampaign" ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Marketing command failed";
    return NextResponse.json({ success: false, message }, { status: message.endsWith("not found") ? 404 : 409 });
  }
}