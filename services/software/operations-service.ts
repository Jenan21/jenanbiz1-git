import { CrmLeadStatus, PosShiftStatus, PurchaseOrderStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireSoftwareMembership } from "./software-access";

function cleanOptional(value?: string) {
  return value?.trim() || undefined;
}

export async function listSoftwareOperations(organizationId: string, userId: string) {
  await requireSoftwareMembership(organizationId, userId);
  const [leads, crmActivities, products, movements, suppliers, purchaseOrders, posShifts, projects, entries] = await Promise.all([
    db.crmLead.findMany({ where: { organizationId }, include: { customer: true }, orderBy: { updatedAt: "desc" }, take: 200 }),
    db.auditLog.findMany({ where: { organizationId, action: { startsWith: "software.crm." } }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, action: true, entityId: true, metadata: true, createdAt: true } }),
    db.softwareProduct.findMany({ where: { organizationId }, orderBy: { updatedAt: "desc" }, take: 200 }),
    db.inventoryMovement.findMany({ where: { organizationId }, include: { product: { select: { name: true, sku: true } } }, orderBy: { occurredAt: "desc" }, take: 200 }),
    db.softwareSupplier.findMany({ where: { organizationId }, orderBy: { updatedAt: "desc" }, take: 200 }),
    db.purchaseOrder.findMany({ where: { organizationId }, include: { supplier: true, lines: { include: { product: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.posShift.findMany({ where: { organizationId }, include: { branch: { select: { id: true, code: true, name: true } }, sales: { include: { receipts: true } } }, orderBy: { openedAt: "desc" }, take: 50 }),
    db.project.findMany({ where: { organizationId }, select: { id: true, name: true, status: true, currentPhase: true, currency: true, updatedAt: true, phases: { select: { id: true, title: true, type: true, status: true, sequence: true, startedAt: true, completedAt: true }, orderBy: { sequence: "asc" } }, members: { select: { id: true, role: true, user: { select: { profile: { select: { displayName: true } } } } }, orderBy: { createdAt: "asc" } }, financialPlans: { select: { version: true, inputs: true, baseCase: true, createdAt: true }, orderBy: { version: "desc" }, take: 1 } }, orderBy: { updatedAt: "desc" }, take: 100 }),
    db.financialEntry.findMany({ where: { organizationId }, orderBy: { occurredAt: "desc" }, take: 200 }),
  ]);
  return { leads, crmActivities, products, movements, suppliers, purchaseOrders, posShifts, projects: projects.map(({ financialPlans, ...project }) => ({ ...project, financialPlan: financialPlans[0] ?? null })), entries };
}

export async function createCrmLead(input: { contact?: string; currency?: string; customerId?: string; name: string; nextAction?: string; organizationId: string; source?: string; userId: string; valueMinor?: number }) {
  await requireSoftwareMembership(input.organizationId, input.userId);
  if (input.customerId) {
    const customer = await db.softwareCustomer.findFirst({ where: { id: input.customerId, organizationId: input.organizationId }, select: { id: true } });
    if (!customer) throw new Error("Customer not found");
  }
  return db.$transaction(async (transaction) => {
    const lead = await transaction.crmLead.create({ data: { organizationId: input.organizationId, customerId: input.customerId, name: input.name.trim(), contact: cleanOptional(input.contact), source: cleanOptional(input.source), valueMinor: input.valueMinor, currency: input.currency?.trim().toUpperCase() || "SAR", nextAction: cleanOptional(input.nextAction), createdById: input.userId } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.crm.lead.created", entityType: "CrmLead", entityId: lead.id } });
    return lead;
  });
}

export async function updateCrmLeadStatus(input: { leadId: string; organizationId: string; status: CrmLeadStatus; userId: string }) {
  await requireSoftwareMembership(input.organizationId, input.userId);
  const lead = await db.crmLead.findFirst({ where: { id: input.leadId, organizationId: input.organizationId }, select: { id: true } });
  if (!lead) throw new Error("CRM lead not found");
  return db.$transaction(async (transaction) => {
    const updated = await transaction.crmLead.update({ where: { id: lead.id }, data: { status: input.status } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.crm.lead.status.updated", entityType: "CrmLead", entityId: lead.id, metadata: { status: input.status } } });
    return updated;
  });
}

export async function adjustInventory(input: { note: string; organizationId: string; productId: string; quantity: number; userId: string }) {
  await requireSoftwareMembership(input.organizationId, input.userId);
  return db.$transaction(async (transaction) => {
    const product = await transaction.softwareProduct.findFirst({ where: { id: input.productId, organizationId: input.organizationId }, select: { id: true, stockQuantity: true } });
    if (!product) throw new Error("Product not found");
    if (product.stockQuantity + input.quantity < 0) throw new Error("Inventory adjustment would make stock negative");
    const updated = await transaction.softwareProduct.update({ where: { id: product.id }, data: { stockQuantity: { increment: input.quantity } } });
    const movement = await transaction.inventoryMovement.create({ data: { organizationId: input.organizationId, productId: product.id, type: "ADJUSTMENT", quantity: input.quantity, note: input.note.trim(), createdById: input.userId } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.inventory.adjusted", entityType: "InventoryMovement", entityId: movement.id, metadata: { productId: product.id, quantity: input.quantity } } });
    return { movement, product: updated };
  });
}

export async function createSoftwareSupplier(input: { email?: string; name: string; organizationId: string; phone?: string; userId: string }) {
  await requireSoftwareMembership(input.organizationId, input.userId);
  return db.$transaction(async (transaction) => {
    const supplier = await transaction.softwareSupplier.create({ data: { organizationId: input.organizationId, name: input.name.trim(), email: cleanOptional(input.email), phone: cleanOptional(input.phone), createdById: input.userId } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.supplier.created", entityType: "SoftwareSupplier", entityId: supplier.id } });
    return supplier;
  });
}

export async function createPurchaseOrder(input: { currency?: string; expectedAt?: Date; lines: { description?: string; productId?: string; quantity: number; unitCostMinor: number }[]; organizationId: string; supplierId?: string; userId: string }) {
  await requireSoftwareMembership(input.organizationId, input.userId);
  if (!input.lines.length || input.lines.length > 50) throw new Error("Purchase order requires between 1 and 50 lines");
  const [supplier, products] = await Promise.all([
    input.supplierId ? db.softwareSupplier.findFirst({ where: { id: input.supplierId, organizationId: input.organizationId }, select: { id: true } }) : null,
    db.softwareProduct.findMany({ where: { organizationId: input.organizationId, id: { in: input.lines.flatMap((line) => line.productId ? [line.productId] : []) } }, select: { id: true, name: true } }),
  ]);
  if (input.supplierId && !supplier) throw new Error("Supplier not found");
  const productMap = new Map(products.map((product) => [product.id, product]));
  const lines = input.lines.map((line) => {
    const product = line.productId ? productMap.get(line.productId) : undefined;
    if (line.productId && !product) throw new Error("Product not found");
    return { productId: product?.id, description: cleanOptional(line.description) ?? product?.name ?? "Purchase item", quantity: line.quantity, unitCostMinor: line.unitCostMinor, lineTotalMinor: line.quantity * line.unitCostMinor };
  });
  const totalMinor = lines.reduce((total, line) => total + line.lineTotalMinor, 0);
  return db.$transaction(async (transaction) => {
    const order = await transaction.purchaseOrder.create({ data: { organizationId: input.organizationId, supplierId: input.supplierId, number: `PO-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, currency: input.currency?.trim().toUpperCase() || "SAR", totalMinor, expectedAt: input.expectedAt, createdById: input.userId, lines: { create: lines } }, include: { supplier: true, lines: true } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.purchase.created", entityType: "PurchaseOrder", entityId: order.id, metadata: { totalMinor } } });
    return order;
  });
}

export async function updatePurchaseOrderStatus(input: { orderId: string; organizationId: string; status: PurchaseOrderStatus; userId: string }) {
  await requireSoftwareMembership(input.organizationId, input.userId);
  return db.$transaction(async (transaction) => {
    const order = await transaction.purchaseOrder.findFirst({ where: { id: input.orderId, organizationId: input.organizationId }, include: { lines: true } });
    if (!order) throw new Error("Purchase order not found");
    if (order.status === PurchaseOrderStatus.RECEIVED) throw new Error("A received purchase order cannot be changed");
    if (input.status === PurchaseOrderStatus.RECEIVED) {
      if (order.status !== PurchaseOrderStatus.ORDERED) throw new Error("Only ordered purchases can be received");
      for (const line of order.lines) {
        if (!line.productId) continue;
        await transaction.softwareProduct.update({ where: { id: line.productId }, data: { stockQuantity: { increment: line.quantity }, costMinor: line.unitCostMinor } });
        await transaction.inventoryMovement.create({ data: { organizationId: input.organizationId, productId: line.productId, type: "RECEIPT", quantity: line.quantity, referenceType: "PurchaseOrder", referenceId: order.id, createdById: input.userId } });
      }
      await transaction.financialEntry.create({ data: { organizationId: input.organizationId, type: "EXPENSE", amountMinor: order.totalMinor, currency: order.currency, description: `Received purchase ${order.number}`, occurredAt: new Date(), createdById: input.userId } });
    }
    const updated = await transaction.purchaseOrder.update({ where: { id: order.id }, data: { status: input.status, receivedAt: input.status === PurchaseOrderStatus.RECEIVED ? new Date() : undefined }, include: { supplier: true, lines: true } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.purchase.status.updated", entityType: "PurchaseOrder", entityId: order.id, metadata: { status: input.status } } });
    return updated;
  });
}

export async function openPosShift(input: { branchId?: string; currency?: string; openingCashMinor: number; organizationId: string; userId: string }) {
  await requireSoftwareMembership(input.organizationId, input.userId);
  const settings = await db.softwareSettings.findUnique({ where: { organizationId: input.organizationId }, select: { defaultBranchId: true, defaultCurrency: true } });
  const branchId = input.branchId ?? settings?.defaultBranchId ?? undefined;
  const currency = input.currency?.trim().toUpperCase() ?? settings?.defaultCurrency ?? "SAR";
  if (branchId) {
    const branch = await db.softwareBranch.findFirst({ where: { id: branchId, organizationId: input.organizationId, status: "ACTIVE" }, select: { id: true } });
    if (!branch) throw new Error("Active POS branch not found");
  }
  const openShift = await db.posShift.findFirst({ where: { organizationId: input.organizationId, status: PosShiftStatus.OPEN }, select: { id: true } });
  if (openShift) throw new Error("An open POS shift already exists");
  return db.posShift.create({ data: { organizationId: input.organizationId, branchId, currency, openingCashMinor: input.openingCashMinor, openedById: input.userId } });
}

export async function recordPosSale(input: { customerId?: string; organizationId: string; productId: string; quantity: number; shiftId: string; taxRateBps?: number; userId: string }) {
  await requireSoftwareMembership(input.organizationId, input.userId);
  return db.$transaction(async (transaction) => {
    const [shift, product, customer] = await Promise.all([
      transaction.posShift.findFirst({ where: { id: input.shiftId, organizationId: input.organizationId, status: PosShiftStatus.OPEN } }),
      transaction.softwareProduct.findFirst({ where: { id: input.productId, organizationId: input.organizationId, isActive: true } }),
      input.customerId ? transaction.softwareCustomer.findFirst({ where: { id: input.customerId, organizationId: input.organizationId }, select: { id: true } }) : null,
    ]);
    if (!shift) throw new Error("Open POS shift not found");
    if (!product) throw new Error("Product not found");
    if (product.currency !== shift.currency) throw new Error("Product and POS shift currencies must match");
    if (input.customerId && !customer) throw new Error("Customer not found");
    if (product.stockQuantity < input.quantity) throw new Error("Insufficient inventory for POS sale");
    const subtotalMinor = input.quantity * product.priceMinor;
    const taxMinor = Math.round(subtotalMinor * (input.taxRateBps ?? 1500) / 10_000);
    const totalMinor = subtotalMinor + taxMinor;
    const document = await transaction.salesDocument.create({ data: { organizationId: input.organizationId, customerId: input.customerId, posShiftId: shift.id, kind: "INVOICE", status: "PAID", number: `POS-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, currency: product.currency, subtotalMinor, taxMinor, totalMinor, createdById: input.userId, lines: { create: { productId: product.id, description: product.name, quantity: input.quantity, unitPriceMinor: product.priceMinor, taxRateBps: input.taxRateBps ?? 1500, lineTotalMinor: totalMinor } }, receipts: { create: { organizationId: input.organizationId, amountMinor: totalMinor, currency: product.currency, reference: `POS shift ${shift.id}`, createdById: input.userId } } }, include: { lines: true, receipts: true } });
    await transaction.softwareProduct.update({ where: { id: product.id }, data: { stockQuantity: { decrement: input.quantity } } });
    await transaction.inventoryMovement.create({ data: { organizationId: input.organizationId, productId: product.id, type: "SALE", quantity: -input.quantity, referenceType: "SalesDocument", referenceId: document.id, createdById: input.userId } });
    await transaction.financialEntry.create({ data: { organizationId: input.organizationId, type: "INCOME", amountMinor: totalMinor, currency: product.currency, description: `POS sale ${document.number}`, occurredAt: new Date(), createdById: input.userId } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.pos.sale.completed", entityType: "SalesDocument", entityId: document.id, metadata: { shiftId: shift.id, totalMinor } } });
    return document;
  });
}

export async function closePosShift(input: { closingCashMinor: number; organizationId: string; shiftId: string; userId: string }) {
  await requireSoftwareMembership(input.organizationId, input.userId);
  return db.$transaction(async (transaction) => {
    const shift = await transaction.posShift.findFirst({ where: { id: input.shiftId, organizationId: input.organizationId, status: PosShiftStatus.OPEN }, include: { sales: { include: { receipts: true } } } });
    if (!shift) throw new Error("Open POS shift not found");
    const salesMinor = shift.sales.flatMap((sale) => sale.receipts).reduce((total, receipt) => total + receipt.amountMinor, 0);
    const expectedCashMinor = shift.openingCashMinor + salesMinor;
    const updated = await transaction.posShift.update({ where: { id: shift.id }, data: { status: PosShiftStatus.CLOSED, closingCashMinor: input.closingCashMinor, closedAt: new Date() } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.pos.shift.closed", entityType: "PosShift", entityId: shift.id, metadata: { expectedCashMinor, closingCashMinor: input.closingCashMinor, varianceMinor: input.closingCashMinor - expectedCashMinor } } });
    return { ...updated, expectedCashMinor, varianceMinor: input.closingCashMinor - expectedCashMinor };
  });
}

export function summarizeSoftwareOperations(data: Awaited<ReturnType<typeof listSoftwareOperations>>) {
  const incomeMinor = data.entries.filter((entry) => entry.type === "INCOME").reduce((total, entry) => total + entry.amountMinor, 0);
  const expenseMinor = data.entries.filter((entry) => entry.type === "EXPENSE").reduce((total, entry) => total + entry.amountMinor, 0);
  return {
    activeLeads: data.leads.filter((lead) => lead.status !== CrmLeadStatus.WON && lead.status !== CrmLeadStatus.LOST).length,
    incomeMinor,
    expenseMinor,
    lowStock: data.products.filter((product) => product.stockQuantity <= product.reorderLevel).length,
    openPurchases: data.purchaseOrders.filter((order) => order.status === PurchaseOrderStatus.DRAFT || order.status === PurchaseOrderStatus.ORDERED).length,
    openShift: data.posShifts.find((shift) => shift.status === PosShiftStatus.OPEN) ?? null,
    profitMinor: incomeMinor - expenseMinor,
  };
}