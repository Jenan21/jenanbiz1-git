import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ensurePlatformRobotCoverage, getPlatformRobotCoverage, platformRobotSections, robotCoverageRoles } from "@/lib/admin/robot-coverage";

const createdRobotIds: string[] = [];

afterAll(async () => {
  if (createdRobotIds.length) await db.robot.deleteMany({ where: { id: { in: createdRobotIds } } });
  await db.$disconnect();
});

describe("platform robot coverage", () => {
  it("ensures operations, maintenance, development, and innovation robots for every platform section", async () => {
    const before = await getPlatformRobotCoverage();
    const result = await ensurePlatformRobotCoverage();
    createdRobotIds.push(...result.created);
    const coverage = await getPlatformRobotCoverage();

    expect(result.required).toBe(platformRobotSections.length * robotCoverageRoles.length);
    expect(coverage.required).toBe(platformRobotSections.length);
    expect(coverage.rolesPerSection).toBe(robotCoverageRoles.length);
    expect(coverage.covered).toBe(platformRobotSections.length);
    for (const section of coverage.coverage) {
      expect(section.complete).toBe(true);
      expect(section.roles).toHaveLength(robotCoverageRoles.length);
      expect(section.roles.every((role) => role.robot?.tasks && role.robot.tasks >= 1)).toBe(true);
    }
    expect(coverage.totalRobots).toBeGreaterThanOrEqual(before.totalRobots);
  });
});