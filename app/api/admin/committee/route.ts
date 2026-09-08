import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminPageMetadata, getAdminPagination } from "@/lib/admin/pagination";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) {
    return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  }
  try {
    const { limit, offset } = getAdminPagination(request);
    const [reviews, total] = await Promise.all([
      db.committeeReview.findMany({
      include: { robot: true },
      orderBy: { score: "desc" },
      skip: offset,
      take: limit,
      }),
      db.committeeReview.count(),
    ]);

    return NextResponse.json({
      success: true,
      reviews: reviews.map((review) => ({
        id: review.id,
        robotName: review.robot.name,
        reviewer: review.reviewer,
        score: review.score,
        verdict: review.verdict,
        notes: review.notes,
      })),
      pagination: getAdminPageMetadata(total, limit, offset),
    });
  } catch (error) {
    console.error("committee route failed", error);
    return NextResponse.json(
      {
        success: false,
        message: "Unable to load committee data",
      },
      { status: 500 },
    );
  }
}
