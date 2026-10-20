import { describe, expect, it, vi } from "vitest";
import type { DbExecutor } from "@/lib/db";
import { assertSourceAccess, isDataCenterAdmin, robotSourceIds, sourceScopeWhere } from "@/services/data-center/policy";
import { commandSchema, type DataCenterActor } from "@/services/data-center/contracts";

const robot: DataCenterActor = { id: "principal", systemRole: "ADMIN", kind: "AI", robotId: "robot-1", roleKey: "analyst", specialty: "demography", missionId: "mission-1" };
function executor(options: { assigned?: boolean; grants?: { sourceId: string }[] } = {}) {
  const mission = { findFirst: vi.fn().mockResolvedValue(options.assigned === false ? null : { id: "mission-1" }) };
  const dataCenterRobotGrant = { findMany: vi.fn().mockResolvedValue(options.grants ?? []) };
  return { tx: { mission, dataCenterRobotGrant } as unknown as DbExecutor, mission, dataCenterRobotGrant };
}
const source = (id: string) => ({ id, scope: "PLATFORM", ownerId: "someone", organizationId: null }) as Parameters<typeof assertSourceAccess>[0];

describe("Data Center robot access policy", () => {
  it("never treats an AI principal as an administrator, whatever its system role", () => {
    expect(isDataCenterAdmin(robot)).toBe(false);
  });
  it("requires the complete server-authenticated robot identity before any lookup", async () => {
    for (const missing of ["robotId", "roleKey", "specialty", "missionId"] as const) {
      const { tx, mission } = executor({ grants: [{ sourceId: "s1" }] });
      await expect(robotSourceIds({ ...robot, [missing]: undefined }, tx)).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED", status: 403 });
      expect(mission.findFirst).not.toHaveBeenCalled();
    }
  });
  it("requires the robot to remain assigned to the mission", async () => {
    const { tx, dataCenterRobotGrant } = executor({ assigned: false, grants: [{ sourceId: "s1" }] });
    await expect(robotSourceIds(robot, tx)).rejects.toMatchObject({ code: "ROBOT_MISSION_ASSIGNMENT_REQUIRED", status: 403 });
    expect(dataCenterRobotGrant.findMany).not.toHaveBeenCalled();
  });
  it("matches grants on principal, robot, role, specialty and mission, excluding revoked and expired grants", async () => {
    const { tx, mission, dataCenterRobotGrant } = executor({ grants: [{ sourceId: "s1" }, { sourceId: "s2" }] });
    await expect(robotSourceIds(robot, tx)).resolves.toEqual(["s1", "s2"]);
    expect(mission.findFirst).toHaveBeenCalledWith({ where: { id: "mission-1", assignedRobots: { some: { id: "robot-1" } } }, select: { id: true } });
    const where = dataCenterRobotGrant.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ principalId: "principal", robotId: "robot-1", roleKey: "analyst", specialty: "demography", missionId: "mission-1", revokedAt: null });
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
    expect(where.access).toBeUndefined();
  });
  it("fails closed when no grant matches", async () => {
    await expect(robotSourceIds(robot, executor().tx)).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED", status: 403 });
  });
  it("limits retrieval scope to granted sources instead of platform, private or organization scopes", async () => {
    expect(await sourceScopeWhere(robot, executor({ grants: [{ sourceId: "s1" }] }).tx)).toEqual({ id: { in: ["s1"] } });
  });
  it("hides sources that were not granted and requires PROPOSE grants for writes", async () => {
    await expect(assertSourceAccess(source("s1"), robot, false, executor({ grants: [{ sourceId: "s1" }] }).tx)).resolves.toMatchObject({ id: "s1" });
    await expect(assertSourceAccess(source("s2"), robot, false, executor({ grants: [{ sourceId: "s1" }] }).tx)).rejects.toMatchObject({ code: "SOURCE_NOT_FOUND", status: 404 });
    const write = executor({ grants: [{ sourceId: "s1" }] });
    await expect(assertSourceAccess(source("s1"), robot, true, write.tx)).resolves.toMatchObject({ id: "s1" });
    expect(write.dataCenterRobotGrant.findMany.mock.calls[0][0].where.access).toBe("PROPOSE");
    await expect(assertSourceAccess(source("s1"), robot, true, executor().tx)).rejects.toMatchObject({ code: "EXPLICIT_ROBOT_GRANT_REQUIRED" });
  });
  it("accepts grant and revoke commands only with explicit, bounded input", () => {
    const grant = { action: "grant-robot-access", sourceId: "s", robotId: "r", principalId: "p", roleKey: "analyst", specialty: "demography", missionId: "m", reason: "Mission data need", expiresAt: "2030-01-01T00:00:00.000Z" };
    expect(commandSchema.parse(grant)).toMatchObject({ access: "READ" });
    expect(commandSchema.parse({ ...grant, access: "PROPOSE" })).toMatchObject({ access: "PROPOSE" });
    for (const bad of [{ access: "WRITE" }, { expiresAt: "tomorrow" }, { reason: "" }, { unexpected: true }]) expect(() => commandSchema.parse({ ...grant, ...bad })).toThrow();
    expect(commandSchema.parse({ action: "revoke-robot-access", grantId: "g", reason: "Mission ended" })).toMatchObject({ grantId: "g" });
    expect(() => commandSchema.parse({ action: "revoke-robot-access", grantId: "g" })).toThrow();
  });
});
