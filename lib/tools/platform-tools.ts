import { z } from "zod";
import { platformToolRegistry } from "@/lib/tools/tool-registry";

const taskBriefInput = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).optional(),
});

export const TASK_BRIEF_TOOL_ID = "task-brief";

export function registerPlatformTools() {
  if (platformToolRegistry.get(TASK_BRIEF_TOOL_ID)) return platformToolRegistry;

  platformToolRegistry.register({
    id: TASK_BRIEF_TOOL_ID,
    name: "Task brief compiler",
    description: "Creates a normalized, traceable brief for a robot task.",
    input: taskBriefInput,
    execute: ({ title, description }) => ({
      brief: [title, description].filter(Boolean).join("\n\n"),
      category: "general" as const,
    }),
  });

  return platformToolRegistry;
}
