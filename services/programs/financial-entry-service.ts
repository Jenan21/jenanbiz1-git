import {
  FinancialEntryType,
  OrganizationProgramKey,
  OrganizationProgramStatus,
  Prisma,
} from "@/generated/prisma/client";
import { ORGANIZATION_PERMISSIONS } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { requireOrganizationPermission } from "@/services/software/software-access";

// The ledger holds the organization's income and expenses (payroll postings included), so it is not open to every member:
// the owner, or a member whose role carries the finance permission, may read it; writing needs the write permission.
async function requireFinanceAccess(organizationId: string, userId: string, permissionKey: string) {
  await requireOrganizationPermission(organizationId, userId, permissionKey);
  const program = await db.organizationProgram.findUnique({
    where: { organizationId_key: { organizationId, key: OrganizationProgramKey.FINANCE } },
    select: { status: true },
  });
  if (program?.status !== OrganizationProgramStatus.ACTIVE) throw new Error("Active financial program required");
}

export async function listFinancialEntries(organizationId: string, userId: string) {
  await requireFinanceAccess(organizationId, userId, ORGANIZATION_PERMISSIONS.financeRead);
  return db.financialEntry.findMany({
    where: { organizationId },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
}

export async function createFinancialEntry(input: {
  organizationId: string;
  type: FinancialEntryType;
  amountMinor: number;
  currency: string;
  description: string;
  occurredAt: Date;
  userId: string;
}) {
  await requireFinanceAccess(input.organizationId, input.userId, ORGANIZATION_PERMISSIONS.financeWrite);
  return db.$transaction(async (transaction) => {
    const entry = await transaction.financialEntry.create({
      data: {
        organizationId: input.organizationId,
        type: input.type,
        amountMinor: input.amountMinor,
        currency: input.currency,
        description: input.description,
        occurredAt: input.occurredAt,
        createdById: input.userId,
      },
    });
    await transaction.auditLog.create({
      data: {
        actorId: input.userId,
        organizationId: input.organizationId,
        action: "finance.entry.created",
        entityType: "FinancialEntry",
        entityId: entry.id,
        metadata: { type: input.type, amountMinor: input.amountMinor, currency: input.currency } as Prisma.InputJsonValue,
      },
    });
    return entry;
  });
}