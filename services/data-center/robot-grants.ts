import { db } from "@/lib/db";
import { DataCenterError, type DataCenterActor } from "./contracts";
import { requireDataCenterAdmin } from "./policy";
import { auditDataCenter } from "./service";

/** Upper bound for one grant; longer access must be renewed by a new, audited grant. */
export const MAX_ROBOT_GRANT_DAYS = 365;
export interface DataCenterRobotGrantInput {
  sourceId: string; robotId: string; principalId: string; roleKey: string; specialty: string; missionId: string;
  access?: "READ" | "PROPOSE"; reason: string; expiresAt: string;
}

export async function grantDataCenterRobotAccess(input: DataCenterRobotGrantInput, actor: DataCenterActor) {
  requireDataCenterAdmin(actor);
  const now = new Date();
  const expiresAt = new Date(input.expiresAt);
  if (!(expiresAt > now)) throw new DataCenterError("GRANT_EXPIRY_MUST_BE_FUTURE");
  if (expiresAt.getTime() - now.getTime() > MAX_ROBOT_GRANT_DAYS * 86_400_000) throw new DataCenterError("GRANT_EXPIRY_TOO_FAR");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`data-center-grant:${input.sourceId}`}))`;
    if (!await tx.dataCenterSource.findUnique({ where: { id: input.sourceId }, select: { id: true } })) throw new DataCenterError("SOURCE_NOT_FOUND", 404);
    if (!await tx.robot.findUnique({ where: { id: input.robotId }, select: { id: true } })) throw new DataCenterError("ROBOT_NOT_FOUND", 404);
    if (!await tx.user.findUnique({ where: { id: input.principalId }, select: { id: true } })) throw new DataCenterError("PRINCIPAL_NOT_FOUND", 404);
    if (!await tx.mission.findFirst({ where: { id: input.missionId, assignedRobots: { some: { id: input.robotId } } }, select: { id: true } }))
      throw new DataCenterError("ROBOT_MISSION_ASSIGNMENT_REQUIRED", 409);
    const { sourceId, robotId, principalId, roleKey, specialty, missionId } = input;
    const active = await tx.dataCenterRobotGrant.findFirst({ where: { sourceId, robotId, principalId, roleKey, specialty, missionId, revokedAt: null, expiresAt: { gt: now } }, select: { id: true } });
    if (active) throw new DataCenterError("ROBOT_GRANT_ALREADY_ACTIVE", 409);
    const grant = await tx.dataCenterRobotGrant.create({ data: { sourceId, robotId, principalId, roleKey, specialty, missionId, reason: input.reason, access: input.access ?? "READ", expiresAt, grantedById: actor.id } });
    await auditDataCenter(tx, actor, "robot-grant.created", grant.id, { sourceId, robotId, principalId, missionId, roleKey, specialty, access: grant.access, expiresAt: expiresAt.toISOString() });
    return grant;
  });
}

export async function revokeDataCenterRobotAccess(input: { grantId: string; reason: string }, actor: DataCenterActor) {
  requireDataCenterAdmin(actor);
  return db.$transaction(async (tx) => {
    // The conditional update serializes concurrent revocations: the loser sees zero rows instead of a database error.
    const { count } = await tx.dataCenterRobotGrant.updateMany({ where: { id: input.grantId, revokedAt: null }, data: { revokedAt: new Date(), revokedById: actor.id, revokeReason: input.reason } });
    const grant = await tx.dataCenterRobotGrant.findUnique({ where: { id: input.grantId } });
    if (!grant) throw new DataCenterError("ROBOT_GRANT_NOT_FOUND", 404);
    if (!count) throw new DataCenterError("ROBOT_GRANT_ALREADY_REVOKED", 409);
    await auditDataCenter(tx, actor, "robot-grant.revoked", grant.id, { sourceId: grant.sourceId, robotId: grant.robotId, principalId: grant.principalId, reason: input.reason });
    return grant;
  });
}
