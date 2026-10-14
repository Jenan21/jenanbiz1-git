import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const GATE_COOKIE = "jenan_gate";
export const GATE_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;
/** Wrong guesses allowed per client in one window before the gate stops evaluating credentials. */
export const GATE_FAILURE_LIMIT = 10;
export const GATE_FAILURE_WINDOW_MS = 10 * 60_000;

// A keyed digest with a secret that exists only in this process: it brings both sides of a comparison to the same
// length without giving an observer anything to test guesses against.
const comparisonKey = randomBytes(32);
const digest = (value: string) => createHmac("sha256", comparisonKey).update(value).digest();

/** Compares two strings in constant time, whatever their lengths. */
export function safeEqual(left: string, right: string) {
  return timingSafeEqual(digest(left), digest(right));
}

export function expectedAuthorization(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

export function credentialsMatch(header: string | null | undefined, username: string, password: string) {
  return typeof header === "string" && safeEqual(header, expectedAuthorization(username, password));
}

/** Constant-time check of an `Authorization: Bearer <token>` header against the expected token. */
export function credentialsMatchToken(header: string | null | undefined, token: string) {
  return typeof header === "string" && safeEqual(header, ["Bearer", token].join(" "));
}

/**
 * Key for the gate cookie. It is derived from the credentials with scrypt, so rotating the password revokes every
 * cookie at once and a cookie someone has seen cannot be used to guess the password offline at hashing speed.
 * The derivation costs tens of milliseconds, so the result is kept for the life of the process.
 */
const derivedKeys = new Map<string, Buffer>();
export function gateKey(username: string, password: string) {
  const id = `${username}\u0000${password}`;
  const known = derivedKeys.get(id);
  if (known) return known;
  const key = scryptSync(id, "jenan-gate:v2", 32, { N: 16_384, r: 8, p: 1 });
  if (derivedKeys.size >= 8) derivedKeys.clear();
  derivedKeys.set(id, key);
  return key;
}

function sign(key: Buffer, issuedAtSeconds: number) {
  return createHmac("sha256", key).update(String(issuedAtSeconds)).digest("hex");
}

export function signGateCookie(key: Buffer, nowMs: number) {
  const issuedAt = Math.floor(nowMs / 1000);
  return `${issuedAt}.${sign(key, issuedAt)}`;
}

export function verifyGateCookie(key: Buffer, value: string | undefined, nowMs: number) {
  if (!value) return false;
  const match = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(value);
  if (!match) return false;
  const issuedAt = Number(match[1]);
  const age = Math.floor(nowMs / 1000) - issuedAt;
  if (age < 0 || age > GATE_COOKIE_MAX_AGE_SECONDS) return false;
  return safeEqual(match[2], sign(key, issuedAt));
}

/** The client address as the hosting platform reports it; Vercel overwrites these headers, so they cannot be spoofed there. */
export function clientAddress(headers: Pick<Headers, "get">) {
  const forwarded = headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "unknown";
}

export function failureKey(address: string) {
  return `gate:fail:${createHash("sha256").update(address).digest("hex").slice(0, 32)}`;
}
