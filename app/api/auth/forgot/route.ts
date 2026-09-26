import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getRequestContext, hasValidOrigin } from "@/lib/auth/request";
import { checkAuthRateLimit } from "@/lib/rate-limit/auth-rate-limit";
import { confirmPasswordReset, PasswordRecoveryError, requestPasswordReset } from "@/services/auth/password-recovery-service";

const requestSchema = z.object({ action: z.literal("request"), email: z.string().trim().email().max(320) });
const confirmSchema = z.object({
  action: z.literal("confirm"),
  code: z.string().trim().regex(/^\d{6}$/),
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(128),
});

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  try {
    const payload: unknown = await request.json();
    const action = payload && typeof payload === "object" && "action" in payload ? payload.action : null;
    const email = payload && typeof payload === "object" && "email" in payload ? payload.email : undefined;
    const route = action === "confirm" ? "reset" : "forgot";
    const rateLimit = await checkAuthRateLimit(route, request, email);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
    }

    if (action === "request") {
      const input = requestSchema.parse(payload);
      return NextResponse.json(await requestPasswordReset(input.email, getRequestContext(request)));
    }
    const input = confirmSchema.parse(payload);
    await confirmPasswordReset(input, getRequestContext(request));
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "VALIDATION_ERROR", fields: error.flatten().fieldErrors }, { status: 400 });
    if (error instanceof PasswordRecoveryError) {
      return NextResponse.json({ error: error.code }, { status: error.code === "ACCOUNT_DISABLED" ? 403 : 400 });
    }
    console.error("Password recovery failed without exposing request data");
    return NextResponse.json({ error: "RECOVERY_FAILED" }, { status: 500 });
  }
}