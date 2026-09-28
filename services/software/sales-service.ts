import { Prisma, SalesDocumentKind, SalesDocumentStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireSoftwareMembership } from "./software-access";

const salesDocumentInclude = {
  customer: true,
  lines: { include: { product: { select: { id: true, name: true, sku: true } } } },
  receipts: { orderBy: { receivedAt: "desc" as const } },
} satisfies Prisma.SalesDocumentInclude;

function documentNumber(kind: SalesDocumentKind, invoicePrefix?: string) {
  const prefix = kind === SalesDocumentKind.INVOICE && invoicePrefix ? invoicePrefix : { QUOTE: "QUO", ORDER: "ORD", INVOICE: "INV", RETURN: "RET" }[kind];
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function cleanOptional(value?: string) {
  return value?.trim() || undefined;
}

export async function listSalesWorkspace(organizationId: string, userId: string) {
  await requireSoftwareMembership(organizationId, userId);
  const [customers, products, documents, receipts] = await Promise.all([
    db.softwareCustomer.findMany({ where: { organizationId }, orderBy: { updatedAt: "desc" }, take: 200 }),
    db.softwareProduct.findMany({ where: { organizationId }, orderBy: { updatedAt: "desc" }, take: 200 }),
    db.salesDocument.findMany({ where: { organizationId }, include: salesDocumentInclude, orderBy: { issuedAt: "desc" }, take: 200 }),
    db.softwareReceipt.findMany({ where: { organizationId }, include: { document: { select: { number: true, totalMinor: true }, }, }, orderBy: { receivedAt: "desc" }, take: 200 }),
  ]);
  return { customers, products, documents, receipts };
}

export async function saveSoftwareCustomer(input: {
  customerId?: string;
  email?: string;
  name: string;
  organizationId: string;
  phone?: string;
  taxNumber?: string;
  userId: string;
}) {
  await requireSoftwareMembership(input.organizationId, input.userId);
  const data = { email: cleanOptional(input.email), name: input.name.trim(), phone: cleanOptional(input.phone), taxNumber: cleanOptional(input.taxNumber) };
  if (input.customerId) {
    const current = await db.softwareCustomer.findFirst({ where: { id: input.customerId, organizationId: input.organizationId }, select: { id: true } });
    if (!current) throw new Error("Customer not found");
    return db.softwareCustomer.update({ where: { id: current.id }, data });
  }
  return db.$transaction(async (transaction) => {
    const customer = await transaction.softwareCustomer.create({ data: { ...data, organizationId: input.organizationId, createdById: input.userId } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.customer.created", entityType: "SoftwareCustomer", entityId: customer.id } });
    return customer;
  });
}

export async function saveSoftwareProduct(input: {
  costMinor: number;
  currency?: string;
  description?: string;
  initialStock?: number;
  name: string;
  organizationId: string;
  priceMinor: number;
  productId?: string;
  reorderLevel?: number;
  sku: string;
  userId: string;
}) {
  await requireSoftwareMembership(input.organizationId, input.userId);
  const settings = await db.softwareSettings.findUnique({ where: { organizationId: input.organizationId }, select: { defaultCurrency: true } });
  const data = {
    costMinor: input.costMinor,
    currency: input.currency?.trim().toUpperCase() || settings?.defaultCurrency || "SAR",
    description: cleanOptional(input.description),
    name: input.name.trim(),
    priceMinor: input.priceMinor,
    reorderLevel: input.reorderLevel ?? 0,
    sku: input.sku.trim().toUpperCase(),
  };
  if (input.productId) {
    const current = await db.softwareProduct.findFirst({ where: { id: input.productId, organizationId: input.organizationId }, select: { id: true } });
    if (!current) throw new Error("Product not found");
    return db.softwareProduct.update({ where: { id: current.id }, data });
  }
  return db.$transaction(async (transaction) => {
    const product = await transaction.softwareProduct.create({ data: { ...data, organizationId: input.organizationId, stockQuantity: input.initialStock ?? 0, createdById: input.userId } });
    if (product.stockQuantity) {
      await transaction.inventoryMovement.create({ data: { organizationId: input.organizationId, productId: product.id, type: "ADJUSTMENT", quantity: product.stockQuantity, note: "Initial stock", createdById: input.userId } });
    }
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.product.created", entityType: "SoftwareProduct", entityId: product.id, metadata: { sku: product.sku, initialStock: product.stockQuantity } } });
    return product;
  });
}

export async function createSalesDocument(input: {
  customerId?: string;
  currency?: string;
  dueAt?: Date;
  kind: SalesDocumentKind;
  lines: { description?: string; productId?: string; quantity: number; taxRateBps?: number; unitPriceMinor?: number }[];
  notes?: string;
  organizationId: string;
  userId: string;
}) {
  await requireSoftwareMembership(input.organizationId, input.userId);
  if (!input.lines.length || input.lines.length > 50) throw new Error("Sales document requires between 1 and 50 lines");
  const [customer, products, settings] = await Promise.all([
    input.customerId ? db.softwareCustomer.findFirst({ where: { id: input.customerId, organizationId: input.organizationId }, select: { id: true } }) : null,
    db.softwareProduct.findMany({ where: { organizationId: input.organizationId, id: { in: input.lines.flatMap((line) => line.productId ? [line.productId] : []) } } }),
    db.softwareSettings.findUnique({ where: { organizationId: input.organizationId }, select: { defaultCurrency: true, invoicePrefix: true, taxRateBps: true } }),
  ]);
  if (input.customerId && !customer) throw new Error("Customer not found");
  const documentCurrency = input.currency?.trim().toUpperCase() || settings?.defaultCurrency || "SAR";
  const productMap = new Map(products.map((product) => [product.id, product]));
  const lines = input.lines.map((line) => {
    const product = line.productId ? productMap.get(line.productId) : undefined;
    if (line.productId && !product) throw new Error("Product not found");
    if (product && product.currency !== documentCurrency) throw new Error("Product and sales document currencies must match");
    const unitPriceMinor = line.unitPriceMinor ?? product?.priceMinor;
    if (unitPriceMinor === undefined || unitPriceMinor < 0) throw new Error("Line price is invalid");
    const taxRateBps = line.taxRateBps ?? settings?.taxRateBps ?? 1500;
    const subtotalMinor = line.quantity * unitPriceMinor;
    const taxMinor = Math.round(subtotalMinor * taxRateBps / 10_000);
    return { description: cleanOptional(line.description) ?? product?.name ?? "Sales item", productId: product?.id, quantity: line.quantity, unitPriceMinor, taxRateBps, lineTotalMinor: subtotalMinor + taxMinor, subtotalMinor, taxMinor };
  });
  const subtotalMinor = lines.reduce((total, line) => total + line.subtotalMinor, 0);
  const taxMinor = lines.reduce((total, line) => total + line.taxMinor, 0);
  return db.$transaction(async (transaction) => {
    const document = await transaction.salesDocument.create({
      data: {
        organizationId: input.organizationId,
        customerId: input.customerId,
        kind: input.kind,
        number: documentNumber(input.kind, settings?.invoicePrefix),
        currency: documentCurrency,
        subtotalMinor,
        taxMinor,
        totalMinor: subtotalMinor + taxMinor,
        dueAt: input.dueAt,
        notes: cleanOptional(input.notes),
        createdById: input.userId,
        lines: { create: lines.map((line) => ({ description: line.description, productId: line.productId, quantity: line.quantity, unitPriceMinor: line.unitPriceMinor, taxRateBps: line.taxRateBps, lineTotalMinor: line.lineTotalMinor })) },
      },
      include: salesDocumentInclude,
    });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.sales.document.created", entityType: "SalesDocument", entityId: document.id, metadata: { kind: document.kind, number: document.number, totalMinor: document.totalMinor } } });
    return document;
  });
}

export async function updateSalesDocumentStatus(input: { documentId: string; organizationId: string; status: SalesDocumentStatus; userId: string }) {
  await requireSoftwareMembership(input.organizationId, input.userId);
  return db.$transaction(async (transaction) => {
    const document = await transaction.salesDocument.findFirst({ where: { id: input.documentId, organizationId: input.organizationId }, include: { lines: true, receipts: true } });
    if (!document) throw new Error("Sales document not found");
    if (input.status === "PAID") throw new Error("Paid status is set by receipts");
    if (document.status === SalesDocumentStatus.VOID) throw new Error("A void document cannot be changed");
    if (input.status === "VOID" && document.receipts.length) throw new Error("A document with receipts cannot be voided");
    const canTransition = input.status === SalesDocumentStatus.VOID
      ? document.status !== SalesDocumentStatus.PAID && document.status !== SalesDocumentStatus.FULFILLED
      : document.kind === SalesDocumentKind.QUOTE
        ? document.status === SalesDocumentStatus.DRAFT && input.status === SalesDocumentStatus.ISSUED || document.status === SalesDocumentStatus.ISSUED && input.status === SalesDocumentStatus.ACCEPTED
        : document.kind === SalesDocumentKind.INVOICE
          ? document.status === SalesDocumentStatus.DRAFT && input.status === SalesDocumentStatus.ISSUED
          : document.status === SalesDocumentStatus.DRAFT && input.status === SalesDocumentStatus.ACCEPTED || document.status === SalesDocumentStatus.ACCEPTED && input.status === SalesDocumentStatus.FULFILLED;
    if (!canTransition) throw new Error("Invalid sales document status transition");
    if (input.status === "FULFILLED" && document.status !== SalesDocumentStatus.FULFILLED) {
      for (const line of document.lines) {
        if (!line.productId) continue;
        const delta = document.kind === SalesDocumentKind.RETURN ? line.quantity : -line.quantity;
        if (delta < 0) {
          const product = await transaction.softwareProduct.findFirst({ where: { id: line.productId, organizationId: input.organizationId }, select: { stockQuantity: true } });
          if (!product || product.stockQuantity + delta < 0) throw new Error("Insufficient inventory for fulfillment");
        }
        await transaction.softwareProduct.update({ where: { id: line.productId }, data: { stockQuantity: { increment: delta } } });
        await transaction.inventoryMovement.create({ data: { organizationId: input.organizationId, productId: line.productId, type: document.kind === SalesDocumentKind.RETURN ? "RETURN" : "SALE", quantity: delta, referenceType: "SalesDocument", referenceId: document.id, createdById: input.userId } });
      }
    }
    const updated = await transaction.salesDocument.update({ where: { id: document.id }, data: { status: input.status }, include: salesDocumentInclude });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.sales.document.status.updated", entityType: "SalesDocument", entityId: updated.id, metadata: { status: updated.status } } });
    return updated;
  });
}

export async function recordSoftwareReceipt(input: { amountMinor: number; documentId: string; organizationId: string; receivedAt?: Date; reference?: string; userId: string }) {
  await requireSoftwareMembership(input.organizationId, input.userId);
  return db.$transaction(async (transaction) => {
    const document = await transaction.salesDocument.findFirst({ where: { id: input.documentId, organizationId: input.organizationId, kind: SalesDocumentKind.INVOICE }, include: { receipts: true } });
    if (!document) throw new Error("Invoice not found");
    if (document.status === SalesDocumentStatus.VOID) throw new Error("A void invoice cannot receive payment");
    if (document.status !== SalesDocumentStatus.ISSUED) throw new Error("Only issued invoices can receive payment");
    const receivedMinor = document.receipts.reduce((total, receipt) => total + receipt.amountMinor, 0);
    if (input.amountMinor > document.totalMinor - receivedMinor) throw new Error("Receipt exceeds invoice balance");
    const receivedAt = input.receivedAt ?? new Date();
    const receipt = await transaction.softwareReceipt.create({ data: { organizationId: input.organizationId, documentId: document.id, amountMinor: input.amountMinor, currency: document.currency, reference: cleanOptional(input.reference), receivedAt, createdById: input.userId } });
    await transaction.financialEntry.create({ data: { organizationId: input.organizationId, type: "INCOME", amountMinor: input.amountMinor, currency: document.currency, description: `Receipt ${receipt.id} for ${document.number}`, occurredAt: receivedAt, createdById: input.userId } });
    if (receivedMinor + input.amountMinor === document.totalMinor) await transaction.salesDocument.update({ where: { id: document.id }, data: { status: SalesDocumentStatus.PAID } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.receipt.created", entityType: "SoftwareReceipt", entityId: receipt.id, metadata: { documentId: document.id, amountMinor: receipt.amountMinor } } });
    return receipt;
  });
}

export function summarizeSalesWorkspace(data: Awaited<ReturnType<typeof listSalesWorkspace>>) {
  const invoices = data.documents.filter((document) => document.kind === SalesDocumentKind.INVOICE && document.status !== SalesDocumentStatus.VOID);
  const invoiceTotalMinor = invoices.reduce((total, document) => total + document.totalMinor, 0);
  const receivedMinor = data.receipts.reduce((total, receipt) => total + receipt.amountMinor, 0);
  return {
    activeCustomers: data.customers.filter((customer) => customer.status === "ACTIVE").length,
    activeProducts: data.products.filter((product) => product.isActive).length,
    invoiceTotalMinor,
    outstandingMinor: Math.max(0, invoiceTotalMinor - receivedMinor),
    quoteCount: data.documents.filter((document) => document.kind === SalesDocumentKind.QUOTE).length,
    receivedMinor,
  };
}