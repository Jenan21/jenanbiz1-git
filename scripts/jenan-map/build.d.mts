export function parseArguments(args: string[]): { releaseId: string; manifest: string };
export function normalizeFeatures(value: unknown): {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { label: string; category: string };
    geometry: { type: string; coordinates: unknown };
  }>;
};
export function build(args: string[]): Promise<void>;
