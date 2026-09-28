import { describe, expect, it } from "vitest";

import type { SoftwareWorkspaceData } from "@/components/software/software-erp-types";
import { buildCrmAnalytics, buildInventoryAnalytics } from "@/lib/software/operational-analytics";

describe("Software operational analytics", () => {
  it("derives inventory value, reorder, recent movement, and count status", () => {
    const workspace = { sales: { products: [{ id: "p1", sku: "P1", name: "Item", currency: "SAR", costMinor: 500, stockQuantity: 2, reorderLevel: 5 }] }, operations: { movements: [{ productId: "p1", type: "ADJUSTMENT", quantity: 2, occurredAt: "2026-09-20T00:00:00.000Z" }] } } as unknown as SoftwareWorkspaceData;
    expect(buildInventoryAnalytics(workspace, new Date("2026-09-28T00:00:00.000Z"))).toMatchObject({ itemCount: 1, unitCount: 2, lowStockCount: 1, recentMovementCount: 1, recentNetQuantity: 2, values: [{ currency: "SAR", costMinor: 1_000, reorderMinor: 1_500 }], reorderItems: [{ shortage: 3, reorderCostMinor: 1_500 }], countRows: [{ status: "COUNTED" }] });
  });

  it("keeps CRM currencies separate and labels weighted planning values", () => {
    const workspace = { operations: { leads: [{ currency: "SAR", status: "NEW", valueMinor: 100_000, customerId: null, nextAction: "Call" }, { currency: "SAR", status: "WON", valueMinor: 50_000, customerId: "c1", nextAction: null }, { currency: "USD", status: "QUALIFIED", valueMinor: 20_000, customerId: null, nextAction: "Demo" }] } } as unknown as SoftwareWorkspaceData;
    expect(buildCrmAnalytics(workspace)).toMatchObject({ linkedCustomers: 1, pendingActions: 2, currencies: [{ currency: "SAR", leadCount: 2, openMinor: 100_000, securedMinor: 50_000, weightedMinor: 60_000 }, { currency: "USD", leadCount: 1, openMinor: 20_000, securedMinor: 0, weightedMinor: 7_000 }] });
  });
});