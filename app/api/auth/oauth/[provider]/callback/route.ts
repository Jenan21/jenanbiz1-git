import { NextRequest, NextResponse } from "next/server";
import { detectCountryFromHeaders } from "@/lib/auth/country";
import { resolvePublicOrigin } from "@/lib/auth/oauth/providers";
import { isOAuthProviderId, oauthErrorPath } from "@/lib/auth/oauth/shared";
import { OAUTH_COOKIE, transactionCookieOptions } from "@/lib/auth/oauth/transaction";
import { getRequestContext } from "@/lib/auth/request";
import { setSessionCookie } from "@/lib/auth/session";
import { checkAuthRateLimit } from "@/lib/rate-limit/auth-rate-limit";
import { finishOAuth } from "@/services/auth/oauth-flow";

type RouteContext = { params: Promise<{ provider: string }> };

async function handleCallback(
  request: NextRequest,
  context: RouteContext,
  params: { code?: string | null; state?: string | null; error?: string | null; user?: string | null },
) {
  const { provider } = await context.params;
  if (!isOAuthProviderId(provider))
    return NextResponse.json({ error: "UNKNOWN_PROVIDER" }, { status: 404 });

  const origin = resolvePublicOrigin(process.env, request.nextUrl.origin);
  // 303 turns Apple's cross-site POST into a plain GET of the destination.
  const go = (location: string) => {
    const response = NextResponse.redirect(new URL(location, origin), 303);
    response.headers.set("Cache-Control", "no-store");
    // The transaction is single-use: clear it whatever the outcome. `expires` is set as well as
    // `maxAge` because Next drops `Max-Age=0` when it merges the session cookie into the response.
    response.cookies.set(OAUTH_COOKIE, "", {
      ...transactionCookieOptions(provider, origin.startsWith("https://")),
      maxAge: 0,
      expires: new Date(0),
    });
    return response;
  };

  const rateLimit = await checkAuthRateLimit("oauth", request);
  if (!rateLimit.allowed) return go(oauthErrorPath("login", provider, "rate_limited"));

  const result = await finishOAuth({
    provider,
    origin,
    env: process.env,
    params,
    cookieValue: request.cookies.get(OAUTH_COOKIE)?.value,
    context: getRequestContext(request),
    countryCode: detectCountryFromHeaders(request.headers),
  });
  if (!result.ok) return go(result.location);

  await setSessionCookie(result.session.token, result.session.expiresAt);
  return go(result.location);
}

export async function GET(request: NextRequest, context: RouteContext) {
  const query = request.nextUrl.searchParams;
  return handleCallback(request, context, {
    code: query.get("code"),
    state: query.get("state"),
    error: query.get("error"),
  });
}

/** Sign in with Apple returns through a cross-site form POST (`response_mode=form_post`). */
export async function POST(request: NextRequest, context: RouteContext) {
  const form = await request.formData().catch(() => null);
  const field = (name: string) => {
    const value = form?.get(name);
    return typeof value === "string" ? value : null;
  };
  return handleCallback(request, context, {
    code: field("code"),
    state: field("state"),
    error: field("error"),
    user: field("user"),
  });
}
