import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OrganizationMemberStatus, UserStatus } from "@/generated/prisma/client";
import { ORGANIZATION_PERMISSIONS } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { getAccountOverview } from "@/services/account/account-overview-service";
import { getUserPayments } from "@/services/account/user-center-service";
import { createFinancialEntry, listFinancialEntries } from "@/services/programs/financial-entry-service";
import { activateOrganizationProgram, createOrganizationForUser, getOrganizationProgramHealth, updateOrganizationProgramStatus } from "@/services/programs/organization-program-service";
import { createSoftwareEmployee, listSoftwareHr, listSoftwareHrForMember } from "@/services/software/hr-service";

const suffix = crypto.randomUUID().slice(0, 8);
const ids: Record<string, string> = {};
let organizationId = "";
let planId = "";
const paymentIds: string[] = [];

async function makeUser(label: string) {
  const user = await db.user.create({ data: { email: `sec-roles-${label}-${suffix}@example.test`, status: UserStatus.ACTIVE, profile: { create: { displayName: `Roles ${label}`, locale: "en", language: "en" } } } });
  ids[label] = user.id;
}

async function permission(key: string) {
  return db.permission.upsert({ where: { key }, update: {}, create: { key } });
}

async function join(label: string, status: OrganizationMemberStatus, roleId?: string) {
  await db.organizationMember.create({ data: { organizationId, userId: ids[label], status, roleId, joinedAt: status === OrganizationMemberStatus.ACTIVE ? new Date() : undefined } });
}

const entry = (userLabel: string, type: "INCOME" | "EXPENSE", amountMinor: number) =>
  createFinancialEntry({ organizationId, type, amountMinor, currency: "SAR", description: `Entry ${type} ${amountMinor}`, occurredAt: new Date(), userId: ids[userLabel] });

beforeAll(async () => {
  for (const label of ["owner", "member", "reader", "writer", "invited", "suspended"]) await makeUser(label);
  const organization = await createOrganizationForUser({ name: `Roles org ${suffix}`, userId: ids.owner });
  organizationId = organization.id;
  const [read, write] = await Promise.all([permission(ORGANIZATION_PERMISSIONS.financeRead), permission(ORGANIZATION_PERMISSIONS.financeWrite)]);
  const readerRole = await db.role.create({ data: { organizationId, name: "Finance reader", key: "finance_reader", permissions: { create: [{ permissionId: read.id }] } } });
  const writerRole = await db.role.create({ data: { organizationId, name: "Finance writer", key: "finance_writer", permissions: { create: [{ permissionId: read.id }, { permissionId: write.id }] } } });
  await join("member", OrganizationMemberStatus.ACTIVE);
  await join("reader", OrganizationMemberStatus.ACTIVE, readerRole.id);
  await join("writer", OrganizationMemberStatus.ACTIVE, writerRole.id);
  // The invited and suspended people hold the writer role too: their status has to win.
  await join("invited", OrganizationMemberStatus.INVITED, writerRole.id);
  await join("suspended", OrganizationMemberStatus.SUSPENDED, writerRole.id);
});

afterAll(async () => {
  const userIds = Object.values(ids);
  if (paymentIds.length) await db.payment.deleteMany({ where: { id: { in: paymentIds } } });
  if (organizationId) await db.organization.deleteMany({ where: { id: organizationId } });
  if (planId) await db.plan.deleteMany({ where: { id: planId } });
  if (userIds.length) await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  if (organizationId) await db.auditLog.deleteMany({ where: { organizationId } });
  if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("HR records", () => {
  it("are read by the owner only; other members get an empty section and invited members nothing", async () => {
    const employee = await createSoftwareEmployee({ organizationId, employeeNumber: `EMP-${suffix}`, name: "Salaried Person", email: `salaried-${suffix}@example.test`, roleTitle: "Analyst", salaryMinor: 1_234_500, hiredAt: new Date("2026-01-01T00:00:00.000Z"), userId: ids.owner });

    expect((await listSoftwareHr(organizationId, ids.owner)).employees.map((item) => item.id)).toEqual([employee.id]);
    const ownerSection = await listSoftwareHrForMember(organizationId, ids.owner);
    expect(ownerSection.employees).toHaveLength(1);

    for (const label of ["member", "reader", "writer", "invited", "suspended"]) {
      await expect(listSoftwareHr(organizationId, ids[label]), label).rejects.toThrow(/owner access required/);
    }
    const empty = { employees: [], attendance: [], leaveRequests: [], payrollRuns: [], reviews: [] };
    for (const label of ["member", "reader", "writer"]) {
      const section = await listSoftwareHrForMember(organizationId, ids[label]);
      expect(section, label).toEqual(empty);
      expect(JSON.stringify(section)).not.toMatch(/Salaried|1234500|salaried-/);
    }
    for (const label of ["invited", "suspended"]) {
      await expect(listSoftwareHrForMember(organizationId, ids[label]), label).rejects.toThrow("Active organization membership required");
    }
  });
});

describe("program status", () => {
  it("is changed by the owner only", async () => {
    for (const label of ["member", "reader", "writer"]) {
      await expect(activateOrganizationProgram({ organizationId, key: "FINANCE", userId: ids[label] }), label).rejects.toThrow("owner access required");
    }
    for (const label of ["invited", "suspended"]) {
      await expect(activateOrganizationProgram({ organizationId, key: "FINANCE", userId: ids[label] }), label).rejects.toThrow("Active organization membership required");
    }
    expect(await db.organizationProgram.count({ where: { organizationId } })).toBe(0);

    const program = await activateOrganizationProgram({ organizationId, key: "FINANCE", userId: ids.owner });
    for (const label of ["member", "reader", "writer"]) {
      await expect(updateOrganizationProgramStatus({ organizationId, programId: program.id, status: "SUSPENDED", userId: ids[label] }), label).rejects.toThrow("owner access required");
    }
    await expect(updateOrganizationProgramStatus({ organizationId, programId: program.id, status: "ARCHIVED", userId: ids.invited })).rejects.toThrow("Active organization membership required");
    expect((await db.organizationProgram.findUniqueOrThrow({ where: { id: program.id } })).status).toBe("ACTIVE");

    await expect(updateOrganizationProgramStatus({ organizationId, programId: "ckmissingprogramaaaaaaaaa", status: "SUSPENDED", userId: ids.owner })).rejects.toThrow("Organization program not found");
    expect((await updateOrganizationProgramStatus({ organizationId, programId: program.id, status: "SUSPENDED", userId: ids.owner })).status).toBe("SUSPENDED");
    await expect(listFinancialEntries(organizationId, ids.owner)).rejects.toThrow("Active financial program required");
    await activateOrganizationProgram({ organizationId, key: "FINANCE", userId: ids.owner });
  });
});

describe("financial entries", () => {
  it("need the owner or a role that carries the finance permission, and an ACTIVE membership", async () => {
    await entry("owner", "INCOME", 100_000);

    for (const label of ["member"]) {
      await expect(listFinancialEntries(organizationId, ids[label]), label).rejects.toThrow("Organization permission required: finance.read");
      await expect(entry(label, "INCOME", 1), label).rejects.toThrow("Organization permission required: finance.write");
    }
    for (const label of ["invited", "suspended"]) {
      await expect(listFinancialEntries(organizationId, ids[label]), label).rejects.toThrow("Active organization membership required");
      await expect(entry(label, "INCOME", 1), label).rejects.toThrow("Active organization membership required");
    }

    // a reader may read but not write
    expect((await listFinancialEntries(organizationId, ids.reader)).map((item) => item.amountMinor)).toEqual([100_000]);
    await expect(entry("reader", "EXPENSE", 1)).rejects.toThrow("Organization permission required: finance.write");

    const written = await entry("writer", "EXPENSE", 30_000);
    expect(written.createdById).toBe(ids.writer);
    expect((await listFinancialEntries(organizationId, ids.owner)).map((item) => item.amountMinor).sort((a, b) => a - b)).toEqual([30_000, 100_000]);
    expect(await db.financialEntry.count({ where: { organizationId } })).toBe(2);
  });

  it("also decide who sees the ledger balance in the program overview", async () => {
    expect((await getOrganizationProgramHealth(organizationId, ids.owner)).financeBalanceMinor).toBe(70_000);
    expect((await getOrganizationProgramHealth(organizationId, ids.reader)).financeBalanceMinor).toBe(70_000);
    const plain = await getOrganizationProgramHealth(organizationId, ids.member);
    expect(plain.financeBalanceMinor).toBeNull();
    expect(plain.readinessScore).toBe((await getOrganizationProgramHealth(organizationId, ids.owner)).readinessScore);
    await expect(getOrganizationProgramHealth(organizationId, ids.invited)).rejects.toThrow("Active organization membership required");
  });
});

describe("organization payments", () => {
  it("reach the payer, the owner and finance roles, never an ordinary, invited or suspended member", async () => {
    const [orgPayment, memberPayment] = await Promise.all([
      db.payment.create({ data: { organizationId, payerUserId: ids.owner, amountMinor: 5_000, currency: "SAR", status: "SUCCEEDED", provider: "TEST", externalRef: `sec-roles-org-${suffix}`, paidAt: new Date() } }),
      db.payment.create({ data: { organizationId, payerUserId: ids.member, amountMinor: 7_000, currency: "SAR", status: "SUCCEEDED", provider: "TEST", externalRef: `sec-roles-member-${suffix}`, paidAt: new Date() } }),
    ]);
    paymentIds.push(orgPayment.id, memberPayment.id);
    const seen = async (label: string) => (await getUserPayments(ids[label])).map((payment) => payment.id).sort();

    expect(await seen("owner")).toEqual([orgPayment.id, memberPayment.id].sort());
    expect(await seen("reader")).toEqual([orgPayment.id, memberPayment.id].sort());
    expect(await seen("writer")).toEqual([orgPayment.id, memberPayment.id].sort());
    expect(await seen("member")).toEqual([memberPayment.id]);
    expect(await seen("invited")).toEqual([]);
    expect(await seen("suspended")).toEqual([]);
  });

  it("keep an invited member from learning the organization's subscription in the account overview", async () => {
    const plan = await db.plan.create({ data: { name: "Roles plan", code: `roles-plan-${suffix}`, priceMinor: 9_900, billingPeriod: "MONTHLY" } });
    planId = plan.id;
    await db.subscription.create({ data: { organizationId, planId: plan.id, status: "ACTIVE", currentStart: new Date(), currentEnd: new Date(Date.now() + 86_400_000 * 30) } });

    const invited = await getAccountOverview(ids.invited);
    expect(invited.organizations).toEqual([expect.objectContaining({ id: organizationId, membershipStatus: "INVITED", subscriptions: [] })]);
    const member = await getAccountOverview(ids.member);
    expect(member.organizations[0]?.subscriptions).toHaveLength(1);
    const suspended = await getAccountOverview(ids.suspended);
    expect(suspended.organizations[0]?.subscriptions).toEqual([]);
  });
});
