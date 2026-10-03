// Buffer is global in Node; no need to import as type-only

export async function extractPaletteFromBase64(imageData: string, maxColors = 6): Promise<string[]> {
  try {
    const base64 = imageData.includes('base64,') ? imageData.split('base64,')[1] : imageData;
    const buffer = Buffer.from(base64, 'base64');

    // sharp-based quantizer: no dependency on node-vibrant/jimp/file-type
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

const visualDNAEngine = { extractPaletteFromBase64 };
export default visualDNAEngine;
