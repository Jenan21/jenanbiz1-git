import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserDashboard } from "@/services/dashboard/user-dashboard-service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  return NextResponse.json(
    { dashboard: await getUserDashboard(user.id) },
    { headers: { "cache-control": "no-store" } },
  );
}