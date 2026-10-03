import { MarketingCampaignStatus, MarketingLeadStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const campaignInclude = {
  leads: { orderBy: { updatedAt: "desc" as const } },
  audienceSegments: { orderBy: { updatedAt: "desc" as const } },
  payment: { select: { id: true, payerUserId: true, amountMinor: true, currency: true, status: true, provider: true, paidAt: true } },
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

export function calculateRecordedMarketingPerformance(campaign: { budgetMinor: number; kpiTarget: number | null; leads: Array<{ createdAt: Date; status: string; valueMinor: number | null }> }) {
  const leadCount = campaign.leads.length;
  const qualified = campaign.leads.filter((lead) => ["QUALIFIED", "CONTACTED", "CONVERTED"].includes(lead.status)).length;
  const converted = campaign.leads.filter((lead) => lead.status === "CONVERTED").length;
  const pipelineValueMinor = campaign.leads.reduce((total, lead) => total + (lead.valueMinor ?? 0), 0);
  const conversionRate = leadCount ? Math.round((converted / leadCount) * 100) : 0;
  const kpiProgress = campaign.kpiTarget ? Math.min(100, Math.round((converted / campaign.kpiTarget) * 100)) : 0;
  const pipelineReturnRatio = campaign.budgetMinor > 0 ? Number(((pipelineValueMinor - campaign.budgetMinor) / campaign.budgetMinor).toFixed(2)) : null;
  const allocatedBudgetPerLeadMinor = leadCount && campaign.budgetMinor > 0 ? Math.round(campaign.budgetMinor / leadCount) : null;
  const allocatedBudgetPerConversionMinor = converted && campaign.budgetMinor > 0 ? Math.round(campaign.budgetMinor / converted) : null;
  const trend = new Map<string, { converted: number; leads: number }>();
  campaign.leads.forEach((lead) => {
    const date = lead.createdAt.toISOString().slice(0, 10);
    const current = trend.get(date) ?? { converted: 0, leads: 0 };
    current.leads += 1;
    if (lead.status === "CONVERTED") current.converted += 1;
    trend.set(date, current);
  });
  return { allocatedBudgetPerConversionMinor, allocatedBudgetPerLeadMinor, allocationBasis: "CAMPAIGN_BUDGET_NOT_ACTUAL_SPEND" as const, conversionRate, converted, externalMetricsAvailable: false as const, externalUnavailable: ["REACH", "CLICKS", "IMPRESSIONS", "ACTUAL_SPEND", "ROAS"] as const, kpiProgress, leads: leadCount, pipelineReturnRatio, pipelineValueMinor, qualified, recordedLeadTrend: [...trend.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, value]) => ({ date, ...value })), source: "RECORDED_LEADS" as const };
}

async function refreshCampaignPerformance(campaignId: string, transaction: Prisma.TransactionClient = db) {
  const campaign = await transaction.marketingCampaign.findUnique({
    where: { id: campaignId },
    select: { budgetMinor: true, kpiTarget: true, leads: { select: { createdAt: true, status: true, valueMinor: true } } },
  });
  if (!campaign) return null;
  const snapshot = calculateRecordedMarketingPerformance(campaign);
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

export async function getMarketingReadiness() {
  const availableRobot = await db.robot.findFirst({ where: { status: "ACTIVE", isVisible: true }, orderBy: [{ intelligence: "desc" }, { skill: "desc" }], select: { id: true, name: true } });
  return { availableRobot, externalChannelProviderConnected: false, externalPaymentProviderConnected: false };
}

export async function createMarketingCampaign(input: { budgetMinor: number; callToAction?: string; channel: "CONTENT" | "EMAIL" | "SOCIAL" | "PAID_SEARCH" | "DIRECT"; contentBrief?: string; currency?: string; customerType: "INDIVIDUAL" | "ORGANIZATION"; endsAt?: Date; kpiTarget?: number; name: string; objective: string; organizationId?: string; startsAt?: Date; targetAudience?: string }, userId: string) {
  if (input.endsAt && input.startsAt && input.endsAt < input.startsAt) throw new Error("Campaign end date must be on or after its start date");
  if (input.customerType === "ORGANIZATION") {
    if (!input.organizationId) throw new Error("Organization is required for an organization campaign");
    const membership = await db.organizationMember.findFirst({ where: { organizationId: input.organizationId, userId, status: "ACTIVE", isOwner: true }, select: { id: true } });
    if (!membership) throw new Error("Organization owner access required");
  }
  const quality = assessCampaignQuality(input);
  return db.$transaction(async (transaction) => {
    const campaign = await transaction.marketingCampaign.create({ data: { budgetMinor: input.budgetMinor, callToAction: input.callToAction?.trim() || undefined, channel: input.channel, contentBrief: input.contentBrief?.trim() || undefined, currency: input.currency?.trim().toUpperCase() || "SAR", customerType: input.customerType, endsAt: input.endsAt, kpiTarget: input.kpiTarget, name: input.name.trim(), objective: input.objective.trim(), organizationId: input.organizationId, qualityScore: quality.score, qualitySignals: quality.signals, slug: `${slugify(input.name)}-${crypto.randomUUID().slice(0, 8)}`, startsAt: input.startsAt, targetAudience: input.targetAudience?.trim() || undefined, createdById: userId }, include: campaignInclude });
    await transaction.auditLog.create({ data: { actorId: userId, action: "marketing.campaign.created", entityType: "MarketingCampaign", entityId: campaign.id } });
    return campaign;
  });
}

export async function updateMarketingCampaignStatus(campaignId: string, status: "ACTIVE" | "PAUSED" | "ARCHIVED", userId: string) {
  return db.$transaction(async (transaction) => {
    const campaign = await transaction.marketingCampaign.findFirst({ where: { id: campaignId, createdById: userId }, select: { id: true, paymentId: true, qualityScore: true } });
    if (!campaign) throw new Error("Campaign not found");
    if (status === "ACTIVE" && campaign.qualityScore < 60) throw new Error("Campaign quality score is too low to activate");
    if (status === "ACTIVE" && !campaign.paymentId) throw new Error("Budget confirmation is required to activate");
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

export async function updateMarketingLead(input: { leadId: string; notes?: string; status: "NEW" | "QUALIFIED" | "CONTACTED" | "CONVERTED" | "LOST" }, userId: string) {
  return db.$transaction(async (transaction) => {
    const lead = await transaction.marketingLead.findFirst({ where: { id: input.leadId, campaign: { createdById: userId } }, select: { id: true, campaignId: true } });
    if (!lead) throw new Error("Marketing lead not found");
    const updated = await transaction.marketingLead.update({ where: { id: lead.id }, data: { status: MarketingLeadStatus[input.status], notes: input.notes?.trim() || undefined } });
    await refreshCampaignPerformance(lead.campaignId, transaction);
    await transaction.auditLog.create({ data: { actorId: userId, action: "marketing.lead.updated", entityType: "MarketingLead", entityId: lead.id, metadata: { status: input.status } } });
    return updated;
  });
}

export async function createMarketingAudienceSegment(input: { campaignId: string; interests?: string; location?: string; name: string; notes?: string }, userId: string) {
  return db.$transaction(async (transaction) => {
    const campaign = await transaction.marketingCampaign.findFirst({ where: { id: input.campaignId, createdById: userId }, select: { id: true } });
    if (!campaign) throw new Error("Campaign not found");
    const interests = (input.interests ?? "").split(/[,،\n]/).map((interest) => interest.trim()).filter(Boolean).slice(0, 30);
    const segment = await transaction.marketingAudienceSegment.create({ data: { campaignId: campaign.id, name: input.name.trim(), location: input.location?.trim() || undefined, interests, notes: input.notes?.trim() || undefined } });
    await transaction.auditLog.create({ data: { actorId: userId, action: "marketing.audience.created", entityType: "MarketingAudienceSegment", entityId: segment.id, metadata: { campaignId: campaign.id } } });
    return segment;
  });
}

export async function confirmCampaignPaymentAndAssignRobot(campaignId: string, userId: string) {
  return db.$transaction(async (transaction) => {
    const campaign = await transaction.marketingCampaign.findFirst({ where: { id: campaignId, createdById: userId }, select: { id: true, name: true, objective: true, channel: true, customerType: true, organizationId: true, budgetMinor: true, currency: true, paymentId: true, qualityScore: true, robotTaskId: true } });
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.paymentId || campaign.robotTaskId) throw new Error("Campaign payment already confirmed");
    if (campaign.qualityScore < 60) throw new Error("Campaign quality score is too low to activate");

    const membership = campaign.customerType === "ORGANIZATION" ? await transaction.organizationMember.findFirst({ where: { organizationId: campaign.organizationId ?? undefined, userId, status: "ACTIVE", isOwner: true }, select: { organizationId: true } }) : null;
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