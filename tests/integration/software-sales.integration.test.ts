import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { createOrganizationForUser } from "@/services/programs/organization-program-service";
import { createSalesDocument, listSalesWorkspace, recordSoftwareReceipt, saveSoftwareCustomer, saveSoftwareProduct, updateSalesDocumentStatus } from "@/services/software/sales-service";

const suffix = crypto.randomUUID().slice(0, 8);
let ownerId: string | undefined;
let outsiderId: string | undefined;
let organizationId: string | undefined;

afterAll(async () => {
  if (organizationId) await db.organization.delete({ where: { id: organizationId } });
  if (outsiderId) await db.user.delete({ where: { id: outsiderId } });
  if (ownerId) await db.user.delete({ where: { id: ownerId } });
  await db.$disconnect();
});

describe("Jenan Software sales cycle", () => {
  it("creates an invoice, records deterministic tax and income, fulfills stock, and isolates organizations", async () => {
    const owner = await db.user.create({ data: { email: `software-owner-${suffix}@example.test`, status: "ACTIVE" } });
    const outsider = await db.user.create({ data: { email: `software-outsider-${suffix}@example.test`, status: "ACTIVE" } });
    ownerId = owner.id;
    outsiderId = outsider.id;
    const organization = await createOrganizationForUser({ name: `Software org ${suffix}`, userId: owner.id });
    organizationId = organization.id;

    const customer = await saveSoftwareCustomer({ organizationId: organization.id, name: "Verified customer", email: "customer@example.test", userId: owner.id });
    const product = await saveSoftwareProduct({ organizationId: organization.id, sku: `SKU-${suffix}`, name: "Verified product", priceMinor: 10_000, costMinor: 6_000, initialStock: 10, reorderLevel: 2, userId: owner.id });
    const invoice = await createSalesDocument({ organizationId: organization.id, customerId: customer.id, kind: "INVOICE", lines: [{ productId: product.id, quantity: 2, taxRateBps: 1500 }], userId: owner.id });
    expect(invoice.subtotalMinor).toBe(20_000);
    expect(invoice.taxMinor).toBe(3_000);
    expect(invoice.totalMinor).toBe(23_000);
    await updateSalesDocumentStatus({ documentId: invoice.id, organizationId: organization.id, status: "ISSUED", userId: owner.id });
    await recordSoftwareReceipt({ amountMinor: 10_000, documentId: invoice.id, organizationId: organization.id, reference: "BANK-1", userId: owner.id });
    await expect(recordSoftwareReceipt({ amountMinor: 13_001, documentId: invoice.id, organizationId: organization.id, userId: owner.id })).rejects.toThrow("exceeds invoice balance");
    await recordSoftwareReceipt({ amountMinor: 13_000, documentId: invoice.id, organizationId: organization.id, reference: "BANK-2", userId: owner.id });
    expect((await db.salesDocument.findUnique({ where: { id: invoice.id } }))?.status).toBe("PAID");
    expect(await db.financialEntry.aggregate({ where: { organizationId: organization.id, type: "INCOME" }, _sum: { amountMinor: true } })).toMatchObject({ _sum: { amountMinor: 23_000 } });
    await expect(recordSoftwareReceipt({ amountMinor: 1, documentId: invoice.id, organizationId: organization.id, userId: owner.id })).rejects.toThrow("Only issued invoices");

    const order = await createSalesDocument({ organizationId: organization.id, customerId: customer.id, kind: "ORDER", lines: [{ productId: product.id, quantity: 3, taxRateBps: 0 }], userId: owner.id });
    await expect(updateSalesDocumentStatus({ documentId: order.id, organizationId: organization.id, status: "FULFILLED", userId: owner.id })).rejects.toThrow("Invalid sales document status transition");
    await updateSalesDocumentStatus({ documentId: order.id, organizationId: organization.id, status: "ACCEPTED", userId: owner.id });
    await updateSalesDocumentStatus({ documentId: order.id, organizationId: organization.id, status: "FULFILLED", userId: owner.id });
    expect((await db.softwareProduct.findUnique({ where: { id: product.id } }))?.stockQuantity).toBe(7);
    expect((await listSalesWorkspace(organization.id, owner.id)).documents).toHaveLength(2);
    await expect(listSalesWorkspace(organization.id, outsider.id)).rejects.toThrow("membership required");
  });
});