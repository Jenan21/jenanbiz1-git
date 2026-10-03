import { SoftwareBranchStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireSoftwareMembership } from "@/services/software/software-access";

function optional(value?: string) {
  return value?.trim() || undefined;
}

export async function createSoftwareBranch(input: { address?: string; city?: string; code: string; countryCode?: string; name: string; organizationId: string; userId: string }) {
  await requireSoftwareMembership(input.organizationId, input.userId, true);
  return db.$transaction(async (transaction) => {
    const branch = await transaction.softwareBranch.create({ data: { organizationId: input.organizationId, code: input.code.trim().toUpperCase(), name: input.name.trim(), countryCode: optional(input.countryCode)?.toUpperCase(), city: optional(input.city), address: optional(input.address), createdById: input.userId } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.branch.created", entityType: "SoftwareBranch", entityId: branch.id, metadata: { code: branch.code } } });
    return branch;
  });
}

export async function updateSoftwareBranchStatus(input: { branchId: string; organizationId: string; status: SoftwareBranchStatus; userId: string }) {
  await requireSoftwareMembership(input.organizationId, input.userId, true);
  const branch = await db.softwareBranch.findFirst({ where: { id: input.branchId, organizationId: input.organizationId }, select: { id: true } });
  if (!branch) throw new Error("Software branch not found");
  return db.$transaction(async (transaction) => {
    const updated = await transaction.softwareBranch.update({ where: { id: branch.id }, data: { status: input.status } });
    if (input.status === SoftwareBranchStatus.INACTIVE) await transaction.softwareSettings.updateMany({ where: { organizationId: input.organizationId, defaultBranchId: branch.id }, data: { defaultBranchId: null } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.branch.status.updated", entityType: "SoftwareBranch", entityId: branch.id, metadata: { status: input.status } } });
    return updated;
  });
}

export async function saveSoftwareSettings(input: { allowNegativeInventory: boolean; defaultBranchId?: string; defaultCurrency: string; fiscalYearStartMonth: number; invoicePrefix: string; organizationId: string; taxRateBps: number; timezone: string; userId: string }) {
  await requireSoftwareMembership(input.organizationId, input.userId, true);
  if (input.defaultBranchId) {
    const branch = await db.softwareBranch.findFirst({ where: { id: input.defaultBranchId, organizationId: input.organizationId, status: SoftwareBranchStatus.ACTIVE }, select: { id: true } });
    if (!branch) throw new Error("Active default branch not found");
  }
  return db.$transaction(async (transaction) => {
    const settings = await transaction.softwareSettings.upsert({ where: { organizationId: input.organizationId }, create: { organizationId: input.organizationId, defaultBranchId: input.defaultBranchId, defaultCurrency: input.defaultCurrency.trim().toUpperCase(), fiscalYearStartMonth: input.fiscalYearStartMonth, invoicePrefix: input.invoicePrefix.trim().toUpperCase(), taxRateBps: input.taxRateBps, timezone: input.timezone.trim(), allowNegativeInventory: input.allowNegativeInventory }, update: { defaultBranchId: input.defaultBranchId ?? null, defaultCurrency: input.defaultCurrency.trim().toUpperCase(), fiscalYearStartMonth: input.fiscalYearStartMonth, invoicePrefix: input.invoicePrefix.trim().toUpperCase(), taxRateBps: input.taxRateBps, timezone: input.timezone.trim(), allowNegativeInventory: input.allowNegativeInventory } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.settings.updated", entityType: "SoftwareSettings", entityId: settings.id, metadata: { defaultBranchId: settings.defaultBranchId, defaultCurrency: settings.defaultCurrency, fiscalYearStartMonth: settings.fiscalYearStartMonth, taxRateBps: settings.taxRateBps } } });
    return settings;
  });
}