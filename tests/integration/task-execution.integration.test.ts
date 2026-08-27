import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { executeRobotTask } from "@/services/orchestration/task-execution";

const suffix = crypto.randomUUID().slice(0, 8);
const createdRobotIds: string[] = [];

afterAll(async () => {
  if (createdRobotIds.length > 0) {
    await db.robot.deleteMany({ where: { id: { in: createdRobotIds } } });
  }
  await db.$disconnect();
});

describe("robot task execution integration", () => {
  it("persists evidence, cost, learning, evolution, and shared knowledge", async () => {
    const robot = await db.robot.create({
      data: {
        name: `Execution Probe ${suffix}`,
        slug: `execution-probe-${suffix}`,
        team: "Quality",
        intelligence: 91,
        skill: 88,
        experience: 12,
        status: "ACTIVE",
        isVisible: true,
      },
    });
    createdRobotIds.push(robot.id);

    const task = await db.robotTask.create({
      data: {
        robotId: robot.id,
        title: `Validate execution evidence ${suffix}`,
        description: "Persist all operational artifacts.",
        status: "ACTIVE",
        priority: "HIGH",
      },
    });

    const result = await executeRobotTask({ taskId: task.id, taskType: "analysis" });
    const [completedTask, evidence, costs, learning, evolutions, knowledge, updatedRobot] = await Promise.all([
      db.robotTask.findUnique({ where: { id: task.id } }),
      db.evidence.findMany({ where: { robotTaskId: task.id } }),
      db.costRecord.findMany({ where: { robotTaskId: task.id } }),
      db.learningLog.findMany({ where: { robotTaskId: task.id } }),
      db.robotEvolution.findMany({ where: { robotId: robot.id } }),
      db.sharedKnowledge.findMany({ where: { title: `Task learning: ${task.title}` } }),
      db.robot.findUnique({ where: { id: robot.id } }),
    ]);

    expect(result.workflow).toBe("COMPLETED");
    expect(completedTask?.status).toBe("COMPLETED");
    expect(evidence).toHaveLength(1);
    expect(costs).toHaveLength(1);
    expect(learning).toHaveLength(1);
    expect(evolutions).toHaveLength(1);
    expect(knowledge).toHaveLength(1);
    expect(updatedRobot?.experience).toBe(13);
  });
});
