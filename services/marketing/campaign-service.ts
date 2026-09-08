import { MarketingCampaignStatus, MarketingLeadStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const campaignInclude = {
  leads: { orderBy: { updatedAt: "desc" as const } },
  payment: { select: { id: true, payerUserId: true, amountMinor: true, currency: true, status: true, paidAt: true } },
  robotTask: { select: { id: true, title: true, status: true, robot: { select: { id: true, name: true } } } },
} satisfies Prisma.MarketingCampaignInclude;

function slugify(value: string) {
  const slug = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  return slug || "campaign";
}

export async function listMarketingCampaigns(userId: string) {
  return db.marketingCampaign.findMany({ where: { createdById: userId }, include: campaignInclude, orderBy: { updatedAt: "desc" } });
}

export async function createMarketingCampaign(input: { name: string; objective: string; channel: "CONTENT" | "EMAIL" | "SOCIAL" | "PAID_SEARCH" | "DIRECT"; customerType: "INDIVIDUAL" | "ORGANIZATION"; budgetMinor: number; currency?: string }, userId: string) {
  return db.$transaction(async (transaction) => {
    const campaign = await transaction.marketingCampaign.create({ data: { name: input.name.trim(), objective: input.objective.trim(), channel: input.channel, customerType: input.customerType, budgetMinor: input.budgetMinor, currency: input.currency?.trim().toUpperCase() || "SAR", slug: `${slugify(input.name)}-${crypto.randomUUID().slice(0, 8)}`, createdById: userId }, include: campaignInclude });
    await transaction.auditLog.create({ data: { actorId: userId, action: "marketing.campaign.created", entityType: "MarketingCampaign", entityId: campaign.id } });
    return campaign;
  });
}

export async function updateMarketingCampaignStatus(campaignId: string, status: "ACTIVE" | "PAUSED" | "ARCHIVED", userId: string) {
  return db.$transaction(async (transaction) => {
    const campaign = await transaction.marketingCampaign.findFirst({ where: { id: campaignId, createdById: userId }, select: { id: true } });
    if (!campaign) throw new Error("Campaign not found");
    const updated = await transaction.marketingCampaign.update({ where: { id: campaignId }, data: { status }, include: campaignInclude });
    await transaction.auditLog.create({ data: { actorId: userId, action: "marketing.campaign.status.updated", entityType: "MarketingCampaign", entityId: updated.id, metadata: { status } } });
    return updated;
  });
}

export async function createMarketingLead(input: { campaignId: string; label: string; source?: string; status?: "NEW" | "QUALIFIED" | "CONTACTED" | "CONVERTED" | "LOST"; valueMinor?: number }, userId: string) {
  return db.$transaction(async (transaction) => {
    const campaign = await transaction.marketingCampaign.findFirst({ where: { id: input.campaignId, createdById: userId }, select: { id: true } });
    if (!campaign) throw new Error("Campaign not found");
    const lead = await transaction.marketingLead.create({ data: { campaignId: campaign.id, label: input.label.trim(), source: input.source?.trim() || undefined, status: input.status ? MarketingLeadStatus[input.status] : MarketingLeadStatus.NEW, valueMinor: input.valueMinor } });
    await transaction.auditLog.create({ data: { actorId: userId, action: "marketing.lead.created", entityType: "MarketingLead", entityId: lead.id, metadata: { campaignId: campaign.id } } });
    return lead;
  });
}

export async function confirmCampaignPaymentAndAssignRobot(campaignId: string, userId: string) {
  return db.$transaction(async (transaction) => {
    const campaign = await transaction.marketingCampaign.findFirst({ where: { id: campaignId, createdById: userId }, select: { id: true, name: true, objective: true, channel: true, customerType: true, budgetMinor: true, currency: true, paymentId: true, robotTaskId: true } });
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.paymentId || campaign.robotTaskId) throw new Error("Campaign payment already confirmed");

    const membership = campaign.customerType === "ORGANIZATION" ? await transaction.organizationMember.findFirst({ where: { userId, status: "ACTIVE" }, select: { organizationId: true } }) : null;
    if (campaign.customerType === "ORGANIZATION" && !membership) throw new Error("Active organization membership required");
    const robot = await transaction.robot.findFirst({ where: { status: "ACTIVE", isVisible: true }, orderBy: [{ intelligence: "desc" }, { skill: "desc" }], select: { id: true, name: true } });
    if (!robot) throw new Error("No active bounty robot is available");

    const payment = await transaction.payment.create({ data: { organizationId: membership?.organizationId, payerUserId: campaign.customerType === "INDIVIDUAL" ? userId : undefined, amountMinor: campaign.budgetMinor, currency: campaign.currency, status: "SUCCEEDED", provider: "INTERNAL_CONFIRMATION", paidAt: new Date(), externalRef: `marketing-${campaign.id}`, metadata: { campaignId: campaign.id, purpose: "marketing-campaign", customerType: campaign.customerType } } });
    const robotTask = await transaction.robotTask.create({ data: { robotId: robot.id, title: `Marketing campaign: ${campaign.name}`, description: `Channel: ${campaign.channel}\nObjective: ${campaign.objective}`, status: "ACTIVE", priority: "HIGH" } });
    const updated = await transaction.marketingCampaign.update({ where: { id: campaign.id }, data: { organizationId: membership?.organizationId, paymentId: payment.id, robotTaskId: robotTask.id, status: MarketingCampaignStatus.ACTIVE }, include: campaignInclude });
    await transaction.auditLog.createMany({ data: [
      { actorId: userId, organizationId: membership?.organizationId, action: "marketing.campaign.payment.confirmed", entityType: "Payment", entityId: payment.id, metadata: { campaignId: campaign.id, amountMinor: payment.amountMinor, currency: payment.currency, customerType: campaign.customerType } },
      { actorId: userId, organizationId: membership?.organizationId, action: "marketing.campaign.robot.assigned", entityType: "RobotTask", entityId: robotTask.id, metadata: { campaignId: campaign.id, robotId: robot.id } },
    ] });
    return updated;
  });
}