import { NextRequest, NextResponse, after } from "next/server";
import { ZodError } from "zod";
import { accountApprovalRequired } from "@/lib/auth/account-approval-policy";
import { isPublicRegistrationAllowed } from "@/lib/auth/registration-policy";
import { getRequestContext, hasValidOrigin } from "@/lib/auth/request";
import { busyResponse } from "@/lib/auth/busy-response";
import { PasswordWorkBusyError } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { registerSchema } from "@/lib/auth/validation";
import {
  AuthenticationError,
  registerUser,
} from "@/services/auth/auth.service";
import { checkAuthRateLimit } from "@/lib/rate-limit/auth-rate-limit";
import { notifyOwnersOfPendingAccount, registerPendingUser } from "@/services/auth/account-approval-service";

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request))
    return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  if (!isPublicRegistrationAllowed())
    return NextResponse.json({ error: "REGISTRATION_CLOSED" }, { status: 403 });
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
    const context = getRequestContext(request);
    if (accountApprovalRequired()) {
      // The account waits for the owner: no session, no cookie, and nothing is mailed to the typed address.
      const applicant = await registerPendingUser(input, context);
      after(() => notifyOwnersOfPendingAccount({ displayName: applicant.profile?.displayName ?? input.displayName, email: applicant.email, id: applicant.id }).catch(() => console.error("Owner notice failed without exposing request data")));
      return NextResponse.json({ status: "PENDING_APPROVAL" }, { status: 202, headers: { "cache-control": "no-store" } });
    }
    const result = await registerUser(input, context);
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
    if (error instanceof PasswordWorkBusyError) return busyResponse();
    console.error("Registration failed without exposing request data");
    return NextResponse.json({ error: "REGISTRATION_FAILED" }, { status: 500 });
  }
}
