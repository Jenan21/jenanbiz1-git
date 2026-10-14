import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { MAX_INPUT_PIXELS, extractPaletteFromBase64, sniffImageType } from '../src/engine';

const dataUri = (buffer: Buffer, mime = 'image/png') => `data:${mime};base64,${buffer.toString('base64')}`;
const solid = (size: number) =>
  sharp({ create: { width: size, height: size, channels: 3, background: '#2f6df6' } }).png().toBuffer();

describe('visual-dna engine', () => {
  it('extracts palette from logo', async () => {
    const imgPath = path.resolve(process.cwd(), 'public/assets/jenan-pro-logo.jpg');
    const buf = fs.readFileSync(imgPath);
    const base64 = `data:image/png;base64,${buf.toString('base64')}`;
    const palette = await extractPaletteFromBase64(base64);
    expect(Array.isArray(palette)).toBe(true);
    expect(palette.length).toBeGreaterThan(0);
  }, 20000);

  it('recognises images by their first bytes, not by the declared type', async () => {
    expect(sniffImageType(await solid(4))).toBe('png');
    expect(sniffImageType(await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } }).jpeg().toBuffer())).toBe('jpeg');
    expect(sniffImageType(await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } }).webp().toBuffer())).toBe('webp');
    for (const notImage of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), Buffer.from('%PDF-1.7'), Buffer.from('GIF89a'), Buffer.alloc(0)]) {
      expect(sniffImageType(notImage)).toBeNull();
    }
  });

  it('refuses bytes that are not an image even when declared as one', async () => {
    expect(await extractPaletteFromBase64(dataUri(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')))).toEqual([]);
    expect(await extractPaletteFromBase64(dataUri(Buffer.from('%PDF-1.7 not an image')))).toEqual([]);
  });

  it('refuses images with more pixels than the ceiling instead of decoding them', async () => {
    const image = dataUri(await solid(20)); // 400 pixels
    expect((await extractPaletteFromBase64(image, 6, { maxPixels: 10_000 })).length).toBeGreaterThan(0);
    expect(await extractPaletteFromBase64(image, 6, { maxPixels: 100 })).toEqual([]);
    expect(MAX_INPUT_PIXELS).toBeLessThanOrEqual(25_000_000);
  });
});
