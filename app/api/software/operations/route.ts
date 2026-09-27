import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { createOrganizationForUser } from "@/services/programs/organization-program-service";
import { createLeaveRequest, createPayrollRun, createPerformanceReview, createSoftwareEmployee, listSoftwareHr, postPayrollRun, recordAttendance, updateLeaveRequestStatus } from "@/services/software/hr-service";
import { adjustInventory, closePosShift, createCrmLead, createPurchaseOrder, createSoftwareSupplier, listSoftwareOperations, openPosShift, recordPosSale, summarizeSoftwareOperations, updateCrmLeadStatus, updatePurchaseOrderStatus } from "@/services/software/operations-service";
import { createSalesDocument, listSalesWorkspace, recordSoftwareReceipt, saveSoftwareCustomer, saveSoftwareProduct, summarizeSalesWorkspace, updateSalesDocumentStatus } from "@/services/software/sales-service";
import { getSoftwareCompany, listSoftwareOrganizations } from "@/services/software/software-access";

const cuid = z.string().cuid();
const organizationId = { organizationId: cuid };
const money = z.number().int().min(0).max(2_000_000_000);
const positiveMoney = z.number().int().positive().max(2_000_000_000);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createOrganization"), name: z.string().trim().min(2).max(160) }),
  z.object({ action: z.literal("saveCustomer"), ...organizationId, customerId: cuid.optional(), name: z.string().trim().min(2).max(160), email: optionalText(254), phone: optionalText(50), taxNumber: optionalText(80) }),
  z.object({ action: z.literal("saveProduct"), ...organizationId, productId: cuid.optional(), sku: z.string().trim().min(1).max(80), name: z.string().trim().min(2).max(160), description: optionalText(1000), priceMinor: money, costMinor: money, initialStock: z.number().int().min(0).max(1_000_000).optional(), reorderLevel: z.number().int().min(0).max(1_000_000).optional(), currency: z.string().trim().length(3).optional() }),
  z.object({ action: z.literal("createSalesDocument"), ...organizationId, customerId: cuid.optional(), kind: z.enum(["QUOTE", "ORDER", "INVOICE", "RETURN"]), currency: z.string().trim().length(3).optional(), dueAt: z.string().datetime().optional(), notes: optionalText(2000), lines: z.array(z.object({ productId: cuid.optional(), description: optionalText(500), quantity: z.number().int().positive().max(1_000_000), unitPriceMinor: money.optional(), taxRateBps: z.number().int().min(0).max(10_000).optional() })).min(1).max(50) }),
  z.object({ action: z.literal("updateSalesStatus"), ...organizationId, documentId: cuid, status: z.enum(["DRAFT", "ISSUED", "ACCEPTED", "FULFILLED", "VOID"]) }),
  z.object({ action: z.literal("recordReceipt"), ...organizationId, documentId: cuid, amountMinor: positiveMoney, reference: optionalText(200), receivedAt: z.string().datetime().optional() }),
  z.object({ action: z.literal("createLead"), ...organizationId, customerId: cuid.optional(), name: z.string().trim().min(2).max(160), contact: optionalText(254), source: optionalText(120), valueMinor: money.optional(), currency: z.string().trim().length(3).optional(), nextAction: optionalText(500) }),
  z.object({ action: z.literal("updateLeadStatus"), ...organizationId, leadId: cuid, status: z.enum(["NEW", "QUALIFIED", "CONTACTED", "WON", "LOST"]) }),
  z.object({ action: z.literal("adjustInventory"), ...organizationId, productId: cuid, quantity: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0), note: z.string().trim().min(2).max(500) }),
  z.object({ action: z.literal("createSupplier"), ...organizationId, name: z.string().trim().min(2).max(160), email: optionalText(254), phone: optionalText(50) }),
  z.object({ action: z.literal("createPurchase"), ...organizationId, supplierId: cuid.optional(), currency: z.string().trim().length(3).optional(), expectedAt: z.string().datetime().optional(), lines: z.array(z.object({ productId: cuid.optional(), description: optionalText(500), quantity: z.number().int().positive().max(1_000_000), unitCostMinor: money })).min(1).max(50) }),
  z.object({ action: z.literal("updatePurchaseStatus"), ...organizationId, orderId: cuid, status: z.enum(["DRAFT", "ORDERED", "RECEIVED", "CANCELLED"]) }),
  z.object({ action: z.literal("openShift"), ...organizationId, openingCashMinor: money }),
  z.object({ action: z.literal("recordPosSale"), ...organizationId, shiftId: cuid, productId: cuid, customerId: cuid.optional(), quantity: z.number().int().positive().max(100_000), taxRateBps: z.number().int().min(0).max(10_000).optional() }),
  z.object({ action: z.literal("closeShift"), ...organizationId, shiftId: cuid, closingCashMinor: money }),
  z.object({ action: z.literal("createEmployee"), ...organizationId, employeeNumber: z.string().trim().min(1).max(80), name: z.string().trim().min(2).max(160), email: optionalText(254), roleTitle: z.string().trim().min(2).max(160), salaryMinor: money, currency: z.string().trim().length(3).optional(), hiredAt: z.string().datetime(), memberId: cuid.optional() }),
  z.object({ action: z.literal("recordAttendance"), ...organizationId, employeeId: cuid, date: z.string().datetime(), status: z.enum(["PRESENT", "ABSENT", "REMOTE"]), checkInAt: z.string().datetime().optional(), checkOutAt: z.string().datetime().optional(), note: optionalText(500) }),
  z.object({ action: z.literal("createLeave"), ...organizationId, employeeId: cuid, startDate: z.string().datetime(), endDate: z.string().datetime(), reason: optionalText(1000) }),
  z.object({ action: z.literal("updateLeaveStatus"), ...organizationId, leaveRequestId: cuid, status: z.enum(["APPROVED", "REJECTED", "CANCELLED"]) }),
  z.object({ action: z.literal("createPayroll"), ...organizationId, periodStart: z.string().datetime(), periodEnd: z.string().datetime(), deductions: z.record(cuid, money).optional() }),
  z.object({ action: z.literal("postPayroll"), ...organizationId, payrollRunId: cuid }),
  z.object({ action: z.literal("createPerformance"), ...organizationId, employeeId: cuid, score: z.number().int().min(1).max(100), period: z.string().trim().min(2).max(80), summary: z.string().trim().min(10).max(2000) }),
]);

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const organizations = await listSoftwareOrganizations(user.id);
  const requestedId = request.nextUrl.searchParams.get("organizationId");
  const selectedId = requestedId ?? organizations[0]?.organization.id;
  if (!selectedId) return NextResponse.json({ success: true, organizations, workspace: null });
  try {
    const [company, sales, operations, hr] = await Promise.all([
      getSoftwareCompany(selectedId, user.id),
      listSalesWorkspace(selectedId, user.id),
      listSoftwareOperations(selectedId, user.id),
      listSoftwareHr(selectedId, user.id),
    ]);
    return NextResponse.json({ success: true, organizations, workspace: { company, sales, operations, hr, salesSummary: summarizeSalesWorkspace(sales), operationsSummary: summarizeSoftwareOperations(operations) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Software workspace failed";
    return NextResponse.json({ success: false, message }, { status: message.includes("required") ? 403 : 404 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid Software command" }, { status: 400 });
  try {
    const input = parsed.data;
    const result = input.action === "createOrganization" ? await createOrganizationForUser({ name: input.name, userId: user.id })
      : input.action === "saveCustomer" ? await saveSoftwareCustomer({ ...input, userId: user.id })
      : input.action === "saveProduct" ? await saveSoftwareProduct({ ...input, userId: user.id })
      : input.action === "createSalesDocument" ? await createSalesDocument({ ...input, dueAt: input.dueAt ? new Date(input.dueAt) : undefined, userId: user.id })
      : input.action === "updateSalesStatus" ? await updateSalesDocumentStatus({ ...input, userId: user.id })
      : input.action === "recordReceipt" ? await recordSoftwareReceipt({ ...input, receivedAt: input.receivedAt ? new Date(input.receivedAt) : undefined, userId: user.id })
      : input.action === "createLead" ? await createCrmLead({ ...input, userId: user.id })
      : input.action === "updateLeadStatus" ? await updateCrmLeadStatus({ ...input, userId: user.id })
      : input.action === "adjustInventory" ? await adjustInventory({ ...input, userId: user.id })
      : input.action === "createSupplier" ? await createSoftwareSupplier({ ...input, userId: user.id })
      : input.action === "createPurchase" ? await createPurchaseOrder({ ...input, expectedAt: input.expectedAt ? new Date(input.expectedAt) : undefined, userId: user.id })
      : input.action === "updatePurchaseStatus" ? await updatePurchaseOrderStatus({ ...input, userId: user.id })
      : input.action === "openShift" ? await openPosShift({ ...input, userId: user.id })
      : input.action === "recordPosSale" ? await recordPosSale({ ...input, userId: user.id })
      : input.action === "closeShift" ? await closePosShift({ ...input, userId: user.id })
      : input.action === "createEmployee" ? await createSoftwareEmployee({ ...input, hiredAt: new Date(input.hiredAt), userId: user.id })
      : input.action === "recordAttendance" ? await recordAttendance({ ...input, date: new Date(input.date), checkInAt: input.checkInAt ? new Date(input.checkInAt) : undefined, checkOutAt: input.checkOutAt ? new Date(input.checkOutAt) : undefined, userId: user.id })
      : input.action === "createLeave" ? await createLeaveRequest({ ...input, startDate: new Date(input.startDate), endDate: new Date(input.endDate), userId: user.id })
      : input.action === "updateLeaveStatus" ? await updateLeaveRequestStatus({ ...input, userId: user.id })
      : input.action === "createPayroll" ? await createPayrollRun({ ...input, periodStart: new Date(input.periodStart), periodEnd: new Date(input.periodEnd), userId: user.id })
      : input.action === "postPayroll" ? await postPayrollRun({ ...input, userId: user.id })
      : await createPerformanceReview({ ...input, userId: user.id });
    const createdActions = new Set(["createOrganization", "saveCustomer", "saveProduct", "createSalesDocument", "recordReceipt", "createLead", "createSupplier", "createPurchase", "openShift", "recordPosSale", "createEmployee", "recordAttendance", "createLeave", "createPayroll", "createPerformance"]);
    return NextResponse.json({ success: true, result }, { status: createdActions.has(input.action) ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Software command failed";
    const status = message.includes("required") ? 403 : message.endsWith("not found") ? 404 : 409;
    return NextResponse.json({ success: false, message }, { status });
  }
}