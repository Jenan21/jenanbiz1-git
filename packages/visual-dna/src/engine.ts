/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
// Buffer is global in Node; no need to import as type-only

export async function extractPaletteFromBase64(imageData: string, maxColors = 6): Promise<string[]> {
  try {
    const base64 = imageData.includes('base64,') ? imageData.split('base64,')[1] : imageData;
    const buffer = Buffer.from(base64, 'base64');

    // Try node-vibrant first (Node entry)
    try {
      // dynamic import to avoid bundler issues
      const VibrantModule = (await import('node-vibrant/node')) as unknown;
      const shapes: unknown[] = [
        (VibrantModule as any)?.default ?? null,
        (VibrantModule as any)?.Vibrant ?? null,
        VibrantModule ?? null,
      ];
      let palette: unknown = null;
      for (const shape of shapes) {
        if (!shape) continue;
        try {
          // Use runtime checks; types are dynamic across bundlers
          const s: unknown = shape;
          if (s && typeof (s as any).from === 'function') {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            palette = await (s as any).from(buffer).maxColorCount(maxColors).getPalette();
            break;
          }
          if ((s as any).Vibrant && typeof (s as any).Vibrant.from === 'function') {
            palette = await (s as any).Vibrant.from(buffer).maxColorCount(maxColors).getPalette();
            break;
          }
          if (typeof s === 'function') {
            const instance = new (s as any)(buffer);
            if (instance && typeof instance.getPalette === 'function') {
              palette = await instance.getPalette();
              break;
            }
          }
        } catch {
          // try next shape
        }
      }

      type Swatch = { getHex?: () => string };
      const swatches = palette ? (Object.values(palette) as unknown[]) : [];
      const colors = swatches
        .filter((swatch): swatch is Swatch => Boolean(swatch) && typeof (swatch as Swatch).getHex === 'function')
        .map((swatch) => (swatch.getHex as () => string)());

      if (colors && colors.length) return colors;
    } catch {
      // fallthrough to sharp-based quantizer
    }

    // sharp fallback
    try {
      const sharp = (await import('sharp')).default ?? (await import('sharp'));
      const small = await sharp(buffer).resize(128, 128, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
      const smallObj = small as unknown as { data: Buffer; info: { channels?: number } };
      const { data, info } = smallObj;
      const counts: Record<string, number> = {};
      const stride = info.channels || 3;
      for (let i = 0; i < data.length; i += stride) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const rq = Math.round(r / 16) * 16;
        const gq = Math.round(g / 16) * 16;
        const bq = Math.round(b / 16) * 16;
        const hex = '#' + [rq, gq, bq].map((v) => v.toString(16).padStart(2, '0')).join('');
        counts[hex] = (counts[hex] || 0) + 1;
      }
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, maxColors).map((e) => e[0]);
      return sorted;
    } catch {
      return [];
    }
  } catch {
    return [];
  }
}

export default { extractPaletteFromBase64 };
