import { FleetVehicleStatus, OrganizationMemberStatus, OrganizationProgramKey, OrganizationProgramStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

async function requireFleetAccess(organizationId: string, userId: string) {
  const [membership, program] = await Promise.all([
    db.organizationMember.findFirst({ where: { organizationId, userId, status: OrganizationMemberStatus.ACTIVE }, select: { isOwner: true } }),
    db.organizationProgram.findUnique({ where: { organizationId_key: { organizationId, key: OrganizationProgramKey.FLEET } }, select: { status: true } }),
  ]);
  if (!membership) throw new Error("Active organization membership required");
  if (program?.status !== OrganizationProgramStatus.ACTIVE) throw new Error("Active fleet program required");
  return membership;
}

export async function listFleetVehicles(organizationId: string, userId: string) {
  await requireFleetAccess(organizationId, userId);
  return db.fleetVehicle.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
}

export async function createFleetVehicle(input: { organizationId: string; label: string; plateNumber: string; userId: string }) {
  const membership = await requireFleetAccess(input.organizationId, input.userId);
  if (!membership.isOwner) throw new Error("Organization owner access required");
  return db.$transaction(async (transaction) => {
    const vehicle = await transaction.fleetVehicle.create({ data: { organizationId: input.organizationId, label: input.label, plateNumber: input.plateNumber.toUpperCase(), createdById: input.userId } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "fleet.vehicle.created", entityType: "FleetVehicle", entityId: vehicle.id, metadata: { plateNumber: vehicle.plateNumber } as Prisma.InputJsonValue } });
    return vehicle;
  });
}

export async function updateFleetVehicleStatus(input: { organizationId: string; vehicleId: string; status: Exclude<FleetVehicleStatus, "ACTIVE">; userId: string }) {
  const membership = await requireFleetAccess(input.organizationId, input.userId);
  if (!membership.isOwner) throw new Error("Organization owner access required");
  const vehicle = await db.fleetVehicle.findFirst({ where: { id: input.vehicleId, organizationId: input.organizationId }, select: { id: true } });
  if (!vehicle) throw new Error("Fleet vehicle not found");
  return db.$transaction(async (transaction) => {
    const updated = await transaction.fleetVehicle.update({ where: { id: vehicle.id }, data: { status: input.status } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "fleet.vehicle.status.updated", entityType: "FleetVehicle", entityId: updated.id, metadata: { status: input.status } as Prisma.InputJsonValue } });
    return updated;
  });
}