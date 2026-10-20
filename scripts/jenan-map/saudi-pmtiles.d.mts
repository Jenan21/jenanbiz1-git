export const TOOL_VERSION: string;
export const TOOL_ARCHIVES: Record<string, { file: string; sha256: string; binary: string }>;
export const SOURCE: { name: string; baseUrl: string; license: string; licenseUrl: string; attribution: string; ownership: string };
export const SAUDI_BBOX: number[];
export function buildUrl(build: string): string;
export function parseArgs(argv: string[]): { maxzoom: number; build: string | null; out: string; dryRun: boolean };
export function toolKey(platform?: string, arch?: string): string;
export function buildManifest(input: {
  build: string; maxzoom: number; sha256: string; byteSize: number; metadata: Record<string, unknown>;
  tool: Record<string, unknown>; downloadedAt: string;
}): Record<string, unknown>;
export function main(argv: string[]): Promise<void>;
