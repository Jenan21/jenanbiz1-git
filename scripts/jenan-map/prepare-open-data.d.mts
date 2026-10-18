export function boundaryLicense(metadata: { boundaryLicense?: string }): string;
export function boundaryAttribution(metadata: { boundaryLicense?: string; boundarySource?: string }): string;
export function acquire(root: string, pinnedBoundariesOnly?: boolean): Promise<unknown>;
export function prepare(config: unknown, root: string, releaseId: string): Promise<void>;
export function stripRecordSeparator(line: string): string;
export function resolveTool(name: string, env?: Record<string, string | undefined>, exists?: (candidate: string) => boolean): string;
export function retainedMetadata(metadata: unknown): Record<string, string | number>;
