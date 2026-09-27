import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import { confirmCampaignPaymentAndAssignRobot, createMarketingAudienceSegment, createMarketingCampaign, createMarketingLead, getMarketingReadiness, listMarketingCampaigns, refreshMarketingCampaignPerformance, updateMarketingCampaignStatus, updateMarketingLead } from "@/services/marketing/campaign-service";
import { listSoftwareOrganizations } from "@/services/software/software-access";

const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createCampaign"), name: z.string().trim().min(2).max(160), objective: z.string().trim().min(10).max(1000), organizationId: z.string().cuid().optional(), channel: z.enum(["CONTENT", "EMAIL", "SOCIAL", "PAID_SEARCH", "DIRECT"]), customerType: z.enum(["INDIVIDUAL", "ORGANIZATION"]), budgetMinor: z.number().int().min(0).max(1_000_000_000), callToAction: z.string().trim().max(300).optional(), contentBrief: z.string().trim().max(4000).optional(), currency: z.string().trim().length(3).optional(), startsAt: z.string().datetime().optional(), endsAt: z.string().datetime().optional(), kpiTarget: z.number().int().min(1).max(1_000_000).optional(), targetAudience: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("confirmPaymentAndAssign"), campaignId: z.string().cuid() }),
  z.object({ action: z.literal("refreshPerformance"), campaignId: z.string().cuid() }),
  z.object({ action: z.literal("updateCampaignStatus"), campaignId: z.string().cuid(), status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]) }),
  z.object({ action: z.literal("createLead"), campaignId: z.string().cuid(), label: z.string().trim().min(2).max(160), source: z.string().trim().max(160).optional(), status: z.enum(["NEW", "QUALIFIED", "CONTACTED", "CONVERTED", "LOST"]).optional(), valueMinor: z.number().int().min(0).max(1_000_000_000).optional() }),
  z.object({ action: z.literal("updateLead"), leadId: z.string().cuid(), status: z.enum(["NEW", "QUALIFIED", "CONTACTED", "CONVERTED", "LOST"]), notes: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal("createAudience"), campaignId: z.string().cuid(), name: z.string().trim().min(2).max(160), location: z.string().trim().max(160).optional(), interests: z.string().trim().max(1000).optional(), notes: z.string().trim().max(2000).optional() }),
]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const [campaigns, organizations, readiness] = await Promise.all([listMarketingCampaigns(user.id), listSoftwareOrganizations(user.id), getMarketingReadiness()]);
  return NextResponse.json({ success: true, campaigns, organizations, readiness });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid marketing command" }, { status: 400 });
  try {
    const input = parsed.data;
    const result = input.action === "createCampaign"
      ? await createMarketingCampaign({ ...input, startsAt: input.startsAt ? new Date(input.startsAt) : undefined, endsAt: input.endsAt ? new Date(input.endsAt) : undefined }, user.id)
      : input.action === "confirmPaymentAndAssign"
        ? await confirmCampaignPaymentAndAssignRobot(input.campaignId, user.id)
        : input.action === "refreshPerformance"
          ? await refreshMarketingCampaignPerformance(input.campaignId, user.id)
          : input.action === "updateCampaignStatus"
            ? await updateMarketingCampaignStatus(input.campaignId, input.status, user.id)
            : input.action === "createLead"
              ? await createMarketingLead(input, user.id)
              : input.action === "updateLead"
                ? await updateMarketingLead(input, user.id)
                : await createMarketingAudienceSegment(input, user.id);
    return NextResponse.json({ success: true, result }, { status: input.action === "createCampaign" || input.action === "createLead" || input.action === "createAudience" ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Marketing command failed";
    return NextResponse.json({ success: false, message }, { status: message.endsWith("not found") ? 404 : 409 });
  }
}