import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) {
    return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  }
  try {
    const reviews = await db.committeeReview.findMany({
      include: { robot: true },
      orderBy: { score: "desc" },
      take: 20,
    });

    return NextResponse.json({
      success: true,
      reviews: reviews.map((review) => ({
        id: review.id,
        robotName: review.robot.name,
        reviewer: "Platform committee",
        score: review.score,
        verdict: review.verdict,
        notes: review.notes,
      })),
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
