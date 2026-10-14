import { NextRequest, NextResponse, after } from "next/server";
import { z, ZodError } from "zod";
import { busyResponse } from "@/lib/auth/busy-response";
import { emailVerificationRequired } from "@/lib/auth/email-verification-policy";
import { PasswordWorkBusyError } from "@/lib/auth/password";
import { getRequestContext, hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { checkAuthRateLimit } from "@/lib/rate-limit/auth-rate-limit";
import { confirmEmailVerification, EmailVerificationError, getEmailVerificationStatus, requestEmailVerification } from "@/services/auth/email-verification-service";

export const dynamic = "force-dynamic";

const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request") }),
  z.object({ action: z.literal("confirm"), code: z.string().trim().regex(/^\d{6}$/) }),
]);

const noStore = { "cache-control": "no-store" };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401, headers: noStore });
  const status = await getEmailVerificationStatus(user.id);
  return NextResponse.json({ email: user.email, required: emailVerificationRequired(), verified: status.verified }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const limited = await checkAuthRateLimit("verify", request, user.email);
  if (!limited.allowed) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } });
  }
  try {
    const input = commandSchema.parse(await request.json().catch(() => null));
    const context = getRequestContext(request);
    if (input.action === "request") {
      const result = await requestEmailVerification(user.id, context, undefined, (task) => after(task));
      return NextResponse.json({ email: user.email, ...result }, { headers: noStore });
    }
    const result = await confirmEmailVerification(user.id, input.code, context);
    return NextResponse.json(result, { headers: noStore });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    if (error instanceof PasswordWorkBusyError) return busyResponse();
    if (error instanceof EmailVerificationError) {
      if (error.code === "ALREADY_VERIFIED") return NextResponse.json({ verified: true, alreadyVerified: true }, { headers: noStore });
      if (error.code === "TOO_SOON" || error.code === "TOO_MANY_CODES") {
        return NextResponse.json({ error: error.code, retryAfterSeconds: error.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
      }
      return NextResponse.json({ error: error.code }, { status: error.code === "ACCOUNT_UNAVAILABLE" ? 403 : 400 });
    }
    console.error("E-mail verification failed without exposing request data");
    return NextResponse.json({ error: "VERIFICATION_FAILED" }, { status: 500 });
  }
}
