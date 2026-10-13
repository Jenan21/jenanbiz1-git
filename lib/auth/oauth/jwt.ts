import {
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  timingSafeEqual,
  verify as cryptoVerify,
  type JsonWebKey,
} from "node:crypto";

export type OAuthTokenErrorCode =
  | "MALFORMED_TOKEN"
  | "UNSUPPORTED_ALGORITHM"
  | "UNKNOWN_KEY"
  | "BAD_SIGNATURE"
  | "BAD_ISSUER"
  | "BAD_AUDIENCE"
  | "EXPIRED"
  | "NOT_YET_VALID"
  | "BAD_NONCE"
  | "KEYS_UNAVAILABLE";

export class OAuthTokenError extends Error {
  constructor(public readonly code: OAuthTokenErrorCode) {
    super(code);
    this.name = "OAuthTokenError";
  }
}

type Fetcher = typeof fetch;
type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

export type IdTokenClaims = Record<string, unknown> & {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat?: number;
  nonce?: string;
};

const CLOCK_SKEW_SECONDS = 120;
const JWKS_TTL_MS = 60 * 60 * 1000;
const jwksCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();

export function clearJwksCache() {
  jwksCache.clear();
}

function decodeSegment<T>(segment: string): T {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
  } catch {
    throw new OAuthTokenError("MALFORMED_TOKEN");
  }
}

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function loadKeys(uri: string, fetcher: Fetcher, force: boolean, now: number) {
  const cached = jwksCache.get(uri);
  if (cached && !force && now - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;
  try {
    const response = await fetcher(uri, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error("jwks");
    const body = (await response.json()) as { keys?: Jwk[] };
    if (!Array.isArray(body.keys)) throw new Error("jwks");
    jwksCache.set(uri, { keys: body.keys, fetchedAt: now });
    return body.keys;
  } catch {
    throw new OAuthTokenError("KEYS_UNAVAILABLE");
  }
}

export interface VerifyIdTokenOptions {
  jwksUri: string;
  issuers: readonly string[];
  audience: string;
  nonce: string;
  fetcher?: Fetcher;
  /** Epoch milliseconds; injectable for tests. */
  now?: number;
}

/** Verifies an RS256 OpenID Connect ID token against the provider's published keys. */
export async function verifyIdToken(token: string, options: VerifyIdTokenOptions): Promise<IdTokenClaims> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) throw new OAuthTokenError("MALFORMED_TOKEN");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeSegment<{ alg?: string; kid?: string }>(encodedHeader);
  // Only RS256 is issued by Google and Apple; anything else (none, HS256, ...) is refused outright.
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new OAuthTokenError("UNSUPPORTED_ALGORITHM");

  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now();
  let keys = await loadKeys(options.jwksUri, fetcher, false, now);
  let jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    keys = await loadKeys(options.jwksUri, fetcher, true, now);
    jwk = keys.find((key) => key.kid === header.kid);
  }
  if (!jwk || jwk.kty !== "RSA") throw new OAuthTokenError("UNKNOWN_KEY");

  let valid = false;
  try {
    valid = cryptoVerify(
      "RSA-SHA256",
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      createPublicKey({ key: jwk, format: "jwk" }),
      Buffer.from(encodedSignature, "base64url"),
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new OAuthTokenError("BAD_SIGNATURE");

  const claims = decodeSegment<Partial<IdTokenClaims>>(encodedPayload);
  if (typeof claims.sub !== "string" || claims.sub.length === 0) throw new OAuthTokenError("MALFORMED_TOKEN");
  if (typeof claims.iss !== "string" || !options.issuers.includes(claims.iss)) throw new OAuthTokenError("BAD_ISSUER");
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(options.audience)) throw new OAuthTokenError("BAD_AUDIENCE");
  const seconds = Math.floor(now / 1000);
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS < seconds) throw new OAuthTokenError("EXPIRED");
  if (typeof claims.iat === "number" && claims.iat - CLOCK_SKEW_SECONDS > seconds) throw new OAuthTokenError("NOT_YET_VALID");
  if (typeof claims.nonce !== "string" || !constantTimeEqual(claims.nonce, options.nonce)) throw new OAuthTokenError("BAD_NONCE");
  return claims as IdTokenClaims;
}

export interface AppleClientSecretInput {
  teamId: string;
  keyId: string;
  clientId: string;
  privateKey: string;
  now?: number;
}

/** Apple authenticates the web client with a short-lived ES256 JWT signed by the account's .p8 key. */
export function createAppleClientSecret(input: AppleClientSecretInput) {
  const issuedAt = Math.floor((input.now ?? Date.now()) / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const signingInput = `${encode({ alg: "ES256", kid: input.keyId, typ: "JWT" })}.${encode({
    iss: input.teamId,
    iat: issuedAt,
    exp: issuedAt + 300,
    aud: "https://appleid.apple.com",
    sub: input.clientId,
  })}`;
  const signature = cryptoSign("sha256", Buffer.from(signingInput), {
    key: createPrivateKey(input.privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${signature.toString("base64url")}`;
}
