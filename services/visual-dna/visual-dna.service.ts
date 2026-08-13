export async function extractPaletteFromBase64(imageData: string, maxColors = 6): Promise<string[]> {
  try {
    const base64 = imageData.includes('base64,') ? imageData.split('base64,')[1] : imageData;
    const buffer = Buffer.from(base64, 'base64');

    // Dynamically import the Node build and try multiple shapes to be compatible with
    // different bundlers (Turbopack) and module formats.
    const VibrantModule = (await import('node-vibrant/node')) as any;
    // keep module shape info internal; avoid noisy logs in production

    const shapes = [VibrantModule?.default ?? null, VibrantModule?.Vibrant ?? null, VibrantModule ?? null];
    let palette: any = null;

    for (const shape of shapes) {
      if (!shape) continue;
      try {
        // shape.from(Buffer)
        if (typeof shape.from === 'function') {
          // eslint-disable-next-line no-await-in-loop
          palette = await shape.from(buffer).maxColorCount(maxColors).getPalette();
          break;
        }

        // shape.Vibrant.from(Buffer)
        if (shape.Vibrant && typeof shape.Vibrant.from === 'function') {
          // eslint-disable-next-line no-await-in-loop
          palette = await shape.Vibrant.from(buffer).maxColorCount(maxColors).getPalette();
          break;
        }

        // constructor instance
        if (typeof shape === 'function') {
          const instance = new shape(buffer);
          if (typeof instance.getPalette === 'function') {
            // eslint-disable-next-line no-await-in-loop
            palette = await instance.getPalette();
            break;
          }
        }
      } catch (e) {
        // try next shape
        // eslint-disable-next-line no-console
        console.warn('shape attempt failed:', e && e.message);
      }
    }

    // don't log palette in normal operation
    const colors = (palette && Object.values(palette))
      .filter((swatch: any) => Boolean(swatch) && typeof swatch.getHex === 'function')
      .map((swatch: any) => swatch.getHex());

    // If Vibrant failed to produce colors, fallback to a simple sharp-based quantizer
    if (!colors || colors.length === 0) {
      try {
        // lazy import sharp to avoid startup cost
        const sharp = (await import('sharp')).default ?? (await import('sharp'));
        const small = await sharp(buffer).resize(64, 64, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
        const { data, info } = small as any;
        const counts: Record<string, number> = {};
        const stride = info.channels || 3;
        for (let i = 0; i < data.length; i += stride) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // reduce precision to reduce unique colors (binning)
          const rq = Math.round(r / 16) * 16;
          const gq = Math.round(g / 16) * 16;
          const bq = Math.round(b / 16) * 16;
          const hex = '#' + [rq, gq, bq].map((v) => v.toString(16).padStart(2, '0')).join('');
          counts[hex] = (counts[hex] || 0) + 1;
        }

        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, maxColors).map((e) => e[0]);
        return sorted;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('sharp fallback failed:', e && e.message);
      }
    }

    return colors;
  } catch (err) {
    // Fallback: return empty palette and log error
    // Caller should handle empty result gracefully.
    // eslint-disable-next-line no-console
    console.error('extractPaletteFromBase64 error:', err);
    return [];
  }
}

export default { extractPaletteFromBase64 };
