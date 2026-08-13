import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { extractPaletteFromBase64 } from '../src/engine';

describe('visual-dna engine', () => {
  it('extracts palette from logo', async () => {
    const imgPath = path.resolve(process.cwd(), 'public/assets/jenan-biz-logo.png');
    const buf = fs.readFileSync(imgPath);
    const base64 = `data:image/png;base64,${buf.toString('base64')}`;
    const palette = await extractPaletteFromBase64(base64);
    expect(Array.isArray(palette)).toBe(true);
    expect(palette.length).toBeGreaterThan(0);
  }, 20000);
});
