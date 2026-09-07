import { NextResponse } from "next/server";
import { getPlatformAdminSummary } from "@/lib/admin/platform-summary";
import { denyUnlessAdmin } from "@/lib/auth/admin-api";

export async function GET() {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  try {
    const summary = await getPlatformAdminSummary();

    return NextResponse.json({
      success: true,
      operations: {
        approvedCount: summary.visibleRobots,
        users: summary.activeUsers,
        stages: [
          { stage: "تم التوليد", count: summary.totalRobots, detail: "روبوتات متاحة في المنصة" },
          { stage: "قيد المراجعة", count: summary.reviewRobots, detail: "يحتاج مراجعة اللجنة" },
          { stage: "اللجنة", count: summary.committeeReviews, detail: "تقييمات سابقة" },
          { stage: "تمت الموافقة", count: summary.visibleRobots, detail: "انتقل إلى التشغيل" },
          { stage: "مؤجل", count: summary.pendingTasks, detail: "مهام معلقة" },
        ],
        missions: summary.branches.length > 0
          ? summary.branches.map((branch, index) => ({
              title: index === 0 ? "تحديثات قلب المنصة" : index === 1 ? "تحسين دورة النمو" : index === 2 ? "مراجعة الثقة والتحويل" : "توسيع الوصول للسوق",
              owner: branch.name,
              zone: branch.status,
            }))
          : [],
      },
    });
  } catch (error) {
    console.error("admin operations route failed", error);
    return NextResponse.json(
      {
        success: false,
        message: "Unable to load operations data",
      },
      { status: 500 },
    );
  }
}
