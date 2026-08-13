import { NextResponse } from 'next/server';
import { extractPaletteFromBase64 } from '../../../../services/visual-dna/visual-dna.service';

// Simple in-memory rate limiter per IP (suitable for dev / small deploys). Replace with redis for prod.
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 60; // requests per window
const rateMap: Map<string, { count: number; windowStart: number }> = new Map();

const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const EXTRACT_TIMEOUT_MS = 10_000;

function getClientIp(req: Request) {
  return (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown');
}

function tooManyRequests(ip: string) {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

function timeoutPromise<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }, (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    if (tooManyRequests(ip)) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }

    const body = await req.json();
    const { imageData } = body || {};
    if (!imageData || typeof imageData !== 'string') {
      return NextResponse.json({ error: 'imageData is required' }, { status: 400 });
    }

    // Validate data URI and size
    const prefixMatch = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (!prefixMatch) {
      return NextResponse.json({ error: 'invalid_image_data' }, { status: 400 });
    }
    const mime = prefixMatch[1];
    const b64 = prefixMatch[2];
    if (!ALLOWED_MIMES.has(mime)) {
      return NextResponse.json({ error: 'unsupported_image_type' }, { status: 415 });
    }
    // Approximate decoded size
    const approxBytes = Math.ceil((b64.length * 3) / 4);
    if (approxBytes > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    }

    // Run extraction with timeout and generic error messages
    let palette: string[] = [];
    try {
      palette = await timeoutPromise(extractPaletteFromBase64(imageData), EXTRACT_TIMEOUT_MS);
    } catch (e) {
      return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
    }

    return NextResponse.json({ palette });
  } catch (err) {
    // Do not leak internal error details to clients
    // eslint-disable-next-line no-console
    console.error('visual-dna POST error (internal)');
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}

export const GET = () => NextResponse.json({ ok: true });
