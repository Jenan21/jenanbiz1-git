import { NextRequest, NextResponse } from "next/server";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { ensurePlatformRobotCoverage, getPlatformRobotCoverage } from "@/lib/admin/robot-coverage";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  return NextResponse.json({ success: true, coverage: await getPlatformRobotCoverage() }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  return NextResponse.json({ success: true, result: await ensurePlatformRobotCoverage(user.id), coverage: await getPlatformRobotCoverage() }, { status: 201 });
}