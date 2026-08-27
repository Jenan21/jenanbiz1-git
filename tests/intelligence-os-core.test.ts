import { describe, expect, it } from "vitest";
import { ToolRegistry } from "@/lib/tools/tool-registry";
import { WorkflowEngine } from "@/services/orchestration/workflow-engine";
import { ModelGateway } from "@/lib/ai/model-gateway";
import { z } from "zod";

describe("Jenan intelligence OS core", () => {
  it("validates and executes registered tools", async () => {
    const registry = new ToolRegistry();
    registry.register({ id: "sum", name: "Sum", description: "Adds values", input: z.object({ a: z.number(), b: z.number() }), execute: ({ a, b }) => a + b });
    await expect(registry.execute("sum", { a: 2, b: 3 })).resolves.toBe(5);
    await expect(registry.execute("sum", { a: "2", b: 3 })).rejects.toThrow("Invalid input");
  });

  it("orchestrates a mission through a traceable lifecycle", async () => {
    const engine = new WorkflowEngine();
    engine.schedule({ id: "m1", robotId: "r1", title: "Design system", priority: 10 });
    await engine.execute("m1", async () => undefined);
    expect(engine.trackState("m1")?.state).toBe("COMPLETED");
  });

  it("selects a registered provider and remains safe without credentials", async () => {
    const gateway = new ModelGateway();
    const response = await gateway.complete({ taskType: "design", prompt: "Create a dashboard" });
    expect(response.provider).toBe("fallback");
    expect(response.text).toContain("Create a dashboard");
  });
});
