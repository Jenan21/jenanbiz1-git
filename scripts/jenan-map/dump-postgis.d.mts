export const DUMP_FORMAT: string;
export const DUMP_SCHEMA: string;
export class DumpError extends Error {
  readonly code: string;
  constructor(code: string);
}
export function connectionEnvironment(databaseUrl: string | undefined): Record<string, string>;
export function dumpName(now: Date): string;
export type DumpManifest = {
  format: string; createdAt: string; schema: string; file: string; bytes: number; sha256: string; tool: string; tablesWithData: string[];
};
export function dumpPostgis(options?: {
  env?: Record<string, string | undefined>;
  spawn?: (command: string, args: string[], options: Record<string, unknown>) => import("node:child_process").ChildProcess;
  now?: Date;
}): Promise<DumpManifest>;
