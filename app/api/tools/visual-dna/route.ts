import { NextResponse } from 'next/server';
import { extractPaletteFromBase64 } from '../../../../services/visual-dna/visual-dna.service';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageData } = body || {};
    if (!imageData) {
      return NextResponse.json({ error: 'imageData is required' }, { status: 400 });
    }

    const palette = await extractPaletteFromBase64(imageData);
    return NextResponse.json({ palette });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('visual-dna POST error:', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}

export const GET = () => NextResponse.json({ ok: true });
