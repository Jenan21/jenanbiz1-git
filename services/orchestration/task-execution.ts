import { db } from "@/lib/db";
import { createConfiguredModelGateway, type ModelRequest } from "@/lib/ai/model-gateway";
import { registerPlatformTools, TASK_BRIEF_TOOL_ID } from "@/lib/tools/platform-tools";
import { WorkflowEngine } from "@/services/orchestration/workflow-engine";

const workflowEngine = new WorkflowEngine();
const modelGateway = createConfiguredModelGateway();

type TaskExecutionInput = {
  taskId: string;
  taskType: ModelRequest["taskType"];
};

export async function executeRobotTask({ taskId, taskType }: TaskExecutionInput) {
  const task = await db.robotTask.findUnique({
    where: { id: taskId },
    include: { robot: true, mission: true },
  });
  if (!task) throw new Error("Robot task not found");
  if (task.status === "COMPLETED" || task.status === "CANCELLED") {
    throw new Error("Robot task is not executable");
  }

  const workflow = workflowEngine.trackState(task.id) ?? workflowEngine.schedule({
    id: task.id,
    robotId: task.robotId,
    title: task.title,
    priority: task.priority === "HIGH" ? 3 : task.priority === "LOW" ? 1 : 2,
  });

  const execution = await workflowEngine.execute(workflow.id, async () => {
    const tools = registerPlatformTools();
    const toolResult = await tools.execute(TASK_BRIEF_TOOL_ID, {
      title: task.title,
      description: task.description ?? undefined,
    }) as { brief: string; category: ModelRequest["taskType"] };

    const response = await modelGateway.complete({
      taskType,
      prompt: toolResult.brief,
    });
    const priorGeneration = await db.robotEvolution.count({ where: { robotId: task.robotId } });

    await db.$transaction([
      db.robotTask.update({
        where: { id: task.id },
        data: { status: "COMPLETED" },
      }),
      db.evidence.create({
        data: {
          robotId: task.robotId,
          robotTaskId: task.id,
          missionId: task.missionId,
          type: "MODEL_OUTPUT",
          description: response.text,
          metadata: { provider: response.provider, model: response.model, workflowState: "COMPLETED" },
        },
      }),
      db.costRecord.create({
        data: {
          robotId: task.robotId,
          robotTaskId: task.id,
          missionId: task.missionId,
          provider: response.provider,
          model: response.model,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          computeCostMinor: 0,
          actualDuration: response.latencyMs,
        },
      }),
      db.modelExecution.create({
        data: {
          robotId: task.robotId,
          provider: response.provider,
          model: response.model,
          taskType,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          latencyMs: response.latencyMs,
          success: true,
        },
      }),
      db.learningLog.create({
        data: {
          robotId: task.robotId,
          robotTaskId: task.id,
          missionId: task.missionId,
          signal: "TASK_COMPLETED",
          scoreBefore: task.robot.experience,
          scoreAfter: task.robot.experience + 1,
          feedback: "Execution evidence recorded for shared learning.",
        },
      }),
      db.robotEvolution.create({
        data: {
          robotId: task.robotId,
          generation: priorGeneration + 1,
          experienceDelta: 1,
          reason: "Completed an orchestrated robot task.",
        },
      }),
      db.robot.update({
        where: { id: task.robotId },
        data: { experience: { increment: 1 } },
      }),
      db.sharedKnowledge.create({
        data: {
          title: `Task learning: ${task.title}`,
          content: response.text,
          source: `${response.provider}:${response.model}`,
          confidence: task.robot.intelligence,
          missionId: task.missionId,
        },
      }),
    ]);
  });

  return {
    taskId: task.id,
    robotId: task.robotId,
    workflow: execution.state,
  };
}
