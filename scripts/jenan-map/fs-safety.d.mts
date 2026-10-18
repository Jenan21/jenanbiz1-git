export const NO_FOLLOW: number;
export function openNoFollow(target: string, flags: number, mode?: number): Promise<import("node:fs/promises").FileHandle>;
export function isPrivateDirectory(directory: string, env?: Record<string, string | undefined>, platform?: string): Promise<boolean>;
