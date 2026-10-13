import { createHmac, timingSafeEqual } from "node:crypto";
import type { OAuthEntryPoint, OAuthProviderId } from "@/lib/auth/oauth/shared";

export const OAUTH_COOKIE = "jenan_oauth";
export const OAUTH_TRANSACTION_MAX_AGE_SECONDS = 600;

/** What the browser must present back on the callback: binds the redirect to the browser that started it. */
export interface OAuthTransaction {
  provider: OAuthProviderId;
  state: string;
  nonce: string;
  /** PKCE verifier (Google). Empty for providers without PKCE. */
  verifier: string;
  from: OAuthEntryPoint;
  next: string | null;
  locale: "ar" | "en";
  /** Epoch milliseconds. */
  issuedAt: number;
}

function key(secret: string) {
  return createHmac("sha256", secret).update("jenan:oauth:transaction:v1").digest();
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", key(secret)).update(payload).digest("base64url");
}

export function sealTransaction(transaction: OAuthTransaction, secret: string) {
  const payload = Buffer.from(JSON.stringify(transaction)).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function openTransaction(
  value: string | undefined,
  secret: string,
  now = Date.now(),
): OAuthTransaction | null {
  if (!value) return null;
  const [payload, provided, ...rest] = value.split(".");
  if (!payload || !provided || rest.length > 0) return null;
  const expected = Buffer.from(signature(payload, secret));
  const actual = Buffer.from(provided);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const transaction = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthTransaction;
    if (
      typeof transaction.state !== "string" ||
      typeof transaction.nonce !== "string" ||
      typeof transaction.issuedAt !== "number" ||
      now - transaction.issuedAt > OAUTH_TRANSACTION_MAX_AGE_SECONDS * 1000 ||
      transaction.issuedAt - now > 60_000
    )
      return null;
    return transaction;
  } catch {
    return null;
  }
}

/**
 * Apple completes the flow with a cross-site form POST, which browsers only deliver cookies for when the
 * cookie is `SameSite=None; Secure`. Google's flow is a plain redirect, so `Lax` is enough.
 */
export function transactionCookieOptions(provider: OAuthProviderId, secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: provider === "apple" && secure ? ("none" as const) : ("lax" as const),
    path: "/api/auth/oauth",
    maxAge: OAUTH_TRANSACTION_MAX_AGE_SECONDS,
  };
}
