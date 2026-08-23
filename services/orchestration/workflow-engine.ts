export type WorkflowState = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export type WorkflowMission = {
  id: string;
  robotId: string;
  title: string;
  priority: number;
};

export type WorkflowExecution = WorkflowMission & {
  state: WorkflowState;
  startedAt?: string;
  completedAt?: string;
  error?: string;
};

export class WorkflowEngine {
  private readonly executions = new Map<string, WorkflowExecution>();

  schedule(mission: WorkflowMission) {
    if (this.executions.has(mission.id)) throw new Error(`Mission already scheduled: ${mission.id}`);
    const execution: WorkflowExecution = { ...mission, state: "QUEUED" };
    this.executions.set(mission.id, execution);
    return execution;
  }

  trackState(id: string) {
    return this.executions.get(id);
  }

  list() {
    return [...this.executions.values()].sort((a, b) => b.priority - a.priority);
  }

  async execute(id: string, handler: (mission: WorkflowMission) => Promise<void>) {
    const execution = this.executions.get(id);
    if (!execution) throw new Error(`Mission not found: ${id}`);
    execution.state = "RUNNING";
    execution.startedAt = new Date().toISOString();
    try {
      await handler(execution);
      execution.state = "COMPLETED";
      execution.completedAt = new Date().toISOString();
    } catch (error) {
      execution.state = "FAILED";
      execution.error = error instanceof Error ? error.message : "Unknown workflow failure";
      throw error;
    }
    return execution;
  }
}
