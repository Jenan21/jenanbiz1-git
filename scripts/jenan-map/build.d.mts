export function parseArguments(args: string[]): { releaseId: string; manifest: string };
export function normalizeFeatures(value: unknown): {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { label: string; category: string };
    geometry: { type: string; coordinates: unknown };
  }>;
};
export function validateLayerBindings(style: unknown, bindings: unknown): Array<{ id: string; styleLayerIds: string[] }>;
export function validPmtilesHeader(header: Buffer, byteSize: number): boolean;
export function bindStyle(style: Record<string, unknown>, releaseId: string, pmtilesFilename: string, pmtilesArtifactId: string, glyphAssets: unknown[]): Record<string, unknown>;
export function build(args: string[]): Promise<void>;
