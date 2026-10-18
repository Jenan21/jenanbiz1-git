export const THEMES: readonly string[];
export const SOURCE_LAYERS: readonly string[];
export const STYLE_FONTS: Record<"regular" | "medium" | "italic", string>;
export function labelField(language?: string, detailed?: boolean): unknown[];
export function buildStyle(input: { theme?: string; language?: string; releaseBase: string; tileFilename: string }): {
  version: 8; name: string; metadata: Record<string, string>; glyphs: string;
  sources: Record<string, { type: string; url: string; attribution: string }>;
  layers: Array<Record<string, unknown> & { id: string; type: string }>;
};
export function styleLayerGroups(style: { layers: Array<{ id: string }> }): Record<string, string[]>;
