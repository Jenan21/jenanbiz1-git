import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRequestContext, hasValidOrigin } from "@/lib/auth/request";
import { setSessionCookie } from "@/lib/auth/session";
import { loginSchema } from "@/lib/auth/validation";
import { AuthenticationError, loginUser } from "@/services/auth/auth.service";
import { checkAuthRateLimit } from "@/lib/rate-limit/auth-rate-limit";

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request))
    return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  try {
    const payload: unknown = await request.json();
    const email =
      payload && typeof payload === "object" && "email" in payload
        ? payload.email
        : undefined;
    const rateLimit = await checkAuthRateLimit("login", request, email);
    if (!rateLimit.allowed)
      return NextResponse.json(
        { error: "RATE_LIMITED" },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    const input = loginSchema.parse(payload);
    const result = await loginUser(input, getRequestContext(request));
    await setSessionCookie(result.token, result.expiresAt);
    return NextResponse.json({
      user: { id: result.user.id, email: result.user.email },
    });
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        { error: "VALIDATION_ERROR", fields: error.flatten().fieldErrors },
        { status: 400 },
      );
    if (error instanceof AuthenticationError) {
      const status = error.code === "ACCOUNT_DISABLED" ? 403 : 401;
      return NextResponse.json({ error: error.code }, { status });
    }
    console.error("Login failed without exposing request data");
    return NextResponse.json({ error: "LOGIN_FAILED" }, { status: 500 });
  }
}
