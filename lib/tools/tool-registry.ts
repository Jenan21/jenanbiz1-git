import { z } from "zod";

export type RegisteredTool<Input, Output> = {
  id: string;
  name: string;
  description: string;
  input: z.ZodType<Input>;
  execute: (input: Input) => Promise<Output> | Output;
};

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool<unknown, unknown>>();

  register<Input, Output>(tool: RegisteredTool<Input, Output>) {
    if (this.tools.has(tool.id)) throw new Error(`Tool already registered: ${tool.id}`);
    this.tools.set(tool.id, tool as RegisteredTool<unknown, unknown>);
    return this;
  }

  get(id: string) {
    return this.tools.get(id);
  }

  list() {
    return [...this.tools.values()].map(({ id, name, description }) => ({ id, name, description }));
  }

  async execute(id: string, input: unknown) {
    const tool = this.tools.get(id);
    if (!tool) throw new Error(`Tool not found: ${id}`);
    const parsed = tool.input.safeParse(input);
    if (!parsed.success) throw new Error(`Invalid input for tool: ${id}`);
    return tool.execute(parsed.data);
  }
}

export const platformToolRegistry = new ToolRegistry();
