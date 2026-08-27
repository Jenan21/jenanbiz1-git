import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { executeRobotTask } from "@/services/orchestration/task-execution";

const suffix = crypto.randomUUID();
let robotId: string | undefined;
let missionId: string | undefined;
let taskId: string | undefined;

afterAll(async () => {
  if (taskId) {
    await Promise.all([
      db.evidence.deleteMany({ where: { robotTaskId: taskId } }),
      db.costRecord.deleteMany({ where: { robotTaskId: taskId } }),
      db.learningLog.deleteMany({ where: { robotTaskId: taskId } }),
    ]);
  }
  if (robotId) {
    await Promise.all([
      db.modelExecution.deleteMany({ where: { robotId } }),
      db.robotEvolution.deleteMany({ where: { robotId } }),
    ]);
  }
  if (missionId) await db.sharedKnowledge.deleteMany({ where: { missionId } });
  if (taskId) await db.robotTask.delete({ where: { id: taskId } });
  if (missionId) await db.mission.delete({ where: { id: missionId } });
  if (robotId) await db.robot.delete({ where: { id: robotId } });
  await db.$disconnect();
});

describe("LIVE-ACCEPTANCE-001", () => {
  it("executes a mission task through real OpenAI and persists retrievable evidence", async () => {
    if (!process.env.OPENAI_API_KEY?.trim()) {
      throw new Error("OPENAI_API_KEY is required for LIVE-ACCEPTANCE-001");
    }

    const robot = await db.robot.create({
      data: {
        name: `Live acceptance robot ${suffix}`,
        slug: `live-acceptance-${suffix}`,
        intelligence: 95,
        skill: 95,
        experience: 1,
        status: "ACTIVE",
        isVisible: false,
      },
    });
    robotId = robot.id;

    const mission = await db.mission.create({
      data: {
        name: `Live acceptance mission ${suffix}`,
        description: "Return a concise operational confirmation for this real acceptance run.",
        status: "ACTIVE",
        requiredIntelligence: 90,
        assignedRobots: { connect: { id: robot.id } },
      },
    });
    missionId = mission.id;

    const task = await db.robotTask.create({
      data: {
        robotId: robot.id,
        missionId: mission.id,
        title: `Live OpenAI execution ${suffix}`,
        description: "Respond with a brief confirmation that this is a live acceptance execution.",
        status: "ACTIVE",
        priority: "HIGH",
      },
    });
    taskId = task.id;

    const execution = await executeRobotTask({ taskId: task.id, taskType: "general" });

    const [completedTask, modelRuns, costs, evidence, learning, knowledge, updatedRobot] = await Promise.all([
      db.robotTask.findUnique({ where: { id: task.id } }),
      db.modelExecution.findMany({ where: { robotId: robot.id } }),
      db.costRecord.findMany({ where: { robotTaskId: task.id } }),
      db.evidence.findMany({ where: { robotTaskId: task.id } }),
      db.learningLog.findMany({ where: { robotTaskId: task.id } }),
      db.sharedKnowledge.findMany({ where: { missionId: mission.id } }),
      db.robot.findUnique({ where: { id: robot.id } }),
    ]);

    expect(execution.workflow).toBe("COMPLETED");
    expect(completedTask?.status).toBe("COMPLETED");
    expect(modelRuns).toHaveLength(1);
    expect(modelRuns[0]).toMatchObject({ provider: "openai", taskType: "general", success: true });
    expect(modelRuns[0]?.inputTokens).toBeGreaterThan(0);
    expect(costs).toHaveLength(1);
    expect(costs[0]).toMatchObject({ provider: "openai", robotTaskId: task.id, missionId: mission.id });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ type: "MODEL_OUTPUT", robotTaskId: task.id, missionId: mission.id });
    expect(evidence[0]?.description.trim()).not.toBe("");
    expect(learning).toHaveLength(1);
    expect(learning[0]).toMatchObject({ signal: "TASK_COMPLETED", robotTaskId: task.id, missionId: mission.id });
    expect(knowledge).toHaveLength(1);
    expect(knowledge[0]).toMatchObject({ missionId: mission.id, content: evidence[0]?.description });
    expect(updatedRobot?.experience).toBe(2);
  });
});