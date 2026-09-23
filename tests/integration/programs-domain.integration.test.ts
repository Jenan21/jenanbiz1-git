import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { activateOrganizationProgram, createOrganizationForUser, getOrganizationProgramHealth } from "@/services/programs/organization-program-service";
import { createFinancialEntry } from "@/services/programs/financial-entry-service";
import { createFieldAssignment } from "@/services/programs/field-operations-service";
import { createFleetVehicle } from "@/services/programs/fleet-service";
import { inviteOrganizationMember, acceptOrganizationInvitation } from "@/services/programs/people-service";

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

describe("organization programs domain", () => {
  it("computes operational readiness across finance, people, field, and fleet programs", async () => {
    const owner = await db.user.create({ data: { email: `program-owner-${suffix}@example.test`, status: "ACTIVE", profile: { create: { displayName: "Program owner", locale: "en", language: "en" } } } });
    const member = await db.user.create({ data: { email: `program-member-${suffix}@example.test`, status: "ACTIVE", profile: { create: { displayName: "Program member", locale: "en", language: "en" } } } });
    ownerId = owner.id;
    memberId = member.id;
    const organization = await createOrganizationForUser({ name: `Programs org ${suffix}`, userId: owner.id });
    organizationId = organization.id;

    await activateOrganizationProgram({ organizationId: organization.id, key: "FINANCE", userId: owner.id });
    await activateOrganizationProgram({ organizationId: organization.id, key: "PEOPLE", userId: owner.id });
    await activateOrganizationProgram({ organizationId: organization.id, key: "FIELD_OPERATIONS", userId: owner.id });
    await activateOrganizationProgram({ organizationId: organization.id, key: "FLEET", userId: owner.id });

    const invitation = await inviteOrganizationMember({ organizationId: organization.id, email: member.email, userId: owner.id });
    await acceptOrganizationInvitation(invitation.id, member.id);
    const assignee = await db.organizationMember.findFirstOrThrow({ where: { organizationId: organization.id, userId: member.id }, select: { id: true } });
    await createFinancialEntry({ amountMinor: 950_000, currency: "SAR", description: "Initial revenue", occurredAt: new Date(), organizationId: organization.id, type: "INCOME", userId: owner.id });
    await createFinancialEntry({ amountMinor: 150_000, currency: "SAR", description: "Launch expense", occurredAt: new Date(), organizationId: organization.id, type: "EXPENSE", userId: owner.id });
    await createFieldAssignment({ assigneeMemberId: assignee.id, description: "Visit active customer", organizationId: organization.id, title: "Customer visit", userId: owner.id });
    await createFleetVehicle({ label: "Delivery van", organizationId: organization.id, plateNumber: `PRG${suffix.slice(0, 4)}`, userId: owner.id });

    const health = await getOrganizationProgramHealth(organization.id, owner.id);
    expect(health.activePrograms).toBe(4);
    expect(health.members).toBe(2);
    expect(health.financeBalanceMinor).toBe(800_000);
    expect(health.openAssignments).toBe(1);
    expect(health.activeVehicles).toBe(1);
    expect(health.readinessScore).toBeGreaterThanOrEqual(70);
  });
});