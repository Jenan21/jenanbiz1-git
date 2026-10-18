export function parseArguments(args: string[]): { releaseId: string; manifest: string };
export function normalizeFeatures(value: unknown): {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { label: string; category: string; aliases?: string[]; layerId?: string; sourceId?: string; source?: string; name_ar?: string; name_en?: string };
    geometry: { type: string; coordinates: unknown };
  }>;
};
export function build(args: string[]): Promise<void>;
