import { NextResponse } from 'next/server';
import { extractPaletteFromBase64 } from '../../../../services/visual-dna/visual-dna.service';

// Simple in-memory rate limiter per IP (suitable for dev / small deploys). Replace with redis for prod.
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 60; // requests per window
const rateMap: Map<string, { count: number; windowStart: number }> = new Map();
const RATE_MAP_MAX_ENTRIES = 10_000;

// Small in-memory cache to avoid re-processing identical images repeatedly.
const PALETTE_CACHE_TTL_MS = 10 * 60 * 1000;
const PALETTE_CACHE_MAX_ENTRIES = 200;
const paletteCache: Map<string, { palette: string[]; expiresAt: number }> = new Map();

const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const EXTRACT_TIMEOUT_MS = 10_000;

function nowMs() {
  return Date.now();
}

function pruneRateMap(now: number) {
  if (rateMap.size < RATE_MAP_MAX_ENTRIES) return;
  for (const [key, entry] of rateMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) rateMap.delete(key);
    if (rateMap.size < RATE_MAP_MAX_ENTRIES) break;
  }
}

function prunePaletteCache(now: number) {
  for (const [key, entry] of paletteCache) {
    if (entry.expiresAt <= now) paletteCache.delete(key);
  }
  while (paletteCache.size > PALETTE_CACHE_MAX_ENTRIES) {
    const first = paletteCache.keys().next();
    if (first.done) break;
    paletteCache.delete(first.value);
  }
}

function getClientIp(req: Request) {
  return (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown');
}

function tooManyRequests(ip: string) {
  const now = nowMs();
  pruneRateMap(now);
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

    // Fast reject by Content-Length before reading JSON body.
    const contentLength = req.headers.get('content-length');
    if (contentLength) {
      const bytes = Number(contentLength);
      if (Number.isFinite(bytes) && bytes > MAX_PAYLOAD_BYTES * 1.5) {
        return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
      }
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

    // Build lightweight cache key from exact payload string and check TTL cache.
    const cacheKey = `${mime}:${b64.length}:${b64.slice(0, 64)}:${b64.slice(-64)}`;
    const now = nowMs();
    prunePaletteCache(now);
    const cached = paletteCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return NextResponse.json({ palette: cached.palette, cache: 'hit' });
    }

    // Run extraction with timeout and generic error messages
    let palette: string[] = [];
    try {
      palette = await timeoutPromise(extractPaletteFromBase64(imageData), EXTRACT_TIMEOUT_MS);
    } catch {
      return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
    }

    paletteCache.set(cacheKey, {
      palette,
      expiresAt: now + PALETTE_CACHE_TTL_MS,
    });

    return NextResponse.json({ palette, cache: 'miss' });
  } catch {
    // Do not leak internal error details to clients
    console.error('visual-dna POST error (internal)');
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}

export const GET = () => NextResponse.json({ ok: true });
