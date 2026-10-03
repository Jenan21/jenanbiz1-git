import { describe, expect, it } from "vitest";

import type { SoftwareWorkspaceData } from "@/components/software/software-erp-types";
import { accountingCurrencies, buildAccountingStatements } from "@/lib/software/accounting-statements";

describe("Software accounting statements", () => {
  it("derives currency-isolated operational statements without fabricating liabilities", () => {
    const workspace = {
      operations: { entries: [
        { id: "in", type: "INCOME", amountMinor: 25_000, currency: "SAR", description: "Receipt R1 for INV-1", occurredAt: "2026-09-01T00:00:00.000Z" },
        { id: "payroll", type: "EXPENSE", amountMinor: 10_000, currency: "SAR", description: "Payroll 2026-09-01 to 2026-09-30", occurredAt: "2026-09-30T00:00:00.000Z" },
        { id: "usd", type: "INCOME", amountMinor: 99_000, currency: "USD", description: "Receipt USD", occurredAt: "2026-09-15T00:00:00.000Z" },
      ] },
      sales: {
        products: [{ currency: "SAR", costMinor: 4_000, stockQuantity: 3 }],
        documents: [{ kind: "INVOICE", status: "ISSUED", currency: "SAR", totalMinor: 30_000, taxMinor: 3_000, receipts: [{ amountMinor: 25_000 }] }],
      },
    } as unknown as SoftwareWorkspaceData;

    expect(accountingCurrencies(workspace)).toEqual(["SAR", "USD"]);
    expect(buildAccountingStatements(workspace, "SAR")).toMatchObject({
      incomeStatement: { incomeMinor: 25_000, expenseMinor: 10_000, netMinor: 15_000 },
      balanceSnapshot: { receivablesMinor: 5_000, inventoryMinor: 12_000, observableAssetsMinor: 32_000, complete: false },
      cashFlow: { receiptIncomeMinor: 25_000, payrollMinor: 10_000, netMovementMinor: 15_000 },
      taxes: { collectedMinor: 3_000, filingStatus: "NOT_CONNECTED" },
    });
  });
});