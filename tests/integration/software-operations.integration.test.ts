import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { createOrganizationForUser } from "@/services/programs/organization-program-service";
import { adjustInventory, closePosShift, createCrmLead, createPurchaseOrder, createSoftwareSupplier, listSoftwareOperations, openPosShift, recordPosSale, summarizeSoftwareOperations, updateCrmLeadStatus, updatePurchaseOrderStatus } from "@/services/software/operations-service";
import { saveSoftwareProduct } from "@/services/software/sales-service";

const suffix = crypto.randomUUID().slice(0, 8);
let userId: string | undefined;
let organizationId: string | undefined;

afterAll(async () => {
  if (organizationId) await db.organization.delete({ where: { id: organizationId } });
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

describe("Jenan Software operational cycle", () => {
  it("tracks CRM, purchasing, inventory, POS, and financial totals", async () => {
    const user = await db.user.create({ data: { email: `software-ops-${suffix}@example.test`, status: "ACTIVE" } });
    userId = user.id;
    const organization = await createOrganizationForUser({ name: `Operations org ${suffix}`, userId: user.id });
    organizationId = organization.id;
    const product = await saveSoftwareProduct({ organizationId: organization.id, sku: `OPS-${suffix}`, name: "Operational item", priceMinor: 10_000, costMinor: 5_000, initialStock: 2, reorderLevel: 2, userId: user.id });
    await adjustInventory({ organizationId: organization.id, productId: product.id, quantity: 1, note: "Verified count", userId: user.id });

    const lead = await createCrmLead({ organizationId: organization.id, name: "Qualified account", source: "Referral", valueMinor: 50_000, userId: user.id });
    expect((await updateCrmLeadStatus({ organizationId: organization.id, leadId: lead.id, status: "QUALIFIED", userId: user.id })).status).toBe("QUALIFIED");

    const supplier = await createSoftwareSupplier({ organizationId: organization.id, name: "Verified supplier", userId: user.id });
    const purchase = await createPurchaseOrder({ organizationId: organization.id, supplierId: supplier.id, lines: [{ productId: product.id, quantity: 5, unitCostMinor: 4_500 }], userId: user.id });
    await updatePurchaseOrderStatus({ organizationId: organization.id, orderId: purchase.id, status: "ORDERED", userId: user.id });
    await updatePurchaseOrderStatus({ organizationId: organization.id, orderId: purchase.id, status: "RECEIVED", userId: user.id });
    expect((await db.softwareProduct.findUnique({ where: { id: product.id } }))?.stockQuantity).toBe(8);

    const shift = await openPosShift({ organizationId: organization.id, openingCashMinor: 1_000, userId: user.id });
    const sale = await recordPosSale({ organizationId: organization.id, productId: product.id, quantity: 2, shiftId: shift.id, taxRateBps: 1500, userId: user.id });
    expect(sale.totalMinor).toBe(23_000);
    const closed = await closePosShift({ organizationId: organization.id, shiftId: shift.id, closingCashMinor: 24_000, userId: user.id });
    expect(closed.expectedCashMinor).toBe(24_000);
    expect(closed.varianceMinor).toBe(0);
    expect((await db.softwareProduct.findUnique({ where: { id: product.id } }))?.stockQuantity).toBe(6);

    const operations = await listSoftwareOperations(organization.id, user.id);
    expect(operations.crmActivities.map((activity) => activity.action)).toEqual(expect.arrayContaining(["software.crm.lead.created", "software.crm.lead.status.updated"]));
    expect(summarizeSoftwareOperations(operations)).toMatchObject({ activeLeads: 1, expenseMinor: 22_500, incomeMinor: 23_000, profitMinor: 500 });
  });
});