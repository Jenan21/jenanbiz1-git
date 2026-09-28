import type { SoftwareWorkspaceData } from "@/components/software/software-erp-types";

type Entry = SoftwareWorkspaceData["operations"]["entries"][number];

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function accountingCurrencies(workspace: SoftwareWorkspaceData) {
  const currencies = new Set<string>();
  workspace.operations.entries.forEach((entry) => currencies.add(entry.currency));
  workspace.sales.products.forEach((product) => currencies.add(product.currency));
  workspace.sales.documents.forEach((document) => currencies.add(document.currency));
  return [...currencies].sort();
}

export function buildAccountingStatements(workspace: SoftwareWorkspaceData, currency: string) {
  const entries = workspace.operations.entries.filter((entry) => entry.currency === currency);
  const income = entries.filter((entry) => entry.type === "INCOME");
  const expenses = entries.filter((entry) => entry.type === "EXPENSE");
  const documents = workspace.sales.documents.filter((document) => document.currency === currency && document.status !== "VOID");
  const invoices = documents.filter((document) => document.kind === "INVOICE");
  const returns = documents.filter((document) => document.kind === "RETURN" && document.status === "FULFILLED");
  const incomeMinor = sum(income.map((entry) => entry.amountMinor));
  const expenseMinor = sum(expenses.map((entry) => entry.amountMinor));
  const netMinor = incomeMinor - expenseMinor;
  const receivablesMinor = sum(invoices.map((invoice) => Math.max(0, invoice.totalMinor - sum(invoice.receipts.map((receipt) => receipt.amountMinor)))));
  const inventoryMinor = sum(workspace.sales.products.filter((product) => product.currency === currency).map((product) => product.costMinor * product.stockQuantity));
  const taxCollectedMinor = sum(invoices.map((invoice) => invoice.taxMinor)) - sum(returns.map((item) => item.taxMinor));

  const payrollMinor = sum(expenses.filter((entry) => entry.description.startsWith("Payroll ")).map((entry) => entry.amountMinor));
  const purchasingMinor = sum(expenses.filter((entry) => entry.description.startsWith("Received purchase ")).map((entry) => entry.amountMinor));
  const otherExpenseMinor = expenseMinor - payrollMinor - purchasingMinor;
  const posIncomeMinor = sum(income.filter((entry) => entry.description.startsWith("POS sale ")).map((entry) => entry.amountMinor));
  const receiptIncomeMinor = sum(income.filter((entry) => entry.description.startsWith("Receipt ")).map((entry) => entry.amountMinor));
  const otherIncomeMinor = incomeMinor - posIncomeMinor - receiptIncomeMinor;
  const entryDates = entries.map((entry) => new Date(entry.occurredAt).getTime()).filter(Number.isFinite);

  return {
    currency,
    scope: {
      entryCount: entries.length,
      from: entryDates.length ? new Date(Math.min(...entryDates)).toISOString() : null,
      to: entryDates.length ? new Date(Math.max(...entryDates)).toISOString() : null,
    },
    incomeStatement: { incomeMinor, expenseMinor, netMinor, basis: "CASH" as const },
    balanceSnapshot: {
      cashMovementMinor: netMinor,
      receivablesMinor,
      inventoryMinor,
      observableAssetsMinor: Math.max(0, netMinor) + receivablesMinor + inventoryMinor,
      uncoveredCashDeficitMinor: Math.max(0, -netMinor),
      complete: false,
    },
    cashFlow: { receiptIncomeMinor, posIncomeMinor, otherIncomeMinor, payrollMinor, purchasingMinor, otherExpenseMinor, netMovementMinor: netMinor },
    taxes: { collectedMinor: taxCollectedMinor, filingStatus: "NOT_CONNECTED" as const },
    accounts: [
      { code: "1100", name: "Cash movement", source: "Posted financial entries", status: "PARTIAL" },
      { code: "1200", name: "Trade receivables", source: "Invoices less receipts", status: "READY" },
      { code: "1300", name: "Inventory at cost", source: "Quantity × product cost", status: "READY" },
      { code: "2100", name: "Trade payables", source: "Payables ledger not connected", status: "UNAVAILABLE" },
      { code: "2200", name: "Collected tax", source: "Invoice tax less fulfilled returns", status: "ESTIMATED" },
      { code: "4100", name: "Posted income", source: "Receipts and POS entries", status: "READY" },
      { code: "5100", name: "Posted expenses", source: "Purchasing, payroll and manual entries", status: "READY" },
    ],
  };
}

export type AccountingStatements = ReturnType<typeof buildAccountingStatements>;
export type AccountingEntry = Entry;