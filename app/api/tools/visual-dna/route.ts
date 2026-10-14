import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { hasValidOrigin } from '@/lib/auth/request';
import { getCurrentUser } from '@/lib/auth/session';
import { enforceRouteRateLimit } from '@/lib/rate-limit/route-rate-limit';
import { extractPaletteFromBase64 } from '../../../../services/visual-dna/visual-dna.service';

// Small in-memory cache to avoid re-processing identical images repeatedly (keyed by the full content hash).
const PALETTE_CACHE_TTL_MS = 10 * 60 * 1000;
const PALETTE_CACHE_MAX_ENTRIES = 200;
const paletteCache: Map<string, { palette: string[]; expiresAt: number }> = new Map();

const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const EXTRACT_TIMEOUT_MS = 10_000;

function nowMs() {
  return Date.now();
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

export async function POST(req: NextRequest) {
  try {
    if (!hasValidOrigin(req)) return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
    // Decoding an image costs real CPU, so only signed-in users may ask, within a shared per-user budget.
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
    const limited = await enforceRouteRateLimit(req, { scope: 'visual-dna', userId: user.id, limit: 20, windowMs: 60_000 });
    if (limited) return limited;
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

    // Build the cache key from the full content hash and check the TTL cache.
    const cacheKey = `${mime}:${createHash('sha256').update(b64).digest('hex')}`;
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
