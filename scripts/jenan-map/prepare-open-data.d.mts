export function boundaryLicense(metadata: { boundaryLicense?: string }): string;
export function boundaryAttribution(metadata: { boundaryLicense?: string; boundarySource?: string }): string;
export interface AcquiredBoundary {
  level: string; file: string; sha256: string;
  provenance: { source: string; organization: string; url: string; sourceDate: string; importedAt: string; license: string; attribution: string };
}
export function acquire(root: string, pinnedBoundariesOnly?: boolean): Promise<{ boundaries: AcquiredBoundary[]; osm?: unknown }>;
export function prepare(config: unknown, root: string, releaseId: string): Promise<void>;
export function stripRecordSeparator(line: string): string;
export function resolveTool(name: string, env?: Record<string, string | undefined>, exists?: (candidate: string) => boolean): string;
export function retainedMetadata(metadata: unknown): Record<string, string | number>;
export function reviewedUrl(value: unknown): URL;
export function upstreamText(value: unknown, label: string, max?: number): string;
export function upstreamBoundaryId(value: unknown, level: string): string;
