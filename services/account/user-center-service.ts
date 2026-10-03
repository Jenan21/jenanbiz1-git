import { db } from "@/lib/db";

export async function getUserPayments(userId: string) {
  return db.payment.findMany({
    where: {
      OR: [
        { payerUserId: userId },
        { organization: { members: { some: { userId, status: "ACTIVE", isOwner: true } } } },
      ],
    },
    select: {
      id: true,
      amountMinor: true,
      currency: true,
      status: true,
      provider: true,
      externalRef: true,
      paidAt: true,
      createdAt: true,
      subscription: { select: { plan: { select: { name: true, code: true } } } },
      marketingCampaign: { select: { name: true } },
      organization: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getUserReportIndex(userId: string) {
  const [projects, activity] = await Promise.all([
    db.project.findMany({
      where: { OR: [{ createdById: userId }, { members: { some: { userId } } }] },
      select: { id: true, name: true, status: true, currentPhase: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    db.auditLog.findMany({
      where: { actorId: userId },
      select: { id: true, action: true, entityType: true, entityId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  return { projects, activity };
}