import { NextResponse } from "next/server";
import { getPlatformAdminSummary } from "@/lib/admin/platform-summary";
import { denyUnlessAdmin } from "@/lib/auth/admin-api";

export async function GET() {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  try {
    const summary = await getPlatformAdminSummary();
    return NextResponse.json({ success: true, reports: summary.reports, leaders: summary.leaders, metrics: { totalRobots: summary.totalRobots, averageIntelligence: summary.averageIntelligence, totalTasks: summary.totalTasks, completedTasks: summary.completedTasks } });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to load reports" }, { status: 500 });
  }
}
