import {
  FinancialEntryType,
  OrganizationMemberStatus,
  OrganizationProgramKey,
  OrganizationProgramStatus,
  Prisma,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";

async function requireFinanceAccess(organizationId: string, userId: string) {
  const [membership, program] = await Promise.all([
    db.organizationMember.findFirst({
      where: { organizationId, userId, status: OrganizationMemberStatus.ACTIVE },
      select: { id: true },
    }),
    db.organizationProgram.findUnique({
      where: { organizationId_key: { organizationId, key: OrganizationProgramKey.FINANCE } },
      select: { status: true },
    }),
  ]);
  if (!membership) throw new Error("Active organization membership required");
  if (program?.status !== OrganizationProgramStatus.ACTIVE) throw new Error("Active financial program required");
}

export async function listFinancialEntries(organizationId: string, userId: string) {
  await requireFinanceAccess(organizationId, userId);
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
  await requireFinanceAccess(input.organizationId, input.userId);
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