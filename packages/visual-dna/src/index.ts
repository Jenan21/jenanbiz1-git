export async function extractPaletteFromBase64(imageData: string): Promise<string[]> {
  // Thin wrapper that calls the monorepo service implementation at runtime.
  // Keeping a minimal API so callers can import the package while we migrate logic.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const svc = require('../../services/visual-dna/visual-dna.service');
  return svc.extractPaletteFromBase64(imageData);
}

export default { extractPaletteFromBase64 };
