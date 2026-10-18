export type OpenProvenance = {
  source: string; organization: string; url: string; sourceDate: string;
  importedAt: string; license: string; attribution: string;
};
export const OPEN_BOUNDARY_NOTICE: string;
export const OSM_ATTRIBUTION: string;
export function validateProvenance(value: unknown): OpenProvenance;
export function validateCoverage(value: unknown): Record<string, unknown>;
export function importedFeature(feature: unknown, source: string, layerId: string): {
  type: "Feature"; properties: {
    label: string; category: string; layerId: string; source: string; sourceId: string;
    aliases: string[]; name_ar?: string; name_en?: string;
  }; geometry: unknown;
} | null;
