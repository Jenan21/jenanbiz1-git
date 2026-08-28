import { db } from "@/lib/db";

export type FinancialSummary = {
  revenueByCurrency: Array<{ currency: string; succeededMinor: number; pendingMinor: number; refundedMinor: number }>;
  costsByCurrency: Array<{ currency: string; provider: string; recordedMinor: number; records: number }>;
  execution: { total: number; successful: number; failed: number; successRate: number };
  dataQuality: { costRecords: number; zeroCostRecords: number; unpricedCostRate: number };
  recentPayments: Array<{ amountMinor: number; currency: string; status: string; createdAt: string }>;
};

export async function getFinancialSummary(): Promise<FinancialSummary> {
  const [payments, costs, executions] = await Promise.all([
    db.payment.findMany({ select: { amountMinor: true, currency: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 5000 }),
    db.costRecord.findMany({ select: { provider: true, currency: true, computeCostMinor: true } }),
    db.modelExecution.findMany({ select: { success: true } }),
  ]);

  const currencies = new Map<string, { succeededMinor: number; pendingMinor: number; refundedMinor: number }>();
  for (const payment of payments) {
    const current = currencies.get(payment.currency) ?? { succeededMinor: 0, pendingMinor: 0, refundedMinor: 0 };
    if (payment.status === "SUCCEEDED") current.succeededMinor += payment.amountMinor;
    if (payment.status === "PENDING") current.pendingMinor += payment.amountMinor;
    if (payment.status === "REFUNDED") current.refundedMinor += payment.amountMinor;
    currencies.set(payment.currency, current);
  }

  const costGroups = new Map<string, { currency: string; provider: string; recordedMinor: number; records: number }>();
  for (const cost of costs) {
    const key = `${cost.currency}:${cost.provider}`;
    const current = costGroups.get(key) ?? { currency: cost.currency, provider: cost.provider, recordedMinor: 0, records: 0 };
    current.recordedMinor += cost.computeCostMinor;
    current.records += 1;
    costGroups.set(key, current);
  }

  const successful = executions.filter((execution) => execution.success).length;
  const zeroCostRecords = costs.filter((cost) => cost.computeCostMinor === 0).length;
  return {
    revenueByCurrency: [...currencies.entries()].map(([currency, values]) => ({ currency, ...values })),
    costsByCurrency: [...costGroups.values()],
    execution: { total: executions.length, successful, failed: executions.length - successful, successRate: executions.length ? Math.round((successful / executions.length) * 100) : 0 },
    dataQuality: { costRecords: costs.length, zeroCostRecords, unpricedCostRate: costs.length ? Math.round((zeroCostRecords / costs.length) * 100) : 0 },
    recentPayments: payments.slice(0, 20).map((payment) => ({ ...payment, createdAt: payment.createdAt.toISOString() })),
  };
}
