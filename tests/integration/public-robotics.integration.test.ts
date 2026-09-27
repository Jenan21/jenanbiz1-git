import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { createRobotInformationRequest, listPublicRobots, listRobotInformationRequests, recommendPublicRobots } from "@/services/robotics/public-robotics-service";

const suffix = crypto.randomUUID().slice(0, 8);
let userId: string | undefined;
let robotId: string | undefined;

afterAll(async () => {
  if (userId) await db.user.delete({ where: { id: userId } });
  if (robotId) await db.robot.delete({ where: { id: robotId } });
  await db.$disconnect();
});

describe("public Robotics catalog", () => {
  it("returns sanitized certified robots and stores information requests without task execution", async () => {
    const user = await db.user.create({ data: { email: `robotics-user-${suffix}@example.test`, status: "ACTIVE" } });
    userId = user.id;
    const robot = await db.robot.create({ data: { name: `Public Operations Robot ${suffix}`, slug: `public-operations-${suffix}`, team: "sensitive-internal-team", notes: "private admin note", status: "ACTIVE", isVisible: true, intelligence: 92, skill: 90, experience: 88, academicProfile: { create: { status: "OPERATIONAL", qualityScore: 91, reliabilityScore: 93, safetyScore: 96, trustScore: 94, lastVerifiedAt: new Date() } } } });
    robotId = robot.id;

    const robots = await listPublicRobots({ query: "operations" });
    const visible = robots.find((item) => item.id === robot.id);
    expect(visible?.name).toContain("Public Operations Robot");
    expect(visible).not.toHaveProperty("notes");
    expect(visible).not.toHaveProperty("team");
    expect(visible).not.toHaveProperty("tasks");
    expect(visible).not.toHaveProperty("costs");
    expect(visible).not.toHaveProperty("genome");

    const recommendation = (await recommendPublicRobots({ query: "operations" }, 100_000))[0];
    expect(recommendation.robot.id).toBe(robot.id);
    expect(recommendation.budgetCompatibility).toBe("UNAVAILABLE");
    expect(recommendation.reasons).toContain("operations");

    const request = await createRobotInformationRequest({ robotId: robot.id, task: "Assess a documented operations automation use case.", sector: "Operations", budgetMinor: 100_000 }, user.id);
    expect(request.status).toBe("REQUESTED");
    expect((await listRobotInformationRequests(user.id))[0]?.id).toBe(request.id);
    expect(await db.robotTask.count({ where: { robotId: robot.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { entityType: "RobotInformationRequest", entityId: request.id } })).toBe(1);
  });
});