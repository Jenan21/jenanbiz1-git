import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { exportTalentReport } from "@/services/talent/talent-report-service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const report = await exportTalentReport(user.id);
  const date = report.generatedAt.toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(report.bytes), { headers: { "cache-control": "private, no-store", "content-disposition": `attachment; filename="jenan-talent-report-${date}.xlsx"`, "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
}