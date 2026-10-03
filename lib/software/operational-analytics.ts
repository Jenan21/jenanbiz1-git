import type { SoftwareWorkspaceData } from "@/components/software/software-erp-types";

const CRM_WEIGHTS = { NEW: 0.1, QUALIFIED: 0.35, CONTACTED: 0.65, WON: 1, LOST: 0 } as const;

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function buildInventoryAnalytics(workspace: SoftwareWorkspaceData, now = new Date()) {
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const recentMovements = workspace.operations.movements.filter((movement) => new Date(movement.occurredAt).getTime() >= cutoff);
  const values = new Map<string, { costMinor: number; reorderMinor: number }>();
  for (const product of workspace.sales.products) {
    const current = values.get(product.currency) ?? { costMinor: 0, reorderMinor: 0 };
    current.costMinor += product.costMinor * product.stockQuantity;
    current.reorderMinor += product.costMinor * Math.max(0, product.reorderLevel - product.stockQuantity);
    values.set(product.currency, current);
  }
  const countRows = workspace.sales.products.map((product) => {
    const latestCount = workspace.operations.movements.find((movement) => movement.productId === product.id && movement.type === "ADJUSTMENT");
    return { id: product.id, name: product.name, sku: product.sku, lastCountedAt: latestCount?.occurredAt ?? null, status: latestCount && new Date(latestCount.occurredAt).getTime() >= cutoff ? "COUNTED" as const : "DUE" as const };
  });
  return {
    itemCount: workspace.sales.products.length,
    unitCount: sum(workspace.sales.products.map((product) => product.stockQuantity)),
    lowStockCount: workspace.sales.products.filter((product) => product.stockQuantity <= product.reorderLevel).length,
    recentMovementCount: recentMovements.length,
    recentNetQuantity: sum(recentMovements.map((movement) => movement.quantity)),
    values: [...values.entries()].map(([currency, value]) => ({ currency, ...value })),
    reorderItems: workspace.sales.products.filter((product) => product.stockQuantity <= product.reorderLevel).map((product) => ({ id: product.id, name: product.name, sku: product.sku, stockQuantity: product.stockQuantity, reorderLevel: product.reorderLevel, shortage: Math.max(0, product.reorderLevel - product.stockQuantity), currency: product.currency, reorderCostMinor: Math.max(0, product.reorderLevel - product.stockQuantity) * product.costMinor })),
    countRows,
  };
}

export function buildCrmAnalytics(workspace: SoftwareWorkspaceData) {
  const currencies = new Map<string, { leadCount: number; openMinor: number; securedMinor: number; weightedMinor: number }>();
  for (const lead of workspace.operations.leads) {
    const current = currencies.get(lead.currency) ?? { leadCount: 0, openMinor: 0, securedMinor: 0, weightedMinor: 0 };
    const valueMinor = lead.valueMinor ?? 0;
    current.leadCount += 1;
    if (lead.status !== "LOST" && lead.status !== "WON") current.openMinor += valueMinor;
    if (lead.status === "WON") current.securedMinor += valueMinor;
    current.weightedMinor += Math.round(valueMinor * CRM_WEIGHTS[lead.status as keyof typeof CRM_WEIGHTS]);
    currencies.set(lead.currency, current);
  }
  return {
    currencies: [...currencies.entries()].map(([currency, value]) => ({ currency, ...value })),
    linkedCustomers: workspace.operations.leads.filter((lead) => lead.customerId).length,
    pendingActions: workspace.operations.leads.filter((lead) => !["WON", "LOST"].includes(lead.status) && lead.nextAction).length,
    weights: CRM_WEIGHTS,
  };
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function buildProjectOperations(workspace: SoftwareWorkspaceData) {
  const projects = workspace.operations.projects.map((project) => {
    const completedPhases = project.phases.filter((phase) => phase.status === "COMPLETED").length;
    const startedDates = project.phases.flatMap((phase) => phase.startedAt ? [new Date(phase.startedAt).getTime()] : []);
    const planInputs = record(project.financialPlan?.inputs);
    const initialInvestment = Number(planInputs.initialInvestment);
    return {
      ...project,
      completedPhases,
      completionPercent: project.phases.length ? Math.round(completedPhases / project.phases.length * 100) : 0,
      startedAt: startedDates.length ? new Date(Math.min(...startedDates)).toISOString() : null,
      initialInvestment: Number.isFinite(initialInvestment) && initialInvestment >= 0 ? initialInvestment : null,
    };
  });
  return { projects, activeProjects: projects.filter((project) => !["ARCHIVED", "COMPLETED"].includes(project.status)).length, completedPhases: sum(projects.map((project) => project.completedPhases)), teamSeats: sum(projects.map((project) => project.members.length)), budgetedProjects: projects.filter((project) => project.initialInvestment !== null).length };
}

export function buildPurchaseAnalytics(workspace: SoftwareWorkspaceData, now = new Date()) {
  const orders = workspace.operations.purchaseOrders;
  const totals = new Map<string, { openMinor: number; receivedMinor: number }>();
  for (const order of orders) {
    const current = totals.get(order.currency) ?? { openMinor: 0, receivedMinor: 0 };
    if (order.status === "RECEIVED") current.receivedMinor += order.totalMinor;
    else if (order.status !== "CANCELLED") current.openMinor += order.totalMinor;
    totals.set(order.currency, current);
  }
  return {
    supplierCount: workspace.operations.suppliers.length,
    orderCount: orders.length,
    openCount: orders.filter((order) => ["DRAFT", "ORDERED"].includes(order.status)).length,
    receivedCount: orders.filter((order) => order.status === "RECEIVED").length,
    overdueCount: orders.filter((order) => order.status !== "RECEIVED" && order.expectedAt && new Date(order.expectedAt).getTime() < now.getTime()).length,
    totals: [...totals.entries()].map(([currency, value]) => ({ currency, ...value })),
    invoiceLedgerConnected: false,
  };
}

export function buildPosAnalytics(workspace: SoftwareWorkspaceData) {
  const shifts = workspace.operations.posShifts;
  const payments = shifts.flatMap((shift) => shift.sales.flatMap((sale) => sale.receipts));
  const paymentTotals = new Map<string, number>();
  payments.forEach((payment) => paymentTotals.set(payment.currency, (paymentTotals.get(payment.currency) ?? 0) + payment.amountMinor));
  const reconciliation = shifts.filter((shift) => shift.status === "CLOSED").map((shift) => {
    const receipts = shift.sales.flatMap((sale) => sale.receipts);
    const currencies = [...new Set(receipts.map((receipt) => receipt.currency))];
    const reliable = currencies.length <= 1;
    const salesMinor = sum(receipts.map((receipt) => receipt.amountMinor));
    const reliableCurrency = currencies.every((currency) => currency === shift.currency);
    return { id: shift.id, branch: shift.branch, reliable: reliable && reliableCurrency, currency: shift.currency, expectedMinor: reliable && reliableCurrency ? shift.openingCashMinor + salesMinor : null, actualMinor: shift.closingCashMinor, varianceMinor: reliable && reliableCurrency && shift.closingCashMinor !== null ? shift.closingCashMinor - (shift.openingCashMinor + salesMinor) : null, openedAt: shift.openedAt, closedAt: shift.closedAt };
  });
  return { shiftCount: shifts.length, openCount: shifts.filter((shift) => shift.status === "OPEN").length, saleCount: sum(shifts.map((shift) => shift.sales.length)), paymentCount: payments.length, paymentTotals: [...paymentTotals.entries()].map(([currency, amountMinor]) => ({ currency, amountMinor })), reconciliation, branchesConnected: workspace.company.softwareBranches.length > 0 };
}