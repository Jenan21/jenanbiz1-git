import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { createOrganizationForUser } from "@/services/programs/organization-program-service";
import { createLeaveRequest, createPayrollRun, createPerformanceReview, createSoftwareEmployee, listSoftwareHr, postPayrollRun, recordAttendance, updateLeaveRequestStatus } from "@/services/software/hr-service";

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

describe("Jenan Software HR cycle", () => {
  it("records employees, attendance, leave, payroll, performance, and owner-only controls", async () => {
    const owner = await db.user.create({ data: { email: `software-hr-owner-${suffix}@example.test`, status: "ACTIVE" } });
    const member = await db.user.create({ data: { email: `software-hr-member-${suffix}@example.test`, status: "ACTIVE" } });
    ownerId = owner.id;
    memberId = member.id;
    const organization = await createOrganizationForUser({ name: `HR org ${suffix}`, userId: owner.id });
    organizationId = organization.id;
    await db.organizationMember.create({ data: { organizationId: organization.id, userId: member.id, status: "ACTIVE", joinedAt: new Date() } });

    const employee = await createSoftwareEmployee({ organizationId: organization.id, employeeNumber: `EMP-${suffix}`, name: "Verified employee", roleTitle: "Operations lead", salaryMinor: 12_000_00, hiredAt: new Date("2026-01-01T00:00:00.000Z"), userId: owner.id });
    await recordAttendance({ organizationId: organization.id, employeeId: employee.id, date: new Date("2026-09-27T10:00:00.000Z"), status: "PRESENT", checkInAt: new Date("2026-09-27T06:00:00.000Z"), userId: owner.id });
    const leave = await createLeaveRequest({ organizationId: organization.id, employeeId: employee.id, startDate: new Date("2026-10-01T00:00:00.000Z"), endDate: new Date("2026-10-03T00:00:00.000Z"), reason: "Annual leave", userId: owner.id });
    expect((await updateLeaveRequestStatus({ organizationId: organization.id, leaveRequestId: leave.id, status: "APPROVED", userId: owner.id })).status).toBe("APPROVED");
    const payroll = await createPayrollRun({ organizationId: organization.id, periodStart: new Date("2026-09-01T00:00:00.000Z"), periodEnd: new Date("2026-09-30T00:00:00.000Z"), deductions: { [employee.id]: 500_00 }, userId: owner.id });
    expect(payroll.totalGrossMinor).toBe(12_000_00);
    expect(payroll.totalNetMinor).toBe(11_500_00);
    expect((await postPayrollRun({ organizationId: organization.id, payrollRunId: payroll.id, userId: owner.id })).status).toBe("POSTED");
    const review = await createPerformanceReview({ organizationId: organization.id, employeeId: employee.id, period: "2026 Q3", score: 88, summary: "Consistent delivery and clear operational ownership.", userId: owner.id });
    expect(review.score).toBe(88);
    expect((await listSoftwareHr(organization.id, owner.id))).toMatchObject({ employees: [{ id: employee.id }], payrollRuns: [{ id: payroll.id, status: "POSTED" }] });
    expect(await db.financialEntry.count({ where: { organizationId: organization.id, type: "EXPENSE", amountMinor: 11_500_00 } })).toBe(1);
    await expect(createSoftwareEmployee({ organizationId: organization.id, employeeNumber: "BLOCKED", name: "Blocked", roleTitle: "Member", salaryMinor: 1, hiredAt: new Date(), userId: member.id })).rejects.toThrow("owner access required");
    await expect(listSoftwareHr(organization.id, member.id)).rejects.toThrow("owner access required");
  });
});