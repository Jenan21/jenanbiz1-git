import { describe, expect, it } from "vitest";
import { registerPlatformTools, TASK_BRIEF_TOOL_ID } from "@/lib/tools/platform-tools";
import { ModelGateway } from "@/lib/ai/model-gateway";

describe("robot task execution contracts", () => {
  it("produces a normalized brief through the registered platform tool", async () => {
    const output = await registerPlatformTools().execute(TASK_BRIEF_TOOL_ID, {
      title: "Design system review",
      description: "Check mobile accessibility.",
    });
    expect(output).toEqual({
      brief: "Design system review\n\nCheck mobile accessibility.",
      category: "general",
    });
  });

  it("uses the fallback model without any external provider credentials", async () => {
    const output = await new ModelGateway().complete({ taskType: "analysis", prompt: "Review this task" });
    expect(output.provider).toBe("fallback");
    expect(output.inputTokens).toBeGreaterThan(0);
  });
});
