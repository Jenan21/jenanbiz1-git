import { NextResponse } from "next/server";
import { getPlatformAdminSummary } from "@/lib/admin/platform-summary";

export async function GET() {
  try {
    const summary = await getPlatformAdminSummary();
    return NextResponse.json({ success: true, reports: summary.reports, leaders: summary.leaders, metrics: { totalRobots: summary.totalRobots, averageIntelligence: summary.averageIntelligence, totalTasks: summary.totalTasks, completedTasks: summary.completedTasks } });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to load reports" }, { status: 500 });
  }
}
