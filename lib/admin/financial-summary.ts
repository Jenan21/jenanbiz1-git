import { db } from "@/lib/db";

export type FinancialSummary = {
  revenueByCurrency: Array<{ currency: string; succeededMinor: number; pendingMinor: number; refundedMinor: number }>;
  costsByCurrency: Array<{ currency: string; provider: string; recordedMinor: number; records: number }>;
  execution: { total: number; successful: number; failed: number; successRate: number };
  dataQuality: { costRecords: number; zeroCostRecords: number; unpricedCostRate: number };
  recentPayments: Array<{ amountMinor: number; currency: string; status: string; createdAt: string }>;
};

export async function getFinancialSummary(): Promise<FinancialSummary> {
  const [paymentGroups, costGroups, executionGroups, costRecords, zeroCostRecords, recentPayments] = await Promise.all([
    db.payment.groupBy({ by: ["currency", "status"], _sum: { amountMinor: true } }),
    db.costRecord.groupBy({ by: ["currency", "provider"], _sum: { computeCostMinor: true }, _count: { _all: true } }),
    db.modelExecution.groupBy({ by: ["success"], _count: { _all: true } }),
    db.costRecord.count(),
    db.costRecord.count({ where: { computeCostMinor: 0 } }),
    db.payment.findMany({ select: { amountMinor: true, currency: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  const currencies = new Map<string, { succeededMinor: number; pendingMinor: number; refundedMinor: number }>();
  for (const payment of paymentGroups) {
    const current = currencies.get(payment.currency) ?? { succeededMinor: 0, pendingMinor: 0, refundedMinor: 0 };
    const amountMinor = payment._sum.amountMinor ?? 0;
    if (payment.status === "SUCCEEDED") current.succeededMinor += amountMinor;
    if (payment.status === "PENDING") current.pendingMinor += amountMinor;
    if (payment.status === "REFUNDED") current.refundedMinor += amountMinor;
    currencies.set(payment.currency, current);
  }

  const successful = executionGroups.find((execution) => execution.success)?._count._all ?? 0;
  const executionTotal = executionGroups.reduce((sum, execution) => sum + execution._count._all, 0);
  return {
    revenueByCurrency: [...currencies.entries()].map(([currency, values]) => ({ currency, ...values })),
    costsByCurrency: costGroups.map((cost) => ({ currency: cost.currency, provider: cost.provider, recordedMinor: cost._sum.computeCostMinor ?? 0, records: cost._count._all })),
    execution: { total: executionTotal, successful, failed: executionTotal - successful, successRate: executionTotal ? Math.round((successful / executionTotal) * 100) : 0 },
    dataQuality: { costRecords, zeroCostRecords, unpricedCostRate: costRecords ? Math.round((zeroCostRecords / costRecords) * 100) : 0 },
    recentPayments: recentPayments.map((payment) => ({ ...payment, createdAt: payment.createdAt.toISOString() })),
  };
}
