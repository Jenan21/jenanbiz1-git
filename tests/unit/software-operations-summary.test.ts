import { describe, expect, it } from "vitest";

import type { SoftwareWorkspaceData } from "@/components/software/software-erp-types";
import { buildPosAnalytics, buildProjectOperations, buildPurchaseAnalytics } from "@/lib/software/operational-analytics";

describe("Software project, purchase, and POS summaries", () => {
  it("uses project phases, members, and the latest financial plan without inventing tasks", () => {
    const workspace = { operations: { projects: [{ id: "p", name: "Launch", status: "ACTIVE", currentPhase: "PLANNING", currency: "SAR", updatedAt: "2026-09-28T00:00:00.000Z", phases: [{ id: "1", title: "Analysis", type: "ANALYSIS", status: "COMPLETED", sequence: 1, startedAt: "2026-09-01T00:00:00.000Z", completedAt: "2026-09-05T00:00:00.000Z" }, { id: "2", title: "Planning", type: "PLANNING", status: "IN_PROGRESS", sequence: 2, startedAt: "2026-09-06T00:00:00.000Z", completedAt: null }], members: [{ id: "m", role: "OWNER", user: { profile: { displayName: "Owner" } } }], financialPlan: { version: 2, inputs: { initialInvestment: 100_000 }, baseCase: {}, createdAt: "2026-09-02T00:00:00.000Z" } }] } } as unknown as SoftwareWorkspaceData;
    expect(buildProjectOperations(workspace)).toMatchObject({ activeProjects: 1, completedPhases: 1, teamSeats: 1, budgetedProjects: 1, projects: [{ completionPercent: 50, initialInvestment: 100_000 }] });
  });

  it("separates purchase currencies and reports unavailable invoice modeling", () => {
    const workspace = { operations: { suppliers: [{ id: "s" }], purchaseOrders: [{ currency: "SAR", status: "ORDERED", totalMinor: 20_000, expectedAt: "2026-09-20T00:00:00.000Z" }, { currency: "USD", status: "RECEIVED", totalMinor: 5_000, expectedAt: null }] } } as unknown as SoftwareWorkspaceData;
    expect(buildPurchaseAnalytics(workspace, new Date("2026-09-28T00:00:00.000Z"))).toMatchObject({ supplierCount: 1, orderCount: 2, openCount: 1, receivedCount: 1, overdueCount: 1, invoiceLedgerConnected: false, totals: [{ currency: "SAR", openMinor: 20_000 }, { currency: "USD", receivedMinor: 5_000 }] });
  });

  it("derives POS payment and reconciliation records without mixing receipt currencies", () => {
    const workspace = { operations: { posShifts: [{ id: "shift", status: "CLOSED", currency: "SAR", openingCashMinor: 1_000, closingCashMinor: 3_000, openedAt: "2026-09-01T00:00:00.000Z", closedAt: "2026-09-01T08:00:00.000Z", sales: [{ id: "sale", totalMinor: 2_000, receipts: [{ amountMinor: 2_000, currency: "SAR" }] }] }] }, company: { softwareBranches: [], softwareSettings: null } } as unknown as SoftwareWorkspaceData;
    expect(buildPosAnalytics(workspace)).toMatchObject({ shiftCount: 1, openCount: 0, saleCount: 1, paymentCount: 1, paymentTotals: [{ currency: "SAR", amountMinor: 2_000 }], reconciliation: [{ reliable: true, expectedMinor: 3_000, varianceMinor: 0 }], branchesConnected: false });
  });
});