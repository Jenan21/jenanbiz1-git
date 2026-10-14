// Buffer is global in Node; no need to import as type-only

/** Pixels `sharp` may decode for one image; its own default (about 268 million) lets a small file demand gigabytes. */
export const MAX_INPUT_PIXELS = 25_000_000;

/** Which supported image a buffer really is, judged by its first bytes rather than by what the sender declared. */
export function sniffImageType(buffer: Uint8Array): 'png' | 'jpeg' | 'webp' | null {
  const at = (offset: number, bytes: number[]) => bytes.every((byte, index) => buffer[offset + index] === byte);
  if (buffer.length >= 8 && at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (buffer.length >= 3 && at(0, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (buffer.length >= 12 && at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'webp';
  return null;
}

export async function extractPaletteFromBase64(
  imageData: string,
  maxColors = 6,
  limits: { maxPixels?: number } = {},
): Promise<string[]> {
  try {
    const base64 = imageData.includes('base64,') ? imageData.split('base64,')[1] : imageData;
    const buffer = Buffer.from(base64, 'base64');
    if (!sniffImageType(buffer)) return [];

    // sharp-based quantizer: no dependency on node-vibrant/jimp/file-type
    try {
      const sharp = (await import('sharp')).default ?? (await import('sharp'));
      const small = await sharp(buffer, { limitInputPixels: limits.maxPixels ?? MAX_INPUT_PIXELS, sequentialRead: true })
        .resize(128, 128, { fit: 'inside' })
        .raw()
        .toBuffer({ resolveWithObject: true });
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
