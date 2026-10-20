export const SOURCE_NAME: string;
export const MAX_FEATURES: number;
export const CITY_WINDOWS: Record<string, [number, number, number, number]>;
export function tileOf(lon: number, lat: number, z: number): [number, number];
export function namesOf(properties: Record<string, unknown>): { label: string; aliases: string[]; name_ar?: string; name_en?: string } | null;
export function classify(layerName: string, properties: Record<string, unknown>): { layerId: string; category: string; rank: string } | null;
export function collectSearchFeatures(file: string, options?: { limit?: number; onProgress?: (done: number, total: number, found: number) => void }): Promise<Array<{
  type: "Feature"; id: string; properties: Record<string, unknown>; geometry: { type: "Point"; coordinates: [number, number] };
}>>;
