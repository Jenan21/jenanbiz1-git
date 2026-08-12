import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getRequestContext, hasValidOrigin } from "@/lib/auth/request";
import { clearSessionCookie, SESSION_COOKIE } from "@/lib/auth/session";
import { logoutSession } from "@/services/auth/auth.service";

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request))
    return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await logoutSession(token, getRequestContext(request));
  await clearSessionCookie();
  return NextResponse.json({ success: true });
}
