import {
  OrganizationMemberStatus,
  OrganizationProgramKey,
  OrganizationProgramStatus,
  Prisma,
} from "@/generated/prisma/client";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

const programCatalog = {
  FINANCE: { title: "Financial operations", description: "Financial records and operational reporting." },
  PEOPLE: { title: "People operations", description: "Teams, roles, and workforce operations." },
  FIELD_OPERATIONS: { title: "Field operations", description: "Field teams, assignments, and activity tracking." },
  FLEET: { title: "Fleet management", description: "Vehicles, routes, and fleet availability." },
} satisfies Record<OrganizationProgramKey, { title: string; description: string }>;

async function requireActiveMembership(organizationId: string, userId: string) {
  const membership = await db.organizationMember.findFirst({
    where: { organizationId, userId, status: OrganizationMemberStatus.ACTIVE },
    select: { organizationId: true },
  });
  if (!membership) throw new Error("Active organization membership required");
}

export async function createOrganizationForUser(input: {
  name: string;
  userId: string;
}) {
  const organization = await db.organization.create({
    data: {
      name: input.name,
      slug: `org-${randomUUID().replaceAll("-", "")}`,
      members: {
        create: {
          userId: input.userId,
          status: OrganizationMemberStatus.ACTIVE,
          isOwner: true,
          joinedAt: new Date(),
        },
      },
    },
  });
  await db.auditLog.create({
    data: {
      actorId: input.userId,
      organizationId: organization.id,
      action: "organization.created",
      entityType: "Organization",
      entityId: organization.id,
    },
  });
  return organization;
}

export async function listOrganizationPrograms(userId: string) {
  const memberships = await db.organizationMember.findMany({
    where: { userId, status: OrganizationMemberStatus.ACTIVE },
    select: {
      organization: {
        select: {
          id: true,
          name: true,
          businessPrograms: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  return Promise.all(memberships.map(async (membership) => ({
    organization: {
      ...membership.organization,
      health: await getOrganizationProgramHealth(membership.organization.id, userId),
    },
  })));
}

export async function getOrganizationProgramHealth(organizationId: string, userId: string) {
  await requireActiveMembership(organizationId, userId);
  const [programs, members, entries, openAssignments, activeVehicles] = await Promise.all([
    db.organizationProgram.findMany({ where: { organizationId }, select: { key: true, status: true } }),
    db.organizationMember.count({ where: { organizationId, status: OrganizationMemberStatus.ACTIVE } }),
    db.financialEntry.findMany({ where: { organizationId }, select: { amountMinor: true, type: true } }),
    db.fieldAssignment.count({ where: { organizationId, status: { in: ["ACTIVE", "IN_PROGRESS"] } } }),
    db.fleetVehicle.count({ where: { organizationId, status: "ACTIVE" } }),
  ]);
  const activePrograms = programs.filter((program) => program.status === OrganizationProgramStatus.ACTIVE).length;
  const financeBalanceMinor = entries.reduce((total, entry) => total + (entry.type === "INCOME" ? entry.amountMinor : -entry.amountMinor), 0);
  const readinessScore = Math.min(100,
    (activePrograms / Object.keys(programCatalog).length) * 45 +
    Math.min(members, 5) * 6 +
    (entries.length ? 10 : 0) +
    Math.min(openAssignments, 5) * 2 +
    Math.min(activeVehicles, 5) * 1,
  );
  return {
    activePrograms,
    activeVehicles,
    financeBalanceMinor,
    members,
    openAssignments,
    readinessScore: Math.round(readinessScore),
    totalPrograms: Object.keys(programCatalog).length,
  };
}

export async function activateOrganizationProgram(input: {
  organizationId: string;
  key: OrganizationProgramKey;
  userId: string;
}) {
  await requireActiveMembership(input.organizationId, input.userId);
  const program = await db.organizationProgram.upsert({
    where: { organizationId_key: { organizationId: input.organizationId, key: input.key } },
    create: {
      organizationId: input.organizationId,
      key: input.key,
      status: OrganizationProgramStatus.ACTIVE,
      createdById: input.userId,
    },
    update: { status: OrganizationProgramStatus.ACTIVE },
  });
  await db.auditLog.create({
    data: {
      actorId: input.userId,
      organizationId: input.organizationId,
      action: "organization.program.activated",
      entityType: "OrganizationProgram",
      entityId: program.id,
      metadata: { key: input.key } as Prisma.InputJsonValue,
    },
  });
  return program;
}

export async function updateOrganizationProgramStatus(input: {
  organizationId: string;
  programId: string;
  status: Exclude<OrganizationProgramStatus, "ACTIVE">;
  userId: string;
}) {
  await requireActiveMembership(input.organizationId, input.userId);
  const program = await db.organizationProgram.update({
    where: { id: input.programId, organizationId: input.organizationId },
    data: { status: input.status },
  });
  await db.auditLog.create({
    data: {
      actorId: input.userId,
      organizationId: input.organizationId,
      action: `organization.program.${input.status.toLowerCase()}`,
      entityType: "OrganizationProgram",
      entityId: program.id,
      metadata: { key: program.key } as Prisma.InputJsonValue,
    },
  });
  return program;
}

export { programCatalog };