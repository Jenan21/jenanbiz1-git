import { LeaveRequestStatus, PayrollRunStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireSoftwareMembership } from "./software-access";

function dayStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function cleanOptional(value?: string) {
  return value?.trim() || undefined;
}

export async function listSoftwareHr(organizationId: string, userId: string) {
  await requireSoftwareMembership(organizationId, userId, true);
  const [employees, attendance, leaveRequests, payrollRuns, reviews] = await Promise.all([
    db.softwareEmployee.findMany({ where: { organizationId }, orderBy: { updatedAt: "desc" }, take: 200 }),
    db.attendanceRecord.findMany({ where: { employee: { organizationId } }, include: { employee: { select: { name: true, employeeNumber: true } } }, orderBy: { date: "desc" }, take: 200 }),
    db.leaveRequest.findMany({ where: { employee: { organizationId } }, include: { employee: { select: { name: true, employeeNumber: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.payrollRun.findMany({ where: { organizationId }, include: { items: { include: { employee: { select: { name: true, employeeNumber: true } } } } }, orderBy: { periodEnd: "desc" }, take: 100 }),
    db.performanceReview.findMany({ where: { employee: { organizationId } }, include: { employee: { select: { name: true, employeeNumber: true } } }, orderBy: { reviewedAt: "desc" }, take: 200 }),
  ]);
  return { employees, attendance, leaveRequests, payrollRuns, reviews };
}

export async function createSoftwareEmployee(input: { currency?: string; email?: string; employeeNumber: string; hiredAt: Date; memberId?: string; name: string; organizationId: string; roleTitle: string; salaryMinor: number; userId: string }) {
  await requireSoftwareMembership(input.organizationId, input.userId, true);
  if (input.memberId) {
    const member = await db.organizationMember.findFirst({ where: { id: input.memberId, organizationId: input.organizationId, status: "ACTIVE" }, select: { id: true } });
    if (!member) throw new Error("Organization member not found");
  }
  return db.$transaction(async (transaction) => {
    const employee = await transaction.softwareEmployee.create({ data: { organizationId: input.organizationId, memberId: input.memberId, employeeNumber: input.employeeNumber.trim().toUpperCase(), name: input.name.trim(), email: cleanOptional(input.email), roleTitle: input.roleTitle.trim(), salaryMinor: input.salaryMinor, currency: input.currency?.trim().toUpperCase() || "SAR", hiredAt: input.hiredAt, createdById: input.userId } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.hr.employee.created", entityType: "SoftwareEmployee", entityId: employee.id, metadata: { employeeNumber: employee.employeeNumber } } });
    return employee;
  });
}

export async function recordAttendance(input: { checkInAt?: Date; checkOutAt?: Date; date: Date; employeeId: string; note?: string; organizationId: string; status: "PRESENT" | "ABSENT" | "REMOTE"; userId: string }) {
  await requireSoftwareMembership(input.organizationId, input.userId, true);
  const employee = await db.softwareEmployee.findFirst({ where: { id: input.employeeId, organizationId: input.organizationId }, select: { id: true } });
  if (!employee) throw new Error("Employee not found");
  const date = dayStart(input.date);
  return db.$transaction(async (transaction) => {
    const attendance = await transaction.attendanceRecord.upsert({ where: { employeeId_date: { employeeId: employee.id, date } }, create: { employeeId: employee.id, date, status: input.status, checkInAt: input.checkInAt, checkOutAt: input.checkOutAt, note: cleanOptional(input.note) }, update: { status: input.status, checkInAt: input.checkInAt, checkOutAt: input.checkOutAt, note: cleanOptional(input.note) } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.hr.attendance.recorded", entityType: "AttendanceRecord", entityId: attendance.id, metadata: { employeeId: employee.id, status: attendance.status } } });
    return attendance;
  });
}

export async function createLeaveRequest(input: { employeeId: string; endDate: Date; organizationId: string; reason?: string; startDate: Date; userId: string }) {
  await requireSoftwareMembership(input.organizationId, input.userId, true);
  if (input.endDate < input.startDate) throw new Error("Leave end date must be on or after its start date");
  const employee = await db.softwareEmployee.findFirst({ where: { id: input.employeeId, organizationId: input.organizationId }, select: { id: true } });
  if (!employee) throw new Error("Employee not found");
  return db.leaveRequest.create({ data: { employeeId: employee.id, startDate: dayStart(input.startDate), endDate: dayStart(input.endDate), reason: cleanOptional(input.reason) } });
}

export async function updateLeaveRequestStatus(input: { leaveRequestId: string; organizationId: string; status: Exclude<LeaveRequestStatus, "PENDING">; userId: string }) {
  await requireSoftwareMembership(input.organizationId, input.userId, true);
  const request = await db.leaveRequest.findFirst({ where: { id: input.leaveRequestId, employee: { organizationId: input.organizationId } }, select: { id: true, employeeId: true } });
  if (!request) throw new Error("Leave request not found");
  return db.$transaction(async (transaction) => {
    const updated = await transaction.leaveRequest.update({ where: { id: request.id }, data: { status: input.status } });
    if (input.status === LeaveRequestStatus.APPROVED) await transaction.softwareEmployee.update({ where: { id: request.employeeId }, data: { status: "ON_LEAVE" } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.hr.leave.status.updated", entityType: "LeaveRequest", entityId: request.id, metadata: { status: input.status } } });
    return updated;
  });
}

export async function createPayrollRun(input: { deductions?: Record<string, number>; organizationId: string; periodEnd: Date; periodStart: Date; userId: string }) {
  await requireSoftwareMembership(input.organizationId, input.userId, true);
  if (input.periodEnd < input.periodStart) throw new Error("Payroll period end must be on or after its start");
  const employees = await db.softwareEmployee.findMany({ where: { organizationId: input.organizationId, status: { not: "TERMINATED" } }, select: { id: true, salaryMinor: true } });
  if (!employees.length) throw new Error("Payroll requires at least one active employee");
  const items = employees.map((employee) => {
    const deductionsMinor = Math.max(0, input.deductions?.[employee.id] ?? 0);
    if (deductionsMinor > employee.salaryMinor) throw new Error("Payroll deductions exceed gross salary");
    return { employeeId: employee.id, grossMinor: employee.salaryMinor, deductionsMinor, netMinor: employee.salaryMinor - deductionsMinor };
  });
  return db.$transaction(async (transaction) => {
    const payroll = await transaction.payrollRun.create({ data: { organizationId: input.organizationId, periodStart: dayStart(input.periodStart), periodEnd: dayStart(input.periodEnd), totalGrossMinor: items.reduce((total, item) => total + item.grossMinor, 0), totalNetMinor: items.reduce((total, item) => total + item.netMinor, 0), createdById: input.userId, items: { create: items } }, include: { items: true } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.hr.payroll.created", entityType: "PayrollRun", entityId: payroll.id, metadata: { employeeCount: items.length, totalNetMinor: payroll.totalNetMinor } } });
    return payroll;
  });
}

export async function postPayrollRun(input: { organizationId: string; payrollRunId: string; userId: string }) {
  await requireSoftwareMembership(input.organizationId, input.userId, true);
  return db.$transaction(async (transaction) => {
    const payroll = await transaction.payrollRun.findFirst({ where: { id: input.payrollRunId, organizationId: input.organizationId, status: PayrollRunStatus.DRAFT } });
    if (!payroll) throw new Error("Draft payroll run not found");
    const postedAt = new Date();
    const updated = await transaction.payrollRun.update({ where: { id: payroll.id }, data: { status: PayrollRunStatus.POSTED, postedAt } });
    await transaction.financialEntry.create({ data: { organizationId: input.organizationId, type: "EXPENSE", amountMinor: payroll.totalNetMinor, currency: "SAR", description: `Payroll ${payroll.periodStart.toISOString().slice(0, 10)} to ${payroll.periodEnd.toISOString().slice(0, 10)}`, occurredAt: postedAt, createdById: input.userId } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.hr.payroll.posted", entityType: "PayrollRun", entityId: payroll.id, metadata: { totalNetMinor: payroll.totalNetMinor } as Prisma.InputJsonValue } });
    return updated;
  });
}

export async function createPerformanceReview(input: { employeeId: string; organizationId: string; period: string; score: number; summary: string; userId: string }) {
  await requireSoftwareMembership(input.organizationId, input.userId, true);
  const employee = await db.softwareEmployee.findFirst({ where: { id: input.employeeId, organizationId: input.organizationId }, select: { id: true } });
  if (!employee) throw new Error("Employee not found");
  return db.$transaction(async (transaction) => {
    const review = await transaction.performanceReview.create({ data: { employeeId: employee.id, score: input.score, summary: input.summary.trim(), period: input.period.trim(), createdById: input.userId } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "software.hr.performance.created", entityType: "PerformanceReview", entityId: review.id, metadata: { employeeId: employee.id, score: review.score } } });
    return review;
  });
}