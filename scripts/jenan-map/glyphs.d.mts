export const GLYPH_SOURCE: Record<string, string>;
export const FONT_STACKS: readonly string[];
export const GLYPH_RANGES: readonly string[];
export function glyphUrl(stack: string, range: string): string;
export function glyphName(stack: string, range: string): string;
export function main(): Promise<unknown>;
