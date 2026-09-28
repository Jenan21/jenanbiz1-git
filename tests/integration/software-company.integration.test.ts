import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { createOrganizationForUser } from "@/services/programs/organization-program-service";
import { createSoftwareBranch, saveSoftwareSettings, updateSoftwareBranchStatus } from "@/services/software/company-service";
import { openPosShift } from "@/services/software/operations-service";
import { createSalesDocument, saveSoftwareProduct } from "@/services/software/sales-service";

const suffix = crypto.randomUUID().slice(0, 8);
let ownerId: string | undefined;
let memberId: string | undefined;
let organizationId: string | undefined;

afterAll(async () => {
  if (organizationId) await db.organization.delete({ where: { id: organizationId } });
  if (memberId) await db.user.delete({ where: { id: memberId } });
  if (ownerId) await db.user.delete({ where: { id: ownerId } });
  await db.$disconnect();
});

describe("Software company branches and settings", () => {
  it("restricts management to owners and assigns the default branch to POS shifts", async () => {
    const owner = await db.user.create({ data: { email: `software-owner-${suffix}@example.test`, status: "ACTIVE" } });
    const member = await db.user.create({ data: { email: `software-member-${suffix}@example.test`, status: "ACTIVE" } });
    ownerId = owner.id;
    memberId = member.id;
    const organization = await createOrganizationForUser({ name: `Branch org ${suffix}`, userId: owner.id });
    organizationId = organization.id;
    await db.organizationMember.create({ data: { organizationId: organization.id, userId: member.id, status: "ACTIVE", isOwner: false } });

    await expect(createSoftwareBranch({ organizationId: organization.id, userId: member.id, code: "NOPE", name: "Denied" })).rejects.toThrow("owner access required");
    const branch = await createSoftwareBranch({ organizationId: organization.id, userId: owner.id, code: "ruh", name: "Riyadh HQ", countryCode: "sa", city: "Riyadh" });
    const settings = await saveSoftwareSettings({ organizationId: organization.id, userId: owner.id, defaultBranchId: branch.id, defaultCurrency: "usd", taxRateBps: 750, fiscalYearStartMonth: 1, invoicePrefix: "sale", allowNegativeInventory: true, timezone: "Asia/Riyadh" });
    expect(settings).toMatchObject({ defaultBranchId: branch.id, defaultCurrency: "USD", invoicePrefix: "SALE", taxRateBps: 750, allowNegativeInventory: true });

    const product = await saveSoftwareProduct({ organizationId: organization.id, userId: owner.id, sku: `USD-${suffix}`, name: "USD item", priceMinor: 10_000, costMinor: 4_000 });
    expect(product.currency).toBe("USD");
    const invoice = await createSalesDocument({ organizationId: organization.id, userId: owner.id, kind: "INVOICE", lines: [{ productId: product.id, quantity: 1 }] });
    expect(invoice).toMatchObject({ currency: "USD", subtotalMinor: 10_000, taxMinor: 750, totalMinor: 10_750 });
    expect(invoice.number).toMatch(/^SALE-/);

    const shift = await openPosShift({ organizationId: organization.id, userId: owner.id, openingCashMinor: 1_000 });
    expect(shift).toMatchObject({ branchId: branch.id, currency: "USD" });

    await updateSoftwareBranchStatus({ organizationId: organization.id, userId: owner.id, branchId: branch.id, status: "INACTIVE" });
    expect((await db.softwareSettings.findUnique({ where: { organizationId: organization.id } }))?.defaultBranchId).toBeNull();
    expect(await db.auditLog.count({ where: { organizationId: organization.id, action: { startsWith: "software.branch." } } })).toBe(2);
  });
});