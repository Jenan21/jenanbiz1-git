import { NextRequest, NextResponse } from "next/server";
import { getRateLimitProvider } from "@/lib/rate-limit/auth-rate-limit";
import { buildContentSecurityPolicy, createNonce } from "@/lib/security/csp";
import {
  GATE_COOKIE,
  GATE_COOKIE_MAX_AGE_SECONDS,
  GATE_FAILURE_LIMIT,
  GATE_FAILURE_WINDOW_MS,
  clientAddress,
  credentialsMatch,
  failureKey,
  gateKey,
  signGateCookie,
  verifyGateCookie,
} from "@/lib/security/site-gate";

/**
 * Lets the request through. In production every page also gets a fresh nonce and the full content security policy in
 * report-only mode: Next reads the nonce from the request header and stamps it on its own scripts, while the
 * response header makes browsers report (not block) anything the policy would forbid.
 */
function proceed(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();
  const policy = buildContentSecurityPolicy({ nonce: createNonce(), mapTileUrl: process.env.NEXT_PUBLIC_MAP_TILE_URL });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy-report-only", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy-Report-Only", policy);
  return response;
}

function protectionUnavailable() {
  return new NextResponse("Private access protection is not configured", {
    status: 503,
    headers: { "cache-control": "no-store" },
  });
}

function authenticationRequired() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "cache-control": "no-store",
      "www-authenticate": 'Basic realm="Jenan PRO Private Preview", charset="UTF-8"',
    },
  });
}

function tooManyAttempts(retryAfterSeconds: number) {
  return new NextResponse("Too many failed attempts", {
    status: 429,
    headers: { "cache-control": "no-store", "retry-after": String(Math.max(1, retryAfterSeconds)) },
  });
}

// Without a private gate, a production deployment is served only once the owner has approved the public launch.
function servesPublicly() {
  return process.env.NODE_ENV !== "production" || process.env.PUBLIC_LAUNCH?.trim() === "approved";
}

export async function proxy(request: NextRequest) {
  const username = process.env.SITE_ACCESS_USERNAME?.trim();
  const password = process.env.SITE_ACCESS_PASSWORD;

  if (!username && !password) return servesPublicly() ? proceed(request) : protectionUnavailable();
  if (!username || !password) return protectionUnavailable();

  // A signed cookie from an earlier successful sign-in spares every later request the credential check.
  const key = gateKey(username, password);
  if (verifyGateCookie(key, request.cookies.get(GATE_COOKIE)?.value, Date.now())) return proceed(request);

  const authorization = request.headers.get("authorization");
  if (!authorization) return authenticationRequired();

  // Only wrong guesses are counted. Once a client is over the limit its credentials are not evaluated at all,
  // so a correct guess cannot be told apart from a wrong one while the block lasts.
  const attempts = { key: failureKey(clientAddress(request.headers)), limit: GATE_FAILURE_LIMIT, windowMs: GATE_FAILURE_WINDOW_MS };
  const provider = getRateLimitProvider();
  try {
    const state = await provider.peek?.(attempts);
    if (state && !state.allowed && !state.degraded) return tooManyAttempts(state.retryAfterSeconds);
  } catch {
    // The throttle is best effort: a store outage must not lock out the owner, the password still protects the site.
  }

  if (credentialsMatch(authorization, username, password)) {
    const response = proceed(request);
    response.cookies.set(GATE_COOKIE, signGateCookie(key, Date.now()), {
      httpOnly: true,
      maxAge: GATE_COOKIE_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  }

  try {
    await provider.consume(attempts);
  } catch {
    // See above.
  }
  return authenticationRequired();
}

export const config = {
  matcher: [
    "/((?!api/health/live|api/health/ready|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)",
  ],
};
