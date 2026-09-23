import { MarketingCampaignStatus, MarketingLeadStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const campaignInclude = {
  leads: { orderBy: { updatedAt: "desc" as const } },
  payment: { select: { id: true, payerUserId: true, amountMinor: true, currency: true, status: true, paidAt: true } },
  robotTask: { select: { id: true, title: true, status: true, robot: { select: { id: true, name: true } } } },
} satisfies Prisma.MarketingCampaignInclude;

function assessCampaignQuality(input: {
  budgetMinor: number;
  callToAction?: string;
  channel: "CONTENT" | "EMAIL" | "SOCIAL" | "PAID_SEARCH" | "DIRECT";
  kpiTarget?: number;
  objective: string;
  targetAudience?: string;
}) {
  const signals = {
    hasAudience: Boolean(input.targetAudience?.trim()),
    hasBudget: input.budgetMinor > 0,
    hasCallToAction: Boolean(input.callToAction?.trim()),
    hasKpiTarget: Boolean(input.kpiTarget && input.kpiTarget > 0),
    multiStepObjective: input.objective.trim().length >= 80,
    paidChannelBudgeted: input.channel !== "PAID_SEARCH" || input.budgetMinor > 0,
  };
  const score = Math.min(100,
    18 +
    (signals.multiStepObjective ? 22 : 0) +
    (signals.hasAudience ? 18 : 0) +
    (signals.hasCallToAction ? 16 : 0) +
    (signals.hasBudget ? 14 : 0) +
    (signals.hasKpiTarget ? 16 : 0) +
    (signals.paidChannelBudgeted ? 14 : 0),
  );
  return { score, signals };
}

async function refreshCampaignPerformance(campaignId: string, transaction: Prisma.TransactionClient = db) {
  const campaign = await transaction.marketingCampaign.findUnique({
    where: { id: campaignId },
    select: { budgetMinor: true, kpiTarget: true, leads: { select: { status: true, valueMinor: true } } },
  });
  if (!campaign) return null;
  const leads = campaign.leads.length;
  const qualified = campaign.leads.filter((lead) => ["QUALIFIED", "CONTACTED", "CONVERTED"].includes(lead.status)).length;
  const converted = campaign.leads.filter((lead) => lead.status === "CONVERTED").length;
  const pipelineValueMinor = campaign.leads.reduce((total, lead) => total + (lead.valueMinor ?? 0), 0);
  const conversionRate = leads ? Math.round((converted / leads) * 100) : 0;
  const kpiProgress = campaign.kpiTarget ? Math.min(100, Math.round((converted / campaign.kpiTarget) * 100)) : 0;
  const roi = campaign.budgetMinor > 0 ? Number(((pipelineValueMinor - campaign.budgetMinor) / campaign.budgetMinor).toFixed(2)) : null;
  const snapshot = { conversionRate, converted, kpiProgress, leads, pipelineValueMinor, qualified, roi };
  await transaction.marketingCampaign.update({ where: { id: campaignId }, data: { performanceSnapshot: snapshot } });
  return snapshot;
}

function slugify(value: string) {
  const slug = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  return slug || "campaign";
}

export async function listMarketingCampaigns(userId: string) {
  return db.marketingCampaign.findMany({ where: { createdById: userId }, include: campaignInclude, orderBy: { updatedAt: "desc" } });
}

export async function createMarketingCampaign(input: { budgetMinor: number; callToAction?: string; channel: "CONTENT" | "EMAIL" | "SOCIAL" | "PAID_SEARCH" | "DIRECT"; currency?: string; customerType: "INDIVIDUAL" | "ORGANIZATION"; kpiTarget?: number; name: string; objective: string; targetAudience?: string }, userId: string) {
  const quality = assessCampaignQuality(input);
  return db.$transaction(async (transaction) => {
    const campaign = await transaction.marketingCampaign.create({ data: { budgetMinor: input.budgetMinor, callToAction: input.callToAction?.trim() || undefined, channel: input.channel, currency: input.currency?.trim().toUpperCase() || "SAR", customerType: input.customerType, kpiTarget: input.kpiTarget, name: input.name.trim(), objective: input.objective.trim(), qualityScore: quality.score, qualitySignals: quality.signals, slug: `${slugify(input.name)}-${crypto.randomUUID().slice(0, 8)}`, targetAudience: input.targetAudience?.trim() || undefined, createdById: userId }, include: campaignInclude });
    await transaction.auditLog.create({ data: { actorId: userId, action: "marketing.campaign.created", entityType: "MarketingCampaign", entityId: campaign.id } });
    return campaign;
  });
}

export async function updateMarketingCampaignStatus(campaignId: string, status: "ACTIVE" | "PAUSED" | "ARCHIVED", userId: string) {
  return db.$transaction(async (transaction) => {
    const campaign = await transaction.marketingCampaign.findFirst({ where: { id: campaignId, createdById: userId }, select: { id: true, qualityScore: true } });
    if (!campaign) throw new Error("Campaign not found");
    if (status === "ACTIVE" && campaign.qualityScore < 60) throw new Error("Campaign quality score is too low to activate");
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
    await refreshCampaignPerformance(campaign.id, transaction);
    await transaction.auditLog.create({ data: { actorId: userId, action: "marketing.lead.created", entityType: "MarketingLead", entityId: lead.id, metadata: { campaignId: campaign.id } } });
    return lead;
  });
}

export async function confirmCampaignPaymentAndAssignRobot(campaignId: string, userId: string) {
  return db.$transaction(async (transaction) => {
    const campaign = await transaction.marketingCampaign.findFirst({ where: { id: campaignId, createdById: userId }, select: { id: true, name: true, objective: true, channel: true, customerType: true, budgetMinor: true, currency: true, paymentId: true, qualityScore: true, robotTaskId: true } });
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.paymentId || campaign.robotTaskId) throw new Error("Campaign payment already confirmed");
    if (campaign.qualityScore < 60) throw new Error("Campaign quality score is too low to activate");

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

export async function refreshMarketingCampaignPerformance(campaignId: string, userId: string) {
  return db.$transaction(async (transaction) => {
    const campaign = await transaction.marketingCampaign.findFirst({ where: { id: campaignId, createdById: userId }, select: { id: true } });
    if (!campaign) throw new Error("Campaign not found");
    const snapshot = await refreshCampaignPerformance(campaign.id, transaction);
    const updated = await transaction.marketingCampaign.findUnique({ where: { id: campaign.id }, include: campaignInclude });
    return { campaign: updated, snapshot };
  });
}