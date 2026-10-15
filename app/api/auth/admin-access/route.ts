import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

const noStore = { "cache-control": "no-store" };

/**
 * What the signed-in account may see of itself in the shared header: whether it may open /admin, and its own role.
 * Visitors without a session are refused like every other private route.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401, headers: noStore });
  const admin = user.systemRole === "ADMIN" || user.systemRole === "SUPER_ADMIN";
  return NextResponse.json({ admin, role: user.systemRole }, { headers: noStore });
}
