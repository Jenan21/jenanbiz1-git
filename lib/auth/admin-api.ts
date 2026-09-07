import { NextResponse } from "next/server";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { getCurrentUser } from "@/lib/auth/session";

export async function denyUnlessAdmin() {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) {
    return NextResponse.json(
      { success: false, message: "Admin access required" },
      { status: 403 },
    );
  }
  return null;
}
