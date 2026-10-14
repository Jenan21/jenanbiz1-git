/** Directives that are safe to enforce on every page today: they only restrict how the site can be framed and embedded. */
export const ENFORCED_CSP_DIRECTIVES = [
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  // the Studio PDF preview is an <object> pointing at a blob: URL
  "object-src 'self' blob:",
] as const;

export interface ContentSecurityPolicyOptions {
  nonce: string;
  /** Next's development tooling evaluates code, so the development policy has to allow it. */
  development?: boolean;
  /** `NEXT_PUBLIC_MAP_TILE_URL`: the map tile provider's origin is allowed to serve images. */
  mapTileUrl?: string | null;
  reportUri?: string;
}

function originOf(value: string | null | undefined) {
  if (!value) return null;
  try {
    // tile URLs carry `{z}/{x}/{y}` placeholders; only the origin matters
    return new URL(value.replace(/\{[^}]+\}/g, "0")).origin;
  } catch {
    return null;
  }
}

export function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * The full, nonce-based policy. The proxy sends it as `Content-Security-Policy` in production (an audit of every reachable
 * page, the PDF preview and the Visual DNA tool found no violations); `CSP_REPORT_ONLY=1` downgrades it to
 * `Content-Security-Policy-Report-Only`, which reports every violation without breaking a page.
 */
export function buildContentSecurityPolicy({
  nonce,
  development = false,
  mapTileUrl,
  reportUri = "/api/security/csp-report",
}: ContentSecurityPolicyOptions) {
  const images = ["'self'", "data:", "blob:", "https://*.tile.openstreetmap.org", originOf(mapTileUrl)].filter(Boolean);
  const scripts = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'wasm-unsafe-eval'", development ? "'unsafe-eval'" : null].filter(Boolean);
  return [
    "default-src 'self'",
    `script-src ${scripts.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${images.join(" ")}`,
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'self' blob:",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    ...ENFORCED_CSP_DIRECTIVES,
    `report-uri ${reportUri}`,
  ].join("; ");
}
