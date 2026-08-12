import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRequestContext, hasValidOrigin } from "@/lib/auth/request";
import { setSessionCookie } from "@/lib/auth/session";
import { registerSchema } from "@/lib/auth/validation";
import {
  AuthenticationError,
  registerUser,
} from "@/services/auth/auth.service";
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
    const rateLimit = await checkAuthRateLimit("register", request, email);
    if (!rateLimit.allowed)
      return NextResponse.json(
        { error: "RATE_LIMITED" },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    const input = registerSchema.parse(payload);
    const result = await registerUser(input, getRequestContext(request));
    await setSessionCookie(result.token, result.expiresAt);
    return NextResponse.json(
      {
        user: {
          id: result.user.id,
          email: result.user.email,
          profile: result.user.profile,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        { error: "VALIDATION_ERROR", fields: error.flatten().fieldErrors },
        { status: 400 },
      );
    if (
      error instanceof AuthenticationError &&
      error.code === "DUPLICATE_EMAIL"
    )
      return NextResponse.json({ error: error.code }, { status: 409 });
    console.error("Registration failed without exposing request data");
    return NextResponse.json({ error: "REGISTRATION_FAILED" }, { status: 500 });
  }
}
