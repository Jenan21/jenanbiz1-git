import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { extractPaletteFromBase64 } from '../../services/visual-dna/visual-dna.service';

const imgPath = path.resolve(process.cwd(), 'public/assets/jenan-biz-logo.png');
const buf = fs.readFileSync(imgPath);
const base64 = `data:image/png;base64,${buf.toString('base64')}`;

describe('visual-dna service', () => {
  it('extracts a non-empty palette from logo', async () => {
    const palette = await extractPaletteFromBase64(base64);
    expect(Array.isArray(palette)).toBe(true);
    expect(palette.length).toBeGreaterThan(0);
  }, 20000);
});
