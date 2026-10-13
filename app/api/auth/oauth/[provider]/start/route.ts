import { NextRequest, NextResponse } from "next/server";
import { resolvePublicOrigin } from "@/lib/auth/oauth/providers";
import {
  isOAuthProviderId,
  oauthErrorPath,
  sanitizeNextPath,
  type OAuthEntryPoint,
} from "@/lib/auth/oauth/shared";
import { checkAuthRateLimit } from "@/lib/rate-limit/auth-rate-limit";
import { startOAuth } from "@/services/auth/oauth-flow";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  if (!isOAuthProviderId(provider))
    return NextResponse.json({ error: "UNKNOWN_PROVIDER" }, { status: 404 });

  const search = request.nextUrl.searchParams;
  const from: OAuthEntryPoint = search.get("from") === "register" ? "register" : "login";
  const next = sanitizeNextPath(search.get("next"));
  const origin = resolvePublicOrigin(process.env, request.nextUrl.origin);
  const go = (location: string) => {
    const response = NextResponse.redirect(new URL(location, origin), 302);
    response.headers.set("Cache-Control", "no-store");
    return response;
  };

  const rateLimit = await checkAuthRateLimit("oauth", request);
  if (!rateLimit.allowed) return go(oauthErrorPath(from, provider, "rate_limited", next));

  const result = startOAuth({
    provider,
    origin,
    locale: request.cookies.get("locale")?.value === "en" ? "en" : "ar",
    from,
    next,
    env: process.env,
  });
  if (!result.ok) return go(result.location);

  const response = go(result.location);
  response.cookies.set(result.cookie.name, result.cookie.value, result.cookie.options);
  return response;
}
